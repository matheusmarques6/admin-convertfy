"use client"

/**
 * Coluna esquerda: lista de emails do flow_type ativo.
 *
 * Cada item exibe email_number + objective truncado + badge da origem:
 *   - "DB" (azul): blueprint salvo no banco — sobrescreve o DEFAULT
 *   - "DEFAULT" (cinza): vem de DEFAULT_BLUEPRINTS no código
 */
import { cn } from "@/lib/utils"
import type { BlueprintRow } from "@/lib/email-blueprints/types"

interface Props {
  blueprints: BlueprintRow[]
  selectedEmailNumber: number | null
  onSelect: (emailNumber: number) => void
}

export function BlueprintList({
  blueprints,
  selectedEmailNumber,
  onSelect,
}: Props) {
  return (
    <div className="rounded-[6px] border border-slate-200 bg-white p-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="space-y-1">
        {blueprints.map((b) => {
          const isActive = b.email_number === selectedEmailNumber
          return (
            <button
              key={`${b.flow_type}:${b.email_number}`}
              type="button"
              onClick={() => onSelect(b.email_number)}
              className={cn(
                "w-full rounded-[4px] px-2 py-2 text-left text-[12px] transition-colors",
                "hover:bg-slate-50 dark:hover:bg-white/[0.04]",
                isActive &&
                  "bg-slate-100 dark:bg-white/[0.06]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Email #{b.email_number}
                </span>
                <BadgeSource source={b.source} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-white/40">
                {b.objective}
              </p>
              <p className="mt-1 text-[10px] text-slate-400 dark:text-white/30">
                {b.blocks.length} bloco{b.blocks.length === 1 ? "" : "s"}
              </p>
            </button>
          )
        })}
        {blueprints.length === 0 && (
          <p className="px-2 py-3 text-center text-[12px] text-slate-400">
            Nenhum blueprint pra este flow.
          </p>
        )}
      </div>
    </div>
  )
}

function BadgeSource({ source }: { source: "db" | "default" }) {
  const isDb = source === "db"
  return (
    <span
      className={cn(
        "rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        isDb
          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
          : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/50",
      )}
    >
      {isDb ? "DB" : "Default"}
    </span>
  )
}
