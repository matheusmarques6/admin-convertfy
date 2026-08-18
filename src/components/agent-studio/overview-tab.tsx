"use client"

/**
 * Estúdio de Agentes — aba Visão Geral (topo dos logs mantido, fiel à
 * maquete): KPIs, participação no custo, custo × execuções no tempo e
 * resumo por agente. Fonte: GET /api/admin/email-generation-logs (a mesma
 * da página de logs — números idênticos por construção).
 */

import { useMemo } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Mail } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { ROUTES } from "@/lib/routes"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import {
  AgentChip,
  Kpi,
  Panel,
  brl,
  fmtInt,
  usd,
  usd3,
} from "./studio-atoms"
import type { LogsPayload } from "./studio-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function CostShareBar({ byAgent }: { byAgent: LogsPayload["by_agent"] }) {
  const ranked = byAgent
    .filter((a) => a.cost_usd > 0)
    .sort((a, b) => b.cost_usd - a.cost_usd)
  const total = ranked.reduce((s, a) => s + a.cost_usd, 0)
  if (total === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
        Sem custo registrado na janela.
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
            title={`${AGENT_VISUAL[a.agent]?.name ?? a.agent} · ${usd(a.cost_usd)}`}
            style={{
              width: `${(a.cost_usd / total) * 100}%`,
              background: AGENT_VISUAL[a.agent]?.color ?? C.g400,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 16px", marginTop: 11 }}>
        {ranked.map((a) => (
          <div key={a.agent} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: AGENT_VISUAL[a.agent]?.color ?? C.g400,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: C.g700, fontFamily: F.sans, fontWeight: 500 }}>
              {AGENT_VISUAL[a.agent]?.name ?? a.agent}
            </span>
            <span style={{ fontSize: 12, color: C.g400, fontFamily: F.sans, ...TNUM }}>
              {((a.cost_usd / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpendChart({ byDay }: { byDay: LogsPayload["by_day"] }) {
  const w = 720
  const h = 132
  const padL = 4
  const padR = 4
  const padT = 10
  const padB = 22
  const iw = w - padL - padR
  const ih = h - padT - padB
  const series = byDay
  if (series.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
        Sem execuções na janela.
      </div>
    )
  }
  const maxUsd = Math.max(...series.map((s) => s.cost_usd), 0.01) * 1.12
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
  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const dayLabel = (day: string) => {
    // "2026-08-11" → "11/08"
    const [, m, d] = day.split("-")
    return d && m ? `${d}/${m}` : day
  }
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: h, display: "block" }}
    >
      <defs>
        <linearGradient id="studioSpendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4E62D8" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#4E62D8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
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
        return <rect key={s.day} x={bx} y={by} width={bw * 0.44} height={bh} rx="2" fill={C.g100} />
      })}
      <path d={area} fill="url(#studioSpendFill)" />
      <path
        d={line}
        fill="none"
        stroke="#4E62D8"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <circle
          key={series[i].day}
          cx={p[0]}
          cy={p[1]}
          r={i === n - 1 ? 3.5 : 0}
          fill="#4E62D8"
          stroke="#fff"
          strokeWidth="1.5"
        />
      ))}
      {series.map((s, i) =>
        i % labelEvery === 0 ? (
          <text
            key={s.day}
            x={x(i)}
            y={h - 6}
            textAnchor="middle"
            fontSize="10"
            fill={C.g400}
            fontFamily={F.sans}
          >
            {dayLabel(s.day)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

const DAY_OPTIONS = [7, 14, 30, 90]

export function OverviewTab({
  days,
  onDays,
}: {
  days: number
  onDays: (d: number) => void
}) {
  const { data, isLoading } = useSWR<LogsPayload>(
    `/api/admin/email-generation-logs?days=${days}`,
    fetcher,
  )

  const fx = data?.fx_brl_rate ?? null
  const totals = data?.totals

  const kpis = useMemo(() => {
    if (!totals) return null
    const avgCost = totals.tracked_runs > 0 ? totals.cost_usd / totals.tracked_runs : 0
    const totTok = (totals.tokens_input ?? 0) + (totals.tokens_output ?? 0)
    const errPct = totals.runs > 0 ? (totals.errors / totals.runs) * 100 : 0
    return { avgCost, totTok, errPct }
  }, [totals])

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#F6F7F9" }}>
      <div
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "22px 28px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ color: C.brand, display: "flex" }}>
                <Mail size={21} />
              </span>
              <h1
                style={{
                  margin: 0,
                  fontSize: 21,
                  fontWeight: 600,
                  color: C.g900,
                  letterSpacing: "-0.015em",
                  fontFamily: F.sans,
                }}
              >
                Visão geral do pipeline
              </h1>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: C.g500, fontFamily: F.sans }}>
              Acompanhe execuções, custo e métricas dos agentes do pipeline de geração.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={String(days)}
              onChange={(e) => onDays(parseInt(e.target.value, 10))}
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.g700,
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: F.sans,
                cursor: "pointer",
              }}
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Últimos {d} dias
                </option>
              ))}
            </select>
            <Link
              href={ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION_LOGS}
              style={{
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 11px",
                borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.g700,
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: F.sans,
                textDecoration: "none",
              }}
            >
              Log detalhado →
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi
            label="Execuções"
            value={totals ? fmtInt(totals.runs) : "…"}
            sub={
              totals
                ? `${fmtInt(totals.tracked_runs)} rastreadas · ${fmtInt(totals.external_runs)} externas`
                : undefined
            }
            accent={C.brand}
          />
          <Kpi
            label="Custo total"
            value={totals ? usd(totals.cost_usd) : "…"}
            sub={totals && fx ? brl(totals.cost_usd * fx) : undefined}
            accent="#7C3AED"
          />
          <Kpi
            label="Custo médio / exec"
            value={kpis ? usd3(kpis.avgCost) : "…"}
            sub={kpis && fx ? brl(kpis.avgCost * fx) : undefined}
            accent="#D97706"
          />
          <Kpi
            label="Tempo médio"
            value={
              totals?.avg_duration_ms != null
                ? (totals.avg_duration_ms / 1000).toFixed(1).replace(".", ",") + "s"
                : "—"
            }
            sub="execuções rastreadas"
            accent="#065F46"
          />
          <Kpi
            label="Tokens"
            value={
              kpis
                ? kpis.totTok >= 1e6
                  ? (kpis.totTok / 1e6).toFixed(1).replace(".", ",") + "M"
                  : fmtInt(kpis.totTok)
                : "…"
            }
            sub="in + out · acumulado"
            accent="#2137B6"
          />
          <Kpi
            label="Taxa de erro"
            value={kpis ? `${kpis.errPct.toFixed(1).replace(".", ",")}%` : "…"}
            sub={
              totals
                ? `${fmtInt(totals.errors)} erros · ${fmtInt(totals.retries)} retries`
                : undefined
            }
            accent={totals && totals.errors > 0 ? C.warn : C.pos}
            tone={totals && totals.errors > 0 ? C.warn : C.g900}
          />
        </div>

        {/* Gráficos */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 5fr) minmax(360px, 7fr)",
            gap: 16,
          }}
        >
          <Panel title="Participação no custo" hint="por agente">
            {data ? (
              <CostShareBar byAgent={data.by_agent} />
            ) : (
              <div style={{ height: 40 }} />
            )}
          </Panel>
          <Panel
            title="Custo e execuções no tempo"
            hint={`últimos ${days} dias`}
            right={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 14, height: 2.5, borderRadius: 2, background: C.brand }} />
                  custo
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      background: C.g100,
                      border: `1px solid ${C.g200}`,
                    }}
                  />
                  runs
                </span>
              </div>
            }
          >
            {data ? <SpendChart byDay={data.by_day} /> : <div style={{ height: 132 }} />}
          </Panel>
        </div>

        {/* Resumo por agente */}
        <Panel title="Resumo por agente" hint={`ordenado por custo · ${days} dias`} pad={0}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Agente",
                    "Execuções",
                    "Custo (US$ · R$)",
                    "Custo / exec",
                    "Tempo médio",
                    "Erros / retries",
                  ].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? "left" : "right",
                        padding: "10px 18px",
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: C.g400,
                        fontFamily: F.sans,
                        borderBottom: `1px solid ${C.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.by_agent ?? [])
                  .filter((a) => a.runs > 0)
                  .sort((a, b) => b.cost_usd - a.cost_usd)
                  .map((a) => {
                    const vis = AGENT_VISUAL[a.agent]
                    const external = vis?.external === true
                    const cells = [
                      fmtInt(a.runs),
                      external
                        ? "—"
                        : `${usd(a.cost_usd)}${fx ? ` · ${brl(a.cost_usd * fx)}` : ""}`,
                      external || a.runs === 0 ? "—" : usd3(a.cost_usd / a.runs),
                      a.avg_duration_ms != null
                        ? (a.avg_duration_ms / 1000).toFixed(1).replace(".", ",") + "s"
                        : "—",
                      a.errors || a.retries ? `${a.errors} · ${a.retries}` : "0",
                    ]
                    return (
                      <tr key={a.agent}>
                        <td
                          style={{ padding: "9px 18px", borderBottom: `1px solid ${C.g100}` }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <AgentChip k={a.agent as PipelineAgentKey} size="sm" />
                            <span
                              style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, ...TNUM }}
                            >
                              {a.model ?? (external ? "n8n (externo)" : "—")}
                            </span>
                          </div>
                        </td>
                        {cells.map((v, i) => (
                          <td
                            key={i}
                            style={{
                              padding: "9px 18px",
                              textAlign: "right",
                              fontSize: 12.5,
                              color: i === 4 && v !== "0" ? C.warn : C.g700,
                              fontFamily: F.sans,
                              ...TNUM,
                              borderBottom: `1px solid ${C.g100}`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                {!isLoading && data && data.by_agent.every((a) => a.runs === 0) && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "24px 18px",
                        fontSize: 12.5,
                        color: C.g400,
                        fontFamily: F.sans,
                        textAlign: "center",
                      }}
                    >
                      Nenhuma execução na janela selecionada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
