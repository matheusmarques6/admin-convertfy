"use client"

import { useMemo, useState, useCallback } from "react"
import useSWR from "swr"
import { RitualDiagnosticModal } from "./diagnostic-modal"
import {
  Zap, Filter, Settings, ChevronRight, MoreHorizontal, X,
} from "lucide-react"

const C = {
  brand: "#4E62D8",
  brandBase: "#2137B6",
  brandDark: "#041366",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g900: "#111827",
  border: "rgba(0,0,0,0.08)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  posDot: "#047857",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  negDot: "#B91C1C",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnDot: "#B45309",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
  purpleBorder: "#DDD6FE",
  purpleDot: "#7C3AED",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
  rampup: "#4E62D8",
  rampupBg: "#EEF0FB",
  rampupBorder: "#C7CDEF",
  rampupDot: "#4E62D8",
}

const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

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
  health_state: HealthState
  health_score: number
  flag_reason: string | null
  flagged_at: string
  revenue_change_pct: number | null
  store: PipelineStore
}

type HealthState = "risk" | "attention" | "renewal" | "rampup" | "healthy"

const HEALTH_TONE: Record<
  HealthState,
  {
    color: string; bg: string; border: string; dot: string
    label: string; severity: number; minutes: number
    tone: string; avatarBg: string; avatarC: string
  }
> = {
  risk: {
    color: C.neg, bg: C.negBg, border: C.negBorder, dot: C.negDot,
    label: "Em risco", severity: 0, minutes: 15, tone: "neg",
    avatarBg: "#FEF2F2", avatarC: "#991B1B",
  },
  renewal: {
    color: C.purple, bg: C.purpleBg, border: C.purpleBorder, dot: C.purpleDot,
    label: "Renovação", severity: 1, minutes: 12, tone: "purple",
    avatarBg: "#F3E8FF", avatarC: "#7C3AED",
  },
  attention: {
    color: C.warn, bg: C.warnBg, border: C.warnBorder, dot: C.warnDot,
    label: "Em atenção", severity: 2, minutes: 12, tone: "warn",
    avatarBg: "#FFFBEB", avatarC: "#92400E",
  },
  rampup: {
    color: C.rampup, bg: C.rampupBg, border: C.rampupBorder, dot: C.rampupDot,
    label: "Ramp-up", severity: 3, minutes: 6, tone: "info",
    avatarBg: "#EEF0FB", avatarC: "#4E62D8",
  },
  healthy: {
    color: C.pos, bg: C.posBg, border: C.posBorder, dot: C.posDot,
    label: "Saudável", severity: 4, minutes: 3, tone: "pos",
    avatarBg: "#ECFDF5", avatarC: "#065F46",
  },
}

function fridayOf(weekStart: string): Date {
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

function platformLabel(niche: string | null, platform: string | null, email: string | null): string {
  const parts: string[] = []
  if (niche) parts.push(niche)
  if (platform) parts.push(platform.charAt(0).toUpperCase() + platform.slice(1))
  if (email && email !== "none") {
    const e = email.charAt(0).toUpperCase() + email.slice(1)
    if (!parts.includes(e)) parts.push(e)
  }
  return parts.join(" · ") || "—"
}

const fetcherWithError = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || r.statusText)
    }
    return r.json()
  })

export function RitualClient() {
  const {
    data: sessionsData,
    error: sessionsError,
    mutate: mutateSessions,
    isLoading: sessionsLoading,
  } = useSWR<{
    success?: boolean
    sessions?: RitualSession[]
    week_start?: string
  }>("/api/ritual/sessions", fetcherWithError, { shouldRetryOnError: false })

  const sessions = sessionsData?.sessions ?? []
  const weekStart = sessionsData?.week_start

  const activeSession = sessions.find((s) => s.status === "in_progress")

  const { data: pipelineData, error: pipelineError, mutate: mutatePipeline } = useSWR<{
    success?: boolean
    by_stage?: Record<number, PipelineState[]>
    health_counts?: Record<HealthState, number>
  }>("/api/acompanhamento/pipeline", fetcherWithError, {
    shouldRetryOnError: false,
  })

  const healthCounts =
    pipelineData?.health_counts ??
    ({ risk: 0, attention: 0, rampup: 0, renewal: 0, healthy: 0 } as Record<HealthState, number>)

  const queue = useMemo(() => {
    const stage1Raw = pipelineData?.by_stage?.[1] ?? []
    return [...stage1Raw].sort((a, b) => {
      const sa = HEALTH_TONE[a.health_state]?.severity ?? 99
      const sb = HEALTH_TONE[b.health_state]?.severity ?? 99
      if (sa !== sb) return sa - sb
      return (a.health_score ?? 100) - (b.health_score ?? 100)
    })
  }, [pipelineData])

  const totalMinutes = useMemo(
    () => queue.reduce((sum, q) => sum + (HEALTH_TONE[q.health_state]?.minutes ?? 3), 0),
    [queue],
  )

  const healthyCount = healthCounts.healthy
  const ownerAvatars = useMemo(() => {
    const seen = new Map<string, { id: string; name: string | null; avatar_url: string | null }>()
    for (const r of queue) {
      const o = r.store.client?.owner
      if (o && o.id && !seen.has(o.id)) seen.set(o.id, o)
      if (seen.size >= 3) break
    }
    return [...seen.values()]
  }, [queue])

  const [flagging, setFlagging] = useState(false)
  const [flagMessage, setFlagMessage] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const flagNow = useCallback(async (force: boolean) => {
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
      if (!res.ok) throw new Error(body?.error?.message || body?.error || "Falha ao sinalizar lojas")
      const d = body.data ?? body
      setFlagMessage(
        d.flagged > 0
          ? `${d.flagged} loja(s) sinalizadas`
          : `Nenhuma loja sinalizada (${d.total_stores} avaliadas).`,
      )
      await Promise.all([mutatePipeline(), mutateSessions()])
    } catch (e) {
      setFlagMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setFlagging(false)
    }
  }, [flagging, mutatePipeline, mutateSessions])

  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const [startError, setStartError] = useState<string | null>(null)

  async function startRitual() {
    if (creating) return
    setCreating(true)
    setStartError(null)
    try {
      const r = await fetch("/api/ritual/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${r.status}`)
      }
      await mutateSessions()
      setModalOpen(true)
    } catch (e) {
      setStartError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (sessionsLoading) {
    return (
      <div style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ fontSize: 13, color: C.g500 }}>Carregando ritual...</div>
      </div>
    )
  }

  if (sessionsError) {
    return (
      <div style={{ padding: "20px 32px" }}>
        <Breadcrumb />
        <div style={{ padding: 32, background: C.negBg, borderRadius: 12, border: `1px solid ${C.negBorder}`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.neg, marginBottom: 4 }}>Erro ao carregar o ritual</div>
          <div style={{ fontSize: 13, color: C.neg, opacity: 0.8 }}>{sessionsError.message}</div>
          <button
            type="button"
            onClick={() => mutateSessions()}
            style={{ marginTop: 12, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: C.white, background: C.brand, border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const isEmpty = queue.length === 0
  const friday = weekStart ? fridayOf(weekStart) : null
  const hours = Math.max(1, Math.round(totalMinutes / 60))
  const endHour = 14 + hours
  const peopleConnected = (activeSession?.participants?.length ?? 0) || 1

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
      <div style={{ padding: "20px 32px 0", flexShrink: 0 }}>
        <Breadcrumb />

        {/* Hero card */}
        <div style={{
          padding: 22, background: C.white,
          border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: C.shadowSm, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: C.g900, letterSpacing: "-0.02em" }}>
                  Ritual de acompanhamento semanal
                </h1>
                <StateBadge
                  tone={activeSession ? "info" : "pos"}
                  dot
                  label={activeSession ? "Em andamento" : "Pronto para começar"}
                />
              </div>
              <div style={{ fontSize: 13.5, color: C.g500, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {friday && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.g700 }}>
                    <CalendarIcon />
                    <span style={{ textTransform: "capitalize" }}>{formatDate(friday)}</span>
                  </span>
                )}
                {!isEmpty && (
                  <>
                    <span style={{ color: C.g300 }}>·</span>
                    <span style={TNUM}>Estimativa: {queue.length} lojas</span>
                    <span style={{ color: C.g300 }}>·</span>
                    <span style={TNUM}>~{hours}h · encerra ~{endHour}h</span>
                  </>
                )}
                <span style={{ color: C.g300 }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
                  {peopleConnected} {peopleConnected === 1 ? "pessoa conectada" : "pessoas conectadas"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {ownerAvatars.length > 0 && (
                <div style={{ display: "flex" }}>
                  {ownerAvatars.map((o, i) => (
                    <TeamAvatar key={o.id} name={o.name} index={i} />
                  ))}
                </div>
              )}
              {!isEmpty && (
                <BtnSecondary icon={<Settings size={15} />}>Editar fila</BtnSecondary>
              )}
              {!isEmpty && (
                <BtnPrimary
                  size="lg"
                  icon={<Zap size={16} fill="#fff" />}
                  onClick={() => (activeSession ? setModalOpen(true) : startRitual())}
                  disabled={creating}
                >
                  {activeSession ? "Continuar ritual" : creating ? "Iniciando..." : "Iniciar ritual"}
                </BtnPrimary>
              )}
            </div>
          </div>

          {startError && (
            <div style={{
              marginTop: 12, padding: "10px 14px",
              background: C.negBg, border: `1px solid ${C.negBorder}`,
              borderRadius: 8, fontSize: 12.5, color: C.neg,
            }}>
              Erro ao iniciar ritual: {startError}
            </div>
          )}

          {/* Context banner */}
          {!isEmpty && !bannerDismissed && (
            <div style={{
              marginTop: 16, padding: "12px 16px",
              background: C.infoBg, border: `1px solid ${C.infoBorder}`,
              borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 10,
              fontSize: 12.5, color: C.info, lineHeight: 1.5,
            }}>
              <Zap size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>
                <strong style={{ fontWeight: 600 }}>A IA pré-processou as {queue.length} lojas no domingo 22h.</strong>
                {" "}Cada loja tem funil completo, 80/20 dos problemas, comparativo histórico e dados Omnisend conectados.
                Fathom grava em background. Ao final, upload da gravação extrai decisões e cria tasks automaticamente.
              </span>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                style={{
                  padding: 0, background: "transparent", border: "none",
                  color: C.info, cursor: "pointer", marginLeft: "auto", flexShrink: 0, opacity: 0.6,
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* KPI strip */}
          {!isEmpty && (
            <div style={{
              marginTop: 16, display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
              border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden",
            }}>
              {[
                { label: "Lojas no ritual", value: queue.length, dot: null },
                { label: "Em risco", value: healthCounts.risk, dot: "#B91C1C" },
                { label: "Em atenção", value: healthCounts.attention, dot: "#B45309" },
                { label: "Renovação", value: healthCounts.renewal, dot: C.purple },
                { label: "Saudáveis", value: healthCounts.healthy, dot: "#047857" },
              ].map((k, i) => (
                <div key={k.label} style={{
                  padding: "14px 16px",
                  borderLeft: i === 0 ? "none" : `1px solid ${C.border}`,
                  background: C.white,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {k.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: k.dot }} />}
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.g500, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k.label}</div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: C.g900, ...TNUM, letterSpacing: "-0.02em", marginTop: 5 }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div style={{ padding: "0 32px" }}>
          <div style={{
            padding: 22, background: C.white,
            border: `1px solid ${C.border}`, borderRadius: 12,
            boxShadow: C.shadowSm,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, marginBottom: 4 }}>
                  Nenhuma loja na fila do ritual ainda
                </div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>
                  O cron de domingo 22h roda automaticamente — ou dispare manualmente abaixo pra popular agora.
                </div>
                {flagMessage && (
                  <div style={{
                    marginTop: 10, padding: "6px 10px",
                    background: flagMessage.startsWith("Erro") ? C.negBg : flagMessage.startsWith("Nenhuma") ? C.warnBg : C.posBg,
                    color: flagMessage.startsWith("Erro") ? C.neg : flagMessage.startsWith("Nenhuma") ? C.warn : C.pos,
                    border: `1px solid ${flagMessage.startsWith("Erro") ? C.negBorder : flagMessage.startsWith("Nenhuma") ? C.warnBorder : C.posBorder}`,
                    borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                  }}>
                    {flagMessage}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <BtnPrimary icon={<Zap size={13} fill="#fff" />} onClick={() => flagNow(true)} disabled={flagging}>
                  {flagging ? "Sinalizando..." : "Sinalizar lojas agora"}
                </BtnPrimary>
                <BtnGhost onClick={() => flagNow(false)} disabled={flagging}>Só com critério</BtnGhost>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stores list */}
      {!isEmpty && (
        <div style={{ padding: "0 32px 40px" }}>
          <div style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
            overflow: "hidden", boxShadow: C.shadowSm,
          }}>
            <header style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.g900 }}>Fila do ritual</div>
                <div style={{ fontSize: 12, color: C.g500, marginTop: 2 }}>
                  Ordenadas por urgência · arraste para reordenar (raramente necessário)
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <BtnGhost icon={<Filter size={13} />}>Filtrar</BtnGhost>
                <BtnSecondary>Reordenar IA</BtnSecondary>
              </div>
            </header>

            {/* Table head */}
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1.8fr 1fr 0.8fr 2fr 1fr 70px 80px",
              padding: "10px 18px", background: C.g50,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 10.5, fontWeight: 600, color: C.g500,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              <span />
              <span>Loja · cliente</span>
              <span>Vertical · plano</span>
              <span>Estado</span>
              <span>Motivo de entrada</span>
              <span style={{ textAlign: "right" }}>Sinais</span>
              <span style={{ textAlign: "right" }}>Tempo</span>
              <span />
            </div>

            {/* Rows */}
            {queue.map((state, i) => (
              <RitualHomeRow
                key={state.id}
                state={state}
                position={i + 1}
                isLast={i === queue.length - 1}
              />
            ))}
          </div>

          {/* Skipped healthy */}
          {healthyCount > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", background: C.g50,
                border: `1px dashed ${C.border}`, borderRadius: 10,
                fontSize: 12.5, color: C.g600, cursor: "pointer",
              }}>
                <ChevronRight size={13} />
                <span>
                  <strong style={{ fontWeight: 600, color: C.g700 }}>
                    + {healthyCount} loja{healthyCount === 1 ? "" : "s"} saudáve{healthyCount === 1 ? "l" : "is"}
                  </strong>{" "}
                  {healthyCount === 1 ? "pula" : "pulam"} direto pra Etapa 3 (pronta pra feedback do Ryan)
                </span>
                <span style={{ marginLeft: "auto", color: C.g500 }}>expandir</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            marginTop: 18, padding: "14px 18px",
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 12.5, color: C.g500 }}>
              Estimativa total: <strong style={{ fontWeight: 600, color: C.g700, ...TNUM }}>~{hours}h</strong>
              {" "}· encerra <strong style={{ fontWeight: 600, color: C.g700 }}>~{endHour}h</strong>
              {" "}· Fathom já agendado pra gravar
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <BtnSecondary>Editar fila</BtnSecondary>
              <BtnPrimary icon={<Zap size={14} fill="#fff" />} onClick={() => (activeSession ? setModalOpen(true) : startRitual())} disabled={creating}>
                {activeSession ? "Continuar ritual" : "Iniciar ritual"}
              </BtnPrimary>
            </div>
          </div>

          {/* Re-sync button */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            {flagMessage && (
              <span style={{ fontSize: 11.5, color: flagMessage.startsWith("Erro") ? C.neg : C.g500 }}>
                {flagMessage}
              </span>
            )}
            <button
              type="button"
              onClick={() => flagNow(true)}
              disabled={flagging}
              style={{
                padding: "6px 12px", fontSize: 11.5, fontWeight: 500,
                color: C.g500, background: "transparent",
                border: `1px solid ${C.g200}`, borderRadius: 6,
                cursor: flagging ? "wait" : "pointer",
              }}
            >
              {flagging ? "Sincronizando..." : "Re-sincronizar fila"}
            </button>
          </div>
        </div>
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

function RitualHomeRow({
  state,
  position,
  isLast,
}: {
  state: PipelineState
  position: number
  isLast: boolean
}) {
  const tone = HEALTH_TONE[state.health_state]
  const minutes = tone?.minutes ?? 3
  const store = state.store
  const isCritical = state.health_state === "risk" || state.health_state === "attention" || state.health_state === "renewal"
  const vertical = platformLabel(store.niche, store.platform, store.email_platform)

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "40px 1.8fr 1fr 0.8fr 2fr 1fr 70px 80px",
      padding: "12px 18px", alignItems: "center", gap: 8,
      borderBottom: isLast ? "none" : `1px solid ${C.g100}`,
      background: isCritical ? "#FCFCFD" : C.white,
      cursor: "pointer", fontSize: 13,
    }}>
      {/* Position */}
      <span style={{ fontSize: 12, fontWeight: 600, color: C.g400, ...TNUM }}>
        {String(position).padStart(2, "0")}
      </span>

      {/* Store + client */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: tone.avatarBg, color: tone.avatarC,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {store.store_name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {store.store_name}
          </div>
          {store.client?.name && (
            <div style={{ fontSize: 11.5, color: C.g500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {store.client.name}
            </div>
          )}
        </div>
      </div>

      {/* Vertical */}
      <span style={{ fontSize: 12.5, color: C.g600 }}>{vertical}</span>

      {/* State badge */}
      <StateBadge tone={tone.tone} dot label={tone.label} />

      {/* Reason */}
      <span style={{ fontSize: 12.5, color: isCritical ? C.g700 : C.g500, lineHeight: 1.4 }}>
        {state.flag_reason ?? "—"}
      </span>

      {/* Signals */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        {store.mrr_value != null && (
          <span style={{ fontSize: 11.5, color: C.g500, ...TNUM }}>
            MRR <strong style={{ fontWeight: 600, color: C.g900 }}>R$ {store.mrr_value.toLocaleString("pt-BR")}</strong>
          </span>
        )}
        {state.revenue_change_pct != null && (
          <span style={{
            fontSize: 11.5, ...TNUM,
            color: state.revenue_change_pct >= 0 ? C.pos : C.neg, fontWeight: 600,
          }}>
            {state.revenue_change_pct >= 0 ? "+" : ""}
            {state.revenue_change_pct.toFixed(1).replace(".", ",")}% receita
          </span>
        )}
        {store.mrr_value == null && state.revenue_change_pct == null && (
          <span style={{ color: C.g400, fontSize: 11 }}>—</span>
        )}
      </div>

      {/* Time */}
      <span style={{ fontSize: 12.5, color: C.g700, fontWeight: 500, ...TNUM, textAlign: "right" }}>
        ~{minutes}min
      </span>

      {/* Dots menu */}
      <div style={{ textAlign: "right" }}>
        <MoreHorizontal size={15} style={{ color: C.g300 }} />
      </div>
    </div>
  )
}

/* ────────── Micro components (fiel ao protótipo) ────────── */

function Breadcrumb() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.g500, marginBottom: 12 }}>
      <span>Workflows</span>
      <ChevronRight size={12} style={{ color: C.g300 }} />
      <span>Pipelines CS</span>
      <ChevronRight size={12} style={{ color: C.g300 }} />
      <span style={{ color: C.g900, fontWeight: 500 }}>Ritual de sexta</span>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function StateBadge({ tone, dot, label }: { tone: string; dot?: boolean; label: string }) {
  const toneMap: Record<string, { bg: string; color: string; border: string; dotColor: string }> = {
    pos: { bg: C.posBg, color: C.pos, border: C.posBorder, dotColor: "#10B981" },
    neg: { bg: C.negBg, color: C.neg, border: C.negBorder, dotColor: C.negDot },
    warn: { bg: C.warnBg, color: C.warn, border: C.warnBorder, dotColor: C.warnDot },
    purple: { bg: C.purpleBg, color: C.purple, border: C.purpleBorder, dotColor: C.purpleDot },
    info: { bg: C.infoBg, color: C.info, border: C.infoBorder, dotColor: C.brand },
  }
  const t = toneMap[tone] ?? toneMap.pos!
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px",
      color: t.color, background: t.bg,
      border: `1px solid ${t.border}`, borderRadius: 999,
      whiteSpace: "nowrap",
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dotColor, display: "inline-block" }} />}
      {label}
    </span>
  )
}

function TeamAvatar({ name, index }: { name: string | null; index: number }) {
  const initial = name?.[0]?.toUpperCase() ?? "?"
  const colors = [
    { bg: "#DBEAFE", c: "#1E40AF" },
    { bg: "#FEF3C7", c: "#92400E" },
    { bg: "#D1FAE5", c: "#065F46" },
  ]
  const col = colors[index % colors.length]!
  return (
    <div
      title={name ?? ""}
      style={{
        width: 32, height: 32, borderRadius: "50%",
        background: col.bg, color: col.c,
        border: "2.5px solid #fff", marginLeft: index === 0 ? 0 : -10,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {initial}
    </div>
  )
}

function BtnPrimary({
  children, icon, onClick, disabled, size = "md",
}: {
  children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void; disabled?: boolean; size?: "md" | "lg"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: size === "lg" ? "10px 20px" : "8px 16px",
        fontSize: size === "lg" ? 14 : 13,
        fontWeight: 600, color: "#fff", background: C.brand,
        border: "none", borderRadius: 8,
        cursor: disabled ? "wait" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
        opacity: disabled ? 0.7 : 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function BtnSecondary({ children, icon, onClick }: { children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px", fontSize: 13, fontWeight: 500,
        color: C.g700, background: C.white,
        border: `1px solid ${C.g300}`, borderRadius: 8,
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function BtnGhost({ children, icon, onClick, disabled }: { children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px", fontSize: 13, fontWeight: 500,
        color: C.g700, background: "transparent",
        border: `1px dashed ${C.g300}`, borderRadius: 8,
        cursor: disabled ? "wait" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  )
}
