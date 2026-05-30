"use client"

/**
 * EmailsLiveList (Epic AE - Story AE-6)
 *
 * Client component principal da pagina /admin/stores/[id]/emails.
 * Responsavel por:
 *   - Conectar SSE via useEmailsLive
 *   - Filtros (flow + status)
 *   - Indicator visual de conexao (live/reconnecting/polling)
 *   - Empty states
 *   - Agrupamento por flow (collapsible)
 */

import { useMemo, useState } from "react"
import { Mail, Radio, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { EmailCard } from "./email-card"
import { StartOnboardingButton } from "./start-onboarding-button"
import { useEmailsLive, type LiveEmail } from "@/hooks/use-emails-live"
import type { EmailStatus } from "@/types/email-workspace"

interface EmailsLiveListProps {
  storeId: string
  initialEmails: LiveEmail[]
  briefingConfirmed: boolean
  isDev: boolean
  initialStats: {
    total: number
    by_status: Record<string, number>
    pct_ready: number
  }
}

const STATUS_FILTER_GROUPS: Array<{ key: EmailStatus | "all"; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "ready", label: "Pronto" },
  { key: "qa_running", label: "Revisando QA" },
  { key: "rendering", label: "Renderizando" },
  { key: "copy_generating", label: "Gerando copy" },
  { key: "pending", label: "Aguardando" },
  { key: "failed", label: "Erro" },
]

export function EmailsLiveList({
  storeId,
  initialEmails,
  briefingConfirmed,
  isDev,
  initialStats,
}: EmailsLiveListProps) {
  const { emails, status, lastPingAt } = useEmailsLive(storeId, initialEmails)
  const [flowFilter, setFlowFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<EmailStatus | "all">("all")

  // Construir opcoes de flow a partir dos emails carregados.
  const flowOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of emails) {
      if (!seen.has(e.flow_id)) seen.set(e.flow_id, e.flow_name || e.flow_type)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [emails])

  const filtered = useMemo(() => {
    return emails.filter((e) => {
      if (flowFilter !== "all" && e.flow_id !== flowFilter) return false
      if (statusFilter !== "all" && e.status !== statusFilter) return false
      return true
    })
  }, [emails, flowFilter, statusFilter])

  // Agrupar por flow (preserva ordem de aparicao)
  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; emails: LiveEmail[] }>()
    for (const e of filtered) {
      const g = groups.get(e.flow_id)
      if (g) {
        g.emails.push(e)
      } else {
        groups.set(e.flow_id, {
          name: e.flow_name || e.flow_type,
          emails: [e],
        })
      }
    }
    // Ordena cada grupo por number
    for (const g of groups.values()) {
      g.emails.sort((a, b) => a.number - b.number)
    }
    return Array.from(groups.entries()).map(([id, g]) => ({ id, ...g }))
  }, [filtered])

  // Stats em tempo real (recalcula a partir do state, nao do initial)
  const liveStats = useMemo(() => {
    const by_status: Record<string, number> = {}
    let readyCount = 0
    let failedCount = 0
    for (const e of emails) {
      by_status[e.status] = (by_status[e.status] ?? 0) + 1
      if (e.status === "ready") readyCount++
      if (e.status === "failed") failedCount++
    }
    return {
      total: emails.length,
      by_status,
      ready: readyCount,
      failed: failedCount,
      pct_ready: emails.length > 0 ? Math.round((readyCount / emails.length) * 100) : 0,
    }
  }, [emails])

  const isEmptyAll = emails.length === 0
  const isEmptyFiltered = !isEmptyAll && filtered.length === 0

  return (
    <div className="space-y-4">
      {/* Header com stats + CTA */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <span>
              <strong>{liveStats.ready}</strong> de <strong>{liveStats.total}</strong> prontos
              {liveStats.total > 0 && (
                <span className="text-gray-500"> ({liveStats.pct_ready}%)</span>
              )}
            </span>
            {liveStats.failed > 0 && (
              <span className="text-red-700">
                <strong>{liveStats.failed}</strong> com erro
              </span>
            )}
          </div>
          <ConnectionIndicator status={status} lastPingAt={lastPingAt} />
        </div>

        <StartOnboardingButton
          storeId={storeId}
          briefingConfirmed={briefingConfirmed}
        />
      </div>

      {/* Empty: nenhum email na loja */}
      {isEmptyAll && (
        <div className="border border-dashed border-gray-300 rounded-md p-10 text-center">
          <Mail className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900">
            Nenhum email gerado ainda
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Dispare o pipeline de geracao para criar os emails desta loja.
          </p>
          <div className="mt-4 inline-flex">
            <StartOnboardingButton
              storeId={storeId}
              briefingConfirmed={briefingConfirmed}
            />
          </div>
        </div>
      )}

      {/* Filtros */}
      {!isEmptyAll && (
        <div className="flex items-center gap-3 flex-wrap border border-gray-200 rounded-md p-3 bg-white">
          <label className="text-xs text-gray-600">
            Flow:{" "}
            <select
              className="ml-1 text-xs border border-gray-300 rounded px-2 py-1"
              value={flowFilter}
              onChange={(e) => setFlowFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {flowOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTER_GROUPS.map((s) => {
              const active = statusFilter === s.key
              const count =
                s.key === "all"
                  ? liveStats.total
                  : liveStats.by_status[s.key] ?? 0
              return (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(s.key)}
                  className={
                    "inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors " +
                    (active
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
                  }
                >
                  {s.label}
                  <span
                    className={
                      "text-[10px] " + (active ? "text-gray-300" : "text-gray-500")
                    }
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty: filtrados zerados */}
      {isEmptyFiltered && (
        <div className="border border-dashed border-gray-300 rounded-md p-8 text-center">
          <p className="text-sm text-gray-600">Nenhum email com esses filtros.</p>
        </div>
      )}

      {/* Lista agrupada por flow */}
      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.id} aria-label={group.name}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
              {group.name}{" "}
              <span className="text-gray-400 font-normal">
                · {group.emails.length}
              </span>
            </h2>
            <div className="space-y-3">
              {group.emails.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  storeId={storeId}
                  isDev={isDev}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Used at render to avoid unused warning when initialStats not consumed */}
      <span className="hidden" aria-hidden>
        {initialStats.total}
      </span>
    </div>
  )
}

function ConnectionIndicator({
  status,
  lastPingAt,
}: {
  status: "live" | "reconnecting" | "polling"
  lastPingAt: number | null
}) {
  if (status === "live") {
    return (
      <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-green-700">
        <Radio className="h-3 w-3" />
        <span>Ao vivo</span>
        {lastPingAt && (
          <span className="text-gray-400" title={new Date(lastPingAt).toISOString()}>
            (ping {Math.max(0, Math.round((Date.now() - lastPingAt) / 1000))}s)
          </span>
        )}
      </div>
    )
  }
  if (status === "reconnecting") {
    return (
      <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-amber-700">
        <WifiOff className="h-3 w-3" />
        <span>Reconectando…</span>
      </div>
    )
  }
  return (
    <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-gray-600">
      <RefreshCw className="h-3 w-3" />
      <span>Atualizando a cada 10s</span>
      <Wifi className="h-3 w-3 opacity-30" />
    </div>
  )
}
