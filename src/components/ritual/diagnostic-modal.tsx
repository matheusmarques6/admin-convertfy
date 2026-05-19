"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  brandLight: "#4E62D8",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
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

interface RitualSession {
  id: string
  store_ids: string[]
  current_store_index: number
  status: string
}

type StoreContext = {
  identity: {
    store_id?: string
    store_name?: string | null
    client_name?: string | null
    platform?: string | null
    niche?: string | null
    mrr?: number | null
    plan?: string | null
  } | null
}

type ChatMessage = { role: "user" | "assistant"; content: string }

const TABS = [
  { id: "funil" as const, label: "Funil & gargalo" },
  { id: "problemas" as const, label: "80/20 problemas" },
  { id: "comparativo" as const, label: "Comparativo" },
  { id: "campanhas" as const, label: "Campanhas" },
  { id: "automacoes" as const, label: "Automações" },
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
  const [notes, setNotes] = useState("")
  const [actions, setActions] = useState<string[]>([])
  const [actionDraft, setActionDraft] = useState("")
  const [skipReason, setSkipReason] = useState("")
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle")
  const [timerSec, setTimerSec] = useState(0)
  const storeId = session.store_ids[currentIdx]

  // Timer
  useEffect(() => {
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Reset state on store change
  useEffect(() => {
    setNotes("")
    setActions([])
    setActionDraft("")
    setSkipReason("")
    setActiveTab("funil")
  }, [storeId])

  // Pega contexto da loja (usa endpoint que já existe pra task)
  const { data: storeData } = useSWR<{
    data: StoreContext
  }>(
    storeId ? `/api/stores/${storeId}/onboarding-status` : null,
    fetcher,
  )

  // Latest weekly report
  const { data: acompData } = useSWR<{
    data: { health_score: number; health_state: string; latest_report: { highlights: unknown[]; concerns: unknown[]; metrics: Record<string, unknown> | null; ai_summary: string | null } | null }
  }>(
    storeId ? `/api/stores/${storeId}/acompanhamento` : null,
    fetcher,
  )

  const fmtTimer = () => {
    const m = Math.floor(timerSec / 60)
    const s = timerSec % 60
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  async function saveDiagnostic(opts: { skipped?: boolean } = {}) {
    if (!storeId) return
    setSavingState("saving")
    try {
      await fetch(`/api/ritual/sessions/${session.id}/diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          store_id: storeId,
          notes,
          approved_actions: actions,
          skipped: opts.skipped ?? false,
          skip_reason: opts.skipped ? skipReason : null,
          duration_seconds: timerSec,
        }),
      })
      setSavingState("saved")
      setTimeout(() => setSavingState("idle"), 1500)
    } catch {
      setSavingState("idle")
    }
  }

  async function nextStore() {
    await saveDiagnostic()
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.store_ids.length) {
      // Encerra sessão
      await fetch(`/api/ritual/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "completed" }),
      })
      onUpdate()
      onClose()
      return
    }
    await fetch(`/api/ritual/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ current_store_index: nextIdx }),
    })
    setCurrentIdx(nextIdx)
    setTimerSec(0)
    onUpdate()
  }

  async function skipStore() {
    if (!skipReason.trim()) {
      const r = window.prompt("Por que pular esta loja?")
      if (!r) return
      setSkipReason(r)
      await saveDiagnostic({ skipped: true })
    } else {
      await saveDiagnostic({ skipped: true })
    }
    void nextStore()
  }

  function addAction() {
    if (!actionDraft.trim()) return
    setActions((arr) => [...arr, actionDraft.trim()])
    setActionDraft("")
  }

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100 }}
      />
      <div
        style={{
          position: "fixed",
          inset: 16,
          background: "#fff",
          borderRadius: 8,
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: `1px solid ${C.g200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 700,
                color: C.neg,
                background: C.negBg,
                borderRadius: 3,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.neg,
                  animation: "pulse 2s infinite",
                }}
              />
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
              Sessão ativa
            </span>
            <span style={{ fontSize: 11, color: C.g500, fontVariantNumeric: "tabular-nums" }}>
              {fmtTimer()}
            </span>
            <span style={{ fontSize: 12, color: C.g700, fontWeight: 600 }}>
              {currentIdx + 1} de {session.store_ids.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 13, color: C.g500, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}
          >
            Fechar ✕
          </button>
        </div>

        {/* Main grid: content + chat IA */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", minHeight: 0 }}>
          {/* Content */}
          <div style={{ overflowY: "auto", padding: 20 }}>
            {storeData?.data && (
              <StoreInfoCard
                storeData={storeData.data}
                acompData={acompData?.data}
              />
            )}

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 4,
                borderBottom: `1px solid ${C.g200}`,
                marginTop: 16,
                marginBottom: 12,
              }}
            >
              {TABS.map((t) => {
                const isActive = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? C.brand : C.g500,
                      background: "transparent",
                      border: "none",
                      borderBottom: `2px solid ${isActive ? C.brand : "transparent"}`,
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            <div style={{ minHeight: 200 }}>
              {activeTab === "funil" && <FunilTab acompData={acompData?.data} />}
              {activeTab === "problemas" && <ProblemasTab acompData={acompData?.data} />}
              {activeTab === "comparativo" && <ComparativoTab storeId={storeId} />}
              {activeTab === "campanhas" && <CampanhasTab storeId={storeId} />}
              {activeTab === "automacoes" && <AutomacoesTab storeId={storeId} />}
            </div>

            {/* Notes + actions */}
            <div style={{ marginTop: 24, padding: 16, background: C.g50, borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.g700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Notas do diagnóstico
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Decisões da call sobre esta loja..."
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: 10,
                  fontSize: 13,
                  border: `1px solid ${C.g200}`,
                  borderRadius: 4,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  background: "#fff",
                }}
              />

              <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: C.g700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Ações aprovadas ({actions.length})
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={actionDraft}
                  onChange={(e) => setActionDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAction()}
                  placeholder="ex: Mariana refazer welcome email com novo CTA"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 12,
                    border: `1px solid ${C.g200}`,
                    borderRadius: 4,
                    outline: "none",
                    background: "#fff",
                  }}
                />
                <button
                  type="button"
                  onClick={addAction}
                  style={{
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    background: C.brand,
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Adicionar
                </button>
              </div>
              {actions.length > 0 && (
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
                  {actions.map((a, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "6px 0",
                        fontSize: 12,
                        color: C.g700,
                        display: "flex",
                        gap: 6,
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ color: C.pos, fontWeight: 700 }}>✓</span>
                      <span style={{ flex: 1 }}>{a}</span>
                      <button
                        type="button"
                        onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}
                        style={{ fontSize: 11, color: C.neg, background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chat IA */}
          <RitualChatPanel storeId={storeId} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.g200}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: C.g50,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {session.store_ids.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i < currentIdx ? C.pos : i === currentIdx ? C.brand : C.g300,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {savingState !== "idle" && (
              <span style={{ fontSize: 11, color: C.g500, fontStyle: "italic" }}>
                {savingState === "saving" ? "Salvando..." : "Salvo ✓"}
              </span>
            )}
            <button
              type="button"
              onClick={() => saveDiagnostic()}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: C.g700,
                background: "transparent",
                border: `1px solid ${C.g300}`,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={skipStore}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: C.warn,
                background: "transparent",
                border: `1px solid ${C.warn}`,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Pular
            </button>
            <button
              type="button"
              onClick={nextStore}
              style={{
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: C.brand,
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {currentIdx + 1 === session.store_ids.length ? "Finalizar ritual" : "Próxima loja →"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function StoreInfoCard({
  storeData,
  acompData,
}: {
  storeData: StoreContext
  acompData?: { health_score: number; health_state: string } | undefined
}) {
  const id = storeData?.identity
  if (!id) return null
  return (
    <div style={{ padding: 16, background: C.g50, borderRadius: 6, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.g900 }}>{id.store_name}</div>
          {id.client_name && (
            <div style={{ fontSize: 13, color: C.g500, marginTop: 2 }}>{id.client_name}</div>
          )}
        </div>
        {acompData && (
          <div
            style={{
              padding: "8px 12px",
              background: "#fff",
              borderRadius: 4,
              border: `1px solid ${C.g200}`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: C.g500, textTransform: "uppercase" }}>Health</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.g900, fontVariantNumeric: "tabular-nums" }}>
              {acompData.health_score}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 11, color: C.g500 }}>
        {id.niche && <span>{id.niche}</span>}
        {id.platform && <span>· {id.platform}</span>}
        {id.mrr && <span>· R$ {(id.mrr / 1000).toFixed(1)}k MRR</span>}
        {id.plan && <span>· {id.plan}</span>}
      </div>
    </div>
  )
}

function FunilTab({ acompData }: { acompData?: { latest_report: { highlights: unknown[]; concerns: unknown[]; metrics: Record<string, unknown> | null; ai_summary: string | null } | null } }) {
  const report = acompData?.latest_report
  if (!report) {
    return <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>Sem dados de funil disponíveis.</div>
  }
  return (
    <div>
      {report.ai_summary && (
        <div style={{ marginBottom: 16, padding: 12, background: C.brand50, borderRadius: 4, fontSize: 13, color: C.g700, lineHeight: 1.5 }}>
          <strong>Resumo:</strong> {report.ai_summary}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.g500, textTransform: "uppercase", marginBottom: 6 }}>
            Destaques
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(report.highlights ?? []).map((h, i) => (
              <li key={i} style={{ padding: "6px 0", fontSize: 12, color: C.g700, borderBottom: `1px solid ${C.g100}` }}>
                <span style={{ color: C.pos }}>↑</span> {typeof h === "string" ? h : JSON.stringify(h)}
              </li>
            ))}
            {(!report.highlights || report.highlights.length === 0) && (
              <li style={{ color: C.g500, fontSize: 12 }}>—</li>
            )}
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.g500, textTransform: "uppercase", marginBottom: 6 }}>
            Alertas
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(report.concerns ?? []).map((c, i) => (
              <li key={i} style={{ padding: "6px 0", fontSize: 12, color: C.g700, borderBottom: `1px solid ${C.g100}` }}>
                <span style={{ color: C.neg }}>↓</span> {typeof c === "string" ? c : JSON.stringify(c)}
              </li>
            ))}
            {(!report.concerns || report.concerns.length === 0) && (
              <li style={{ color: C.g500, fontSize: 12 }}>—</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ProblemasTab({ acompData }: { acompData?: { latest_report: { concerns: unknown[] } | null } }) {
  const concerns = acompData?.latest_report?.concerns ?? []
  return (
    <div>
      <div style={{ fontSize: 12, color: C.g500, marginBottom: 12, lineHeight: 1.5 }}>
        Causa-raiz ranqueada pela IA com base nos alertas mais recorrentes.
      </div>
      {concerns.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Sem alertas recorrentes mapeados.
        </div>
      ) : (
        <ol style={{ margin: 0, padding: "0 0 0 20px" }}>
          {concerns.slice(0, 5).map((c, i) => (
            <li key={i} style={{ padding: "8px 0", fontSize: 13, color: C.g700 }}>
              {typeof c === "string" ? c : JSON.stringify(c)}
            </li>
          ))}
        </ol>
      )}
      <div style={{ marginTop: 16, padding: 12, background: C.warnBg, borderRadius: 4, fontSize: 12, color: C.warn, lineHeight: 1.5 }}>
        <strong>Sugestão:</strong> use o chat IA →ao lado pra perguntar &quot;qual a próxima ação pra resolver o problema #1?&quot;
      </div>
    </div>
  )
}

function ComparativoTab({ storeId }: { storeId: string }) {
  const { data } = useSWR<{ data: { reports: Array<{ week_start: string; metrics: Record<string, unknown> | null }> } }>(
    storeId ? `/api/stores/${storeId}/acompanhamento` : null,
    fetcher,
  )
  const reports = data?.data?.reports ?? []
  return (
    <div>
      <div style={{ fontSize: 12, color: C.g500, marginBottom: 12 }}>
        Últimas {reports.length} semanas — variação por métrica.
      </div>
      {reports.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Sem histórico semanal ainda.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.g200}`, color: C.g500, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Semana</th>
                <th style={{ padding: "8px 6px" }}>Métricas</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.g100}` }}>
                  <td style={{ padding: "8px 6px", color: C.g700, whiteSpace: "nowrap" }}>
                    {new Date(r.week_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </td>
                  <td style={{ padding: "8px 6px", color: C.g500, fontSize: 11 }}>
                    {r.metrics ? Object.keys(r.metrics).slice(0, 5).join(" · ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CampanhasTab({ storeId }: { storeId: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
      Performance de campanhas será carregada via Omnisend/Klaviyo API.
      <br />
      <a
        href={`/admin/stores/${storeId}?tab=performance`}
        target="_blank"
        rel="noreferrer"
        style={{ color: C.brand, fontSize: 12, marginTop: 8, display: "inline-block" }}
      >
        Ver detalhe da loja →
      </a>
    </div>
  )
}

function AutomacoesTab({ storeId }: { storeId: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
      Performance de flows/automações será carregada via Omnisend/Klaviyo API.
      <br />
      <a
        href={`/admin/stores/${storeId}?tab=performance`}
        target="_blank"
        rel="noreferrer"
        style={{ color: C.brand, fontSize: 12, marginTop: 8, display: "inline-block" }}
      >
        Ver detalhe da loja →
      </a>
    </div>
  )
}

function RitualChatPanel({ storeId }: { storeId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Oi! Estou aqui pra ajudar a diagnosticar essa loja. Posso analisar funil, comparativo histórico, sugerir ações específicas. O que você quer entender primeiro?",
    },
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // Reset chat ao mudar de loja
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: "Loja nova carregada. Estou pronto pra ajudar nesse diagnóstico.",
      },
    ])
  }, [storeId])

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
      const json = await r.json()
      const aiMsg = json.data?.message ?? json.message
      if (aiMsg) {
        setMessages((prev) => [...prev, aiMsg as ChatMessage])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Não consegui processar agora. Tenta de novo?" },
        ])
      }
    } finally {
      setSending(false)
    }
  }

  const suggestions = [
    "Qual o problema #1 dessa loja?",
    "Compare com a média do nicho",
    "Sugira 3 ações concretas",
    "Como está a saúde dos flows?",
  ]

  return (
    <div
      style={{
        borderLeft: `1px solid ${C.g200}`,
        background: C.g900,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Chat sobre a loja</div>
        <div style={{ fontSize: 10, color: "#9CA3AF", letterSpacing: 0.4 }}>
          MCP OMNISEND + ADMIN · Claude Sonnet
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "90%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.5,
                background: m.role === "user" ? C.brand : "rgba(255,255,255,0.08)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ fontSize: 11, color: "#9CA3AF", padding: "0 12px" }}>
            IA pensando...
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid rgba(255,255,255,0.08)` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Perguntas frequentes
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={sending}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                border: "none",
                borderRadius: 3,
                cursor: sending ? "wait" : "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid rgba(255,255,255,0.08)`, display: "flex", gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send(input)}
          placeholder="Pergunte algo..."
          disabled={sending}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          style={{
            padding: "8px 14px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            background: C.brand,
            border: "none",
            borderRadius: 4,
            cursor: sending || !input.trim() ? "wait" : "pointer",
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
