import styles from './style.css?inline'
import template from './template.html?raw'

export class InfiniteScroller extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
  }

  render() {
    if (this.shadowRoot) {
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
