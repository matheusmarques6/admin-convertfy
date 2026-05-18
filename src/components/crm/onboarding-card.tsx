"use client"

import { useMemo } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  ArrowRightLeft,
  CalendarPlus,
  Clock,
  Flag,
  MoreHorizontal,
  Store,
  Trash2,
  Trophy,
  X as XIcon,
} from "lucide-react"

// ─── Tipos ──────────────────────────────────────────────────────

/**
 * Dados consumidos pelo OnboardingCard. Mesma "shape" do DealCardData
 * mas com semantica de loja (store-centric):
 *   - title = nome da loja
 *   - tags = plano + ferramenta (Performance/Klaviyo, Pro/Omnisend, etc)
 *   - status_sentence = frase humana sobre o estado atual
 *   - is_blocked = se a loja esta travada esperando algo
 *   - tasks_done / tasks_total = progresso de tarefas da etapa
 *   - days_in_stage = calculado a partir de last_stage_changed_at
 *   - created_at = data de entrada no pipeline
 *
 * Quando o sistema nao tiver dados explicitos de tasks/status, o card
 * deriva o progresso pela posicao da stage no pipeline (current_stage_idx
 * / total_stages).
 */
export interface OnboardingCardData {
  id: string
  title: string
  status: string
  tags: string[] | null
  last_stage_changed_at: string | null
  created_at?: string | null
  owner?: { id: string; name: string; avatar_url: string | null } | null
  store?: { id: string; name: string } | null
  /** Frase humana de status (vem de deal.notes line 1 ou custom_field). */
  status_sentence?: string | null
  is_blocked?: boolean
  tasks_done?: number | null
  tasks_total?: number | null
  /** Progresso (0-100) — calculado se nao vier. */
  progress_percent?: number | null
  /** Indice da stage atual no pipeline (0-based) — pra fallback de progress. */
  current_stage_idx?: number | null
  total_stages?: number | null
}

interface OnboardingCardProps {
  store: OnboardingCardData
  slaHours?: number | null
  stageColor?: string
  onClick?: (id: string) => void
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  onMove?: (id: string) => void
  onAddActivity?: (id: string) => void
  onDelete?: (id: string) => void
  isDragging?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000),
  )
}

function formatDateBRShort(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

// ─── Card V2 (onboarding) ───────────────────────────────────────

export function OnboardingCard({
  store,
  stageColor: _stageColor,
  onClick,
  onWin,
  onLose,
  onMove,
  onAddActivity,
  onDelete,
  isDragging,
}: OnboardingCardProps) {
  const storeName = store.store?.name ?? store.title
  const isBlocked = store.is_blocked ?? false
  const days = daysSince(store.last_stage_changed_at)
  const entered = formatDateBRShort(store.created_at)

  // Status sentence: vem do prop ou derive de tags/notas
  const statusSentence =
    store.status_sentence ??
    (isBlocked
      ? "Aguardando ação do cliente"
      : store.status === "won"
        ? "Ativo · em monitoramento"
        : "Em andamento")

  // Progress: usa explicito, ou calcula via tasks, ou via posicao na pipeline
  const progressPct = useMemo<number>(() => {
    if (typeof store.progress_percent === "number") {
      return Math.max(0, Math.min(100, Math.round(store.progress_percent)))
    }
    if (
      typeof store.tasks_done === "number" &&
      typeof store.tasks_total === "number" &&
      store.tasks_total > 0
    ) {
      return Math.round((store.tasks_done / store.tasks_total) * 100)
    }
    if (
      typeof store.current_stage_idx === "number" &&
      typeof store.total_stages === "number" &&
      store.total_stages > 0
    ) {
      return Math.round(
        ((store.current_stage_idx + 1) / store.total_stages) * 100,
      )
    }
    return 0
  }, [store])

  const showTaskCounts =
    typeof store.tasks_done === "number" &&
    typeof store.tasks_total === "number"

  return (
    <div
      onClick={() => onClick?.(store.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault()
          onClick(store.id)
        }
      }}
      className="cf-card cf-focusable relative cursor-pointer"
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: "var(--crm-radius-lg)",
        padding: isBlocked ? "12px 12px 12px 16px" : 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "var(--crm-font-sans)",
        boxShadow: isDragging ? "var(--crm-shadow-lg)" : undefined,
        transform: isDragging ? "rotate(0.6deg) scale(1.02)" : undefined,
      }}
    >
      {/* Accent edge esquerdo vermelho quando bloqueado */}
      {isBlocked && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            background: "var(--crm-neg)",
            borderRadius: 0,
          }}
        />
      )}

      {/* Header: ícone store + nome + menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Store
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--crm-gray-500)" }}
          />
          <span
            className="truncate"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              lineHeight: 1.3,
            }}
            title={storeName}
          >
            {storeName}
          </span>
        </div>
        {(onAddActivity || onMove || onWin || onLose || onDelete) && (
          <OnboardingActionsMenu
            storeId={store.id}
            onWin={onWin}
            onLose={onLose}
            onMove={onMove}
            onAddActivity={onAddActivity}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Tag chips (plano azul · ferramenta cinza) */}
      {store.tags && store.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {store.tags.slice(0, 3).map((t, i) => (
            <span
              key={t}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                background: i === 0 ? "var(--crm-blue-50)" : "var(--crm-gray-100)",
                color: i === 0 ? "var(--crm-brand)" : "var(--crm-gray-600)",
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "var(--crm-font-sans)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Status sentence — em vermelho quando bloqueado */}
      <div
        className="flex items-start gap-1.5"
        style={{
          fontSize: 12,
          fontFamily: "var(--crm-font-sans)",
          lineHeight: 1.4,
          color: isBlocked ? "var(--crm-neg)" : "var(--crm-gray-700)",
          fontWeight: isBlocked ? 500 : 400,
        }}
      >
        {isBlocked && (
          <Flag
            className="h-3.5 w-3.5 shrink-0"
            style={{ marginTop: 1 }}
          />
        )}
        <span>{statusSentence}</span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
            Tarefas
          </span>
          <span
            className="crm-tnum"
            style={{
              fontSize: 11,
              color: "var(--crm-gray-600)",
              fontWeight: 500,
            }}
          >
            {showTaskCounts ? `${store.tasks_done}/${store.tasks_total}` : `${progressPct}%`}
          </span>
        </div>
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: "var(--crm-gray-100)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background:
                progressPct === 100 ? "var(--crm-pos)" : "var(--crm-brand)",
              borderRadius: 2,
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>

      {/* Footer: avatar do CSM + dias + entered */}
      <div
        className="flex items-center justify-between"
        style={{
          paddingTop: 4,
          borderTop: "1px solid var(--crm-gray-100)",
        }}
      >
        {store.owner ? (
          <OwnerAvatar name={store.owner.name} size={22} />
        ) : (
          <span style={{ width: 22, height: 22 }} aria-hidden />
        )}
        <div className="flex items-center gap-2">
          {days > 0 && (
            <span
              className="crm-tnum inline-flex items-center gap-1"
              style={{
                fontSize: 10,
                color: isBlocked ? "var(--crm-neg)" : "var(--crm-gray-400)",
                fontFamily: "var(--crm-font-sans)",
              }}
            >
              <Clock className="h-2.5 w-2.5" />
              {days}d
            </span>
          )}
          {entered && (
            <span
              className="crm-tnum"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-400)",
                fontFamily: "var(--crm-font-sans)",
              }}
            >
              {entered}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Owner avatar (componente leve) ─────────────────────────────

function OwnerAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const colors = avatarColorFromName(name)
  const initials = getInitials(name)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.fg,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        fontWeight: 600,
        letterSpacing: "-0.01em",
      }}
      title={name}
      aria-hidden
    >
      {initials}
    </span>
  )
}

// ─── Menu de acoes ⋯ ────────────────────────────────────────────

function OnboardingActionsMenu({
  storeId,
  onWin,
  onLose,
  onMove,
  onAddActivity,
  onDelete,
}: {
  storeId: string
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  onMove?: (id: string) => void
  onAddActivity?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="Acoes da loja"
          title="Acoes da loja"
          className="flex shrink-0 items-center justify-center rounded-[4px] transition-colors"
          style={{
            width: 22,
            height: 22,
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-400)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--crm-gray-100)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onClick={(e) => e.stopPropagation()}
          align="end"
          sideOffset={4}
          className="z-50 min-w-[220px] py-1 rounded-[6px]"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          {onAddActivity && (
            <MenuItem
              icon={<CalendarPlus className="h-3.5 w-3.5" />}
              title="Criar atividade"
              description="Nota, tarefa ou checklist"
              onClick={() => onAddActivity(storeId)}
            />
          )}
          {onMove && (
            <MenuItem
              icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              title="Mover etapa"
              description="Mover para outra etapa"
              onClick={() => onMove(storeId)}
            />
          )}
          {onWin && (
            <MenuItem
              icon={<Trophy className="h-3.5 w-3.5" />}
              title="Ativar"
              description="Marca como onboarding concluido"
              tone="success"
              onClick={() => onWin(storeId)}
            />
          )}
          {onLose && (
            <MenuItem
              icon={<XIcon className="h-3.5 w-3.5" />}
              title="Cancelar"
              description="Marca como cancelado"
              tone="danger"
              onClick={() => onLose(storeId)}
            />
          )}
          {onDelete && (
            <>
              <DropdownMenu.Separator
                className="h-px my-1"
                style={{ background: "var(--crm-gray-100)" }}
              />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                title="Excluir"
                description="Remove definitivamente"
                tone="danger"
                onClick={() => onDelete(storeId)}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuItem({
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  tone?: "success" | "danger"
  onClick: () => void
}) {
  const color =
    tone === "success"
      ? "var(--crm-pos)"
      : tone === "danger"
        ? "var(--crm-neg)"
        : "var(--crm-gray-700)"
  return (
    <DropdownMenu.Item
      onSelect={onClick}
      className="flex cursor-pointer items-start gap-2.5 rounded-[4px] mx-1 px-2 py-2 outline-none data-[highlighted]:bg-slate-50"
    >
      <span className="shrink-0 mt-0.5" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          style={{ fontSize: 12, fontWeight: 500, color, lineHeight: 1.2 }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--crm-gray-500)",
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          {description}
        </div>
      </div>
    </DropdownMenu.Item>
  )
}
