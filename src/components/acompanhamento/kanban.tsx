"use client"

import { useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => r.json())

const C = {
  brand: "#2137B6",
  brandLight: "#4E62D8",
  brand50: "#EEF0FB",
  brand100: "#C7CDEF",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
}

interface PipelineState {
  id: string
  store_id: string
  current_stage: number
  health_state: string
  health_score: number
  flag_reason: string | null
  approved_actions: unknown[]
  ai_message: string | null
  feedback_sent_at: string | null
  feedback_method: string | null
  flagged_at: string
  approved_at: string | null
  ai_message_generated_at: string | null
  store: {
    id: string
    store_name: string
    store_url: string | null
    platform: string | null
    niche: string | null
    country: string | null
    mrr_value: number | null
    client: {
      id: string
      name: string
      owner: { id: string; name: string; avatar_url: string | null } | null
    } | null
  }
}

const STAGES = [
  { id: 1, name: "Precisa atenção", tag: "CALL SEXTA", tagColor: C.brand, hint: "IA sinalizou" },
  { id: 2, name: "Em otimização", tag: "TIME", tagColor: C.warn, hint: "Designer + Ops executando" },
  { id: 3, name: "Pronta pra feedback", tag: "RYAN", tagColor: C.pos, hint: "Mensagem IA pronta" },
  { id: 4, name: "Feedback enviado", tag: "", tagColor: C.g500, hint: "Reset domingo 22h" },
] as const

const HEALTH_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  rampup: { label: "Ramp-up", color: C.brand, bg: C.brand50 },
  healthy: { label: "Saudável", color: C.pos, bg: C.posBg },
  attention: { label: "Em atenção", color: C.warn, bg: C.warnBg },
  risk: { label: "Em risco", color: C.neg, bg: C.negBg },
  renewal: { label: "Renovação", color: C.purple, bg: C.purpleBg },
}

function moneyBRL(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
  return `R$ ${n.toFixed(0)}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600_000)
  if (hours < 1) return "agora"
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

export function AcompanhamentoKanban() {
  const { data, mutate, isLoading } = useSWR<{
    data?: {
      week_start: string
      total: number
      by_stage: Record<number, PipelineState[]>
      stage_counts: Record<number, number>
    }
  }>("/api/acompanhamento/pipeline", fetcher, { revalidateOnFocus: false })

  const payload = data?.data
  const router = useRouter()
  const [moving, setMoving] = useState<string | null>(null)
  const [selectedState, setSelectedState] = useState<PipelineState | null>(null)

  async function moveStage(state: PipelineState, newStage: number, feedbackMethod?: string) {
    setMoving(state.id)
    try {
      await fetch(`/api/acompanhamento/pipeline/${state.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_stage: newStage,
          ...(feedbackMethod ? { feedback_method: feedbackMethod } : {}),
        }),
      })
      mutate()
    } finally {
      setMoving(null)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>
        Carregando pipeline de acompanhamento...
      </div>
    )
  }

  if (!payload) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>
        Erro ao carregar.
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: C.g50, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.g900, margin: 0 }}>
            Acompanhamento Semanal
          </h1>
          <div style={{ fontSize: 13, color: C.g500, marginTop: 4 }}>
            Semana de{" "}
            {new Date(payload.week_start).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
            })}{" "}
            · {payload.total} lojas no pipeline
          </div>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid ${C.g200}`,
            background: "#fff",
            borderRadius: 4,
            cursor: "pointer",
            color: C.g700,
          }}
        >
          Atualizar
        </button>
      </div>

      {/* Kanban */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          minHeight: "calc(100vh - 140px)",
        }}
      >
        {STAGES.map((stage) => {
          const items = payload.by_stage[stage.id] ?? []
          return (
            <div
              key={stage.id}
              style={{
                background: C.g100,
                borderRadius: 6,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 4px 12px",
                  borderBottom: `1px solid ${C.g200}`,
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.g900 }}>
                    {stage.name}
                    <span style={{ color: C.g500, fontWeight: 500, marginLeft: 6 }}>· {items.length}</span>
                  </div>
                  {stage.tag && (
                    <div
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        color: "#fff",
                        background: stage.tagColor,
                        borderRadius: 3,
                        letterSpacing: 0.6,
                      }}
                    >
                      {stage.tag}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.g500, marginTop: 4 }}>{stage.hint}</div>
                </div>
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {items.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      fontSize: 11,
                      color: C.g500,
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    Nenhuma loja
                  </div>
                ) : (
                  items.map((state) => {
                    const health = HEALTH_LABELS[state.health_state] ?? HEALTH_LABELS.healthy
                    const isMoving = moving === state.id
                    return (
                      <div
                        key={state.id}
                        onClick={() => setSelectedState(state)}
                        style={{
                          background: "#fff",
                          border: `1px solid ${C.g200}`,
                          borderRadius: 4,
                          padding: 10,
                          cursor: "pointer",
                          opacity: isMoving ? 0.5 : 1,
                          transition: "all 0.15s",
                        }}
                      >
                        {/* Top row: health + MRR */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 6px",
                              color: health.color,
                              background: health.bg,
                              borderRadius: 3,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                            }}
                          >
                            {health.label} · {state.health_score}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.g700, fontVariantNumeric: "tabular-nums" }}>
                            {moneyBRL(state.store.mrr_value)}
                          </span>
                        </div>

                        {/* Title */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.g900, marginBottom: 2 }}>
                          {state.store.store_name}
                        </div>
                        {state.store.client?.name && (
                          <div style={{ fontSize: 11, color: C.g500, marginBottom: 6 }}>
                            {state.store.client.name}
                          </div>
                        )}

                        {/* Reason */}
                        {state.flag_reason && (
                          <div
                            style={{
                              fontSize: 11,
                              color: C.g700,
                              padding: 6,
                              background: C.g50,
                              borderRadius: 3,
                              marginBottom: 6,
                              lineHeight: 1.4,
                            }}
                          >
                            {state.flag_reason}
                          </div>
                        )}

                        {/* Timestamp */}
                        <div style={{ fontSize: 9, color: C.g500 }}>
                          Flagged {timeAgo(state.flagged_at)}
                          {state.approved_at && ` · Aprovada ${timeAgo(state.approved_at)}`}
                          {state.feedback_sent_at && ` · Enviado ${timeAgo(state.feedback_sent_at)}`}
                        </div>

                        {/* Quick actions */}
                        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                          {state.current_stage < 4 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                void moveStage(state, state.current_stage + 1)
                              }}
                              disabled={isMoving}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "3px 8px",
                                color: "#fff",
                                background: C.brand,
                                border: "none",
                                borderRadius: 3,
                                cursor: isMoving ? "wait" : "pointer",
                                flex: 1,
                              }}
                            >
                              Avançar →
                            </button>
                          )}
                          {state.current_stage > 1 && state.current_stage < 4 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                void moveStage(state, state.current_stage - 1)
                              }}
                              disabled={isMoving}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "3px 8px",
                                color: C.g700,
                                background: "transparent",
                                border: `1px solid ${C.g200}`,
                                borderRadius: 3,
                                cursor: isMoving ? "wait" : "pointer",
                              }}
                            >
                              ← Voltar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Drawer detalhe */}
      {selectedState && (
        <StateDrawer
          state={selectedState}
          onClose={() => setSelectedState(null)}
          onUpdate={() => {
            mutate()
            setSelectedState(null)
          }}
          onNavigate={(storeId) => router.push(`/admin/stores/${storeId}`)}
        />
      )}
    </div>
  )
}

function StateDrawer({
  state,
  onClose,
  onUpdate,
  onNavigate,
}: {
  state: PipelineState
  onClose: () => void
  onUpdate: () => void
  onNavigate: (storeId: string) => void
}) {
  const [aiMessage, setAiMessage] = useState(state.ai_message ?? "")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const health = HEALTH_LABELS[state.health_state] ?? HEALTH_LABELS.healthy

  async function generateMessage() {
    setGenerating(true)
    try {
      const r = await fetch(`/api/acompanhamento/pipeline/${state.id}/generate-message`, {
        method: "POST",
        credentials: "include",
      })
      const json = await r.json()
      const message = json.data?.message ?? json.message
      if (message) {
        setAiMessage(message)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function saveMessage() {
    setSaving(true)
    try {
      await fetch(`/api/acompanhamento/pipeline/${state.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ai_message: aiMessage }),
      })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  async function markSent(method: "whatsapp" | "email" | "call") {
    await fetch(`/api/acompanhamento/pipeline/${state.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ current_stage: 4, feedback_method: method }),
    })
    onUpdate()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 50 }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "92vw",
          background: "#fff",
          zIndex: 51,
          overflowY: "auto",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.g200}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.g900 }}>
              {state.store.store_name}
            </div>
            {state.store.client?.name && (
              <div style={{ fontSize: 12, color: C.g500, marginTop: 2 }}>
                {state.store.client.name}
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  color: health.color,
                  background: health.bg,
                  borderRadius: 3,
                  textTransform: "uppercase",
                }}
              >
                {health.label} · {state.health_score}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  color: C.brand,
                  background: C.brand50,
                  borderRadius: 3,
                  textTransform: "uppercase",
                }}
              >
                Etapa {state.current_stage}/4
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 22, color: C.g500, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {state.flag_reason && (
            <SectionBlock title="Motivo da entrada">
              <div style={{ fontSize: 13, color: C.g700, lineHeight: 1.5 }}>{state.flag_reason}</div>
            </SectionBlock>
          )}

          {state.current_stage >= 2 && (
            <SectionBlock title="Ações aprovadas">
              {Array.isArray(state.approved_actions) && state.approved_actions.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {state.approved_actions.map((a, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "6px 0",
                        borderBottom: i < state.approved_actions.length - 1 ? `1px solid ${C.g100}` : "none",
                        fontSize: 13,
                        color: C.g700,
                      }}
                    >
                      {typeof a === "string" ? a : JSON.stringify(a)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: C.g500, fontSize: 12 }}>—</div>
              )}
            </SectionBlock>
          )}

          {(state.current_stage >= 3 || state.ai_message != null) && (
            <SectionBlock title="Mensagem pro cliente (WhatsApp)">
              <textarea
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                placeholder="Mensagem que o Ryan vai enviar..."
                style={{
                  width: "100%",
                  minHeight: 120,
                  padding: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                  border: `1px solid ${C.g200}`,
                  borderRadius: 4,
                  outline: "none",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={generateMessage}
                    disabled={generating}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "6px 12px",
                      color: "#fff",
                      background: C.purple,
                      border: "none",
                      borderRadius: 4,
                      cursor: generating ? "wait" : "pointer",
                      opacity: generating ? 0.7 : 1,
                    }}
                  >
                    {generating ? "Gerando..." : "✨ Gerar via IA"}
                  </button>
                  <button
                    type="button"
                    onClick={saveMessage}
                    disabled={saving || !aiMessage.trim()}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "6px 12px",
                      color: C.brand,
                      background: "transparent",
                      border: `1px solid ${C.brand}`,
                      borderRadius: 4,
                      cursor: saving ? "wait" : "pointer",
                      opacity: !aiMessage.trim() ? 0.5 : 1,
                    }}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
                {state.current_stage === 3 && (
                  <button
                    type="button"
                    onClick={() => markSent("whatsapp")}
                    style={btnPrimary()}
                  >
                    ✓ Enviei WhatsApp
                  </button>
                )}
              </div>
            </SectionBlock>
          )}

          <button
            type="button"
            onClick={() => onNavigate(state.store_id)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 12px",
              color: "#fff",
              background: C.g700,
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Ver detalhe da loja →
          </button>
        </div>
      </div>
    </>
  )
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          color: C.g500,
          marginBottom: 6,
          letterSpacing: 0.4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function btnPrimary(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "6px 12px",
    color: "#fff",
    background: C.pos,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  }
}
