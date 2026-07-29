"use client"

/**
 * MoveDealPipelineDialog — transfere um deal para outra pipeline.
 *
 * Escolhe pipeline de destino + etapa e chama POST /api/crm/deals/[id]/move.
 * O `pipeline_id` do deal é derivado no servidor a partir da etapa, então o
 * dialog só precisa mandar `stage_id` (sem `position`, pra o deal entrar no
 * fim da etapa de destino).
 *
 * Só lista pipelines do MESMO escopo da atual — a API rejeita cross-scope
 * (400 scope-mismatch) e a lista aqui evita oferecer o que vai falhar.
 */

import { useEffect, useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import useSWR from "swr"
import { X, ArrowRight, AlertTriangle, Shuffle } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StageLite {
  id: string
  name: string
  order: number
  stage_type: string | null
  color?: string | null
}

interface PipelineLite {
  id: string
  name: string
  scope: string
  color?: string | null
  stages?: StageLite[]
}

interface MoveDealPipelineDialogProps {
  open: boolean
  onClose: () => void
  dealId: string
  dealTitle?: string | null
  currentPipelineId: string
  /** Chamado após a transferência dar certo (refetch do board/drawer). */
  onMoved?: () => void
}

export function MoveDealPipelineDialog({
  open,
  onClose,
  dealId,
  dealTitle,
  currentPipelineId,
  onMoved,
}: MoveDealPipelineDialogProps) {
  const { data, isLoading } = useSWR(
    open ? "/api/crm/pipelines?scope=all" : null,
    fetcher,
  )

  const [targetPipelineId, setTargetPipelineId] = useState("")
  const [targetStageId, setTargetStageId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pipelines: PipelineLite[] = useMemo(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )

  const current = pipelines.find((p) => p.id === currentPipelineId)

  // Mesmo escopo apenas. Sem a pipeline atual carregada (lista ainda
  // vindo, ou pipeline arquivada) não dá pra inferir o escopo — nesse
  // caso não oferecemos destino nenhum em vez de oferecer errado.
  const targets = useMemo(() => {
    if (!current) return []
    return pipelines.filter(
      (p) => p.id !== currentPipelineId && p.scope === current.scope,
    )
  }, [pipelines, current, currentPipelineId])

  const targetPipeline = targets.find((p) => p.id === targetPipelineId)

  const stages = useMemo(() => {
    const list = targetPipeline?.stages ?? []
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [targetPipeline])

  // Ao trocar a pipeline destino, cai na primeira etapa dela.
  useEffect(() => {
    setTargetStageId(stages[0]?.id ?? "")
  }, [stages])

  // Reseta o formulário sempre que reabre.
  useEffect(() => {
    if (!open) return
    setTargetPipelineId("")
    setTargetStageId("")
    setError(null)
  }, [open])

  const targetStage = stages.find((s) => s.id === targetStageId)
  const isTerminalStage =
    targetStage?.stage_type === "won" || targetStage?.stage_type === "lost"

  const submit = async () => {
    if (!targetStageId) return
    setSubmitting(true)
    setError(null)
    try {
      // Sem `position`: o servidor calcula o fim da etapa de destino.
      const res = await fetch(`/api/crm/deals/${dealId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: targetStageId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        setError(
          json?.error?.message ||
            json?.error ||
            `Falha ao transferir (${res.status})`,
        )
        return
      }
      onMoved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[60] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 overflow-hidden data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-2xl)",
            width: "90vw",
            maxWidth: 460,
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
            boxShadow: "var(--crm-shadow-modal)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between"
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--crm-radius-md)",
                  background: "var(--crm-gray-100)",
                  color: "var(--crm-gray-700)",
                }}
              >
                <Shuffle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--crm-gray-900)",
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  Transferir de pipeline
                </DialogPrimitive.Title>
                <div
                  className="truncate"
                  style={{
                    fontSize: 12,
                    color: "var(--crm-gray-500)",
                    marginTop: 2,
                  }}
                >
                  {dealTitle || "Deal"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="cf-focusable flex items-center justify-center shrink-0"
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--crm-radius-md)",
                color: "var(--crm-gray-500)",
                background: "transparent",
                border: 0,
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "18px 22px" }} className="space-y-3">
            {/* Origem → destino */}
            <div
              className="flex items-center gap-2"
              style={{
                padding: "9px 11px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-md)",
                fontSize: 12,
              }}
            >
              <span
                className="truncate"
                style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}
              >
                {current?.name ?? "Pipeline atual"}
              </span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: "var(--crm-gray-400)" }}
              />
              <span
                className="truncate"
                style={{
                  color: targetPipeline
                    ? "var(--crm-gray-900)"
                    : "var(--crm-gray-400)",
                  fontWeight: targetPipeline ? 600 : 400,
                }}
              >
                {targetPipeline?.name ?? "escolha o destino"}
              </span>
            </div>

            {isLoading && (
              <p style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
                Carregando pipelines…
              </p>
            )}

            {!isLoading && targets.length === 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--crm-gray-500)",
                  lineHeight: 1.5,
                }}
              >
                Não há outra pipeline no mesmo escopo
                {current?.scope ? ` (${current.scope})` : ""} para receber este
                deal. Transferência entre escopos diferentes não é permitida.
              </p>
            )}

            {!isLoading && targets.length > 0 && (
              <>
                <FieldBlock label="Pipeline de destino">
                  <select
                    className="crm-input w-full"
                    value={targetPipelineId}
                    onChange={(e) => setTargetPipelineId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {targets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FieldBlock>

                {targetPipeline && (
                  <FieldBlock label="Etapa de destino">
                    <select
                      className="crm-input w-full"
                      value={targetStageId}
                      onChange={(e) => setTargetStageId(e.target.value)}
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                )}

                {isTerminalStage && (
                  <div
                    className="flex items-start gap-2"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--crm-radius-md)",
                      background: "var(--crm-warn-bg, #FFFBEB)",
                      border: "1px solid var(--crm-warn-border, #FDE68A)",
                      fontSize: 11.5,
                      color: "var(--crm-warn-fg, #92400E)",
                      lineHeight: 1.45,
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                      &quot;{targetStage?.name}&quot; é uma etapa de{" "}
                      {targetStage?.stage_type === "won" ? "ganho" : "perda"} —
                      o deal será marcado como{" "}
                      {targetStage?.stage_type === "won" ? "ganho" : "perdido"}{" "}
                      ao ser transferido.
                    </span>
                  </div>
                )}

                <p
                  style={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    lineHeight: 1.45,
                  }}
                >
                  A transferência fica registrada no histórico do deal e{" "}
                  <b style={{ color: "var(--crm-gray-700)" }}>
                    não dispara automações
                  </b>{" "}
                  de mudança de etapa.
                </p>
              </>
            )}

            {error && (
              <p
                style={{
                  fontSize: "var(--crm-text-sm)",
                  color: "var(--crm-danger-fg)",
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-2"
            style={{
              padding: "14px 22px",
              borderTop: "1px solid var(--crm-border)",
              background: "var(--crm-gray-25)",
            }}
          >
            <button type="button" className="crm-button-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="crm-button-primary"
              onClick={submit}
              disabled={submitting || !targetStageId}
              style={{ opacity: submitting || !targetStageId ? 0.5 : 1 }}
            >
              {submitting ? "Transferindo…" : "Transferir"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Cada bloco embrulha exatamente UM <select>, então o <label> implícito é
 * seguro aqui (e dá o clique-para-focar). Nunca use este wrapper com
 * conteúdo composto — ver comentário do Field em new-deal-dialog.tsx.
 */
function FieldBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        style={{
          display: "block",
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-600)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
