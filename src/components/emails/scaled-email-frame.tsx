"use client"

/**
 * ScaledEmailFrame — preview de email HTML que simula um client REAL.
 *
 * Dois problemas que resolve:
 *
 * 1. **Media query mobile disparando no desktop** (bug "parece celular"):
 *    emails table-based usam `@media (max-width: 600px)` (às vezes 620px)
 *    pro layout mobile. Um iframe com viewport de exatamente 600px DISPARA
 *    o media query (`<=`) e o preview renderiza a versão celular empilhada.
 *    Clients desktop reais (Gmail/Outlook web) têm viewport muito maior que
 *    o container de 600px do email. Correção: quando `baseWidth >= 600`
 *    (modo desktop), o iframe ganha um viewport com folga
 *    (`baseWidth + DESKTOP_GUTTER`) — o email mantém a própria max-width,
 *    centralizado, com as calhas de fundo visíveis como num client real, e
 *    os media queries mobile NÃO disparam. Abaixo de 600 é simulação mobile
 *    intencional: o viewport é exatamente a largura pedida para DISPARAR os
 *    media queries.
 *
 * 2. **Scroll horizontal em colunas estreitas**: medimos a largura
 *    disponível (ResizeObserver) e aplicamos `transform: scale` pra encaixar
 *    o email inteiro sem scroll lateral.
 *
 * A altura é automática: lemos o `scrollHeight` do conteúdo (precisa de
 * `sandbox="allow-same-origin"`; scripts seguem bloqueados — emails não
 * rodam JS). Com `maxHeight`, a caixa é limitada e ganha scroll vertical
 * interno (uso em cards compactos).
 */

import { useCallback, useEffect, useRef, useState } from "react"

// Folga de viewport no modo desktop. Precisa ser maior que a diferença entre
// o breakpoint mobile mais alto usado nos emails gerados (620px) e a largura
// padrão do email (600px), com margem.
const DESKTOP_GUTTER = 80

// Abaixo disso o slider está simulando celular — media queries DEVEM disparar.
const MOBILE_SIM_THRESHOLD = 600

export function ScaledEmailFrame({
  html,
  baseWidth,
  maxHeight,
}: {
  html: string
  baseWidth: number
  /** Limita a altura visível; o excedente ganha scroll vertical interno. */
  maxHeight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [avail, setAvail] = useState(baseWidth)
  const [contentHeight, setContentHeight] = useState(baseWidth)

  // Largura disponível da coluna (reativo a resize da janela/painéis).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setAvail(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAvail(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Altura real do conteúdo do email (auto-size, sem scroll vertical interno).
  const measureHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(
      doc.body.scrollHeight,
      doc.documentElement?.scrollHeight ?? 0,
    )
    if (h > 0) setContentHeight(h)
  }, [])

  // Re-mede ao trocar o html e algumas vezes depois (imagens carregam tarde).
  useEffect(() => {
    measureHeight()
    const timers = [80, 300, 900].map((ms) => setTimeout(measureHeight, ms))
    return () => timers.forEach(clearTimeout)
  }, [html, avail, measureHeight])

  const viewportWidth =
    baseWidth < MOBILE_SIM_THRESHOLD ? baseWidth : baseWidth + DESKTOP_GUTTER
  const scale = Math.min(1, avail / viewportWidth)
  const scaledHeight = contentHeight * scale
  const boxHeight =
    maxHeight != null ? Math.min(scaledHeight, maxHeight) : scaledHeight

  return (
    // Div externa: mede a largura disponível (transparente, ocupa a coluna).
    <div ref={containerRef} style={{ width: "100%" }}>
      {/* Caixa visível: largura do viewport simulado (escalada quando a
          coluna é menor). Com maxHeight, vira janela com scroll interno. */}
      <div
        style={{
          width: viewportWidth * scale,
          height: boxHeight,
          margin: "0 auto",
          overflowX: "hidden",
          overflowY: maxHeight != null && scaledHeight > maxHeight ? "auto" : "hidden",
          background: "#fff",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Wrapper na altura ESCALADA total — dá a área rolável correta
            quando maxHeight corta o conteúdo. */}
        <div style={{ width: viewportWidth * scale, height: scaledHeight }}>
          <iframe
            ref={iframeRef}
            title="email-render-preview"
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={measureHeight}
            scrolling="no"
            style={{
              width: viewportWidth,
              height: contentHeight,
              border: 0,
              display: "block",
              background: "#fff",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  )
}
