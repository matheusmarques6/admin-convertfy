"use client"

/**
 * OnboardingDrawer — painel lateral acionado pelo clique no card.
 *
 * Design Pipeline Final (Bruno): eyebrow + header (avatar/nome/cliente),
 * botoes Editar + Avancar etapa, KPI strip (HEALTH/NA ETAPA/SLA/TAREFAS/MRR),
 * stepper horizontal das etapas, Status de Entregas (Pagamento/Contrato/
 * Formulario), Checklist com avatar do responsavel + data, Contato (email
 * + telefone com acoes), Entregaveis (com acoes Abrir/Download/Anexar),
 * Automacoes desta etapa, Atividade recente (events).
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  X,
  Loader2,
  Check,
  ExternalLink,
  Copy,
  FileText,
  Link as LinkIcon,
  Upload,
  Download,
  MessageCircle,
  Pencil,
  Paperclip,
  Zap,
  ChevronRight,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  OnboardingPipelineItem,
  OperationalPipelineColumn,
  TaskDeliverable,
  OnboardingTaskLite,
  DeliverableField,
  AutomationRule,
} from "@/types/onboarding-pipeline"

// ─── Fetcher + types ──────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return j
}

interface ActivityEvent {
  id: string
  event_type: string
  actor_id: string | null
  actor_type: string
  payload: Record<string, unknown>
  created_at: string
  actor?: { id: string; name: string; avatar_url: string | null } | null
}

interface DetailResponse {
  onboarding: OnboardingPipelineItem & {
    tasks?: (OnboardingTaskLite & {
      metadata?: Record<string, unknown>
      assignee_id?: string | null
    })[]
  }
  columns: OperationalPipelineColumn[]
  deliverables: TaskDeliverable[]
  activity: ActivityEvent[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function avatarHash(name: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const pal = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  return pal[Math.abs(h) % pal.length]
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

function fmtMrr(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n) || n <= 0) return "—"
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 60) return min <= 0 ? "agora" : `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return "ontem"
  if (d < 7) return `${d} dias atrás`
  return new Date(iso).toLocaleDateString("pt-BR")
}

function daysIn(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, "")
  if (d.length < 10) return p
  const ddi = d.length >= 12 ? d.slice(0, 2) : "55"
  const offset = d.length >= 12 ? 2 : 0
  const ddd = d.slice(offset, offset + 2)
  const tail = d.slice(-2)
  const numLen = d.length - offset - 2
  if (numLen === 9)
    return `+${ddi} (${ddd}) ${d[offset + 2]}****-**${tail}`
  return `+${ddi} (${ddd}) ****-**${tail}`
}

/** Calcula health score do onboarding (mesmo criterio do kanban) */
function calcHealth(
  onb: OnboardingPipelineItem,
  col: OperationalPipelineColumn | null,
): { score: number; label: string; tone: "success" | "warn" | "danger" } {
  if (!col) return { score: 100, label: "Saudável", tone: "success" }
  const elapsed = daysIn(onb.last_column_change_at)
  const slaDays = col.sla_hours ? col.sla_hours / 24 : 0
  let score = 100
  if (slaDays > 0) {
    if (elapsed >= slaDays) score -= 40
    else if (elapsed >= slaDays * 0.7) score -= 15
  }
  if (onb.briefing_status === "needs_review") score -= 20
  score = Math.max(0, Math.min(100, score))
  if (score >= 80) return { score, label: "Saudável", tone: "success" }
  if (score >= 60) return { score, label: "Atenção", tone: "warn" }
  return { score, label: "Crítico", tone: "danger" }
}

function paymentStatusPill(s: string | undefined | null): {
  label: string
  tone: "pos" | "warn" | "neg"
} {
  switch (s) {
    case "paid":
      return { label: "Pago", tone: "pos" }
    case "overdue":
      return { label: "Atrasado", tone: "neg" }
    case "renewal_due":
      return { label: "Renovar", tone: "warn" }
    default:
      return { label: "Pendente", tone: "warn" }
  }
}

function contractStatusPill(s: string | undefined | null): {
  label: string
  tone: "pos" | "warn"
} {
  switch (s) {
    case "signed":
      return { label: "Assinado", tone: "pos" }
    case "sent":
      return { label: "Enviado", tone: "warn" }
    case "expiring":
      return { label: "Vencendo", tone: "warn" }
    default:
      return { label: "Pendente", tone: "warn" }
  }
}

function formStatusPill(
  briefingStatus: string | undefined | null,
  hasResponses: boolean,
): { label: string; tone: "pos" | "warn" | "neg" } {
  if (briefingStatus === "approved") return { label: "Concluído", tone: "pos" }
  if (
    briefingStatus === "generated_pending_review" ||
    briefingStatus === "generating"
  )
    return { label: "Em revisão", tone: "warn" }
  if (briefingStatus === "needs_review")
    return { label: "Precisa revisão", tone: "neg" }
  if (hasResponses) return { label: "Em andamento", tone: "warn" }
  return { label: "Pendente", tone: "warn" }
}

function humanizeEvent(ev: ActivityEvent): string {
  const t = ev.event_type
  if (t === "onboarding.created") return "criou o onboarding"
  if (t === "onboarding.column_changed") {
    const p = ev.payload as { from_column_id?: string; to_column_id?: string }
    return p.to_column_id
      ? "moveu o onboarding para a próxima etapa"
      : "alterou a etapa"
  }
  if (t === "onboarding.completed") return "concluiu o onboarding"
  if (t === "onboarding.advanced") return "avançou a etapa"
  if (t === "onboarding.went_back") return "voltou pra etapa anterior"
  if (t === "onboarding.briefing_generated") return "gerou o briefing"
  if (t === "onboarding.briefing_confirmed")
    return "confirmou o briefing"
  if (t === "onboarding.whatsapp_sent") return "enviou WhatsApp pro cliente"
  if (t === "onboarding.task_completed") return "concluiu uma tarefa"
  if (t.startsWith("onboarding.")) return t.replace("onboarding.", "")
  return t
}

// ─── Drawer ──────────────────────────────────────────────────────────────

export function OnboardingDrawer({
  onboardingId,
  open,
  onClose,
  onMutate,
}: {
  onboardingId: string | null
  open: boolean
  onClose: () => void
  onMutate?: () => void
}) {
  const { data, mutate, isLoading, error } = useSWR<DetailResponse>(
    open && onboardingId ? `/api/onboardings/${onboardingId}` : null,
    fetcher,
  )
  const [advancing, setAdvancing] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const onb = data?.onboarding
  const columns = useMemo(() => data?.columns ?? [], [data?.columns])
  const deliverables = useMemo(
    () => data?.deliverables ?? [],
    [data?.deliverables],
  )
  const activity = useMemo(() => data?.activity ?? [], [data?.activity])

  const currentColumn = useMemo(
    () => columns.find((c) => c.id === onb?.current_column_id) ?? null,
    [columns, onb?.current_column_id],
  )
  const nextColumn = useMemo(() => {
    if (!currentColumn) return null
    return (
      columns.find((c) => c.position === currentColumn.position + 1) ?? null
    )
  }, [columns, currentColumn])

  // Filtra por coluna atual E version atual (evita misturar v1 historica
  // com v2 ativa apos go-back).
  const tasksInColumn = useMemo(
    () =>
      (onb?.tasks ?? []).filter(
        (t) =>
          t.operational_column_id === onb?.current_column_id &&
          ((t as unknown as { version?: number }).version ?? 1) ===
            (onb?.current_version ?? 1),
      ),
    [onb?.tasks, onb?.current_column_id, onb?.current_version],
  )
  const tasksDone = tasksInColumn.filter(
    (t) => t.status === "completed",
  ).length
  const tasksTotal = tasksInColumn.length

  const health = useMemo(
    () =>
      onb ? calcHealth(onb, currentColumn) : null,
    [onb, currentColumn],
  )

  async function handleAdvance() {
    if (!onb) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/onboardings/${onb.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg =
          typeof j?.error === "string"
            ? j.error
            : j?.error?.message ?? "Verifique checklist e entregáveis."
        toast.toast({
          variant: "destructive",
          title: "Não foi possível avançar",
          description: errMsg,
        })
        return
      }
      toast.toast({ title: "Avançou pra próxima etapa" })
      mutate()
      onMutate?.()
    } finally {
      setAdvancing(false)
    }
  }

  async function toggleTask(
    task: OnboardingTaskLite & { metadata?: Record<string, unknown> },
  ) {
    const newStatus = task.status === "completed" ? "pending" : "completed"
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const errMsg =
          typeof j?.error === "string"
            ? j.error
            : j?.error?.message ?? `HTTP ${res.status}`
        toast.toast({
          variant: "destructive",
          title: "Falha ao atualizar tarefa",
          description: errMsg,
        })
        return
      }
      mutate()
      onMutate?.()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Falha ao atualizar tarefa",
        description: e instanceof Error ? e.message : "Erro de rede",
      })
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.toast({ title: `${label} copiado`, description: text })
  }

  function openWhatsApp(phone: string) {
    const digits = phone.replace(/\D/g, "")
    const num =
      digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
    window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer")
  }

  if (!open || !onboardingId) return null

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="ml-auto relative h-full w-full max-w-[540px] bg-white dark:bg-[#0F1117] shadow-2xl border-l border-black/[0.08] dark:border-white/[0.08] flex flex-col animate-cf-slidein">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <p className="text-[13px] text-rose-600 dark:text-rose-400">
              Erro ao carregar: {(error as Error).message}
            </p>
          </div>
        )}

        {onb && currentColumn && !isLoading && (
          <>
            {/* Top bar: eyebrow + acoes */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.06]">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-white/45">
                Detalhes do onboarding
              </p>
              <div className="flex items-center gap-1.5">
                <Link
                  href={ROUTES.ADMIN.ONBOARDING_V2.DETAIL(onb.id)}
                  className="cf-focusable inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium text-slate-600 dark:text-white/65 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" strokeWidth={2} />
                  Ver detalhes
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="cf-focusable h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.06]"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Header: avatar + nome + cliente + botoes */}
            <DrawerHeader
              storeName={onb.store?.store_name ?? "Loja"}
              clientName={onb.client?.name ?? null}
              clientCompany={onb.client?.company ?? null}
              version={onb.current_version}
              onEdit={() => {
                window.location.href = ROUTES.ADMIN.ONBOARDING_V2.DETAIL(onb.id)
              }}
              onAdvance={handleAdvance}
              advancing={advancing}
              nextColumnName={nextColumn?.name ?? null}
              isFinal={!nextColumn}
            />

            {/* KPI strip */}
            <div className="grid grid-cols-5 gap-0 border-b border-black/[0.04] dark:border-white/[0.06]">
              <KpiStat
                label="Health"
                value={health ? String(health.score) : "—"}
                hint={health?.label}
                tone={health?.tone}
              />
              <KpiStat
                label="Na etapa"
                value={`${daysIn(onb.last_column_change_at)}d`}
              />
              <KpiStat
                label="SLA"
                value={
                  currentColumn.sla_hours
                    ? `${Math.ceil(currentColumn.sla_hours / 24)}d`
                    : "—"
                }
              />
              <KpiStat
                label="Tarefas"
                value={`${tasksDone}/${tasksTotal}`}
              />
              <KpiStat label="MRR" value={fmtMrr(onb.mrr_value)} />
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* ETAPA ATUAL: stepper horizontal */}
              <Section title="Etapa atual">
                <Stepper columns={columns} currentId={currentColumn.id} />
              </Section>

              {/* STATUS DE ENTREGAS */}
              <Section title="Status de entregas">
                <DeliveryStatusRow
                  icon="$"
                  label="Pagamento"
                  pill={paymentStatusPill(
                    onb.effective_payment_status ?? onb.payment_status,
                  )}
                />
                <DeliveryStatusRow
                  icon="📄"
                  label="Contrato"
                  pill={contractStatusPill(
                    onb.effective_contract_status ?? onb.contract_status,
                  )}
                />
                <DeliveryStatusRow
                  icon="📝"
                  label="Formulário"
                  pill={formStatusPill(
                    onb.briefing_status,
                    !!onb.form_responses,
                  )}
                />
              </Section>

              {/* CHECKLIST · {coluna} */}
              <Section
                title={`Checklist · ${currentColumn.name}`}
                rightLabel={`${tasksDone}/${tasksTotal}`}
              >
                {tasksInColumn.length === 0 ? (
                  <p className="text-[12px] text-slate-400 italic">
                    Nenhuma tarefa nesta etapa.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasksInColumn.map((t) => (
                      <ChecklistRow
                        key={t.id}
                        task={t}
                        onToggle={() => toggleTask(t)}
                      />
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="mt-3 text-[12px] font-medium text-brand-500 dark:text-brand-300 hover:underline inline-flex items-center gap-1"
                  onClick={() => {
                    window.location.href = ROUTES.ADMIN.ONBOARDING_V2.DETAIL(
                      onb.id,
                    )
                  }}
                >
                  + Adicionar tarefa
                </button>
              </Section>

              {/* CONTATO */}
              <Section title="Contato">
                <ContactRow
                  icon={<MessageCircle className="h-3.5 w-3.5" />}
                  label="Email"
                  value={(onb.client as { email?: string })?.email ?? null}
                  actionLabel="Copiar"
                  onAction={() => {
                    const email = (onb.client as { email?: string })?.email
                    if (email) copyToClipboard(email, "Email")
                  }}
                />
                <ContactRow
                  icon={<MessageCircle className="h-3.5 w-3.5" />}
                  label="Telefone"
                  value={maskPhone(
                    onb.client_whatsapp ??
                      ((onb.client as { phone?: string })?.phone ?? null),
                  )}
                  actionLabel="WhatsApp"
                  actionTone="success"
                  onAction={() => {
                    const phone =
                      onb.client_whatsapp ??
                      (onb.client as { phone?: string })?.phone
                    if (phone) openWhatsApp(phone)
                  }}
                />
              </Section>

              {/* ENTREGAVEIS DA ETAPA ATUAL */}
              {currentColumn.deliverables_template.length > 0 && (
                <Section title="Entregáveis desta etapa">
                  {currentColumn.deliverables_template.map((field) => {
                    const d = deliverables.find(
                      (x) => x.field_slug === field.slug,
                    )
                    return (
                      <DeliverableRow
                        key={field.slug}
                        field={field}
                        deliverable={d ?? null}
                      />
                    )
                  })}
                </Section>
              )}

              {/* ENTREGAS DE ETAPAS ANTERIORES (read-only, agrupado por coluna) */}
              <PreviousStagesDeliveries
                columns={columns}
                currentColumn={currentColumn}
                deliverables={deliverables}
              />

              {/* AUTOMACOES DESTA ETAPA */}
              {currentColumn.automation_rules.length > 0 && (
                <Section title="Automações desta etapa">
                  <AutomationsList
                    rules={currentColumn.automation_rules}
                    columnName={currentColumn.name}
                  />
                </Section>
              )}

              {/* ATIVIDADE RECENTE */}
              <Section title="Atividade recente">
                {activity.length === 0 ? (
                  <p className="text-[12px] text-slate-400 italic">
                    Nenhuma atividade registrada ainda.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {activity.slice(0, 10).map((ev) => (
                      <ActivityRow key={ev.id} event={ev} />
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes cf-slidein {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-cf-slidein {
          animation: cf-slidein 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  )
}

// ─── DrawerHeader ─────────────────────────────────────────────────────────

function DrawerHeader({
  storeName,
  clientName,
  clientCompany,
  version,
  onEdit,
  onAdvance,
  advancing,
  nextColumnName,
  isFinal,
}: {
  storeName: string
  clientName: string | null
  clientCompany: string | null
  version: number
  onEdit: () => void
  onAdvance: () => void
  advancing: boolean
  nextColumnName: string | null
  isFinal: boolean
}) {
  const c = avatarHash(storeName)
  return (
    <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[10px] font-semibold shrink-0"
          style={{
            background: c.bg,
            color: c.fg,
            fontSize: 14,
            letterSpacing: "-0.02em",
          }}
          aria-hidden
        >
          {initials(storeName).slice(0, 2) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">
              {storeName}
            </h2>
            {version > 1 && (
              <span
                className="cf-pill cf-warn shrink-0"
                style={{ padding: "1px 6px", fontSize: 10 }}
              >
                v{version}
              </span>
            )}
          </div>
          {(clientName || clientCompany) && (
            <p className="text-[12.5px] text-slate-500 dark:text-white/55 truncate mt-0.5">
              {clientName}
              {clientName && clientCompany && (
                <span className="text-slate-300 dark:text-white/25"> · </span>
              )}
              {clientCompany}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[7px] border border-slate-200 dark:border-white/[0.10] text-[12.5px] font-semibold text-slate-700 dark:text-white/85 bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          Editar
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={advancing || isFinal}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[7px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {advancing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          )}
          {isFinal
            ? "Etapa final"
            : advancing
              ? "Avançando…"
              : nextColumnName
                ? `Avançar etapa`
                : "Avançar etapa"}
        </button>
      </div>
    </div>
  )
}

// ─── KpiStat ──────────────────────────────────────────────────────────────

function KpiStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "success" | "warn" | "danger"
}) {
  const hintColor =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-400 dark:text-white/40"
  return (
    <div className="px-3 py-3 border-r last:border-r-0 border-black/[0.04] dark:border-white/[0.04]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
        {label}
      </p>
      <p className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
        {value}
      </p>
      {hint && (
        <p className={`text-[10.5px] mt-1 ${hintColor}`}>{hint}</p>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────

function Section({
  title,
  rightLabel,
  children,
}: {
  title: string
  rightLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-white/45">
          {title}
        </h3>
        {rightLabel && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
            {rightLabel}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Stepper horizontal ───────────────────────────────────────────────────

function Stepper({
  columns,
  currentId,
}: {
  columns: OperationalPipelineColumn[]
  currentId: string
}) {
  const currentIdx = columns.findIndex((c) => c.id === currentId)
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      {columns.map((c, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={c.id} className="flex items-center gap-1.5">
            <div
              className={
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors " +
                (active
                  ? "text-slate-900 dark:text-white"
                  : done
                    ? "text-slate-500 dark:text-white/45"
                    : "text-slate-400 dark:text-white/30")
              }
              style={
                active
                  ? {
                      background: c.color + "20",
                      boxShadow: `inset 0 0 0 1px ${c.color}`,
                    }
                  : undefined
              }
            >
              <span
                className="h-[6px] w-[6px] rounded-full"
                style={{
                  background: done
                    ? "#10B981"
                    : active
                      ? c.color
                      : "#CBD5E1",
                }}
                aria-hidden
              />
              {c.name}
            </div>
            {idx < columns.length - 1 && (
              <ChevronRight
                className="h-3 w-3 text-slate-300 dark:text-white/20"
                strokeWidth={2}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── DeliveryStatusRow ────────────────────────────────────────────────────

function DeliveryStatusRow({
  icon,
  label,
  pill,
}: {
  icon: string
  label: string
  pill: { label: string; tone: "pos" | "warn" | "neg" }
}) {
  const map = {
    pos: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    neg: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  }
  const dotColor = {
    pos: "#10B981",
    warn: "#F59E0B",
    neg: "#EF4444",
  }
  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/55 text-[12px]">
          {icon}
        </span>
        <span className="text-[13px] font-medium text-slate-800 dark:text-white/90">
          {label}
        </span>
      </div>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-[5px] ${map[pill.tone]}`}
      >
        <span
          className="rounded-full"
          style={{ height: 5, width: 5, background: dotColor[pill.tone] }}
        />
        {pill.label}
      </span>
    </div>
  )
}

// ─── ChecklistRow ─────────────────────────────────────────────────────────

function ChecklistRow({
  task,
  onToggle,
}: {
  task: OnboardingTaskLite & { metadata?: Record<string, unknown> }
  onToggle: () => void
}) {
  const done = task.status === "completed"
  const assignee = task.assignee_role ?? null
  const due = task.due_date ?? null
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className={
          "shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors " +
          (done
            ? "bg-brand-500 border-brand-500 text-white hover:bg-brand-600"
            : "bg-white dark:bg-[#1A1D27] border-slate-300 dark:border-white/[0.18] hover:border-brand-500")
        }
        aria-label={done ? "Marcar como pendente" : "Marcar como concluído"}
      >
        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </button>
      <span
        className={
          "flex-1 text-[13px] truncate " +
          (done
            ? "text-slate-400 line-through dark:text-white/35"
            : "text-slate-800 dark:text-white/85")
        }
      >
        {task.title}
      </span>
      {assignee && (
        <span className="text-[10.5px] font-medium text-slate-500 dark:text-white/55 shrink-0">
          {assignee}
        </span>
      )}
      {due && (
        <span className="text-[10.5px] font-mono text-slate-400 dark:text-white/35 tabular-nums shrink-0 min-w-[34px] text-right">
          {fmtDate(due)}
        </span>
      )}
    </li>
  )
}

// ─── ContactRow ───────────────────────────────────────────────────────────

function ContactRow({
  icon,
  label,
  value,
  actionLabel,
  actionTone,
  onAction,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  actionLabel: string
  actionTone?: "success"
  onAction: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-slate-400 dark:text-white/40 shrink-0">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45 w-[60px] shrink-0">
          {label}
        </span>
        <span className="text-[13px] text-slate-700 dark:text-white/85 truncate font-mono">
          {value ?? "—"}
        </span>
      </div>
      {value && (
        <button
          type="button"
          onClick={onAction}
          className={
            "inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium transition-colors shrink-0 " +
            (actionTone === "success"
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10]")
          }
        >
          {actionTone === "success" ? (
            <MessageCircle className="h-3 w-3" strokeWidth={2} />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={2} />
          )}
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ─── DeliverableRow ───────────────────────────────────────────────────────

function DeliverableRow({
  field,
  deliverable,
}: {
  field: DeliverableField
  deliverable: TaskDeliverable | null
}) {
  const filled = !!(deliverable?.value || deliverable?.file_url)
  const url = deliverable?.file_url ?? deliverable?.value ?? null
  const displayValue = (() => {
    if (!filled) return "Não anexado"
    if (deliverable?.file_url) {
      return deliverable.file_name ?? deliverable.file_url
    }
    return deliverable?.value ?? "—"
  })()

  const icon =
    field.type === "upload" ? (
      <Upload className="h-3.5 w-3.5" />
    ) : field.type === "url" ? (
      <LinkIcon className="h-3.5 w-3.5" />
    ) : (
      <FileText className="h-3.5 w-3.5" />
    )

  const actionLabel = filled
    ? field.type === "upload"
      ? "Download"
      : "Abrir"
    : "Anexar"

  const ActionIcon = filled
    ? field.type === "upload"
      ? Download
      : ExternalLink
    : Paperclip

  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-slate-400 dark:text-white/40 shrink-0">
          {icon}
        </span>
        <span className="text-[12px] font-medium text-slate-700 dark:text-white/85 w-[110px] shrink-0 truncate">
          {field.label}
        </span>
        <span
          className={
            "text-[12px] truncate flex-1 " +
            (filled
              ? "text-slate-600 dark:text-white/70 font-mono"
              : "text-slate-400 dark:text-white/40 italic")
          }
        >
          {String(displayValue).length > 32
            ? String(displayValue).slice(0, 32) + "…"
            : displayValue}
        </span>
      </div>
      {filled && url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10] transition-colors shrink-0"
        >
          <ActionIcon className="h-3 w-3" strokeWidth={2} />
          {actionLabel}
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium bg-slate-50 text-slate-400 dark:bg-white/[0.03] dark:text-white/30 cursor-not-allowed shrink-0"
          title="Disponível em Ver detalhes"
        >
          <ActionIcon className="h-3 w-3" strokeWidth={2} />
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ─── AutomationsList ──────────────────────────────────────────────────────

function AutomationsList({
  rules,
  columnName,
}: {
  rules: AutomationRule[]
  columnName: string
}) {
  // Agrupa por trigger
  const byTrigger = rules.reduce(
    (acc, r) => {
      const key = r.trigger
      if (!acc[key]) acc[key] = []
      acc[key].push(r)
      return acc
    },
    {} as Record<string, AutomationRule[]>,
  )

  const TRIGGER_LABEL: Record<string, string> = {
    completed: "Ao concluir esta etapa",
    created: "Ao entrar nesta etapa",
    overdue: "Quando SLA estourar",
    form_submitted: "Quando cliente enviar formulário",
    briefing_confirmed: "Quando cliente confirmar briefing",
  }

  const ACTION_LABEL: Record<string, string> = {
    advance_to_next: "Avançar pra próxima etapa",
    go_back_to: "Voltar pra etapa anterior",
    create_task: "Criar tarefa",
    call_webhook: "Disparar webhook",
    create_pipeline_item: "Criar item em outra pipeline",
    send_notification: "Notificar responsável",
    generate_briefing: "Gerar briefing com IA",
    generate_tutorial_token: "Gerar link do tutorial pro cliente",
  }

  return (
    <div className="space-y-2.5">
      {Object.entries(byTrigger).map(([trigger, rs]) => (
        <div
          key={trigger}
          className="rounded-[10px] border border-brand-200/70 dark:border-brand-500/20 bg-gradient-to-br from-brand-50/40 via-white to-white dark:from-brand-500/[0.06] dark:via-transparent dark:to-transparent p-3"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3 w-3 text-brand-500" strokeWidth={2.5} />
            <span className="text-[11.5px] font-semibold text-brand-600 dark:text-brand-300">
              {TRIGGER_LABEL[trigger] ?? trigger}
            </span>
          </div>
          <ul className="space-y-1 pl-4">
            {rs.map((r, i) => {
              const title =
                (r.params as { title?: string })?.title ??
                ACTION_LABEL[r.action] ??
                r.action
              const params = r.params as { assignee_role?: string }
              return (
                <li
                  key={`${trigger}-${i}`}
                  className="text-[12px] text-slate-700 dark:text-white/75 leading-relaxed"
                >
                  <span className="text-slate-400 dark:text-white/35 mr-1.5">
                    ›
                  </span>
                  {title}
                  {params.assignee_role && (
                    <span className="text-slate-400 dark:text-white/40">
                      {" "}
                      · {params.assignee_role}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <p className="text-[10.5px] text-slate-400 dark:text-white/35 italic">
        Configuradas no template da etapa {columnName}.
      </p>
    </div>
  )
}

// ─── ActivityRow ──────────────────────────────────────────────────────────

// ─── PreviousStagesDeliveries ─────────────────────────────────────────────
// Mostra entregas das etapas ANTERIORES a atual (read-only).
// Bruno: 'precisa de um lugar para ver os entregaveis anterior tipo o
// preview em producao é entregue mas nao consigo ver a entrega no
// aprovacao do preview'.
function PreviousStagesDeliveries({
  columns,
  currentColumn,
  deliverables,
}: {
  columns: OperationalPipelineColumn[]
  currentColumn: OperationalPipelineColumn
  deliverables: TaskDeliverable[]
}) {
  const previousColumns = columns.filter(
    (c) => c.position < currentColumn.position,
  )

  // Para cada coluna anterior, procura deliverables filled
  const stagesWithFills = previousColumns
    .map((col) => {
      const filled = (col.deliverables_template ?? [])
        .map((field) => {
          const d = deliverables.find((x) => x.field_slug === field.slug)
          if (!d || (!d.value && !d.file_url)) return null
          return { field, deliverable: d }
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
      return { col, filled }
    })
    .filter((s) => s.filled.length > 0)

  if (stagesWithFills.length === 0) return null

  return (
    <Section title="Entregas das etapas anteriores">
      <div className="space-y-3.5">
        {stagesWithFills.map(({ col, filled }) => (
          <div key={col.id}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: col.color }}
                aria-hidden
              />
              <span className="text-[11.5px] font-semibold text-slate-700 dark:text-white/80">
                {col.name}
              </span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-white/40 tabular-nums">
                {filled.length}/{(col.deliverables_template ?? []).length}
              </span>
            </div>
            <div className="pl-3 space-y-1">
              {filled.map(({ field, deliverable }) => (
                <DeliverableRow
                  key={`${col.id}-${field.slug}`}
                  field={field}
                  deliverable={deliverable}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const actorName = event.actor?.name ?? "Sistema"
  const c = avatarHash(actorName)
  return (
    <li className="flex items-start gap-2.5">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold shrink-0"
        style={{
          background: c.bg,
          color: c.fg,
          letterSpacing: "-0.01em",
        }}
      >
        {initials(actorName).slice(0, 2) || "•"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-slate-700 dark:text-white/80 leading-snug">
          <span className="font-semibold text-slate-900 dark:text-white">
            {actorName}
          </span>{" "}
          {humanizeEvent(event)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-white/40 mt-0.5">
          {fmtRelative(event.created_at)}
        </p>
      </div>
    </li>
  )
}
