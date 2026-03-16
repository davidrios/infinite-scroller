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
  public _fetchPage?: DeduplicateAsyncFunction<
    Parameters<FetchPageFn<T>>,
    PageResult<T>
  >
  public _renderItem?: RenderItemFn<T>

  private _isLoading: boolean = false
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

  set fetchPage(fn: FetchPageFn<T>) {
    this._fetchPage = deduplicateAsync(fn)
  }

  set renderItem(fn: RenderItemFn<T>) {
    this._renderItem = fn
  }

  get preloadPages(): number {
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

  get isLoading(): boolean {
    return this._isLoading
  }

  private setLoading(loading: boolean) {
    this._isLoading = loading
    if (this.loadingElement) {
      this.loadingElement.style.display = loading ? 'block' : 'none'
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

          let currentPage: number | null = null
          if (target.dataset.page != null) {
            if (this.scrollingSettled) {
              console.log('start scrolling pages')
              this.scrollingSettled = false
            }
            this.setScrollingSettled()

            if (this.scrollDirection == 'up' && entry.isIntersecting) {
              currentPage = parseInt(target.dataset.page)
            } else if (
              this.scrollDirection == 'down' &&
              !entry.isIntersecting
            ) {
              currentPage = Math.max(parseInt(target.dataset.page) + 1, 1)
            }

            if (currentPage != null) {
              console.log('want page', currentPage)
              this.wantedPage = currentPage
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

          if (currentPage != null) {
            console.log('set page', currentPage, target, this.scrollDirection)
            this.currentPage = currentPage
          }
        })
      },
      { threshold: 0.1 }
    )
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler)
    }
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

      // let sibling: HTMLElement | null = null
      //
      // for (let pageNum = 1; pageNum < pagesToFetch[0]; pageNum++) {
      //   if (this.sentinels[pageNum] != null) {
      //     sibling = this.sentinels[pageNum].parentElement!
      //     continue
      //   }
      //
      //   const page = document.createElement('li')
      //
      //   if (sibling == null) {
      //     this.listElement.append(page)
      //     sibling = page
      //   } else {
      //     sibling.after(page)
      //   }
      //
      //   const sentinel = document.createElement('div')
      //   sentinel.classList.add('page-sentinel')
      //   sentinel.dataset.page = pageNum.toString()
      //   sentinel.innerText = pageNum.toString()
      //   page.appendChild(sentinel)
      //   this.observer.observe(sentinel)
      //   this.sentinels[pageNum] = sentinel
      //   sibling = sentinel.parentElement!
      //
      //   const placeholder = document.createElement('div')
      //   placeholder.classList.add('page-placeholder')
      //   placeholder.style.height = `${this.approximatePageHeight}px`
      //   page.appendChild(placeholder)
      //   this.placeholders[pageNum] = placeholder
      // }

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

      let sibling = this.sentinels[pagesToFetch[0]].parentElement!

      for (let pageNum = pagesToFetch[0] - 1; pageNum >= 1; pageNum--) {
        if (this.sentinels[pageNum] != null) {
          sibling = this.sentinels[pageNum].parentElement!
          continue
        }

        const page = document.createElement('li')
        sibling.before(page)

        const sentinel = document.createElement('div')
        sentinel.classList.add('page-sentinel')
        sentinel.dataset.page = pageNum.toString()
        sentinel.innerText = pageNum.toString()
        page.appendChild(sentinel)
        this.observer.observe(sentinel)
        this.sentinels[pageNum] = sentinel
        sibling = sentinel.parentElement!

        const placeholder = document.createElement('div')
        placeholder.classList.add('page-placeholder')
        placeholder.style.height = `${this.approximatePageHeight}px`
        page.appendChild(placeholder)
        this.placeholders[pageNum] = placeholder
      }

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

  public async loadInitialPage() {
    await this.loadPageAround(this.currentPage)
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
}

// Function to register the component manually if needed,
// though often it's better to let the user do it or do it automatically in the index.
export function register(tagName: string = 'infinite-scroller') {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, InfiniteScroller)
  }
}
