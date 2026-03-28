# wc-infinite-scroller

A native Web Component implementation of an infinite scroller with page-based data fetching, LRU caching, and virtual placeholder support.

## Installation

```bash
npm install wc-infinite-scroller
```

## Usage

### As an ES module (recommended)

```js
import { register } from 'wc-infinite-scroller'

register() // registers <infinite-scroller> custom element
```

### Side-effect import (auto-registers on load)

```js
import 'wc-infinite-scroller'
```

### Via `<script>` tag (UMD)

```html
<script src="node_modules/wc-infinite-scroller/dist/infinite-scroller.umd.cjs"></script>
```

### HTML

```html
<infinite-scroller id="scroller"></infinite-scroller>
```

### JavaScript

```js
const scroller = document.getElementById('scroller')

scroller.fetchPage = async (page) => {
  const res = await fetch(`/api/items?page=${page}`)
  const data = await res.json()
  return {
    items: data.items,
    currentPage: page,
    totalPages: data.totalPages,
  }
}

scroller.renderItem = (item) => {
  const el = document.createElement('div')
  el.textContent = item.name
  return el
}

scroller.loadInitialPage()
```

### Custom element template

You can provide your own container element instead of the default `<ul>` list by placing HTML inside the component. The first child element will be used as the scroll container:

```html
<infinite-scroller id="scroller">
  <div class="my-list"></div>
</infinite-scroller>
```

## API

### Properties

| Property                    | Type                                               | Description                                                        |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `fetchPage`                 | `(page: number) => Promise<PageResult<T>>`         | **Required.** Called to fetch a page of data.                      |
| `renderItem`                | `(item: T) => HTMLElement \| Promise<HTMLElement>` | **Required.** Called to render each data item.                     |
| `currentPage`               | `number`                                           | Gets or sets the current page (triggers load).                     |
| `createPageElement`         | `() => HTMLElement`                                | Optional. Factory for the wrapper element of each page.            |
| `createPlaceholderElements` | `() => HTMLElement[]`                              | Optional. Factory for placeholder elements shown while loading.    |
| `createErrorElement`        | `(estimatedHeight: number) => HTMLElement`         | Optional. Factory for the element shown when a page fails to load. |

### Methods

| Method              | Description                               |
| ------------------- | ----------------------------------------- |
| `loadInitialPage()` | Loads the initial page. Call after setup. |

### Attributes

| Attribute       | Default              | Description                                         |
| --------------- | -------------------- | --------------------------------------------------- |
| `current-page`  | `1`                  | Initial page to load.                               |
| `preload-pages` | `2`                  | Number of pages to preload around the current page. |
| `cache-size`    | `preload-pages * 10` | Minimum LRU cache size.                             |

### Events

| Event                  | Detail                                                                                  | Description                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `page-changed`         | `{ page: number, previousPage: number }`                                                | Fired when the visible page changes during scrolling.       |
| `pages-fetched`        | `{ pages: { pageNum: number, pageResult: PageResult<T> \| null }[], mainPage: number }` | Fired after a batch of pages is fetched.                    |
| `item-element-removed` | `Element`                                                                               | Fired when a rendered item element is removed from the DOM. |

## TypeScript

Types are bundled. The `InfiniteScroller` class is generic:

```ts
import {
  InfiniteScroller,
  register,
  type PageResult,
  type PageChangedEvent,
  type PagesFetchedEvent,
  type ItemElementRemovedEvent,
} from 'wc-infinite-scroller'

interface MyItem {
  id: number
  name: string
}

const scroller = document.querySelector(
  'infinite-scroller'
) as InfiniteScroller<MyItem>

scroller.addEventListener('pages-fetched', (e) => {
  const event = e as PagesFetchedEvent<MyItem>
  console.log('fetched pages', event.detail?.pages)
})
```

## License

MIT
