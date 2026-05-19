"use client"

/**
 * Tab: Onboarding — mostra o estado do onboarding ativo da loja:
 *  - Pipeline 7 etapas com etapa atual destacada
 *  - Lista de tasks agrupadas por etapa (com progresso)
 *  - Briefing status + payment/contract
 *  - SLA visual + tempo na etapa atual
 */

import useSWR from "swr"
import { useState } from "react"
import { Section, Badge, C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

type Profile = { id: string; name: string; avatar_url: string | null } | null

interface OnboardingTask {
  id: string
  title: string
  status: string
  priority: string | null
  assignee_id: string | null
  completed_at: string | null
  operational_column_id: string | null
  due_date: string | null
  assignee: Profile
}

interface OnboardingColumn {
  id: string
  position: number
  name: string
  responsible_role: string
  sla_days: number
  color: string | null
}

interface OnboardingStatusData {
  active: boolean
  onboarding?: {
    id: string
    status: string
    current_column_id: string | null
    current_version: number
    payment_status: string
    contract_status: string
    briefing_status: string
    form_submitted_at: string | null
    briefing_confirmed_at: string | null
    entered_at: string
    last_column_change_at: string
    completed_at: string | null
    current_column: OnboardingColumn | null
  }
  last_onboarding?: { id: string; status: string; completed_at: string | null } | null
  columns: OnboardingColumn[]
  tasks: OnboardingTask[]
  tasks_by_column: Record<string, OnboardingTask[]>
  progress_pct: number
  total_tasks: number
  completed_tasks: number
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return "hoje"
  if (days === 1) return "ontem"
  if (days < 7) return `${days}d atrás`
  if (days < 30) return `${Math.floor(days / 7)}sem atrás`
  return d.toLocaleDateString("pt-BR")
}

const ROLE_LABELS: Record<string, string> = {
  cs: "CS",
  cliente: "Cliente",
  designer: "Designer",
  estrategista: "Estrategista",
  ops: "Ops",
  sistema: "Sistema",
}

export default function TabOnboardingStatus({ storeId }: { storeId: string }) {
  const { data, error, isLoading } = useSWR<{ data?: OnboardingStatusData } | OnboardingStatusData>(
    `/api/stores/${storeId}/onboarding-status`,
    fetcher,
  )
  const payload = (data && "data" in data ? data.data : (data as OnboardingStatusData | undefined)) as
    | OnboardingStatusData
    | undefined
  const [expandedCol, setExpandedCol] = useState<string | null>(null)

  if (isLoading) {
    return (
      <Section title="Onboarding">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Carregando status do onboarding...
        </div>
      </Section>
    )
  }

  if (error || !payload) {
    return (
      <Section title="Onboarding">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Erro ao carregar onboarding.
        </div>
      </Section>
    )
  }

  if (!payload.active) {
    return (
      <Section title="Onboarding">
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.g700, fontWeight: 600, marginBottom: 4 }}>
            {payload.last_onboarding?.status === "completed"
              ? "Onboarding concluído"
              : "Loja ainda sem onboarding"}
          </div>
          <div style={{ fontSize: 12, color: C.g500 }}>
            {payload.last_onboarding?.status === "completed"
              ? "Esta loja já passou pelo processo de implementação."
              : "Crie um onboarding pra essa loja a partir do menu Onboarding."}
          </div>
        </div>
      </Section>
    )
  }

  const onb = payload.onboarding!
  const currentCol = onb.current_column

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header com progresso */}
      <Section
        title="Onboarding em andamento"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.g500, ...TNUM }}>
              {payload.completed_tasks} / {payload.total_tasks} tasks
            </span>
            <Badge tone="purple" dot>
              v{onb.current_version}
            </Badge>
          </div>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: C.g700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {currentCol?.name ?? "—"} · {ROLE_LABELS[currentCol?.responsible_role ?? ""] ?? "—"}
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, color: C.brand, ...TNUM }}>
              {payload.progress_pct}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: C.g100,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${payload.progress_pct}%`,
                height: "100%",
                background: C.brand,
                transition: "width 0.4s",
              }}
            />
          </div>
        </div>

        {/* KPIs do onboarding */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginTop: 12,
          }}
        >
          <KpiPill label="Briefing" value={onb.briefing_status} tone={onb.briefing_status === "approved" ? "pos" : "warn"} />
          <KpiPill label="Pagamento" value={onb.payment_status} tone={onb.payment_status === "paid" ? "pos" : "warn"} />
          <KpiPill label="Contrato" value={onb.contract_status} tone={onb.contract_status === "signed" ? "pos" : "warn"} />
          <KpiPill label="Etapa há" value={timeAgo(onb.last_column_change_at)} tone="neut" />
        </div>
      </Section>

      {/* Pipeline 7 etapas */}
      <Section title="Pipeline">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {payload.columns.map((col) => {
            const colTasks = payload.tasks_by_column[col.id] ?? []
            const completed = colTasks.filter((t) => t.status === "completed" || t.completed_at).length
            const isCurrent = onb.current_column_id === col.id
            const isCompleted = completed === colTasks.length && colTasks.length > 0
            const expanded = expandedCol === col.id
            return (
              <div
                key={col.id}
                style={{
                  border: `1px solid ${isCurrent ? C.brand : C.g200}`,
                  borderRadius: 6,
                  background: isCurrent ? C.blue50 : "#fff",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedCol(expanded ? null : col.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: isCompleted ? C.pos : isCurrent ? C.brand : C.g200,
                        color: isCompleted || isCurrent ? "#fff" : C.g600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {isCompleted ? "✓" : col.position}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
                        {col.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.g500 }}>
                        {ROLE_LABELS[col.responsible_role] ?? col.responsible_role} ·{" "}
                        SLA {col.sla_days}d
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {colTasks.length > 0 && (
                      <span style={{ fontSize: 11, color: C.g500, ...TNUM }}>
                        {completed}/{colTasks.length}
                      </span>
                    )}
                    {isCurrent && <Badge tone="info" dot>Atual</Badge>}
                  </div>
                </button>
                {expanded && colTasks.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.g100}`, background: "#fff" }}>
                    {colTasks.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          padding: "8px 14px 8px 48px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 12,
                          color: C.g700,
                          borderBottom: `1px solid ${C.g50}`,
                        }}
                      >
                        <span
                          style={{
                            textDecoration: t.status === "completed" ? "line-through" : "none",
                            color: t.status === "completed" ? C.g500 : C.g900,
                          }}
                        >
                          {t.status === "completed" ? "✓ " : "○ "}
                          {t.title}
                        </span>
                        {t.assignee?.name && (
                          <span style={{ fontSize: 11, color: C.g500 }}>
                            {t.assignee.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

function KpiPill({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "pos" | "neg" | "warn" | "neut"
}) {
  const colors = {
    pos: { color: C.pos, bg: C.posBg, border: C.posBorder },
    neg: { color: C.neg, bg: C.negBg, border: C.negBorder },
    warn: { color: C.warn, bg: C.warnBg, border: C.warnBorder },
    neut: { color: C.neut, bg: C.neutBg, border: C.neutBorder },
  }[tone]
  return (
    <div
      style={{
        padding: "8px 10px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: C.g500, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.color }}>{value}</div>
    </div>
  )
}
