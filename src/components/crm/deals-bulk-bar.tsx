"use client"

/**
 * Barra de ações em massa — aparece flutuando quando há seleção.
 *
 * Flutua sobre o conteúdo (não empurra o board) porque a seleção é
 * transitória: some assim que o usuário limpa. Cada ação confirma antes
 * de aplicar quando é destrutiva ou irreversível na prática.
 */

import { useState } from "react"
import {
  ArrowRightLeft,
  Archive,
  Check,
  Tag,
  UserCheck,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

export interface BulkOwner {
  id: string
  name: string
}

export interface BulkStage {
  id: string
  name: string
  stage_type?: string
}

interface DealsBulkBarProps {
  count: number
  owners: BulkOwner[]
  stages: BulkStage[]
  availableTags: string[]
  busy: boolean
  onClear: () => void
  onAssignOwner: (ownerId: string) => void
  onMoveStage: (stageId: string) => void
  onAddTags: (tags: string[]) => void
  onArchive: () => void
}

type OpenMenu = "owner" | "stage" | "tag" | null

export function DealsBulkBar({
  count,
  owners,
  stages,
  availableTags,
  busy,
  onClear,
  onAssignOwner,
  onMoveStage,
  onAddTags,
  onArchive,
}: DealsBulkBarProps) {
  const [menu, setMenu] = useState<OpenMenu>(null)
  const [newTag, setNewTag] = useState("")

  if (count === 0) return null

  const close = () => {
    setMenu(null)
    setNewTag("")
  }

  const toggle = (next: OpenMenu) => setMenu((cur) => (cur === next ? null : next))

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 md:pb-6"
      role="region"
      aria-label="Ações em massa"
    >
      <div className="pointer-events-auto relative flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-[12px] border border-black/10 bg-white p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.16)] dark:border-white/10 dark:bg-[#1A1D27]">
        <span className="whitespace-nowrap px-2.5 text-[12.5px] font-semibold tabular-nums text-slate-900 dark:text-white">
          {count} {count === 1 ? "selecionado" : "selecionados"}
        </span>

        <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10 dark:bg-white/10" />

        <BulkButton
          icon={UserCheck}
          label="Responsável"
          active={menu === "owner"}
          disabled={busy || owners.length === 0}
          onClick={() => toggle("owner")}
        />
        <BulkButton
          icon={ArrowRightLeft}
          label="Mover"
          active={menu === "stage"}
          disabled={busy || stages.length === 0}
          onClick={() => toggle("stage")}
        />
        <BulkButton
          icon={Tag}
          label="Tags"
          active={menu === "tag"}
          disabled={busy}
          onClick={() => toggle("tag")}
        />
        <BulkButton
          icon={Archive}
          label="Arquivar"
          disabled={busy}
          destructive
          onClick={() => {
            if (
              window.confirm(
                `Arquivar ${count} ${count === 1 ? "negócio" : "negócios"}? Eles somem do board, mas o histórico é preservado.`,
              )
            ) {
              onArchive()
              close()
            }
          }}
        />

        <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10 dark:bg-white/10" />

        <button
          type="button"
          onClick={() => {
            close()
            onClear()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Limpar seleção"
        >
          <Icon icon={X} size={16} />
        </button>

        {/* Menus */}
        {menu === "owner" && (
          <BulkMenu title="Atribuir a" onClose={close}>
            {owners.map((o) => (
              <BulkMenuItem
                key={o.id}
                onClick={() => {
                  onAssignOwner(o.id)
                  close()
                }}
              >
                {o.name}
              </BulkMenuItem>
            ))}
          </BulkMenu>
        )}

        {menu === "stage" && (
          <BulkMenu title="Mover para" onClose={close}>
            {stages.map((s) => (
              <BulkMenuItem
                key={s.id}
                onClick={() => {
                  const terminal = s.stage_type === "won" || s.stage_type === "lost"
                  if (
                    terminal &&
                    !window.confirm(
                      `Mover ${count} ${count === 1 ? "negócio" : "negócios"} para "${s.name}"? Isso fecha ${count === 1 ? "o negócio" : "os negócios"}.`,
                    )
                  ) {
                    return
                  }
                  onMoveStage(s.id)
                  close()
                }}
              >
                <span className="truncate">{s.name}</span>
                {(s.stage_type === "won" || s.stage_type === "lost") && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[10px] uppercase tracking-wide",
                      s.stage_type === "won"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {s.stage_type === "won" ? "ganho" : "perdido"}
                  </span>
                )}
              </BulkMenuItem>
            ))}
          </BulkMenu>
        )}

        {menu === "tag" && (
          <BulkMenu title="Adicionar tag" onClose={close}>
            <div className="px-1.5 pb-1.5">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTag}
                  autoFocus
                  placeholder="Nova tag"
                  maxLength={40}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      onAddTags([newTag.trim()])
                      close()
                    }
                    if (e.key === "Escape") close()
                  }}
                  className="h-7 min-w-0 flex-1 rounded-[6px] border border-black/10 bg-white px-2 text-[12px] text-slate-900 outline-none focus:border-[#4E62D8] dark:border-white/15 dark:bg-[#0F1117] dark:text-white"
                />
                <button
                  type="button"
                  disabled={!newTag.trim()}
                  onClick={() => {
                    if (newTag.trim()) {
                      onAddTags([newTag.trim()])
                      close()
                    }
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#4E62D8] text-white disabled:opacity-40"
                  aria-label="Adicionar tag"
                >
                  <Icon icon={Check} customSize={14} />
                </button>
              </div>
            </div>
            {availableTags.length > 0 && (
              <div className="max-h-[180px] overflow-y-auto border-t border-black/[0.06] pt-1 dark:border-white/[0.06]">
                {availableTags.map((t) => (
                  <BulkMenuItem
                    key={t}
                    onClick={() => {
                      onAddTags([t])
                      close()
                    }}
                  >
                    {t}
                  </BulkMenuItem>
                ))}
              </div>
            )}
          </BulkMenu>
        )}
      </div>
    </div>
  )
}

function BulkButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  destructive,
}: {
  icon: typeof Tag
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
          : destructive
            ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            : "text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10",
      )}
    >
      <Icon icon={icon} size={16} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function BulkMenu({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {/* Clique fora fecha — sem cobrir a barra em si */}
      <div className="fixed inset-0 z-0" onClick={onClose} aria-hidden />
      <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-10 max-h-[320px] w-[240px] -translate-x-1/2 overflow-y-auto rounded-[10px] border border-black/10 bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.16)] dark:border-white/10 dark:bg-[#1A1D27]">
        <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40">
          {title}
        </div>
        {children}
      </div>
    </>
  )
}

function BulkMenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-slate-700 transition-colors hover:bg-slate-100 dark:text-white/75 dark:hover:bg-white/10"
    >
      {children}
    </button>
  )
}
