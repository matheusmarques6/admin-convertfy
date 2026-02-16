import { useState, useCallback, useRef, useEffect } from "react"

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
}

/**
 * Execute an async function with loading/error state management.
 *
 * Usage:
 *   const { data, error, isLoading, execute } = useAsync(fetchClients)
 *   // Call execute() to trigger, or pass { immediate: true }
 */
export function useAsync<T, Args extends unknown[] = []>(
  asyncFunction: (...args: Args) => Promise<T>,
  options?: { immediate?: boolean }
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: !!options?.immediate,
  })

  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }))
      try {
        const result = await asyncFunction(...args)
        if (mountedRef.current) {
          setState({ data: result, error: null, isLoading: false })
        }
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (mountedRef.current) {
          setState({ data: null, error, isLoading: false })
        }
        return null
      }
    },
    [asyncFunction]
  )

  useEffect(() => {
    if (options?.immediate) {
      execute(...([] as unknown as Args))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, execute }
}
