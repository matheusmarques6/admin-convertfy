"use client"

/**
 * Visões salvas — guarda o recorte inteiro do board (filtros, ordenação,
 * modo kanban/tabela) com um nome.
 *
 * Sem isso o vendedor remonta os mesmos filtros toda manhã. O menu mostra
 * as próprias e as compartilhadas pela equipe; só o dono edita ou apaga.
 * Quando o recorte em tela difere da visão aplicada, aparece "Atualizar" —
 * o usuário decide se a mudança vira permanente.
 */

import { useState } from "react"
import { Bookmark, Check, Plus, Trash2, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

export interface SavedView {
  id: string
  name: string
  pipeline_id: string | null
  filters: Record<string, unknown>
  sort: string
  view_mode: "kanban" | "table"
  columns: string[]
  is_shared: boolean
  is_owner: boolean
}

interface SavedViewsMenuProps {
  views: SavedView[]
  activeViewId: string | null
  /** Recorte em tela difere da visão aplicada. */
  isDirty: boolean
  /** Há algum filtro ativo — sem isso não faz sentido salvar. */
  canSave: boolean
  busy?: boolean
  onApply: (view: SavedView) => void
  onCreate: (name: string, isShared: boolean) => void
  onUpdate: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onClearActive: () => void
}

export function SavedViewsMenu({
  views,
  activeViewId,
  isDirty,
  canSave,
  busy,
  onApply,
  onCreate,
  onUpdate,
  onDelete,
  onClearActive,
}: SavedViewsMenuProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [shared, setShared] = useState(false)

  const active = views.find((v) => v.id === activeViewId) ?? null

  const close = () => {
    setOpen(false)
    setCreating(false)
    setName("")
    setShared(false)
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, shared)
    close()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-medium transition-colors",
          active
            ? "border-[#4E62D8]/40 bg-[#EEF0FB] text-[#2137B6] dark:border-[#7B8CEA]/40 dark:bg-[#4E62D8]/15 dark:text-[#A8B2EE]"
            : "border-black/10 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#1A1D27] dark:text-white/70 dark:hover:bg-white/[0.06]",
        )}
      >
        <Icon icon={Bookmark} size={16} />
        <span className="max-w-[140px] truncate">{active ? active.name : "Visões"}</span>
        {isDirty && active && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#4E62D8] dark:bg-[#7B8CEA]"
            title="Recorte alterado — não salvo"
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[268px] rounded-[10px] border border-black/10 bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#1A1D27]">
            {views.length === 0 && !creating && (
              <p className="px-2.5 py-3 text-[12px] leading-relaxed text-slate-500 dark:text-white/50">
                Nenhuma visão salva ainda. Filtre o board como quiser e salve o
                recorte para voltar a ele com um clique.
              </p>
            )}

            {views.length > 0 && (
              <div className="max-h-[240px] overflow-y-auto">
                {views.map((v) => {
                  const isActive = v.id === activeViewId
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-[6px] px-1 transition-colors",
                        isActive
                          ? "bg-[#EEF0FB] dark:bg-[#4E62D8]/15"
                          : "hover:bg-slate-100 dark:hover:bg-white/[0.06]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onApply(v)
                          close()
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                      >
                        <Icon
                          icon={isActive ? Check : Bookmark}
                          customSize={13}
                          className={cn(
                            "shrink-0",
                            isActive
                              ? "text-[#2137B6] dark:text-[#A8B2EE]"
                              : "text-slate-400 dark:text-white/35",
                          )}
                        />
                        <span className="truncate text-[12.5px] text-slate-800 dark:text-white/80">
                          {v.name}
                        </span>
                        {v.is_shared && (
                          <Icon
                            icon={Users}
                            customSize={12}
                            className="shrink-0 text-slate-400 dark:text-white/35"
                          />
                        )}
                      </button>

                      {v.is_owner && (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                          {isActive && isDirty && (
                            <button
                              type="button"
                              onClick={() => onUpdate(v)}
                              disabled={busy}
                              title="Salvar o recorte atual nesta visão"
                              className="rounded-[4px] p-1 text-[#2137B6] hover:bg-white/70 dark:text-[#A8B2EE] dark:hover:bg-white/10"
                            >
                              <Icon icon={Check} customSize={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Excluir a visão "${v.name}"?`)) {
                                onDelete(v)
                              }
                            }}
                            disabled={busy}
                            title="Excluir visão"
                            className="rounded-[4px] p-1 text-slate-400 hover:bg-white/70 hover:text-red-600 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-red-400"
                          >
                            <Icon icon={Trash2} customSize={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-1 border-t border-black/[0.06] pt-1 dark:border-white/[0.06]">
              {creating ? (
                <div className="p-1.5">
                  <input
                    type="text"
                    value={name}
                    autoFocus
                    maxLength={60}
                    placeholder="Nome da visão"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit()
                      if (e.key === "Escape") setCreating(false)
                    }}
                    className="h-8 w-full rounded-[6px] border border-black/10 bg-white px-2 text-[12.5px] text-slate-900 outline-none focus:border-[#4E62D8] dark:border-white/15 dark:bg-[#0F1117] dark:text-white"
                  />
                  <label className="mt-2 flex cursor-pointer items-center gap-2 px-0.5 text-[11.5px] text-slate-600 dark:text-white/60">
                    <input
                      type="checkbox"
                      checked={shared}
                      onChange={(e) => setShared(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#4E62D8]"
                    />
                    Compartilhar com a equipe
                  </label>
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="inline-flex h-7 items-center rounded-[6px] px-2 text-[12px] text-slate-500 hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!name.trim() || busy}
                      className="inline-flex h-7 items-center rounded-[6px] bg-[#4E62D8] px-2.5 text-[12px] font-semibold text-white hover:bg-[#2137B6] disabled:opacity-40"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    disabled={!canSave}
                    title={
                      canSave
                        ? "Salvar o recorte atual como visão"
                        : "Aplique um filtro ou ordenação antes de salvar"
                    }
                    className="flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-white/75 dark:hover:bg-white/[0.06]"
                  >
                    <Icon icon={Plus} customSize={13} />
                    Salvar recorte atual
                  </button>
                  {active && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearActive()
                        close()
                      }}
                      className="flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-slate-500 transition-colors hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/[0.06]"
                    >
                      <Icon icon={X} customSize={13} />
                      Sair da visão
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
