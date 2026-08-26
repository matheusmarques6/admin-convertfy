"use client"

/**
 * Charts SVG puros do Dashboard Operacional — geometria do protótipo
 * (Claude Design ago/2026). Sem lib de chart: são 3 formas simples e o
 * SVG responde ao tema via currentColor/tokens.
 */

interface SparkProps {
  data: number[]
  color?: string
  w?: number
  h?: number
  className?: string
}

export function Spark({ data, color, w = 92, h = 30, className }: SparkProps) {
  if (data.length < 2) return null
  const mn = Math.min(...data)
  const mx = Math.max(...data)
  const r = mx - mn || 1
  const pts = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1)}`,
    )
    .join(" ")
  return (
    <svg width={w} height={h} className={className} style={{ display: "block" }} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color ?? "currentColor"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Área "atual vs anterior" (anterior tracejada). Valores livres. */
export function AreaCompareChart({
  atual,
  anterior,
  h = 170,
  xLabels,
}: {
  atual: number[]
  anterior: number[]
  h?: number
  xLabels: string[]
}) {
  const all = [...atual, ...anterior]
  if (atual.length < 2) return null
  const mn = Math.min(...all) * 0.92
  const mx = Math.max(...all) * 1.04 || 1
  const r = mx - mn || 1
  const line = (d: number[]) =>
    d
      .map(
        (v, i) =>
          `${((i / (d.length - 1)) * 100).toFixed(2)},${(100 - ((v - mn) / r) * 100).toFixed(2)}`,
      )
      .join(" ")
  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: h, display: "block" }}
        aria-hidden
      >
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--ops-border)" strokeWidth="0.4" />
        ))}
        <polygon
          points={`0,100 ${line(atual)} 100,100`}
          fill="var(--ops-accent)"
          opacity="0.10"
        />
        {anterior.length >= 2 && (
          <polyline
            points={line(anterior)}
            fill="none"
            stroke="var(--ops-mut)"
            strokeWidth="1"
            strokeDasharray="2.5 2.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={line(atual)}
          fill="none"
          stroke="var(--ops-accent)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-[var(--ops-mut)] tabular-nums">
        {xLabels.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
    </div>
  )
}

/** Multi-linha das semanas (open/click/conv), cada série normalizada. */
export function WeekLines({
  labels,
  series,
  h = 150,
}: {
  labels: string[]
  series: Array<{ label: string; color: string; values: number[] }>
  h?: number
}) {
  const line = (vals: number[]) => {
    const mn = Math.min(...vals) * 0.9
    const mx = Math.max(...vals) * 1.06 || 1
    const r = mx - mn || 1
    return vals
      .map(
        (v, i) =>
          `${((i / (vals.length - 1)) * 100).toFixed(1)},${(100 - ((v - mn) / r) * 100).toFixed(1)}`,
      )
      .join(" ")
  }
  return (
    <div>
      <div className="flex gap-3 mb-2 flex-wrap">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-[var(--ops-sec)]">
            <span className="w-3 h-[2.5px] rounded-sm" style={{ background: s.color }} />
            {s.label}{" "}
            <strong className="font-semibold text-[var(--ops-title)] tabular-nums">
              {s.values.length > 0
                ? s.values[s.values.length - 1].toFixed(2).replace(".", ",")
                : "—"}
            </strong>
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: h, display: "block" }}
        aria-hidden
      >
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--ops-border)" strokeWidth="0.4" />
        ))}
        {series.map(
          (s) =>
            s.values.length >= 2 && (
              <polyline
                key={s.label}
                points={line(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
              />
            ),
        )}
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-[var(--ops-mut)]">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  )
}
