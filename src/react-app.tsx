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
    const [pages, setPages] = useState<Page[]>([])
    const scrollerRef = useRef<HTMLElement>(null)
    const loadingRef = useRef(false) // Use ref for immediate lock

    // We start at page 10
    const [minPage, setMinPage] = useState(10)
    const [maxPage, setMaxPage] = useState(10)

    const contentRef = useRef<HTMLDivElement>(null);

    // Initial Load
    useEffect(() => {
        loadPage(10, 'append')
    }, [])

    const loadPage = async (pageNum: number, position: 'append' | 'prepend') => {
        if (loadingRef.current) return
        loadingRef.current = true
        if (scrollerRef.current) scrollerRef.current.setAttribute('loading', '')

        try {
            const data = await api.getPage(pageNum)

            setPages(prev => {
                // Deduplicate
                if (prev.find(p => p.page === pageNum)) return prev

                let newPages = position === 'append' ? [...prev, data] : [data, ...prev]

                // Sliding window: keep max 5
                if (newPages.length > 5) {
                    if (position === 'append') {
                        newPages = newPages.slice(1)
                    } else {
                        newPages = newPages.slice(0, 5)
                    }
                }

                return newPages
            })


            // Update pointers
            if (position === 'append') setMaxPage(p => Math.max(p, pageNum))
            else setMinPage(p => Math.min(p, pageNum))

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
                        <div key={page.page} className="page-container">
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
                        </div>
                    ))}
                </div>
            </infinite-scroller>
        </div>
    )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<App />)
