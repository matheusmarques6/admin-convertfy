"use client"

/**
 * PromptHistory — lista colapsável de versões anteriores. Cada item:
 * "Ativar" (abre modal de confirmação) e "Ver diff" (modal side-by-side).
 */
import { useState } from "react"
import { ChevronDown, ChevronRight, Eye, Play, History } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AgentType } from "@/types/email-generation"
import type { PromptRow } from "@/lib/services/prompt-management.service"
import { PromptDiffModal } from "@/components/agents/prompt-diff-modal"

interface Props {
  agentType: AgentType
  active: PromptRow | null
  history: PromptRow[]
  onChanged: () => void
}

export function PromptHistory({ active, history, onChanged }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [diffTarget, setDiffTarget] = useState<PromptRow | null>(null)
  const [activateTarget, setActivateTarget] = useState<PromptRow | null>(null)

  const sorted = [...history].sort((a, b) => b.version - a.version)

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-white">
          <History className="h-4 w-4 text-slate-400" />
          Histórico de versões ({sorted.length})
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-white/[0.06]">
          {sorted.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-slate-400 dark:text-white/40">
              Sem versões anteriores.
            </div>
          )}
          {sorted.map((row) => (
            <div
              key={row.id}
              className={cn(
                "px-4 py-2.5 flex items-center gap-3 border-b last:border-b-0",
                "border-slate-100 dark:border-white/[0.04]",
              )}
            >
              <span className="text-[12px] font-mono font-semibold text-slate-700 dark:text-white/80 w-10">
                v{row.version}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-white/55 w-[140px] truncate">
                {row.model}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-white/40 w-[140px] truncate">
                {row.created_by_name ?? "—"}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-white/40 flex-1">
                {new Date(row.created_at).toLocaleString("pt-BR")}
              </span>
              <button
                type="button"
                onClick={() => setDiffTarget(row)}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-[4px] text-[11px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <Eye className="h-3 w-3" />
                Ver diff
              </button>
              <button
                type="button"
                onClick={() => setActivateTarget(row)}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-[4px] text-[11px] font-medium text-white bg-[#1F1F1F] dark:bg-white dark:text-black"
              >
                <Play className="h-3 w-3" />
                Ativar
              </button>
            </div>
          ))}
        </div>
      )}

      {diffTarget && (
        <PromptDiffModal
          mode="view"
          current={active}
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
          onActivated={() => {
            setDiffTarget(null)
            onChanged()
          }}
        />
      )}

      {activateTarget && (
        <PromptDiffModal
          mode="activate"
          current={active}
          target={activateTarget}
          onClose={() => setActivateTarget(null)}
          onActivated={() => {
            setActivateTarget(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
