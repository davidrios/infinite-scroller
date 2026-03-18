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

## API

### Properties

| Property     | Type                                         | Description                                       |
|--------------|----------------------------------------------|---------------------------------------------------|
| `fetchPage`  | `(page: number) => Promise<PageResult<T>>`   | **Required.** Called to fetch a page of data.     |
| `renderItem` | `(item: T) => HTMLElement \| Promise<HTMLElement>` | **Required.** Called to render each data item. |
| `currentPage`| `number`                                     | Gets or sets the current page (triggers load).    |

### Methods

| Method              | Description                                    |
|---------------------|------------------------------------------------|
| `loadInitialPage()` | Loads the initial page. Call after setup.       |

### Attributes

| Attribute       | Default | Description                                                     |
|-----------------|---------|-----------------------------------------------------------------|
| `current-page`  | `1`     | Initial page to load.                                           |
| `preload-pages` | `2`     | Number of pages to preload around the current page.             |
| `cache-size`    | `preload-pages * 10`     | Minimum LRU cache size. |

### Events

| Event          | Detail                              | Description                                             |
|----------------|-------------------------------------|---------------------------------------------------------|
| `page-changed` | `{ page, previousPage }`            | Fired when the visible page changes during scrolling.   |
| `item-removed` | `{ item: HTMLElement }`             | Fired when a page item is removed from the DOM. |

## TypeScript

Types are bundled. The `InfiniteScroller` class is generic:

```ts
import { InfiniteScroller, register, type PageResult } from 'wc-infinite-scroller'

interface MyItem {
  id: number
  name: string
}

const scroller = document.querySelector('infinite-scroller') as InfiniteScroller<MyItem>
```

## License

MIT
