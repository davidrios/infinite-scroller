import styles from './style.css?inline'
import template from './template.html?raw'

export interface PageResult<T> {
  items: T[]
  currentPage: number
  totalPages: number
}

export class InfiniteScroller<T = any> extends HTMLElement {
  public fetchPage?: (page: number) => Promise<PageResult<T>>
  public renderItem?: (item: T) => HTMLElement

  private _isLoading: boolean = false
  private listElement: HTMLUListElement | null = null
  private loadingElement: HTMLElement | null = null
  private topSentinel: HTMLElement | null = null
  private bottomSentinel: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private loadedPages: Record<string, boolean>
  private lastLoadedPage: number = -1
  private totalPages: number = -1

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.loadedPages = {}
  }

  get currentPage(): number {
    return parseInt(this.getAttribute('current-page') || '1', 10)
  }

  set currentPage(value: number) {
    this.setAttribute('current-page', value.toString())
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
      '#scroller-list'
    ) as HTMLUListElement
    this.loadingElement = this.shadowRoot?.querySelector(
      '#loading-indicator'
    ) as HTMLElement
    this.topSentinel = this.shadowRoot?.querySelector(
      '#top-sentinel'
    ) as HTMLElement
    this.bottomSentinel = this.shadowRoot?.querySelector(
      '#bottom-sentinel'
    ) as HTMLElement

    this.setupIntersectionObserver()
  }

  private handleTopReached() {
    console.log('top visible')
  }

  private handleBottomReached() {
    console.log('bottom visible')
    if (this.totalPages > this.lastLoadedPage) {
      this.loadPage(this.lastLoadedPage + 1)
    }
  }

  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement
          if (target.id === 'top-sentinel') {
            if (!this._isLoading && entry.isIntersecting) {
              this.handleTopReached()
            }
          } else if (target.id === 'bottom-sentinel') {
            if (!this._isLoading && entry.isIntersecting) {
              this.handleBottomReached()
            }
          } else if (target.dataset.page != null) {
            if (target.dataset.page != this.lastLoadedPage.toString()) {
              console.log(
                'page',
                target.dataset.page,
                'intersecting',
                entry.isIntersecting
              )
            }
          }
        })
      },
      { threshold: 0.1 }
    )

    if (this.topSentinel) this.observer.observe(this.topSentinel)
    if (this.bottomSentinel) this.observer.observe(this.bottomSentinel)
  }

  disconnectedCallback() {
    this.observer?.disconnect()
  }

  private async loadPage(pageNum: number) {
    if (
      !this.observer ||
      !this.fetchPage ||
      !this.renderItem ||
      !this.listElement ||
      !this.bottomSentinel ||
      !this.topSentinel
    ) {
      return
    }

    this.setLoading(true)

    try {
      const result = await this.fetchPage(pageNum)
      this.loadedPages[pageNum] = true
      this.lastLoadedPage = pageNum
      this.totalPages = result.totalPages

      const sentinel = document.createElement('li')
      sentinel.classList.add('page-sentinel')
      sentinel.dataset.page = pageNum.toString()
      this.listElement.appendChild(sentinel)
      this.observer.observe(sentinel)

      for (const item of result.items) {
        const itemElement = this.renderItem(item)
        const li = document.createElement('li')
        li.appendChild(itemElement)
        this.listElement.appendChild(li)
      }

      const rect = this.bottomSentinel.getBoundingClientRect()
      if (rect.top < window.innerHeight) {
        this.handleBottomReached()
      }
    } catch (error) {
      console.error('InfiniteScroller: Error fetching page', error)
    } finally {
      this.setLoading(false)
    }
  }

  public async loadInitialPage() {
    await this.loadPage(this.currentPage)
  }

  /**
   * Inject custom CSS into the component's shadow DOM.
   */
  public injectStyles(css: string) {
    const style = document.createElement('style')
    style.textContent = css
    this.shadowRoot?.appendChild(style)
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
