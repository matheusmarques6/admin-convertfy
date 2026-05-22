"use client"

/**
 * TaskDetailDrawer — overlay fullscreen-height pro detalhe da task.
 * Replica o design do prototipo (Bruno) e mantem funcional integrado
 * com store + endpoints reais:
 *  - apiAction("update_task" / "update_assignee") via store
 *  - updateTaskStatus via store (avanco guiado)
 *  - POST /api/tasks/[id]/complete quando vai pra done (sync onboarding)
 *  - PATCH /api/tasks/[id]/deliverables/[deliverableId] (status cycle)
 *  - PUT /api/tasks/[id]/checklists (toggle is_completed)
 *  - POST add_comment via store (mesma rota legacy)
 */

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import type { ProductivityTask } from "@/types/productivity"
import { BlockIdentidadeLoja } from "./blocks/block-identidade-loja"
import { BlockBrandBrain } from "./blocks/block-brand-brain"
import { BlockAssetsVisuais } from "./blocks/block-assets-visuais"
import { BlockCriteriosAceitacao } from "./blocks/block-criterios-aceitacao"
import { BlockTimelineUnificada } from "./blocks/block-timeline-unificada"
import { BlockAnotacoesPessoais } from "./blocks/block-anotacoes-pessoais"
import {
  TaskPanelSidebar,
  type SidebarSection,
} from "./blocks/task-panel-sidebar"
import { DeliverableEditModal } from "./deliverable-edit-modal"

// ── Design tokens (replicam DS do prototipo) ────────────────────────────────
const C = {
  brandBlue: "#2137B6",
  brandBlueLight: "#4E62D8",
  brandBlue50: "#EEF0FB",
  brandBlue100: "#C7CDEF",
  green: "#10B981",
  greenText: "#065F46",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
  amber: "#F59E0B",
  amberText: "#92400E",
  red: "#DC2626",
  redText: "#991B1B",
  purple: "#A855F7",
  purpleText: "#7E22CE",
  purpleBg: "#F3E8FF",
}
const PRIO = {
  1: { label: "Urgente", color: C.red },
  2: { label: "Alta", color: C.amber },
  3: { label: "Média", color: "#3B82F6" },
  4: { label: "Baixa", color: "#6B7280" },
} as const

// ── SVG icons (outline 24x24) ────────────────────────────────────────────────
type IconProps = { size?: number; strokeWidth?: number; className?: string }
const Icon = (
  { children, size = 14, strokeWidth = 1.5, className }: IconProps & { children: React.ReactNode },
) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("shrink-0", className)}
  >
    {children}
  </svg>
)
const I = {
  folder: (p?: IconProps) => <Icon {...p}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></Icon>,
  close: (p?: IconProps) => <Icon {...p}><path d="M18 6L6 18M6 6l12 12" /></Icon>,
  more: (p?: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>,
  history: (p?: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 109-9 9.74 9.74 0 00-7 3" /><path d="M3 5v4h4M12 7v5l3 2" /></Icon>,
  bolt: (p?: IconProps) => <Icon {...p}><path d="M13 2L3 14h9l-1 8L21 10h-9z" /></Icon>,
  alert: (p?: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icon>,
  users: (p?: IconProps) => <Icon {...p}><circle cx="9" cy="7" r="4" /><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></Icon>,
  store: (p?: IconProps) => <Icon {...p}><path d="M3 9l1.5-5.5A1 1 0 015.5 3h13a1 1 0 011 .7L21 9M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18" /></Icon>,
  cal: (p?: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>,
  clock: (p?: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>,
  play: (p?: IconProps) => <Icon {...p}><polygon points="5 3 19 12 5 21 5 3" /></Icon>,
  pause: (p?: IconProps) => <Icon {...p}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></Icon>,
  edit: (p?: IconProps) => <Icon {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>,
  plus: (p?: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>,
  paperclip: (p?: IconProps) => <Icon {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.42 17.36a2 2 0 01-2.83-2.83l8.49-8.48" /></Icon>,
  send: (p?: IconProps) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Icon>,
  check: (p?: IconProps) => <Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>,
  chevDown: (p?: IconProps) => <Icon {...p}><polyline points="6 9 12 15 18 9" /></Icon>,
  sparkle: (p?: IconProps) => <Icon {...p}><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" /></Icon>,
  eye: (p?: IconProps) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>,
  rocket: (p?: IconProps) => <Icon {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" /></Icon>,
  download: (p?: IconProps) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></Icon>,
  external: (p?: IconProps) => <Icon {...p}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></Icon>,
  doc: (p?: IconProps) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></Icon>,
  figma: (p?: IconProps) => <Icon {...p}><path d="M5 5.5A3.5 3.5 0 018.5 2H12v7H8.5A3.5 3.5 0 015 5.5zM12 2h3.5a3.5 3.5 0 110 7H12V2zM12 12.5a3.5 3.5 0 117 0 3.5 3.5 0 11-7 0zM5 19.5A3.5 3.5 0 018.5 16H12v3.5a3.5 3.5 0 11-7 0zM5 12.5A3.5 3.5 0 018.5 9H12v7H8.5A3.5 3.5 0 015 12.5z" /></Icon>,
  link: (p?: IconProps) => <Icon {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></Icon>,
}

// ── Types ────────────────────────────────────────────────────────────────────
type Member = { id: string; name: string; avatar_url: string | null; initials: string }
type Deliverable = {
  id: string
  field_label: string
  field_slug: string
  field_type?: string
  required?: boolean
  options?: string[]
  allow_other?: boolean
  default_value?: string | null
  value: string | null
  file_url: string | null
  file_name: string | null
  file_size_bytes?: number | null
  filled_at: string | null
  metadata: Record<string, unknown> | null
}
type ChecklistItem = {
  id: string
  title: string
  is_completed: boolean
  completed_by: string | null
  position: number
}
type TaskAttachment = {
  url?: string
  file_url?: string
  name?: string
  file_name?: string
  size?: number
  file_size_bytes?: number
  kind?: string
}
type TaskLink = { url: string; label?: string }
type TaskComment = {
  id: string
  content: string
  author_id: string | null
  created_at: string
  profiles?: { name: string; avatar_url: string | null } | null
}
type TaskAugmented = ProductivityTask & {
  description?: string | null
  source_type?: string
  onboarding_id?: string
  metadata?: Record<string, unknown>
  deliverables?: Deliverable[]
  checklist?: ChecklistItem[]
  task_comments?: TaskComment[]
  attachments?: TaskAttachment[]
  links?: TaskLink[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(b?: number): string {
  if (!b) return ""
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return "agora"
  if (diff < 3600) return `há ${Math.round(diff / 60)}min`
  if (diff < 86400) return `há ${Math.round(diff / 3600)}h`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

// ── Animations injected once ─────────────────────────────────────────────────
function DrawerStyles() {
  return (
    <style jsx global>{`
      @keyframes drawer-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
      @keyframes drawer-slide-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
      @keyframes drawer-toast-up {
        from { transform: translate(-50%, 20px); opacity: 0 }
        to { transform: translate(-50%, 0); opacity: 1 }
      }
    `}</style>
  )
}

// ── Section collapse wrapper ─────────────────────────────────────────────────
function Section({
  title,
  action,
  children,
  defaultOpen = true,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-[18px]">
      <div
        className="flex items-center justify-between mb-2 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "text-gray-400 flex transition-transform duration-150",
              !open && "-rotate-90",
            )}
          >
            {I.chevDown({ size: 11 })}
          </span>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-600 m-0">
            {title}
          </h3>
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {open && children}
    </div>
  )
}

// ── Property row (icone + label fixo 100px + value) ──────────────────────────
function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12px]">
      <span className="w-[100px] shrink-0 flex items-center gap-1.5 text-gray-500 font-medium">
        <span className="text-gray-400 flex">{icon}</span>
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ── Status big badge ─────────────────────────────────────────────────────────
function StatusBadgeBig({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    pending: { label: "Pendente", color: "#4B5563", bg: "#F3F4F6", dot: "#9CA3AF" },
    progress: { label: "Em andamento", color: C.brandBlue, bg: C.brandBlue50, dot: C.brandBlue },
    review: { label: "Em revisão", color: C.purpleText, bg: C.purpleBg, dot: C.purple },
    done: { label: "Concluído", color: C.greenText, bg: C.greenBg, dot: C.green },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1"
      style={{ color: c.color, background: c.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

// ── Priority dot (igual o original do board) ────────────────────────────────
function PrioDot({ priority }: { priority: 1 | 2 | 3 | 4 }) {
  const p = PRIO[priority]
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold font-mono tabular-nums"
      style={{ color: p.color }}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.color }} />
      P{priority}
    </span>
  )
}

// ── Initials avatar (com hex color do membro ou hash gerado) ─────────────────
function avatarColorFor(initials: string): string {
  const palette = ["#FB923C", "#A855F7", "#10B981", "#3B82F6", "#EC4899", "#F59E0B", "#6366F1"]
  let h = 0
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) & 0xff
  return palette[h % palette.length]
}
function InitialsAvatar({ initials, size = 22, color }: { initials: string; size?: number; color?: string }) {
  const bg = color ?? avatarColorFor(initials)
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        background: bg,
        width: size,
        height: size,
        fontSize: size <= 18 ? 9 : 10,
        letterSpacing: "-0.01em",
      }}
    >
      {initials}
    </span>
  )
}

// ── Guided action bar (stepper + botao + hint) ───────────────────────────────
const FLOW: Array<ProductivityTask["status"]> = ["pending", "progress", "review", "done"]
const FLOW_LABELS: Record<ProductivityTask["status"], string> = {
  pending: "Pendente",
  progress: "Em andamento",
  review: "Em revisão",
  done: "Concluída",
}
function GuidedActionBar({
  task,
  onAdvance,
}: {
  task: TaskAugmented
  onAdvance: (next: ProductivityTask["status"]) => void
}) {
  const cur = task.status
  const curIdx = FLOW.indexOf(cur)
  const stepCfg: Record<
    ProductivityTask["status"],
    { label: string; hint: string; next: ProductivityTask["status"]; color: string; hover: string; icon: (p?: IconProps) => React.ReactNode; done?: boolean }
  > = {
    pending: {
      label: "Iniciar tarefa",
      hint: "Quando você começar a trabalhar, marque pra começar a contar o tempo.",
      next: "progress",
      color: C.brandBlue,
      hover: "#1A2BA0",
      icon: I.play,
    },
    progress: {
      label: "Marcar pronta pra revisão",
      hint: "Concluiu sua parte? Avise o time pra revisar antes de entregar.",
      next: "review",
      color: C.purple,
      hover: "#9333EA",
      icon: I.eye,
    },
    review: {
      label: "Entregar e concluir",
      hint: "Tudo aprovado? Marca como concluída e a próxima tarefa do fluxo é liberada automaticamente.",
      next: "done",
      color: C.green,
      hover: "#059669",
      icon: I.rocket,
    },
    done: {
      label: "Reabrir tarefa",
      hint: "Essa tarefa já foi concluída e a próxima do fluxo foi liberada.",
      next: "progress",
      color: "#4B5563",
      hover: "#374151",
      icon: I.history,
      done: true,
    },
  }
  const step = stepCfg[cur]

  return (
    <div
      className="rounded-[10px] p-3.5 border"
      style={{
        background: step.done ? C.greenBg : "#FFFFFF",
        borderColor: step.done ? C.greenBorder : "rgba(0,0,0,0.06)",
        boxShadow: step.done ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Stepper */}
      <div className="flex items-center mb-2.5">
        {FLOW.map((s, i) => {
          const isDone = i < curIdx
          const isCurrent = i === curIdx
          const isLast = i === FLOW.length - 1
          return (
            <div key={s} className={cn("flex items-center", isLast ? "flex-none" : "flex-1")}>
              <div className="flex flex-col items-center gap-1 min-w-[60px] shrink-0">
                <div
                  className="flex items-center justify-center rounded-full text-white transition-all"
                  style={{
                    width: isCurrent ? 22 : 18,
                    height: isCurrent ? 22 : 18,
                    background: isDone ? C.green : isCurrent ? step.color : "#FFFFFF",
                    border: isDone || isCurrent ? "none" : "1.5px solid #D1D5DB",
                    boxShadow: isCurrent ? `0 0 0 4px ${step.color}1A` : "none",
                  }}
                >
                  {isDone ? (
                    I.check({ size: 11, strokeWidth: 3 })
                  ) : isCurrent ? (
                    <span className="h-[7px] w-[7px] rounded-full bg-white" />
                  ) : (
                    <span className="h-[5px] w-[5px] rounded-full bg-gray-300" />
                  )}
                </div>
                <span
                  className="text-[10px] whitespace-nowrap"
                  style={{
                    fontWeight: isCurrent ? 700 : 500,
                    color: isDone ? C.greenText : isCurrent ? step.color : "#9CA3AF",
                  }}
                >
                  {FLOW_LABELS[s]}
                </span>
              </div>
              {!isLast && (
                <div
                  className="flex-1 h-[2px] -mt-[18px] transition-colors"
                  style={{ background: isDone ? C.green : "#E5E7EB" }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Action card */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
        style={{ background: step.done ? "transparent" : "#FCFCFD" }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-gray-900 mb-0.5 leading-tight">
            {step.done ? "Tarefa concluída ✓" : `Próximo passo: ${step.label.toLowerCase()}`}
          </div>
          <div className="text-[11px] text-gray-600 leading-snug">{step.hint}</div>
        </div>
        <button
          onClick={() => onAdvance(step.next)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-[12.5px] font-semibold shrink-0 transition-all hover:-translate-y-px"
          style={{
            background: step.color,
            boxShadow: `0 1px 2px ${step.color}40, 0 4px 12px ${step.color}24`,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = step.hover
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = step.color
          }}
        >
          {step.icon({ size: 13, strokeWidth: 2 })} {step.label}
        </button>
      </div>
    </div>
  )
}

// ── Time tracking control ────────────────────────────────────────────────────
function TimeTracking({
  spent,
  running,
  onToggle,
}: {
  spent: string
  running: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 rounded-lg border"
      style={{
        background: running ? C.brandBlue50 : "#F8FAFC",
        borderColor: running ? C.brandBlue100 : "rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: running ? C.brandBlue : "#6B7280" }} className="flex">
          {I.clock({ size: 14 })}
        </span>
        <span
          className="text-[12px] font-medium"
          style={{ color: running ? C.brandBlue : "#374151" }}
        >
          Time tracking
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-[14px] font-bold font-mono tabular-nums tracking-tight"
          style={{ color: running ? C.brandBlue : "#111827" }}
        >
          {spent}
        </span>
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{
            background: running ? C.brandBlue : "#FFFFFF",
            color: running ? "#FFFFFF" : C.brandBlue,
            border: running ? "none" : `1px solid ${C.brandBlue}`,
          }}
        >
          {running
            ? I.pause({ size: 11, strokeWidth: 2 })
            : I.play({ size: 11, strokeWidth: 2 })}
        </button>
      </div>
    </div>
  )
}

// ── Deliverable row ──────────────────────────────────────────────────────────
function deliverableStatus(d: Deliverable): {
  label: string
  color: string
  dot: string
  bg: string
} {
  // Status deriva PURAMENTE do preenchimento:
  //  - vazio → "A fazer"
  //  - preenchido (value ou file_url) → "Pronto"
  // Antes existia cycle manual via metadata.status — removido pra eliminar
  // dessync entre "status manual" e "tem conteudo de fato".
  const hasContent = !!d.value || !!d.file_url
  if (hasContent) {
    return { label: "Pronto", color: C.greenText, dot: C.green, bg: C.greenBg }
  }
  return { label: "A fazer", color: "#4B5563", dot: "#9CA3AF", bg: "#F3F4F6" }
}
function DeliverableRow({ d, onClick }: { d: Deliverable; onClick: () => void }) {
  const st = deliverableStatus(d)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-white border rounded-[7px] hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer text-left"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
      title="Clique pra preencher o entregavel"
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: st.dot }} />
      <span className="flex-1 text-[12.5px] font-medium text-gray-900 truncate -tracking-[0.005em]">
        {d.field_label}
        {d.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <span
        className="text-[10px] font-semibold rounded-full px-2 py-0.5"
        style={{ color: st.color, background: st.bg }}
      >
        {st.label}
      </span>
    </button>
  )
}

// ── Checklist row ───────────────────────────────────────────────────────────
function ChecklistRowComp({
  item,
  member,
  onToggle,
}: {
  item: ChecklistItem
  member: Member | null
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-50 transition-colors"
    >
      <div
        className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
        style={{
          background: item.is_completed ? C.brandBlue : "#FFFFFF",
          border: `1.5px solid ${item.is_completed ? C.brandBlue : "#D1D5DB"}`,
        }}
      >
        {item.is_completed && (
          <span className="text-white">{I.check({ size: 11, strokeWidth: 3 })}</span>
        )}
      </div>
      <span
        className={cn(
          "flex-1 text-[12.5px] leading-snug",
          item.is_completed
            ? "text-gray-400 line-through"
            : "text-gray-900",
        )}
      >
        {item.title}
      </span>
      {member && <InitialsAvatar initials={member.initials} size={18} />}
    </div>
  )
}

// ── Attachment row ──────────────────────────────────────────────────────────
function getAttachmentIcon(name: string, kind?: string): {
  Icon: (p?: IconProps) => React.ReactNode
  color: string
  bg: string
} {
  const lower = (name || "").toLowerCase()
  if (kind === "figma" || lower.includes("figma"))
    return { Icon: I.figma, color: C.purple, bg: "#F3E8FF" }
  if (lower.endsWith(".pdf")) return { Icon: I.doc, color: C.red, bg: "#FEE2E2" }
  if (kind === "link" || /^https?:\/\//.test(name))
    return { Icon: I.link, color: "#6B7280", bg: "#F3F4F6" }
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp)$/.test(lower))
    return { Icon: I.doc, color: C.purple, bg: "#F3E8FF" }
  return { Icon: I.doc, color: "#3B82F6", bg: "#DBEAFE" }
}
function AttachmentRow({
  name,
  url,
  size,
  isLink,
  kind,
}: {
  name: string
  url?: string
  size?: string
  isLink: boolean
  kind?: string
}) {
  const ic = getAttachmentIcon(name, kind)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-2.5 py-2 bg-white border rounded-[7px] hover:bg-gray-50 transition-colors group"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: ic.bg, color: ic.color }}
      >
        {ic.Icon({ size: 14, strokeWidth: 1.75 })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-gray-900 truncate">{name}</div>
        {size && (
          <div className="text-[10px] text-gray-500 font-mono mt-px">{size}</div>
        )}
        {!size && url && isLink && (
          <div className="text-[10px] text-gray-500 font-mono mt-px truncate">
            {(() => {
              try {
                return new URL(url).hostname.replace("www.", "") + new URL(url).pathname
              } catch {
                return url
              }
            })()}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 shrink-0"
      >
        {isLink ? I.external({ size: 13 }) : I.download({ size: 13 })}
      </button>
    </a>
  )
}

// ── Comment row ─────────────────────────────────────────────────────────────
function CommentRowComp({
  author,
  initials,
  time,
  content,
}: {
  author: string
  initials: string
  time: string
  content: string
}) {
  return (
    <div className="flex gap-2.5 py-2.5">
      <InitialsAvatar initials={initials} size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-[12px] font-semibold text-gray-900">{author}</span>
          <span className="text-[10px] text-gray-400 font-mono">{time}</span>
        </div>
        <div className="text-[12.5px] text-gray-700 leading-[1.55] break-words">
          {content}
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export function TaskDetailDrawer({
  task,
  onClose,
}: {
  task: TaskAugmented
  onClose: () => void
}) {
  const { apiAction, members, profile, fetchData } = useProductivityStore()
  const memberList = members as Member[]

  const [running, setRunning] = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)
  const [prioMenu, setPrioMenu] = useState(false)
  const [assigneeMenu, setAssigneeMenu] = useState(false)

  // Click-outside fecha todos os dropdowns de meta (delegacao no document)
  useEffect(() => {
    if (!statusMenu && !prioMenu && !assigneeMenu) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // Se nao clicou dentro de .drawer-meta-dropdown, fecha
      if (!t.closest("[data-meta-dropdown]")) {
        setStatusMenu(false)
        setPrioMenu(false)
        setAssigneeMenu(false)
      }
    }
    // Delay pra nao fechar no mesmo click que abriu
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handler)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", handler)
    }
  }, [statusMenu, prioMenu, assigneeMenu])
  const [dateEdit, setDateEdit] = useState(false)
  const [dateValue, setDateValue] = useState("")
  const [estEdit, setEstEdit] = useState(false)
  const [estValue, setEstValue] = useState("")
  const [addingChk, setAddingChk] = useState(false)
  const [chkInput, setChkInput] = useState("")
  const [addingLink, setAddingLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkLabel, setLinkLabel] = useState("")
  const [addingDeliv, setAddingDeliv] = useState(false)
  const [delivLabel, setDelivLabel] = useState("")
  const [editingDeliv, setEditingDeliv] = useState<Deliverable | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timerSec, setTimerSec] = useState(0)
  const [comment, setComment] = useState("")
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState(task.description ?? "")
  const [showToast, setShowToast] = useState<string | null>(null)

  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Timer simples (local) — quando ativo conta segundos
  useEffect(() => {
    if (!running) return
    const i = setInterval(() => setTimerSec((s) => s + 1), 1000)
    return () => clearInterval(i)
  }, [running])

  // Toast auto-dismiss
  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(null), 4000)
    return () => clearTimeout(t)
  }, [showToast])

  // Sidebar interna (modo enriched para tasks de onboarding)
  const [enrichedSection, setEnrichedSection] = useState<SidebarSection>("visao-geral")

  const formatTimer = () => {
    const min = Math.floor(timerSec / 60)
    const sec = timerSec % 60
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  const meta = task.metadata ?? {}
  const clientName = (meta.client_name as string) ?? (meta.store_name as string) ?? null
  const stageName = (meta.column_name as string) ?? null
  const stageColor = (meta.stage_color as string) ?? C.brandBlueLight
  const isOnboarding = task.source_type === "onboarding"
  // Tasks vivem em `tasks` table quando tem source_type (onboarding ou manual)
  // OU tem onboarding_id. Essas usam endpoint /api/tasks/[id] e ganham
  // todas as features (checklist, deliverables, anexos, comentarios).
  const isInTasksTable =
    !!task.source_type || !!task.onboarding_id
  const isOverdue = false // pode derivar de due_date depois

  // Mapeia status do board (pending/progress/review/done) pro status real
  // do banco (pending/in_progress/in_review/completed). O store usa o
  // shorthand do board mas a tabela `tasks` usa o nome completo.
  const STATUS_TO_DB: Record<string, string> = {
    pending: "pending",
    progress: "in_progress",
    review: "in_review",
    done: "completed",
  }

  // updateTaskField: roteia atualizacao pra tabela correta com base em
  // source_type. Onboarding tasks vivem em `tasks`; legacy em
  // `productivity_tasks`. Sem isso o UPDATE afeta 0 rows e fetchData
  // recarrega o estado antigo (causa o 'reset' do botao Iniciar).
  const updateTaskField = async (
    fields: Record<string, unknown>,
    optimistic?: Partial<ProductivityTask>,
  ) => {
    if (isInTasksTable) {
      // Traduz campos do shape do store pro shape do endpoint /api/tasks
      const body: Record<string, unknown> = {}
      if (fields.status !== undefined) {
        body.status = STATUS_TO_DB[fields.status as string] ?? fields.status
      }
      if (fields.priority !== undefined) {
        // 1=urgent, 2=high, 3=medium, 4=low
        const map: Record<number, string> = {
          1: "urgent",
          2: "high",
          3: "medium",
          4: "low",
        }
        body.priority = map[fields.priority as number] ?? "medium"
      }
      if (fields.title !== undefined) body.title = fields.title
      if (fields.description !== undefined) body.description = fields.description
      if (fields.due_date !== undefined) body.due_date = fields.due_date
      if (fields.assignee_id !== undefined) body.assignee_id = fields.assignee_id
      if (fields.sla_hours !== undefined) body.sla_hours = fields.sla_hours
      try {
        await fetch(`/api/tasks/${task.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } catch (e) {
        console.error("[drawer] PUT task failed", e)
      }
    } else {
      // Legacy: productivity_tasks via store
      await apiAction("update_task", { id: task.id, ...fields })
    }
    // Optimistic UI: store atualiza local pra UI nao 'piscar' enquanto
    // fetchData traz state novo.
    if (optimistic) {
      const updateTasks = (tasks: ProductivityTask[]) =>
        tasks.map((t) => (t.id === task.id ? { ...t, ...optimistic } : t))
      const state = useProductivityStore.getState()
      useProductivityStore.setState({
        tasks: updateTasks(state.tasks),
        groups: state.groups.map((g) => ({ ...g, items: updateTasks(g.items) })),
      })
    }
    fetchData()
  }

  const handleAdvance = async (next: ProductivityTask["status"]) => {
    // Optimistic UI primeiro pro botao nao 'piscar'
    await updateTaskField({ status: next }, { status: next })
    if (next === "progress" && !running) setRunning(true)
    if (next === "done") {
      setRunning(false)
      if (isOnboarding) {
        try {
          await fetch(`/api/tasks/${task.id}/complete`, { method: "POST" })
          setShowToast("Próxima tarefa do fluxo foi liberada automaticamente.")
        } catch {
          setShowToast("Tarefa concluída!")
        }
      } else {
        setShowToast("Tarefa concluída!")
      }
    }
  }

  const saveDesc = () => {
    if (desc !== (task.description ?? "")) {
      updateTaskField({ description: desc })
    }
    setEditingDesc(false)
  }

  const sendComment = async () => {
    if (!comment.trim()) return
    await apiAction("add_comment", { task_id: task.id, text: comment.trim() })
    setComment("")
  }

  // cycleDeliverable removido — agora o click no card abre modal de
  // preenchimento (DeliverableEditModal) e o status deriva do conteudo.

  const addDeliverable = async () => {
    const label = delivLabel.trim()
    if (!label) return
    // Slug derivado do label (lowercase, sem acento, alfanum + underscore)
    const slug = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || `deliverable_${Date.now()}`
    try {
      const res = await fetch(`/api/tasks/${task.id}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_slug: slug,
          field_label: label,
          field_type: "text",
          required: false,
        }),
      })
      if (res.ok) {
        setDelivLabel("")
        setAddingDeliv(false)
        setShowToast("Entregável adicionado.")
        fetchData()
      } else {
        const body = await res.json().catch(() => ({}))
        setShowToast(
          `Falha: ${body.error?.message ?? body.error ?? res.statusText}`,
        )
      }
    } catch (e) {
      setShowToast(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const toggleChecklist = async (item: ChecklistItem) => {
    try {
      await fetch(`/api/tasks/${task.id}/checklists`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: item.id,
          is_completed: !item.is_completed,
        }),
      })
      fetchData()
    } catch {
      /* noop */
    }
  }

  const addChecklistItem = async () => {
    const title = chkInput.trim()
    if (!title) {
      setAddingChk(false)
      return
    }
    try {
      await fetch(`/api/tasks/${task.id}/checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      setChkInput("")
      setAddingChk(false)
      setShowToast("Subtarefa adicionada.")
      fetchData()
    } catch {
      /* noop */
    }
  }

  const addLink = async () => {
    const url = linkUrl.trim()
    if (!url) {
      setAddingLink(false)
      return
    }
    const normalized = url.startsWith("http") ? url : `https://${url}`
    const newLink = { url: normalized, label: linkLabel.trim() || undefined }
    // IMPORTANTE: o GET do board injeta campos UI dentro de metadata
    // (client_name, store_name, column_name, stage_color, stage_role).
    // Esses campos NAO devem voltar pro banco — filtramos antes do PUT
    // pra preservar so o metadata real da task (deliverables, attachments,
    // links, etc).
    const UI_KEYS = ["client_name", "store_name", "column_name", "stage_color", "stage_role"]
    const cleanMeta = Object.fromEntries(
      Object.entries(task.metadata ?? {}).filter(([k]) => !UI_KEYS.includes(k)),
    )
    const newMeta = {
      ...cleanMeta,
      links: [...(task.links ?? []), newLink],
    }
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: newMeta }),
      })
      setLinkUrl("")
      setLinkLabel("")
      setAddingLink(false)
      setShowToast("Link adicionado.")
      fetchData()
    } catch {
      /* noop */
    }
  }

  const fetchHistory = async () => {
    if (history !== null) return
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`)
      if (res.ok) {
        const json = await res.json()
        const data = json.data ?? json
        setHistory((data.history ?? []) as Array<Record<string, unknown>>)
      }
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const archiveTask = async () => {
    if (!confirm("Arquivar essa tarefa? Ela some do board mas pode ser recuperada.")) return
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })
      setShowMore(false)
      onClose()
    } catch {
      /* noop */
    }
  }

  const duplicateTask = async () => {
    try {
      await fetch(`/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${task.name} (cópia)`,
          description: task.description ?? "",
          priority: task.priority,
          onboarding_id: task.onboarding_id,
          operational_column_id: (task as TaskAugmented & { operational_column_id?: string }).operational_column_id,
          status: "pending",
        }),
      })
      setShowMore(false)
      setShowToast("Tarefa duplicada.")
    } catch {
      /* noop */
    }
  }

  const deleteTask = async () => {
    if (!confirm("Excluir essa tarefa permanentemente? Esta ação não pode ser desfeita.")) return
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" })
      setShowMore(false)
      onClose()
    } catch {
      /* noop */
    }
  }

  const deliverables = task.deliverables ?? []
  const checklist = task.checklist ?? []
  const attachments = task.attachments ?? []
  const links = task.links ?? []
  const taskComments = task.task_comments ?? []
  const briefing = (() => {
    if (!task.description) return null
    const lines = task.description.split("\n").map((l) => l.trim()).filter(Boolean)
    return lines.length > 1 ? lines : null
  })()

  const profName = profile?.name ?? "Eu"
  const profInitials = profName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()

  return (
    <>
      <DrawerStyles />
      {/* Backdrop — opacity leve, sem blur forte */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-gray-900/15 z-[50]"
        style={{ animation: "drawer-backdrop-in 150ms ease" }}
      />
      {/* Drawer — largura expandida em onboarding pra acomodar sidebar */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 max-w-[96vw] bg-white shadow-2xl z-[51] overflow-hidden flex flex-col",
          isOnboarding ? "w-[1100px]" : "w-[760px] overflow-y-auto",
        )}
        style={{ animation: "drawer-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Top bar — breadcrumb + actions */}
        <div className="sticky top-0 z-[5] bg-white border-b px-5 py-2.5 flex justify-between items-center" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 min-w-0">
            <span className="text-gray-400 flex">{I.folder({ size: 13 })}</span>
            <span className="font-semibold text-gray-700">Projetos</span>
            {clientName && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-gray-700 truncate">
                  Onboarding · {clientName}
                </span>
              </>
            )}
            {stageName && (
              <>
                <span className="text-gray-300">/</span>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    color: stageColor,
                    background: `${stageColor}26`,
                  }}
                >
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ background: stageColor }}
                  />
                  {stageName}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-1 shrink-0 relative">
            <button
              onClick={() => {
                setShowHistory(!showHistory)
                setShowMore(false)
                if (!showHistory) fetchHistory()
              }}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                showHistory
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
              )}
              title="Histórico"
            >
              {I.history({ size: 13 })}
            </button>
            <button
              onClick={() => {
                setShowMore(!showMore)
                setShowHistory(false)
              }}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                showMore
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
              )}
            >
              {I.more({ size: 13 })}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Fechar"
            >
              {I.close({ size: 13 })}
            </button>

            {/* History dropdown */}
            {showHistory && (
              <div
                className="absolute top-full right-0 mt-1.5 w-[340px] bg-white border rounded-lg shadow-xl z-20 max-h-[400px] overflow-auto"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
              >
                <div className="px-3 py-2 border-b text-[11px] font-bold uppercase tracking-wider text-gray-700" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  Histórico da tarefa
                </div>
                {historyLoading && (
                  <div className="px-3 py-4 text-[12px] text-gray-400 text-center italic">
                    Carregando…
                  </div>
                )}
                {!historyLoading && history && history.length === 0 && (
                  <div className="px-3 py-4 text-[12px] text-gray-400 text-center italic">
                    Nenhum evento registrado.
                  </div>
                )}
                {!historyLoading && history && history.length > 0 && (
                  <div className="py-1">
                    {history.map((h, i) => {
                      const created = String(h.created_at ?? "")
                      const action = String(h.action ?? h.event_type ?? "atualizou")
                      const desc = String(h.description ?? h.detail ?? "")
                      return (
                        <div key={i} className="px-3 py-2 border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-gray-900">
                              {action}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {created ? timeAgo(created) : "—"}
                            </span>
                          </div>
                          {desc && (
                            <div className="text-[11.5px] text-gray-600 mt-0.5 leading-snug">
                              {desc}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* More dropdown */}
            {showMore && (
              <div
                className="absolute top-full right-0 mt-1.5 w-[200px] bg-white border rounded-lg shadow-xl z-20 py-1"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
              >
                <button
                  onClick={duplicateTask}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="text-gray-400">{I.doc({ size: 13 })}</span>
                  Duplicar tarefa
                </button>
                <button
                  onClick={archiveTask}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="text-gray-400">{I.history({ size: 13 })}</span>
                  Arquivar
                </button>
                <div className="border-t my-1" style={{ borderColor: "rgba(0,0,0,0.06)" }} />
                <button
                  onClick={deleteTask}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <span>{I.close({ size: 13 })}</span>
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Layout horizontal (sidebar + content) quando onboarding */}
        <div className={isOnboarding ? "flex flex-1 min-h-0 overflow-hidden" : "contents"}>
          {isOnboarding && (
            <TaskPanelSidebar
              active={enrichedSection}
              onChange={(id) => {
                setEnrichedSection(id)
                const el = document.getElementById(`task-section-${id}`)
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
              groups={[
                {
                  label: "Execução",
                  items: [
                    { id: "criterios", label: "Critérios" },
                    { id: "checklist", label: "Checklist interno" },
                    { id: "entregaveis", label: "Entregáveis" },
                  ],
                },
                {
                  label: "Contexto",
                  items: [
                    { id: "visao-geral", label: "Visão geral" },
                    { id: "sobre-cliente", label: "Sobre o cliente" },
                    { id: "brand-brain", label: "Brand Brain", badge: { value: "IA", tone: "purple" } },
                    { id: "assets-visuais", label: "Assets visuais" },
                  ],
                },
                {
                  label: "Acompanhamento",
                  items: [
                    { id: "comentarios", label: "Comentários" },
                    { id: "historico", label: "Histórico" },
                    { id: "anotacoes", label: "Anotações pessoais" },
                  ],
                },
              ]}
              progressPct={(() => {
                const items = (task.checklist ?? []) as Array<{ is_completed?: boolean }>
                if (items.length === 0) return 0
                const done = items.filter((i) => i.is_completed).length
                return Math.round((done / items.length) * 100)
              })()}
              subtasksLabel={(() => {
                const items = (task.checklist ?? []) as Array<{ is_completed?: boolean }>
                const done = items.filter((i) => i.is_completed).length
                return `${done}/${items.length} sub-tasks`
              })()}
            />
          )}
        <div className={isOnboarding ? "flex-1 overflow-y-auto" : "contents"}>
        {/* ── EXECUCAO no topo (Criterios + Sugestoes IA antes do body) ── */}
        {isOnboarding && (
          <div id="task-section-criterios" className="px-5 pt-5">
            <BlockCriteriosAceitacao taskId={task.id} />
          </div>
        )}
        {/* Body da task (title/status/properties/descricao/checklist/entregaveis/anexos)
            renderiza logo abaixo. CONTEXTO (visao-geral/sobre-cliente/brand-brain/
            assets-visuais) foi movido pra DEPOIS do body — vide bloco mais abaixo
            antes de Comentarios. */}

        {/* Title + status + properties */}
        <div id="task-section-checklist" className="px-6 pt-5 pb-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <h1 className="text-[20px] font-bold text-gray-900 m-0 leading-tight tracking-tight mb-3.5">
            {task.name}
          </h1>

          <div className="mb-4">
            <GuidedActionBar task={task} onAdvance={handleAdvance} />
          </div>

          <div className="flex flex-col">
            {/* Status (editavel) */}
            <PropertyRow icon={I.bolt({ size: 13 })} label="Status">
              <div className="relative" data-meta-dropdown>
                <button
                  onClick={() => {
                    setStatusMenu(!statusMenu)
                    setPrioMenu(false)
                    setAssigneeMenu(false)
                  }}
                  className="inline-flex items-center bg-transparent border-none cursor-pointer rounded hover:bg-gray-50 px-1 py-0.5 -ml-1"
                >
                  <StatusBadgeBig status={task.status} />
                </button>
                {statusMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 z-30 bg-white border rounded-lg shadow-xl py-1 min-w-[180px]"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  >
                    {(["pending", "progress", "review", "done"] as const).map((st) => {
                      const cfg: Record<string, { label: string; color: string }> = {
                        pending: { label: "Pendente", color: "#9CA3AF" },
                        progress: { label: "Em andamento", color: C.brandBlue },
                        review: { label: "Em revisão", color: C.purple },
                        done: { label: "Concluído", color: C.green },
                      }
                      const c = cfg[st]
                      return (
                        <button
                          key={st}
                          onClick={() => {
                            updateTaskField({ status: st }, { status: st })
                            setStatusMenu(false)
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </PropertyRow>

            {/* Prioridade (editavel) */}
            <PropertyRow icon={I.alert({ size: 13 })} label="Prioridade">
              <div className="relative" data-meta-dropdown>
                <button
                  onClick={() => {
                    setPrioMenu(!prioMenu)
                    setStatusMenu(false)
                    setAssigneeMenu(false)
                  }}
                  className="inline-flex items-center bg-transparent border-none cursor-pointer rounded hover:bg-gray-50 px-1 py-0.5 -ml-1"
                >
                  <PrioDot priority={task.priority} />
                </button>
                {prioMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 z-30 bg-white border rounded-lg shadow-xl py-1 min-w-[140px]"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  >
                    {([1, 2, 3, 4] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          updateTaskField({ priority: p }, { priority: p })
                          setPrioMenu(false)
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <PrioDot priority={p} />
                        <span>{PRIO[p].label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PropertyRow>

            {/* Responsavel (editavel) */}
            <PropertyRow icon={I.users({ size: 13 })} label="Responsável">
              <div className="relative" data-meta-dropdown>
                <button
                  onClick={() => {
                    setAssigneeMenu(!assigneeMenu)
                    setStatusMenu(false)
                    setPrioMenu(false)
                  }}
                  className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer rounded hover:bg-gray-50 px-1 py-0.5 -ml-1"
                >
                  {task.people[0] ? (
                    <>
                      <InitialsAvatar initials={task.people[0]} size={20} />
                      <span className="text-[12px] font-medium text-gray-900">
                        {memberList.find((m) => m.initials === task.people[0])?.name ?? task.people[0]}
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] text-gray-400">+ Atribuir</span>
                  )}
                </button>
                {assigneeMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 z-30 bg-white border rounded-lg shadow-xl py-1 min-w-[220px] max-h-[260px] overflow-auto"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  >
                    {memberList.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-gray-400">Nenhum membro</div>
                    ) : (
                      <>
                        {task.people[0] && (
                          <button
                            onClick={() => {
                              updateTaskField(
                                { assignee_id: null, assigned_to: [] },
                                { people: [] },
                              )
                              setAssigneeMenu(false)
                            }}
                            className="w-full text-left px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 flex items-center gap-2 border-b"
                            style={{ borderColor: "rgba(0,0,0,0.06)" }}
                          >
                            <span className="text-base">×</span> Desatribuir
                          </button>
                        )}
                        {memberList.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              updateTaskField(
                                { assignee_id: m.id, assigned_to: [m.initials] },
                                { people: [m.initials] },
                              )
                              setAssigneeMenu(false)
                            }}
                            className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <InitialsAvatar initials={m.initials} size={20} />
                            <span>{m.name}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </PropertyRow>

            {clientName && (
              <PropertyRow icon={I.store({ size: 13 })} label="Cliente">
                <span
                  className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full"
                  style={{ background: `${stageColor}1F` }}
                >
                  <InitialsAvatar
                    initials={clientName.substring(0, 2).toUpperCase()}
                    size={18}
                    color={stageColor}
                  />
                  <span className="text-[11px] font-semibold text-gray-900">
                    {clientName}
                  </span>
                </span>
              </PropertyRow>
            )}

            {/* Data (editavel) */}
            <PropertyRow icon={I.cal({ size: 13 })} label="Data">
              {dateEdit ? (
                <input
                  type="date"
                  autoFocus
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  onBlur={() => {
                    if (dateValue) {
                      const iso = new Date(dateValue + "T23:59:59").toISOString()
                      updateTaskField({ due_date: iso }, {
                        date: new Date(dateValue + "T00:00:00").toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        }),
                      })
                    }
                    setDateEdit(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    if (e.key === "Escape") setDateEdit(false)
                  }}
                  className="text-[12px] font-mono px-1.5 py-0.5 border rounded outline-none focus:border-blue-500"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                />
              ) : (
                <button
                  onClick={() => {
                    setDateEdit(true)
                    setDateValue("")
                  }}
                  className="text-[12px] font-medium font-mono tabular-nums bg-transparent border-none cursor-pointer rounded hover:bg-gray-50 px-1 py-0.5 -ml-1"
                  style={{ color: isOverdue ? C.amberText : "#111827" }}
                >
                  {task.date || "+ Definir data"}
                </button>
              )}
            </PropertyRow>

            {/* Estimativa (editavel) */}
            <PropertyRow icon={I.clock({ size: 13 })} label="Estimativa">
              {estEdit ? (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    autoFocus
                    min={0}
                    placeholder="min"
                    value={estValue}
                    onChange={(e) => setEstValue(e.target.value)}
                    onBlur={() => {
                      const minutes = parseInt(estValue, 10)
                      if (!isNaN(minutes) && minutes > 0) {
                        const hours = minutes / 60
                        updateTaskField({ sla_hours: hours, estimated_minutes: minutes }, {
                          estimatedTime: `${minutes}m`,
                        })
                      }
                      setEstEdit(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                      if (e.key === "Escape") setEstEdit(false)
                    }}
                    className="text-[12px] font-mono px-1.5 py-0.5 border rounded outline-none focus:border-blue-500 w-20"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  />
                  <span className="text-[11px] text-gray-400">minutos</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEstEdit(true)
                    setEstValue("")
                  }}
                  className="text-[12px] font-medium font-mono tabular-nums text-gray-900 bg-transparent border-none cursor-pointer rounded hover:bg-gray-50 px-1 py-0.5 -ml-1"
                >
                  {task.estimatedTime || "+ Estimar"}
                </button>
              )}
            </PropertyRow>
          </div>

          {/* Time tracking */}
          <div className="mt-3">
            <TimeTracking
              spent={formatTimer()}
              running={running}
              onToggle={() => setRunning(!running)}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-4 pb-8">
          {/* Descricao */}
          <Section
            title="Descrição"
            action={
              <button
                onClick={() => setEditingDesc(true)}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                {I.edit({ size: 12 })}
              </button>
            }
          >
            {editingDesc ? (
              <div>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full min-h-[80px] rounded-lg border px-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:border-blue-500 resize-y"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveDesc}
                    className="text-[11px] font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setDesc(task.description ?? "")
                      setEditingDesc(false)
                    }}
                    className="text-[11px] text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : task.description ? (
              <div
                className="px-3 py-2.5 rounded-lg border text-[12.5px] text-gray-700 leading-[1.6]"
                style={{
                  background: "#FCFCFD",
                  borderColor: "rgba(0,0,0,0.06)",
                }}
              >
                {task.description.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-1" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setEditingDesc(true)}
                className="w-full px-3 py-2.5 text-left rounded-lg border border-dashed text-[12.5px] text-gray-400 hover:border-gray-400 transition-colors"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              >
                Clique para adicionar descrição…
              </button>
            )}
          </Section>

          {/* Briefing — so quando descricao tem multiplas linhas (vem do template) */}
          {isOnboarding && briefing && (
            <Section
              title="Briefing da etapa"
              action={
                <span
                  className="text-[10px] font-semibold inline-flex items-center gap-1 font-mono"
                  style={{ color: C.brandBlue }}
                >
                  {I.bolt({ size: 10 })} AUTOMÁTICO
                </span>
              }
            >
              <div
                className="px-3.5 py-3 rounded-r-lg text-[12.5px] text-gray-800 leading-[1.6]"
                style={{
                  background: C.brandBlue50,
                  borderLeft: `3px solid ${C.brandBlue}`,
                }}
              >
                <div
                  className="text-[11px] font-semibold mb-2 flex items-center gap-1.5 -tracking-[0.005em]"
                  style={{ color: C.brandBlue }}
                >
                  {I.sparkle({ size: 11, strokeWidth: 2 })}
                  Pontos-chave dessa etapa
                </div>
                <ul className="m-0 pl-[18px] flex flex-col gap-1.5 list-disc">
                  {briefing.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            </Section>
          )}

          {/* Entregaveis — sempre visivel (botao + Entregavel mesmo lista vazia) */}
          <div id="task-section-entregaveis" />
          <Section
            title={`Entregáveis · ${deliverables.filter((d) => deliverableStatus(d).label === "Pronto").length}/${deliverables.length}`}
            action={
              <button
                onClick={() => setAddingDeliv(true)}
                className="bg-transparent border-none cursor-pointer text-gray-500 text-[11px] font-medium inline-flex items-center gap-1 hover:text-gray-700"
              >
                {I.plus({ size: 11 })} Entregável
              </button>
            }
          >
            {deliverables.length === 0 && !addingDeliv && (
              <div className="text-[11.5px] italic text-gray-400 px-2 py-1">
                Nenhum entregável definido. Adicione o que precisa entregar
                pra concluir a tarefa.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {deliverables.map((d) => (
                <DeliverableRow
                  key={d.id}
                  d={d}
                  onClick={() => setEditingDeliv(d)}
                />
              ))}
              {addingDeliv && (
                <div
                  className="mt-1 p-3 rounded-lg border bg-blue-50/40 border-dashed border-blue-200"
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-2">
                    Novo entregável
                  </div>
                  <input
                    autoFocus
                    value={delivLabel}
                    onChange={(e) => setDelivLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && delivLabel.trim()) addDeliverable()
                      if (e.key === "Escape") {
                        setAddingDeliv(false)
                        setDelivLabel("")
                      }
                    }}
                    placeholder="Ex: Welcome Series (3 emails), Briefing aprovado..."
                    className="w-full px-2 py-1.5 rounded-md border text-[12.5px] mb-2 focus:outline-none focus:border-blue-500"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addDeliverable}
                      disabled={!delivLabel.trim()}
                      className="text-[11px] font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => {
                        setAddingDeliv(false)
                        setDelivLabel("")
                      }}
                      className="text-[11px] text-gray-500 hover:text-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Checklist */}
          {(checklist.length > 0 || addingChk) && (
            <Section
              title={`Checklist · ${checklist.filter((c) => c.is_completed).length}/${checklist.length}`}
              action={
                <button
                  onClick={() => setAddingChk(true)}
                  className="bg-transparent border-none cursor-pointer text-gray-500 text-[11px] font-medium inline-flex items-center gap-1 hover:text-gray-700"
                >
                  {I.plus({ size: 11 })} Subtarefa
                </button>
              }
            >
              <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${checklist.length > 0 ? (checklist.filter((c) => c.is_completed).length / checklist.length) * 100 : 0}%`,
                    background:
                      checklist.length > 0 &&
                      checklist.filter((c) => c.is_completed).length === checklist.length
                        ? C.green
                        : C.brandBlue,
                  }}
                />
              </div>
              <div className="flex flex-col">
                {checklist.map((item) => {
                  const m = item.completed_by
                    ? memberList.find((mm) => mm.id === item.completed_by) ?? null
                    : null
                  return (
                    <ChecklistRowComp
                      key={item.id}
                      item={item}
                      member={m}
                      onToggle={() => toggleChecklist(item)}
                    />
                  )
                })}
                {addingChk && (
                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-blue-50/40 border border-dashed border-blue-200 mt-1">
                    <div className="w-4 h-4 rounded border-[1.5px] border-gray-300 shrink-0" />
                    <input
                      autoFocus
                      value={chkInput}
                      onChange={(e) => setChkInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addChecklistItem()
                        if (e.key === "Escape") {
                          setAddingChk(false)
                          setChkInput("")
                        }
                      }}
                      onBlur={addChecklistItem}
                      placeholder="Nova subtarefa..."
                      className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Anexos & Links */}
          {(attachments.length > 0 || links.length > 0 || isInTasksTable) && (
            <Section
              title="Anexos & links"
              action={
                <button
                  onClick={() => setAddingLink(true)}
                  className="bg-transparent border-none cursor-pointer text-gray-500 text-[11px] font-medium inline-flex items-center gap-1 hover:text-gray-700"
                >
                  {I.paperclip({ size: 11 })} Anexar
                </button>
              }
            >
              {attachments.length === 0 && links.length === 0 && !addingLink ? (
                <div className="text-[11.5px] italic text-gray-400 px-2">
                  Nenhum anexo ou link adicionado ainda.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {attachments.map((a, i) => (
                    <AttachmentRow
                      key={`att-${i}`}
                      name={a.name ?? a.file_name ?? "arquivo"}
                      url={a.url ?? a.file_url}
                      size={formatBytes(a.size ?? a.file_size_bytes)}
                      isLink={false}
                      kind={a.kind}
                    />
                  ))}
                  {links.map((l, i) => (
                    <AttachmentRow
                      key={`link-${i}`}
                      name={l.label ?? l.url}
                      url={l.url}
                      isLink
                    />
                  ))}
                </div>
              )}
              {addingLink && (
                <div
                  className="mt-2 p-3 rounded-lg border bg-white"
                  style={{ borderColor: "rgba(0,0,0,0.06)" }}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-2">
                    Adicionar link
                  </div>
                  <input
                    autoFocus
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addLink()
                      if (e.key === "Escape") {
                        setAddingLink(false)
                        setLinkUrl("")
                        setLinkLabel("")
                      }
                    }}
                    placeholder="URL (ex: figma.com/file/abc)"
                    className="w-full px-2 py-1.5 rounded-md border text-[12.5px] mb-2 focus:outline-none focus:border-blue-500"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  />
                  <input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addLink()
                    }}
                    placeholder="Rótulo (opcional)"
                    className="w-full px-2 py-1.5 rounded-md border text-[12.5px] mb-2 focus:outline-none focus:border-blue-500"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addLink}
                      className="text-[11px] font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => {
                        setAddingLink(false)
                        setLinkUrl("")
                        setLinkLabel("")
                      }}
                      className="text-[11px] text-gray-500 hover:text-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Comentarios — logo apos Anexos & Links, encerra o body da task */}
          <div id="task-section-comentarios" />
          <Section title={`Comentários · ${taskComments.length}`}>
            {taskComments.length === 0 && (
              <div
                className="text-center px-3 py-4 text-[12px] italic text-gray-400 rounded-lg mb-2"
                style={{ background: "#FCFCFD" }}
              >
                Nenhum comentário ainda
              </div>
            )}
            {taskComments.length > 0 && (
              <div className="mb-2.5">
                {taskComments.map((c) => {
                  const name = c.profiles?.name ?? "Usuário"
                  const initials = name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase()
                  return (
                    <CommentRowComp
                      key={c.id}
                      author={name}
                      initials={initials}
                      time={timeAgo(c.created_at)}
                      content={c.content}
                    />
                  )
                })}
              </div>
            )}

            {/* Input */}
            <div
              className="flex items-start gap-2.5 p-2.5 bg-white border rounded-lg"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ background: "linear-gradient(135deg, #F97316, #EA580C)" }}
              >
                {profInitials}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendComment()
                }}
                placeholder="Escrever comentário..."
                className="flex-1 border-none outline-none text-[12.5px] text-gray-900 resize-none p-0.5 min-h-[24px] bg-transparent leading-[1.5]"
              />
              <button
                onClick={sendComment}
                disabled={!comment.trim()}
                className={cn(
                  "p-1.5 rounded-md flex transition-colors shrink-0",
                  comment.trim()
                    ? "bg-gray-900 text-white cursor-pointer hover:bg-gray-800"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed",
                )}
              >
                {I.send({ size: 13 })}
              </button>
            </div>
          </Section>
        </div>

        {/* ── CONTEXTO apos Comentarios ── */}
        {isOnboarding && (
          <div id="task-section-visao-geral" className="px-5 pt-5">
            <BlockIdentidadeLoja taskId={task.id} />
          </div>
        )}
        {isOnboarding && (
          <div id="task-section-sobre-cliente" className="px-5 pt-3">
            {/* Placeholder reservado para ancorar a navegação */}
          </div>
        )}
        {isOnboarding && (
          <div id="task-section-brand-brain" className="px-5 pt-3">
            <BlockBrandBrain taskId={task.id} />
          </div>
        )}
        {isOnboarding && (
          <div id="task-section-assets-visuais" className="px-5 pt-3 pb-3">
            <BlockAssetsVisuais taskId={task.id} />
          </div>
        )}

        {/* Blocos finais (acompanhamento: anotacoes + historico, so em onboarding).
            Sugestoes IA foi movido pra cima junto com Criterios (grupo Execucao). */}
        {isOnboarding && (
          <>
            <div id="task-section-anotacoes" className="px-5 pt-3 pb-3">
              <BlockAnotacoesPessoais taskId={task.id} />
            </div>
            <div id="task-section-historico" className="px-5 pt-3 pb-6">
              <BlockTimelineUnificada taskId={task.id} />
            </div>
          </>
        )}

        </div>{/* close flex-1 overflow-y-auto */}
        </div>{/* close flex flex-1 layout wrapper */}
      </div>

      {/* Toast */}
      {showToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-[10px] text-[13px] font-medium flex items-center gap-2.5 z-[60]"
          style={{
            animation: "drawer-toast-up 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          }}
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ background: C.green }}
          >
            {I.check({ size: 13, strokeWidth: 3 })}
          </span>
          <div>
            <div className="font-semibold">Tarefa concluída!</div>
            <div className="text-[11px] text-white/70 mt-0.5">{showToast}</div>
          </div>
        </div>
      )}

      {editingDeliv && (
        <DeliverableEditModal
          taskId={task.id}
          deliverable={editingDeliv}
          onboardingId={task.onboarding_id ?? null}
          onClose={() => setEditingDeliv(null)}
          onSaved={() => {
            fetchData()
          }}
        />
      )}
    </>
  )
}
