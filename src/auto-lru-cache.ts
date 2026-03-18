export class AutoLRUCache<T> {
  private capacity: number
  private cache: Map<number, T>

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than 0')
    }
    this.capacity = capacity
    this.cache = new Map<number, T>()
  }

  /**
   * Set an item to the cache, evicting the least recently used item if at capacity.
   */
  set(id: number, item: T) {
    if (this.cache.has(id)) {
      this.cache.delete(id)
    }
    this.cache.set(id, item)

    let deleted = null

    // If we are at capacity, remove the oldest accessed item
    if (this.cache.size >= this.capacity) {
      // cache.keys().next().value gets the very first (oldest) key in the Map
      const oldestId = this.cache.keys().next().value
      if (oldestId !== undefined) {
        deleted = this.cache.get(oldestId)
        this.cache.delete(oldestId)
      }
    }

    return { id, deleted: deleted }
  }

  /**
   * Retrieves an item by its ID and marks it as recently used.
   */
  get(id: number): T | null {
    if (!this.cache.has(id)) {
      return null
    }

    // Item exists. We get it, delete it, and re-set it.
    // This pushes it to the "newest" spot at the end of the Map's insertion order.
    const item = this.cache.get(id)!

    this.cache.delete(id)
    this.cache.set(id, item)

    return item
  }
}
