"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import useSWR from "swr"
import {
  ChevronLeft, ChevronRight, ChevronDown, Clock, X, Zap, Send,
  TrendingDown, TrendingUp, Loader2,
} from "lucide-react"

const C = {
  brand: "#4E62D8",
  white: "#FFFFFF",
  g25: "#FAFBFC",
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
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
  purpleBorder: "#DDD6FE",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
}

const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

const HEALTH_ACCENT: Record<string, string> = {
  risk: "#B91C1C",
  attention: "#B45309",
  renewal: "#7C3AED",
  rampup: "#4E62D8",
  healthy: "#047857",
}

const HEALTH_LABEL: Record<string, string> = {
  risk: "Em risco",
  attention: "Em atenção",
  renewal: "Renovação",
  rampup: "Ramp-up",
  healthy: "Saudável",
}

const HEALTH_TONE: Record<string, string> = {
  risk: "neg",
  attention: "warn",
  renewal: "purple",
  rampup: "info",
  healthy: "pos",
}

const DOT = {
  done: { bg: "#10B981", ring: "rgba(16,185,129,0.18)" },
  current: { bg: "#4E62D8", ring: "rgba(78,98,216,0.22)" },
  pending: { bg: "#D1D5DB", ring: "transparent" },
  skipped: { bg: "#9CA3AF", ring: "transparent" },
}

interface RitualSession {
  id: string
  store_ids: string[]
  current_store_index: number
  status: string
}

type ChatMessage = { role: "user" | "assistant"; content: string }

const TABS = [
  { id: "funil" as const, label: "Funil & gargalo" },
  { id: "problemas" as const, label: "80/20 problemas", badge: true },
  { id: "comparativo" as const, label: "Comparativo histórico" },
  { id: "campanhas" as const, label: "Campanhas", badge: true },
  { id: "automacoes" as const, label: "Automações", badge: true },
]

export function RitualDiagnosticModal({
  session,
  onClose,
  onUpdate,
}: {
  session: RitualSession
  onClose: () => void
  onUpdate: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(session.current_store_index)
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("funil")
  const [timerSec, setTimerSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const storeId = session.store_ids[currentIdx] as string | undefined

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [paused])

  useEffect(() => {
    setActiveTab("funil")
  }, [storeId])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const { data: storeBasic } = useSWR<{
    success?: boolean
    id?: string
    store_name?: string
    niche?: string | null
    platform?: string | null
    client?: { name?: string } | null
    mrr_cents?: number | null
  }>(
    storeId ? `/api/stores/${storeId}` : null,
    (url: string) => fetch(url, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
  )

  const { data: acompData } = useSWR<{
    success?: boolean
    health_score?: number
    health_state?: string
    reports?: Array<{ week_start: string; metrics: Record<string, unknown> | null }>
    latest_report?: {
      highlights: unknown[]
      concerns: unknown[]
      metrics: Record<string, unknown> | null
      ai_summary: string | null
    } | null
  }>(storeId ? `/api/stores/${storeId}/acompanhamento` : null, fetcher)

  const fmtTimer = () => {
    const h = Math.floor(timerSec / 3600)
    const m = Math.floor((timerSec % 3600) / 60)
    const s = timerSec % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  const patchSession = useCallback(async (body: Record<string, unknown>) => {
    try {
      await fetch(`/api/ritual/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
    } catch { /* best-effort */ }
  }, [session.id])

  const goToStore = useCallback(async (idx: number) => {
    await patchSession({ current_store_index: idx })
    setCurrentIdx(idx)
    setTimerSec(0)
    onUpdate()
  }, [patchSession, onUpdate])

  async function nextStore() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.store_ids.length) {
      await patchSession({ status: "completed" })
      onUpdate()
      onClose()
      return
    }
    await goToStore(nextIdx)
  }

  async function prevStore() {
    if (currentIdx <= 0) return
    await goToStore(currentIdx - 1)
  }

  const healthState = (acompData?.health_state ?? "healthy") as string
  const storeName = storeBasic?.store_name ?? "Loja"
  const totalStores = session.store_ids.length
  const remaining = Math.max(0, (totalStores - currentIdx - 1) * 8)

  if (!storeId) {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100 }} />
        <div style={{ position: "fixed", inset: 12, background: "#F5F6F8", borderRadius: 12, zIndex: 101, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.g900, marginBottom: 8 }}>Nenhuma loja na sessão</div>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: C.brand, border: "none", borderRadius: 8, cursor: "pointer" }}>Fechar</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100 }} />
      <div style={{
        position: "fixed", inset: 12, background: "#F5F6F8",
        borderRadius: 12, zIndex: 101,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
      }}>
        {/* ── Modal Header ── */}
        <header style={{
          display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
          padding: "12px 22px", borderBottom: `1px solid ${C.border}`,
          background: C.white, gap: 16, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 11px 5px 10px",
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}>
              <style>{`@keyframes cf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.6)}50%{box-shadow:0 0 0 5px rgba(220,38,38,0)}}`}</style>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#DC2626", flexShrink: 0,
                animation: "cf-pulse 1.8s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: C.g700 }}>Gravando</span>
              <span style={{ width: 1, height: 11, background: C.border, margin: "0 2px" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.g700, ...TNUM, letterSpacing: "0.01em" }}>{fmtTimer()}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "center" }}>
            <div style={{ display: "flex" }}>
              {["B", "J", "R"].map((initial, i) => (
                <div key={initial} style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: ["#DBEAFE", "#FEF3C7", "#D1FAE5"][i],
                  color: ["#1E40AF", "#92400E", "#065F46"][i],
                  border: `2px solid ${C.white}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, marginLeft: i === 0 ? 0 : -8,
                }}>{initial}</div>
              ))}
            </div>
            <span style={{ fontSize: 12.5, color: C.g600 }}>
              Na call: <span style={{ color: C.g900, fontWeight: 500 }}>Bruno · Jean · Ryan</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
            <IconBtn title="Minimizar"><ChevronDown size={16} /></IconBtn>
            <IconBtn title={paused ? "Retomar" : "Pausar"} onClick={() => setPaused(!paused)}><Clock size={16} /></IconBtn>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                color: C.neg, background: C.negBg,
                border: `1px solid ${C.negBorder}`, borderRadius: 6,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              <X size={13} /> Encerrar ritual
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: C.g500 }}>
              Loja <span style={{ color: C.g900, fontWeight: 600, ...TNUM }}>{currentIdx + 1}</span>
              <span style={{ color: C.g300 }}> / </span>
              <span style={TNUM}>{totalStores}</span>
              <span style={{ color: C.g400, margin: "0 8px" }}>·</span>
              <span style={{ color: C.g900, fontWeight: 600 }}>{storeName}</span>
            </span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.g100, overflow: "hidden" }}>
              <div style={{ width: `${totalStores > 0 ? ((currentIdx + 1) / totalStores) * 100 : 0}%`, height: "100%", background: C.brand, transition: "width 200ms" }} />
            </div>
            <span style={{ fontSize: 12, color: C.g500, ...TNUM }}>~{remaining}min restantes</span>
          </div>
        </header>

        {/* ── Body: analysis + chat ── */}
        <div style={{
          flex: 1, display: "grid",
          gridTemplateColumns: "1fr 460px",
          gap: 14, padding: 14, minHeight: 0, overflow: "hidden",
        }}>
          {/* Left: analysis area */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {/* Store header */}
            <StoreHeader
              storeName={storeName}
              clientName={typeof storeBasic?.client === "object" && storeBasic.client ? (storeBasic.client as { name?: string }).name ?? null : null}
              niche={storeBasic?.niche ?? null}
              platform={storeBasic?.platform ?? null}
              plan={null}
              mrr={storeBasic?.mrr_cents ? Math.round(storeBasic.mrr_cents / 100) : null}
              healthState={healthState}
              healthScore={acompData?.health_score ?? null}
              alert={acompData?.latest_report?.ai_summary ?? null}
            />

            {/* Fathom banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 14px", background: C.g25,
              border: `1px solid ${C.border}`, borderRadius: 8,
              marginBottom: 12, fontSize: 12, color: C.g600,
            }}>
              <Zap size={13} style={{ color: C.g400, flexShrink: 0 }} />
              <span>Fathom captura a discussão em background · ao final do ritual, a IA extrai decisões da transcrição.</span>
            </div>

            {/* Tabs */}
            <div style={{
              display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`,
              marginBottom: 14,
            }}>
              {TABS.map((t) => {
                const isActive = activeTab === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      padding: "10px 14px",
                      fontSize: 13, fontWeight: isActive ? 600 : 500,
                      color: isActive ? C.brand : C.g500,
                      borderBottom: `2px solid ${isActive ? C.brand : "transparent"}`,
                      marginBottom: -1, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {t.label}
                  </div>
                )
              })}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: "auto", paddingRight: 4, paddingBottom: 6 }}>
              {activeTab === "funil" && <FunilTab report={acompData?.latest_report} />}
              {activeTab === "problemas" && <ProblemasTab report={acompData?.latest_report} />}
              {activeTab === "comparativo" && <ComparativoTab storeId={storeId!} />}
              {activeTab === "campanhas" && <CampanhasTab storeId={storeId!} />}
              {activeTab === "automacoes" && <AutomacoesTab storeId={storeId!} />}
            </div>
          </div>

          {/* Right: Chat IA */}
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <RitualChat storeId={storeId!} storeName={storeName} />
          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 22px", borderTop: `1px solid ${C.border}`,
          background: C.white, gap: 16, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {session.store_ids.map((_, i) => {
                const isCurrent = i === currentIdx
                const isDone = i < currentIdx
                const cfg = DOT[isCurrent ? "current" : isDone ? "done" : "pending"]
                return (
                  <div
                    key={i}
                    style={{
                      width: isCurrent ? 12 : 9, height: isCurrent ? 12 : 9,
                      borderRadius: "50%", background: cfg.bg,
                      boxShadow: isCurrent ? `0 0 0 4px ${cfg.ring}` : "none",
                      cursor: isDone ? "pointer" : "default",
                      transition: "all 150ms",
                    }}
                    onClick={() => isDone && void goToStore(i)}
                  />
                )
              })}
            </div>
            <span style={{ fontSize: 12, color: C.g500, ...TNUM }}>
              <span style={{ color: C.g900, fontWeight: 600 }}>{currentIdx + 1}</span>
              <span style={{ color: C.g300 }}> / </span>
              {totalStores}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FooterBtn onClick={prevStore} disabled={currentIdx <= 0}>
              <ChevronLeft size={14} /> Voltar
            </FooterBtn>
            <FooterBtn onClick={nextStore}>Pular esta loja</FooterBtn>
            <button
              type="button"
              onClick={nextStore}
              style={{
                padding: "9px 16px", fontSize: 13, fontWeight: 600,
                color: "#fff", background: C.brand,
                border: "none", borderRadius: 8,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              {currentIdx + 1 === totalStores ? "Finalizar ritual" : "Próxima loja"}
              <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}

/* ────────── Store Header ────────── */

function StoreHeader({
  storeName, clientName, niche, platform, plan, mrr,
  healthState, healthScore, alert,
}: {
  storeName: string
  clientName: string | null
  niche: string | null
  platform: string | null
  plan: string | null
  mrr: number | null
  healthState: string
  healthScore: number | null
  alert: string | null
}) {
  const accent = HEALTH_ACCENT[healthState] ?? HEALTH_ACCENT.healthy
  const label = HEALTH_LABEL[healthState] ?? "Saudável"
  const tone = HEALTH_TONE[healthState] ?? "pos"
  const initial = storeName[0]?.toUpperCase() ?? "?"

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "16px 18px 16px 22px", background: C.white,
      border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12,
      position: "relative", overflow: "hidden",
    }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: C.g50, color: C.g900,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em",
        border: `1px solid ${C.border}`,
      }}>{initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: C.g900, letterSpacing: "-0.02em" }}>{storeName}</h2>
          <Badge tone={tone} label={label} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, fontSize: 12.5, color: C.g500 }}>
          {clientName && <span style={{ color: C.g700 }}>{clientName}</span>}
          {niche && <span>{niche}</span>}
          {platform && <span>{platform}</span>}
          {plan && <span>{plan}</span>}
          {mrr != null && mrr > 0 && <span style={{ color: C.g700, fontWeight: 500, ...TNUM }}>MRR R$ {Math.round(mrr / 1000)}k</span>}
        </div>
      </div>
      {(alert || healthScore != null) && (
        <div style={{ textAlign: "right", paddingLeft: 18, borderLeft: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.g500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {healthState === "healthy" ? "Receita semana" : "Alerta principal"}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, marginTop: 3,
            color: healthState === "healthy" ? C.pos : accent,
            letterSpacing: "-0.01em", ...TNUM,
          }}>
            {alert ? (alert.length > 50 ? alert.slice(0, 47) + "..." : alert) : `Score ${healthScore}`}
          </div>
        </div>
      )}
    </div>
  )
}

/* ────────── Tab: Funil ────────── */

function FunilTab({ report }: { report?: { highlights: unknown[]; concerns: unknown[]; metrics: Record<string, unknown> | null; ai_summary: string | null } | null }) {
  if (!report) {
    return <EmptyTab>Sem dados de funil disponíveis.</EmptyTab>
  }
  return (
    <div>
      {report.ai_summary && (
        <div style={{ marginBottom: 16, padding: 14, background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: 8, fontSize: 13, color: C.g700, lineHeight: 1.55 }}>
          <strong style={{ fontWeight: 600 }}>Resumo IA:</strong> {report.ai_summary}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <SectionLabel>Destaques</SectionLabel>
          {(report.highlights ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: C.g500 }}>Nenhum destaque registrado.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(report.highlights ?? []).map((h, i) => (
                <div key={i} style={{ padding: "8px 0", fontSize: 12.5, color: C.g700, borderBottom: `1px solid ${C.g100}`, display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <TrendingUp size={12} style={{ color: C.pos, flexShrink: 0, marginTop: 2 }} />
                  <span>{typeof h === "string" ? h : JSON.stringify(h)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Alertas</SectionLabel>
          {(report.concerns ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: C.g500 }}>Nenhum alerta.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(report.concerns ?? []).map((c, i) => (
                <div key={i} style={{ padding: "8px 0", fontSize: 12.5, color: C.g700, borderBottom: `1px solid ${C.g100}`, display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <TrendingDown size={12} style={{ color: C.neg, flexShrink: 0, marginTop: 2 }} />
                  <span>{typeof c === "string" ? c : JSON.stringify(c)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────── Tab: 80/20 Problemas ────────── */

function ProblemasTab({ report }: { report?: { concerns: unknown[] } | null }) {
  const concerns = report?.concerns ?? []
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 14, lineHeight: 1.5 }}>
        Causa-raiz ranqueada pela IA com base nos alertas mais recorrentes.
      </div>
      {concerns.length === 0 ? (
        <EmptyTab>Sem alertas recorrentes mapeados.</EmptyTab>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {concerns.slice(0, 5).map((c, i) => (
            <div key={i} style={{
              padding: "12px 14px", background: i === 0 ? C.warnBg : C.white,
              border: `1px solid ${i === 0 ? C.warnBorder : C.border}`,
              borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: i === 0 ? C.warn : C.g200,
                color: i === 0 ? "#fff" : C.g600,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, fontSize: 13, color: C.g700, lineHeight: 1.5 }}>
                {typeof c === "string" ? c : JSON.stringify(c)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────── Tab: Comparativo ────────── */

function ComparativoTab({ storeId }: { storeId: string }) {
  const { data } = useSWR<{
    success?: boolean
    reports?: Array<{ week_start: string; metrics: Record<string, unknown> | null }>
  }>(
    storeId ? `/api/stores/${storeId}/acompanhamento` : null,
    fetcher,
  )
  const reports = data?.reports ?? []
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 14 }}>
        Últimas {reports.length || 0} semanas — variação por métrica.
      </div>
      {reports.length === 0 ? (
        <EmptyTab>Sem histórico semanal ainda.</EmptyTab>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reports.slice(0, 8).map((r, i) => (
            <div key={i} style={{
              padding: "10px 14px", background: C.white,
              border: `1px solid ${C.border}`, borderRadius: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12.5, color: C.g700, fontWeight: 500 }}>
                {new Date(r.week_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </span>
              <span style={{ fontSize: 11.5, color: C.g500 }}>
                {r.metrics ? Object.keys(r.metrics).slice(0, 5).join(" · ") : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────── Tab: Campanhas ────────── */

function CampanhasTab({ storeId }: { storeId: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 14 }}>
        Performance de campanhas recentes via Omnisend/Klaviyo.
      </div>
      <EmptyTab>
        Dados de campanhas serão carregados via integração.
        <br />
        <a
          href={`/admin/stores/${storeId}?tab=performance`}
          target="_blank"
          rel="noreferrer"
          style={{ color: C.brand, fontSize: 12, marginTop: 8, display: "inline-block" }}
        >
          Ver detalhe da loja
        </a>
      </EmptyTab>
    </div>
  )
}

/* ────────── Tab: Automações ────────── */

function AutomacoesTab({ storeId }: { storeId: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 14 }}>
        Performance de flows/automações via Omnisend/Klaviyo.
      </div>
      <EmptyTab>
        Dados de automações serão carregados via integração.
        <br />
        <a
          href={`/admin/stores/${storeId}?tab=performance`}
          target="_blank"
          rel="noreferrer"
          style={{ color: C.brand, fontSize: 12, marginTop: 8, display: "inline-block" }}
        >
          Ver detalhe da loja
        </a>
      </EmptyTab>
    </div>
  )
}

/* ────────── Chat IA Panel ────────── */

const CC = {
  surface: "#FCFCFB",
  panel: "#FFFFFF",
  border: "rgba(0,0,0,0.06)",
  text: "#1F2230",
  textSec: "#5B6072",
  textMut: "#9398AA",
  ai: "#C45F2C",
  userBg: "#F4F4F2",
}

function RitualChat({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Diagnóstico inicial de ${storeName}. Posso analisar funil, comparativo histórico, sugerir ações específicas. O que vocês querem entender primeiro?`,
    },
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: `Loja ${storeName} carregada. Estou pronto pra ajudar no diagnóstico. Pergunte o que quiserem.`,
      },
    ])
  }, [storeId, storeName])

  async function send(content: string) {
    if (!content.trim() || sending) return
    const userMsg: ChatMessage = { role: "user", content: content.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setSending(true)
    try {
      const r = await fetch("/api/ritual/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ store_id: storeId, messages: newMessages }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      const aiMsg = json.message
      if (aiMsg && typeof aiMsg.content === "string") {
        setMessages((prev) => [...prev, aiMsg as ChatMessage])
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Não consegui processar agora. Tenta de novo?" }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Erro ao consultar a IA. Tenta novamente." }])
    } finally {
      setSending(false)
    }
  }

  const suggestions = [
    "Qual o problema #1?",
    "Sugira 3 ações concretas",
    "Compare com média do nicho",
    "Como estão os flows?",
    "Subjects das últimas 5",
  ]

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: CC.surface,
      border: `1px solid ${CC.border}`, borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${CC.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: CC.text }}>Chat sobre {storeName}</div>
          <div style={{ fontSize: 10.5, color: CC.textMut, marginTop: 2, letterSpacing: "0.04em" }}>
            MCP OMNISEND + ADMIN · Claude Sonnet
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <SourceChip>Omnisend</SourceChip>
          <SourceChip>Admin</SourceChip>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              {m.role === "assistant" ? (
                <AIMark />
              ) : (
                <UserMark name="Bruno" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {m.role === "user" && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: CC.textSec, marginBottom: 3 }}>Bruno</div>
                )}
                <div style={{
                  fontSize: 13, color: CC.text, lineHeight: 1.6,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.content}
                </div>
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <AIMark />
            <div style={{ fontSize: 12, color: CC.textMut, fontStyle: "italic" }}>
              consultando Omnisend...
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${CC.border}` }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={sending}
              style={{
                fontSize: 11, padding: "4px 10px",
                background: CC.panel, color: CC.textSec,
                border: `1px solid ${CC.border}`,
                borderRadius: 999, cursor: sending ? "wait" : "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${CC.border}`, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send(input)}
            placeholder="Pergunte algo sobre a loja..."
            disabled={sending}
            style={{
              width: "100%", padding: "10px 12px",
              fontSize: 13, background: CC.panel, color: CC.text,
              border: `1px solid ${CC.border}`, borderRadius: 8,
              outline: "none",
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          style={{
            width: 36, height: 36, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: C.brand, color: "#fff",
            border: "none", borderRadius: 8,
            cursor: sending || !input.trim() ? "default" : "pointer",
            opacity: sending || !input.trim() ? 0.4 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

/* ────────── Micro components ────────── */

function AIMark() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: "50%",
      background: CC.ai, color: "#fff", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 L13.2 9.5 L20 8.5 L14.5 13.5 L20 18.5 L13.2 17.5 L12 25 L10.8 17.5 L4 18.5 L9.5 13.5 L4 8.5 L10.8 9.5 Z" opacity="0.92"/>
      </svg>
    </div>
  )
}

function UserMark({ name = "Bruno" }: { name?: string }) {
  const initial = (name[0] || "?").toUpperCase()
  return (
    <div style={{
      width: 22, height: 22, borderRadius: "50%",
      background: CC.userBg, color: CC.textSec, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 600, border: `1px solid ${CC.border}`,
    }}>{initial}</div>
  )
}

function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "2px 7px",
      background: CC.userBg, color: CC.textSec,
      border: `1px solid ${CC.border}`, borderRadius: 4,
    }}>{children}</span>
  )
}

function Badge({ tone, label }: { tone: string; label: string }) {
  const map: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    pos: { bg: C.posBg, color: C.pos, border: C.posBorder, dot: "#10B981" },
    neg: { bg: C.negBg, color: C.neg, border: C.negBorder, dot: "#EF4444" },
    warn: { bg: C.warnBg, color: C.warn, border: C.warnBorder, dot: "#F59E0B" },
    purple: { bg: C.purpleBg, color: C.purple, border: C.purpleBorder, dot: C.purple },
    info: { bg: C.infoBg, color: C.info, border: C.infoBorder, dot: C.brand },
  }
  const t = map[tone] ?? map.pos!
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px",
      color: t.color, background: t.bg,
      border: `1px solid ${t.border}`, borderRadius: 999,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
      {label}
    </span>
  )
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 32, height: 32, padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${C.border}`, borderRadius: 6, background: C.white,
        color: C.g500, cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function FooterBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px", fontSize: 13, fontWeight: 500,
        color: disabled ? C.g400 : C.g700, background: "transparent",
        border: `1px solid ${disabled ? C.g200 : C.g300}`, borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, color: C.g500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </div>
  )
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: C.g500, fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}
