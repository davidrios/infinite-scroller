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

interface PageData {
  hasError: boolean
  page: HTMLElement
  firstAdded: boolean
  isIntersected: boolean
  pageHeight: number
}

export class InfiniteScroller<T = any> extends HTMLElement {
  private _fetchPage?: DeduplicateAsyncFunction<
    Parameters<FetchPageFn<T>>,
    PageResult<T>
  >
  private _renderItem?: RenderItemFn<T>
  private listElement: HTMLUListElement | null = null
  private loadingElement: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private loadedPages: Record<string, number | undefined> = {}
  private pageResultCache: AutoLRUCache<PageResult<T>>
  private pageInfo: Record<string, PageData | undefined> = {}
  private totalPages: number = 0xffffff
  private lastScrollY: number = 0
  private scrollDirection: 'up' | 'down' = 'down'
  private scrollHandler: (() => void) | null = null
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
  private scrollingPage: number = -1
  private lastIntersected: number = -1

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
      console.log('clear need scrolling')
      this.scrollingArrived = false
      this.needScrolling = null
    }, 1)

    this.setScrollingSettled = debounce(() => {
      this.scrollingSettled = true
      if (
        this.lastIntersected > 0 &&
        Math.abs(this.lastIntersected - this.scrollingPage) > 2
      ) {
        console.log('last insersected too far from scrolling page, adjusting')
        this.scrollingPage = this.lastIntersected
      }

      console.log('scrolling settled on', this.scrollingPage)

      if (this.needScrolling) {
        console.log(
          'scrolling settled, ignoring needScrolling',
          this.needScrolling,
          'and setting page to',
          this.scrollingPage
        )
        this.needScrolling = null
      }

      this.currentPage = this.scrollingPage
    }, 50)
  }

  render() {
    if (this.shadowRoot && !this.shadowRoot.innerHTML) {
      this.shadowRoot.innerHTML = `
        <style>
          ${styles}
        </style>
        ${template}
`
    }
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler)
    }
  }

  async connectedCallback() {
    this.render()

    this.listElement = this.shadowRoot?.querySelector(
      '[data-element=scroller-list]'
    )!
    this.loadingElement = this.shadowRoot?.querySelector(
      '[data-element=loading-indicator]'
    )!

    this.setupIntersectionObserver()
    this.setupScrollListener()
  }

  set fetchPage(fn: FetchPageFn<T>) {
    this._fetchPage = deduplicateAsync(fn)
  }

  set renderItem(fn: RenderItemFn<T>) {
    this._renderItem = fn
  }

  async loadInitialPage() {
    this.scrollingPage = this.currentPage
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

  private setLoading(loading: boolean) {
    if (this.loadingElement) {
      this.loadingElement.style.display = loading ? 'block' : 'none'
    }
  }

  private setupScrollListener() {
    this.scrollHandler = () => {
      const currentScrollY = window.scrollY
      this.scrollDirection = currentScrollY > this.lastScrollY ? 'down' : 'up'
      this.lastScrollY = currentScrollY
    }
    window.addEventListener('scroll', this.scrollHandler)
  }

  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement

          let wantPage: number | null = null
          if (target.dataset.page != null) {
            if (this.scrollingSettled) {
              console.log('start scrolling pages')
              this.scrollingSettled = false
            }
            this.setScrollingSettled()

            const itemPage = parseInt(target.dataset.page)
            const pageInfo = this.pageInfo[itemPage]!

            pageInfo.isIntersected = entry.isIntersecting

            if (!pageInfo.firstAdded) {
              if (entry.isIntersecting) {
                this.lastIntersected = itemPage
              } else {
                wantPage = itemPage + (this.scrollDirection === 'up' ? -1 : +1)
              }
            }

            pageInfo.firstAdded = false

            if (wantPage != null) {
              console.log('want page', wantPage)
              this.scrollingPage = wantPage
              this.createExtraPlaceholders(wantPage, this.scrollDirection)
            }
          }

          if (this.needScrolling != null) {
            if (entry.target === this.needScrolling && entry.isIntersecting) {
              this.scrollingArrived = true
              console.log('arrived!')
            }
            if (this.scrollingArrived) {
              this.clearNeedScrolling()
            }
            return
          }

          if (wantPage != null) {
            console.log('set page', wantPage, target, this.scrollDirection)
            this.currentPage = wantPage
          }
        })
      },
      { threshold: 0.1 }
    )
  }

  private async renderPage(pageNum: number, pageResult: PageResult<T> | null) {
    if (!this._renderItem || !this.listElement) {
      throw new Error('unexpected state')
    }

    const { data, created } = this.getOrCreatePage(pageNum)
    const placeholder = data.page.querySelector('[data-placeholder]')

    if (created) {
      console.log('add page', data.page)
      this.listElement.appendChild(data.page)
    }

    if (placeholder != null || created || data.hasError) {
      data.page.querySelector('[data-error]')?.remove()

      if (pageResult != null) {
        data.hasError = false
        for (const item of pageResult.items) {
          const itemElement = await this._renderItem(item)
          data.page.append(itemElement)
        }
      } else {
        data.hasError = true
        const el = document.createElement('div')
        el.dataset.error = 'true'
        el.innerText = 'Error loading page ' + pageNum
        const height = data.pageHeight || this.approximatePageHeight
        if (height > 0) {
          el.style.height = `${height}px`
        }
        data.page.append(el)
      }
    }

    if (placeholder != null) {
      placeholder.remove()
    }

    if (!data.hasError) {
      data.pageHeight = data.page.getBoundingClientRect().height
    }

    if (this.approximatePageHeight === -1 && !data.hasError) {
      this.approximatePageHeight = data.page.getBoundingClientRect().height
    }

    return data.page
  }

  public async loadPageAround(middlePage: number) {
    if (this.needScrolling != null) {
      console.log('skip page around', middlePage, this.needScrolling)
      return
    }

    console.log('load page around', middlePage)

    this.setLoading(true)
    let clearLoading = true
    try {
      const pagesToFetch = []
      for (
        let i = Math.max(1, middlePage - this.preloadPages);
        i < Math.min(middlePage + this.preloadPages + 1, this.totalPages + 1);
        i++
      ) {
        pagesToFetch.push(i)
      }
      console.log('pages to fetch', pagesToFetch)

      const results = await Promise.all(
        pagesToFetch.map((pageNum) =>
          (async (pageNum) => {
            let pageResult = this.pageResultCache.getById(
              this.loadedPages[pageNum] ?? -1
            )
            if (pageResult == null && this.currentPage == middlePage) {
              try {
                pageResult = (await this._fetchPage?.(pageNum))!
                this.loadedPages[pageResult.currentPage] =
                  this.pageResultCache.add(pageResult)
              } catch {}
            }
            return { pageNum, pageResult }
          })(pageNum)
        )
      )

      if (this.currentPage != middlePage) {
        clearLoading = false
        return
      }

      for (let { pageNum, pageResult } of results) {
        if (pageResult != null && pageNum === middlePage) {
          this.totalPages = pageResult.totalPages
        }

        if (pageResult?.items.length === 0) {
          continue
        }

        await this.renderPage(pageNum, pageResult)
      }

      this.createExtraPlaceholders(middlePage, 'up')
      this.createExtraPlaceholders(middlePage, 'down')

      const pageInfo = this.pageInfo[middlePage]!

      this.needScrolling = pageInfo.page
      setTimeout(() => {
        if (this.needScrolling == null) {
          return
        }

        if (!pageInfo.isIntersected) {
          console.log('scroll into view', this.needScrolling, middlePage)
          this.needScrolling.scrollIntoView({ behavior: 'instant' })
        } else {
          console.log('no need to scroll to', middlePage)
          this.needScrolling = null
        }
      }, 1)

      console.log('end of load page around', middlePage)
    } catch (err) {
      this.needScrolling = null
      console.error(err)
    } finally {
      if (clearLoading) {
        this.setLoading(false)
      }
    }
  }

  private getOrCreatePage(pageNum: number) {
    if (!this.observer) {
      throw new Error('unexpected state')
    }

    const created = this.pageInfo[pageNum] == null
    if (this.pageInfo[pageNum] == null) {
      const page = document.createElement('li')
      this.pageInfo[pageNum] = {
        isIntersected: false,
        firstAdded: true,
        page,
        pageHeight: 0,
        hasError: false,
      }
      page.dataset.page = pageNum.toString()
      this.observer.observe(page)

      const debugEl = document.createElement('div')
      debugEl.classList.add('page-sentinel')
      debugEl.innerText = pageNum.toString()
      page.appendChild(debugEl)
    }

    return { data: this.pageInfo[pageNum], created }
  }

  private setupPlaceholder(
    pageNum: number,
    sibling: HTMLElement,
    position: 'before' | 'after'
  ) {
    const { data, created } = this.getOrCreatePage(pageNum)

    if (created) {
      if (position == 'before') {
        sibling.before(data.page)
      } else {
        sibling.after(data.page)
      }

      const placeholder = document.createElement('div')
      placeholder.dataset.placeholder = 'true'
      placeholder.classList.add('page-placeholder')
      placeholder.style.height = `${this.approximatePageHeight}px`
      data.page.appendChild(placeholder)

      console.log('create placeholder', pageNum, position)
    }

    return data.page
  }

  private createExtraPlaceholders(wantPage: number, direction: 'up' | 'down') {
    const buffer = 10

    let sibling = this.pageInfo[wantPage]!.page

    if (direction === 'up') {
      for (
        let pageNum = wantPage - 1;
        pageNum >= Math.max(wantPage - buffer - 1, 1);
        pageNum--
      ) {
        if (this.pageInfo[pageNum] != null) {
          sibling = this.pageInfo[pageNum]!.page
          continue
        }

        sibling = this.setupPlaceholder(pageNum, sibling, 'before')
      }
    } else {
      for (
        let pageNum = wantPage + 1;
        pageNum <= Math.min(wantPage + buffer + 1, this.totalPages);
        pageNum++
      ) {
        if (this.pageInfo[pageNum] != null) {
          sibling = this.pageInfo[pageNum]!.page
          continue
        }

        sibling = this.setupPlaceholder(pageNum, sibling, 'after')
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
