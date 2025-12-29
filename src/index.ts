import { InfiniteScroller, register } from './infinite-scroller'

// Export everything
export { InfiniteScroller, register }

// Auto-register if used via script tag (i.e. window is present)
// and we are not in a module system that might prefer manual registration.
// However, for side-effect imports, auto-registering is common.
// Let's check if we are in a browser environment.
if (typeof window !== 'undefined') {
  register()
}
