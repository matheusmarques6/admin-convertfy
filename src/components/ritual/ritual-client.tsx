"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { RitualDiagnosticModal } from "./diagnostic-modal"
import { CSPageHeader } from "@/components/cs-crm/cs-page-header"
import {
  CSErrorState,
  CSLoadingState,
  fetcherWithError,
} from "@/components/cs-crm/cs-states"
import { Zap, Filter, Sparkles, Edit3, Info } from "lucide-react"

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  brand100: "#DFE3F6",
  g50: "#F9FAFB",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  posDot: "#10B981",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnDot: "#F59E0B",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  negDot: "#EF4444",
  purple: "#6D28D9",
  purpleBg: "#F5F3FF",
  purpleBorder: "#DDD6FE",
  purpleDot: "#8B5CF6",
  rampup: "#1E40AF",
  rampupBg: "#EFF6FF",
  rampupBorder: "#BFDBFE",
  rampupDot: "#3B82F6",
}

interface RitualSession {
  id: string
  week_start: string
  status: "in_progress" | "completed" | "cancelled"
  started_at: string
  completed_at: string | null
  store_ids: string[]
  current_store_index: number
  participants: string[] | null
  recording_url: string | null
  transcript_status: string | null
}

interface PipelineStore {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  niche: string | null
  country: string | null
  email_platform: string | null
  contract_end_date: string | null
  mrr_value: number | null
  client: {
    id: string
    name: string
    owner: { id: string; name: string | null; avatar_url: string | null } | null
  } | null
}

interface PipelineState {
  id: string
  store_id: string
  current_stage: number
  health_state: "risk" | "attention" | "rampup" | "renewal" | "healthy"
  health_score: number
  flag_reason: string | null
  flagged_at: string
  revenue_change_pct: number | null
  store: PipelineStore
}

type HealthState = PipelineState["health_state"]

const HEALTH_TONE: Record<
  HealthState,
  { color: string; bg: string; border: string; dot: string; label: string; severity: number; minutes: number }
> = {
  risk: {
    color: C.neg,
    bg: C.negBg,
    border: C.negBorder,
    dot: C.negDot,
    label: "Em risco",
    severity: 0,
    minutes: 15,
  },
  renewal: {
    color: C.purple,
    bg: C.purpleBg,
    border: C.purpleBorder,
    dot: C.purpleDot,
    label: "Renovação",
    severity: 1,
    minutes: 12,
  },
  attention: {
    color: C.warn,
    bg: C.warnBg,
    border: C.warnBorder,
    dot: C.warnDot,
    label: "Em atenção",
    severity: 2,
    minutes: 12,
  },
  rampup: {
    color: C.rampup,
    bg: C.rampupBg,
    border: C.rampupBorder,
    dot: C.rampupDot,
    label: "Ramp-up",
    severity: 3,
    minutes: 6,
  },
  healthy: {
    color: C.pos,
    bg: C.posBg,
    border: C.posBorder,
    dot: C.posDot,
    label: "Saudável",
    severity: 4,
    minutes: 3,
  },
}

function fridayOf(weekStart: string): Date {
  // weekStart é segunda (YYYY-MM-DD em UTC). Sexta = +4 dias.
  const monday = new Date(`${weekStart}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() + 4)
  return monday
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function platformLabel(platform: string | null, email: string | null): string {
  const parts: string[] = []
  if (platform) parts.push(platform.charAt(0).toUpperCase() + platform.slice(1))
  if (email && email !== "none") {
    const e = email.charAt(0).toUpperCase() + email.slice(1)
    if (!parts.includes(e)) parts.push(e)
  }
  return parts.join(" · ") || "—"
}

function initialsFor(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?"
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

  const { data: pipelineData, mutate: mutatePipeline } = useSWR<{
    data?: {
      by_stage: Record<number, PipelineState[]>
      health_counts: Record<HealthState, number>
    }
  }>("/api/acompanhamento/pipeline", fetcherWithError, {
    shouldRetryOnError: false,
  })

  const healthCounts =
    pipelineData?.data?.health_counts ??
    ({ risk: 0, attention: 0, rampup: 0, renewal: 0, healthy: 0 } as Record<
      HealthState,
      number
    >)

  // Ordena por severidade (risk > renewal > attention > rampup > healthy)
  const queue = useMemo(() => {
    const stage1Raw = pipelineData?.data?.by_stage?.[1] ?? []
    return [...stage1Raw].sort((a, b) => {
      const sa = HEALTH_TONE[a.health_state]?.severity ?? 99
      const sb = HEALTH_TONE[b.health_state]?.severity ?? 99
      if (sa !== sb) return sa - sb
      return (a.health_score ?? 100) - (b.health_score ?? 100)
    })
  }, [pipelineData])

  const totalMinutes = useMemo(
    () =>
      queue.reduce((sum, q) => sum + (HEALTH_TONE[q.health_state]?.minutes ?? 3), 0),
    [queue],
  )

  const healthyCount = healthCounts.healthy
  // 3 owners únicos pra avatares
  const ownerAvatars = useMemo(() => {
    const seen = new Map<
      string,
      { id: string; name: string | null; avatar_url: string | null }
    >()
    for (const r of queue) {
      const o = r.store.client?.owner
      if (o && o.id && !seen.has(o.id)) seen.set(o.id, o)
      if (seen.size >= 3) break
    }
    return [...seen.values()]
  }, [queue])

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
        throw new Error(
          body?.error?.message || body?.error || "Falha ao sinalizar lojas",
        )
      }
      const d = body.data ?? body
      setFlagMessage(
        d.flagged > 0
          ? `${d.flagged} loja(s) sinalizadas · ${d.skipped} sem critério` +
              (d.errors > 0 ? ` · ${d.errors} erro(s)` : "")
          : `Nenhuma loja sinalizada (${d.total_stores} avaliadas, ${d.skipped} sem critério).`,
      )
      await Promise.all([mutatePipeline(), mutateSessions()])
    } catch (e) {
      setFlagMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setFlagging(false)
    }
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  async function startRitual() {
    if (creating) return
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

  const isEmpty = queue.length === 0
  const friday = weekStart ? fridayOf(weekStart) : null
  const hours = Math.max(1, Math.round(totalMinutes / 60))
  const endHour = 14 + hours // ritual começa 14h
  const peopleConnected =
    (activeSession?.participants?.length ?? 0) || 1

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <CSPageHeader
        title="Ritual de Sexta"
        description="Reflexão semanal guiada por IA: o CM avalia as lojas em risco com diagnóstico estruturado e planeja ações pra semana seguinte."
        active="ritual"
      />

      {/* HEADER GRANDE */}
      <div
        style={{
          padding: 24,
          background: "#fff",
          border: `1px solid ${C.g200}`,
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: C.g900,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                Ritual de acompanhamento semanal
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: activeSession ? C.brand50 : C.posBg,
                  color: activeSession ? C.brand : C.pos,
                  border: `1px solid ${activeSession ? C.brand100 : C.posBorder}`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: activeSession ? C.brand : C.posDot,
                    display: "inline-block",
                  }}
                />
                {activeSession ? "Em andamento" : "Pronto pra começar"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                fontSize: 12.5,
                color: C.g500,
                flexWrap: "wrap",
              }}
            >
              {friday && (
                <span
                  style={{
                    color: C.g700,
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {formatDate(friday)}
                </span>
              )}
              {!isEmpty && (
                <>
                  <span style={{ color: C.g300 }}>·</span>
                  <span>
                    Estimativa: <strong style={{ color: C.g700 }}>{queue.length} lojas</strong>
                  </span>
                  <span style={{ color: C.g300 }}>·</span>
                  <span>~{hours}h</span>
                  <span style={{ color: C.g300 }}>·</span>
                  <span>encerra ~{endHour}h</span>
                </>
              )}
              <span style={{ color: C.g300 }}>·</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: C.pos,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: C.posDot,
                    display: "inline-block",
                  }}
                />
                {peopleConnected} {peopleConnected === 1 ? "pessoa conectada" : "pessoas conectadas"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* Avatars */}
            {ownerAvatars.length > 0 && (
              <div style={{ display: "flex", marginRight: 4 }}>
                {ownerAvatars.map((o, i) => (
                  <div
                    key={o.id}
                    title={o.name ?? "Sem nome"}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: o.avatar_url ? "transparent" : C.warnBg,
                      color: C.warn,
                      border: `2px solid #fff`,
                      boxShadow: `0 0 0 1px ${C.g200}`,
                      marginLeft: i === 0 ? 0 : -8,
                      fontSize: 11,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundImage: o.avatar_url
                        ? `url(${o.avatar_url})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    {!o.avatar_url && initialsFor(o.name)}
                  </div>
                ))}
              </div>
            )}
            {!isEmpty && (
              <button
                type="button"
                style={{
                  padding: "8px 14px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: C.g700,
                  background: "#fff",
                  border: `1px solid ${C.g300}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Edit3 size={13} />
                Editar fila
              </button>
            )}
            {!isEmpty && (
              <button
                type="button"
                onClick={() => (activeSession ? setModalOpen(true) : startRitual())}
                disabled={creating}
                style={{
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.brand,
                  border: "none",
                  borderRadius: 6,
                  cursor: creating ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Zap size={14} fill="#fff" />
                {activeSession
                  ? "Continuar ritual"
                  : creating
                    ? "Iniciando..."
                    : "Iniciar ritual"}
              </button>
            )}
          </div>
        </div>

        {/* Banner IA */}
        {!isEmpty && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: C.brand50,
              border: `1px solid ${C.brand100}`,
              borderRadius: 6,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Sparkles size={15} style={{ color: C.brand, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: C.g700, lineHeight: 1.5 }}>
              <strong style={{ color: C.g900 }}>
                A IA pré-processou as {queue.length} lojas no domingo 22h.
              </strong>{" "}
              Cada loja tem funil completo, 80/20 dos problemas, comparativo
              histórico e dados Klaviyo/Omnisend conectados. Fathom grava em
              background. Ao final, upload da gravação extrai decisões e cria
              tasks automaticamente.
            </div>
          </div>
        )}

        {/* STATS CARDS */}
        {!isEmpty && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
              marginTop: 16,
            }}
          >
            <StatCard label="Lojas no ritual" value={queue.length} />
            <StatCard
              label="Em risco"
              value={healthCounts.risk}
              dot={C.negDot}
            />
            <StatCard
              label="Em atenção"
              value={healthCounts.attention}
              dot={C.warnDot}
            />
            <StatCard
              label="Renovação"
              value={healthCounts.renewal}
              dot={C.purpleDot}
            />
            <StatCard
              label="Saudáveis"
              value={healthCounts.healthy}
              dot={C.posDot}
            />
          </div>
        )}
      </div>

      {/* ESTADO VAZIO (sem lojas na fila) */}
      {isEmpty && (
        <div
          style={{
            padding: 24,
            background: "#fff",
            border: `1px solid ${C.g200}`,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, marginBottom: 4 }}>
                Nenhuma loja na fila do ritual ainda
              </div>
              <div style={{ fontSize: 12, color: C.g500 }}>
                O cron de domingo 22h roda automaticamente — ou dispare manualmente abaixo pra popular agora.
              </div>
              {flagMessage && (
                <div
                  style={{
                    marginTop: 10,
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
                  }}
                >
                  {flagMessage}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => flagNow(true)}
                disabled={flagging}
                title="Popula a fila com TODAS as lojas ativas (cada uma com seu health_state correto)"
                style={{
                  padding: "9px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.brand,
                  border: "none",
                  borderRadius: 6,
                  cursor: flagging ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Zap size={13} fill="#fff" />
                {flagging ? "Sinalizando..." : "Sinalizar lojas agora"}
              </button>
              <button
                type="button"
                onClick={() => flagNow(false)}
                disabled={flagging}
                title="Só flagga lojas com critério (risk/attention/renewal/rampup) — saudáveis ficam de fora"
                style={{
                  padding: "9px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: C.g700,
                  background: "transparent",
                  border: `1px dashed ${C.g300}`,
                  borderRadius: 6,
                  cursor: flagging ? "wait" : "pointer",
                }}
              >
                Só com critério
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILA DO RITUAL */}
      {!isEmpty && (
        <>
          <div
            style={{
              background: "#fff",
              border: `1px solid ${C.g200}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {/* Cabeçalho da fila */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${C.g100}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.g900 }}>
                  Fila do ritual
                </div>
                <div style={{ fontSize: 11.5, color: C.g500, marginTop: 2 }}>
                  Ordenadas por urgência · arraste para reordenar (raramente necessário)
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={{
                    padding: "6px 12px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: C.g700,
                    background: "#fff",
                    border: `1px solid ${C.g300}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Filter size={12} />
                  Filtrar
                </button>
                <button
                  type="button"
                  style={{
                    padding: "6px 12px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: C.g700,
                    background: "#fff",
                    border: `1px solid ${C.g300}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Sparkles size={12} />
                  Reordenar IA
                </button>
              </div>
            </div>

            {/* Tabela */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr
                    style={{
                      background: C.g50,
                      borderBottom: `1px solid ${C.g200}`,
                    }}
                  >
                    <Th style={{ width: 44, textAlign: "center" }}>#</Th>
                    <Th>Loja · cliente</Th>
                    <Th>Vertical · plano</Th>
                    <Th>Estado</Th>
                    <Th>Motivo de entrada</Th>
                    <Th style={{ textAlign: "right" }}>Sinais</Th>
                    <Th style={{ textAlign: "right", width: 80 }}>Tempo</Th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((state, i) => {
                    const tone = HEALTH_TONE[state.health_state]
                    const minutes = tone?.minutes ?? 3
                    const store = state.store
                    return (
                      <tr
                        key={state.id}
                        style={{
                          borderBottom:
                            i < queue.length - 1 ? `1px solid ${C.g100}` : "none",
                        }}
                      >
                        <td
                          style={{
                            padding: "12px 16px",
                            color: C.g400,
                            fontSize: 11.5,
                            fontVariantNumeric: "tabular-nums",
                            textAlign: "center",
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: "50%",
                                background: C.g100,
                                color: C.g700,
                                fontSize: 12,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {initialsFor(store.store_name).charAt(0)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: C.g900,
                                }}
                              >
                                {store.store_name}
                              </div>
                              {store.client?.name && (
                                <div style={{ fontSize: 11, color: C.g500 }}>
                                  {store.client.name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: C.g700,
                            fontSize: 12,
                          }}
                        >
                          <div>{store.niche ?? "—"}</div>
                          <div style={{ fontSize: 11, color: C.g500 }}>
                            {platformLabel(store.platform, store.email_platform)}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "3px 9px",
                              color: tone.color,
                              background: tone.bg,
                              border: `1px solid ${tone.border}`,
                              borderRadius: 999,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: tone.dot,
                                display: "inline-block",
                              }}
                            />
                            {tone.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: C.g700,
                            fontSize: 12,
                            maxWidth: 360,
                          }}
                        >
                          {state.flag_reason ?? "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {store.mrr_value != null && (
                            <div style={{ fontSize: 12, color: C.g700 }}>
                              MRR{" "}
                              <strong style={{ color: C.g900 }}>
                                R$ {store.mrr_value.toLocaleString("pt-BR")}
                              </strong>
                            </div>
                          )}
                          {state.revenue_change_pct != null && (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color:
                                  state.revenue_change_pct >= 0
                                    ? C.pos
                                    : C.neg,
                              }}
                            >
                              {state.revenue_change_pct >= 0 ? "+" : ""}
                              {state.revenue_change_pct.toFixed(1).replace(".", ",")}% receita
                            </div>
                          )}
                          {store.mrr_value == null &&
                            state.revenue_change_pct == null && (
                              <span style={{ color: C.g400, fontSize: 11 }}>—</span>
                            )}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            fontSize: 11.5,
                            color: C.g500,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ~{minutes}min
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer saudáveis */}
          {healthyCount > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: C.posBg,
                border: `1px solid ${C.posBorder}`,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: C.pos,
              }}
            >
              <Info size={14} />
              <span>
                <strong>+ {healthyCount} loja{healthyCount === 1 ? "" : "s"} saudáve{healthyCount === 1 ? "l" : "is"}</strong>{" "}
                {healthyCount === 1 ? "pula" : "pulam"} direto pra Etapa 3
                (pronta pra feedback do Ryan)
              </span>
            </div>
          )}

          {/* Botão de re-sincronizar (sutil, fora do bloco principal) */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            {flagMessage && (
              <span
                style={{
                  fontSize: 11.5,
                  color: flagMessage.startsWith("Erro") ? C.neg : C.g500,
                }}
              >
                {flagMessage}
              </span>
            )}
            <button
              type="button"
              onClick={() => flagNow(true)}
              disabled={flagging}
              title="Re-sincroniza a fila com base no estado atual das lojas (mantém edições)"
              style={{
                padding: "6px 12px",
                fontSize: 11.5,
                fontWeight: 500,
                color: C.g500,
                background: "transparent",
                border: `1px solid ${C.g200}`,
                borderRadius: 4,
                cursor: flagging ? "wait" : "pointer",
              }}
            >
              {flagging ? "Sincronizando..." : "↻ Re-sincronizar fila"}
            </button>
          </div>
        </>
      )}

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

function StatCard({
  label,
  value,
  dot,
}: {
  label: string
  value: number
  dot?: string
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${C.g200}`,
        borderRadius: 5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.g500,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {dot && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: dot,
              display: "inline-block",
            }}
          />
        )}
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: C.g900,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 10.5,
        fontWeight: 700,
        color: C.g500,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        ...style,
      }}
    >
      {children}
    </th>
  )
}
