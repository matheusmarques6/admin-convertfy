"use client"

/**
 * Primitivos visuais da seção Pesquisa & Diagnóstico.
 *
 * Pull         · blockquote estilo pullquote com borda azul-brand
 * Prose        · wrapper de texto longo (line-height 1.7, gray-700)
 * PillarTile   · numeral Playfair + label + texto curto
 * FactRow      · year badge + event (com flags highlight/muted)
 * DemoFact     · coluna demográfica (label uppercase + valor)
 * MotivCard    · card pos/warn com lista bullet de motivações
 * DoDontCard   · wrapper card pos/neg com header
 * DoDontItem   · frase-exemplo em Playfair italic
 * WordList     · chips de palavras pos/neg
 * ScoreGauge   · donut SVG com score 0-10 + label
 * SubScore     · barra horizontal /10
 * ReviewBlock  · bloco de strengths/opportunities/risks
 */

import { cn } from "@/lib/utils"

// ─── Pull ────────────────────────────────────────────────

export function Pull({ children }: { children: React.ReactNode }) {
  return (
    <blockquote
      className="border-l-[3px] pl-4 py-1 my-1 italic text-slate-900"
      style={{
        borderColor: "#4E62D8",
        fontFamily: "'Playfair Display', serif",
        fontSize: 18,
        lineHeight: 1.5,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </blockquote>
  )
}

// ─── Prose ───────────────────────────────────────────────

export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("text-[13.5px] text-slate-700 space-y-3", className)}
      style={{ lineHeight: 1.7 }}
    >
      {children}
    </div>
  )
}

// ─── PillarTile ──────────────────────────────────────────

export function PillarTile({
  number,
  label,
  text,
}: {
  number: string
  label: string
  text: string
}) {
  return (
    <div className="bg-slate-50 border rounded-md p-3.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div
        className="mb-1 font-bold"
        style={{
          fontFamily: "'Playfair Display', serif",
          color: "#4E62D8",
          fontSize: 22,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {number}
      </div>
      <div className="text-[12.5px] font-bold text-slate-900 leading-tight mb-1">{label}</div>
      <div className="text-[11.5px] text-slate-600 leading-snug">{text}</div>
    </div>
  )
}

// ─── FactRow ─────────────────────────────────────────────

export function FactRow({
  year,
  event,
  highlight,
  muted,
}: {
  year: string
  event: string
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 min-w-[60px] text-center",
          highlight && "bg-brand-50 text-brand-700",
          muted && "bg-slate-100 text-slate-400",
          !highlight && !muted && "bg-slate-100 text-slate-600",
        )}
      >
        {year}
      </span>
      <span
        className={cn(
          "text-[11.5px] leading-snug",
          muted ? "text-slate-400 italic" : "text-slate-700",
        )}
      >
        {event}
      </span>
    </div>
  )
}

// ─── DemoFact ────────────────────────────────────────────

export function DemoFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-semibold text-slate-900 leading-tight">{value}</span>
    </div>
  )
}

// ─── MotivCard ───────────────────────────────────────────

export function MotivCard({
  tone,
  title,
  items,
}: {
  tone: "pos" | "warn"
  title: string
  items: string[]
}) {
  const cfg = tone === "pos"
    ? { bg: "#F0FDF4", border: "#A7F3D0", color: "#065F46", dot: "#10B981" }
    : { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E", dot: "#F59E0B" }
  return (
    <div
      className="border rounded-md p-3.5"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <h4 className="text-[12px] font-bold mb-2 m-0" style={{ color: cfg.color }}>
        {title}
      </h4>
      <ul className="m-0 p-0 list-none space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug" style={{ color: cfg.color }}>
            <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5" style={{ background: cfg.dot }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── DoDontCard ──────────────────────────────────────────

export function DoDontCard({
  tone,
  title,
  children,
}: {
  tone: "pos" | "neg"
  title: string
  children: React.ReactNode
}) {
  const cfg = tone === "pos"
    ? { bg: "#F0FDF4", border: "#A7F3D0", color: "#065F46" }
    : { bg: "#FEF7F7", border: "#FECACA", color: "#991B1B" }
  return (
    <div
      className="border rounded-md p-3.5"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <h4 className="text-[12px] font-bold mb-3 m-0" style={{ color: cfg.color }}>
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ─── DoDontItem ──────────────────────────────────────────

export function DoDontItem({ text, bad }: { text: string; bad?: boolean }) {
  return (
    <div
      className="bg-white rounded-md px-3 py-2 border"
      style={{ borderColor: "rgba(0,0,0,0.04)" }}
    >
      <span
        className={cn(bad ? "text-slate-500" : "text-slate-800")}
        style={{
          fontFamily: "'Playfair Display', serif",
          fontStyle: "italic",
          fontSize: 13.5,
          lineHeight: 1.45,
          textDecoration: bad ? "line-through" : "none",
          textDecorationColor: bad ? "#FCA5A5" : undefined,
          textDecorationThickness: bad ? "1.5px" : undefined,
        }}
      >
        {text}
      </span>
    </div>
  )
}

// ─── WordList ────────────────────────────────────────────

export function WordList({
  tone,
  title,
  words,
}: {
  tone: "pos" | "neg"
  title: string
  words: string[]
}) {
  const cfg = tone === "pos"
    ? { bg: "#F0FDF4", border: "#A7F3D0", color: "#065F46" }
    : { bg: "#FEF7F7", border: "#FECACA", color: "#991B1B" }
  return (
    <div>
      <h5 className="text-[10px] font-bold uppercase tracking-wider mb-2 m-0" style={{ color: cfg.color }}>
        {title}
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {words.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">—</span>
        ) : (
          words.map((w) => (
            <span
              key={w}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
              style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}
            >
              {w}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

// ─── ScoreGauge ──────────────────────────────────────────

export function ScoreGauge({ score }: { score: number }) {
  // Donut com 75% de arco (gauge style)
  const SIZE = 160
  const RADIUS = 64
  const STROKE = 12
  const ARC = 0.75 // 270°
  const circumference = 2 * Math.PI * RADIUS
  const arcLen = circumference * ARC
  const filledLen = arcLen * Math.max(0, Math.min(10, score)) / 10
  const color = score >= 7 ? "#10B981" : score >= 5 ? "#F59E0B" : "#DC2626"

  // -135deg pra abrir o gauge embaixo
  const rotation = -135

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE * 0.85 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: `rotate(${rotation}deg)` }}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={STROKE}
          strokeDasharray={`${arcLen} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${filledLen} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 8 }}>
        <span
          className="font-bold tabular-nums leading-none"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 36,
            color: "#0F172A",
            letterSpacing: "-0.02em",
          }}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-1">
          /10
        </span>
      </div>
    </div>
  )
}

// ─── SubScore ────────────────────────────────────────────

export function SubScore({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(10, value))
  const color = v >= 7 ? "#10B981" : v >= 5 ? "#F59E0B" : "#DC2626"
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-slate-600">{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
          {v.toFixed(1)}<span className="text-slate-400 font-medium">/10</span>
        </span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v * 10}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── ReviewBlock ─────────────────────────────────────────

export function ReviewBlock({
  tone,
  title,
  items,
}: {
  tone: "pos" | "warn" | "neg"
  title: string
  items: Array<{ what: string; body: string }>
}) {
  const cfg =
    tone === "pos"
      ? { bg: "#F0FDF4", border: "#A7F3D0", color: "#065F46" }
      : tone === "warn"
        ? { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" }
        : { bg: "#FEF7F7", border: "#FECACA", color: "#991B1B" }

  return (
    <div className="border rounded-md p-3.5" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <h4 className="text-[12px] font-bold mb-3 m-0" style={{ color: cfg.color }}>
        {title}
      </h4>
      {items.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: cfg.color, opacity: 0.6 }}>
          Sem itens registrados
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[180px_1fr] gap-3">
              <div className="text-[12px] font-semibold leading-snug" style={{ color: cfg.color }}>
                {it.what}
              </div>
              <div className="text-[11.5px] leading-snug" style={{ color: cfg.color, opacity: 0.85 }}>
                {it.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
