"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import useSWR from "swr"
import { useAuthStore } from "@/lib/store"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface NewDealDialogProps {
  open: boolean
  onClose: () => void
  pipelineId: string
  defaultStageId?: string
  stages: Array<{ id: string; name: string }>
  onCreated?: (dealId: string) => void
}

interface ClientLite {
  id: string
  name: string
  email: string | null
  company: string | null
}

export function NewDealDialog({
  open,
  onClose,
  pipelineId,
  defaultStageId,
  stages,
  onCreated,
}: NewDealDialogProps) {
  const { user } = useAuthStore()

  const [title, setTitle] = useState("")
  const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || "")
  const [value, setValue] = useState<string>("")
  const [clientId, setClientId] = useState<string>("")
  const [clientSearch, setClientSearch] = useState("")
  const [source, setSource] = useState("")
  const [tags, setTags] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search clients
  const { data: clientsData } = useSWR<{ data: { clients: ClientLite[] } }>(
    open && clientSearch.length >= 2 && !clientId
      ? `/api/clients/search?q=${encodeURIComponent(clientSearch)}`
      : null,
    fetcher,
  )
  const clientOptions = clientsData?.data?.clients || []

  useEffect(() => {
    if (open) {
      setTitle("")
      setStageId(defaultStageId || stages[0]?.id || "")
      setValue("")
      setClientId("")
      setClientSearch("")
      setSource("")
      setTags("")
      setNotes("")
      setError(null)
    }
  }, [open, defaultStageId, stages])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      setError("Sessao expirada. Recarregue a pagina.")
      return
    }
    if (!title.trim() || !stageId) return

    setSubmitting(true)
    setError(null)
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      const numericValue = value ? Number(value.replace(/\D/g, "")) / 100 : 0

      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          stage_id: stageId,
          title: title.trim(),
          value: numericValue,
          owner_id: user.id,
          client_id: clientId || null,
          source: source || null,
          tags: tagList,
          notes: notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar deal")
        return
      }
      onCreated?.(json.data.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-lg)",
            width: "90vw",
            maxWidth: 520,
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
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
                Novo deal
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
              <Field label="Titulo *">
                <input
                  className="crm-input w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Loja XPTO — proposta inicial"
                  autoFocus
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Estagio *">
                  <select
                    className="crm-input w-full"
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    required
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Valor (BRL)">
                  <input
                    className="crm-input w-full"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={value ? formatBRL(value) : ""}
                    onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>

              <Field label="Cliente">
                <input
                  className="crm-input w-full"
                  placeholder="Buscar cliente existente..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    if (e.target.value === "") setClientId("")
                  }}
                />
                {clientOptions.length > 0 && clientSearch && !clientId && (
                  <div
                    className="mt-1"
                    style={{
                      border: "1px solid var(--crm-gray-200)",
                      borderRadius: "var(--crm-radius-md)",
                      maxHeight: 160,
                      overflowY: "auto",
                      background: "var(--crm-gray-0)",
                    }}
                  >
                    {clientOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full text-left hover:bg-[color:var(--crm-gray-50)]"
                        style={{
                          padding: "6px 10px",
                          fontSize: "var(--crm-text-base)",
                          color: "var(--crm-gray-800)",
                        }}
                        onClick={() => {
                          setClientId(c.id)
                          setClientSearch(c.name)
                        }}
                      >
                        <div style={{ fontWeight: "var(--crm-weight-medium)" }}>{c.name}</div>
                        {c.company && (
                          <div style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                            {c.company}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fonte">
                  <input
                    className="crm-input w-full"
                    placeholder="Ex: Inbound, Indicacao..."
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </Field>
                <Field label="Tags (virgulas)">
                  <input
                    className="crm-input w-full"
                    placeholder="Ex: Black Friday, Upsell"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Notas">
                <textarea
                  className="crm-input w-full"
                  style={{ height: "auto", minHeight: 60, padding: 10, resize: "vertical" }}
                  placeholder="Observacoes iniciais..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

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
                disabled={submitting || !title.trim() || !stageId}
                style={{ opacity: submitting || !title.trim() || !stageId ? 0.5 : 1 }}
              >
                {submitting ? "Criando..." : "Criar deal"}
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
