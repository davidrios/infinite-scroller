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

export class InfiniteScroller<T = any> extends HTMLElement {
  private _fetchPage?: DeduplicateAsyncFunction<
    Parameters<FetchPageFn<T>>,
    PageResult<T>
  >
  private _renderItem?: RenderItemFn<T>
  private listElement: HTMLUListElement | null = null
  private loadingElement: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private loadedPages: Record<string, number> = {}
  private pageCache: AutoLRUCache<PageResult<T>>
  private totalPages: number = 0xffffff
  private lastScrollY: number = 0
  private scrollDirection: 'up' | 'down' = 'down'
  private scrollHandler: (() => void) | null = null
  private approximatePageHeight: number = -1
  private placeholders: Record<string, HTMLElement> = {}
  private sentinels: Record<string, HTMLElement> = {}
  private firstAdded: Record<string, boolean> = {}
  private debouncedLoadPageAround: (
    middlePage: number,
    doScroll?: boolean
  ) => void
  private needScrolling: HTMLElement | null = null
  private clearNeedScrolling: () => void
  private scrollingArrived: boolean = false
  private scrollingSettled: boolean = true
  private setScrollingSettled: () => void
  private wantedPage: number = -1

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.pageCache = new AutoLRUCache(
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
      console.log('scrolling settled')
      this.scrollingSettled = true
      if (this.needScrolling) {
        console.log(
          'scrolling settled, ignoring needScrolling',
          this.needScrolling,
          'and setting page to',
          this.wantedPage
        )
        this.needScrolling = null
        this.currentPage = this.wantedPage
      }
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

            if (this.scrollDirection == 'up' && entry.isIntersecting) {
              wantPage = parseInt(target.dataset.page)
            } else if (
              this.scrollDirection == 'down' &&
              !entry.isIntersecting
            ) {
              wantPage = Math.max(parseInt(target.dataset.page) + 1, 1)
            }

            if (this.firstAdded[target.dataset.page]) {
              wantPage = null
              this.firstAdded[target.dataset.page] = false
            }

            if (wantPage != null) {
              console.log('want page', wantPage)
              this.wantedPage = wantPage
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

  private async renderPage(
    pageNum: number,
    items: PageResult<T>['items'],
    sentinel?: HTMLElement
  ) {
    if (!this.listElement || !this.observer || !this._renderItem) {
      throw new Error('unexpected state')
    }

    let page: HTMLElement

    if (sentinel == null) {
      page = document.createElement('li')
      this.listElement.appendChild(page)

      sentinel = document.createElement('div')
      sentinel.classList.add('page-sentinel')
      sentinel.dataset.page = pageNum.toString()
      sentinel.innerText = pageNum.toString()
      page.appendChild(sentinel)
      this.observer.observe(sentinel)
    } else {
      page = sentinel.parentNode as HTMLElement
    }

    let pageHeight = 0
    let sibling = sentinel

    for (const item of items) {
      const itemElement = await this._renderItem(item)
      sibling.after(itemElement)
      sibling = itemElement
    }

    pageHeight = page.getBoundingClientRect().height

    if (this.approximatePageHeight === -1) {
      this.approximatePageHeight = pageHeight
    }

    console.log('rendered page', pageNum)

    return sentinel
  }

  public async loadPageAround(middlePage: number) {
    if (!this.listElement || !this.observer) {
      throw new Error('unexpected state')
    }

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
            let pageData = this.pageCache.getById(this.loadedPages[pageNum])
            if (pageData == null && this.currentPage == middlePage) {
              pageData = (await this._fetchPage?.(pageNum))!
              this.loadedPages[pageData.currentPage] =
                this.pageCache.add(pageData)
            }
            return pageData!
          })(pageNum)
        )
      )

      if (this.currentPage != middlePage) {
        clearLoading = false
        return
      }

      for (let result of results) {
        this.totalPages = result.totalPages
        if (!result.items.length) {
          continue
        }

        const placeholder = this.placeholders[result.currentPage]

        if (placeholder != null) {
          console.log('placeholder is not null')
          this.sentinels[result.currentPage] = await this.renderPage(
            result.currentPage,
            result.items,
            this.sentinels[result.currentPage]
          )
          placeholder.remove()
          delete this.placeholders[result.currentPage]
        } else {
          if (this.sentinels[result.currentPage] == null) {
            this.sentinels[result.currentPage] = await this.renderPage(
              result.currentPage,
              result.items
            )
          }
        }
      }

      this.createExtraPlaceholders(middlePage, 'up')
      this.createExtraPlaceholders(middlePage, 'down')

      this.needScrolling = this.sentinels[middlePage]
      console.log('needScrolling', this.needScrolling)
      setTimeout(() => {
        if (this.needScrolling == null) {
          return
        }

        const rect = this.needScrolling.getBoundingClientRect()

        if (rect.top < 0 || rect.top > window.innerHeight) {
          console.log('scroll into view', this.needScrolling, middlePage)
          this.needScrolling.scrollIntoView({ behavior: 'instant' })
        } else {
          this.needScrolling = null
        }
      }, 1)

      console.log('finish page around', middlePage)
    } catch {
      this.needScrolling = null
    } finally {
      if (clearLoading) {
        this.setLoading(false)
      }
    }
  }

  private createPlaceholder(
    pageNum: number,
    sibling: HTMLElement,
    position: 'before' | 'after'
  ) {
    if (!this.observer) {
      throw new Error('unexpected state')
    }

    const page = document.createElement('li')
    if (position == 'before') {
      sibling.before(page)
    } else {
      sibling.after(page)
    }

    const sentinel = document.createElement('div')
    sentinel.classList.add('page-sentinel')
    sentinel.dataset.page = pageNum.toString()
    sentinel.innerText = pageNum.toString()
    page.appendChild(sentinel)
    this.observer.observe(sentinel)
    this.sentinels[pageNum] = sentinel
    this.firstAdded[pageNum] = true
    sibling = sentinel.parentElement!

    const placeholder = document.createElement('div')
    placeholder.classList.add('page-placeholder')
    placeholder.style.height = `${this.approximatePageHeight}px`
    page.appendChild(placeholder)
    this.placeholders[pageNum] = placeholder

    console.log('create placeholder', pageNum, position)

    return page
  }

  private createExtraPlaceholders(wantPage: number, direction: 'up' | 'down') {
    const buffer = 10

    let sibling = this.sentinels[wantPage]

    if (direction === 'up') {
      for (
        let pageNum = wantPage - 1;
        pageNum >= Math.max(wantPage - buffer - 1, 1);
        pageNum--
      ) {
        if (this.sentinels[pageNum] != null) {
          sibling = this.sentinels[pageNum].parentElement!
          continue
        }

        sibling = this.createPlaceholder(pageNum, sibling, 'before')
      }
    } else {
      for (
        let pageNum = wantPage + 1;
        pageNum <= Math.min(wantPage + buffer + 1, this.totalPages);
        pageNum++
      ) {
        if (this.sentinels[pageNum] != null) {
          sibling = this.sentinels[pageNum].parentElement!
          continue
        }

        sibling = this.createPlaceholder(pageNum, sibling, 'after')
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
