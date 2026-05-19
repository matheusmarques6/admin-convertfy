"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { CSPageHeader } from "./cs-page-header"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
}

interface PipelineItem {
  id: string
  store_id: string
  store_name: string
  mrr_value: number | null
  client_name: string | null
  call_id: string | null
  conducted_at: string | null
  next_call_date: string | null
  action_items: string | null
  duration_minutes: number | null
}

interface PipelineData {
  stages: {
    a_marcar: PipelineItem[]
    aguardando: PipelineItem[]
    agendadas: PipelineItem[]
    hoje: PipelineItem[]
    pos_call_pendente: PipelineItem[]
    finalizadas: PipelineItem[]
  }
  counts: Record<string, number>
  total: number
}

const STAGES: Array<{ key: keyof PipelineData["stages"]; title: string; tag: string; color: string; hint: string }> = [
  { key: "a_marcar", title: "A marcar", tag: "ATRASADA", color: C.neg, hint: "Sem call há 30d+" },
  { key: "aguardando", title: "Aguardando", tag: "CONVITE", color: C.warn, hint: "Próx call 4-30d" },
  { key: "agendadas", title: "Agendadas", tag: "PRÓX 3D", color: C.brand, hint: "Esta semana" },
  { key: "hoje", title: "Hoje", tag: "HOJE", color: C.purple, hint: "Acontece hoje" },
  { key: "pos_call_pendente", title: "Pós-call pendente", tag: "TODO", color: C.warn, hint: "Subir notas" },
  { key: "finalizadas", title: "Finalizadas", tag: "✓", color: C.pos, hint: "Últimos 30d" },
]

function moneyBRL(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
  return `R$ ${n.toFixed(0)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function daysFromNow(iso: string | null): string {
  if (!iso) return ""
  const diff = new Date(iso).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d atrás`
  if (days === 0) return "hoje"
  if (days === 1) return "amanhã"
  return `em ${days}d`
}

export function CallsPipeline() {
  const router = useRouter()
  const [view, setView] = useState<"kanban" | "calendar">("kanban")
  const { data, isLoading, mutate } = useSWR<{ data?: PipelineData }>(
    "/api/cs-crm/calls-pipeline",
    fetcher,
    { refreshInterval: 60_000 },
  )

  const payload = data?.data

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>Carregando...</div>
  }
  if (!payload) {
    return <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>Erro ao carregar.</div>
  }

  return (
    <div style={{ padding: 20, background: C.g50, minHeight: "100vh" }}>
      <CSPageHeader
        title="Pipeline de Calls Mensais"
        description={`Pipeline com 6 etapas das calls de feedback mensais: de "A marcar" até "Finalizadas". Visualização Kanban ou Calendário. ${payload.total} lojas no fluxo · Auto-refresh 60s.`}
        active="calls"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                display: "flex",
                border: `1px solid ${C.g200}`,
                borderRadius: 4,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <button
                type="button"
                onClick={() => setView("kanban")}
                style={toggleBtn(view === "kanban")}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setView("calendar")}
                style={toggleBtn(view === "calendar")}
              >
                Calendário
              </button>
            </div>
            <button type="button" onClick={() => mutate()} style={btnPrimary()}>
              Atualizar
            </button>
          </div>
        }
      />

      {view === "kanban" ? (
        <KanbanView payload={payload} onCardClick={(item) => router.push(`/admin/stores/${item.store_id}?tab=calls`)} />
      ) : (
        <CalendarView payload={payload} onCardClick={(item) => router.push(`/admin/stores/${item.store_id}?tab=calls`)} />
      )}
    </div>
  )
}

function KanbanView({ payload, onCardClick }: { payload: PipelineData; onCardClick: (item: PipelineItem) => void }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 10,
        minWidth: 1200,
      }}
    >
      {STAGES.map((stage) => {
        const items = payload.stages[stage.key]
        return (
          <div
            key={stage.key}
            style={{
              background: C.g100,
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 200,
            }}
          >
            <div style={{ paddingBottom: 10, marginBottom: 8, borderBottom: `1px solid ${C.g200}` }}>
              <div
                style={{
                  display: "inline-block",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  color: "#fff",
                  background: stage.color,
                  borderRadius: 3,
                  letterSpacing: 0.6,
                  marginBottom: 4,
                }}
              >
                {stage.tag}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.g900 }}>
                {stage.title}
                <span style={{ color: C.g500, fontWeight: 500, marginLeft: 4 }}>· {items.length}</span>
              </div>
              <div style={{ fontSize: 10, color: C.g500, marginTop: 2 }}>{stage.hint}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.length === 0 ? (
                <div
                  style={{
                    padding: "20px 12px",
                    fontSize: 11,
                    color: C.g500,
                    textAlign: "center",
                    background: "#fff",
                    border: `1px dashed ${C.g200}`,
                    borderRadius: 4,
                    lineHeight: 1.5,
                  }}
                >
                  Sem lojas
                  <div style={{ fontSize: 10, color: C.g500, marginTop: 4 }}>
                    {stage.hint}
                  </div>
                </div>
              ) : (
                items.map((item) => <CallCard key={item.id + (item.call_id ?? "")} item={item} onClick={() => onCardClick(item)} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CallCard({ item, onClick }: { item: PipelineItem; onClick: () => void }) {
  const isUpcoming = !!item.next_call_date
  const dateToShow = isUpcoming ? item.next_call_date : item.conducted_at
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${C.g200}`,
        borderRadius: 4,
        padding: 10,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.g900, flex: 1, minWidth: 0 }}>
          {item.store_name}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.g700, fontVariantNumeric: "tabular-nums" }}>
          {moneyBRL(item.mrr_value)}
        </span>
      </div>
      {item.client_name && (
        <div style={{ fontSize: 10, color: C.g500, marginBottom: 6 }}>{item.client_name}</div>
      )}
      {dateToShow && (
        <div
          style={{
            fontSize: 11,
            color: isUpcoming ? C.brand : C.g700,
            fontWeight: 600,
            padding: "4px 8px",
            background: isUpcoming ? C.brand50 : C.g50,
            borderRadius: 3,
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {isUpcoming ? "📅" : "✓"} {fmtDate(dateToShow)}
          <span style={{ fontSize: 9, color: C.g500, marginLeft: "auto" }}>
            {daysFromNow(dateToShow)}
          </span>
        </div>
      )}
      {item.action_items && (
        <div
          style={{
            fontSize: 10,
            color: C.g700,
            padding: 6,
            background: C.g50,
            borderRadius: 3,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            lineHeight: 1.4,
          }}
        >
          {item.action_items}
        </div>
      )}
    </div>
  )
}

function CalendarView({ payload, onCardClick }: { payload: PipelineData; onCardClick: (item: PipelineItem) => void }) {
  // Próximas calls agrupadas por data
  const upcoming = [
    ...payload.stages.aguardando,
    ...payload.stages.agendadas,
    ...payload.stages.hoje,
  ]
    .filter((c) => c.next_call_date || c.conducted_at)
    .sort((a, b) => {
      const aDate = new Date(a.next_call_date ?? a.conducted_at ?? "").getTime()
      const bDate = new Date(b.next_call_date ?? b.conducted_at ?? "").getTime()
      return aDate - bDate
    })

  // Agrupa por dia
  const byDay = new Map<string, PipelineItem[]>()
  for (const item of upcoming) {
    const dateStr = (item.next_call_date ?? item.conducted_at ?? "").slice(0, 10)
    const arr = byDay.get(dateStr) ?? []
    arr.push(item)
    byDay.set(dateStr, arr)
  }

  const days = Array.from(byDay.keys()).sort()

  if (days.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          background: "#fff",
          borderRadius: 6,
          border: `1px solid ${C.g200}`,
          textAlign: "center",
          color: C.g500,
        }}
      >
        Nenhuma call planejada nos próximos 30 dias.
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {days.map((day) => {
        const items = byDay.get(day) ?? []
        const dayDate = new Date(day + "T00:00:00")
        const dayLabel = dayDate.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })
        const isToday =
          dayDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)

        return (
          <div
            key={day}
            style={{
              background: "#fff",
              borderRadius: 6,
              border: `1px solid ${isToday ? C.brand : C.g200}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: isToday ? C.brand50 : C.g50,
                borderBottom: `1px solid ${C.g100}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? C.brand : C.g700, textTransform: "capitalize" }}>
                {dayLabel}
                {isToday && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      background: C.brand,
                      color: "#fff",
                      borderRadius: 3,
                      marginLeft: 8,
                      letterSpacing: 0.4,
                    }}
                  >
                    HOJE
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: C.g500 }}>{items.length} call{items.length > 1 ? "s" : ""}</span>
            </div>
            <div>
              {items.map((item) => (
                <div
                  key={item.id + (item.call_id ?? "")}
                  onClick={() => onCardClick(item)}
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${C.g100}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>{item.store_name}</div>
                    {item.client_name && (
                      <div style={{ fontSize: 11, color: C.g500 }}>{item.client_name}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.g700, fontVariantNumeric: "tabular-nums" }}>
                    {moneyBRL(item.mrr_value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: active ? "#fff" : C.g700,
    background: active ? C.brand : "transparent",
    border: "none",
    cursor: "pointer",
  }
}

function btnPrimary(): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: C.brand,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  }
}
