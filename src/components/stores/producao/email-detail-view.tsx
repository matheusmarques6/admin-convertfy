"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code as CodeIcon,
  Copy,
  Download,
  Eye,
  FileImage,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Square,
  Tag as TagIcon,
  Trash2,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { InlineEditField } from "@/components/crm/inline-edit-field"
import type {
  BlockType,
  EmailBlock,
  EmailFlow,
  EmailFlowEmail,
  EmailQAItem,
  HeroBlockContent,
  CouponBlockContent,
  ProductsBlockContent,
  TextBlockContent,
} from "@/types/email-workspace"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface EmailDetailResponse {
  email: EmailFlowEmail & {
    blocks: EmailBlock[]
    qa_items: EmailQAItem[]
  }
}

interface EmailDetailViewProps {
  storeId: string
  flow: EmailFlow
  emailId: string
  onEmailUpdated: () => void
  onNavigate: (emailId: string) => void
  onEmailDeleted?: () => void
}

export function EmailDetailView({
  flow,
  emailId,
  onEmailUpdated,
  onNavigate,
  onEmailDeleted,
}: EmailDetailViewProps) {
  const toast = useToast()
  const { data, mutate } = useSWR<{ data?: EmailDetailResponse } & EmailDetailResponse>(
    `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
    fetcher,
  )

  const email = data?.data?.email ?? data?.email
  const blocks = email?.blocks ?? []
  const qaItems = email?.qa_items ?? []

  const [viewMode, setViewMode] = useState<"mock" | "html">("mock")
  const [activeTab, setActiveTab] = useState<"struct" | "qa">("struct")
  const [width, setWidth] = useState<number>(600)

  // Reset tab quando troca de email
  useEffect(() => {
    setActiveTab("struct")
    setViewMode("mock")
  }, [emailId])

  // Navegação prev/next entre emails do flow
  const emails = flow.emails ?? []
  const currentIdx = emails.findIndex((e) => e.id === emailId)
  const prevEmail = currentIdx > 0 ? emails[currentIdx - 1] : null
  const nextEmail =
    currentIdx >= 0 && currentIdx < emails.length - 1
      ? emails[currentIdx + 1]
      : null

  const blocksTotal = blocks.length
  const blocksApplied = blocks.filter((b) => b.applied).length
  const qaTotal = qaItems.length
  const qaDone = qaItems.filter((q) => q.done).length

  const patchEmail = async (update: Record<string, unknown>) => {
    const res = await fetch(
      `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const patchBlock = async (
    blockId: string,
    update: Record<string, unknown>,
  ) => {
    const res = await fetch(`/api/admin/email-blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const patchQA = async (itemId: string, update: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/email-qa/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const createBlock = async (blockType: BlockType) => {
    try {
      const res = await fetch(`/api/admin/email-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, block_type: blockType }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao criar bloco")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Bloco adicionado", description: `${blockType} criado` })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao criar bloco",
        description: (e as Error).message,
      })
    }
  }

  const deleteBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/admin/email-blocks/${blockId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover bloco")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Bloco removido" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: (e as Error).message,
      })
    }
  }

  const reorderBlocks = async (newOrder: EmailBlock[]) => {
    try {
      const res = await fetch(`/api/admin/email-blocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          order: newOrder.map((b) => b.id),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao reordenar")
      }
      await mutate()
      onEmailUpdated()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao reordenar",
        description: (e as Error).message,
      })
    }
  }

  const moveBlock = async (blockId: string, direction: "up" | "down") => {
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= blocks.length) return

    const newOrder = [...blocks]
    ;[newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]]
    await reorderBlocks(newOrder)
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return

    const newOrder = [...blocks]
    const [moved] = newOrder.splice(result.source.index, 1)
    newOrder.splice(result.destination.index, 0, moved)
    await reorderBlocks(newOrder)
  }

  const createQAItem = async (label: string) => {
    try {
      const res = await fetch(`/api/admin/email-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, label }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao criar item")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Item adicionado ao checklist" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao criar item",
        description: (e as Error).message,
      })
    }
  }

  const deleteQAItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/admin/email-qa/${itemId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Item removido" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover item",
        description: (e as Error).message,
      })
    }
  }

  const deleteEmail = async () => {
    try {
      const res = await fetch(
        `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover")
      }
      toast.toast({ title: "E-mail removido" })
      onEmailDeleted?.()
      onEmailUpdated()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover e-mail",
        description: (e as Error).message,
      })
    }
  }

  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState(false)

  const copyToClipboard = async (text: string, label = "Conteúdo") => {
    try {
      await navigator.clipboard.writeText(text)
      toast.toast({ title: `${label} copiado`, description: "Cole no builder" })
    } catch {
      toast.toast({
        variant: "destructive",
        title: "Falha ao copiar",
        description: "Permita acesso ao clipboard",
      })
    }
  }

  if (!email) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: "var(--crm-gray-500)" }}
      >
        Carregando email...
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <>
      {/* Email title bar (entre topbar e body) */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center rounded-[6px] shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <FileImage className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-700)",
              }}
            >
              {flow.name}
            </span>
            <ChevronRight
              className="h-3 w-3"
              style={{ color: "var(--crm-gray-300)" }}
            />
            <span
              className="crm-tnum"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                flexShrink: 0,
              }}
            >
              E-mail #{String(email.number).padStart(2, "0")} -
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                minWidth: 80,
              }}
            >
              <InlineEditField
                value={email.name}
                placeholder="Nome do e-mail"
                onSave={(v) => patchEmail({ name: v || "Sem nome" })}
              />
            </span>
            <EmailStatusBadge status={email.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mock / HTML toggle */}
          <div
            className="inline-flex items-center"
            style={{
              padding: 2,
              background: "var(--crm-gray-100)",
              borderRadius: 6,
            }}
          >
            <ModePillBtn
              icon={<LayoutGrid className="h-3 w-3" />}
              label="Mock"
              active={viewMode === "mock"}
              onClick={() => setViewMode("mock")}
            />
            <ModePillBtn
              icon={<CodeIcon className="h-3 w-3" />}
              label="HTML"
              active={viewMode === "html"}
              onClick={() => setViewMode("html")}
            />
          </div>
          {confirmDeleteEmail ? (
            <div className="inline-flex items-center gap-1">
              <button
                onClick={async () => {
                  setConfirmDeleteEmail(false)
                  await deleteEmail()
                }}
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "var(--crm-neg)",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirmar exclusão
              </button>
              <button
                onClick={() => setConfirmDeleteEmail(false)}
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "transparent",
                  color: "var(--crm-gray-600)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteEmail(true)}
              title="Excluir e-mail"
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "var(--crm-gray-500)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body: center + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Centro: preview */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--crm-gray-50)" }}
        >
          {viewMode === "mock" ? (
            <EmailMockPreview
              email={email}
              blocks={blocks}
              width={width}
              onEditSubject={(v) => patchEmail({ subject: v || null })}
              onEditPreheader={(v) => patchEmail({ preheader: v || null })}
              onEditFromName={(v) => patchEmail({ from_name: v || null })}
              onEditFromEmail={(v) => patchEmail({ from_email: v || null })}
              onEditDelay={(v) => {
                const n = v ? Number(v) : null
                return patchEmail({
                  delay_hours: n !== null && !Number.isNaN(n) ? n : null,
                })
              }}
            />
          ) : (
            <EmailHtmlView
              email={email}
              html={generateHtml(email, blocks)}
              onCopyAll={(html) => copyToClipboard(html, "HTML completo")}
            />
          )}
        </div>

        {/* Painel direito: blocos + QA */}
        <aside
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 380,
            background: "var(--crm-gray-0)",
            borderLeft: "1px solid var(--crm-border)",
          }}
        >
          {/* Tabs */}
          <div
            className="flex gap-1 shrink-0"
            style={{
              padding: "10px 16px 0",
              borderBottom: "1px solid var(--crm-gray-100)",
            }}
          >
            <TabBtn
              active={activeTab === "struct"}
              onClick={() => setActiveTab("struct")}
              count={`${blocksApplied}/${blocksTotal}`}
              label="Estrutura & Copy"
            />
            <TabBtn
              active={activeTab === "qa"}
              onClick={() => setActiveTab("qa")}
              count={`${qaDone}/${qaTotal}`}
              label="Checklist QA"
            />
          </div>

          {/* Hint banner */}
          <div
            style={{
              padding: "10px 16px",
              background: "var(--crm-blue-50)",
              borderBottom: "1px solid var(--crm-blue-100)",
              fontSize: 11,
              color: "var(--crm-brand-hover)",
              lineHeight: 1.5,
            }}
          >
            {activeTab === "struct" ? (
              <>
                Copie cada item pro builder de email, depois marque o bloco como{" "}
                <b>Aplicado</b>. Os conteúdos já estão prontos para uso — só
                montar e revisar.
              </>
            ) : (
              <>
                Revise cada item antes de enviar para aprovação do cliente.
                Marque os concluídos.
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
            {activeTab === "struct" && (
              <>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="blocks">
                    {(droppableProvided, droppableSnapshot) => (
                      <div
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                        style={{
                          background: droppableSnapshot.isDraggingOver
                            ? "var(--crm-blue-50)"
                            : "transparent",
                          borderRadius: 8,
                          transition: "background 120ms ease",
                        }}
                      >
                        {blocks.map((block, idx) => (
                          <Draggable
                            key={block.id}
                            draggableId={block.id}
                            index={idx}
                          >
                            {(draggableProvided, draggableSnapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                style={{
                                  ...draggableProvided.draggableProps.style,
                                  opacity: draggableSnapshot.isDragging ? 0.92 : 1,
                                  boxShadow: draggableSnapshot.isDragging
                                    ? "0 6px 16px rgba(0,0,0,0.10)"
                                    : undefined,
                                }}
                              >
                                <BlockCard
                                  block={block}
                                  isFirst={idx === 0}
                                  isLast={idx === blocks.length - 1}
                                  dragHandleProps={draggableProvided.dragHandleProps}
                                  onToggleApplied={(applied) =>
                                    patchBlock(block.id, { applied })
                                  }
                                  onCopy={copyToClipboard}
                                  onPatch={(update) => patchBlock(block.id, update)}
                                  onDelete={() => deleteBlock(block.id)}
                                  onMoveUp={() => moveBlock(block.id, "up")}
                                  onMoveDown={() => moveBlock(block.id, "down")}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {droppableProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                {blocks.length === 0 && (
                  <div
                    style={{
                      padding: "20px 16px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--crm-gray-500)",
                      background: "var(--crm-gray-50)",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    Nenhum bloco ainda. Adicione abaixo.
                  </div>
                )}
                <AddBlockPicker onAdd={createBlock} />
              </>
            )}
            {activeTab === "qa" && (
              <>
                {qaItems.map((item) => (
                  <QACard
                    key={item.id}
                    item={item}
                    onToggle={(done) => patchQA(item.id, { done })}
                    onEditNotes={(notes) => patchQA(item.id, { notes: notes || null })}
                    onDelete={() => deleteQAItem(item.id)}
                  />
                ))}
                {qaItems.length === 0 && (
                  <div
                    style={{
                      padding: "20px 16px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--crm-gray-500)",
                      background: "var(--crm-gray-50)",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    Nenhum item de QA ainda. Adicione abaixo.
                  </div>
                )}
                <AddQAInput onAdd={createQAItem} />
              </>
            )}
          </div>

          {/* Footer: acoes dependem do status do email */}
          <div
            className="shrink-0 flex flex-col gap-2"
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--crm-gray-100)",
              background: "var(--crm-gray-0)",
            }}
          >
            <EmailStatusActions
              status={email.status}
              canAdvance={blocksApplied >= blocksTotal && blocksTotal > 0}
              onUpdateStatus={(s) => patchEmail({ status: s })}
            />
            <span
              className="crm-tnum"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                textAlign: "center",
              }}
            >
              {blocksApplied}/{blocksTotal} blocos aplicados ·{" "}
              {qaTotal > 0
                ? `${Math.round((qaDone / qaTotal) * 100)}% do checklist QA`
                : "sem QA"}
            </span>
          </div>
        </aside>
      </div>

      {/* Bottom nav: prev / position / next + width slider */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderTop: "1px solid var(--crm-border)",
        }}
      >
        <button
          disabled={!prevEmail}
          onClick={() => prevEmail && onNavigate(prevEmail.id)}
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 12px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: prevEmail ? "var(--crm-gray-700)" : "var(--crm-gray-300)",
            fontSize: 12,
            fontWeight: 500,
            cursor: prevEmail ? "pointer" : "default",
          }}
        >
          <ChevronLeft className="h-3 w-3" />
          Anterior
        </button>
        <div className="flex items-center gap-1">
          {emails.map((e, i) => {
            const active = e.id === emailId
            const done =
              e.status === "ready" ||
              e.status === "approved" ||
              e.status === "live"
            return (
              <span
                key={e.id}
                onClick={() => onNavigate(e.id)}
                role="button"
                aria-label={`Email ${i + 1}`}
                style={{
                  width: active ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: active
                    ? "var(--crm-brand)"
                    : done
                      ? "var(--crm-pos)"
                      : "var(--crm-gray-200)",
                  cursor: "pointer",
                  transition: "width 150ms ease",
                }}
              />
            )
          })}
          <span
            className="crm-tnum"
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--crm-gray-500)",
            }}
          >
            E-mail <b style={{ color: "var(--crm-gray-900)" }}>#{currentIdx + 1}</b> de {emails.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
            }}
          >
            Largura {width}px · padrão de e-mail
          </span>
          <input
            type="range"
            min={320}
            max={800}
            step={20}
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value, 10))}
            style={{ width: 80 }}
          />
          <button
            disabled={!nextEmail}
            onClick={() => nextEmail && onNavigate(nextEmail.id)}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: nextEmail ? "var(--crm-brand)" : "var(--crm-gray-100)",
              color: nextEmail ? "var(--crm-brand-fg)" : "var(--crm-gray-400)",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: nextEmail ? "pointer" : "default",
            }}
          >
            Próximo
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Mock preview (renderização visual) ────────────────────

function EmailMockPreview({
  email,
  blocks,
  width,
  onEditSubject,
  onEditPreheader,
  onEditFromName,
  onEditFromEmail,
  onEditDelay,
}: {
  email: EmailFlowEmail
  blocks: EmailBlock[]
  width: number
  onEditSubject: (v: string) => Promise<void>
  onEditPreheader: (v: string) => Promise<void>
  onEditFromName: (v: string) => Promise<void>
  onEditFromEmail: (v: string) => Promise<void>
  onEditDelay: (v: string) => Promise<void>
}) {
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 760, margin: "0 auto" }}>
      {/* Envelope */}
      <SectionLabel>Envelope</SectionLabel>
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 20px",
          fontSize: 13,
        }}
      >
        <EnvelopeRow label="De">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.from_name}
              placeholder="Nome do remetente"
              onSave={onEditFromName}
            />
          </span>
          <span style={{ color: "var(--crm-gray-500)", marginLeft: 8 }}>
            &lt;
            <InlineEditField
              value={email.from_email}
              placeholder="email@dominio.com"
              onSave={onEditFromEmail}
            />
            &gt;
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Assunto">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.subject}
              placeholder="Assunto do email"
              onSave={onEditSubject}
            />
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Pré-cabeçalho">
          <InlineEditField
            value={email.preheader}
            placeholder="Texto curto que aparece após o assunto"
            onSave={onEditPreheader}
          />
        </EnvelopeRow>
        <EnvelopeRow label="Esperar" last>
          <span style={{ color: "var(--crm-gray-700)" }}>
            <InlineEditField
              type="number"
              value={email.delay_hours}
              placeholder="0"
              onSave={onEditDelay}
            />{" "}
            <span style={{ color: "var(--crm-gray-500)" }}>
              horas após o e-mail anterior
            </span>
          </span>
        </EnvelopeRow>
      </div>

      {/* Corpo */}
      <SectionLabel style={{ marginTop: 24 }}>Corpo do e-mail</SectionLabel>
      <div
        style={{
          width: width,
          maxWidth: "100%",
          margin: "0 auto",
          background: "#fff",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {blocks.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--crm-gray-400)",
              fontSize: 13,
            }}
          >
            Nenhum bloco no email
          </div>
        ) : (
          blocks.map((b) => <RenderedBlock key={b.id} block={b} />)
        )}
      </div>
    </div>
  )
}

function EnvelopeRow({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className="flex items-baseline gap-3"
      style={{
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--crm-gray-100)",
        fontSize: 13,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          width: 110,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Block renderers ──────────────────────────────────────

function RenderedBlock({ block }: { block: EmailBlock }) {
  switch (block.block_type) {
    case "hero":
      return <RenderHero content={block.content as HeroBlockContent} />
    case "text":
      return <RenderText content={block.content as TextBlockContent} />
    case "coupon":
      return <RenderCoupon content={block.content as CouponBlockContent} />
    case "products":
      return <RenderProducts content={block.content as ProductsBlockContent} />
    case "footer":
      return <RenderFooter content={block.content as Record<string, unknown>} />
    default:
      return (
        <div style={{ padding: 12, color: "var(--crm-gray-500)", fontSize: 11 }}>
          [{block.block_type}] {block.label}
        </div>
      )
  }
}

function RenderHero({ content }: { content: HeroBlockContent }) {
  return (
    <div style={{ background: "#fff" }}>
      {content.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.image_url}
          alt={content.image_alt ?? content.headline ?? ""}
          style={{ width: "100%", display: "block" }}
        />
      ) : (
        <div
          style={{
            background: "var(--crm-brand)",
            height: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          <ImageIcon className="h-12 w-12 opacity-40" />
        </div>
      )}
      <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
        {content.eyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#0F0F0F",
              letterSpacing: "0.22em",
              marginBottom: 10,
            }}
          >
            {content.eyebrow}
          </div>
        )}
        {content.headline && (
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
              color: "#0F0F0F",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              textTransform: "uppercase",
            }}
          >
            {content.headline}
          </h1>
        )}
        {content.body && (
          <p
            style={{
              margin: "16px auto 0",
              maxWidth: 440,
              fontSize: 14,
              color: "#2A2A2A",
              lineHeight: 1.65,
            }}
          >
            {content.body}
          </p>
        )}
        {content.cta_text && (
          <a
            href={content.cta_url ?? "#"}
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "15px 32px",
              background: "var(--crm-brand)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.06em",
              textDecoration: "none",
              borderRadius: 999,
            }}
          >
            {content.cta_text}
          </a>
        )}
      </div>
    </div>
  )
}

function RenderText({ content }: { content: TextBlockContent }) {
  return (
    <div
      style={{
        padding: "40px 56px",
        textAlign: "center",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      {content.headline && (
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.headline}
        </h2>
      )}
      {content.body && (
        <p
          style={{
            margin: "20px auto 0",
            maxWidth: 440,
            fontSize: 14,
            color: "#2A2A2A",
            lineHeight: 1.65,
          }}
        >
          {content.body}
        </p>
      )}
    </div>
  )
}

function RenderCoupon({ content }: { content: CouponBlockContent }) {
  return (
    <div
      style={{
        padding: "32px 56px",
        textAlign: "center",
        background: "#FAFAFA",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#666",
          letterSpacing: "0.22em",
          marginBottom: 8,
        }}
      >
        CUPOM
      </div>
      <div
        style={{
          display: "inline-block",
          padding: "12px 24px",
          background: "#0F0F0F",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "0.06em",
          borderRadius: 4,
          border: "1.5px dashed #999",
        }}
      >
        {content.code || "SEU_CUPOM"}
      </div>
      {content.hint && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#666",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {content.hint}
        </div>
      )}
      {content.cta_text && (
        <a
          href={content.cta_url ?? "#"}
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "13px 28px",
            background: "var(--crm-brand)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.06em",
            textDecoration: "none",
            borderRadius: 999,
          }}
        >
          {content.cta_text}
        </a>
      )}
    </div>
  )
}

function RenderProducts({ content }: { content: ProductsBlockContent }) {
  const products = content.products ?? []
  return (
    <div style={{ padding: "40px 32px", borderTop: "1px solid #F0F0F0" }}>
      {content.title && (
        <h3
          style={{
            margin: "0 0 24px",
            textAlign: "center",
            fontSize: 22,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.title}
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
        }}
      >
        {products.map((p, i) => (
          <div key={i}>
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image_url}
                alt={p.name}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 6,
                  background: "#F0F0F0",
                }}
              />
            ) : (
              <div
                style={{
                  aspectRatio: "1 / 1",
                  background: "#F0F0F0",
                  borderRadius: 6,
                }}
              />
            )}
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 600,
                color: "#0F0F0F",
                textAlign: "center",
              }}
            >
              {p.name}
            </div>
            <div
              style={{
                marginTop: 4,
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--crm-brand)",
              }}
            >
              {typeof p.price === "number"
                ? p.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : p.price}
            </div>
            <a
              href={p.url ?? "#"}
              style={{
                display: "block",
                marginTop: 8,
                padding: "8px 0",
                textAlign: "center",
                background: "#0F0F0F",
                color: "#fff",
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: "0.1em",
                textDecoration: "none",
                borderRadius: 999,
              }}
            >
              {p.cta_text || "BUY NOW"}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderFooter({ content }: { content: Record<string, unknown> }) {
  const columns = (content.columns as Array<{
    title?: string
    links?: Array<{ label: string; url: string }>
  }>) ?? []
  const copyright = (content.copyright as string) ?? ""
  return (
    <div
      style={{
        padding: "32px 24px 24px",
        background: "#0F0F0F",
        color: "#fff",
        textAlign: "center",
      }}
    >
      {columns.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {columns.flatMap((col) =>
            (col.links ?? []).map((l, i) => (
              <a
                key={`${l.label}-${i}`}
                href={l.url}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {l.label}
              </a>
            )),
          )}
        </div>
      )}
      {copyright && (
        <div
          style={{
            fontSize: 11,
            color: "#999",
            letterSpacing: "0.04em",
          }}
        >
          {copyright}
        </div>
      )}
    </div>
  )
}

// ─── HTML view ────────────────────────────────────────────

function EmailHtmlView({
  email,
  html,
  onCopyAll,
}: {
  email: EmailFlowEmail
  html: string
  onCopyAll: (html: string) => void
}) {
  const lines = html.split("\n")
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          background: "#0F0F0F",
          color: "#fff",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 11,
          }}
        >
          <div
            className="flex items-center gap-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            welcome-email-{String(email.number).padStart(2, "0")}.html
            <span style={{ marginLeft: 8 }}>· {lines.length} linhas</span>
          </div>
          <div className="flex gap-2">
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
              onClick={() => {
                const blob = new Blob([html], { type: "text/html" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `welcome-email-${String(email.number).padStart(2, "0")}.html`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-3 w-3" />
              Baixar .html
            </button>
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "#fff",
                color: "#0F0F0F",
                border: 0,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => onCopyAll(html)}
            >
              <Copy className="h-3 w-3" />
              Copiar tudo
            </button>
          </div>
        </div>
        <pre
          style={{
            margin: 0,
            padding: "16px 0",
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: "var(--crm-font-mono, 'Geist Mono', monospace)",
            overflowX: "auto",
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "0 16px",
                background: "transparent",
              }}
            >
              <span
                className="crm-tnum shrink-0"
                style={{
                  width: 40,
                  textAlign: "right",
                  marginRight: 16,
                  color: "rgba(255,255,255,0.30)",
                }}
              >
                {i + 1}
              </span>
              <code
                style={{
                  flex: 1,
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "pre",
                }}
              >
                {line || " "}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

// Gera o HTML do email a partir dos blocks. Versão simples server-friendly.
function generateHtml(email: EmailFlowEmail, blocks: EmailBlock[]): string {
  // Se ja tem HTML salvo (do builder externo), retorna esse
  if (email.html) return email.html

  // Helper pra escape de strings em HTML
  const esc = (s: string | undefined | null) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  // Gera HTML real a partir dos blocks. Email-safe (tables + inline styles).
  const renderBlock = (block: EmailBlock): string => {
    const c = block.content as Record<string, unknown>
    switch (block.block_type) {
      case "hero": {
        const h = c as HeroBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td class="hero"><img src="${esc(h.image_url) || "{{hero_image_url}}"}" alt="${esc(h.image_alt ?? h.headline ?? "")}" width="600" style="display:block;width:100%;height:auto;border:0;"/></td></tr>
      <tr><td style="padding:32px 36px 16px; text-align:center;">
        ${h.eyebrow ? `<p style="margin:0; font:700 11px/1 'Inter'; letter-spacing:.22em;">${esc(h.eyebrow)}</p>` : ""}
        ${h.headline ? `<h1 class="display" style="margin:10px 0 0;">${esc(h.headline)}</h1>` : ""}
      </td></tr>
      ${h.body ? `<tr><td style="padding:14px 56px 28px; text-align:center;"><p style="margin:0; font-size:14px; line-height:1.65;">${esc(h.body)}</p></td></tr>` : ""}
      ${h.cta_text ? `<tr><td style="padding:0 36px 36px; text-align:center;"><a href="${esc(h.cta_url) || "{{cta_url}}"}" class="cta">${esc(h.cta_text)}</a></td></tr>` : ""}`
      }
      case "text": {
        const t = c as TextBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 56px; text-align:center; border-top:1px solid #F0F0F0;">
        ${t.headline ? `<h2 style="margin:0; font:900 32px/1 'Inter'; letter-spacing:-.02em; text-transform:uppercase;">${esc(t.headline)}</h2>` : ""}
        ${t.body ? `<p style="margin:20px auto 0; max-width:440px; font-size:14px; line-height:1.65;">${esc(t.body)}</p>` : ""}
      </td></tr>`
      }
      case "coupon": {
        const co = c as CouponBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 56px; text-align:center; background:#FAFAFA; border-top:1px solid #F0F0F0;">
        <p style="margin:0 0 8px; font:700 10px/1 'Inter'; letter-spacing:.22em; color:#666;">CUPOM</p>
        <span class="coupon"><span class="code">${esc(co.code) || "{{coupon_code}}"}</span></span>
        ${co.hint ? `<p style="margin:12px 0 0; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#666;">${esc(co.hint)}</p>` : ""}
        ${co.cta_text ? `<a href="${esc(co.cta_url) || "{{cta_url}}"}" class="cta" style="margin-top:16px;">${esc(co.cta_text)}</a>` : ""}
      </td></tr>`
      }
      case "products": {
        const p = c as ProductsBlockContent
        const products = p.products ?? []
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 32px; border-top:1px solid #F0F0F0;">
        ${p.title ? `<h3 style="margin:0 0 24px; text-align:center; font:900 22px/1 'Inter'; text-transform:uppercase; letter-spacing:-.02em;">${esc(p.title)}</h3>` : ""}
        <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tr>
        ${products
          .map(
            (prod) => `<td style="width:25%; padding:0 6px; text-align:center; vertical-align:top;">
          <img src="${esc(prod.image_url) || "{{product_image}}"}" alt="${esc(prod.name)}" width="120" style="display:block;width:100%;height:auto;border-radius:6px;background:#F0F0F0;"/>
          <p style="margin:10px 0 4px; font:600 12px/1.2 'Inter';">${esc(prod.name)}</p>
          <p style="margin:0; font:700 13px/1 'Inter'; color:#4E62D8;">${esc(String(prod.price))}</p>
          <a href="${esc(prod.url) || "{{product_url}}"}" class="cta" style="margin-top:8px; font-size:10px; padding:8px 14px;">${esc(prod.cta_text || "BUY NOW")}</a>
        </td>`,
          )
          .join("\n        ")}
        </tr></table>
      </td></tr>`
      }
      case "footer": {
        const f = c as Record<string, unknown>
        const cols = (f.columns as Array<{ links?: Array<{ label: string; url: string }> }>) ?? []
        const links = cols.flatMap((col) => col.links ?? [])
        const copyright = (f.copyright as string) ?? ""
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 24px 24px; background:#0F0F0F; color:#fff; text-align:center;">
        ${
          links.length > 0
            ? `<p style="margin:0 0 20px;">${links.map((l) => `<a href="${esc(l.url)}" style="color:#fff; text-decoration:none; font:700 11px/1 'Inter'; letter-spacing:.1em; text-transform:uppercase; margin:0 12px;">${esc(l.label)}</a>`).join(" ")}</p>`
            : ""
        }
        ${copyright ? `<p style="margin:0; font-size:11px; color:#999; letter-spacing:.04em;">${esc(copyright)}</p>` : ""}
      </td></tr>`
      }
      case "image": {
        const i = c as { image_url?: string; image_alt?: string; link_url?: string }
        const img = `<img src="${esc(i.image_url) || "{{image_url}}"}" alt="${esc(i.image_alt ?? "")}" width="600" style="display:block;width:100%;height:auto;border:0;"/>`
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td>${i.link_url ? `<a href="${esc(i.link_url)}">${img}</a>` : img}</td></tr>`
      }
      case "cta": {
        const ct = c as { text?: string; url?: string }
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; text-align:center;"><a href="${esc(ct.url) || "{{cta_url}}"}" class="cta">${esc(ct.text) || "CONTINUAR"}</a></td></tr>`
      }
      case "divider":
        return `      <!-- DIVIDER -->
      <tr><td style="padding:0 36px;"><div style="height:1px;background:#F0F0F0;"></div></td></tr>`
      case "spacer":
        return `      <!-- SPACER -->
      <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>`
      default:
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->`
    }
  }

  const body = blocks.map(renderBlock).join("\n")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(email.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #F8F8F8; font-family: 'Inter', Arial, sans-serif; color: #2A2A2A; }
    .wrap { width: 600px; max-width: 100%; margin: 0 auto; background: #FFFFFF; }
    .hero { background: #4E62D8; }
    .cta { display: inline-block; padding: 15px 32px; background: #4E62D8; color: #FFFFFF;
      font: 700 13px/1 'Inter'; letter-spacing: 0.06em; text-decoration: none; border-radius: 999px; }
    .display { font: 900 32px/1 'Inter'; color: #0F0F0F; text-transform: uppercase; letter-spacing: -0.02em; }
    .coupon { display: inline-flex; border: 1.5px dashed #2A2A2A; border-radius: 4px; overflow: hidden; }
    .coupon .code { background: #0F0F0F; color: #FFFFFF; padding: 14px 20px;
      font: 800 14px/1 'Inter'; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <table class="wrap" cellpadding="0" cellspacing="0" role="presentation">
${body}
  </table>
</body>
</html>`
}

// ─── Block card (painel direito) ──────────────────────────

const BLOCK_TYPE_ICON: Record<string, typeof FileImage> = {
  hero: FileImage,
  text: TagIcon,
  coupon: TagIcon,
  products: LayoutGrid,
  footer: Square,
  image: FileImage,
  cta: ChevronRight,
  divider: Square,
  spacer: Square,
  social: Square,
}

function BlockCard({
  block,
  isFirst,
  isLast,
  dragHandleProps,
  onToggleApplied,
  onCopy,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: EmailBlock
  isFirst: boolean
  isLast: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null | undefined
  onToggleApplied: (applied: boolean) => Promise<void>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
  onMoveUp: () => Promise<void>
  onMoveDown: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(block.applied === false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const Icon = BLOCK_TYPE_ICON[block.block_type] ?? FileImage
  const content = block.content as Record<string, unknown>

  return (
    <div
      style={{
        marginBottom: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "10px 14px", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              onClick={(e) => e.stopPropagation()}
              title="Arraste pra reordenar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                color: "var(--crm-gray-300)",
                cursor: "grab",
                flexShrink: 0,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--crm-gray-500)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--crm-gray-300)")
              }
            >
              <GripVertical className="h-3 w-3" />
            </span>
          )}
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 700,
              width: 12,
              textAlign: "center",
            }}
          >
            {block.position}
          </span>
          <span
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
              flexShrink: 0,
            }}
          >
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              {block.label}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                marginTop: 1,
                maxWidth: 220,
              }}
            >
              {summarizeBlockContent(block)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AppliedBadge
            applied={block.applied}
            onToggle={(v) => onToggleApplied(v)}
          />
          <ChevronRight
            className="h-3 w-3 transition-transform"
            style={{
              color: "var(--crm-gray-400)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--crm-gray-100)",
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ paddingTop: 8 }}>
            <div className="flex items-center gap-1">
              <IconBtn
                title="Mover para cima"
                onClick={onMoveUp}
                disabled={isFirst}
              >
                <ChevronUp className="h-3 w-3" />
              </IconBtn>
              <IconBtn
                title="Mover para baixo"
                onClick={onMoveDown}
                disabled={isLast}
              >
                <ChevronDown className="h-3 w-3" />
              </IconBtn>
              {confirmDelete ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={async () => {
                      setConfirmDelete(false)
                      await onDelete()
                    }}
                    style={{
                      height: 24,
                      padding: "0 8px",
                      background: "var(--crm-neg)",
                      color: "#fff",
                      border: 0,
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Confirmar remoção
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      height: 24,
                      padding: "0 8px",
                      background: "transparent",
                      color: "var(--crm-gray-600)",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <IconBtn
                  title="Remover bloco"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              )}
            </div>
            <button
              onClick={() => onCopy(JSON.stringify(block.content, null, 2), "Bloco")}
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 24,
                padding: "0 8px",
                background: "transparent",
                color: "var(--crm-gray-600)",
                border: "1px solid var(--crm-border)",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Copy className="h-3 w-3" />
              copiar bloco completo
            </button>
          </div>
          <BlockContentEditor
            block={block}
            content={content}
            onCopy={onCopy}
            onPatch={onPatch}
          />
        </div>
      )}
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: disabled ? "var(--crm-gray-300)" : "var(--crm-gray-600)",
        border: "1px solid var(--crm-border)",
        borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function summarizeBlockContent(block: EmailBlock): string {
  const c = block.content as Record<string, unknown>
  if (block.block_type === "hero")
    return (c.headline as string) ?? ""
  if (block.block_type === "text")
    return (c.headline as string) ?? (c.body as string) ?? ""
  if (block.block_type === "coupon")
    return `Cupom ${c.code ?? ""}`.trim()
  if (block.block_type === "products") {
    const products = (c.products as Array<{ name: string }>) ?? []
    return (c.title as string) ?? `${products.length} produtos`
  }
  if (block.block_type === "footer") {
    const cols = (c.columns as Array<{ links?: unknown[] }>) ?? []
    const totalLinks = cols.reduce(
      (s, col) => s + (col.links?.length ?? 0),
      0,
    )
    return `${totalLinks} links de navegação`
  }
  return block.label
}

function AppliedBadge({
  applied,
  onToggle,
}: {
  applied: boolean
  onToggle: (v: boolean) => Promise<void>
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!applied)
      }}
      style={{
        height: 22,
        padding: "0 8px",
        borderRadius: 4,
        background: applied ? "var(--crm-pos-bg)" : "var(--crm-gray-0)",
        border: applied
          ? "1px solid var(--crm-pos-border)"
          : "1px solid var(--crm-border)",
        color: applied ? "var(--crm-pos)" : "var(--crm-gray-600)",
        fontSize: 10,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {applied && <Check className="h-2.5 w-2.5" />}
      {applied ? "Aplicado" : "Marcar"}
    </button>
  )
}

// ─── Block content editor (fields editáveis inline) ──────

function BlockContentEditor({
  block,
  content,
  onCopy,
  onPatch,
}: {
  block: EmailBlock
  content: Record<string, unknown>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
}) {
  const updateContent = async (key: string, value: unknown) => {
    await onPatch({ content: { ...content, [key]: value } })
  }

  // Renderiza campos específicos pelo block_type
  if (block.block_type === "hero") {
    const c = content as HeroBlockContent
    return (
      <>
        {c.image_url !== undefined && (
          <FieldImage
            label="Imagem"
            url={c.image_url || null}
            alt={c.image_alt}
            onChange={(url) => updateContent("image_url", url)}
          />
        )}
        <FieldText
          label="Eyebrow"
          value={c.eyebrow ?? ""}
          onSave={(v) => updateContent("eyebrow", v)}
          onCopy={() => onCopy(c.eyebrow ?? "", "Eyebrow")}
        />
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
          big
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
      </>
    )
  }

  if (block.block_type === "text") {
    const c = content as TextBlockContent
    return (
      <>
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
      </>
    )
  }

  if (block.block_type === "coupon") {
    const c = content as CouponBlockContent
    return (
      <>
        <FieldLabel>VISUALIZAÇÃO DO CUPOM</FieldLabel>
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 12,
            border: "1.5px dashed #2A2A2A",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--crm-gray-700)",
              letterSpacing: "0.06em",
            }}
          >
            CUPOM:
          </div>
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#0F0F0F",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            {c.code || "SEU_CUPOM"}
          </div>
        </div>
        <FieldText
          label="Código (clipboard)"
          value={c.code ?? ""}
          onSave={(v) => updateContent("code", v.toUpperCase())}
          onCopy={() => onCopy(c.code ?? "", "Cupom")}
          mono
        />
        <FieldText
          label="Hint / Urgência"
          value={c.hint ?? ""}
          onSave={(v) => updateContent("hint", v)}
          onCopy={() => onCopy(c.hint ?? "", "Hint")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
      </>
    )
  }

  if (block.block_type === "products") {
    const c = content as ProductsBlockContent
    const products = c.products ?? []
    const updateProduct = (i: number, patch: Record<string, unknown>) => {
      const next = [...products]
      next[i] = { ...next[i], ...patch }
      return updateContent("products", next)
    }
    const removeProduct = (i: number) => {
      const next = [...products]
      next.splice(i, 1)
      return updateContent("products", next)
    }
    const addProduct = () => {
      return updateContent("products", [
        ...products,
        { name: "Novo produto", price: "0,00", image_url: "", cta_text: "BUY NOW" },
      ])
    }
    return (
      <>
        <FieldText
          label="Título da seção"
          value={c.title ?? ""}
          onSave={(v) => updateContent("title", v)}
          onCopy={() => onCopy(c.title ?? "", "Título")}
        />
        <FieldLabel>Produtos ({products.length})</FieldLabel>
        <div className="flex flex-col gap-2">
          {products.map((p, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span
                  className="crm-tnum"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--crm-gray-500)",
                  }}
                >
                  #{i + 1}
                </span>
                <button
                  onClick={() => removeProduct(i)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--crm-neg)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                  aria-label="Remover produto"
                >
                  Remover
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2" style={{ fontSize: 12 }}>
                <div>
                  <FieldLabel>Nome</FieldLabel>
                  <InlineEditField
                    value={p.name}
                    placeholder="Nome do produto"
                    onSave={(v) => updateProduct(i, { name: v })}
                    rootStyle={{ width: "100%" }}
                  />
                </div>
                <div>
                  <FieldLabel>Preço</FieldLabel>
                  <InlineEditField
                    value={String(p.price ?? "")}
                    placeholder="0,00"
                    onSave={(v) => updateProduct(i, { price: v })}
                    rootStyle={{ width: "100%" }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <FieldLabel>URL da imagem</FieldLabel>
                <InlineEditField
                  value={p.image_url}
                  placeholder="https://..."
                  onSave={(v) => updateProduct(i, { image_url: v })}
                  rootStyle={{ width: "100%" }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <FieldLabel>Texto do botão</FieldLabel>
                <InlineEditField
                  value={p.cta_text ?? "BUY NOW"}
                  placeholder="BUY NOW"
                  onSave={(v) => updateProduct(i, { cta_text: v.toUpperCase() })}
                  rootStyle={{ width: "100%" }}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addProduct}
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px dashed var(--crm-gray-300)",
              borderRadius: 6,
              color: "var(--crm-gray-600)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Adicionar produto
          </button>
        </div>
      </>
    )
  }

  if (block.block_type === "footer") {
    const c = content as { columns?: Array<{ links?: Array<{ label: string; url: string }> }>; copyright?: string }
    const links = c.columns?.[0]?.links ?? []
    const updateLink = (i: number, patch: { label?: string; url?: string }) => {
      const next = [...links]
      next[i] = { ...next[i], ...patch }
      return updateContent("columns", [{ links: next }])
    }
    const removeLink = (i: number) => {
      const next = [...links]
      next.splice(i, 1)
      return updateContent("columns", [{ links: next }])
    }
    const addLink = () => {
      return updateContent("columns", [
        { links: [...links, { label: "NOVO LINK", url: "#" }] },
      ])
    }
    return (
      <>
        <FieldLabel>Links de navegação ({links.length})</FieldLabel>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{
                padding: "6px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
              }}
            >
              <div className="flex-1 min-w-0">
                <InlineEditField
                  value={l.label}
                  placeholder="LABEL"
                  onSave={(v) => updateLink(i, { label: v.toUpperCase() })}
                  rootStyle={{ width: "100%" }}
                  displayStyle={{ fontSize: 12, fontWeight: 600 }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <InlineEditField
                  value={l.url}
                  placeholder="https://..."
                  onSave={(v) => updateLink(i, { url: v })}
                  rootStyle={{ width: "100%" }}
                  displayStyle={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    fontFamily: "var(--crm-font-mono, monospace)",
                  }}
                />
              </div>
              <button
                onClick={() => removeLink(i)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--crm-neg)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                }}
                aria-label="Remover link"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addLink}
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px dashed var(--crm-gray-300)",
              borderRadius: 6,
              color: "var(--crm-gray-600)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Adicionar link
          </button>
        </div>
        <FieldText
          label="Copyright"
          value={c.copyright ?? ""}
          onSave={(v) => updateContent("copyright", v)}
          onCopy={() => onCopy(c.copyright ?? "", "Copyright")}
        />
      </>
    )
  }

  if (block.block_type === "image") {
    const c = content as { image_url?: string; image_alt?: string; link_url?: string }
    return (
      <>
        <FieldImage
          label="Imagem"
          url={c.image_url ?? null}
          alt={c.image_alt}
          onChange={(url) => updateContent("image_url", url)}
        />
        <FieldText
          label="Alt text"
          value={c.image_alt ?? ""}
          onSave={(v) => updateContent("image_alt", v)}
        />
        <FieldText
          label="Link ao clicar (opcional)"
          value={c.link_url ?? ""}
          onSave={(v) => updateContent("link_url", v)}
        />
      </>
    )
  }

  if (block.block_type === "cta") {
    const c = content as { text?: string; url?: string; style?: string }
    return (
      <>
        <FieldButton
          label="Texto do botão"
          value={c.text ?? ""}
          onSave={(v) => updateContent("text", v.toUpperCase())}
          onCopy={() => onCopy(c.text ?? "", "CTA")}
        />
        <FieldText
          label="URL"
          value={c.url ?? ""}
          onSave={(v) => updateContent("url", v)}
        />
      </>
    )
  }

  // Tipos sem editor visual ainda (divider, spacer, social) — só JSON
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--crm-gray-500)",
        padding: "8px 0",
      }}
    >
      Bloco do tipo <b>{block.block_type}</b> — sem campos editáveis (visual fixo).
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function FieldText({
  label,
  value,
  onSave,
  onCopy,
  big,
  mono,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
  big?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: big ? 14 : 12.5,
          fontWeight: big ? 700 : 500,
          color: "var(--crm-gray-900)",
          fontVariantNumeric: mono ? "tabular-nums lining-nums" : undefined,
          fontFamily: mono
            ? "var(--crm-font-mono, 'Geist Mono', monospace)"
            : undefined,
        }}
      >
        <InlineEditField
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: big ? 14 : 12.5,
            fontWeight: big ? 700 : 500,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
          }}
        />
      </div>
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 12px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: 12.5,
          color: "var(--crm-gray-800)",
          lineHeight: 1.5,
        }}
      >
        <InlineEditField
          type="textarea"
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rows={4}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12.5,
            color: value ? "var(--crm-gray-800)" : "var(--crm-gray-400)",
            display: "block",
            width: "100%",
            whiteSpace: "pre-wrap",
          }}
        />
      </div>
    </div>
  )
}

function FieldButton({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "12px 16px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-gray-900)",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "var(--crm-gray-900)",
          textAlign: "center",
          letterSpacing: "0.06em",
        }}
      >
        <InlineEditField
          value={value}
          placeholder="TEXTO DO BOTÃO"
          onSave={(v) => onSave(v.toUpperCase())}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12,
            fontWeight: 700,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
            letterSpacing: "0.06em",
          }}
        />
      </div>
    </div>
  )
}

function FieldImage({
  label,
  url,
  alt,
  onChange,
}: {
  label: string
  url: string | null
  alt?: string
  onChange: (url: string) => Promise<void>
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
      </div>
      <div
        className="flex items-center gap-3"
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "var(--crm-gray-200)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--crm-gray-500)",
          }}
        >
          <ImageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--crm-gray-900)",
            }}
          >
            {alt ?? "Imagem do bloco"}
          </div>
          <div
            className="truncate"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontFamily: "var(--crm-font-mono, monospace)",
            }}
          >
            {url || "Sem URL definida"}
          </div>
        </div>
        <button
          onClick={() => {
            const next = window.prompt(
              "URL da imagem (ex: https://...)",
              url ?? "",
            )
            if (next != null) onChange(next)
          }}
          className="cf-focusable inline-flex items-center gap-1"
          style={{
            height: 28,
            padding: "0 10px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: "var(--crm-gray-700)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Eye className="h-3 w-3" />
          Trocar
        </button>
      </div>
    </div>
  )
}

// ─── QA card ──────────────────────────────────────────────

function QACard({
  item,
  onToggle,
  onEditNotes,
  onDelete,
}: {
  item: EmailQAItem
  onToggle: (done: boolean) => Promise<void>
  onEditNotes: (notes: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div
      className="flex items-start gap-2.5 group"
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        marginBottom: 8,
        position: "relative",
      }}
    >
      <button
        onClick={() => onToggle(!item.done)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: item.done ? "var(--crm-pos)" : "transparent",
          border: `1.5px solid ${item.done ? "var(--crm-pos)" : "var(--crm-gray-300)"}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {item.done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: item.done ? "var(--crm-gray-500)" : "var(--crm-gray-900)",
              textDecoration: item.done ? "line-through" : "none",
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            {item.label}
          </div>
          {confirmDelete ? (
            <div className="inline-flex items-center gap-1 shrink-0">
              <button
                onClick={async () => {
                  setConfirmDelete(false)
                  await onDelete()
                }}
                title="Confirmar"
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--crm-neg)",
                  color: "#fff",
                  border: 0,
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                title="Cancelar"
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  color: "var(--crm-gray-500)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Remover item"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "var(--crm-gray-400)",
                border: "1px solid var(--crm-border)",
                borderRadius: 4,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {item.category && (
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              padding: "1px 6px",
              borderRadius: 3,
              background: "var(--crm-gray-100)",
              color: "var(--crm-gray-600)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.category}
          </span>
        )}
        <div style={{ marginTop: 6, fontSize: 11 }}>
          <InlineEditField
            type="textarea"
            value={item.notes}
            placeholder="+ adicionar nota"
            onSave={onEditNotes}
            rows={2}
            rootStyle={{ width: "100%" }}
            displayStyle={{
              fontSize: 11,
              color: item.notes ? "var(--crm-gray-600)" : "var(--crm-gray-400)",
              whiteSpace: "pre-wrap",
              display: "block",
              width: "100%",
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function ModePillBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        height: 26,
        padding: "0 10px",
        background: active ? "var(--crm-gray-0)" : "transparent",
        color: active ? "var(--crm-gray-900)" : "var(--crm-gray-600)",
        border: 0,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2"
      style={{
        padding: "10px 4px",
        background: "transparent",
        color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
        border: 0,
        borderBottom: active ? "2px solid var(--crm-brand)" : "2px solid transparent",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {label}
      <span
        className="crm-tnum"
        style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 999,
          background: active ? "var(--crm-blue-50)" : "var(--crm-gray-100)",
          color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function EmailStatusBadge({ status }: { status: EmailFlowEmail["status"] }) {
  const map: Record<
    EmailFlowEmail["status"],
    { bg: string; fg: string; label: string }
  > = {
    draft: {
      bg: "var(--crm-gray-100)",
      fg: "var(--crm-gray-600)",
      label: "Rascunho",
    },
    in_progress: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Em progresso",
    },
    ready: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      label: "Pronto pra revisão",
    },
    approved: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Aprovado",
    },
    live: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Ao vivo",
    },
  }
  const v = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 4,
        background: v.bg,
        color: v.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: v.fg,
        }}
      />
      {v.label}
    </span>
  )
}

// ─── EmailStatusActions ───────────────────────────────────

function EmailStatusActions({
  status,
  canAdvance,
  onUpdateStatus,
}: {
  status: EmailFlowEmail["status"]
  canAdvance: boolean
  onUpdateStatus: (s: EmailFlowEmail["status"]) => Promise<void>
}) {
  // Estados por status atual (left = recuar/salvar, right = avancar)
  if (status === "draft" || status === "in_progress") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<Download className="h-3 w-3" />}
        >
          Salvar rascunho
        </SecondaryBtn>
        <PrimaryBtn
          disabled={!canAdvance}
          onClick={() => onUpdateStatus("ready")}
          icon={<ChevronRight className="h-3 w-3" />}
          iconRight
        >
          Enviar pra aprovação
        </PrimaryBtn>
      </div>
    )
  }
  if (status === "ready") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<ChevronLeft className="h-3 w-3" />}
        >
          Voltar pra rascunho
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => onUpdateStatus("approved")}
          icon={<Check className="h-3 w-3" />}
        >
          Aprovar
        </PrimaryBtn>
      </div>
    )
  }
  if (status === "approved") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<ChevronLeft className="h-3 w-3" />}
        >
          Reabrir
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => onUpdateStatus("live")}
          icon={<ChevronRight className="h-3 w-3" />}
          iconRight
        >
          Marcar como ao vivo
        </PrimaryBtn>
      </div>
    )
  }
  // status === "live"
  return (
    <div className="flex gap-2">
      <SecondaryBtn
        onClick={() => onUpdateStatus("draft")}
        icon={<ChevronLeft className="h-3 w-3" />}
      >
        Reabrir e revisar
      </SecondaryBtn>
      <div
        className="flex-1 inline-flex items-center justify-center"
        style={{
          height: 32,
          borderRadius: 6,
          background: "var(--crm-pos-bg)",
          color: "var(--crm-pos)",
          fontSize: 12,
          fontWeight: 600,
          gap: 6,
        }}
      >
        <Check className="h-3 w-3" />
        Ao vivo
      </div>
    </div>
  )
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  icon,
  iconRight,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  icon?: React.ReactNode
  iconRight?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="cf-focusable flex-1"
      style={{
        height: 32,
        background: disabled ? "var(--crm-gray-100)" : "var(--crm-brand)",
        color: disabled ? "var(--crm-gray-400)" : "var(--crm-brand-fg)",
        border: 0,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {!iconRight && icon}
      {children}
      {iconRight && icon}
    </button>
  )
}

function SecondaryBtn({
  children,
  onClick,
  icon,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="cf-focusable flex-1"
      style={{
        height: 32,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
        color: "var(--crm-gray-700)",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── AddBlockPicker / AddQAInput ──────────────────────────

const BLOCK_TYPE_OPTIONS: Array<{ value: BlockType; label: string }> = [
  { value: "hero", label: "Hero" },
  { value: "text", label: "Texto" },
  { value: "coupon", label: "Cupom" },
  { value: "products", label: "Produtos" },
  { value: "image", label: "Imagem" },
  { value: "cta", label: "Botão (CTA)" },
  { value: "footer", label: "Rodapé" },
  { value: "divider", label: "Divisor" },
  { value: "spacer", label: "Espaçador" },
  { value: "social", label: "Redes sociais" },
]

function AddBlockPicker({
  onAdd,
}: {
  onAdd: (blockType: BlockType) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cf-focusable"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-border)",
          borderRadius: 8,
          color: "var(--crm-gray-600)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar bloco
      </button>
    )
  }

  return (
    <div
      style={{
        padding: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-brand)",
        borderRadius: 8,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 8 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Escolha o tipo
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-500)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {BLOCK_TYPE_OPTIONS.map((opt) => {
          const Icon = BLOCK_TYPE_ICON[opt.value] ?? FileImage
          return (
            <button
              key={opt.value}
              onClick={async () => {
                setOpen(false)
                await onAdd(opt.value)
              }}
              style={{
                padding: "8px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                color: "var(--crm-gray-800)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: "var(--crm-blue-50)",
                  color: "var(--crm-brand)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon className="h-3 w-3" />
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddQAInput({
  onAdd,
}: {
  onAdd: (label: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const v = value.trim()
    if (!v) return
    setSubmitting(true)
    try {
      await onAdd(v)
      setValue("")
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cf-focusable"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-border)",
          borderRadius: 8,
          color: "var(--crm-gray-600)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar item de checklist
      </button>
    )
  }

  return (
    <div
      style={{
        padding: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-brand)",
        borderRadius: 8,
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            submit()
          } else if (e.key === "Escape") {
            setOpen(false)
            setValue("")
          }
        }}
        placeholder="Ex.: verificar links UTM"
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
          fontSize: 12,
          color: "var(--crm-gray-900)",
          outline: "none",
          marginBottom: 6,
        }}
      />
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => {
            setOpen(false)
            setValue("")
          }}
          style={{
            height: 24,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
            color: "var(--crm-gray-600)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={!value.trim() || submitting}
          style={{
            height: 24,
            padding: "0 10px",
            background: !value.trim() ? "var(--crm-gray-200)" : "var(--crm-brand)",
            border: 0,
            borderRadius: 4,
            color: !value.trim() ? "var(--crm-gray-500)" : "var(--crm-brand-fg)",
            fontSize: 11,
            fontWeight: 600,
            cursor: !value.trim() || submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "..." : "Adicionar"}
        </button>
      </div>
    </div>
  )
}
