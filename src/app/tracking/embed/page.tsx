"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef } from "react"

function EmbedWidget() {
  const params = useSearchParams()
  const store = params.get("store") || ""
  const loaded = useRef(false)

  useEffect(() => {
    if (!store || loaded.current) return
    loaded.current = true

    // Use relative path — works on any domain
    const script = document.createElement("script")
    script.src = `/api/script/widget.js?store=${encodeURIComponent(store)}`
    script.async = true
    document.body.appendChild(script)

    script.onload = () => {
      window.parent?.postMessage({ type: "convertfy:ready" }, "*")
    }

    return () => {
      script.remove()
    }
  }, [store])

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
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
