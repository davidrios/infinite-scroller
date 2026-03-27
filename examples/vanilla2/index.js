import { register } from '/src/index.ts'
import { debounce } from '/src/utils.ts'
register()

const scroller = /** @type {import('/src/index.ts').InfiniteScroller<any>} */ (document.getElementById('my-scroller'))

const searchParams = new URLSearchParams(window.location.search)
// --- Settings state ---
const itemsPerPage = parseInt(searchParams.get('page-size') ?? '15')
const totalPages = parseInt(searchParams.get('total-pages') ?? '3000')

const pageSizeInput = document.getElementById('setting-page-size')
const totalPagesInput = document.getElementById('setting-total-pages')
const jumpPageInput = document.getElementById('setting-jump-page')
const jumpBtn = document.getElementById('setting-jump-btn')
const currentPageDisplay = document.getElementById('setting-current-page')

pageSizeInput.value = itemsPerPage.toString()
totalPagesInput.value = totalPages.toString()

jumpBtn?.addEventListener('click', () => {
  const page = parseInt(jumpPageInput.value)
  if (page > 0) {
    scroller.currentPage = page
    jumpPageInput.value = ''
  }
})

jumpPageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jumpBtn?.click()
})

// --- Mobile panel toggle ---
const settingsPanel = document.getElementById('settings-panel')
const settingsToggle = document.getElementById('settings-toggle')

function openPanel() {
  settingsPanel?.classList.add('!translate-y-0')
  settingsToggle?.setAttribute('aria-label', 'Close settings')
  settingsToggle?.classList.replace('⚙', '✕')
  if (settingsToggle) settingsToggle.textContent = '✕'
}

function closePanel() {
  settingsPanel?.classList.remove('!translate-y-0')
  settingsToggle?.setAttribute('aria-label', 'Open settings')
  if (settingsToggle) settingsToggle.textContent = '⚙'
}

function isPanelOpen() {
  return settingsPanel?.classList.contains('!translate-y-0') ?? false
}

settingsToggle?.addEventListener('click', () => {
  isPanelOpen() ? closePanel() : openPanel()
})

document.addEventListener('touchstart', (e) => {
  if (
    isPanelOpen() &&
    !settingsPanel?.contains(/** @type {Node} */ (e.target)) &&
    !settingsToggle?.contains(/** @type {Node} */ (e.target))
  ) {
    closePanel()
  }
}, { passive: true })

// --- Scroller events ---
const setPageHash = debounce((page) => {
  window.location.hash = `page=${page}`
}, 50)

scroller.addEventListener('page-changed', (e) => {
  setPageHash(e.detail.page.toString())
  if (currentPageDisplay) currentPageDisplay.textContent = e.detail.page.toString()
})

const setPage = debounce((page) => {
  scroller.currentPage = page
}, 50)

addEventListener('hashchange', (event) => {
  const urlSplit = event.newURL.split('=')
  const newPage = urlSplit[urlSplit.length - 1] ?? '1'
  console.log('jump page', newPage)
  setPage(parseInt(newPage))
})

const currentPage = (window.location.hash || 'page=1').split('=')[1]
scroller.setAttribute('current-page', currentPage)
if (currentPageDisplay) currentPageDisplay.textContent = currentPage

// Mock fetch function
scroller.fetchPage = async function(page) {
  console.log(`Fetching page ${page}...`)
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (Math.random() < 0.1) {
    throw new Error('error!')
  }

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

const itemTemplate = document.querySelector('[data-item-template]')

// Mock render function
scroller.renderItem = function(item) {
  const el = itemTemplate?.cloneNode()
  el.innerHTML = itemTemplate.innerHTML
  el.querySelector('[data-content=title]').innerText = item.name
  el.querySelector('[data-content=caption]').innerText = item.description
  el.querySelector('[data-content=image').src = `https://picsum.photos/seed/${item.id}/240/320`
  el.dataset.loadedEvent = 'loaded'
  setTimeout(function() {
    el.dispatchEvent(new CustomEvent('loaded'))
  }, 200)
  return el
}

scroller.createPageElement = function(pageNum) {
  const li = document.createElement('li')
  li.classList.add(...'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'.split(' '))

  const debugEl = document.createElement('div')
  debugEl.classList.add('absolute', 'z-3', 'font-mono', 'p-1', 'bg-yellow-500', 'text-xl')
  debugEl.textContent = pageNum.toString()
  li.append(debugEl)
  return li
}

scroller.createPlaceholderElements = function() {
  const elements = []
  for (let i = 0; i < itemsPerPage; i++) {
    const el = itemTemplate?.cloneNode()
    el.innerHTML = itemTemplate.innerHTML
    el.querySelector('[data-content=view-button]').remove()
    el.querySelector('[data-content=title]').innerText = "Loading"
    el.querySelector('[data-content=caption]').innerText = "Loading"
    const img = el.querySelector('[data-content=image')
    img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    elements.push(el)
  }

  return elements
}

scroller.loadInitialPage()
