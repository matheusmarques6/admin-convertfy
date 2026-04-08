'use client'

import { useState, useCallback } from 'react'

interface AlertState {
  variant: 'success' | 'error' | 'warning' | 'info'
  title?: string
  description: string
  action?: { label: string; onClick?: () => void; href?: string }
}

export function useAlertBanner() {
  const [alert, setAlert] = useState<AlertState | null>(null)

  const showAlert = useCallback((state: AlertState) => {
    setAlert(state)
  }, [])

  const dismissAlert = useCallback(() => {
    setAlert(null)
  }, [])

  return { alert, showAlert, dismissAlert }
}
