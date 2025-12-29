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
          :host {
            display: block;
            padding: 20px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            font-family: sans-serif;
          }
          h2 {
            margin-top: 0;
            color: #333;
          }
        </style>
        <div class="scroller-container">
          <h2>Infinite Scroller Component</h2>
          <p>This is a framework-agnostic web component.</p>
          <slot></slot>
        </div>
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
