export class AutoLRUCache<T> {
  private capacity: number
  private cache: Map<number, T>
  private currentId: number

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than 0')
    }
    this.capacity = capacity
    this.cache = new Map<number, T>()
    this.currentId = 1
  }

  /**
   * Adds an item to the cache, evicting the least recently used item if at capacity.
   */
  add(item: T): number {
    const id = this.currentId++

    // If we are at capacity, remove the oldest accessed item
    if (this.cache.size >= this.capacity) {
      // cache.keys().next().value gets the very first (oldest) key in the Map
      const oldestId = this.cache.keys().next().value
      if (oldestId !== undefined) {
        this.cache.delete(oldestId)
      }
    }

    this.cache.set(id, item)
    return id
  }

  /**
   * Retrieves an item by its ID and marks it as recently used.
   */
  getById(id: number): T | null {
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
