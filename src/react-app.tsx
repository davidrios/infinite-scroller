import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { register, InfiniteScroller } from './index' // Import to ensure registration
import { ApiSimulator, Page } from './api-simulator'

register()

const api = new ApiSimulator()

// Declare custom element for TS
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'infinite-scroller': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                'scroll-element'?: string;
                'loading'?: boolean;
            };
        }
    }
}

const App = () => {
    const [pages, setPages] = useState<(Page & { isVirtual?: boolean, height?: number })[]>([])
    const scrollerRef = useRef<HTMLElement>(null)
    const loadingRef = useRef(false) // Use ref for immediate lock

    // We start at page 1
    const [minPage, setMinPage] = useState(1)
    const [maxPage, setMaxPage] = useState(1)

    const BUFFER_SIZE = 2
    const MAX_PAGES = 10

    const contentRef = useRef<HTMLDivElement>(null);

    // Initial Load: Load start page and buffer
    useEffect(() => {
        const init = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const start = parseInt(urlParams.get('page') || '1');

            // Create placeholders for previous pages
            if (start > 1) {
                const placeholders: any[] = [];
                for (let i = 1; i < start; i++) {
                    placeholders.push({ page: i, items: [], isVirtual: true, height: 80 * 10 }); // 80vh approx
                }
                setPages(placeholders);
                setMinPage(1);
            } else {
                setMinPage(start);
            }
            setMaxPage(start);

            await loadPage(start, 'append')
            for (let i = 1; i <= BUFFER_SIZE; i++) {
                await loadPage(start + i, 'append')
            }

            // Scroll to start page if needed
            setTimeout(() => {
                const el = document.querySelector(`[data-page="${start}"]`);
                if (el) el.scrollIntoView();
            }, 100);
        }
        init()
    }, [])

    const loadPage = async (pageNum: number, position: 'append' | 'prepend') => {
        if (loadingRef.current) return
        loadingRef.current = true
        if (scrollerRef.current) scrollerRef.current.setAttribute('loading', '')

        try {
            const data = await api.getPage(pageNum)

            setPages(prev => {
                // Find if exists
                const existingIndex = prev.findIndex(p => p.page === pageNum);

                let newPages = [...prev];
                if (existingIndex !== -1) {
                    newPages[existingIndex] = { ...data, isVirtual: false };
                } else {
                    if (position === 'append') newPages.push(data);
                    else newPages.unshift(data);
                }

                const hydratedPages = newPages.filter(p => !p.isVirtual);
                if (hydratedPages.length > MAX_PAGES) {
                    if (position === 'append') {
                        // Virtualize the first hydrated one
                        const toVirtualize = hydratedPages[0];
                        const idx = newPages.findIndex(p => p.page === toVirtualize.page);
                        const el = document.querySelector(`[data-page="${toVirtualize.page}"]`);
                        const height = el ? el.getBoundingClientRect().height : 800;
                        newPages[idx] = { ...toVirtualize, isVirtual: true, height, items: [] };
                    } else {
                        // Virtualize the last hydrated one
                        const toVirtualize = hydratedPages[hydratedPages.length - 1];
                        const idx = newPages.findIndex(p => p.page === toVirtualize.page);
                        const el = document.querySelector(`[data-page="${toVirtualize.page}"]`);
                        const height = el ? el.getBoundingClientRect().height : 800;
                        newPages[idx] = { ...toVirtualize, isVirtual: true, height, items: [] };
                    }
                }

                return newPages
            })


            // Update pointers to track hydrated pages
            setPages(prev => {
                const hydratedPages = prev.filter(p => !p.isVirtual).map(p => p.page).sort((a, b) => a - b);
                if (hydratedPages.length > 0) {
                    setMinPage(hydratedPages[0]);
                    setMaxPage(hydratedPages[hydratedPages.length - 1]);
                }
                return prev;
            });

        } finally {
            loadingRef.current = false
            if (scrollerRef.current) scrollerRef.current.removeAttribute('loading')
        }
    }

    // Event Listeners
    useEffect(() => {
        const el = scrollerRef.current
        if (!el) return

        const onNext = () => loadPage(maxPageRef.current + 1, 'append')
        const onPrev = () => {
            if (minPageRef.current > 1) {
                loadPage(minPageRef.current - 1, 'prepend')
            }
        }

        el.addEventListener('load-next', onNext)
        el.addEventListener('load-prev', onPrev)

        return () => {
            el.removeEventListener('load-next', onNext)
            el.removeEventListener('load-prev', onPrev)
        }
    }, [])

    // Keep refs in sync for event handlers
    const maxPageRef = useRef(maxPage)
    const minPageRef = useRef(minPage)
    useEffect(() => { maxPageRef.current = maxPage }, [maxPage])
    useEffect(() => { minPageRef.current = minPage }, [minPage])

    return (
        <div style={{ fontFamily: 'sans-serif', padding: 20 }}>
            <h1>React Integration</h1>
            <p>Loaded Pages: {pages.map(p => p.page).join(', ')}</p>

            <infinite-scroller ref={scrollerRef}>
                <div ref={contentRef} style={{ overflowAnchor: 'auto' }}>
                    {pages.map(page => (
                        <div key={page.page} className="page-container" data-page={page.page} style={{ height: page.isVirtual ? page.height : 'auto' }}>
                            {!page.isVirtual && (
                                <>
                                    <div style={{ background: '#333', color: '#fff', padding: 5, fontSize: '0.8rem', textAlign: 'center' }}>
                                        --- Page {page.page} ---
                                    </div>
                                    {page.items.map(item => (
                                        <div key={item.id} style={{
                                            background: '#e3f2fd',
                                            border: '1px solid #90caf9',
                                            padding: 20,
                                            margin: '10px 0',
                                            height: 100, /* 100px height */
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {item.text}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </infinite-scroller>
        </div>
    )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<App />)
