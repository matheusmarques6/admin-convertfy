"use client"

import { useState } from "react"
import {
  Check,
  CheckCircle2,
  MessageSquare,
  Paperclip,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import type { ProductivityTask } from "@/types/productivity"
import {
  DeliverableEditModal,
  type DeliverableEditTarget,
} from "./deliverable-edit-modal"

type SubItem = {
  slug: string
  label: string
  completed?: boolean
  completed_at?: string | null
  completed_by?: string | null
}

type ChecklistItem = {
  id: string
  title: string
  is_completed: boolean
}

type Comment = {
  id: string
  content: string
  created_at: string
  author?: { name?: string | null } | null
  profiles?: { name?: string | null } | null
}

type DrawerTask = ProductivityTask & {
  description?: string | null
  onboarding_id?: string
  metadata?: Record<string, unknown> & { sub_items?: SubItem[] }
  deliverables?: DeliverableEditTarget[]
  checklist?: ChecklistItem[]
  task_comments?: Comment[]
}

const STATUS_FLOW: Array<{
  status: ProductivityTask["status"]
  label: string
}> = [
  { status: "pending", label: "Pendente" },
  { status: "progress", label: "Em andamento" },
  { status: "review", label: "Em revisao" },
  { status: "done", label: "Concluida" },
]

export function TaskDetailDrawer({
  task,
  canWork = true,
  canAdmin = false,
  onClose,
}: {
  task: DrawerTask
  canWork?: boolean
  canAdmin?: boolean
  onClose: () => void
}) {
  const { fetchData, members } = useProductivityStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [deliverable, setDeliverable] =
    useState<DeliverableEditTarget | null>(null)

  const subItems = task.metadata?.sub_items ?? []
  const deliverables = task.deliverables ?? []
  const checklist = task.checklist ?? []
  const comments = task.task_comments ?? []
  const currentIndex = STATUS_FLOW.findIndex(
    (item) => item.status === task.status,
  )
  const next = STATUS_FLOW[currentIndex + 1] ?? null

  const request = async (input: RequestInfo, init?: RequestInit) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(input, init)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(
          String(
            payload?.error?.message ??
              payload?.error ??
              "Nao foi possivel salvar",
          ),
        )
      }
      await fetchData()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar")
      return false
    } finally {
      setBusy(false)
    }
  }

  const advance = async () => {
    if (!next || !canWork) return
    if (next.status === "done") {
      await request(`/api/tasks/${task.id}/complete`, { method: "POST" })
      return
    }
    await request(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status:
          next.status === "progress"
            ? "in_progress"
            : next.status === "review"
              ? "in_review"
              : next.status,
      }),
    })
  }

  const sendComment = async () => {
    if (!comment.trim()) return
    const saved = await request(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: comment.trim() }),
    })
    if (saved) setComment("")
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/25" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(720px,96vw)] flex-col bg-white shadow-2xl dark:bg-[#1A1D27]">
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-slate-500">
              Projetos / {String(task.metadata?.store_name ?? task.project)}
            </p>
            <h2 className="mt-1 truncate text-[18px] font-semibold text-slate-950 dark:text-white">
              {task.name}
            </h2>
          </div>
          {canAdmin && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Excluir esta tarefa?")) return
                const deleted = await request(`/api/tasks/${task.id}`, {
                  method: "DELETE",
                })
                if (deleted) onClose()
              }}
              className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="Excluir tarefa"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-slate-200 px-6 py-5 dark:border-white/[0.08]">
            <div className="grid grid-cols-4 gap-2">
              {STATUS_FLOW.map((item, index) => (
                <div key={item.status}>
                  <div
                    className={cn(
                      "h-1 rounded",
                      index <= currentIndex ? "bg-brand-400" : "bg-slate-200",
                    )}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            {next && canWork && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void advance()}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded bg-brand-400 px-4 text-[12px] font-semibold text-white hover:bg-brand disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {next.status === "done" ? "Concluir tarefa" : next.label}
              </button>
            )}
            {!canWork && (
              <p className="mt-4 text-[12px] text-slate-500">
                Acesso somente leitura para esta etapa.
              </p>
            )}
            {error && (
              <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </p>
            )}
          </section>

          {task.description && (
            <Section title="Descricao">
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-700 dark:text-white/70">
                {task.description}
              </p>
            </Section>
          )}

          {subItems.length > 0 && (
            <Section
              title={`Subitens compartilhados - ${subItems.filter((item) => item.completed).length}/${subItems.length}`}
            >
              {subItems.map((item) => {
                const member = members.find(
                  (candidate) => candidate.id === item.completed_by,
                )
                return (
                  <button
                    key={item.slug}
                    type="button"
                    disabled={!canWork || busy}
                    onClick={() =>
                      void request(
                        `/api/tasks/${task.id}/sub-items/${encodeURIComponent(item.slug)}/toggle`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            completed: item.completed !== true,
                          }),
                        },
                      )
                    }
                    className="flex w-full items-center gap-3 border-b border-slate-100 py-2.5 text-left last:border-b-0 disabled:cursor-not-allowed dark:border-white/[0.05]"
                  >
                    <CheckBox checked={item.completed === true} />
                    <span
                      className={cn(
                        "flex-1 text-[12.5px] text-slate-700 dark:text-white/75",
                        item.completed && "text-slate-400 line-through",
                      )}
                    >
                      {item.label}
                    </span>
                    {item.completed_at && (
                      <span className="text-right text-[10px] text-slate-400">
                        {member?.name ?? "Time"}
                        <br />
                        {new Date(item.completed_at).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </button>
                )
              })}
            </Section>
          )}

          {deliverables.length > 0 && (
            <Section title="Entregaveis">
              <div className="grid gap-2 sm:grid-cols-2">
                {deliverables.map((item) => {
                  const ready = Boolean(
                    item.value || item.file_url || item.filled_at,
                  )
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canWork}
                      onClick={() => setDeliverable(item)}
                      className="flex min-h-12 items-center gap-2 rounded border border-slate-200 px-3 py-2 text-left disabled:cursor-default dark:border-white/[0.08]"
                    >
                      <Paperclip className="h-4 w-4 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-[12px]">
                        {item.field_label}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold",
                          ready ? "text-emerald-700" : "text-slate-400",
                        )}
                      >
                        {ready ? "Pronto" : "Pendente"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          {checklist.length > 0 && (
            <Section title="Checklist">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!canWork || busy}
                  onClick={() =>
                    void request(`/api/tasks/${task.id}/checklists`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        checklist_id: item.id,
                        is_completed: !item.is_completed,
                      }),
                    })
                  }
                  className="flex w-full items-center gap-3 border-b border-slate-100 py-2.5 text-left last:border-b-0 dark:border-white/[0.05]"
                >
                  <CheckBox checked={item.is_completed} />
                  <span className="text-[12.5px]">{item.title}</span>
                </button>
              ))}
            </Section>
          )}

          <Section title="Comentarios" last>
            <div className="space-y-2">
              {comments.map((item) => (
                <div
                  key={item.id}
                  className="rounded bg-slate-50 p-3 dark:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {item.author?.name ?? item.profiles?.name ?? "Time"}
                    </span>
                    <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-[12.5px]">{item.content}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="flex items-center gap-2 text-[12px] text-slate-400">
                  <MessageSquare className="h-4 w-4" />
                  Sem comentarios.
                </p>
              )}
            </div>
            {canWork && (
              <div className="mt-3 flex gap-2">
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void sendComment()
                  }}
                  placeholder="Adicionar comentario"
                  className="h-9 min-w-0 flex-1 rounded border border-slate-200 px-3 text-[12.5px] outline-none focus:border-brand-400"
                />
                <button
                  type="button"
                  disabled={!comment.trim() || busy}
                  onClick={() => void sendComment()}
                  className="rounded bg-slate-900 px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            )}
          </Section>
        </div>
      </aside>

      {deliverable && canWork && (
        <DeliverableEditModal
          taskId={task.id}
          deliverable={deliverable}
          onboardingId={task.onboarding_id}
          onClose={() => setDeliverable(null)}
          onSaved={() => {
            setDeliverable(null)
            void fetchData()
          }}
        />
      )}
    </>
  )
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <section
      className={cn(
        "px-6 py-5",
        !last && "border-b border-slate-200 dark:border-white/[0.08]",
      )}
    >
      <h3 className="mb-3 text-[11px] font-semibold uppercase text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        checked
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-slate-300 bg-white",
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  )
}
