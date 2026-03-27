/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function (this: any, ...args: Parameters<T>) {
    if (timeout !== null) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

export type DeduplicateAsyncFunction<T extends any[], R> = (
  ...args: T
) => Promise<R>

/**
 * Wraps an async function to deduplicate concurrent calls with the same arguments.
 */
export function deduplicateAsync<T extends any[], R>(
  asyncFn: DeduplicateAsyncFunction<T, R>
): DeduplicateAsyncFunction<T, R> {
  const pendingPromises = new Map<string, Promise<R>>()

  return async function (...args: T): Promise<R> {
    const key = JSON.stringify(args)

    if (pendingPromises.has(key)) {
      return await pendingPromises.get(key)!
    }

    // We do not 'await' it immediately because we must store the raw Promise in the Map first.
    const executionPromise = asyncFn(...args).finally(() => {
      // Clean up the Map once the promise settles (resolves or rejects)
      // so future calls will start a fresh request.
      pendingPromises.delete(key)
    })

    pendingPromises.set(key, executionPromise)

    return await executionPromise
  }
}
