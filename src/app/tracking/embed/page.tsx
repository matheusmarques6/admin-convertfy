"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef } from "react"

const DOMAIN = process.env.NEXT_PUBLIC_TRACKING_DOMAIN || process.env.NEXT_PUBLIC_APP_URL || ""

function EmbedWidget() {
  const params = useSearchParams()
  const store = params.get("store") || ""
  const containerRef = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!store || loaded.current) return
    loaded.current = true

    const script = document.createElement("script")
    script.src = `${DOMAIN}/api/script/widget.js?store=${encodeURIComponent(store)}`
    script.async = true
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [store])

  return (
    <div
      ref={containerRef}
      style={{ minHeight: "100vh", background: "transparent", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      <div id="convertfy-tracking" />
    </div>
  )
}

export default function TrackingEmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: "center", color: "#999" }}>Carregando...</div>}>
      <EmbedWidget />
    </Suspense>
  )
}
