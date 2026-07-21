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
    <div className="space-y-1.5">
      {blueprints.map((b) => {
        const isActive = b.email_number === selectedEmailNumber
        return (
          <button
            key={`${b.flow_type}:${b.email_number}`}
            type="button"
            onClick={() => onSelect(b.email_number)}
            className={cn(
              "w-full rounded-[9px] border px-3 py-2.5 text-left text-[12px] transition-colors bg-white",
              isActive
                ? "border-[#4E62D8] bg-[#EEF0FB]"
                : "border-black/[0.08] hover:bg-slate-50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "font-semibold",
                  isActive ? "text-[#4E62D8]" : "text-slate-900",
                )}
              >
                Email #{b.email_number}
              </span>
              <span className="flex items-center gap-1">
                {b.text_only && <BadgeTextOnly />}
                <BadgeSource source={b.source} />
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
              {b.objective}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
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
  )
}

function BadgeTextOnly() {
  return (
    <span className="rounded-[3px] bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
      Texto
    </span>
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
