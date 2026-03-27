import { AutoLRUCache } from './auto-lru-cache'
import { addGlobalStylesToShadowRoot } from './global-styles'
import { debounce, deduplicateAsync, DeduplicateAsyncFunction } from './utils'

import styles from './style.css?inline'
import template from './template.html?raw'

export interface PageResult<T> {
  items: T[]
  currentPage: number
  totalPages: number
}

export type FetchPageFn<T> = (page: number) => Promise<PageResult<T>>
export type RenderItemFn<T> = (item: T) => Promise<HTMLElement> | HTMLElement

export interface PageChangedEvent extends Event {
  detail?: {
    page: number
    previousPage: number
  }
}
export interface PagesFetchedEvent<T> extends Event {
  detail?: {
    pages: { pageNum: number; pageResult: PageResult<T> | null }[]
    mainPage: number
  }
}
export interface ItemElementRemovedEvent extends Event {
  detail?: Element
}

interface PageInfo {
  hasError: boolean
  page: HTMLElement
  pageNum: number
  firstAdded: boolean
  isIntersected: boolean
  pageHeight: number
}

const DEBUG = import.meta.env.DEV
const consoleLog = DEBUG
  ? function (...args: unknown[]) {
      console.log(...args)
    }
  : null

const PAGES_BUFFER = 10

export class InfiniteScroller<T> extends HTMLElement {
  private _fetchPage?: DeduplicateAsyncFunction<
    Parameters<FetchPageFn<T>>,
    PageResult<T>
  >
  private _renderItem?: RenderItemFn<T>
  private _createPageElement?: () => HTMLElement
  private _createPlaceholderElements?: () => HTMLElement[]
  private _createErrorElement?: (estimatedHeight: number) => HTMLElement
  private listElement: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private pageResultCache: AutoLRUCache<PageResult<T>>
  private pageInfo: Record<string, PageInfo | undefined> = {}
  private totalPages: number = 0xffffff
  private pagesToClear = new Map<number, boolean>()
  private lastScrollY: number = 0
  private scrollDirection: 'up' | 'down' = 'down'
  private scrollHandler: () => void
  private approximatePageHeight: number = -1
  private debouncedLoadPageAround: (
    middlePage: number,
    doScroll?: boolean
  ) => void
  private needScrolling: HTMLElement | null = null
  private clearNeedScrolling: () => void
  private scrollingArrived: boolean = false
  private scrollingSettled: boolean = true
  private setScrollingSettled: () => void
  private lastIntersected: number = -1
  private isPointerDown: boolean = false
  private isUserScroll: boolean = false
  private handleUserScroll: () => void
  private handleUserKeyboardScroll: (event: KeyboardEvent) => void
  private setPointerDown: () => void
  private unsetPointerDown: () => void
  private unsetUserScroll: () => void

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.pageResultCache = new AutoLRUCache(
      Math.max(
        parseInt(this.getAttribute('cache-size') || '1', 10),
        this.preloadPages * 10
      )
    )
    addGlobalStylesToShadowRoot(this.shadowRoot)

    this.debouncedLoadPageAround = debounce(this.loadPageAround.bind(this), 200)

    this.clearNeedScrolling = debounce(() => {
      consoleLog?.('clear need scrolling')
      this.scrollingArrived = false
      this.needScrolling = null
    }, 1)

    this.setScrollingSettled = debounce(() => {
      this.scrollingSettled = true

      if (this.needScrolling) {
        consoleLog?.(
          'scrolling settled, ignoring needScrolling',
          this.needScrolling
        )
        this.needScrolling = null
      }

      this.removeUnusedPages()
    }, 50)

    this.scrollHandler = () => {
      const currentScrollY = window.scrollY
      this.scrollDirection = currentScrollY > this.lastScrollY ? 'down' : 'up'
      this.lastScrollY = currentScrollY

      if (this.isUserScroll) {
        this.unsetUserScroll()
      }
    }

    this.handleUserScroll = () => {
      this.isUserScroll = true
      this.unsetUserScroll()
    }

    this.handleUserKeyboardScroll = (event: KeyboardEvent) => {
      const keys = [
        'ArrowUp',
        'ArrowDown',
        'Space',
        'PageUp',
        'PageDown',
        'Home',
        'End',
      ]
      if (keys.includes(event.code)) {
        this.isUserScroll = true
        this.unsetUserScroll()
      }
    }

    this.unsetUserScroll = debounce(() => {
      consoleLog?.('user stopped scrolling')
      this.isUserScroll = false
    }, 200)

    this.setPointerDown = () => {
      this.isPointerDown = true
    }

    this.unsetPointerDown = () => {
      this.isPointerDown = false
    }
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    window.removeEventListener('scroll', this.scrollHandler)
    window.removeEventListener('wheel', this.handleUserScroll)
    window.removeEventListener('touchmove', this.handleUserScroll)
    window.removeEventListener('keydown', this.handleUserKeyboardScroll)
    window.removeEventListener('pointerdown', this.setPointerDown)
    window.removeEventListener('pointerup', this.unsetPointerDown)
  }

  async connectedCallback() {
    if (!this.shadowRoot) {
      return
    }

    if (!this.innerHTML && !this.shadowRoot.innerHTML) {
      this.shadowRoot.innerHTML = `
  <style>
    ${styles}
  </style>
  ${template}
`
      this.listElement = this.shadowRoot.querySelector(
        '[data-element=scroller-list]'
      )!
    } else if (!this.shadowRoot.innerHTML) {
      this.shadowRoot.innerHTML = this.innerHTML
      this.listElement = this.shadowRoot.firstElementChild as HTMLElement
    }
    if (DEBUG) {
      const style = document.createElement('style')
      style.innerText = `
  .page-placeholder {
    border: 1px solid green;
  }
  .debug-p {
    background: yellow;
    position: absolute;
    padding: 1px;
    font-family: monospace;
    font-size: 2em;
    z-index: 2;
  }
`
      this.shadowRoot.append(style)
    }

    this.setupIntersectionObserver()

    window.addEventListener('scroll', this.scrollHandler)
    window.addEventListener('wheel', this.handleUserScroll, { passive: true })
    window.addEventListener('touchmove', this.handleUserScroll, {
      passive: true,
    })
    window.addEventListener('keydown', this.handleUserKeyboardScroll)
    window.addEventListener('pointerdown', this.setPointerDown)
    window.addEventListener('pointerup', this.unsetPointerDown)
  }

  set fetchPage(fn: FetchPageFn<T>) {
    this._fetchPage = deduplicateAsync(fn)
  }

  set renderItem(fn: RenderItemFn<T>) {
    this._renderItem = fn
  }

  set createPageElement(fn: typeof this._createPageElement) {
    this._createPageElement = fn
  }

  set createPlaceholderElements(fn: typeof this._createPlaceholderElements) {
    this._createPlaceholderElements = fn
  }

  set createErrorElement(fn: typeof this._createErrorElement) {
    this._createErrorElement = fn
  }

  async loadInitialPage() {
    await this.loadPageAround(this.currentPage)
  }

  private get preloadPages(): number {
    return parseInt(this.getAttribute('preload-pages') || '2', 10)
  }

  get currentPage(): number {
    return parseInt(this.getAttribute('current-page') || '1', 10)
  }

  set currentPage(value: number) {
    const oldValue = this.currentPage
    if (oldValue !== value) {
      this.debouncedLoadPageAround(value)
      this.setAttribute('current-page', value.toString())
      this.dispatchEvent(
        new CustomEvent('page-changed', {
          detail: {
            page: value,
            previousPage: oldValue,
          },
          bubbles: true,
          composed: true,
        })
      )
    }
  }

  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement

          let wantPage: number | null = null
          let preparePlaceholders: number | null = null
          if (target.dataset.page != null) {
            const itemPage = parseInt(target.dataset.page)
            const pageInfo = this.pageInfo[itemPage]
            if (pageInfo == null) {
              return
            }

            if (!pageInfo.firstAdded) {
              if (this.scrollingSettled) {
                consoleLog?.('start scrolling pages')
                this.scrollingSettled = false
              }
              this.setScrollingSettled()
            }

            pageInfo.isIntersected = entry.isIntersecting

            if (
              (!pageInfo.firstAdded || entry.isIntersecting) &&
              (this.isUserScroll || this.isPointerDown)
            ) {
              if (entry.isIntersecting) {
                this.lastIntersected = itemPage
              } else {
                if (
                  this.lastIntersected > 0 &&
                  ((this.scrollDirection === 'down' &&
                    this.lastIntersected > this.currentPage) ||
                    (this.scrollDirection === 'up' &&
                      this.lastIntersected < this.currentPage))
                ) {
                  wantPage = this.lastIntersected
                  console.log(
                    'want',
                    this.lastIntersected,
                    this.currentPage,
                    this.scrollDirection
                  )
                }
                preparePlaceholders =
                  itemPage + (this.scrollDirection === 'up' ? -1 : +1)
              }
            }

            pageInfo.firstAdded = false

            if (preparePlaceholders != null) {
              this.setupPlaceholders(preparePlaceholders, this.scrollDirection)
            }
          }

          if (this.needScrolling != null) {
            if (entry.target === this.needScrolling && entry.isIntersecting) {
              this.scrollingArrived = true
              consoleLog?.('arrived!')
            }
            if (this.scrollingArrived) {
              this.clearNeedScrolling()
            }
            return
          }

          if (wantPage != null) {
            consoleLog?.('set page', wantPage, target, this.scrollDirection)
            this.currentPage = wantPage
          }
        })
      },
      { threshold: 0 }
    )
  }

  private async renderPage(pageNum: number, pageResult: PageResult<T> | null) {
    if (!this._renderItem || !this.listElement) {
      throw new Error('unexpected state')
    }

    const { info, created } = this.getOrCreatePage(pageNum)
    const placeholder = info.page.querySelector('[data-placeholder]')

    if (created) {
      consoleLog?.('add page', info.page)
      this.listElement.appendChild(info.page)
    }

    if (placeholder != null || created || info.hasError) {
      info.page.querySelector('[data-error]')?.remove()

      if (pageResult != null) {
        consoleLog?.('rendering page items', pageNum)
        info.hasError = false
        for (const item of pageResult.items) {
          const itemElement = await this._renderItem(item)
          itemElement.dataset.isRenderedItem = 'true'
          info.page.append(itemElement)
        }
        consoleLog?.('finished rendering page items', pageNum)
      } else {
        info.hasError = true
        const height = info.pageHeight || this.approximatePageHeight
        let el = this._createErrorElement?.(height)
        if (el == null) {
          el = document.createElement('div')
          el.innerText = 'Error loading page ' + pageNum
          if (height > 0) {
            el.style.height = `${height}px`
          }
        }
        el.dataset.error = 'true'
        info.page.append(el)
      }
    }

    if (placeholder != null) {
      info.page
        .querySelectorAll('[data-placeholder]')
        .forEach((el) => el.remove())
    }

    if (!info.hasError) {
      info.pageHeight = info.page.getBoundingClientRect().height
    }

    if (this.approximatePageHeight === -1 && !info.hasError) {
      this.approximatePageHeight = info.page.getBoundingClientRect().height
    }

    return info.page
  }

  private removePage(pageNum: number) {
    this.observer?.unobserve(this.pageInfo[pageNum]!.page)
    this.pageInfo[pageNum]!.page.remove()
    this.pageInfo[pageNum]!.page.querySelectorAll(
      '[data-is-rendered-item=true]'
    ).forEach((el) => {
      this.dispatchEvent(
        new CustomEvent('item-element-removed', {
          detail: el,
          bubbles: true,
          composed: true,
        })
      )
    })
    delete this.pageInfo[pageNum]
  }

  private removeOrphanPages() {
    for (const key in this.pageInfo) {
      const pageNum = parseInt(key)
      if (
        pageNum <= this.currentPage - 1 - PAGES_BUFFER ||
        pageNum >= this.currentPage + 1 + PAGES_BUFFER
      ) {
        if (this.pageInfo[pageNum] != null) {
          this.removePage(pageNum)
        }
      }
    }
  }

  private removeUnusedPages() {
    for (
      let pageNum = this.currentPage + 1 + PAGES_BUFFER;
      pageNum <= this.totalPages;
      pageNum++
    ) {
      if (this.pageInfo[pageNum] != null) {
        this.removePage(pageNum)
      } else {
        break
      }
    }
    for (
      let pageNum = this.currentPage - 1 - PAGES_BUFFER;
      pageNum >= 1;
      pageNum--
    ) {
      if (this.pageInfo[pageNum] != null) {
        this.removePage(pageNum)
      } else {
        break
      }
    }
    this.removeOrphanPages()
  }

  private async loadPageAround(middlePage: number) {
    if (this.needScrolling != null) {
      consoleLog?.('skip page around', middlePage, this.needScrolling)
      return
    }

    consoleLog?.('load page around', middlePage)

    try {
      const pagesToFetch = []
      for (
        let i = Math.max(1, middlePage - this.preloadPages);
        i < Math.min(middlePage + this.preloadPages + 1, this.totalPages + 1);
        i++
      ) {
        pagesToFetch.push(i)
      }
      consoleLog?.('pages to fetch', pagesToFetch)

      const results = await Promise.all(
        pagesToFetch.map((pageNum) =>
          (async (pageNum) => {
            this.pagesToClear.set(pageNum, false)
            let pageResult = this.pageResultCache.get(pageNum)
            if (
              (pageResult == null || pageNum === middlePage) &&
              this.currentPage === middlePage
            ) {
              try {
                pageResult = (await this._fetchPage?.(pageNum))!
                const addResult = this.pageResultCache.set(pageNum, pageResult)
                if (addResult.deleted != null) {
                  this.pagesToClear.set(addResult.deleted.currentPage, true)
                }
              } catch (e) {
                console.error('error fetching page', pageNum, e)
              }
            }
            return { pageNum, pageResult }
          })(pageNum)
        )
      )

      if (this.currentPage != middlePage) {
        return
      }

      this.dispatchEvent(
        new CustomEvent('pages-fetched', {
          detail: {
            pages: results,
            mainPage: middlePage,
          },
          bubbles: true,
          composed: true,
        })
      )

      for (const { pageNum, pageResult } of results) {
        if (pageResult != null && pageNum === middlePage) {
          this.totalPages = pageResult.totalPages
        }

        if (pageResult?.items.length === 0) {
          continue
        }

        await this.renderPage(pageNum, pageResult)
      }

      this.setupPlaceholders(middlePage, 'up')
      this.setupPlaceholders(middlePage, 'down')

      const pageInfo = this.pageInfo[middlePage]

      this.needScrolling = pageInfo?.page ?? null
      setTimeout(() => {
        this.removeOrphanPages()

        if (this.needScrolling == null) {
          return
        }

        if (!pageInfo?.isIntersected) {
          consoleLog?.('scroll into view', this.needScrolling, middlePage)
          this.needScrolling.scrollIntoView({ behavior: 'instant' })
        } else {
          consoleLog?.('no need to scroll to', middlePage)
          this.needScrolling = null
        }
      }, 20)

      consoleLog?.('end of load page around', middlePage)
    } catch (err) {
      this.needScrolling = null
      console.error(err)
    }
  }

  private getOrCreatePage(pageNum: number) {
    if (!this.observer) {
      throw new Error('unexpected state')
    }

    const created = this.pageInfo[pageNum] == null
    if (this.pageInfo[pageNum] == null) {
      const page = this._createPageElement?.() ?? document.createElement('li')
      this.pageInfo[pageNum] = {
        isIntersected: false,
        firstAdded: true,
        page,
        pageNum,
        pageHeight: 0,
        hasError: false,
      }
      page.dataset.page = pageNum.toString()
      this.observer.observe(page)

      if (DEBUG) {
        const debugEl = document.createElement('div')
        debugEl.classList.add('debug-p')
        debugEl.textContent = pageNum.toString()
        page.append(debugEl)
      }
    }

    return { info: this.pageInfo[pageNum], created }
  }

  private createPlaceholder(pageInfo: PageInfo) {
    const height =
      pageInfo.pageHeight > 0 ? pageInfo.pageHeight : this.approximatePageHeight

    if (this._createPlaceholderElements != null) {
      for (const placeholder of this._createPlaceholderElements()) {
        placeholder.dataset.placeholder = 'true'
        pageInfo.page.appendChild(placeholder)
      }
    } else {
      const placeholder = document.createElement('div')
      placeholder.classList.add('page-placeholder')
      placeholder.style.height = `${height}px`
      placeholder.dataset.placeholder = 'true'
      pageInfo.page.appendChild(placeholder)
    }

    consoleLog?.('create placeholder', pageInfo.pageNum)
  }

  private setupPlaceholder(
    pageNum: number,
    sibling: HTMLElement,
    position: 'before' | 'after'
  ) {
    const { info, created } = this.getOrCreatePage(pageNum)

    if (created) {
      if (position === 'before') {
        sibling.before(info.page)
      } else {
        sibling.after(info.page)
      }

      this.createPlaceholder(info)
    }

    return info.page
  }

  private setupPlaceholders(wantPage: number, direction: 'up' | 'down') {
    let sibling = this.pageInfo[wantPage]?.page

    if (sibling == null) {
      return
    }

    if (direction === 'up') {
      for (
        let pageNum = wantPage - 1;
        pageNum >= Math.max(wantPage - PAGES_BUFFER - 1, 1);
        pageNum--
      ) {
        if (this.pageInfo[pageNum] != null) {
          sibling = this.pageInfo[pageNum]!.page
          continue
        }

        sibling = this.setupPlaceholder(pageNum, sibling, 'before')
        this.observer?.observe(sibling)
      }
    } else {
      for (
        let pageNum = wantPage + 1;
        pageNum <= Math.min(wantPage + PAGES_BUFFER + 1, this.totalPages);
        pageNum++
      ) {
        if (this.pageInfo[pageNum] != null) {
          sibling = this.pageInfo[pageNum]!.page
          continue
        }

        sibling = this.setupPlaceholder(pageNum, sibling, 'after')
        this.observer?.observe(sibling)
      }
    }
  }
}

// Function to register the component manually if needed,
// though often it's better to let the user do it or do it automatically in the index.
export function register(tagName: string = 'infinite-scroller') {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, InfiniteScroller)
  }
}
