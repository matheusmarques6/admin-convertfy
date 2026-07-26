"use client"

/**
 * Logs de Geração de Emails — Pipeline AE
 *
 * Implementação fiel à maquete `Logs_de_Geração_de_Emails_Abordagem_A`.
 * Componentes inline (KpiStrip, CostShareBar, SpendChart, AgentSummary,
 * FilterTabs, DetailTable, ExpandedDetail) replicam exatamente o
 * layout/densidade/tokens da maquete. Os agentes seguem `AGENT_VISUAL`.
 *
 * Consome `/api/admin/email-generation-logs` (lista+agregados) com SWR
 * 30s e `/api/admin/email-generation-logs/[id]` (detalhe lazy ao expandir).
 */
import { Fragment, useState } from "react"
import useSWR from "swr"
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Mail,
} from "lucide-react"
import {
  AGENT_VISUAL,
  PIPELINE_AGENT_ORDER,
  type PipelineAgentKey,
} from "@/lib/agents/agent-visual"

// ── Tokens da maquete (replicados pra fidelidade visual) ──────────
const C = {
  brand: "#4E62D8",
  white: "#FFFFFF",
  g25: "#FCFCFD",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g800: "#1F2937",
  g900: "#111827",
  border: "rgba(0,0,0,0.08)",
  blue50: "#EEF0FB",
  pos: "#065F46",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
}
const F = { sans: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }
const TNUM = {
  fontVariantNumeric: "tabular-nums lining-nums" as const,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

// ── Formatadores ───────────────────────────────────────────────────
const usd = (v: number) => "$" + v.toFixed(2)
const usd3 = (v: number) => "$" + v.toFixed(3)
const fmtInt = (n: number) => n.toLocaleString("pt-BR")
const fmtTok = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n)
const formatBRL = (v: number) =>
  "R$ " +
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
const formatDuration = (ms: number) =>
  (ms / 1000).toFixed(1).replace(".", ",") + "s"
const formatDayPt = (iso: string) => {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}
const formatTimePt = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// ── Tipos do payload ──────────────────────────────────────────────
interface AgentRow {
  agent: PipelineAgentKey
  runs: number
  errors: number
  retries: number
  cost_cents: number
  cost_usd: number
  avg_duration_ms: number | null
  avg_tokens_in: number | null
  avg_tokens_out: number | null
  model: string | null
}
interface DayRow {
  day: string
  runs: number
  cost_cents: number
  cost_usd: number
}
interface TypeRow {
  flow_type: string
  label: string
  runs: number
}
interface RecentRow {
  id: string
  created_at: string
  store_id: string | null
  store_name: string | null
  email_id: string | null
  email_name: string | null
  flow_type: string | null
  flow_type_label: string
  agent: PipelineAgentKey
  model: string | null
  status: string
  duration_ms: number | null
  cost_cents: number | null
  tokens_input: number | null
  tokens_output: number | null
  retry_count: number | null
  error_message: string | null
}
interface Payload {
  window_days: number
  truncated: boolean
  fx_brl_rate: number | null
  totals: {
    runs: number
    tracked_runs: number
    external_runs: number
    errors: number
    retries: number
    cost_cents: number
    cost_usd: number
    tokens_input: number
    tokens_output: number
    avg_duration_ms: number | null
  }
  by_agent: AgentRow[]
  by_day: DayRow[]
  by_type: TypeRow[]
  by_status: { success: number; error: number; running: number; skipped: number }
  recent: RecentRow[]
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  })

// ── Componentes ───────────────────────────────────────────────────

function Panel({
  title,
  hint,
  right,
  children,
  pad = 18,
}: {
  title?: string
  hint?: string
  right?: React.ReactNode
  children: React.ReactNode
  pad?: number
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.white,
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: `14px ${pad}px`,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.g900,
                fontFamily: F.sans,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </span>
            {hint && (
              <span style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}>
                {hint}
              </span>
            )}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  )
}

function SelectPill({
  icon,
  label,
  onClick,
}: {
  icon?: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 32,
        padding: "0 11px",
        borderRadius: 7,
        border: `1px solid ${C.border}`,
        background: C.white,
        color: C.g700,
        fontSize: 12.5,
        fontWeight: 500,
        fontFamily: F.sans,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {icon && <span style={{ color: C.g400, display: "flex" }}>{icon}</span>}
      {label}
      <ChevronDown size={14} color={C.g400} />
    </button>
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
  tone,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  tone?: string
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "13px 16px",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.white,
        borderTop: `2px solid ${accent || C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: C.g400,
          fontFamily: F.sans,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 25,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: tone || C.g900,
          fontFamily: F.sans,
          lineHeight: 1,
          ...TNUM,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 5,
            fontSize: 11.5,
            color: C.g500,
            fontFamily: F.sans,
            ...TNUM,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function KpiStrip({ payload }: { payload: Payload }) {
  const fx = payload.fx_brl_rate ?? 5.42
  const errPct =
    payload.totals.runs > 0
      ? (payload.totals.errors / payload.totals.runs) * 100
      : 0
  const avgCost =
    payload.totals.tracked_runs > 0
      ? payload.totals.cost_cents / payload.totals.tracked_runs / 100
      : 0
  const tokens = payload.totals.tokens_input + payload.totals.tokens_output
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Kpi
        label="Execuções"
        value={fmtInt(payload.totals.runs)}
        sub={`${fmtInt(payload.totals.tracked_runs)} rastreadas · ${fmtInt(payload.totals.external_runs)} externas`}
        accent={C.brand}
      />
      <Kpi
        label="Custo total"
        value={usd(payload.totals.cost_usd)}
        sub={formatBRL(payload.totals.cost_usd * fx)}
        accent="#7C3AED"
      />
      <Kpi
        label="Custo médio / exec"
        value={usd3(avgCost)}
        sub={formatBRL(avgCost * fx)}
        accent="#D97706"
      />
      <Kpi
        label="Tempo médio"
        value={
          payload.totals.avg_duration_ms != null
            ? formatDuration(payload.totals.avg_duration_ms)
            : "—"
        }
        sub="execuções rastreadas"
        accent="#065F46"
      />
      <Kpi
        label="Tokens"
        value={
          tokens >= 1_000_000
            ? `${(tokens / 1_000_000).toFixed(1).replace(".", ",")}M`
            : fmtTok(tokens)
        }
        sub="in + out · acumulado"
        accent="#2137B6"
      />
      <Kpi
        label="Taxa de erro"
        value={`${errPct.toFixed(1).replace(".", ",")}%`}
        sub={`${payload.totals.errors} erros · ${payload.totals.retries} retries`}
        accent={payload.totals.errors > 0 ? C.warn : C.pos}
        tone={payload.totals.errors > 0 ? C.warn : C.g900}
      />
    </div>
  )
}

function CostShareBar({
  byAgent,
  totalUsd,
}: {
  byAgent: AgentRow[]
  totalUsd: number
}) {
  const ranked = byAgent
    .filter((a) => a.cost_usd > 0)
    .sort((a, b) => b.cost_usd - a.cost_usd)
  if (ranked.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
        Sem custo no período.
      </div>
    )
  }
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 14,
          borderRadius: 6,
          overflow: "hidden",
          border: `1px solid ${C.border}`,
        }}
      >
        {ranked.map((a) => (
          <div
            key={a.agent}
            title={`${AGENT_VISUAL[a.agent].name} · ${usd(a.cost_usd)}`}
            style={{
              width: `${(a.cost_usd / totalUsd) * 100}%`,
              background: AGENT_VISUAL[a.agent].color,
            }}
          />
        ))}
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: "7px 16px", marginTop: 11 }}
      >
        {ranked.map((a) => (
          <div
            key={a.agent}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: AGENT_VISUAL[a.agent].color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: C.g700,
                fontFamily: F.sans,
                fontWeight: 500,
              }}
            >
              {AGENT_VISUAL[a.agent].name}
            </span>
            <span
              style={{
                fontSize: 12,
                color: C.g400,
                fontFamily: F.sans,
                ...TNUM,
              }}
            >
              {((a.cost_usd / totalUsd) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpendChart({ series }: { series: DayRow[] }) {
  if (series.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
        Sem dados no período.
      </div>
    )
  }
  const w = 720
  const h = 132
  const padL = 4
  const padR = 4
  const padT = 10
  const padB = 22
  const iw = w - padL - padR
  const ih = h - padT - padB
  const maxUsd = Math.max(...series.map((s) => s.cost_usd), 0.0001) * 1.12
  const maxRuns = Math.max(...series.map((s) => s.runs), 1) * 1.12
  const n = series.length
  const bw = iw / n
  const x = (i: number) => padL + bw * i + bw / 2
  const yU = (v: number) => padT + ih - (v / maxUsd) * ih
  const pts = series.map((s, i) => [x(i), yU(s.cost_usd)] as const)
  const line = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const area =
    `M${pts[0][0].toFixed(1)} ${(padT + ih).toFixed(1)} ` +
    pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") +
    ` L${pts[n - 1][0].toFixed(1)} ${(padT + ih).toFixed(1)} Z`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: h, display: "block" }}
    >
      <defs>
        <linearGradient id="egl-spendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.brand} stopOpacity="0.16" />
          <stop offset="100%" stopColor={C.brand} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <line
          key={i}
          x1={padL}
          x2={w - padR}
          y1={padT + ih - g * ih}
          y2={padT + ih - g * ih}
          stroke={C.g100}
          strokeWidth="1"
        />
      ))}
      {series.map((s, i) => {
        const bh = (s.runs / maxRuns) * ih
        const bx = padL + bw * i + bw * 0.28
        const by = padT + ih - bh
        return (
          <rect
            key={i}
            x={bx}
            y={by}
            width={bw * 0.44}
            height={bh}
            rx="2"
            fill={C.g100}
          />
        )
      })}
      <path d={area} fill="url(#egl-spendFill)" />
      <path
        d={line}
        fill="none"
        stroke={C.brand}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === n - 1 ? 3.5 : 0}
          fill={C.brand}
          stroke="#fff"
          strokeWidth="1.5"
        />
      ))}
      {series.map((s, i) =>
        i % 2 === 1 ? (
          <text
            key={i}
            x={x(i)}
            y={h - 6}
            textAnchor="middle"
            fontSize="10"
            fill={C.g400}
            fontFamily={F.sans}
          >
            {formatDayPt(s.day)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function AgentChip({ k, size = "md" }: { k: PipelineAgentKey; size?: "sm" | "md" }) {
  const a = AGENT_VISUAL[k]
  if (!a) return null
  const pad = size === "sm" ? "2px 7px 2px 6px" : "3px 9px 3px 7px"
  const fs = size === "sm" ? 11.5 : 12.5
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        borderRadius: 5,
        background: a.bg,
        border: `1px solid ${a.border}`,
        fontFamily: F.sans,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: a.color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: fs, fontWeight: 600, color: a.color }}>{a.name}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; border: string; color: string; label: string }> = {
    success: { bg: C.posBg, border: C.posBorder, color: C.pos, label: "Sucesso" },
    error: { bg: C.negBg, border: C.negBorder, color: C.neg, label: "Erro" },
    running: { bg: C.infoBg, border: C.infoBorder, color: C.info, label: "Em andamento" },
    // 'skipped' no pipeline AE = caiu no fallback (ex.: 402 créditos,
    // timeout) — o email saiu com template genérico em vez de IA.
    skipped: { bg: C.warnBg, border: C.warnBorder, color: C.warn, label: "Fallback" },
  }
  const s = map[status] || map.success
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        fontFamily: F.sans,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: s.color,
        }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: s.color }}>
        {s.label}
      </span>
    </span>
  )
}

const SUMMARY_COLS = "1.9fr 0.95fr 1.2fr 0.85fr 0.85fr 1fr 0.8fr"
const TH_STYLE = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  color: C.g400,
  fontFamily: F.sans,
}

// Agentes da cadeia de formatação (split do HTML agent) + legados que
// ocupavam o mesmo papel — a linha sintética "Montagem HTML" soma os 6 pra
// responder "quanto custou montar o HTML todo" (e manter o comparativo
// histórico com o monolítico/Refinador).
const HTML_CHAIN_KEYS: PipelineAgentKey[] = [
  "hero_section",
  "text_format",
  "image_format",
  "color_format",
  "html",
  "refiner",
]

function AgentSummary({ payload }: { payload: Payload }) {
  const ranked = [...payload.by_agent].sort(
    (a, b) => b.cost_usd - a.cost_usd || b.runs - a.runs,
  )
  const maxRuns = Math.max(...ranked.map((a) => a.runs), 1)
  const chainAggs = payload.by_agent.filter((a) =>
    HTML_CHAIN_KEYS.includes(a.agent),
  )
  const chain = chainAggs.reduce(
    (acc, a) => ({
      runs: acc.runs + a.runs,
      cost_usd: acc.cost_usd + a.cost_usd,
      errors: acc.errors + a.errors,
      retries: acc.retries + a.retries,
      // Tempo = SOMA dos tempos médios dos steps (aprox. do tempo de
      // montagem por email, não média de runs).
      sum_avg_ms:
        acc.sum_avg_ms + (a.avg_duration_ms != null ? a.avg_duration_ms : 0),
    }),
    { runs: 0, cost_usd: 0, errors: 0, retries: 0, sum_avg_ms: 0 },
  )
  const fxChain = payload.fx_brl_rate ?? 5.42
  const chainSharePct =
    payload.totals.cost_usd > 0
      ? (chain.cost_usd / payload.totals.cost_usd) * 100
      : 0
  return (
    <Panel
      title="Resumo por agente"
      hint="ordenado por custo · período atual"
      right={<SelectPill label="Custo (US$)" />}
      pad={0}
    >
      <div className="overflow-x-auto scrollbar-thin" style={{ padding: "14px 0 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: SUMMARY_COLS,
            minWidth: 680,
            gap: 14,
            padding: "0 16px 9px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {[
            "Agente",
            "Execuções",
            "Custo (US$ · R$)",
            "Custo / exec",
            "Tempo médio",
            "Tokens (in/out)",
            "Erros",
          ].map((h, i) => (
            <div
              key={h}
              style={{ ...TH_STYLE, textAlign: i === 0 ? "left" : "right" }}
            >
              {h}
            </div>
          ))}
        </div>
        {ranked.map((a) => {
          const v = AGENT_VISUAL[a.agent]
          const ext = v.external
          const sharePct =
            payload.totals.cost_usd > 0 ? (a.cost_usd / payload.totals.cost_usd) * 100 : 0
          const runPct = (a.runs / maxRuns) * 100
          const fx = payload.fx_brl_rate ?? 5.42
          return (
            <div
              key={a.agent}
              style={{
                display: "grid",
                gridTemplateColumns: SUMMARY_COLS,
                minWidth: 680,
                gap: 14,
                alignItems: "center",
                padding: "13px 16px",
                borderBottom: `1px solid ${C.g100}`,
                opacity: ext ? 0.92 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 34,
                    borderRadius: 3,
                    background: v.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.g900,
                        fontFamily: F.sans,
                      }}
                    >
                      {v.name}
                    </span>
                    {ext && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: C.g600,
                          background: C.g100,
                          border: `1px solid ${C.g200}`,
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        externo
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.g400,
                      fontFamily: F.sans,
                      marginTop: 2,
                      ...TNUM,
                    }}
                  >
                    {a.model ?? v.kind}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.g900,
                    fontFamily: F.sans,
                    ...TNUM,
                  }}
                >
                  {fmtInt(a.runs)}
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: C.g100,
                    marginTop: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${runPct}%`,
                      background: v.color,
                      opacity: 0.55,
                      borderRadius: 2,
                      marginLeft: "auto",
                    }}
                  />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {ext ? (
                  <span style={{ fontSize: 13, color: C.g400, fontFamily: F.sans }}>
                    —
                  </span>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: C.g900,
                        fontFamily: F.sans,
                        ...TNUM,
                      }}
                    >
                      {usd(a.cost_usd)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.g500,
                        fontFamily: F.sans,
                        ...TNUM,
                      }}
                    >
                      {formatBRL(a.cost_usd * fx)} · {sharePct.toFixed(0)}%
                    </div>
                  </>
                )}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 500,
                  color: ext ? C.g400 : C.g700,
                  fontFamily: F.sans,
                  ...TNUM,
                }}
              >
                {ext || a.runs === 0 ? "—" : usd3(a.cost_usd / a.runs)}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 500,
                  color: a.avg_duration_ms == null ? C.g400 : C.g700,
                  fontFamily: F.sans,
                  ...TNUM,
                }}
              >
                {a.avg_duration_ms == null ? "—" : formatDuration(a.avg_duration_ms)}
              </div>
              <div style={{ textAlign: "right" }}>
                {a.avg_tokens_in == null ? (
                  <span
                    style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans }}
                  >
                    {v.kind === "imagem" ? "imagem" : "—"}
                  </span>
                ) : (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.g700,
                      fontFamily: F.sans,
                      ...TNUM,
                    }}
                  >
                    {fmtTok(a.avg_tokens_in)}{" "}
                    <span style={{ color: C.g300 }}>/</span>{" "}
                    {fmtTok(a.avg_tokens_out ?? 0)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                {a.errors > 0 ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: C.warnBg,
                      border: `1px solid ${C.warnBorder}`,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.warn,
                      fontFamily: F.sans,
                    }}
                  >
                    {a.errors} · {a.retries}r
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 13,
                      color: C.g400,
                      fontFamily: F.sans,
                      ...TNUM,
                    }}
                  >
                    0
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {chain.runs > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: SUMMARY_COLS,
              minWidth: 680,
              gap: 14,
              alignItems: "center",
              padding: "13px 16px",
              borderBottom: `1px solid ${C.g100}`,
              background: C.g25,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              <span
                style={{
                  width: 10,
                  height: 34,
                  borderRadius: 3,
                  background: "#D97706",
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.g900, fontFamily: F.sans }}>
                  Montagem HTML
                </div>
                <div style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, marginTop: 2 }}>
                  soma da cadeia (hero + texto + imagem + cores) + legados
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans, ...TNUM }}>
              {fmtInt(chain.runs)}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans, ...TNUM }}>
                {usd(chain.cost_usd)}
              </div>
              <div style={{ fontSize: 11, color: C.g500, fontFamily: F.sans, ...TNUM }}>
                {formatBRL(chain.cost_usd * fxChain)} · {chainSharePct.toFixed(0)}%
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 500, color: C.g700, fontFamily: F.sans, ...TNUM }}>
              {chain.runs === 0 ? "—" : usd3(chain.cost_usd / chain.runs)}
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 500, color: C.g700, fontFamily: F.sans, ...TNUM }}>
              {chain.sum_avg_ms > 0 ? `Σ ${formatDuration(chain.sum_avg_ms)}` : "—"}
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
              —
            </div>
            <div style={{ textAlign: "right" }}>
              {chain.errors > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: C.warnBg,
                    border: `1px solid ${C.warnBorder}`,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: C.warn,
                    fontFamily: F.sans,
                  }}
                >
                  {chain.errors} · {chain.retries}r
                </span>
              ) : (
                <span style={{ fontSize: 13, color: C.g400, fontFamily: F.sans, ...TNUM }}>0</span>
              )}
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "13px 16px",
          background: C.g25,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: C.g700,
            fontFamily: F.sans,
          }}
        >
          Total · {PIPELINE_AGENT_ORDER.length} agentes
        </span>
        <div style={{ display: "flex", gap: 26, ...TNUM }}>
          <span style={{ fontSize: 12.5, color: C.g600, fontFamily: F.sans }}>
            <b style={{ color: C.g900 }}>{fmtInt(payload.totals.runs)}</b>{" "}
            execuções
          </span>
          <span style={{ fontSize: 12.5, color: C.g600, fontFamily: F.sans }}>
            <b style={{ color: C.g900 }}>{usd(payload.totals.cost_usd)}</b> ·{" "}
            {formatBRL(payload.totals.cost_usd * (payload.fx_brl_rate ?? 5.42))}
          </span>
        </div>
      </div>
    </Panel>
  )
}

function FilterTabs({
  active,
  onPick,
  tabs,
}: {
  active: string
  onPick: (key: string) => void
  tabs: Array<{ key: string; label: string; count: number }>
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: C.g100,
        padding: 3,
        borderRadius: 8,
      }}
    >
      {tabs.map((t) => {
        const on = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 6,
              border: "none",
              background: on ? C.white : "transparent",
              color: on ? C.g900 : C.g500,
              fontWeight: on ? 600 : 500,
              fontSize: 12.5,
              fontFamily: F.sans,
              cursor: "pointer",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            {t.label}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: on ? C.g500 : C.g400,
                background: on ? C.g100 : C.g200,
                padding: "0 6px",
                borderRadius: 999,
                ...TNUM,
              }}
            >
              {t.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Detalhe (lazy fetch ao expandir) ──────────────────────────────
interface DetailPayload {
  id: string
  model: string | null
  tokens_input: number | null
  tokens_output: number | null
  batch_id: string | null
  retry_count: number | null
  input_vars: unknown
  rendered_prompt: string | null
  raw_output: string | null
  parsed_output: unknown
  error_message: string | null
  error_stack: string | null
}

function Collapsible({ label, code }: { label: string; code: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: `1px solid ${C.g100}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          padding: "9px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            color: C.g400,
            display: "flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms",
          }}
        >
          <ChevronRight size={14} />
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: C.g500,
            fontFamily: F.sans,
          }}
        >
          {label}
        </span>
      </button>
      {open && (
        <pre
          style={{
            margin: "0 0 11px",
            padding: "12px 14px",
            background: "#0F1117",
            color: "#C4C9D4",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.55,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            overflow: "auto",
            maxHeight: 400,
            ...TNUM,
          }}
        >
          {code}
        </pre>
      )}
    </div>
  )
}

function ExpandedDetail({ rowId }: { rowId: string }) {
  const { data, isLoading, error } = useSWR<DetailPayload>(
    `/api/admin/email-generation-logs/${rowId}`,
    fetcher,
  )
  // Aceita `{ data: { … } }` ou direto.
  const d: DetailPayload | undefined =
    data && "raw_output" in data
      ? data
      : (data as unknown as { data: DetailPayload } | undefined)?.data
  if (isLoading || !d) {
    return (
      <div
        style={{
          padding: "16px 20px 14px 48px",
          background: C.g25,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: C.g500,
          fontFamily: F.sans,
        }}
      >
        {error ? (
          <span style={{ color: C.neg }}>{(error as Error).message}</span>
        ) : (
          <>
            <Loader2 size={14} className="animate-spin" /> Carregando detalhe…
          </>
        )}
      </div>
    )
  }
  const meta = [
    { label: "Modelo", value: d.model ?? "—" },
    {
      label: "Tokens (in/out)",
      value:
        d.tokens_input != null
          ? `${fmtInt(d.tokens_input)} / ${fmtInt(d.tokens_output ?? 0)}`
          : "—",
    },
    { label: "Batch ID", value: d.batch_id ?? "—" },
    { label: "Retries", value: String(d.retry_count ?? 0) },
  ]
  return (
    <div
      style={{
        padding: "16px 20px 14px 48px",
        background: C.g25,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        className="grid grid-cols-2 lg:grid-cols-4"
        style={{
          gap: 14,
          marginBottom: 6,
        }}
      >
        {meta.map((m) => (
          <div key={m.label}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: C.g400,
                fontFamily: F.sans,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: C.g800,
                fontFamily: F.sans,
                marginTop: 3,
                wordBreak: "break-all",
                ...TNUM,
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
      {d.error_message && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 6,
            background: C.negBg,
            border: `1px solid ${C.negBorder}`,
            fontSize: 12,
            color: C.neg,
            fontFamily: F.sans,
            whiteSpace: "pre-wrap",
          }}
        >
          {d.error_message}
        </div>
      )}
      <Collapsible
        label="Input vars"
        code={
          d.input_vars
            ? JSON.stringify(d.input_vars, null, 2)
            : "(vazio)"
        }
      />
      {/* O input EXATO do modelo — fecha o gap "o que entrou" da cadeia
          de formatação (o sha8 do input_vars aponta pro step anterior). */}
      <Collapsible
        label="Prompt renderizado"
        code={d.rendered_prompt ?? "(vazio)"}
      />
      <Collapsible label="Output bruto" code={d.raw_output ?? "(vazio)"} />
      <Collapsible
        label="Output parseado"
        code={
          d.parsed_output
            ? JSON.stringify(d.parsed_output, null, 2)
            : "(vazio)"
        }
      />
      {d.error_stack && (
        <Collapsible label="Error stack" code={d.error_stack} />
      )}
    </div>
  )
}

const DETAIL_COLS = "30px 118px 150px 1fr 152px 124px 86px 116px 78px"

function DetailRow({ row }: { row: RecentRow }) {
  const [open, setOpen] = useState(false)
  const dash = <span style={{ color: C.g300 }}>—</span>
  const fxIsNull = row.cost_cents == null
  return (
    <div style={{ borderBottom: `1px solid ${C.g100}` }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "grid",
          gridTemplateColumns: DETAIL_COLS,
          minWidth: 880,
          gap: 12,
          alignItems: "center",
          padding: "11px 16px",
          cursor: "pointer",
          background: open ? C.blue50 + "55" : "transparent",
        }}
      >
        <span
          style={{
            color: C.g400,
            display: "flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms",
          }}
        >
          <ChevronRight size={15} />
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: C.g600,
            fontFamily: F.sans,
            ...TNUM,
          }}
        >
          {formatTimePt(row.created_at)}
        </span>
        <span
          style={{
            fontSize: 13,
            color: C.g800,
            fontFamily: F.sans,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.store_name ?? "—"}
        </span>
        <div
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: row.email_name ? C.g800 : C.g400,
              fontFamily: F.sans,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.email_name ?? "—"}
          </span>
          {row.flow_type_label && row.flow_type_label !== "—" && (
            <span
              style={{
                fontSize: 11,
                color: C.g400,
                fontFamily: F.sans,
                background: C.g100,
                borderRadius: 4,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              {row.flow_type_label}
            </span>
          )}
        </div>
        <div>
          <AgentChip k={row.agent} size="sm" />
        </div>
        <div>
          <StatusBadge status={row.status} />
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: C.g700,
            fontFamily: F.sans,
            textAlign: "right",
            ...TNUM,
          }}
        >
          {row.duration_ms != null ? formatDuration(row.duration_ms) : dash}
        </span>
        <div style={{ textAlign: "right" }}>
          {!fxIsNull ? (
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: C.g900,
                fontFamily: F.sans,
                ...TNUM,
              }}
            >
              {(row.cost_cents ?? 0) >= 10
                ? usd((row.cost_cents ?? 0) / 100)
                : usd3((row.cost_cents ?? 0) / 100)}
            </div>
          ) : (
            dash
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: C.g600,
            fontFamily: F.sans,
            textAlign: "right",
            ...TNUM,
          }}
        >
          {AGENT_VISUAL[row.agent]?.kind === "imagem" &&
          (row.tokens_input ?? 0) + (row.tokens_output ?? 0) === 0
            ? "1 img"
            : row.tokens_input != null
              ? fmtTok((row.tokens_input ?? 0) + (row.tokens_output ?? 0))
              : dash}
        </span>
      </div>
      {open && <ExpandedDetail rowId={row.id} />}
    </div>
  )
}

function DetailTable({ rows }: { rows: RecentRow[] }) {
  return (
    <Panel
      title="Execuções"
      hint={`${rows.length} mais recentes`}
      pad={0}
      right={
        <div style={{ display: "flex", gap: 8 }}>
          <SelectPill icon={<Filter size={15} />} label="Filtros" />
          <SelectPill icon={<Download size={15} />} label="Exportar" />
        </div>
      }
    >
      <div className="overflow-x-auto scrollbar-thin" style={{ padding: "14px 0 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: DETAIL_COLS,
            minWidth: 880,
            gap: 12,
            padding: "0 16px 10px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {["", "Data", "Loja", "Email", "Agente", "Status", "Duração", "Custo", "Tokens"].map(
            (h, i) => (
              <div
                key={i}
                style={{
                  ...TH_STYLE,
                  textAlign: i >= 6 ? "right" : "left",
                }}
              >
                {h}
              </div>
            ),
          )}
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              fontSize: 12.5,
              color: C.g400,
              fontFamily: F.sans,
            }}
          >
            Sem execuções no período/filtros selecionados.
          </div>
        ) : (
          rows.map((r) => <DetailRow key={r.id} row={r} />)
        )}
      </div>
    </Panel>
  )
}

// ── Workspace principal ───────────────────────────────────────────
const WINDOWS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "14", label: "Últimos 14 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
] as const

export function LogsWorkspace() {
  const [windowDays, setWindowDays] = useState("14")
  const [tab, setTab] = useState<"todos" | "erros" | "andamento" | "fallbacks">(
    "todos",
  )
  const [agentFilter, setAgentFilter] = useState<string>("")
  const [showWindowMenu, setShowWindowMenu] = useState(false)
  const [showAgentMenu, setShowAgentMenu] = useState(false)

  const statusParam =
    tab === "erros"
      ? "&status=error"
      : tab === "andamento"
        ? "&status=running"
        : tab === "fallbacks"
          ? "&status=skipped"
          : ""
  const agentParam = agentFilter ? `&agent=${agentFilter}` : ""

  const { data, isLoading, error } = useSWR<{ data: Payload } | Payload>(
    `/api/admin/email-generation-logs?days=${windowDays}${statusParam}${agentParam}`,
    fetcher,
    { refreshInterval: 30_000 },
  )
  const payload: Payload | undefined =
    data && "totals" in data
      ? (data as Payload)
      : (data as { data: Payload } | undefined)?.data

  const windowLabel =
    WINDOWS.find((w) => w.value === windowDays)?.label ?? "Janela"

  return (
    <div style={{ fontFamily: F.sans, color: C.g900 }}>
      {/* Cabeçalho */}
      <div
        style={{
          padding: "22px 0 16px",
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Mail size={22} color={C.brand} />
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.g900,
                  letterSpacing: "-0.015em",
                  fontFamily: F.sans,
                }}
              >
                Logs de Geração de Emails
              </h1>
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 13,
                color: C.g500,
                fontFamily: F.sans,
              }}
            >
              Acompanhe execuções, custo e métricas dos agentes do pipeline de geração.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              position: "relative",
            }}
          >
            <div style={{ position: "relative" }}>
              <SelectPill
                icon={<Calendar size={15} />}
                label={windowLabel}
                onClick={() => {
                  setShowWindowMenu((s) => !s)
                  setShowAgentMenu(false)
                }}
              />
              {showWindowMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    zIndex: 10,
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: 4,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    minWidth: 180,
                  }}
                >
                  {WINDOWS.map((w) => (
                    <button
                      type="button"
                      key={w.value}
                      onClick={() => {
                        setWindowDays(w.value)
                        setShowWindowMenu(false)
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 10px",
                        background:
                          windowDays === w.value ? C.g100 : "transparent",
                        border: "none",
                        textAlign: "left",
                        fontSize: 12.5,
                        color: C.g700,
                        cursor: "pointer",
                        borderRadius: 4,
                        fontFamily: F.sans,
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <SelectPill
                label={
                  agentFilter
                    ? AGENT_VISUAL[agentFilter as PipelineAgentKey]?.name ??
                      agentFilter
                    : "Todos agentes"
                }
                onClick={() => {
                  setShowAgentMenu((s) => !s)
                  setShowWindowMenu(false)
                }}
              />
              {showAgentMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    zIndex: 10,
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: 4,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    minWidth: 180,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAgentFilter("")
                      setShowAgentMenu(false)
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "6px 10px",
                      background: !agentFilter ? C.g100 : "transparent",
                      border: "none",
                      textAlign: "left",
                      fontSize: 12.5,
                      color: C.g700,
                      cursor: "pointer",
                      borderRadius: 4,
                      fontFamily: F.sans,
                    }}
                  >
                    Todos agentes
                  </button>
                  {PIPELINE_AGENT_ORDER.map((k) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => {
                        setAgentFilter(k)
                        setShowAgentMenu(false)
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 10px",
                        background: agentFilter === k ? C.g100 : "transparent",
                        border: "none",
                        textAlign: "left",
                        fontSize: 12.5,
                        color: C.g700,
                        cursor: "pointer",
                        borderRadius: 4,
                        fontFamily: F.sans,
                      }}
                    >
                      {AGENT_VISUAL[k].name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading && !payload && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 32,
              justifyContent: "center",
              fontSize: 13,
              color: C.g500,
            }}
          >
            <Loader2 size={16} className="animate-spin" /> Carregando logs…
          </div>
        )}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              background: C.negBg,
              border: `1px solid ${C.negBorder}`,
              fontSize: 12.5,
              color: C.neg,
            }}
          >
            {(error as Error).message}
          </div>
        )}
        {payload && (
          <Fragment>
            {payload.truncated && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: C.warnBg,
                  border: `1px solid ${C.warnBorder}`,
                  fontSize: 12.5,
                  color: C.warn,
                }}
              >
                Mais de 10k execuções no período — agregados truncados. Reduza a janela pra precisão total.
              </div>
            )}
            <KpiStrip payload={payload} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.45fr",
                gap: 16,
              }}
            >
              <Panel title="Participação no custo" hint="por agente">
                <CostShareBar
                  byAgent={payload.by_agent}
                  totalUsd={payload.totals.cost_usd}
                />
              </Panel>
              <Panel
                title="Custo e execuções no tempo"
                hint={`últimos ${payload.window_days} dias`}
                right={
                  <div style={{ display: "flex", gap: 14 }}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11.5,
                        color: C.g500,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 3,
                          borderRadius: 2,
                          background: C.brand,
                        }}
                      />
                      custo
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11.5,
                        color: C.g500,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: C.g100,
                        }}
                      />
                      runs
                    </span>
                  </div>
                }
              >
                <SpendChart series={payload.by_day} />
              </Panel>
            </div>
            <AgentSummary payload={payload} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <FilterTabs
                active={tab}
                onPick={(k) => setTab(k as typeof tab)}
                tabs={[
                  { key: "todos", label: "Todos", count: payload.totals.runs },
                  { key: "erros", label: "Erros", count: payload.by_status.error },
                  {
                    key: "andamento",
                    label: "Em andamento",
                    count: payload.by_status.running,
                  },
                  {
                    key: "fallbacks",
                    label: "Fallbacks",
                    count: payload.by_status.skipped ?? 0,
                  },
                ]}
              />
              <div style={{ display: "flex", gap: 8, color: C.g500, fontSize: 12 }}>
                {payload.by_type.length > 0 && (
                  <span>
                    {payload.by_type
                      .slice(0, 3)
                      .map((t) => `${t.label}: ${fmtInt(t.runs)}`)
                      .join(" · ")}
                  </span>
                )}
              </div>
            </div>
            <DetailTable rows={payload.recent} />
          </Fragment>
        )}
      </div>
    </div>
  )
}
