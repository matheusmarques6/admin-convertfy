"use client"

/**
 * Miniaturas do frame: `Thumb` em largura fixa; `ThumbFit` ocupa o
 * container e observa o tamanho (ResizeObserver) — é o que os cards da
 * biblioteca, do exportar e do seletor de variações usam.
 */

import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type { Documento } from "@/lib/conteudo/types"
import { Frame, FRAME_W, alturaFrame } from "./frame"

export function Thumb({ doc, ix, w = 120, style }: { doc: Documento; ix: number; w?: number; style?: CSSProperties }) {
  const H = alturaFrame(doc)
  const sc = w / FRAME_W
  return (
    <div style={{ width: w, height: H * sc, overflow: "hidden", position: "relative", ...style }} aria-hidden>
      <Frame doc={doc} ix={ix} scale={sc} />
    </div>
  )
}

export function ThumbFit({ doc, ix }: { doc: Documento; ix: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(160)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 160))
    ro.observe(el)
    setW(el.clientWidth || 160)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="h-full w-full">
      <Thumb doc={doc} ix={ix} w={w} />
    </div>
  )
}
