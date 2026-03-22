import { register } from '/src/index.ts'
import { debounce } from '/src/utils.ts'
register()

const scroller = /** @type {import('/src/index.ts').InfiniteScroller} */ (document.getElementById('my-scroller'))

scroller.addEventListener('page-changed', (e) => {
  window.location.hash = `page=${e.detail.page}`
})

const setPage = debounce((page) => {
  scroller.currentPage = page
}, 50)

addEventListener('hashchange', (event) => {
  const newPage = event.newURL.split('=')[1]
  console.log('jump page', newPage)
  setPage(parseInt(newPage))
})

const currentPage = (window.location.hash || 'page=1').split('=')[1]
scroller.setAttribute('current-page', currentPage)

// Mock fetch function
scroller.fetchPage = async (page) => {
  console.log(`Fetching page ${page}...`)
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (Math.random() < 0.1) {
    throw new Error('error!')
  }

  const itemsPerPage = 15
  const totalPages = 150
  if (page > totalPages) {
    return { items: [], currentPage: page, totalPages }
  }

  const items = Array.from({ length: itemsPerPage }, (_, i) => ({
    id: (page - 1) * itemsPerPage + i + 1,
    name: `Item ${(page - 1) * itemsPerPage + i + 1}`,
    description: `This is the description for item ${(page - 1) * itemsPerPage + i + 1}`,
  }))

  return {
    items,
    currentPage: page,
    totalPages,
  }
}

// Mock render function
scroller.renderItem = (item) => {
  const div = document.createElement('div')
  div.className = 'item-card'
  div.innerHTML = `
    <p class="item-name">${item.name}</p>
    <p class="item-desc">${item.description}</p>
  `
  return div
}

scroller.loadInitialPage()

