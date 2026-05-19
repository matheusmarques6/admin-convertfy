"use client"

/**
 * Tab: Acompanhamento — health score, weekly reviews, tendência.
 * Mostra estado da loja no Acompanhamento Semanal.
 */

import useSWR from "swr"
import { Section, Badge, C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

interface WeeklyReport {
  id: string
  week_start: string
  week_end: string
  metrics: Record<string, unknown> | null
  highlights: unknown[] | null
  concerns: unknown[] | null
  suggestions: unknown[] | null
  ai_summary: string | null
  is_reviewed: boolean
}

interface AcompanhamentoData {
  health_score: number
  health_state: "rampup" | "healthy" | "attention" | "risk" | "renewal"
  age_days: number
  reports: WeeklyReport[]
  latest_report: WeeklyReport | null
  previous_report: WeeklyReport | null
}

const STATE_LABELS: Record<AcompanhamentoData["health_state"], { label: string; color: string; bg: string; border: string }> = {
  rampup: { label: "Ramp-up", color: C.info, bg: C.infoBg, border: C.infoBorder },
  healthy: { label: "Saudável", color: C.pos, bg: C.posBg, border: C.posBorder },
  attention: { label: "Em atenção", color: C.warn, bg: C.warnBg, border: C.warnBorder },
  risk: { label: "Em risco", color: C.neg, bg: C.negBg, border: C.negBorder },
  renewal: { label: "Renovação", color: C.purple, bg: C.purpleBg, border: C.purpleBorder },
}

export default function TabAcompanhamento({ storeId }: { storeId: string }) {
  const { data, isLoading } = useSWR<{ data?: AcompanhamentoData } | AcompanhamentoData>(
    `/api/stores/${storeId}/acompanhamento`,
    fetcher,
  )
  const payload = (data && "data" in data ? data.data : (data as AcompanhamentoData | undefined)) as
    | AcompanhamentoData
    | undefined

  if (isLoading) {
    return (
      <Section title="Acompanhamento">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Carregando...
        </div>
      </Section>
    )
  }

  if (!payload) {
    return (
      <Section title="Acompanhamento">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Sem dados.
        </div>
      </Section>
    )
  }

  const state = STATE_LABELS[payload.health_state]
  const latest = payload.latest_report

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Health overview */}
      <Section
        title="Saúde da loja"
        right={<Badge tone="neut">{payload.age_days}d na Convertfy</Badge>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center" }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: state.bg,
              border: `2px solid ${state.border}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: state.color, ...TNUM }}>
              {payload.health_score}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: state.color, letterSpacing: 0.6 }}>
              health
            </div>
          </div>
          <div>
            <Badge tone={payload.health_state === "healthy" ? "pos" : payload.health_state === "risk" ? "neg" : "warn"} dot>
              {state.label}
            </Badge>
            <div style={{ marginTop: 10, fontSize: 13, color: C.g700, lineHeight: 1.5 }}>
              {latest?.ai_summary ?? (
                <span style={{ color: C.g500 }}>
                  Sem resumo da semana ainda. O AI processa toda quinta-feira após o ritual.
                </span>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Highlights / Concerns */}
      {latest && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Section title="Destaques da semana">
            {Array.isArray(latest.highlights) && latest.highlights.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {latest.highlights.map((h, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "8px 0",
                      borderBottom: i < latest.highlights!.length - 1 ? `1px solid ${C.g100}` : "none",
                      fontSize: 13,
                      color: C.g700,
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: C.pos, fontWeight: 700 }}>↑</span>
                    {typeof h === "string" ? h : JSON.stringify(h)}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: C.g500, fontSize: 12, padding: "8px 0" }}>—</div>
            )}
          </Section>
          <Section title="Pontos de atenção">
            {Array.isArray(latest.concerns) && latest.concerns.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {latest.concerns.map((c, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "8px 0",
                      borderBottom: i < latest.concerns!.length - 1 ? `1px solid ${C.g100}` : "none",
                      fontSize: 13,
                      color: C.g700,
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: C.neg, fontWeight: 700 }}>↓</span>
                    {typeof c === "string" ? c : JSON.stringify(c)}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: C.g500, fontSize: 12, padding: "8px 0" }}>—</div>
            )}
          </Section>
        </div>
      )}

      {/* Histórico semanas */}
      <Section title={`Histórico · ${payload.reports.length} semanas`}>
        {payload.reports.length === 0 ? (
          <div style={{ color: C.g500, fontSize: 12, padding: "16px 0", textAlign: "center" }}>
            Sem semanas registradas ainda.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {payload.reports.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: C.g50,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ color: C.g700, fontWeight: 600 }}>
                  {new Date(r.week_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}{" "}
                  →{" "}
                  {new Date(r.week_end).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: C.g500 }}>
                    {Array.isArray(r.highlights) ? `${r.highlights.length} destaques` : "—"}
                  </span>
                  <span style={{ color: C.g500 }}>
                    {Array.isArray(r.concerns) ? `${r.concerns.length} alertas` : "—"}
                  </span>
                  {r.is_reviewed && <Badge tone="pos">Revisado</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
