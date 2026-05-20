"use client"

import { useState } from "react"
import useSWR from "swr"
import { RitualDiagnosticModal } from "./diagnostic-modal"
import { CSPageHeader } from "@/components/cs-crm/cs-page-header"
import {
  CSErrorState,
  CSLoadingState,
  fetcherWithError,
} from "@/components/cs-crm/cs-states"


const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
}

interface RitualSession {
  id: string
  week_start: string
  status: "in_progress" | "completed" | "cancelled"
  started_at: string
  completed_at: string | null
  store_ids: string[]
  current_store_index: number
  recording_url: string | null
  transcript_status: string | null
}

const HEALTH_TONE: Record<string, { color: string; bg: string; label: string }> = {
  risk: { color: C.neg, bg: C.negBg, label: "Em risco" },
  attention: { color: C.warn, bg: C.warnBg, label: "Em atenção" },
  rampup: { color: C.brand, bg: C.brand50, label: "Ramp-up" },
  renewal: { color: C.purple, bg: C.purpleBg, label: "Renovação" },
  healthy: { color: C.pos, bg: C.posBg, label: "Saudável" },
}

export function RitualClient() {
  const {
    data: sessionsData,
    error: sessionsError,
    mutate: mutateSessions,
    isLoading: sessionsLoading,
  } = useSWR<{
    data?: { sessions: RitualSession[]; week_start: string }
  }>("/api/ritual/sessions", fetcherWithError, { shouldRetryOnError: false })

  const sessions = sessionsData?.data?.sessions ?? []
  const weekStart = sessionsData?.data?.week_start

  const activeSession = sessions.find((s) => s.status === "in_progress")

  // Lojas em Etapa 1 (preview)
  const { data: pipelineData, mutate: mutatePipeline } = useSWR<{
    data?: {
      by_stage: Record<number, Array<{ id: string; store_id: string; health_state: string; flag_reason: string | null; store: { store_name: string; mrr_value: number | null; client: { name: string } | null } }>>
    }
  }>("/api/acompanhamento/pipeline", fetcherWithError, {
    shouldRetryOnError: false,
  })

  // Estado pra "Sinalizar lojas agora" (dispara mesmo flagging do cron)
  const [flagging, setFlagging] = useState(false)
  const [flagMessage, setFlagMessage] = useState<string | null>(null)

  async function flagNow(force: boolean) {
    if (flagging) return
    setFlagging(true)
    setFlagMessage(null)
    try {
      const res = await fetch("/api/admin/acompanhamento/flag-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body?.error?.message || body?.error || "Falha ao sinalizar lojas")
      }
      const d = body.data ?? body
      setFlagMessage(
        d.flagged > 0
          ? `${d.flagged} loja(s) sinalizadas · ${d.skipped} sem critério` +
              (d.errors > 0 ? ` · ${d.errors} erro(s)` : "")
          : `Nenhuma loja tem critério pra ser sinalizada agora (${d.total_stores} avaliadas). Use "Forçar todas" pra demo.`,
      )
      await Promise.all([mutatePipeline(), mutateSessions()])
    } catch (e) {
      setFlagMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setFlagging(false)
    }
  }

  const stage1 = pipelineData?.data?.by_stage?.[1] ?? []

  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  async function startRitual() {
    setCreating(true)
    try {
      const r = await fetch("/api/ritual/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (r.ok) {
        await mutateSessions()
        setModalOpen(true)
      }
    } finally {
      setCreating(false)
    }
  }

  if (sessionsLoading) {
    return <CSLoadingState label="Carregando ritual..." />
  }

  if (sessionsError) {
    return (
      <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
        <CSPageHeader
          title="Ritual de Sexta"
          description="Reflexão semanal guiada por IA."
          active="ritual"
        />
        <CSErrorState
          error={sessionsError}
          onRetry={() => mutateSessions()}
          title="Não foi possível carregar o ritual"
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <CSPageHeader
        title="Ritual de Sexta"
        description={`Reflexão semanal guiada por IA: o CM avalia as lojas em risco com diagnóstico estruturado e planeja ações pra semana seguinte. ${weekStart ? `Semana de ${new Date(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}.` : ""}`}
        active="ritual"
      />

      {/* Active session card */}
      {activeSession ? (
        <div
          style={{
            padding: 24,
            background: "linear-gradient(135deg, #fff 0%, " + C.brand50 + " 100%)",
            border: `1px solid ${C.brand}`,
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Ritual em andamento
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.g900 }}>
              {activeSession.current_store_index + 1} de {activeSession.store_ids.length} lojas
            </div>
            <div style={{ fontSize: 12, color: C.g500, marginTop: 4 }}>
              Iniciado{" "}
              {new Date(activeSession.started_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: C.brand,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Continuar ritual →
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: 24,
            background: "#fff",
            border: `1px solid ${C.g200}`,
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, marginBottom: 4 }}>
              {stage1.length} lojas aguardando diagnóstico
            </div>
            <div style={{ fontSize: 12, color: C.g500 }}>
              {stage1.length > 0
                ? "Clique pra iniciar a sessão e discutir uma por uma com a IA."
                : "Nenhuma loja flagged essa semana. O cron domingo 22h roda automaticamente — ou dispare manualmente abaixo."}
            </div>
            {flagMessage && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  background: flagMessage.startsWith("Erro")
                    ? C.negBg
                    : flagMessage.startsWith("Nenhuma")
                      ? C.warnBg
                      : C.posBg,
                  color: flagMessage.startsWith("Erro")
                    ? C.neg
                    : flagMessage.startsWith("Nenhuma")
                      ? C.warn
                      : C.pos,
                  border: `1px solid ${
                    flagMessage.startsWith("Erro")
                      ? C.negBorder
                      : flagMessage.startsWith("Nenhuma")
                        ? C.warnBorder
                        : C.posBorder
                  }`,
                  borderRadius: 4,
                  fontSize: 11.5,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                {flagMessage}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {stage1.length === 0 && (
              <>
                <button
                  type="button"
                  onClick={() => flagNow(false)}
                  disabled={flagging}
                  title="Roda mesma lógica do cron de domingo 22h: flag só lojas com critério (risk/attention/rampup/renewal)"
                  style={{
                    padding: "10px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.brand,
                    background: "#fff",
                    border: `1px solid ${C.brand}`,
                    borderRadius: 6,
                    cursor: flagging ? "wait" : "pointer",
                  }}
                >
                  {flagging ? "Sinalizando..." : "⚡ Sinalizar agora"}
                </button>
                <button
                  type="button"
                  onClick={() => flagNow(true)}
                  disabled={flagging}
                  title="Modo demo: flagga TODAS as lojas (mesmo healthy) pra você poder testar o ritual"
                  style={{
                    padding: "10px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.g700,
                    background: "transparent",
                    border: `1px dashed ${C.g300}`,
                    borderRadius: 6,
                    cursor: flagging ? "wait" : "pointer",
                  }}
                >
                  Forçar todas (demo)
                </button>
              </>
            )}
            {stage1.length > 0 && (
              <button
                type="button"
                onClick={startRitual}
                disabled={creating}
                style={{
                  padding: "10px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.brand,
                  border: "none",
                  borderRadius: 6,
                  cursor: creating ? "wait" : "pointer",
                }}
              >
                {creating ? "Iniciando..." : "▶ Iniciar ritual"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stage 1 stores list (preview) */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${C.g200}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.g100}`, fontSize: 11, fontWeight: 700, color: C.g700, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Ordem de discussão · {stage1.length} lojas
        </div>
        {stage1.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: C.g500, fontSize: 13 }}>
            Nenhuma loja sinalizada.
          </div>
        ) : (
          stage1.map((state, i) => {
            const health = HEALTH_TONE[state.health_state] ?? HEALTH_TONE.healthy
            return (
              <div
                key={state.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 16px",
                  borderBottom: i < stage1.length - 1 ? `1px solid ${C.g100}` : "none",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: C.g100,
                    color: C.g700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
                    {state.store.store_name}
                  </div>
                  {state.store.client?.name && (
                    <div style={{ fontSize: 11, color: C.g500 }}>{state.store.client.name}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      color: health.color,
                      background: health.bg,
                      borderRadius: 3,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {health.label}
                  </span>
                  {state.store.mrr_value != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.g700, fontVariantNumeric: "tabular-nums" }}>
                      R$ {(state.store.mrr_value / 1000).toFixed(1)}k
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {modalOpen && activeSession && (
        <RitualDiagnosticModal
          session={activeSession}
          onClose={() => setModalOpen(false)}
          onUpdate={() => mutateSessions()}
        />
      )}
    </div>
  )
}
