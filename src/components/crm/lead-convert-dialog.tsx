"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import useSWR from "swr"
import { X, ArrowRight } from "lucide-react"
import { useAuthStore } from "@/lib/store"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LeadConvertDialogProps {
  leadId: string | null
  open: boolean
  onClose: () => void
  onConverted?: (dealId: string) => void
}

interface PipelineLite {
  id: string
  name: string
  scope: string
  stages: Array<{ id: string; name: string; stage_type: string | null }>
}

export function LeadConvertDialog({ leadId, open, onClose, onConverted }: LeadConvertDialogProps) {
  const { user } = useAuthStore()

  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    open ? "/api/crm/pipelines?scope=sales" : null,
    fetcher,
  )
  const pipelines = pipelinesData?.pipelines || []

  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [value, setValue] = useState<string>("")
  const [dealTitle, setDealTitle] = useState("")
  const [createClient, setCreateClient] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && pipelines.length > 0 && !pipelineId) {
      const inbound = pipelines.find((p) => p.name.toLowerCase().includes("inbound")) || pipelines[0]
      setPipelineId(inbound.id)
      setStageId(inbound.stages[0]?.id || "")
    }
    if (!open) {
      setPipelineId("")
      setStageId("")
      setValue("")
      setDealTitle("")
      setError(null)
    }
  }, [open, pipelines, pipelineId])

  useEffect(() => {
    if (pipelineId) {
      const p = pipelines.find((p) => p.id === pipelineId)
      if (p && p.stages.length > 0) setStageId(p.stages[0].id)
    }
  }, [pipelineId, pipelines])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadId || !pipelineId || !stageId) return
    setSubmitting(true)
    setError(null)
    try {
      const numericValue = value ? Number(value.replace(/\D/g, "")) / 100 : 0
      const body: Record<string, unknown> = {
        pipeline_id: pipelineId,
        stage_id: stageId,
        value: numericValue,
        create_client: createClient,
        deal_title: dealTitle || undefined,
      }
      if (user?.id) body.owner_id = user.id
      const res = await fetch(`/api/crm/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao converter")
        return
      }
      onConverted?.(json.deal_id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[60] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=open]:zoom-in-95"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-lg)",
            width: "90vw",
            maxWidth: 520,
            fontFamily: "var(--crm-font-sans)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          <form onSubmit={submit}>
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--crm-gray-200)" }}
            >
              <DialogPrimitive.Title
                style={{
                  fontSize: "var(--crm-text-md)",
                  fontWeight: "var(--crm-weight-medium)",
                  color: "var(--crm-gray-900)",
                }}
              >
                Converter lead em deal
              </DialogPrimitive.Title>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
                style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <Field label="Pipeline *">
                <select
                  className="crm-input w-full"
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                  required
                >
                  <option value="">Selecione...</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Estagio inicial *">
                <select
                  className="crm-input w-full"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  required
                  disabled={!selectedPipeline}
                >
                  {selectedPipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Valor estimado (BRL)">
                <input
                  className="crm-input w-full"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={value ? formatBRL(value) : ""}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                />
              </Field>

              <Field label="Titulo do deal (opcional)">
                <input
                  className="crm-input w-full"
                  placeholder="Padrao: nome da empresa ou lead"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                />
              </Field>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createClient}
                  onChange={(e) => setCreateClient(e.target.checked)}
                  style={{ accentColor: "var(--crm-brand)" }}
                />
                <span style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-700)" }}>
                  Tambem criar cliente vinculado (status: prospect)
                </span>
              </label>

              {error && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
                  {error}
                </p>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
            >
              <button type="button" className="crm-button-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="crm-button-primary"
                disabled={submitting || !pipelineId || !stageId}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--crm-space-2)",
                  opacity: submitting || !pipelineId || !stageId ? 0.5 : 1,
                }}
              >
                {submitting ? "Convertendo..." : (
                  <>
                    Converter
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function formatBRL(centsStr: string): string {
  if (!centsStr) return ""
  const cents = parseInt(centsStr, 10) || 0
  const reais = Math.floor(cents / 100)
  const cen = cents % 100
  return `${reais.toLocaleString("pt-BR")},${cen.toString().padStart(2, "0")}`
}
