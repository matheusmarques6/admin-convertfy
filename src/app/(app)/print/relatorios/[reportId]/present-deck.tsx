"use client"

/**
 * Modo apresentação (?present=1): fundo preto, UM slide por vez ocupando o
 * máximo da tela em 16:9 (letterbox preto — nunca faixas brancas), navegação
 * por teclado/clique e tela cheia nativa.
 *
 * Reusa o <ReportSlides> renderizado pelo server como children. O slide ativo
 * é escolhido por CSS `:nth-of-type` (índice injetado) — sem tocar em classe
 * de nó controlado pelo React (o SlideShell re-renderiza no resize e apagaria
 * qualquer classe adicionada por fora).
 *
 * Escala: o SlideShell interno nunca AMPLIA além de 1× (clamp), então fixamos
 * o palco dele em 1280×720 nativo e aplicamos um `transform: scale(S)` EXTERNO
 * (S pode passar de 1) no [data-slide] ativo, S = min(vw/1280, vh/720). Assim
 * o slide preenche a tela em telas grandes e pequenas mantendo 16:9.
 *
 * Tudo dentro de @media screen: um Ctrl+P aqui continua imprimindo as 7
 * páginas do deck (o CSS de impressão do layout permanece intacto).
 */

import { useCallback, useEffect, useRef, useState } from "react"

const STAGE_W = 1280
const STAGE_H = 720

export function PresentDeck({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(7)
  const [scale, setScale] = useState(1)
  const [hudVisible, setHudVisible] = useState(true)
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Conta os slides reais (robusto se o deck ganhar/perder slides no futuro).
  useEffect(() => {
    const n = rootRef.current?.querySelectorAll("[data-slide]").length ?? 0
    if (n > 0) setTotal(n)
  }, [])

  // Escala pra preencher a tela mantendo 16:9. Recalcula no resize / rotação.
  useEffect(() => {
    const compute = () =>
      setScale(
        Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H),
      )
    compute()
    window.addEventListener("resize", compute)
    document.addEventListener("fullscreenchange", compute)
    return () => {
      window.removeEventListener("resize", compute)
      document.removeEventListener("fullscreenchange", compute)
    }
  }, [])

  // Fundo/scroll do body: inline com prioridade "important" vence os
  // !important do <style> do layout de print (cinza #f1f5f9 + padding 20px).
  useEffect(() => {
    const body = document.body
    body.style.setProperty("background", "#000", "important")
    body.style.setProperty("padding", "0", "important")
    body.style.setProperty("overflow", "hidden", "important")
    return () => {
      body.style.removeProperty("background")
      body.style.removeProperty("padding")
      body.style.removeProperty("overflow")
    }
  }, [])

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(total - 1, i)),
    [total],
  )
  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp])
  const prev = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  // HUD (contador + dicas) some após 3s parado; reaparece ao mexer o mouse.
  const pokeHud = useCallback(() => {
    setHudVisible(true)
    if (hudTimer.current) clearTimeout(hudTimer.current)
    hudTimer.current = setTimeout(() => setHudVisible(false), 3000)
  }, [])
  useEffect(() => {
    pokeHud()
    return () => {
      if (hudTimer.current) clearTimeout(hudTimer.current)
    }
  }, [pokeHud])

  // Teclado: setas/espaço/PgUp-PgDn/Home/End navegam, F = tela cheia,
  // ESC fora do fullscreen volta pra visão de lista (o ESC DENTRO do
  // fullscreen é consumido pelo navegador pra sair da tela cheia).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          e.preventDefault()
          next()
          pokeHud()
          break
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault()
          prev()
          pokeHud()
          break
        case "Home":
          e.preventDefault()
          setIndex(0)
          break
        case "End":
          e.preventDefault()
          setIndex(total - 1)
          break
        case "f":
        case "F":
          toggleFullscreen()
          break
        case "Escape":
          if (!document.fullscreenElement) {
            window.location.href = window.location.pathname
          }
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, total, toggleFullscreen, pokeHud])

  // Clique: metade direita avança, esquerda volta.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.clientX > window.innerWidth / 2) next()
    else prev()
    pokeHud()
  }

  return (
    <div
      ref={rootRef}
      className="present-root"
      onClick={onClick}
      onMouseMove={pokeHud}
      style={{ cursor: hudVisible ? "default" : "none" }}
    >
      {/* Slide ativo via :nth-of-type + escala externa — atualizam com o
          estado, sem tocar nos nós do React. Só em screen. */}
      <style>{`
        @media screen {
          .present-root [data-slides-root] {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100vw;
            height: 100vh;
            padding: 0 !important;
            margin: 0 !important;
            background: #000;
            overflow: hidden;
          }
          .present-root [data-slides-root] > [data-slide] {
            display: none !important;
          }
          .present-root [data-slides-root] > [data-slide]:nth-of-type(${index + 1}) {
            display: block !important;
          }
          /* Palco nativo 1280×720 (scale interno do SlideShell = 1) + scale
             EXTERNO pra preencher a tela (pode passar de 1×). */
          .present-root [data-slide] {
            width: ${STAGE_W}px !important;
            max-width: none !important;
            margin: 0 !important;
            transform: scale(${scale});
            transform-origin: center center;
          }
          .present-root [data-slide-viewport] {
            width: ${STAGE_W}px !important;
            height: ${STAGE_H}px !important;
            aspect-ratio: auto !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {children}

      {/* HUD: contador + dicas (some após 3s de inatividade) */}
      <div
        style={{
          position: "fixed",
          bottom: 18,
          right: 22,
          display: "flex",
          alignItems: "center",
          gap: 14,
          zIndex: 50,
          opacity: hudVisible ? 1 : 0,
          transition: "opacity 300ms ease",
          pointerEvents: "none",
          color: "rgba(255,255,255,0.75)",
          fontSize: 12,
          fontFamily: "var(--font-inter), sans-serif",
          fontVariantNumeric: "tabular-nums",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      >
        <span style={{ opacity: 0.7 }}>← → navegar · F tela cheia · Esc sair</span>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.12)",
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </div>
  )
}
