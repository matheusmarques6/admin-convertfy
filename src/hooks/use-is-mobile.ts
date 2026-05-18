"use client"

import { useEffect, useState } from "react"

/**
 * Detecta se o viewport esta em tamanho mobile (<= 768px por default).
 * Reage a mudancas de resize. Retorna `false` no SSR.
 */
export function useIsMobile(maxWidth = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [maxWidth])

  return isMobile
}
