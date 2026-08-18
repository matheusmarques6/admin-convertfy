"use client"

/**
 * Estúdio de Agentes — canvas de fluxo (pan, zoom, drag de nós, arestas
 * bezier, grupos). Port fiel da maquete `agent-studio-canvas.jsx` para o
 * grafo REAL (studio-graph.ts).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  CheckCheck,
  FileImage,
  Layers,
  Mail,
  Package,
  PenLine,
  Search,
  Send,
  Target,
  X,
  Zap,
} from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import {
  NODE_H,
  NODE_W,
  RUN_STYLE,
  STUDIO_EDGES,
  STUDIO_GROUPS,
  STUDIO_NODES,
  edgeVisual,
  fmtDur,
  nodeMeta,
  type NodeRun,
  type StudioNode,
} from "@/lib/agents/studio-graph"
import { SHADOW_MD, Spinner, usd3 } from "./studio-atoms"

const NODE_ICON: Record<string, typeof Zap> = {
  zap: Zap,
  edit: PenLine,
  layers: Layers,
  package: Package,
  file: FileImage,
  mail: Mail,
  target: Target,
  search: Search,
  send: Send,
  check: CheckCheck,
}

export type Positions = Record<string, { x: number; y: number }>

export function defaultPositions(): Positions {
  return Object.fromEntries(STUDIO_NODES.map((n) => [n.key, { x: n.x, y: n.y }]))
}

function RunPill({ run }: { run: NodeRun | null }) {
  if (!run) return null
  const st = RUN_STYLE[run.status] ?? RUN_STYLE.aguardando
  return (
    <div
      style={{
        position: "absolute",
        top: -11,
        right: 10,
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 999,
        background: st.bg,
        border: `1px solid ${st.b}`,
        boxShadow: C.shadowSm,
        fontSize: 10.5,
        fontWeight: 600,
        color: st.c,
        fontFamily: F.sans,
        ...TNUM,
      }}
    >
      {run.status === "sucesso" && <CheckCheck size={11} />}
      {run.status === "erro" && <X size={11} />}
      {run.status === "rodando" && <Spinner size={9} track={st.b} head={st.c} />}
      {run.status === "sucesso" || run.status === "erro"
        ? fmtDur(run.durSec)
        : st.label}
      {run.usd != null && run.usd > 0 && (
        <span style={{ fontWeight: 500, color: st.c, opacity: 0.75 }}>
          · {usd3(run.usd)}
        </span>
      )}
    </div>
  )
}

function FlowNode({
  n,
  pos,
  selected,
  run,
  modelByAgent,
  onDown,
  onClick,
}: {
  n: StudioNode
  pos: { x: number; y: number }
  selected: boolean
  run: NodeRun | null
  modelByAgent?: Record<string, string | null>
  onDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  const meta = nodeMeta(n, modelByAgent)
  const dim = run && (run.status === "pulado" || run.status === "aguardando")
  const bc = selected ? C.brand : run && run.status === "erro" ? "#FECACA" : C.border
  const Icon = NODE_ICON[n.icon] ?? Zap
  return (
    <div
      onMouseDown={onDown}
      onClick={onClick}
      tabIndex={0}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        height: NODE_H,
        cursor: "pointer",
        background: C.white,
        border: `1.5px solid ${bc}`,
        borderRadius: 10,
        opacity: dim ? 0.55 : 1,
        boxShadow: selected
          ? `0 0 0 3px rgba(78,98,216,0.15), ${SHADOW_MD}`
          : C.shadowSm,
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "0 13px",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: meta.bg,
          border: `1px solid ${meta.border}`,
          color: meta.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.g900,
            fontFamily: F.sans,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta.name}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: C.g400,
            fontFamily: F.sans,
            ...TNUM,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 2,
          }}
        >
          {meta.sub}
        </div>
      </div>
      {n.type !== "trigger" && (
        <span
          style={{
            position: "absolute",
            left: -5,
            top: NODE_H / 2 - 5,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: C.white,
            border: `1.5px solid ${C.g300}`,
          }}
        />
      )}
      {n.type !== "output" && (
        <span
          style={{
            position: "absolute",
            right: -5,
            top: NODE_H / 2 - 5,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: C.white,
            border: `1.5px solid ${C.g300}`,
          }}
        />
      )}
      <RunPill run={run} />
      {run?.err && (
        <div
          style={{
            position: "absolute",
            top: NODE_H + 7,
            left: 0,
            right: -40,
            fontSize: 10.5,
            color: "#991B1B",
            fontFamily: F.sans,
            lineHeight: 1.35,
          }}
        >
          {run.err}
        </div>
      )}
    </div>
  )
}

interface View {
  k: number
  x: number
  y: number
}

type DragState =
  | { type: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | {
      type: "node"
      key: string
      sx: number
      sy: number
      nx: number
      ny: number
      k: number
      moved: boolean
    }

export function FlowCanvas({
  positions,
  selected,
  onSelect,
  onMove,
  runs,
  modelByAgent,
  overlay,
}: {
  positions: Positions
  selected: string | null
  onSelect?: (key: string) => void
  /** Presente = nós arrastáveis (aba Editor). */
  onMove?: (key: string, x: number, y: number) => void
  /** Presente = modo execução (pills de status + arestas coloridas). */
  runs?: Record<string, NodeRun> | null
  modelByAgent?: Record<string, string | null>
  overlay?: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<View | null>(null)
  const drag = useRef<DragState | null>(null)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    const xs = STUDIO_NODES.map((n) => positions[n.key]?.x ?? n.x)
    const ys = STUDIO_NODES.map((n) => positions[n.key]?.y ?? n.y)
    const pad = 70
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad - 30
    const maxX = Math.max(...xs) + NODE_W + pad
    const maxY = Math.max(...ys) + NODE_H + pad + 30
    const k = Math.min(
      el.clientWidth / (maxX - minX),
      el.clientHeight / (maxY - minY),
      1.15,
    )
    setView({
      k,
      x: (el.clientWidth - (maxX - minX) * k) / 2 - minX * k,
      y: (el.clientHeight - (maxY - minY) * k) / 2 - minY * k,
    })
    // positions só influencia o fit manual — o mount usa o estado inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fit()
  }, [fit])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        if (!v) return v
        const k = Math.min(2, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.08 : 0.93)))
        return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    const mm = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true
      if (d.type === "pan") {
        setView((v) =>
          v ? { ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) } : v,
        )
      } else if (d.type === "node" && onMove) {
        onMove(d.key, d.nx + (e.clientX - d.sx) / d.k, d.ny + (e.clientY - d.sy) / d.k)
      }
    }
    const mu = () => {
      // Limpa no próximo tick para o onClick ainda enxergar drag.moved.
      setTimeout(() => {
        drag.current = null
      }, 0)
    }
    window.addEventListener("mousemove", mm)
    window.addEventListener("mouseup", mu)
    return () => {
      window.removeEventListener("mousemove", mm)
      window.removeEventListener("mouseup", mu)
    }
  }, [onMove])

  if (!view) return <div ref={ref} style={{ position: "absolute", inset: 0 }} />

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        drag.current = {
          type: "pan",
          sx: e.clientX,
          sy: e.clientY,
          vx: view.x,
          vy: view.y,
          moved: false,
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        cursor: "grab",
        background: `${C.g50} radial-gradient(circle, ${C.g200} 1px, transparent 1px)`,
        backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: "0 0",
        }}
      >
        {STUDIO_GROUPS.map((g) => (
          <div
            key={g.label}
            style={{
              position: "absolute",
              left: g.x,
              top: g.y,
              width: g.w,
              height: g.h,
              borderRadius: 14,
              background: g.bg,
              border: `1px dashed ${g.border}`,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -20,
                left: 12,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.09em",
                color: g.c,
                fontFamily: F.sans,
                opacity: 0.8,
              }}
            >
              {g.label}
            </span>
          </div>
        ))}
        <svg
          width="1"
          height="1"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {STUDIO_EDGES.map(([from, to]) => {
            const a = positions[from]
            const b = positions[to]
            if (!a || !b) return null
            const x1 = a.x + NODE_W
            const y1 = a.y + NODE_H / 2
            const x2 = b.x
            const y2 = b.y + NODE_H / 2
            const dx = Math.max(46, (x2 - x1) / 2)
            const s = edgeVisual(from, to, runs ?? null)
            return (
              <path
                key={`${from}-${to}`}
                d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.w}
                strokeDasharray={s.dash ?? undefined}
              />
            )
          })}
        </svg>
        {STUDIO_NODES.map((n) => {
          const pos = positions[n.key] ?? { x: n.x, y: n.y }
          return (
            <FlowNode
              key={n.key}
              n={n}
              pos={pos}
              modelByAgent={modelByAgent}
              selected={selected === n.key}
              run={runs ? (runs[n.key] ?? null) : null}
              onDown={(e) => {
                e.stopPropagation()
                drag.current = onMove
                  ? {
                      type: "node",
                      key: n.key,
                      sx: e.clientX,
                      sy: e.clientY,
                      nx: pos.x,
                      ny: pos.y,
                      k: view.k,
                      moved: false,
                    }
                  : null
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!drag.current || !drag.current.moved) onSelect?.(n.key)
              }}
            />
          )
        })}
      </div>
      {/* Controles de zoom */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {[
          { t: "Ajustar à tela", icon: <Target size={15} />, fn: fit },
          {
            t: "Diminuir zoom",
            icon: <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}>−</span>,
            fn: () => setView((v) => (v ? { ...v, k: Math.max(0.25, v.k * 0.85) } : v)),
          },
          {
            t: "Aumentar zoom",
            icon: <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}>+</span>,
            fn: () => setView((v) => (v ? { ...v, k: Math.min(2, v.k * 1.18) } : v)),
          },
        ].map((b) => (
          <button
            key={b.t}
            title={b.t}
            onClick={b.fn}
            style={{
              width: 32,
              height: 32,
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: C.white,
              color: C.g600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: C.shadowSm,
            }}
          >
            {b.icon}
          </button>
        ))}
        <span
          style={{ marginLeft: 4, fontSize: 11.5, color: C.g400, fontFamily: F.sans, ...TNUM }}
        >
          {Math.round(view.k * 100)}%
        </span>
      </div>
      {overlay}
    </div>
  )
}
