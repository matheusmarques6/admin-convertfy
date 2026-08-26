"use client"

/**
 * Seletor de período do Dashboard Operacional (design ago/2026):
 * presets + calendário de range + toggle "vs anterior".
 *
 * O valor SEMPRE carrega start/end reais — o transporte pras APIs é
 * `?period=&start=&end=`, então "Personalizado" funciona de verdade
 * (o dashboard antigo mandava period=custom sem datas e todas as
 * rotas silenciosamente devolviam 30d).
 */

import { useMemo, useState } from "react"
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

export interface OpsPeriodValue {
  /** Preset simples ("7d"/"30d"/"90d"/"today") ou "custom". */
  period: string
  start: Date
  end: Date
  compare: boolean
  /** Rótulo humano do preset (null = range manual). */
  presetLabel: string | null
}

const MESES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const addD = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const sameD = (a: Date | null, b: Date | null) =>
  Boolean(a && b && a.toDateString() === b.toDateString())
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const fmtDia = (d: Date) => `${d.getDate()} ${MESES3[d.getMonth()]}`

export function defaultOpsPeriod(): OpsPeriodValue {
  const today = startOfDay(new Date())
  return {
    period: "30d",
    start: addD(today, -29),
    end: today,
    compare: true,
    presetLabel: "Últimos 30 dias",
  }
}

/** Query string canônica pras rotas do dashboard. */
export function periodQuery(v: OpsPeriodValue): string {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return `period=${encodeURIComponent(v.period)}&start=${iso(v.start)}&end=${iso(v.end)}`
}

interface DateControlProps {
  value: OpsPeriodValue
  onChange: (v: OpsPeriodValue) => void
}

export function DateControl({ value, onChange }: DateControlProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [picking, setPicking] = useState(false)

  const presets: Array<[string, string, Date, Date]> = useMemo(() => {
    const y = today.getFullYear()
    const m = today.getMonth()
    const quarterStart = new Date(y, Math.floor(m / 3) * 3, 1)
    return [
      ["Hoje", "today", today, today],
      ["Últimos 7 dias", "7d", addD(today, -6), today],
      ["Últimos 30 dias", "30d", addD(today, -29), today],
      ["Últimos 90 dias", "90d", addD(today, -89), today],
      ["Este mês", "custom", new Date(y, m, 1), today],
      ["Mês passado", "custom", new Date(y, m - 1, 1), new Date(y, m, 0)],
      ["Este trimestre", "custom", quarterStart, today],
    ]
  }, [today])

  const clickDay = (d: Date) => {
    if (!picking) {
      onChange({ ...value, period: "custom", presetLabel: null, start: d, end: d })
      setPicking(true)
    } else {
      const s = value.start
      onChange(
        d < s
          ? { ...value, period: "custom", presetLabel: null, start: d, end: s }
          : { ...value, period: "custom", presetLabel: null, start: s, end: d },
      )
      setPicking(false)
    }
  }

  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const firstDow = new Date(y, m, 1).getDay()
  const nDays = new Date(y, m + 1, 0).getDate()
  const cells: Array<Date | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: nDays }, (_, i) => new Date(y, m, i + 1)),
  ]

  const label =
    value.presetLabel ?? `${fmtDia(value.start)} – ${fmtDia(value.end)}, ${value.end.getFullYear()}`

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 h-[34px] px-[13px] rounded-lg border shadow-sm",
          "bg-[var(--ops-card)]",
          open ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]",
        )}
      >
        <span className="flex text-[var(--ops-sec)]">
          <Icon icon={Calendar} customSize={14} />
        </span>
        <span className="text-[12.5px] font-medium text-[var(--ops-title)] tabular-nums">{label}</span>
        {value.presetLabel && (
          <span className="text-[11px] text-[var(--ops-mut)] tabular-nums hidden sm:inline">
            · {fmtDia(value.start)} – {fmtDia(value.end)}
          </span>
        )}
        {value.compare && (
          <span className="text-[10px] font-semibold text-[var(--ops-sec)] bg-[var(--ops-track)] rounded-[5px] px-[7px] py-0.5">
            vs anterior
          </span>
        )}
        <span
          className={cn(
            "flex text-[var(--ops-mut)] transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <Icon icon={ChevronDown} customSize={12} />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-[calc(100%+6px)] right-0 z-[75] flex rounded-[11px] border border-[var(--ops-border)] bg-[var(--ops-card)] shadow-2xl overflow-hidden">
            {/* Presets */}
            <div className="w-[158px] border-r border-[var(--ops-border)] p-2 flex flex-col gap-0.5">
              <div className="px-2 pt-0.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--ops-mut)]">
                Período
              </div>
              {presets.map(([l, p, s, e]) => {
                const on = value.presetLabel === l
                return (
                  <button
                    key={l}
                    onClick={() => {
                      onChange({ ...value, period: p, presetLabel: l, start: s, end: e })
                      setPicking(false)
                    }}
                    className={cn(
                      "text-left px-2.5 py-[7px] rounded-md text-[12px]",
                      on
                        ? "bg-[var(--ops-track)] font-semibold text-[var(--ops-title)]"
                        : "font-medium text-[var(--ops-text)] hover:bg-[var(--ops-hover)]",
                    )}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
            {/* Calendário */}
            <div className="p-3.5 w-[262px]">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setCursor(new Date(y, m - 1, 1))}
                  aria-label="Mês anterior"
                  className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]"
                >
                  <Icon icon={ChevronLeft} customSize={14} />
                </button>
                <span className="text-[12.5px] font-semibold text-[var(--ops-title)]">
                  {MESES_FULL[m]} {y}
                </span>
                <button
                  onClick={() => setCursor(new Date(y, m + 1, 1))}
                  aria-label="Próximo mês"
                  className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]"
                >
                  <Icon icon={ChevronRight} customSize={14} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-px">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <span
                    key={i}
                    className="text-center text-[10px] font-semibold text-[var(--ops-mut)] py-[3px]"
                  >
                    {d}
                  </span>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <span key={i} />
                  const isS = sameD(d, value.start)
                  const isE = sameD(d, value.end)
                  const inR = d >= value.start && d <= value.end
                  const fut = d > today
                  return (
                    <button
                      key={i}
                      disabled={fut}
                      onClick={() => clickDay(d)}
                      className={cn(
                        "h-7 text-[11.5px] tabular-nums",
                        isS || isE
                          ? "rounded-[7px] bg-[var(--ops-accent)] text-[var(--ops-on-accent)] font-bold"
                          : inR
                            ? "rounded-[5px] bg-[var(--ops-track)] text-[var(--ops-text)] font-medium"
                            : "rounded-[5px] text-[var(--ops-text)] font-medium hover:bg-[var(--ops-hover)]",
                        fut && "opacity-40 cursor-default hover:bg-transparent text-[var(--ops-mut)]",
                      )}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2.5 mt-2.5 pt-2.5 border-t border-[var(--ops-border)]">
                <button
                  onClick={() => onChange({ ...value, compare: !value.compare })}
                  className="flex items-center gap-[7px]"
                >
                  <span
                    className={cn(
                      "relative inline-block w-[30px] h-[17px] rounded-full transition-colors",
                      value.compare ? "bg-[var(--ops-accent)]" : "bg-[var(--ops-track)]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-[13px] h-[13px] rounded-full bg-white shadow transition-all",
                        value.compare ? "left-[15px]" : "left-0.5",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[11.5px]",
                      value.compare ? "text-[var(--ops-text)]" : "text-[var(--ops-mut)]",
                    )}
                  >
                    vs anterior
                  </span>
                </button>
                <div className="flex-1" />
                <span className="text-[10.5px] text-[var(--ops-mut)] tabular-nums">
                  {picking ? "clique no dia final…" : `${fmtDia(value.start)} – ${fmtDia(value.end)}`}
                </span>
                <button
                  onClick={() => {
                    setOpen(false)
                    setPicking(false)
                  }}
                  className="h-[26px] px-3 rounded-md bg-[var(--ops-accent)] text-[var(--ops-on-accent)] text-[11px] font-semibold"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
