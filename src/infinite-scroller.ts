import styles from './style.css?inline'
import template from './template.html?raw'

export class InfiniteScroller extends HTMLElement {
  private observer: IntersectionObserver | null = null
  private sentinelTop: HTMLElement | null = null
  private sentinelBottom: HTMLElement | null = null
  private _scrollElement: Element | Document | null = null

  static get observedAttributes() {
    return ['scroll-element', 'loading']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
    this.sentinelTop = this.shadowRoot!.getElementById('sentinel-top')
    this.sentinelBottom = this.shadowRoot!.getElementById('sentinel-bottom')
    this.setupObserver()
  }

  disconnectedCallback() {
    this.disconnectObserver()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === 'scroll-element' && oldValue !== newValue) {
      this.setupObserver()
    }
    // If we finished loading, re-attach observer to check if we are still intersecting
    // This allows sequential loads if the buffer isn't full yet.
    if (name === 'loading' && oldValue !== null && newValue === null) {
      this.setupObserver()
    }
  }

  get scrollElement(): Element | Document | null {
    return this._scrollElement
  }

  set scrollElement(value: Element | Document | null) {
    this._scrollElement = value
    this.setupObserver()
  }

  get isLoading(): boolean {
    return this.hasAttribute('loading')
  }

  set isLoading(value: boolean) {
    if (value) {
      this.setAttribute('loading', '')
    } else {
      this.removeAttribute('loading')
    }
  }

  private resolveScrollElement(): Element | Document | null {
    if (this._scrollElement) return this._scrollElement

    const selector = this.getAttribute('scroll-element')
    if (selector) {
      // Try to find it in the same root (e.g. document or shadow root)
      const root = this.getRootNode() as Document | ShadowRoot
      let el = root.querySelector(selector)
      if (!el) el = document.querySelector(selector)
      return el
    }

    // Default to viewport (null for IntersectionObserver)
    return null
  }

  private setupObserver() {
    this.disconnectObserver()

    if (!this.sentinelTop || !this.sentinelBottom) return

    const root = this.resolveScrollElement()

    // Create options for IntersectionObserver
    // root: null means viewport
    const options = {
      root: root as Element | null,
      rootMargin: '100px', // Preload a bit earlier
      threshold: 0.1
    }

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const isTop = entry.target === this.sentinelTop
          const isBottom = entry.target === this.sentinelBottom

          if (isTop) {
            this.dispatchEvent(new CustomEvent('load-prev', {
              bubbles: true,
              composed: true,
              detail: { originalEvent: entry }
            }))
          } else if (isBottom) {
            this.dispatchEvent(new CustomEvent('load-next', {
              bubbles: true,
              composed: true,
              detail: { originalEvent: entry }
            }))
            // Backward compat
            this.dispatchEvent(new CustomEvent('load-more', {
              bubbles: true,
              composed: true,
              detail: { originalEvent: entry }
            }))
          }
        }
      })
    }, options)

    this.observer.observe(this.sentinelTop)
    this.observer.observe(this.sentinelBottom)
  }

  private disconnectObserver() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
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

export function register(tagName: string = 'infinite-scroller') {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, InfiniteScroller)
  }
}
