"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate as swrMutate } from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, MessageSquare, FileText, Phone, Mail, Calendar, Building2, User, Tag, ExternalLink } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: FileText,
  call: Phone,
  email: Mail,
  wa_message: MessageSquare,
  ig_message: MessageSquare,
  meeting: Calendar,
  task: FileText,
  system: FileText,
  stage_change: FileText,
}

interface DealDrawerProps {
  dealId: string | null
  onClose: () => void
  onUpdated?: () => void
}

interface DealDetailResponse {
  data: {
    deal: {
      id: string
      title: string
      value: number | null
      currency: string | null
      probability: number | null
      status: string
      source: string | null
      tags: string[] | null
      notes: string | null
      lost_reason: string | null
      won_reason: string | null
      created_at: string
      updated_at: string
      pipeline_id: string
      stage_id: string
      pipeline?: { id: string; name: string }
      stage?: { id: string; name: string; stage_type: string | null }
      owner?: { id: string; name: string; avatar_url: string | null } | null
      client?: { id: string; name: string } | null
      store?: { id: string; name: string } | null
      lead?: { id: string; name: string; email: string | null } | null
    }
    activities: Array<{
      id: string
      type: string
      content: string
      due_at: string | null
      completed_at: string | null
      is_internal: boolean
      created_at: string
      creator?: { id: string; name: string; avatar_url: string | null } | null
    }>
    history: Array<{
      id: string
      from_stage_id: string | null
      to_stage_id: string | null
      from_stage?: { name: string } | null
      to_stage?: { name: string } | null
      created_at: string
      changed_by?: { id: string; name: string } | null
    }>
  }
}

export function DealDrawer({ dealId, onClose, onUpdated }: DealDrawerProps) {
  const open = !!dealId
  const { data, isLoading, mutate } = useSWR<DealDetailResponse>(
    dealId ? `/api/crm/deals/${dealId}` : null,
    fetcher,
  )

  const [noteContent, setNoteContent] = useState("")
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!open) setNoteContent("")
  }, [open])

  const deal = data?.data?.deal
  const activities = data?.data?.activities || []

  const postNote = async () => {
    if (!dealId || !noteContent.trim()) return
    setPosting(true)
    try {
      await fetch(`/api/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", content: noteContent.trim(), is_internal: true }),
      })
      setNoteContent("")
      await mutate()
      onUpdated?.()
    } finally {
      setPosting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          style={{
            background: "var(--crm-gray-0)",
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {deal?.title || "Detalhes do deal"}
          </DialogPrimitive.Title>

          {/* Header */}
          <div
            className="flex items-start justify-between border-b px-6 py-4"
            style={{ borderColor: "var(--crm-gray-200)" }}
          >
            <div className="min-w-0 flex-1 pr-3">
              {isLoading ? (
                <div
                  style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
                >
                  Carregando...
                </div>
              ) : deal ? (
                <>
                  <div className="flex items-center gap-2">
                    {deal.pipeline && (
                      <span
                        style={{
                          fontSize: "var(--crm-text-xs)",
                          color: "var(--crm-gray-500)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: "var(--crm-weight-medium)",
                        }}
                      >
                        {deal.pipeline.name}
                      </span>
                    )}
                    {deal.stage && (
                      <>
                        <span style={{ color: "var(--crm-gray-300)" }}>›</span>
                        <span
                          style={{
                            fontSize: "var(--crm-text-xs)",
                            color: "var(--crm-gray-700)",
                            fontWeight: "var(--crm-weight-medium)",
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      </>
                    )}
                  </div>
                  <h2
                    className="mt-1 truncate"
                    style={{
                      fontSize: "var(--crm-text-lg)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-900)",
                    }}
                  >
                    {deal.title}
                  </h2>
                  {deal.value != null && deal.value > 0 && (
                    <p
                      className="mt-1"
                      style={{
                        fontSize: "var(--crm-text-md)",
                        color: "var(--crm-gray-700)",
                        fontFamily: "var(--crm-font-mono)",
                      }}
                    >
                      {fmtBRL(deal.value)}
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
            {deal && (
              <div className="px-6 py-4 space-y-6">
                {/* Meta */}
                <section className="grid grid-cols-2 gap-4">
                  <MetaField icon={<User className="h-3 w-3" />} label="Owner" value={deal.owner?.name || "—"} />
                  <MetaField icon={<Building2 className="h-3 w-3" />} label="Cliente" value={deal.client?.name || "—"} />
                  <MetaField icon={<Tag className="h-3 w-3" />} label="Fonte" value={deal.source || "—"} />
                  <MetaField
                    icon={<Calendar className="h-3 w-3" />}
                    label="Criado em"
                    value={new Date(deal.created_at).toLocaleDateString("pt-BR")}
                  />
                  {deal.lead && (
                    <MetaField
                      icon={<ExternalLink className="h-3 w-3" />}
                      label="Lead origem"
                      value={deal.lead.name}
                    />
                  )}
                </section>

                {deal.tags && deal.tags.length > 0 && (
                  <section>
                    <h3
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: "var(--crm-gray-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: "var(--crm-weight-medium)",
                        marginBottom: "var(--crm-space-2)",
                      }}
                    >
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {deal.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: "var(--crm-text-xs)",
                            color: "var(--crm-gray-700)",
                            background: "var(--crm-gray-100)",
                            padding: "2px 8px",
                            borderRadius: "var(--crm-radius-sm)",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {deal.notes && (
                  <section>
                    <h3
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: "var(--crm-gray-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: "var(--crm-weight-medium)",
                        marginBottom: "var(--crm-space-2)",
                      }}
                    >
                      Notas
                    </h3>
                    <p
                      style={{
                        fontSize: "var(--crm-text-base)",
                        color: "var(--crm-gray-800)",
                        lineHeight: "var(--crm-leading-normal)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {deal.notes}
                    </p>
                  </section>
                )}

                {/* Add note */}
                <section>
                  <h3
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-gray-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: "var(--crm-weight-medium)",
                      marginBottom: "var(--crm-space-2)",
                    }}
                  >
                    Nova nota
                  </h3>
                  <textarea
                    className="crm-input w-full"
                    style={{ height: "auto", minHeight: 72, padding: 10, resize: "vertical" }}
                    placeholder="Anote uma observacao interna sobre este deal..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      className="crm-button-primary"
                      onClick={postNote}
                      disabled={!noteContent.trim() || posting}
                      style={{ opacity: !noteContent.trim() || posting ? 0.5 : 1 }}
                    >
                      {posting ? "Salvando..." : "Adicionar nota"}
                    </button>
                  </div>
                </section>

                {/* Timeline */}
                <section>
                  <h3
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-gray-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: "var(--crm-weight-medium)",
                      marginBottom: "var(--crm-space-3)",
                    }}
                  >
                    Timeline ({activities.length})
                  </h3>
                  {activities.length === 0 ? (
                    <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
                      Nenhuma atividade registrada ainda.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {activities.map((a) => {
                        const Icon = ACTIVITY_ICONS[a.type] || FileText
                        return (
                          <li key={a.id} className="flex gap-3">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center"
                              style={{
                                background: "var(--crm-gray-100)",
                                borderRadius: "var(--crm-radius-full)",
                                color: "var(--crm-gray-600)",
                              }}
                            >
                              <Icon className="h-3 w-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  style={{
                                    fontSize: "var(--crm-text-xs)",
                                    fontWeight: "var(--crm-weight-medium)",
                                    color: "var(--crm-gray-700)",
                                  }}
                                >
                                  {a.creator?.name || "Sistema"}
                                </span>
                                <span
                                  style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
                                >
                                  {new Date(a.created_at).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <p
                                className="mt-0.5"
                                style={{
                                  fontSize: "var(--crm-text-base)",
                                  color: "var(--crm-gray-800)",
                                  lineHeight: "var(--crm-leading-normal)",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {a.content}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function MetaField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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
        style={{
          fontSize: "var(--crm-text-base)",
          color: "var(--crm-gray-800)",
        }}
      >
        {value}
      </p>
    </div>
  )
}

export { swrMutate as mutateDeal }
