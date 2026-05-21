"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import useSWR from "swr"
import { useAuthStore } from "@/lib/store"
import { TagsSelector } from "./tags-selector"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Tipos de origem padronizados pra metrificacao. 'indicacao' destrava o
// campo 'Quem indicou' pra rastrear quem trouxe o lead — base de relatorio
// 'Top indicadores'.
const SOURCE_TYPES: Array<{ value: string; label: string; icon: string }> = [
  { value: "indicacao", label: "Indicação", icon: "🤝" },
  { value: "meta_ads", label: "Meta Ads", icon: "📘" },
  { value: "google_ads", label: "Google Ads", icon: "🔎" },
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "site", label: "Site / Inbound", icon: "🌐" },
  { value: "evento", label: "Evento", icon: "🎤" },
  { value: "outbound", label: "Outbound", icon: "📞" },
  { value: "parceiro", label: "Parceiro", icon: "🤝" },
  { value: "outro", label: "Outro", icon: "✨" },
]

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
  const [phone, setPhone] = useState("")
  const [source, setSource] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [sourceReferrer, setSourceReferrer] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search clients
  const { data: clientsData } = useSWR<{ clients: ClientLite[] }>(
    open && clientSearch.length >= 2 && !clientId
      ? `/api/clients/search?q=${encodeURIComponent(clientSearch)}`
      : null,
    fetcher,
  )
  const clientOptions = clientsData?.clients || []

  // Reset SO quando o dialog abre. Antes incluia [defaultStageId, stages]
  // como deps, mas como o parent recriava 'stages' a cada render, o effect
  // re-disparava no meio da interacao e zerava tags/phone/notes selecionados.
  // Bug: usuario clicava em tag -> setTags atualizava -> parent re-renderizava
  // (novo stages array) -> effect rodava -> tags voltava pra []. Fix: depende
  // apenas de `open`, captura defaults dos props no momento da abertura.
  useEffect(() => {
    if (!open) return
    setTitle("")
    setStageId(defaultStageId || stages[0]?.id || "")
    setValue("")
    setClientId("")
    setClientSearch("")
    setPhone("")
    setSource("")
    setSourceType("")
    setSourceReferrer("")
    setTags([])
    setNotes("")
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !stageId) return

    setSubmitting(true)
    setError(null)
    try {
      // Tags vem do TagsSelector como array de names
      const tagList = tags

      const numericValue = value ? Number(value.replace(/\D/g, "")) / 100 : 0

      // owner_id e opcional — backend resolve pra current user quando ausente.
      // Mandamos so se o store ja foi populado (caso permissoes futuras
      // permitam delegar pra outro vendedor).
      const body: Record<string, unknown> = {
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: title.trim(),
        value: numericValue,
        client_id: clientId || null,
        source: source || sourceType || null,
        source_type: sourceType || null,
        source_referrer: sourceReferrer.trim() || null,
        tags: tagList,
        notes: notes || null,
      }
      // Phone vai em custom_fields.contact_phone (deals nao tem coluna
      // dedicada pra phone — eh atributo de contato/lead, nao de deal).
      if (phone.trim()) {
        body.custom_fields = { contact_phone: phone.trim() }
      }
      if (user?.id) body.owner_id = user.id

      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar deal")
        return
      }
      onCreated?.(json.id)
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
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-hidden data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-2xl)",
            width: "90vw",
            maxWidth: 560,
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
            boxShadow: "var(--crm-shadow-modal)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div
              className="flex items-start justify-between"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--crm-border)",
              }}
            >
              <div>
                <DialogPrimitive.Title
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--crm-gray-900)",
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  Novo deal
                </DialogPrimitive.Title>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--crm-gray-500)",
                    marginTop: 3,
                  }}
                >
                  {stages.find((s) => s.id === stageId)?.name ?? "Nova etapa"}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex items-center justify-center cf-focusable"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "var(--crm-radius-md)",
                  color: "var(--crm-gray-500)",
                  background: "transparent",
                  border: 0,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="space-y-3 overflow-y-auto"
              style={{ padding: "20px 24px" }}
            >
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

              <Field label="Telefone / WhatsApp do contato">
                <input
                  className="crm-input w-full"
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>

              {/* Tipo de origem (categoria) + Quem indicou/canal especifico */}
              <Field label="Tipo de origem">
                <div className="grid grid-cols-3 gap-1.5">
                  {SOURCE_TYPES.map((opt) => {
                    const active = sourceType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSourceType(opt.value)
                          if (opt.value !== "indicacao") setSourceReferrer("")
                        }}
                        className={
                          "inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-[12px] font-medium border transition-colors " +
                          (active
                            ? "bg-brand-50 text-brand-700 border-brand-300"
                            : "bg-white text-slate-700 border-black/[0.06] hover:bg-slate-50")
                        }
                      >
                        <span>{opt.icon}</span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {/* Quem indicou / origem especifica */}
              {sourceType && (
                <Field
                  label={
                    sourceType === "indicacao"
                      ? "Quem indicou? (obrigatório)"
                      : "Origem específica (opcional)"
                  }
                >
                  <input
                    className="crm-input w-full"
                    placeholder={
                      sourceType === "indicacao"
                        ? "Ex: João Silva (cliente atual)"
                        : sourceType === "meta_ads"
                          ? "Ex: Campanha BF24 - Lookalike"
                          : sourceType === "google_ads"
                            ? "Ex: KW Convertfy Email"
                            : sourceType === "instagram"
                              ? "Ex: Reels @convertfy 12/05"
                              : "Ex: detalhe da origem"
                    }
                    value={sourceReferrer}
                    onChange={(e) => setSourceReferrer(e.target.value)}
                  />
                  {sourceType === "indicacao" && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Identifica o cliente/parceiro que indicou — permite
                      ranquear quem mais traz negócios.
                    </p>
                  )}
                </Field>
              )}

              {/* Fonte livre (legacy/free-text quando o tipo nao cobre) */}
              <Field label="Fonte (legado / texto livre)">
                <input
                  className="crm-input w-full"
                  placeholder="Ex: Inbound, parceiro X..."
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </Field>

              <Field label="Tags">
                <TagsSelector
                  entity="deal"
                  selected={tags}
                  onChange={setTags}
                  placeholder="Buscar ou criar tag…"
                />
              </Field>

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
              className="flex items-center justify-end gap-2"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--crm-border)",
                background: "var(--crm-gray-25)",
                flexShrink: 0,
              }}
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
