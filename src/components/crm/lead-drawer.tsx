"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Mail, Phone, Building2, Calendar, FileText, Sparkles, ArrowRight } from "lucide-react"
import { LeadConvertDialog } from "./lead-convert-dialog"
import { ROUTES } from "@/lib/routes"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LeadDetailResponse {
  lead: {
    id: string
    name: string
    email: string | null
    phone: string | null
    company: string | null
    role: string | null
    source: string | null
    status: string
    ai_qualification_score: number | null
    ai_qualification_reason: string | null
    notes: string | null
    tags: string[] | null
    created_at: string
    updated_at: string
    converted_to_deal_id: string | null
    converted_to_client_id: string | null
    assignee?: { id: string; name: string; avatar_url: string | null; email: string | null } | null
  }
  activities: Array<{
    id: string
    type: string
    content: string
    is_internal: boolean
    created_at: string
    creator?: { id: string; name: string } | null
  }>
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "var(--crm-info-fg)" },
  qualified: { label: "Qualificado", color: "var(--crm-success-fg)" },
  unqualified: { label: "Desqualificado", color: "var(--crm-gray-500)" },
  converted: { label: "Convertido", color: "var(--crm-success-fg)" },
  lost: { label: "Perdido", color: "var(--crm-danger-fg)" },
}

interface LeadDrawerProps {
  leadId: string | null
  onClose: () => void
  onUpdated?: () => void
}

export function LeadDrawer({ leadId, onClose, onUpdated }: LeadDrawerProps) {
  const router = useRouter()
  const open = !!leadId
  const { data, isLoading, mutate } = useSWR<LeadDetailResponse>(
    leadId ? `/api/crm/leads/${leadId}` : null,
    fetcher,
  )

  const [editing, setEditing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const lead = data?.lead

  useEffect(() => {
    if (lead) {
      setName(lead.name)
      setEmail(lead.email || "")
      setPhone(lead.phone || "")
      setCompany(lead.company || "")
      setNotes(lead.notes || "")
    }
    if (!open) setEditing(false)
  }, [lead, open])

  const save = async () => {
    if (!leadId) return
    setSaving(true)
    try {
      await fetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          company: company || null,
          notes: notes || null,
        }),
      })
      await mutate()
      onUpdated?.()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!leadId) return
    await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    await mutate()
    onUpdated?.()
  }

  return (
    <>
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          style={{
            background: "var(--crm-gray-0)",
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {lead?.name || "Detalhes do lead"}
          </DialogPrimitive.Title>

          {/* Header */}
          <div
            className="flex items-start justify-between border-b px-6 py-4"
            style={{ borderColor: "var(--crm-gray-200)" }}
          >
            <div className="min-w-0 flex-1 pr-3">
              {isLoading ? (
                <div style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
                  Carregando...
                </div>
              ) : lead ? (
                <>
                  <span
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: STATUS_LABELS[lead.status]?.color || "var(--crm-gray-500)",
                      fontWeight: "var(--crm-weight-medium)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {STATUS_LABELS[lead.status]?.label || lead.status}
                  </span>
                  <h2
                    className="mt-1 truncate"
                    style={{
                      fontSize: "var(--crm-text-lg)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-900)",
                    }}
                  >
                    {lead.name}
                  </h2>
                  {lead.company && (
                    <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
                      {lead.company}
                    </p>
                  )}
                </>
              ) : null}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
              style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {lead && (
              <div className="space-y-6 px-6 py-4">
                {/* AI score */}
                {lead.ai_qualification_score != null && (
                  <div
                    className="flex items-start gap-3 rounded p-3"
                    style={{
                      background: "var(--crm-info-bg)",
                      border: "1px solid var(--crm-info-border)",
                      borderRadius: "var(--crm-radius-md)",
                    }}
                  >
                    <Sparkles
                      className="h-4 w-4 shrink-0 mt-0.5"
                      style={{ color: "var(--crm-info-fg)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: "var(--crm-text-md)",
                            fontWeight: "var(--crm-weight-medium)",
                            color: "var(--crm-info-fg)",
                            fontFamily: "var(--crm-font-mono)",
                          }}
                        >
                          {lead.ai_qualification_score}/100
                        </span>
                        <span
                          style={{
                            fontSize: "var(--crm-text-xs)",
                            color: "var(--crm-gray-600)",
                          }}
                        >
                          IA score
                        </span>
                      </div>
                      {lead.ai_qualification_reason && (
                        <p
                          className="mt-1"
                          style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-700)" }}
                        >
                          {lead.ai_qualification_reason}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick actions */}
                {lead.status !== "converted" && (
                  <div className="flex flex-wrap gap-2">
                    {lead.status !== "qualified" && (
                      <button
                        className="crm-button-ghost"
                        onClick={() => updateStatus("qualified")}
                      >
                        Marcar como qualificado
                      </button>
                    )}
                    {lead.status !== "unqualified" && (
                      <button
                        className="crm-button-ghost"
                        onClick={() => updateStatus("unqualified")}
                      >
                        Desqualificar
                      </button>
                    )}
                  </div>
                )}

                {/* Fields */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: "var(--crm-gray-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: "var(--crm-weight-medium)",
                      }}
                    >
                      Dados de contato
                    </h3>
                    {!editing ? (
                      <button
                        className="crm-button-ghost"
                        style={{ height: "var(--crm-button-height-sm)", padding: "0 10px" }}
                        onClick={() => setEditing(true)}
                      >
                        Editar
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          className="crm-button-ghost"
                          style={{ height: "var(--crm-button-height-sm)", padding: "0 10px" }}
                          onClick={() => setEditing(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          className="crm-button-primary"
                          style={{ height: "var(--crm-button-height-sm)", padding: "0 10px" }}
                          onClick={save}
                          disabled={saving}
                        >
                          {saving ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    )}
                  </div>

                  {editing ? (
                    <div className="space-y-3">
                      <input
                        className="crm-input w-full"
                        placeholder="Nome"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <input
                        className="crm-input w-full"
                        placeholder="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <input
                        className="crm-input w-full"
                        placeholder="Telefone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <input
                        className="crm-input w-full"
                        placeholder="Empresa"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                      <textarea
                        className="crm-input w-full"
                        style={{ height: "auto", minHeight: 70, padding: 10, resize: "vertical" }}
                        placeholder="Notas..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field icon={<Mail className="h-3 w-3" />} label="Email" value={lead.email || "—"} />
                      <Field icon={<Phone className="h-3 w-3" />} label="Telefone" value={lead.phone || "—"} />
                      <Field icon={<Building2 className="h-3 w-3" />} label="Empresa" value={lead.company || "—"} />
                      <Field icon={<FileText className="h-3 w-3" />} label="Cargo" value={lead.role || "—"} />
                      <Field icon={<Calendar className="h-3 w-3" />} label="Fonte" value={lead.source || "—"} />
                      <Field
                        icon={<Calendar className="h-3 w-3" />}
                        label="Criado em"
                        value={new Date(lead.created_at).toLocaleDateString("pt-BR")}
                      />
                    </div>
                  )}

                  {!editing && lead.notes && (
                    <div className="mt-3">
                      <span
                        style={{
                          fontSize: "var(--crm-text-xs)",
                          color: "var(--crm-gray-500)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: "var(--crm-weight-medium)",
                        }}
                      >
                        Notas
                      </span>
                      <p
                        className="mt-1"
                        style={{
                          fontSize: "var(--crm-text-base)",
                          color: "var(--crm-gray-800)",
                          whiteSpace: "pre-wrap",
                          lineHeight: "var(--crm-leading-normal)",
                        }}
                      >
                        {lead.notes}
                      </p>
                    </div>
                  )}
                </section>

                {/* Convert action */}
                {lead.status !== "converted" && (
                  <section
                    style={{
                      border: "1px solid var(--crm-gray-200)",
                      borderRadius: "var(--crm-radius-md)",
                      padding: "var(--crm-space-4)",
                      background: "var(--crm-gray-50)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "var(--crm-text-md)",
                        fontWeight: "var(--crm-weight-medium)",
                        color: "var(--crm-gray-900)",
                      }}
                    >
                      Converter em deal
                    </h3>
                    <p
                      className="mt-1"
                      style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-600)" }}
                    >
                      Cria um deal em qualquer pipeline comercial. Opcionalmente cria
                      um cliente vinculado.
                    </p>
                    <button
                      className="crm-button-primary mt-3"
                      style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
                      onClick={() => setConverting(true)}
                    >
                      Converter em deal
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </section>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

    <LeadConvertDialog
      leadId={leadId}
      open={converting}
      onClose={() => setConverting(false)}
      onConverted={(dealId) => {
        setConverting(false)
        mutate()
        onUpdated?.()
        // Navega pra ficha do deal recem-criado
        router.push(ROUTES.ADMIN.COMERCIAL.DEAL_DETAIL(dealId))
      }}
    />
    </>
  )
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div
        className="flex items-center gap-1.5"
        style={{
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
        }}
      >
        {icon}
        {label}
      </div>
      <p
        className="mt-0.5"
        style={{ fontSize: "var(--crm-text-base)", color: "var(--crm-gray-800)" }}
      >
        {value}
      </p>
    </div>
  )
}
