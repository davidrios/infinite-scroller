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
                <div v-for="page in pages" :key="page.page" class="page-container" :data-page="page.page" :style="{ height: page.isVirtual ? page.height + 'px' : 'auto' }">
                    <template v-if="!page.isVirtual">
                        <div style="background: #333; color: #fff; padding: 5px; font-size: 0.8rem; text-align: center;">
                            --- Page {{ page.page }} ---
                        </div>
                        <div v-for="item in page.items" :key="item.id" style="background: #e8f5e9; border: 1px solid #a5d6a7; padding: 20px; margin: 10px 0; height: 100px; display: flex; align-items: center; justify-content: center;">
                            {{ item.text }}
                        </div>
                    </template>
                </div>
            </div>
        </infinite-scroller>
    </div>
  `,
    setup() {
        const pages = ref<(Page & { isVirtual?: boolean, height?: number })[]>([])
        const loading = ref(false)

        // Support starting at a specific page via URL: /vue-demo.html?page=4
        const urlParams = new URLSearchParams(window.location.search);
        const startPage = parseInt(urlParams.get('page') || '1');
        const BUFFER_SIZE = 2;
        const MAX_PAGES = 10;

        const minPage = ref(startPage)
        const maxPage = ref(startPage)

        const pageNumbers = computed(() => pages.value.map(p => p.page))

        const loadPage = async (pageNum: number, position: 'append' | 'prepend') => {
            if (loading.value) return
            loading.value = true

            try {
                const data = await api.getPage(pageNum)

                // Find if exists
                const existingIndex = pages.value.findIndex(p => p.page === pageNum);

                if (existingIndex !== -1) {
                    pages.value[existingIndex] = { ...data, isVirtual: false };
                } else {
                    if (position === 'append') {
                        pages.value.push(data)
                    } else {
                        pages.value.unshift(data)
                    }
                }

                // Windowing
                const hydratedPages = pages.value.filter(p => !p.isVirtual);
                if (hydratedPages.length > MAX_PAGES) {
                    if (position === 'append') {
                        // Virtualize the first hydrated one
                        const toVirtualize = hydratedPages[0];
                        const idx = pages.value.findIndex(p => p.page === toVirtualize.page);
                        const el = document.querySelector(`[data-page="${toVirtualize.page}"]`);
                        const height = el ? el.getBoundingClientRect().height : 800;
                        pages.value[idx] = { ...toVirtualize, isVirtual: true, height, items: [] };
                    } else {
                        // Virtualize the last hydrated one
                        const toVirtualize = hydratedPages[hydratedPages.length - 1];
                        const idx = pages.value.findIndex(p => p.page === toVirtualize.page);
                        const el = document.querySelector(`[data-page="${toVirtualize.page}"]`);
                        const height = el ? el.getBoundingClientRect().height : 800;
                        pages.value[idx] = { ...toVirtualize, isVirtual: true, height, items: [] };
                    }
                }

                // Update min/max pointers based on hydrated pages
                const hydratedPageNumbers = pages.value
                    .filter(p => !p.isVirtual)
                    .map(p => p.page)
                    .sort((a, b) => a - b);
                if (hydratedPageNumbers.length > 0) {
                    minPage.value = hydratedPageNumbers[0];
                    maxPage.value = hydratedPageNumbers[hydratedPageNumbers.length - 1];
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

        onMounted(async () => {
            // Create placeholders for previous pages
            if (startPage > 1) {
                const placeholders: any[] = [];
                for (let i = 1; i < startPage; i++) {
                    placeholders.push({ page: i, items: [], isVirtual: true, height: 800 }); // ~80vh
                }
                pages.value = placeholders;
            }

            await loadPage(startPage, 'append')
            for (let i = 1; i <= BUFFER_SIZE; i++) {
                await loadPage(startPage + i, 'append')
            }
            for (let i = 1; i <= BUFFER_SIZE; i++) {
                const prev = startPage - i
                if (prev >= 1) await loadPage(prev, 'prepend')
            }

            // Scroll to start page
            setTimeout(() => {
                const el = document.querySelector(`[data-page="${startPage}"]`);
                if (el) el.scrollIntoView();
            }, 100);
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
