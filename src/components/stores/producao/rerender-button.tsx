"use client"

/**
 * Botao "Re-renderizar" do workspace de producao (Story AE-20).
 *
 * - Dropdown com 2 opcoes: "este flow" / "loja inteira"
 *   (caso `flowId` nao seja passado, mostra apenas "loja inteira")
 * - Modal de confirmacao mostra count exato dos emails que serao
 *   resetados (via GET /api/admin/stores/[id]/rerender)
 * - POST inserindo signal_type='rerender' — cron consome e dispara
 *   reset + fase 2 (image + html + QA).
 *
 * Custo estimado ~R$0.05/email (heuristica grosseira: imagem ai +
 * tokens claude; ajustar quando tivermos numeros reais via
 * crm_ai_action_runs).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2, RefreshCw, X } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

type Scope = "store" | "flow"
// rerender = só fase 2 (imagem+HTML+QA, preserva copy) · full = regeneração
// completa via /regenerate-pipeline (Montador+Blueprint → copy n8n → render)
type Mode = "rerender" | "full"

interface PreviewResponse {
  scope: Scope
  flow_id: string | null
  emails_to_rerender: number
}

interface RerenderResponse {
  signal_id: string
  scope: Scope
  flow_id: string | null
  emails_to_rerender: number
  message: string
}

interface ApiEnvelope<T> {
  data?: T
  success?: boolean
  error?: string
}

const COST_PER_EMAIL_BRL = 0.05

export function RerenderButton({
  storeId,
  flowId,
  flowName,
}: {
  storeId: string
  flowId?: string
  flowName?: string
}) {
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scope, setScope] = useState<Scope | null>(null) // scope confirmado para o modal
  const [mode, setMode] = useState<Mode>("rerender")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fechar menu ao clicar fora
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  const fetchPreview = useCallback(
    async (s: Scope) => {
      setPreviewLoading(true)
      setPreviewError(null)
      setPreview(null)
      try {
        const params = new URLSearchParams({ scope: s })
        if (s === "flow" && flowId) params.set("flow_id", flowId)
        const res = await fetch(
          `/api/admin/stores/${storeId}/rerender?${params.toString()}`,
        )
        const json = (await res.json()) as ApiEnvelope<PreviewResponse>
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `HTTP ${res.status}`)
        }
        const data = (json?.data ?? json) as PreviewResponse
        setPreview(data)
      } catch (err) {
        setPreviewError(
          err instanceof Error ? err.message : "Erro ao carregar preview",
        )
      } finally {
        setPreviewLoading(false)
      }
    },
    [storeId, flowId],
  )

  const openModalWithScope = (s: Scope, m: Mode = "rerender") => {
    setMenuOpen(false)
    setMode(m)
    setScope(s)
    // Preview de contagem só existe pro rerender (fase 2). Na regeneração
    // completa o alvo é "tudo que não é legacy" — modal mostra aviso fixo.
    if (m === "rerender") void fetchPreview(s)
  }

  const closeModal = () => {
    if (submitting) return
    setScope(null)
    setPreview(null)
    setPreviewError(null)
  }

  const submit = async () => {
    if (!scope) return
    setSubmitting(true)
    try {
      if (mode === "full") {
        const body: Record<string, unknown> = {}
        if (scope === "flow" && flowId) body.flow_ids = [flowId]
        const res = await fetch(
          `/api/admin/stores/${storeId}/regenerate-pipeline`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        )
        const json = (await res.json()) as ApiEnvelope<{
          emails_reset: number
          email_count: number | null
        }>
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `HTTP ${res.status}`)
        }
        const data = (json?.data ?? json) as {
          emails_reset: number
          email_count: number | null
        }
        toast({
          title: "Regeneracao completa enfileirada",
          description: `${data.email_count ?? data.emails_reset} email(s): Montador + Blueprint, depois copy (n8n) e render. Acompanhe em Agentes > Runs.`,
        })
        setScope(null)
        setPreview(null)
        return
      }

      const body: Record<string, unknown> = { scope }
      if (scope === "flow" && flowId) body.flow_id = flowId
      const res = await fetch(`/api/admin/stores/${storeId}/rerender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as ApiEnvelope<RerenderResponse>
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      const data = (json?.data ?? json) as RerenderResponse
      toast({
        title: "Re-renderizacao enfileirada",
        description: `${data.emails_to_rerender} email(s) serao reprocessados em ate 1 minuto.`,
      })
      setScope(null)
      setPreview(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao enfileirar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const count = preview?.emails_to_rerender ?? 0
  const cost = (count * COST_PER_EMAIL_BRL).toFixed(2)

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="cf-focusable inline-flex items-center gap-1.5"
        style={{
          height: 28,
          padding: "0 10px",
          fontSize: 12,
          fontWeight: 500,
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
          color: "var(--crm-gray-700)",
          cursor: "pointer",
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Re-renderizar
        <ChevronDown className="h-3 w-3" style={{ marginLeft: 2 }} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 30,
            minWidth: 220,
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            padding: 4,
          }}
        >
          {flowId && flowName && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openModalWithScope("flow")}
              className="w-full text-left cf-focusable"
              style={{
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--crm-gray-800)",
                background: "transparent",
                border: 0,
                borderRadius: 4,
                cursor: "pointer",
                display: "block",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--crm-gray-50)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Re-renderizar este flow
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--crm-gray-500)",
                  marginTop: 1,
                }}
              >
                {flowName}
              </div>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => openModalWithScope("store")}
            className="w-full text-left cf-focusable"
            style={{
              padding: "8px 10px",
              fontSize: 12,
              color: "var(--crm-gray-800)",
              background: "transparent",
              border: 0,
              borderRadius: 4,
              cursor: "pointer",
              display: "block",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--crm-gray-50)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Re-renderizar loja inteira
            <div
              style={{
                fontSize: 10.5,
                color: "var(--crm-gray-500)",
                marginTop: 1,
              }}
            >
              Todos os flows
            </div>
          </button>

          <div
            style={{
              borderTop: "1px solid var(--crm-border)",
              margin: "4px 0",
            }}
          />

          <button
            type="button"
            role="menuitem"
            onClick={() => openModalWithScope(flowId ? "flow" : "store", "full")}
            className="w-full text-left cf-focusable"
            style={{
              padding: "8px 10px",
              fontSize: 12,
              color: "var(--crm-red-700, #B91C1C)",
              background: "transparent",
              border: 0,
              borderRadius: 4,
              cursor: "pointer",
              display: "block",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--crm-red-50, #FEF2F2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Regenerar do zero{flowId && flowName ? " — este flow" : ""}
            <div
              style={{
                fontSize: 10.5,
                color: "var(--crm-gray-500)",
                marginTop: 1,
              }}
            >
              Montador + Blueprint → copy (n8n) → render
            </div>
          </button>
          {flowId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openModalWithScope("store", "full")}
              className="w-full text-left cf-focusable"
              style={{
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--crm-red-700, #B91C1C)",
                background: "transparent",
                border: 0,
                borderRadius: 4,
                cursor: "pointer",
                display: "block",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  "var(--crm-red-50, #FEF2F2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Regenerar do zero — loja inteira
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--crm-gray-500)",
                  marginTop: 1,
                }}
              >
                Todos os flows, como no fluxo do briefing
              </div>
            </button>
          )}
        </div>
      )}

      {scope !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[460px] bg-white rounded-[10px] shadow-2xl border border-black/[0.08] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-900">
                {mode === "full"
                  ? "Regenerar do zero?"
                  : "Re-renderizar emails?"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-[13px] text-slate-700">
              <p>
                Escopo:{" "}
                <strong>
                  {scope === "flow"
                    ? `Flow "${flowName ?? "selecionado"}"`
                    : "Loja inteira"}
                </strong>
              </p>

              {mode === "full" && (
                <>
                  <p>
                    Replay do fluxo completo do briefing:{" "}
                    <strong>
                      Montador + Blueprint por email → copy nova (n8n) →
                      imagem + HTML + QA
                    </strong>
                    .
                  </p>
                  <div
                    className="rounded-[6px] px-3 py-2 text-[12px]"
                    style={{
                      background: "var(--crm-red-50, #FEF2F2)",
                      color: "var(--crm-red-700, #B91C1C)",
                      border: "1px solid var(--crm-red-100, #FECACA)",
                    }}
                  >
                    A copy e o HTML atuais serão SOBRESCRITOS quando a nova
                    geração completar. Emails legacy (approved/live) não são
                    tocados. A geração roda em fila — pode levar 30-60 min
                    para a loja inteira.
                  </div>
                </>
              )}

              {mode === "rerender" && previewLoading && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculando emails alvo...
                </div>
              )}

              {previewError && (
                <div
                  className="rounded-[6px] px-3 py-2 text-[12px]"
                  style={{
                    background: "var(--crm-red-50, #FEF2F2)",
                    color: "var(--crm-red-700, #B91C1C)",
                    border: "1px solid var(--crm-red-100, #FECACA)",
                  }}
                >
                  {previewError}
                </div>
              )}

              {preview && !previewLoading && (
                <>
                  <p>
                    Vai reprocessar{" "}
                    <strong className="text-slate-900">
                      {count} email{count === 1 ? "" : "s"}
                    </strong>{" "}
                    (imagem + HTML + QA).
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Custo estimado: <strong>R$ {cost}</strong>. Esta acao pode
                    levar alguns minutos.
                  </p>
                  {count === 0 && (
                    <div
                      className="rounded-[6px] px-3 py-2 text-[12px]"
                      style={{
                        background: "var(--crm-gray-50)",
                        color: "var(--crm-gray-700)",
                        border: "1px solid var(--crm-border)",
                      }}
                    >
                      Nenhum email elegivel para re-renderizacao. Apenas
                      emails em <code>rendering</code>, <code>qa_running</code>,
                      <code> ready</code> ou <code>failed</code> sao
                      reprocessados.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] bg-slate-50">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="cf-focusable inline-flex items-center justify-center"
                style={{
                  height: 32,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 6,
                  color: "var(--crm-gray-700)",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={
                  submitting ||
                  (mode === "rerender" &&
                    (previewLoading || !preview || count === 0))
                }
                className="cf-focusable inline-flex items-center justify-center gap-1.5"
                style={{
                  height: 32,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    submitting ||
                    (mode === "rerender" &&
                      (previewLoading || !preview || count === 0))
                      ? "var(--crm-gray-200)"
                      : mode === "full"
                        ? "var(--crm-red-700, #B91C1C)"
                        : "var(--crm-brand)",
                  color: "var(--crm-brand-fg)",
                  border: 0,
                  borderRadius: 6,
                  cursor:
                    submitting ||
                    (mode === "rerender" &&
                      (previewLoading || !preview || count === 0))
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === "full"
                  ? "Regenerar do zero"
                  : "Confirmar re-renderizacao"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
