"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Search, ExternalLink, ChevronDown, ChevronRight, FileText } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface BriefingRow {
  store_id: string
  store_name: string
  store_url: string | null
  platform: string | null
  niche: string | null
  is_active: boolean
  briefing_version: number | null
  briefing_source: string | null
  briefing_created_at: string | null
  marca: Record<string, unknown> | null
  briefing: Record<string, unknown> | null
}

export default function BriefingsOverviewPage() {
  const { data, isLoading } = useSWR<{ data: { total: number; with_briefing: number; rows: BriefingRow[] } }>(
    "/api/admin/briefings",
    fetcher,
  )

  const rows = data?.data?.rows ?? []
  const total = data?.data?.total ?? 0
  const withBriefing = data?.data?.with_briefing ?? 0

  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "with" | "without">("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "with" && !(r.marca || r.briefing)) return false
      if (filter === "without" && (r.marca || r.briefing)) return false
      if (!q) return true
      return (
        r.store_name.toLowerCase().includes(q) ||
        (r.niche ?? "").toLowerCase().includes(q) ||
        JSON.stringify(r.marca ?? {}).toLowerCase().includes(q) ||
        JSON.stringify(r.briefing ?? {}).toLowerCase().includes(q)
      )
    })
  }, [rows, query, filter])

  const toggle = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  return (
    <div className="space-y-5 max-w-[1200px]">
      <PageHeader
        title="Briefings das Lojas"
        description={`${withBriefing} de ${total} lojas com briefing gerado.`}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[400px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por loja, nicho, conteúdo..."
            className="crm-input w-full pl-8"
          />
        </div>
        <div className="flex items-center gap-1 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
          {(["all", "with", "without"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "h-7 px-3 rounded-[5px] text-[12px] font-medium transition-colors",
                filter === f
                  ? "bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              {f === "all" ? "Todas" : f === "with" ? "Com briefing" : "Sem briefing"}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-slate-500 dark:text-white/45 ml-auto">
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="py-10 text-center text-[13px] text-slate-500 dark:text-white/45">
            Carregando…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-slate-500 dark:text-white/45">
            Nenhuma loja encontrada.
          </div>
        )}
        {filtered.map((r) => {
          const isOpen = expanded.has(r.store_id)
          const hasBriefing = !!(r.marca || r.briefing)
          return (
            <div
              key={r.store_id}
              className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]"
            >
              <button
                type="button"
                onClick={() => toggle(r.store_id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                      {r.store_name}
                    </span>
                    {r.niche && (
                      <span className="text-[10px] uppercase tracking-wide bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55 px-1.5 py-0.5 rounded">
                        {r.niche}
                      </span>
                    )}
                    {!r.is_active && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200 px-1.5 py-0.5 rounded">
                        Inativa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-white/45">
                    {r.platform && <span>{r.platform}</span>}
                    {r.store_url && (
                      <a
                        href={r.store_url.startsWith("http") ? r.store_url : `https://${r.store_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-white/70"
                      >
                        {r.store_url}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {hasBriefing ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <FileText className="h-3 w-3" />
                      v{r.briefing_version}
                      {r.briefing_source && (
                        <span className="text-slate-400 dark:text-white/35">
                          · {r.briefing_source}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-white/30">
                      Sem briefing
                    </span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 dark:border-white/[0.06] px-4 py-3 space-y-3">
                  {hasBriefing ? (
                    <>
                      {r.marca && Object.keys(r.marca).length > 0 && (
                        <Section title="Marca" data={r.marca} />
                      )}
                      {r.briefing && Object.keys(r.briefing).length > 0 && (
                        <Section title="Briefing" data={r.briefing} />
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-white/35 pt-1">
                        {r.briefing_created_at && (
                          <span>
                            Gerado em{" "}
                            {new Date(r.briefing_created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        <a
                          href={`/admin/stores/${r.store_id}/pesquisa`}
                          className="text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                        >
                          Abrir pesquisa & diagnóstico →
                        </a>
                      </div>
                    </>
                  ) : (
                    <p className="text-[12px] text-slate-500 dark:text-white/45">
                      Esta loja ainda não tem briefing gerado.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
        {title}
      </h3>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-white/35">
              {k.replace(/_/g, " ")}
            </dt>
            <dd className="text-[12px] text-slate-800 dark:text-white/85 break-words">
              {formatValue(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—"
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return "—"
    if (typeof v[0] === "string") return (v as string[]).join(", ")
    if (typeof v[0] === "object") {
      return v
        .map((item) => {
          if (item && typeof item === "object") {
            return Object.entries(item as Record<string, unknown>)
              .map(([k, val]) => `${k}: ${val}`)
              .join(" — ")
          }
          return String(item)
        })
        .join(" | ")
    }
    return v.map(String).join(", ")
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${val}`)
      .join(", ")
  }
  return String(v)
}
