"use client"

import { useRouter } from "next/navigation"
import useSWR from "swr"
import { CSPageHeader } from "./cs-page-header"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  brandLight: "#4E62D8",
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

interface StoreRef {
  id: string
  store_name: string
  mrr_value: number | null
  client: { id: string; name: string } | null
}

interface KanbanCard {
  id: string
  store_id?: string
  store?: StoreRef | null
  ai_message?: string | null
  flag_reason?: string | null
  health_state?: string
  health_score?: number
  next_call_date?: string | null
  conducted_at?: string | null
  feedback_sent_at?: string | null
  feedback_method?: string | null
}

interface CSCrmData {
  urgente: KanbanCard[]
  calls_hoje: KanbanCard[]
  feedbacks: KanbanCard[]
  agendar_call: KanbanCard[]
  pos_call_pendente: KanbanCard[]
  concluidos_hoje: KanbanCard[]
}

const COLUMNS: Array<{
  key: keyof CSCrmData
  title: string
  tag: string
  tagColor: string
  hint: string
}> = [
  { key: "urgente", title: "Urgente", tag: "SLA", tagColor: C.neg, hint: "Lojas em risco" },
  { key: "calls_hoje", title: "Calls hoje", tag: "AGENDA", tagColor: C.brand, hint: "Reuniões do dia" },
  { key: "feedbacks", title: "Feedbacks WhatsApp", tag: "RYAN", tagColor: C.pos, hint: "Mensagem IA pronta" },
  { key: "agendar_call", title: "Agendar calls", tag: "30D+", tagColor: C.warn, hint: "Sem call recente" },
  { key: "pos_call_pendente", title: "Pós-call pendente", tag: "TODO", tagColor: C.purple, hint: "Subir notas/ações" },
  { key: "concluidos_hoje", title: "Concluídos hoje", tag: "OK", tagColor: C.g500, hint: "Memória do dia" },
]

function moneyBRL(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
  return `R$ ${n.toFixed(0)}`
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function CSCrmHome() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<{ data?: CSCrmData }>(
    "/api/cs-crm/home",
    fetcher,
    { refreshInterval: 60_000 },
  )

  const payload = data?.data
  const total =
    (payload?.urgente.length ?? 0) +
    (payload?.calls_hoje.length ?? 0) +
    (payload?.feedbacks.length ?? 0) +
    (payload?.agendar_call.length ?? 0) +
    (payload?.pos_call_pendente.length ?? 0) +
    (payload?.concluidos_hoje.length ?? 0)

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>Carregando CRM...</div>
    )
  }

  return (
    <div style={{ padding: 20, background: C.g50, minHeight: "100vh" }}>
      <CSPageHeader
        title="CRM Customer Success"
        description={`Painel diário dos CMs com 6 colunas que priorizam o trabalho do dia: lojas urgentes, calls de hoje, feedbacks prontos e pós-call. ${total} cards no painel · Auto-refresh 60s.`}
        active="crm"
        right={
          <button type="button" onClick={() => mutate()} style={btnPrimary()}>
            Atualizar agora
          </button>
        }
      />

      {/* Kanban 6 colunas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 10,
          minWidth: 1200,
        }}
      >
        {COLUMNS.map((col) => {
          const items = (payload?.[col.key] ?? []) as KanbanCard[]
          return (
            <div
              key={col.key}
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
              <div
                style={{
                  paddingBottom: 10,
                  marginBottom: 8,
                  borderBottom: `1px solid ${C.g200}`,
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    color: "#fff",
                    background: col.tagColor,
                    borderRadius: 3,
                    letterSpacing: 0.6,
                    marginBottom: 4,
                  }}
                >
                  {col.tag}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.g900 }}>
                  {col.title}
                  <span style={{ color: C.g500, fontWeight: 500, marginLeft: 4 }}>· {items.length}</span>
                </div>
                <div style={{ fontSize: 10, color: C.g500, marginTop: 2 }}>{col.hint}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                {items.length === 0 ? (
                  <div
                    style={{
                      padding: "20px 10px",
                      fontSize: 11,
                      color: C.g500,
                      textAlign: "center",
                      background: "#fff",
                      border: `1px dashed ${C.g200}`,
                      borderRadius: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    Sem cards
                    <div style={{ fontSize: 10, color: C.g500, marginTop: 4 }}>
                      {col.hint}
                    </div>
                  </div>
                ) : (
                  items.map((card) => (
                    <KanbanCardComponent
                      key={card.id}
                      card={card}
                      onClick={() => card.store_id && router.push(`/admin/stores/${card.store_id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCardComponent({
  card,
  onClick,
}: {
  card: KanbanCard
  onClick: () => void
}) {
  const store = card.store
  if (!store) return null

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${C.g200}`,
        borderRadius: 4,
        padding: 10,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.g900, flex: 1, minWidth: 0 }}>
          {store.store_name}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.g700, fontVariantNumeric: "tabular-nums" }}>
          {moneyBRL(store.mrr_value)}
        </span>
      </div>

      {store.client?.name && (
        <div style={{ fontSize: 10, color: C.g500, marginBottom: 6 }}>{store.client.name}</div>
      )}

      {/* Health */}
      {card.health_state && (
        <div
          style={{
            display: "inline-block",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            color: card.health_state === "risk" ? C.neg : C.warn,
            background: card.health_state === "risk" ? C.negBg : C.warnBg,
            borderRadius: 3,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            marginBottom: 6,
          }}
        >
          {card.health_state} · {card.health_score}
        </div>
      )}

      {/* Flag reason / AI message preview */}
      {card.flag_reason && (
        <div style={{ fontSize: 10, color: C.g700, padding: 6, background: C.g50, borderRadius: 3, marginBottom: 6, lineHeight: 1.4 }}>
          {card.flag_reason}
        </div>
      )}
      {card.ai_message && (
        <div
          style={{
            fontSize: 10,
            color: C.g700,
            padding: 6,
            background: C.brand50,
            border: `1px solid ${C.brand50}`,
            borderRadius: 3,
            marginBottom: 6,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
          }}
        >
          {card.ai_message}
        </div>
      )}

      {/* Footer timestamps */}
      <div style={{ fontSize: 9, color: C.g500 }}>
        {card.conducted_at && `Call ${timeAgo(card.conducted_at)} atrás`}
        {card.feedback_sent_at && `Enviado ${timeAgo(card.feedback_sent_at)} atrás`}
        {card.next_call_date && `· Próxima ${new Date(card.next_call_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
      </div>
    </div>
  )
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
