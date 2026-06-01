"use client"

/**
 * Editor da lista de blocos do blueprint.
 *
 * Cada linha:
 *   [#] [select type] [input label] [input purpose] [checkbox needs_image]
 *   [↑ ↓ 🗑]
 *
 * Reorder via botões up/down (sem drag-and-drop por design — uso interno).
 * O `purpose` é texto curto exibido em input single-line; expandir pra
 * textarea fica como evolução.
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"
import { BLOCK_TYPE_OPTIONS } from "@/lib/services/blueprint-management.service"

interface Props {
  blocks: BlueprintBlockDef[]
  onChange: (next: BlueprintBlockDef[]) => void
}

export function BlueprintBlocksEditor({ blocks, onChange }: Props) {
  const updateAt = (idx: number, patch: Partial<BlueprintBlockDef>) => {
    onChange(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  const removeAt = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx))
  }

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= blocks.length) return
    const next = blocks.slice()
    const [removed] = next.splice(idx, 1)
    next.splice(target, 0, removed)
    onChange(next)
  }

  const addBlock = () => {
    onChange([
      ...blocks,
      { type: "text", label: "Texto", purpose: "", needs_image: false },
    ])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-slate-700 dark:text-white/80">
          Blocos ({blocks.length})
        </label>
        <button
          type="button"
          onClick={addBlock}
          className="inline-flex items-center gap-1 rounded-[4px] border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
        >
          <Plus className="h-3 w-3" />
          Adicionar bloco
        </button>
      </div>

      <div className="space-y-1.5">
        {blocks.map((b, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[28px_140px_140px_minmax(0,1fr)_90px_80px] items-center gap-2 rounded-[4px] border border-slate-200 bg-white px-2 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.02]"
          >
            <span className="text-center text-[11px] font-mono text-slate-400">
              {idx + 1}
            </span>

            <select
              value={b.type}
              onChange={(e) => updateAt(idx, { type: e.target.value })}
              className="crm-input w-full text-[12px]"
            >
              {BLOCK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={b.label}
              onChange={(e) => updateAt(idx, { label: e.target.value })}
              placeholder="Label"
              className="crm-input w-full text-[12px]"
            />

            <input
              type="text"
              value={b.purpose}
              onChange={(e) => updateAt(idx, { purpose: e.target.value })}
              placeholder="Propósito do bloco (ex: Banner com imagem do produto)"
              className="crm-input w-full text-[12px]"
            />

            <label className="flex items-center justify-center gap-1.5 text-[11px] text-slate-600 dark:text-white/60">
              <input
                type="checkbox"
                checked={Boolean(b.needs_image)}
                onChange={(e) =>
                  updateAt(idx, { needs_image: e.target.checked })
                }
                className="h-3.5 w-3.5"
              />
              imagem
            </label>

            <div className="flex items-center justify-end gap-0.5">
              <IconButton
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                title="Mover pra cima"
              >
                <ArrowUp className="h-3 w-3" />
              </IconButton>
              <IconButton
                disabled={idx === blocks.length - 1}
                onClick={() => move(idx, 1)}
                title="Mover pra baixo"
              >
                <ArrowDown className="h-3 w-3" />
              </IconButton>
              <IconButton
                onClick={() => removeAt(idx)}
                title="Remover bloco"
                variant="danger"
              >
                <Trash2 className="h-3 w-3" />
              </IconButton>
            </div>
          </div>
        ))}

        {blocks.length === 0 && (
          <p className="rounded-[4px] border border-dashed border-slate-300 px-3 py-4 text-center text-[12px] text-slate-400 dark:border-white/[0.08]">
            Nenhum bloco. Clique em &quot;Adicionar bloco&quot; pra começar.
          </p>
        )}
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
  variant,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  variant?: "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-white/50 dark:hover:bg-white/[0.06] " +
        (variant === "danger"
          ? "hover:text-red-600 dark:hover:text-red-400"
          : "")
      }
    >
      {children}
    </button>
  )
}
