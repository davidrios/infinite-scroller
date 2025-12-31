import { createApp, ref, computed, onMounted } from 'vue'
import { register } from './index'
import { ApiSimulator, Page } from './api-simulator'

register()
const api = new ApiSimulator()

const App = {
    template: `
    <div style="font-family: sans-serif; padding: 20px;">
        <h1>Vue Integration</h1>
        <p>Loaded Pages: {{ pageNumbers.join(', ') }}</p>

        <infinite-scroller 
            @load-next="handleNext" 
            @load-prev="handlePrev"
            :loading="loading ? '' : null"
        >
            <div style="overflow-anchor: auto;">
                <div v-for="page in pages" :key="page.page" class="page-container">
                    <div style="background: #333; color: #fff; padding: 5px; font-size: 0.8rem; text-align: center;">
                        --- Page {{ page.page }} ---
                    </div>
                    <div v-for="item in page.items" :key="item.id" style="background: #e8f5e9; border: 1px solid #a5d6a7; padding: 20px; margin: 10px 0; height: 100px; display: flex; align-items: center; justify-content: center;">
                        {{ item.text }}
                    </div>
                </div>
            </div>
        </infinite-scroller>
    </div>
  `,
    setup() {
        const pages = ref<Page[]>([])
        const loading = ref(false)

        // Support starting at a specific page via URL: /vue-demo.html?page=4
        const urlParams = new URLSearchParams(window.location.search);
        const startPage = parseInt(urlParams.get('page') || '10');

        const minPage = ref(startPage)
        const maxPage = ref(startPage)

        const pageNumbers = computed(() => pages.value.map(p => p.page))

        const loadPage = async (pageNum: number, position: 'append' | 'prepend') => {
            if (loading.value) return
            loading.value = true

            try {
                const data = await api.getPage(pageNum)

                // Deduplicate
                if (pages.value.find(p => p.page === pageNum)) return

                if (position === 'append') {
                    pages.value.push(data)
                    // Windowing
                    if (pages.value.length > 5) {
                        pages.value.shift()
                    }
                    maxPage.value = Math.max(maxPage.value, pageNum)
                    // If we shifted, minPage changes implicitly based on content, 
                    // but for our tracking we should probably update it.
                    // Assuming contiguous:
                    minPage.value = pages.value[0].page
                } else {
                    pages.value.unshift(data)
                    // Windowing
                    if (pages.value.length > 5) {
                        pages.value.pop()
                    }
                    minPage.value = Math.min(minPage.value, pageNum)
                    maxPage.value = pages.value[pages.value.length - 1].page
                }

            } finally {
                loading.value = false
            }
        }

        const handleNext = () => {
            loadPage(maxPage.value + 1, 'append')
        }

        const handlePrev = () => {
            if (minPage.value > 1) {
                loadPage(minPage.value - 1, 'prepend')
            }
        }

        onMounted(() => {
            loadPage(startPage, 'append')
        })

        return {
            pages,
            loading,
            pageNumbers,
            handleNext,
            handlePrev
        }
    }
}

createApp(App).mount('#app')
