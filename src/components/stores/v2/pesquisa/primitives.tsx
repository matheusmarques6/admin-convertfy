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
 *
 * ICP avançado (redesign do Pilar 3):
 * AwarenessLadder        · distribuição de consciência (Schwartz) em 5 colunas
 * StarvingCrowdScorecard · 4 sub-scores /5 + score total /20
 * UniqueMechanism        · callout do mecanismo único (headline + body)
 * ObjectionList          · 5 objeções/tratamentos + botão "Re-gerar com IA"
 * VocabularyList         · vocabulário literal (tag de tipo + canal + frase)
 * renderEmphasis         · markdown-leve (**negrito**, *itálico*) p/ prosa
 */

import { Loader2, Sparkles } from "lucide-react"
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

// ════════════════════════════════════════════════════════
// ICP avançado — blocos analíticos do redesign (Pilar 3)
// ════════════════════════════════════════════════════════

// Tokens índigo (acento "brand" da Pesquisa — igual ao header/Pull/PillarTile)
const INDIGO = { bg: "#EEF0FB", border: "#C7CDEF", color: "#2137B6", accent: "#4E62D8" }

// renderEmphasis — markdown-leve para a prosa dos blocos (mecanismo, implicação).
// Suporta **negrito** e *itálico*/_itálico_. Seguro p/ texto puro (no-op sem marcas).
export function renderEmphasis(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] != null) {
      parts.push(
        <strong key={k++} className="font-semibold text-slate-900">{m[1]}</strong>,
      )
    } else {
      parts.push(<em key={k++}>{m[2] ?? m[3]}</em>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// ─── IcpBlockHeader (interno) ────────────────────────────

function IcpBlockHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h4
          className="text-[15px] font-bold text-slate-900 m-0"
          style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "-0.01em" }}
        >
          {title}
        </h4>
        {subtitle && (
          <p className="text-[11px] text-slate-500 m-0 mt-0.5 leading-snug">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// Wrapper de bloco avançado: separador superior + espaçamento consistente.
function IcpBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 mt-4 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      {children}
    </div>
  )
}

// ─── AwarenessLadder ─────────────────────────────────────

export function AwarenessLadder({
  dominant,
  levels,
  copyImplication,
}: {
  dominant: string
  levels: { key: string; label: string; pct: number }[]
  copyImplication: string
}) {
  const norm = (s: string) => s.trim().toLowerCase()
  const maxPct = Math.max(1, ...levels.map((l) => l.pct))
  return (
    <IcpBlock>
      <IcpBlockHeader
        title="Nível de consciência"
        subtitle="Onde está a maioria do tráfego quando vê a marca pela 1ª vez"
        right={
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
            style={{ background: INDIGO.bg, color: INDIGO.color, border: `1px solid ${INDIGO.border}` }}
          >
            Dominante · {dominant}
          </span>
        }
      />
      <div className="grid grid-cols-5 gap-2">
        {levels.map((l) => {
          const isDom = norm(l.label) === norm(dominant) || norm(l.key) === norm(dominant)
          return (
            <div key={l.key} className="flex flex-col items-center gap-1.5">
              <span
                className="text-[13px] font-bold tabular-nums"
                style={{ color: isDom ? INDIGO.color : "#475569" }}
              >
                {l.pct}%
              </span>
              <div
                className="w-full h-14 rounded-md flex items-end overflow-hidden"
                style={{ background: "rgba(0,0,0,0.04)" }}
              >
                <div
                  className="w-full transition-all"
                  style={{
                    height: `${(l.pct / maxPct) * 100}%`,
                    background: isDom ? INDIGO.accent : "#CBD5E1",
                  }}
                />
              </div>
              <span
                className="text-[9px] font-semibold uppercase tracking-wide text-center leading-tight"
                style={{ color: isDom ? INDIGO.color : "#94A3B8" }}
              >
                {l.label}
              </span>
            </div>
          )
        })}
      </div>
      {copyImplication && (
        <div
          className="mt-3 rounded-md border-l-[3px] pl-3 py-2 pr-3"
          style={{ borderColor: INDIGO.accent, background: INDIGO.bg }}
        >
          <div
            className="text-[9.5px] font-bold uppercase tracking-wider mb-0.5"
            style={{ color: INDIGO.color }}
          >
            Implicação para copy
          </div>
          <div className="text-[12px] text-slate-700 leading-snug">
            {renderEmphasis(copyImplication)}
          </div>
        </div>
      )}
    </IcpBlock>
  )
}

// ─── StarvingCrowdScorecard ──────────────────────────────

export function StarvingCrowdScorecard({
  verdict,
  scores,
  total,
}: {
  verdict: string
  scores: { key: string; label: string; value: number; note: string }[]
  total: number
}) {
  const v = verdict.toLowerCase()
  const vc =
    v.includes("hot") || v.includes("quente")
      ? { bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" }
      : v.includes("cold") || v.includes("frio")
        ? { bg: "#F8FAFC", border: "#E2E8F0", color: "#475569" }
        : { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" }
  return (
    <IcpBlock>
      <IcpBlockHeader
        title="Starving Crowd"
        subtitle="Quão faminta está essa audiência por uma solução"
        right={
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
            style={{ background: vc.bg, color: vc.color, border: `1px solid ${vc.border}` }}
          >
            Veredito · {verdict}
          </span>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
        {scores.map((s) => {
          const value = Math.max(0, Math.min(5, Math.round(s.value)))
          return (
            <div
              key={s.key}
              className="rounded-md border p-2.5 flex flex-col gap-1"
              style={{ borderColor: "rgba(0,0,0,0.06)", background: "#FBFBFD" }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
                {s.label}
              </span>
              <div className="flex items-baseline gap-0.5">
                <span
                  className="text-[18px] font-bold tabular-nums leading-none"
                  style={{ fontFamily: "'Playfair Display', serif", color: INDIGO.color }}
                >
                  {s.value}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">/ 5</span>
              </div>
              <div className="flex gap-0.5 mt-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full"
                    style={{ background: i <= value ? INDIGO.accent : "rgba(0,0,0,0.08)" }}
                  />
                ))}
              </div>
              {s.note && (
                <span className="text-[9.5px] text-slate-500 leading-tight mt-0.5">{s.note}</span>
              )}
            </div>
          )
        })}
        <div
          className="rounded-md border p-2.5 flex flex-col items-center justify-center gap-0.5 md:min-w-[92px]"
          style={{ borderColor: INDIGO.border, background: INDIGO.bg }}
        >
          <span
            className="text-[9px] font-bold uppercase tracking-wide text-center"
            style={{ color: INDIGO.color }}
          >
            Score total
          </span>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-[24px] font-bold tabular-nums leading-none"
              style={{ fontFamily: "'Playfair Display', serif", color: INDIGO.color }}
            >
              {total}
            </span>
            <span className="text-[11px] font-medium" style={{ color: INDIGO.color, opacity: 0.6 }}>
              / 20
            </span>
          </div>
        </div>
      </div>
    </IcpBlock>
  )
}

// ─── UniqueMechanism ─────────────────────────────────────

export function UniqueMechanism({
  headline,
  body,
}: {
  headline: string
  body: string
}) {
  return (
    <IcpBlock>
      <IcpBlockHeader title="Mecanismo único" />
      <div
        className="rounded-md border-l-[3px] pl-4 pr-4 py-3"
        style={{ borderColor: INDIGO.accent, background: INDIGO.bg }}
      >
        {headline && (
          <div
            className="text-[13px] font-bold text-slate-900 mb-1.5"
            style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "-0.01em" }}
          >
            {headline}
          </div>
        )}
        <div className="text-[12.5px] text-slate-700" style={{ lineHeight: 1.65 }}>
          {renderEmphasis(body)}
        </div>
      </div>
    </IcpBlock>
  )
}

// ─── ObjectionList ───────────────────────────────────────

export function ObjectionList({
  items,
  onRegenerate,
  regenerating,
}: {
  items: { objection: string; treatment: string }[]
  onRegenerate?: () => void
  regenerating?: boolean
}) {
  const red = { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
  return (
    <IcpBlock>
      <IcpBlockHeader
        title="Objeções principais"
        subtitle="As 5 dúvidas que ela trava antes de comprar — e como tratar"
        right={
          onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-semibold disabled:opacity-60"
              style={{ borderColor: INDIGO.border, color: INDIGO.color, background: INDIGO.bg }}
            >
              {regenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Re-gerar com IA
            </button>
          )
        }
      />
      {items.length === 0 ? (
        <div
          className="rounded-md border border-dashed p-4 text-center text-[11.5px] text-slate-500"
          style={{ borderColor: "rgba(0,0,0,0.10)" }}
        >
          Nenhuma objeção mapeada ainda. Use <strong className="font-semibold text-slate-700">Re-gerar com IA</strong> para
          gerar a partir da persona e do contexto da loja.
        </div>
      ) : (
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-md border p-3"
            style={{ borderColor: "rgba(0,0,0,0.06)", background: "#FBFBFD" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex gap-2.5 min-w-0">
                <span
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0"
                  style={{ background: red.bg, color: red.color, border: `1px solid ${red.border}` }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                    style={{ color: red.color }}
                  >
                    Objeção
                  </div>
                  <div
                    className="text-[12px] text-slate-800 italic leading-snug"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    &ldquo;{it.objection}&rdquo;
                  </div>
                </div>
              </div>
              <div
                className="min-w-0 md:border-l md:pl-3"
                style={{ borderColor: "rgba(0,0,0,0.06)" }}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5 text-slate-500">
                  Tratamento
                </div>
                <div className="text-[11.5px] text-slate-600 leading-snug">{it.treatment}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </IcpBlock>
  )
}

// ─── VocabularyList ──────────────────────────────────────

export function VocabularyList({
  items,
}: {
  items: { type: "Dor" | "Desejo" | "Objeção" | "Marca"; channel: string; quote: string }[]
}) {
  const typeCfg: Record<string, { bg: string; border: string; color: string }> = {
    Dor: { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" },
    Desejo: { bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" },
    Objeção: { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" },
    Marca: { bg: "#EEF0FB", border: "#C7CDEF", color: "#2137B6" },
  }
  return (
    <IcpBlock>
      <IcpBlockHeader
        title="Vocabulário literal"
        subtitle="Frases que a cliente diria com as palavras dela"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((it, i) => {
          const c = typeCfg[it.type] ?? typeCfg.Marca
          return (
            <div
              key={i}
              className="rounded-md border p-3 flex flex-col gap-1.5"
              style={{ borderColor: "rgba(0,0,0,0.06)", background: "#FBFBFD" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
                >
                  {it.type}
                </span>
                <span className="text-[9.5px] text-slate-400 font-medium">{it.channel}</span>
              </div>
              <div
                className="text-[12.5px] text-slate-800 italic leading-snug"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                &ldquo;{it.quote}&rdquo;
              </div>
            </div>
          )
        })}
      </div>
    </IcpBlock>
  )
}
