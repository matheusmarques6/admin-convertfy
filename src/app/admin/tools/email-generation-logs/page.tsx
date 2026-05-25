"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  SkipForward,
  FileText,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EmailGenerationRun, GenerationRunStatus } from "@/types/email-generation"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_CONFIG: Record<
  GenerationRunStatus,
  { label: string; variant: "positive" | "negative" | "warning" | "neutral" | "info"; icon: typeof CheckCircle2 }
> = {
  success: { label: "Sucesso", variant: "positive", icon: CheckCircle2 },
  error: { label: "Erro", variant: "negative", icon: AlertCircle },
  running: { label: "Rodando", variant: "info", icon: Clock },
  skipped: { label: "Pulado", variant: "neutral", icon: SkipForward },
}

const AGENT_LABELS: Record<string, string> = {
  seed: "Seed",
  copy: "Copy",
  image: "Imagens",
  html: "HTML",
}

type FilterTab = "all" | "errors" | "running"

export default function EmailGenerationLogsPage() {
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [storeFilter, setStoreFilter] = useState("")
  const [agentFilter, setAgentFilter] = useState("")
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pageSize = 50

  const statusParam =
    filterTab === "errors"
      ? "&status=error"
      : filterTab === "running"
        ? "&status=running"
        : ""
  const storeParam = storeFilter ? `&store_id=${storeFilter}` : ""
  const agentParam = agentFilter ? `&agent=${agentFilter}` : ""
  const offset = (page - 1) * pageSize

  const { data, isLoading } = useSWR<{ runs: EmailGenerationRun[]; total: number }>(
    `/api/admin/email-generation-runs?limit=${pageSize}&offset=${offset}${statusParam}${storeParam}${agentParam}`,
    fetcher,
  )

  const runs = data?.runs ?? []
  const total = data?.total ?? 0

  const metrics = useMemo(() => {
    if (!runs.length)
      return { total: 0, errors: 0, errorRate: 0, totalCost: 0, avgDuration: 0 }
    const errors = runs.filter((r) => r.status === "error").length
    const totalCost = runs.reduce((s, r) => s + (r.cost_cents || 0), 0)
    const avgDuration =
      runs.reduce((s, r) => s + (r.duration_ms || 0), 0) / runs.length
    return {
      total: total,
      errors,
      errorRate: runs.length > 0 ? (errors / runs.length) * 100 : 0,
      totalCost,
      avgDuration,
    }
  }, [runs, total])

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="Logs de Geração de Emails"
        description="Acompanhe execuções, erros e métricas dos agentes de geração."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total de runs" value={metrics.total.toLocaleString("pt-BR")} />
        <MetricCard
          label="Taxa de erro"
          value={`${metrics.errorRate.toFixed(1)}%`}
          variant={metrics.errorRate > 10 ? "negative" : "neutral"}
        />
        <MetricCard
          label="Custo total"
          value={`$${(metrics.totalCost / 100).toFixed(2)}`}
        />
        <MetricCard
          label="Tempo médio"
          value={`${(metrics.avgDuration / 1000).toFixed(1)}s`}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SegmentedTabs value={filterTab} onValueChange={(v) => { setFilterTab(v as FilterTab); setPage(1) }}>
          <SegmentedTabItem value="all">Todos</SegmentedTabItem>
          <SegmentedTabItem value="errors">Erros</SegmentedTabItem>
          <SegmentedTabItem value="running">Em andamento</SegmentedTabItem>
        </SegmentedTabs>

        <div className="flex items-center gap-2">
          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setPage(1) }}
            className="crm-input text-[12px] h-8"
          >
            <option value="">Todos agentes</option>
            <option value="seed">Seed</option>
            <option value="copy">Copy</option>
            <option value="image">Imagens</option>
            <option value="html">HTML</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="py-10 text-center text-[13px] text-slate-500 dark:text-white/45">
          Nenhum log encontrado.
        </div>
      )}

      {!isLoading && runs.length > 0 && (
        <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#242836]">
                <th className="px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] w-8" />
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  Data
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  Loja
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hidden lg:table-cell">
                  Email
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  Agente
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-left border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  Status
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-right border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hidden lg:table-cell">
                  Duração
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-right border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hidden lg:table-cell">
                  Custo
                </th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] text-right border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hidden lg:table-cell">
                  Tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const statusCfg = STATUS_CONFIG[run.status]
                const isExpanded = expandedId === run.id
                const StatusIcon = statusCfg.icon
                return (
                  <RunRow
                    key={run.id}
                    run={run}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedId(isExpanded ? null : run.id)
                    }
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between px-1 py-3">
          <span className="text-sm text-gray-500 dark:text-[#5C6378]">
            Mostrando {offset + 1}–{Math.min(offset + pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset + pageSize >= total}
              onClick={() => setPage(page + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RunRow({
  run,
  isExpanded,
  onToggle,
}: {
  run: EmailGenerationRun
  isExpanded: boolean
  onToggle: () => void
}) {
  const statusCfg = STATUS_CONFIG[run.status]
  const StatusIcon = statusCfg.icon

  return (
    <>
      <tr
        className={cn(
          "border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
          "hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)]",
          "transition-colors duration-150 cursor-pointer",
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-sm">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-[#8B92A5] whitespace-nowrap">
          {new Date(run.created_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-[#8B92A5] truncate max-w-[160px]">
          {run.store_name ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-[#8B92A5] truncate max-w-[160px] hidden lg:table-cell">
          {run.email_name ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm">
          <span className="text-[12px] font-medium text-slate-700 dark:text-white/75">
            {AGENT_LABELS[run.agent] ?? run.agent}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          <Badge variant={statusCfg.variant} showDot>
            {statusCfg.label}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] hidden lg:table-cell">
          {run.duration_ms > 0
            ? `${(run.duration_ms / 1000).toFixed(1)}s`
            : "—"}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] hidden lg:table-cell">
          {run.cost_cents > 0
            ? `$${(run.cost_cents / 100).toFixed(4)}`
            : "—"}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] hidden lg:table-cell">
          {run.tokens_input + run.tokens_output > 0
            ? (run.tokens_input + run.tokens_output).toLocaleString("pt-BR")
            : "—"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <td colSpan={9} className="p-0">
            <RunDetail run={run} />
          </td>
        </tr>
      )}
    </>
  )
}

function RunDetail({ run }: { run: EmailGenerationRun }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [regenLoading, setRegenLoading] = useState(false)

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleRegenerate = async () => {
    if (regenLoading || !run.store_id || !run.flow_id || !run.email_id) return
    setRegenLoading(true)
    try {
      const flowType = run.flow_type ?? "welcome"
      const res = await fetch(
        `/api/admin/stores/${run.store_id}/generate-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: run.flow_id,
            emailId: run.email_id,
            flowType,
            emailNumber: 1,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      window.location.reload()
    } catch (err) {
      alert(`Erro ao re-gerar: ${err instanceof Error ? err.message : "Erro desconhecido"}`)
    } finally {
      setRegenLoading(false)
    }
  }

  return (
    <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.01] space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
        <div>
          <span className="text-slate-500 dark:text-white/45">Modelo</span>
          <p className="font-mono text-slate-700 dark:text-white/75">{run.model ?? "—"}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-white/45">Tokens (in/out)</span>
          <p className="font-mono text-slate-700 dark:text-white/75">
            {run.tokens_input.toLocaleString()} / {run.tokens_output.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-white/45">Batch ID</span>
          <p className="font-mono text-slate-700 dark:text-white/75 truncate">
            {run.batch_id ?? "—"}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-white/45">Retries</span>
          <p className="font-mono text-slate-700 dark:text-white/75">{run.retry_count}</p>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        {run.store_id && run.flow_id && run.email_id && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenLoading}
            className="text-[11px]"
          >
            {regenLoading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : null}
            Re-gerar
          </Button>
        )}
        {run.store_id && run.flow_id && run.email_id && (
          <a
            href={`/admin/stores/${run.store_id}/producao?flow=${run.flow_id}&email=${run.email_id}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] font-medium text-slate-600 dark:text-white/60 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-[6px] hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            Ver no workspace
          </a>
        )}
      </div>

      {/* Collapsible: Input Vars */}
      {run.input_vars && (
        <CollapsibleSection
          title="Input Vars"
          isOpen={openSections.inputVars}
          onToggle={() => toggleSection("inputVars")}
        >
          <pre className="text-[12px] font-mono text-slate-600 dark:text-white/60 bg-white dark:bg-white/[0.03] rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {JSON.stringify(run.input_vars, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Collapsible: Rendered Prompt */}
      {run.rendered_prompt && (
        <CollapsibleSection
          title="Prompt Renderizado"
          isOpen={openSections.renderedPrompt}
          onToggle={() => toggleSection("renderedPrompt")}
        >
          <pre className="text-[12px] font-mono text-slate-600 dark:text-white/60 bg-white dark:bg-white/[0.03] rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {run.rendered_prompt}
          </pre>
        </CollapsibleSection>
      )}

      {/* Collapsible: Raw Output */}
      {run.raw_output && (
        <CollapsibleSection
          title="Output Bruto"
          isOpen={openSections.rawOutput}
          onToggle={() => toggleSection("rawOutput")}
        >
          <pre className="text-[12px] font-mono text-slate-600 dark:text-white/60 bg-white dark:bg-white/[0.03] rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {run.raw_output}
          </pre>
        </CollapsibleSection>
      )}

      {/* Collapsible: Parsed Output */}
      {run.parsed_output && (
        <CollapsibleSection
          title="Output Parseado"
          isOpen={openSections.parsedOutput}
          onToggle={() => toggleSection("parsedOutput")}
        >
          <pre className="text-[12px] font-mono text-slate-600 dark:text-white/60 bg-white dark:bg-white/[0.03] rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {formatJson(run.parsed_output)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Collapsible: Error */}
      {run.error_message && (
        <CollapsibleSection
          title="Erro"
          isOpen={openSections.error ?? true}
          onToggle={() => toggleSection("error")}
          variant="error"
        >
          <pre className="text-[12px] font-mono text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/10 rounded-[6px] p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {run.error_message}
            {run.error_stack && `\n\n--- Stack Trace ---\n${run.error_stack}`}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  )
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  variant,
  children,
}: {
  title: string
  isOpen?: boolean
  onToggle: () => void
  variant?: "error"
  children: React.ReactNode
}) {
  const open = isOpen ?? false
  const titleColor =
    variant === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-slate-500 dark:text-white/45"

  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer",
          titleColor,
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {open && children}
    </div>
  )
}

function formatJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function MetricCard({
  label,
  value,
  variant = "neutral",
}: {
  label: string
  value: string
  variant?: "neutral" | "negative"
}) {
  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3">
      <p className="text-[11px] font-medium text-slate-500 dark:text-white/45 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          "text-[20px] font-semibold mt-0.5 tabular-nums",
          variant === "negative"
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-white",
        )}
      >
        {value}
      </p>
    </div>
  )
}
