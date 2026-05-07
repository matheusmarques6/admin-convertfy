"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  X,
  MessageSquare,
  FileText,
  Phone,
  Mail,
  Calendar,
  Building2,
  User,
  Tag,
  ExternalLink,
  Trophy,
  XCircle,
  ChevronRight,
  Sparkles,
  StickyNote,
  CheckSquare,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: FileText,
  call: Phone,
  email: Mail,
  wa_message: MessageSquare,
  ig_message: MessageSquare,
  meeting: Calendar,
  task: CheckSquare,
  system: Sparkles,
  stage_change: ChevronRight,
}

interface DealDrawerProps {
  dealId: string | null
  onClose: () => void
  onUpdated?: () => void
}

interface DealDetailResponse {
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

type ComposerTab = "note" | "task" | "call" | "email"

const COMPOSER_TABS: Array<{ id: ComposerTab; label: string; icon: typeof StickyNote }> = [
  { id: "note", label: "Nota", icon: StickyNote },
  { id: "task", label: "Tarefa", icon: CheckSquare },
  { id: "call", label: "Ligacao", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
]

export function DealDrawer({ dealId, onClose, onUpdated }: DealDrawerProps) {
  const open = !!dealId
  const { data, isLoading, mutate } = useSWR<DealDetailResponse>(
    dealId ? `/api/crm/deals/${dealId}` : null,
    fetcher,
  )

  const [composerTab, setComposerTab] = useState<ComposerTab>("note")
  const [composerContent, setComposerContent] = useState("")
  const [composerDueIn, setComposerDueIn] = useState<string>("24")
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!open) {
      setComposerContent("")
      setComposerTab("note")
    }
  }, [open])

  const deal = data?.deal
  const activities = data?.activities || []

  const postActivity = async () => {
    if (!dealId || !composerContent.trim()) return
    setPosting(true)
    try {
      const payload: Record<string, unknown> = {
        type: composerTab,
        content: composerContent.trim(),
        is_internal: composerTab !== "email",
      }
      if (composerTab === "task" && composerDueIn) {
        const hours = parseInt(composerDueIn, 10)
        if (!Number.isNaN(hours)) {
          payload.due_at = new Date(Date.now() + hours * 3600000).toISOString()
        }
      }
      await fetch(`/api/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setComposerContent("")
      await mutate()
      onUpdated?.()
    } finally {
      setPosting(false)
    }
  }

  const isWon = deal?.status === "won"
  const isLost = deal?.status === "lost"
  const isOpen = deal?.status === "open"

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[100vw] sm:max-w-[640px] lg:max-w-[760px] flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          style={{
            background: "var(--crm-gray-0)",
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {deal?.title || "Detalhes do deal"}
          </DialogPrimitive.Title>

          {/* Header sticky */}
          <div
            className="flex items-start justify-between border-b px-6 py-4"
            style={{
              borderColor: "var(--crm-gray-200)",
              background: "var(--crm-gray-0)",
            }}
          >
            <div className="min-w-0 flex-1 pr-3">
              {isLoading ? (
                <div
                  style={{
                    fontSize: "var(--crm-text-sm)",
                    color: "var(--crm-gray-500)",
                  }}
                >
                  Carregando...
                </div>
              ) : deal ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    {deal.pipeline && (
                      <span
                        style={{
                          fontSize: 10,
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
                        <ChevronRight
                          className="h-3 w-3"
                          style={{ color: "var(--crm-gray-300)" }}
                        />
                        <StageBadge stage={deal.stage} />
                      </>
                    )}
                    <StatusPill status={deal.status} />
                  </div>
                  <h2
                    className="mt-1 truncate"
                    style={{
                      fontSize: "var(--crm-text-xl)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-900)",
                      lineHeight: 1.25,
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
                        fontWeight: "var(--crm-weight-medium)",
                      }}
                    >
                      {fmtBRL(deal.value)}
                      {deal.probability != null && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: "var(--crm-text-xs)",
                            color: "var(--crm-gray-500)",
                            fontFamily: "var(--crm-font-sans)",
                          }}
                        >
                          · {deal.probability}% prob.
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : null}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
              style={{
                borderRadius: "var(--crm-radius-md)",
                color: "var(--crm-gray-500)",
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Reason banners (won/lost) */}
          {deal && isWon && deal.won_reason && (
            <div
              className="px-6 py-2.5 flex items-center gap-2"
              style={{
                background: "var(--crm-success-bg)",
                borderBottom: "1px solid var(--crm-success-border)",
                fontSize: "var(--crm-text-sm)",
                color: "var(--crm-success-fg)",
              }}
            >
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Ganho:</strong> {deal.won_reason}
              </span>
            </div>
          )}
          {deal && isLost && deal.lost_reason && (
            <div
              className="px-6 py-2.5 flex items-center gap-2"
              style={{
                background: "var(--crm-danger-bg)",
                borderBottom: "1px solid var(--crm-danger-border)",
                fontSize: "var(--crm-text-sm)",
                color: "var(--crm-danger-fg)",
              }}
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Perdido:</strong> {deal.lost_reason}
              </span>
            </div>
          )}

          {/* Body 2-col em desktop, stack em mobile */}
          <div className="flex flex-1 flex-col-reverse md:flex-row overflow-hidden">
            {/* Timeline + composer */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Composer com tabs */}
              {deal && isOpen && (
                <div
                  className="border-b px-6 py-3"
                  style={{
                    borderColor: "var(--crm-gray-200)",
                    background: "var(--crm-gray-50)",
                  }}
                >
                  <div className="flex items-center gap-1 mb-2">
                    {COMPOSER_TABS.map((t) => {
                      const Icon = t.icon
                      const active = composerTab === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => setComposerTab(t.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            fontSize: "var(--crm-text-xs)",
                            fontWeight: "var(--crm-weight-medium)",
                            border: `1px solid ${active ? "var(--crm-gray-900)" : "var(--crm-gray-200)"}`,
                            background: active
                              ? "var(--crm-gray-900)"
                              : "var(--crm-gray-0)",
                            color: active
                              ? "var(--crm-gray-0)"
                              : "var(--crm-gray-700)",
                            borderRadius: "var(--crm-radius-sm)",
                            cursor: "pointer",
                          }}
                        >
                          <Icon className="h-3 w-3" />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                  <textarea
                    className="crm-input w-full"
                    style={{
                      height: "auto",
                      minHeight: 60,
                      padding: 10,
                      resize: "vertical",
                    }}
                    placeholder={
                      composerTab === "note"
                        ? "Anote uma observacao interna..."
                        : composerTab === "task"
                          ? "Descreva a tarefa..."
                          : composerTab === "call"
                            ? "Resumo da ligacao..."
                            : "Resumo do email enviado..."
                    }
                    value={composerContent}
                    onChange={(e) => setComposerContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        postActivity()
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {composerTab === "task" ? (
                      <select
                        className="crm-input"
                        style={{ height: "var(--crm-button-height-sm)" }}
                        value={composerDueIn}
                        onChange={(e) => setComposerDueIn(e.target.value)}
                      >
                        <option value="2">Vence em 2h</option>
                        <option value="24">Vence em 24h</option>
                        <option value="72">Vence em 3 dias</option>
                        <option value="168">Vence em 1 semana</option>
                        <option value="">Sem prazo</option>
                      </select>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--crm-gray-500)",
                        }}
                      >
                        ⌘/Ctrl+Enter pra enviar
                      </span>
                    )}
                    <button
                      className="crm-button-primary"
                      style={{
                        height: "var(--crm-button-height-sm)",
                        padding: "0 12px",
                      }}
                      onClick={postActivity}
                      disabled={!composerContent.trim() || posting}
                    >
                      {posting
                        ? "Salvando..."
                        : `Adicionar ${
                            COMPOSER_TABS.find((t) => t.id === composerTab)
                              ?.label || ""
                          }`}
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="flex-1 overflow-auto px-6 py-4">
                <h3
                  style={{
                    fontSize: 10,
                    color: "var(--crm-gray-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontWeight: "var(--crm-weight-medium)",
                    marginBottom: "var(--crm-space-3)",
                  }}
                >
                  Atividades ({activities.length})
                </h3>
                {activities.length === 0 ? (
                  <p
                    style={{
                      fontSize: "var(--crm-text-sm)",
                      color: "var(--crm-gray-500)",
                    }}
                  >
                    Nenhuma atividade registrada ainda.
                  </p>
                ) : (
                  <ol className="space-y-4 relative">
                    <div
                      style={{
                        position: "absolute",
                        left: 13,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        background: "var(--crm-gray-200)",
                      }}
                    />
                    {activities.map((a) => {
                      const Icon = ACTIVITY_ICONS[a.type] || FileText
                      const isOverdue =
                        a.due_at &&
                        !a.completed_at &&
                        new Date(a.due_at).getTime() < Date.now()
                      return (
                        <li
                          key={a.id}
                          className="flex gap-3 relative"
                          style={{ zIndex: 1 }}
                        >
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center"
                            style={{
                              background:
                                a.type === "stage_change"
                                  ? "var(--crm-info-bg)"
                                  : isOverdue
                                    ? "var(--crm-danger-bg)"
                                    : "var(--crm-gray-100)",
                              borderRadius: "var(--crm-radius-full)",
                              color: isOverdue
                                ? "var(--crm-danger-fg)"
                                : "var(--crm-gray-600)",
                              border: "2px solid var(--crm-gray-0)",
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
                                style={{
                                  fontSize: 10,
                                  color: "var(--crm-gray-500)",
                                }}
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
                            {a.due_at && (
                              <p
                                className="mt-1"
                                style={{
                                  fontSize: 10,
                                  color: isOverdue
                                    ? "var(--crm-danger-fg)"
                                    : "var(--crm-warning-fg)",
                                  fontWeight: "var(--crm-weight-medium)",
                                }}
                              >
                                {isOverdue ? "⚠ Atrasada" : "⏰ Vence"}{" "}
                                {new Date(a.due_at).toLocaleString("pt-BR")}
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>

            {/* Sidebar */}
            {deal && (
              <aside
                className="w-full md:w-[260px] md:shrink-0 overflow-auto border-b md:border-b-0 md:border-l"
                style={{
                  borderColor: "var(--crm-gray-200)",
                  background: "var(--crm-gray-50)",
                }}
              >
                <div className="px-4 py-4 space-y-4">
                  <SidebarSection title="Sobre">
                    <SidebarRow
                      icon={<User className="h-3 w-3" />}
                      label="Owner"
                    >
                      {deal.owner ? (
                        <div className="flex items-center gap-1.5">
                          {deal.owner.avatar_url ? (
                            // Avatar 16x16 — ver justificativa em deal-card.tsx.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={deal.owner.avatar_url}
                              alt={deal.owner.name}
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : null}
                          <span>{deal.owner.name}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </SidebarRow>
                    <SidebarRow
                      icon={<Building2 className="h-3 w-3" />}
                      label="Cliente"
                    >
                      {deal.client?.name || "—"}
                    </SidebarRow>
                    {deal.store && (
                      <SidebarRow
                        icon={<Building2 className="h-3 w-3" />}
                        label="Loja"
                      >
                        {deal.store.name}
                      </SidebarRow>
                    )}
                    <SidebarRow
                      icon={<Tag className="h-3 w-3" />}
                      label="Fonte"
                    >
                      {deal.source || "—"}
                    </SidebarRow>
                    <SidebarRow
                      icon={<Calendar className="h-3 w-3" />}
                      label="Criado em"
                    >
                      {new Date(deal.created_at).toLocaleDateString("pt-BR")}
                    </SidebarRow>
                    <SidebarRow
                      icon={<Calendar className="h-3 w-3" />}
                      label="Atualizado"
                    >
                      {new Date(deal.updated_at).toLocaleDateString("pt-BR")}
                    </SidebarRow>
                  </SidebarSection>

                  {deal.lead && (
                    <SidebarSection title="Lead origem">
                      <div
                        style={{
                          padding: 8,
                          background: "var(--crm-gray-0)",
                          border: "1px solid var(--crm-gray-200)",
                          borderRadius: "var(--crm-radius-md)",
                        }}
                      >
                        <div
                          className="flex items-center gap-1.5"
                          style={{
                            fontSize: "var(--crm-text-sm)",
                            fontWeight: "var(--crm-weight-medium)",
                            color: "var(--crm-gray-900)",
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {deal.lead.name}
                        </div>
                        {deal.lead.email && (
                          <div
                            className="mt-0.5"
                            style={{
                              fontSize: 10,
                              color: "var(--crm-gray-500)",
                            }}
                          >
                            {deal.lead.email}
                          </div>
                        )}
                      </div>
                    </SidebarSection>
                  )}

                  {deal.tags && deal.tags.length > 0 && (
                    <SidebarSection title="Tags">
                      <div className="flex flex-wrap gap-1">
                        {deal.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10,
                              color: "var(--crm-gray-700)",
                              background: "var(--crm-gray-100)",
                              padding: "2px 8px",
                              borderRadius: "var(--crm-radius-sm)",
                              border: "1px solid var(--crm-gray-200)",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </SidebarSection>
                  )}

                  {deal.notes && (
                    <SidebarSection title="Notas">
                      <p
                        style={{
                          fontSize: "var(--crm-text-sm)",
                          color: "var(--crm-gray-700)",
                          whiteSpace: "pre-wrap",
                          lineHeight: "var(--crm-leading-normal)",
                        }}
                      >
                        {deal.notes}
                      </p>
                    </SidebarSection>
                  )}
                </div>
              </aside>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function StageBadge({
  stage,
}: {
  stage: { name: string; stage_type: string | null }
}) {
  const colors =
    stage.stage_type === "won"
      ? {
          bg: "var(--crm-success-bg)",
          fg: "var(--crm-success-fg)",
          border: "var(--crm-success-border)",
        }
      : stage.stage_type === "lost"
        ? {
            bg: "var(--crm-danger-bg)",
            fg: "var(--crm-danger-fg)",
            border: "var(--crm-danger-border)",
          }
        : {
            bg: "var(--crm-gray-100)",
            fg: "var(--crm-gray-700)",
            border: "var(--crm-gray-200)",
          }
  return (
    <span
      style={{
        fontSize: 10,
        color: colors.fg,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        padding: "2px 8px",
        borderRadius: "var(--crm-radius-sm)",
        fontWeight: "var(--crm-weight-medium)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {stage.name}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === "won") {
    return (
      <span
        style={{
          fontSize: 10,
          color: "var(--crm-success-fg)",
          background: "var(--crm-success-bg)",
          padding: "2px 8px",
          borderRadius: "var(--crm-radius-full)",
          fontWeight: "var(--crm-weight-medium)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        <Trophy className="h-2.5 w-2.5" />
        GANHO
      </span>
    )
  }
  if (status === "lost") {
    return (
      <span
        style={{
          fontSize: 10,
          color: "var(--crm-danger-fg)",
          background: "var(--crm-danger-bg)",
          padding: "2px 8px",
          borderRadius: "var(--crm-radius-full)",
          fontWeight: "var(--crm-weight-medium)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        <XCircle className="h-2.5 w-2.5" />
        PERDIDO
      </span>
    )
  }
  return null
}

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h4
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
          marginBottom: "var(--crm-space-2)",
        }}
      >
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function SidebarRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div
        className="flex items-center gap-1.5 shrink-0"
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          width: 70,
          paddingTop: 1,
        }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="flex-1 min-w-0"
        style={{
          fontSize: "var(--crm-text-sm)",
          color: "var(--crm-gray-800)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
