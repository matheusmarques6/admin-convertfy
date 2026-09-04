"use client"

/**
 * Execuções de agentes AO VIVO — /admin/agents/runs (Story AE-9).
 *
 * Responde "o agente foi acionado? onde está?" em tempo real:
 *   - Painel "Pipelines ativos": o flow automático como um todo, por loja
 *     (sinal de fila, Montador/Blueprint em lote, emails por status,
 *     agentes rodando AGORA com tempo decorrido).
 *   - Tabela densa de runs, com linhas 'running' pulsando e alerta de run
 *     obsoleto (>10min sem finish = processo provavelmente morto).
 *   - Drawer de detalhes reusa `/api/admin/email-generation-logs/[id]`.
 *
 * Visual segue os tokens da página de logs (`logs-workspace.tsx`) e a
 * identidade dos agentes em `AGENT_VISUAL`.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import {
  Activity,
  Copy as CopyIcon,
  Loader2,
  Radio,
  X,
} from "lucide-react"
import { AGENT_VISUAL, flowTypeLabel, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import { useAgentRunsLive } from "@/hooks/use-agent-runs-live"
import { ROUTES } from "@/lib/routes"
import {
  RUNNING_STALE_MS,
  type LiveAgentRun,
  type PipelineStoreOverview,
} from "@/types/agent-runs-live"

// ── Tokens (mesma paleta da página de logs) ────────────────────────
const C = {
  brand: "#4E62D8",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g900: "#111827",
  border: "rgba(0,0,0,0.08)",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
}
const F = { sans: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"
const TNUM = {
  fontVariantNumeric: "tabular-nums lining-nums" as const,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

// ── Formatadores ───────────────────────────────────────────────────
const usd = (cents: number) => "$" + (cents / 100).toFixed(3)
const fmtTok = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n)
const fmtClock = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}
const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}
const fmtDuration = (ms: number) =>
  ms >= 1000 ? (ms / 1000).toFixed(1).replace(".", ",") + "s" : `${ms}ms`

const EMAIL_STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  copy_generating: "Copy (n8n)",
  copy_generating_recovery: "Copy (recovery)",
  copy_ready: "Copy pronta",
  rendering: "Renderizando",
  image_done: "Imagens ok",
  qa_running: "QA",
}

const WINDOW_OPTIONS = [
  { min: 15, label: "15 min" },
  { min: 60, label: "1h" },
  { min: 360, label: "6h" },
  { min: 1440, label: "24h" },
]

function agentVisual(agent: string) {
  return (
    AGENT_VISUAL[agent as PipelineAgentKey] ?? {
      name: agent,
      desc: "",
      color: C.g600,
      bg: C.g100,
      border: C.g200,
      kind: "sistema" as const,
    }
  )
}

// ── Pequenos componentes ───────────────────────────────────────────

function AgentBadge({ agent }: { agent: string }) {
  const v = agentVisual(agent)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: F.sans,
        color: v.color,
        background: v.bg,
        border: `1px solid ${v.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {v.name}
    </span>
  )
}

function StatusBadge({ run, now }: { run: LiveAgentRun; now: number }) {
  if (run.status === "running") {
    const elapsed = now - new Date(run.created_at).getTime()
    const stale = elapsed > RUNNING_STALE_MS
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 8px",
          borderRadius: 5,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: F.sans,
          color: stale ? C.warn : C.info,
          background: stale ? C.warnBg : C.infoBg,
          border: `1px solid ${stale ? C.warnBorder : C.infoBorder}`,
          whiteSpace: "nowrap",
          ...TNUM,
        }}
        title={
          stale
            ? "Rodando há mais de 10 min sem concluir — processo possivelmente interrompido"
            : "Agente em execução agora"
        }
      >
        <span
          className={stale ? undefined : "animate-pulse"}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: stale ? C.warn : C.info,
          }}
        />
        {stale ? `rodando ${fmtElapsed(elapsed)} ⚠` : `rodando ${fmtElapsed(elapsed)}`}
      </span>
    )
  }
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    success: { label: "sucesso", color: C.pos, bg: C.posBg, border: C.posBorder },
    error: { label: "erro", color: C.neg, bg: C.negBg, border: C.negBorder },
    skipped: { label: "pulado", color: C.g500, bg: C.g100, border: C.g200 },
  }
  const s = map[run.status] ?? map.skipped
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: F.sans,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  )
}

function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode
  tone?: "neutral" | "info" | "warn" | "pos" | "neg"
  title?: string
}) {
  const tones = {
    neutral: { color: C.g600, bg: C.g100, border: C.g200 },
    info: { color: C.info, bg: C.infoBg, border: C.infoBorder },
    warn: { color: C.warn, bg: C.warnBg, border: C.warnBorder },
    pos: { color: C.pos, bg: C.posBg, border: C.posBorder },
    neg: { color: C.neg, bg: C.negBg, border: C.negBorder },
  }
  const t = tones[tone]
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: F.sans,
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
        whiteSpace: "nowrap",
        ...TNUM,
      }}
    >
      {children}
    </span>
  )
}

function Kpi({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.white,
        padding: "12px 16px",
        minWidth: 150,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, color: C.g500, fontFamily: F.sans, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 650,
          color: accent ?? C.g900,
          fontFamily: F.sans,
          ...TNUM,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── Card de pipeline por loja ──────────────────────────────────────

function PipelineStoreCard({
  store,
  now,
}: {
  store: PipelineStoreOverview
  now: number
}) {
  const jobLabel: Record<string, string> = {
    pending: "na fila",
    generating: "gerando",
    dispatching: "disparando pro n8n",
  }
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.white,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: C.g900, fontFamily: F.sans }}>
          {store.store_name ?? store.store_id.slice(0, 8)}
        </span>
        {store.last_activity_at && (
          <span style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, ...TNUM }}>
            atividade há {fmtElapsed(now - new Date(store.last_activity_at).getTime())}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {store.queue_signal && (
          <Chip
            tone={store.queue_signal.status === "processing" ? "info" : "warn"}
            title={`Sinal de fila (${store.queue_signal.triggered_by})`}
          >
            Fila: {store.queue_signal.status === "processing" ? "processando" : "pendente"}
          </Chip>
        )}
        {store.dispatch_job && (
          <Chip
            tone={store.dispatch_job.status === "pending" ? "warn" : "info"}
            title="Job Montador+Blueprint → dispatch de copy pro n8n"
          >
            Montador {store.dispatch_job.architect_done}/{store.dispatch_job.architect_total}
            {" · "}
            {jobLabel[store.dispatch_job.status] ?? store.dispatch_job.status}
          </Chip>
        )}
        {Object.entries(store.email_status_counts)
          .sort((a, b) => b[1] - a[1])
          .map(([st, count]) => (
            <Chip key={st} tone={st === "qa_running" || st === "rendering" || st === "copy_generating" ? "info" : "neutral"}>
              {EMAIL_STATUS_LABEL[st] ?? st}: {count}
            </Chip>
          ))}
      </div>

      {store.running_runs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {store.running_runs.map((r) => {
            const elapsed = now - new Date(r.created_at).getTime()
            const stale = elapsed > RUNNING_STALE_MS
            const v = agentVisual(r.agent)
            return (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  fontFamily: F.sans,
                  color: C.g700,
                }}
              >
                <span
                  className={stale ? undefined : "animate-pulse"}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: stale ? C.warn : v.color,
                    flexShrink: 0,
                  }}
                />
                <AgentBadge agent={r.agent} />
                <span style={{ color: C.g500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.email_name ?? "—"}
                </span>
                <span style={{ marginLeft: "auto", color: stale ? C.warn : C.g500, ...TNUM }}>
                  {stale ? `${fmtElapsed(elapsed)} ⚠ possivelmente interrompido` : fmtElapsed(elapsed)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Drawer de detalhes ─────────────────────────────────────────────

interface RunDetail {
  id: string
  created_at: string
  batch_id: string | null
  agent: string
  model: string | null
  status: string
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
  retry_count: number
  error_message: string | null
  error_stack: string | null
  input_vars: Record<string, unknown> | null
  raw_output: string | null
  parsed_output: Record<string, unknown> | null
  store_name: string | null
  email_name: string | null
  flow_type_label: string
  triggered_by_name: string | null
}

const detailFetcher = async (url: string): Promise<RunDetail> => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
  return json as RunDetail
}

function DetailSection({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.g500, fontFamily: F.sans, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {title}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: C.g500,
            fontFamily: F.sans,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
          }}
        >
          <CopyIcon size={12} /> {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: C.g50,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          fontSize: 11,
          fontFamily: MONO,
          color: C.g700,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {text}
      </pre>
    </div>
  )
}

function RunDetailDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data, error, isLoading } = useSWR<RunDetail>(
    `/api/admin/email-generation-logs/${runId}`,
    detailFetcher,
    { revalidateOnFocus: false },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,24,39,0.35)",
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(640px, 92vw)",
          background: C.white,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {data && <AgentBadge agent={data.agent} />}
            <span style={{ fontSize: 13, fontWeight: 650, color: C.g900, fontFamily: F.sans }}>
              Detalhe da execução
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.g500, padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.g500, fontSize: 12, fontFamily: F.sans }}>
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          )}
          {error && (
            <div style={{ color: C.neg, fontSize: 12, fontFamily: F.sans }}>
              Erro ao carregar detalhe: {error.message}
            </div>
          )}
          {data && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                  gap: 8,
                  fontSize: 12,
                  fontFamily: F.sans,
                  color: C.g700,
                }}
              >
                <div><span style={{ color: C.g400 }}>Loja: </span>{data.store_name ?? "—"}</div>
                <div><span style={{ color: C.g400 }}>Email: </span>{data.email_name ?? "—"}</div>
                <div><span style={{ color: C.g400 }}>Flow: </span>{data.flow_type_label}</div>
                <div><span style={{ color: C.g400 }}>Modelo: </span>{data.model ?? "—"}</div>
                <div style={TNUM}><span style={{ color: C.g400 }}>Tokens: </span>{fmtTok(data.tokens_input)} → {fmtTok(data.tokens_output)}</div>
                <div style={TNUM}><span style={{ color: C.g400 }}>Custo: </span>{usd(Number(data.cost_cents ?? 0))}</div>
                <div style={TNUM}><span style={{ color: C.g400 }}>Duração: </span>{fmtDuration(data.duration_ms ?? 0)}</div>
                <div><span style={{ color: C.g400 }}>Status: </span>{data.status}</div>
                <div style={{ gridColumn: "1 / -1", ...TNUM }}>
                  <span style={{ color: C.g400 }}>Batch: </span>
                  <span style={{ fontFamily: MONO, fontSize: 11 }}>{data.batch_id ?? "—"}</span>
                </div>
                {data.triggered_by_name && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: C.g400 }}>Disparado por: </span>{data.triggered_by_name}
                  </div>
                )}
              </div>

              {data.error_message && (
                <DetailSection
                  title="Erro"
                  text={data.error_message + (data.error_stack ? `\n\n${data.error_stack}` : "")}
                />
              )}
              {data.input_vars && (
                <DetailSection title="Input vars" text={JSON.stringify(data.input_vars, null, 2)} />
              )}
              {data.raw_output && <DetailSection title="Output bruto" text={data.raw_output} />}
              {data.parsed_output && (
                <DetailSection title="Output parseado" text={JSON.stringify(data.parsed_output, null, 2)} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Workspace principal ────────────────────────────────────────────

export function RunsLiveWorkspace() {
  const [windowMin, setWindowMin] = useState(60)
  const [agentFilter, setAgentFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [storeFilter, setStoreFilter] = useState<string>("")
  // `?run=<id>` abre o detalhe direto — é o deep-link do "ver run" das
  // telas que apontam para uma run de LOJA (Catalogador, aba Pesquisa), que
  // não tem email e por isso não aparece na listagem por email do Estúdio.
  const searchParams = useSearchParams()
  const runFromUrl = searchParams?.get("run") ?? null
  const [detailRunId, setDetailRunId] = useState<string | null>(runFromUrl)

  const { runs, pipeline, status, isLoading } = useAgentRunsLive(windowMin)

  // Relógio de 1s pra tempo decorrido dos runs em execução.
  const hasRunning =
    runs.some((r) => r.status === "running") ||
    pipeline.some((s) => s.running_runs.length > 0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasRunning) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hasRunning])

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of runs) map.set(r.store_id, r.store_name ?? r.store_id.slice(0, 8))
    for (const s of pipeline) map.set(s.store_id, s.store_name ?? s.store_id.slice(0, 8))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [runs, pipeline])

  const agentOptions = useMemo(
    () => [...new Set(runs.map((r) => r.agent))].sort(),
    [runs],
  )

  const filteredRuns = useMemo(
    () =>
      runs.filter(
        (r) =>
          (!agentFilter || r.agent === agentFilter) &&
          (!statusFilter || r.status === statusFilter) &&
          (!storeFilter || r.store_id === storeFilter),
      ),
    [runs, agentFilter, statusFilter, storeFilter],
  )

  const runningCount = filteredRuns.filter((r) => r.status === "running").length
  const errorCount = filteredRuns.filter((r) => r.status === "error").length
  const totalCost = filteredRuns.reduce((s, r) => s + r.cost_cents, 0)

  const liveBadge = {
    live: { label: "AO VIVO", color: C.pos, bg: C.posBg, border: C.posBorder },
    reconnecting: { label: "RECONECTANDO", color: C.warn, bg: C.warnBg, border: C.warnBorder },
    polling: { label: "POLLING 5s", color: C.warn, bg: C.warnBg, border: C.warnBorder },
  }[status]

  const selectStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: F.sans,
    color: C.g700,
    border: `1px solid ${C.g200}`,
    borderRadius: 6,
    padding: "5px 8px",
    background: C.white,
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Activity size={18} color={C.g900} />
        <h1 style={{ fontSize: 17, fontWeight: 700, color: C.g900, fontFamily: F.sans, margin: 0 }}>
          Execuções de agentes
        </h1>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
            fontFamily: F.sans,
            color: liveBadge.color,
            background: liveBadge.bg,
            border: `1px solid ${liveBadge.border}`,
          }}
        >
          <Radio size={11} className={status === "live" ? "animate-pulse" : undefined} />
          {liveBadge.label}
        </span>
        <Link
          href={ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION_LOGS}
          style={{ marginLeft: "auto", fontSize: 12, color: C.brand, fontFamily: F.sans, textDecoration: "none" }}
        >
          Logs históricos →
        </Link>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: `1px solid ${C.g200}`, borderRadius: 6, overflow: "hidden" }}>
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w.min}
              type="button"
              onClick={() => setWindowMin(w.min)}
              style={{
                fontSize: 12,
                fontFamily: F.sans,
                padding: "5px 10px",
                border: "none",
                cursor: "pointer",
                background: windowMin === w.min ? C.g900 : C.white,
                color: windowMin === w.min ? C.white : C.g600,
                fontWeight: windowMin === w.min ? 650 : 400,
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} style={selectStyle}>
          <option value="">Todos os agentes</option>
          {agentOptions.map((a) => (
            <option key={a} value={a}>
              {agentVisual(a).name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">Todos os status</option>
          <option value="running">Rodando</option>
          <option value="success">Sucesso</option>
          <option value="error">Erro</option>
          <option value="skipped">Pulado</option>
        </select>
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={selectStyle}>
          <option value="">Todas as lojas</option>
          {storeOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {(agentFilter || statusFilter || storeFilter) && (
          <button
            type="button"
            onClick={() => {
              setAgentFilter("")
              setStatusFilter("")
              setStoreFilter("")
            }}
            style={{ ...selectStyle, cursor: "pointer", color: C.g500 }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Kpi
          label="Rodando agora"
          value={runningCount}
          accent={runningCount > 0 ? C.info : undefined}
        />
        <Kpi label={`Execuções (${WINDOW_OPTIONS.find((w) => w.min === windowMin)?.label})`} value={filteredRuns.length} />
        <Kpi label="Erros" value={errorCount} accent={errorCount > 0 ? C.neg : undefined} />
        <Kpi label="Custo na janela" value={usd(totalCost)} />
      </div>

      {/* Pipelines ativos */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.g50 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
            Pipelines ativos
          </span>
          <span style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}>
            flow automático em andamento, por loja
          </span>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {pipeline.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.g500, fontFamily: F.sans, padding: "8px 4px" }}>
              {isLoading
                ? "Carregando…"
                : "Nenhum pipeline em execução no momento — nenhum agente foi acionado."}
            </div>
          ) : (
            pipeline
              .filter((s) => !storeFilter || s.store_id === storeFilter)
              .map((s) => <PipelineStoreCard key={s.store_id} store={s} now={now} />)
          )}
        </div>
      </div>

      {/* Tabela de runs */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
            Trace de execuções
          </span>
          <span style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}>
            cada chamada de agente, do acionamento à conclusão
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.g50 }}>
                {["Hora", "Agente", "Status", "Loja", "Email · Flow", "Modelo", "Tokens", "Custo", "Duração"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: C.g500,
                        fontFamily: F.sans,
                        padding: "7px 12px",
                        borderBottom: `1px solid ${C.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRuns.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{ padding: "16px 12px", fontSize: 12.5, color: C.g500, fontFamily: F.sans }}
                  >
                    {isLoading ? "Carregando…" : "Nenhuma execução na janela selecionada."}
                  </td>
                </tr>
              )}
              {filteredRuns.map((r) => {
                const isRunning = r.status === "running"
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetailRunId(r.id)}
                    style={{
                      cursor: "pointer",
                      background: isRunning ? C.infoBg : undefined,
                      borderBottom: `1px solid ${C.g100}`,
                    }}
                  >
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: MONO, color: C.g600, whiteSpace: "nowrap", ...TNUM }}>
                      {fmtClock(r.created_at)}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <AgentBadge agent={r.agent} />
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <StatusBadge run={r} now={now} />
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: F.sans, color: C.g700, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.store_name ?? "—"}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: F.sans, color: C.g600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.email_name ?? "—"}
                      {r.flow_type ? ` · ${flowTypeLabel(r.flow_type)}` : ""}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 11.5, fontFamily: MONO, color: C.g500, whiteSpace: "nowrap" }}>
                      {r.model ?? "—"}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: F.sans, color: C.g600, whiteSpace: "nowrap", ...TNUM }}>
                      {r.tokens_input || r.tokens_output
                        ? `${fmtTok(r.tokens_input)} → ${fmtTok(r.tokens_output)}`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: F.sans, color: C.g600, whiteSpace: "nowrap", ...TNUM }}>
                      {r.cost_cents > 0 ? usd(r.cost_cents) : "—"}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 12, fontFamily: F.sans, color: C.g600, whiteSpace: "nowrap", ...TNUM }}>
                      {isRunning
                        ? fmtElapsed(now - new Date(r.created_at).getTime())
                        : r.duration_ms > 0
                          ? fmtDuration(r.duration_ms)
                          : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailRunId && (
        <RunDetailDrawer runId={detailRunId} onClose={() => setDetailRunId(null)} />
      )}
    </div>
  )
}
