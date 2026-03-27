import { register } from './infinite-scroller'

export { InfiniteScroller, register } from './infinite-scroller'
export type {
  PageResult,
  FetchPageFn,
  RenderItemFn,
  PageChangedEvent,
  PagesFetchedEvent,
  ItemElementRemovedEvent,
} from './infinite-scroller'

if (typeof window !== 'undefined') {
  register()
}
