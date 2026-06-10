"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ChevronLeft, ChevronRight, LayoutList, Calendar as CalendarIcon, Loader2, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"
import { getCountryMeta } from "./country-chip"
import { TrendsList, PerformersList } from "./side-cards"
import type { BenchmarkEmail, CampaignTrend } from "@/types/campaign-central"

interface CalendarDate {
  id: string
  country: string
  date: string // YYYY-MM-DD
  in_days: number
  name: string
  impact: "high" | "med" | "low"
  category: string | null
  note: string | null
  suggestions_count: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const MONTH_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

function DateTile({ iso }: { iso: string }) {
  const d = new Date(`${iso}T12:00:00Z`)
  return (
    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-[8px] border border-border bg-muted/40 py-2">
      <span className="text-[9px] font-bold tracking-widest text-muted-foreground">
        {MONTH_SHORT[d.getUTCMonth()]}
      </span>
      <span className="text-[22px] font-bold leading-none tabular-nums text-foreground">
        {d.getUTCDate()}
      </span>
      <span className="mt-0.5 text-[9px] text-muted-foreground">{WEEKDAY_SHORT[d.getUTCDay()]}</span>
    </div>
  )
}

function MonthGrid({ dates }: { dates: CalendarDate[] }) {
  const today = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = base.getFullYear()
  const month = base.getMonth()
  const first = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const evs = useMemo(() => {
    const map = new Map<number, CalendarDate[]>()
    for (const d of dates) {
      const dt = new Date(`${d.date}T12:00:00Z`)
      if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month) {
        const k = dt.getUTCDate()
        const arr = map.get(k) ?? []
        arr.push(d)
        map.set(k, arr)
      }
    }
    return map
  }, [dates, year, month])

  const cells: Array<number | null> = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-[15px] font-semibold text-foreground">
          {MONTHS[month]} <span className="font-medium tabular-nums text-muted-foreground">{year}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
            disabled={monthOffset <= 0}
            className="rounded-[6px] border border-border p-1.5 text-muted-foreground disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => setMonthOffset((m) => Math.min(2, m + 1))}
            disabled={monthOffset >= 2}
            className="rounded-[6px] border border-border p-1.5 text-muted-foreground disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isToday =
            day != null &&
            monthOffset === 0 &&
            day === today.getDate()
          const dayEvs = day != null ? (evs.get(day) ?? []) : []
          return (
            <div
              key={i}
              className={`min-h-24 border-b border-r border-border/40 p-1.5 last:border-r-0 ${
                day == null ? "bg-muted/20" : isToday ? "bg-primary/5" : "bg-card"
              }`}
            >
              {day != null && (
                <div
                  className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center text-[12px] tabular-nums ${
                    isToday
                      ? "rounded-full bg-primary px-1.5 font-bold text-white"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  {day}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {dayEvs.map((d) => {
                  const c = getCountryMeta(d.country)
                  const hot = d.impact === "high"
                  return (
                    <div
                      key={d.id}
                      title={`${d.name} · ${c.name}`}
                      className={`flex items-center gap-1 truncate rounded-[5px] border px-1.5 py-0.5 ${
                        hot
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-border bg-muted/40 text-foreground/70"
                      }`}
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.dot }} />
                      <span className="truncate text-[10.5px] font-semibold">{d.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Props {
  trends: CampaignTrend[]
  onCreate: () => void
}

export function CalendarTab({ trends, onCreate }: Props) {
  const [mode, setMode] = useState<"lista" | "grade">("lista")
  const [syncing, setSyncing] = useState(false)
  const { mutate } = useSWRConfig()
  const { toast } = useToast()

  const syncHolidays = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/campaign-central/calendar/sync-holidays", {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      const t = json.totals as { inserted: number; skipped_manual: number; failed: number }
      toast({
        title: "Feriados sincronizados",
        description: `${t.inserted} novos · ${t.skipped_manual} curados preservados${t.failed > 0 ? ` · ${t.failed} falharam` : ""}`,
      })
      await mutate("/api/admin/campaign-central/calendar?days=90")
    } catch (err) {
      toast({
        title: "Falha ao sincronizar feriados",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setSyncing(false)
    }
  }

  const { data: calData, isLoading: calLoading } = useSWR<{ dates: CalendarDate[] }>(
    "/api/admin/campaign-central/calendar?days=90",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  )
  const { data: insightsData } = useSWR<{ benchmark: BenchmarkEmail[] }>(
    "/api/admin/campaign-central/insights",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  )

  const dates = useMemo(() => calData?.dates ?? [], [calData])
  const listDates = dates.filter((d) => d.in_days <= 25)

  const byCountry = useMemo(() => {
    const map = new Map<string, CalendarDate[]>()
    for (const d of listDates) {
      const arr = map.get(d.country) ?? []
      arr.push(d)
      map.set(d.country, arr)
    }
    return Array.from(map.entries()).map(([country, ds]) => ({ country, dates: ds }))
  }, [listDates])

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground/80">
            {mode === "lista" ? "Datas por país · próximos 25 dias" : "Visão de calendário"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={syncHolidays}
              disabled={syncing}
              title="Puxa feriados oficiais de cada país via Nager.Date (não toca nas datas comerciais curadas)"
            >
              {syncing ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <RefreshCw size={13} className="mr-1.5" />
              )}
              Sincronizar feriados
            </Button>
          <div className="inline-flex gap-0.5 rounded-[8px] bg-muted p-0.5">
            {(
              [
                { k: "lista", label: "Lista", Icon: LayoutList },
                { k: "grade", label: "Calendário", Icon: CalendarIcon },
              ] as const
            ).map(({ k, label, Icon }) => {
              const on = mode === k
              return (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] transition-colors ${
                    on ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground"
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              )
            })}
          </div>
          </div>
        </div>

        {calLoading && (
          <div className="flex items-center justify-center gap-2 rounded-[8px] border border-border bg-card py-8 text-muted-foreground">
            <Loader2 size={15} className="animate-spin" /> Carregando datas…
          </div>
        )}

        {!calLoading && mode === "grade" && <MonthGrid dates={dates} />}

        {!calLoading && mode === "lista" && byCountry.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-border bg-card/50 px-6 py-10 text-center text-[13px] text-muted-foreground">
            Nenhuma data comemorativa nos próximos 25 dias pros países das suas lojas.
          </div>
        )}

        {!calLoading &&
          mode === "lista" &&
          byCountry.map((g) => {
            const meta = getCountryMeta(g.country)
            return (
              <div key={g.country} className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <span className="size-2 rounded-full" style={{ background: meta.dot }} />
                  <span className="text-[14px] font-semibold text-foreground">{meta.name}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    · {g.dates.length} data{g.dates.length > 1 ? "s" : ""}
                  </span>
                </header>
                {g.dates.map((d, i) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3.5 px-4 py-3.5 ${
                      i < g.dates.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <DateTile iso={d.date} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-[14.5px] font-semibold text-foreground">{d.name}</span>
                        {d.impact === "high" ? (
                          <Badge variant="warning">Pico de vendas</Badge>
                        ) : (
                          <Badge variant="neutral">Sazonal</Badge>
                        )}
                      </div>
                      {d.note && (
                        <div className="text-[12.5px] leading-snug text-muted-foreground">{d.note}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11.5px] tabular-nums text-muted-foreground">
                        em {d.in_days} dia{d.in_days !== 1 ? "s" : ""}
                      </span>
                      {d.suggestions_count > 0 ? (
                        <span className="text-[11.5px] font-semibold text-primary">
                          {d.suggestions_count} sugest{d.suggestions_count > 1 ? "ões" : "ão"} na fila
                        </span>
                      ) : (
                        <button
                          onClick={onCreate}
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-primary"
                        >
                          <Plus size={12} /> Criar campanha
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
      </div>

      {/* Rail de insights */}
      <div>
        <TrendsList trends={trends} />
        <PerformersList performers={insightsData?.benchmark ?? []} />
      </div>
    </div>
  )
}
