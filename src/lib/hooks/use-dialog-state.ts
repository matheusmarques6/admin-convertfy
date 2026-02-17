import { useState, useCallback } from "react"

interface UseDialogStateOptions {
  onClose?: () => void
}

export function useDialogState<T = undefined>(options?: UseDialogStateOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<T | undefined>(undefined)

  const open = useCallback((item?: T) => {
    setData(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setData(undefined)
    options?.onClose?.()
  }, [options])

  return {
    isOpen,
    data,
    open,
    close,
    setIsOpen,
  }
}
