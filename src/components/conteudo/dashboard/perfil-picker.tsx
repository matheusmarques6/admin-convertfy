"use client"

/**
 * Seletor de perfil agrupado por canal (mesmo botão do DateControl):
 * Todos os canais → Consolidado · Instagram → os 2 perfis, Bruno, Convertfy
 * · YouTube → Convertfy TV.
 */

import { useState } from "react"
import { Check, ChevronDown, Instagram, Layers, Play } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { PerfilFiltro } from "@/lib/conteudo/types"

interface Grupo {
  canal: string
  icon: LucideIcon
  cor: string
  itens: Array<[PerfilFiltro, string, string]>
}

export const CT_CANAIS: Grupo[] = [
  { canal: "Todos os canais", icon: Layers, cor: "#4E62D8", itens: [["consolidado", "Consolidado", "Instagram + YouTube"]] },
  {
    canal: "Instagram",
    icon: Instagram,
    cor: "#DB2777",
    itens: [
      ["instagram", "Instagram", "os 2 perfis"],
      ["bruno", "Bruno", "@brunoconvertfy"],
      ["convertfy", "Convertfy", "@convertfy"],
    ],
  },
  { canal: "YouTube", icon: Play, cor: "#DC2626", itens: [["youtube", "Convertfy TV", "canal da marca"]] },
]

export function PerfilPicker({ val, onChange }: { val: PerfilFiltro; onChange: (v: PerfilFiltro) => void }) {
  const [open, setOpen] = useState(false)
  const grp = CT_CANAIS.find((g) => g.itens.some((i) => i[0] === val)) ?? CT_CANAIS[0]
  const cur = grp.itens.find((i) => i[0] === val) ?? grp.itens[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Perfil"
          className={cn(
            "inline-flex h-[34px] items-center gap-2 rounded-lg border bg-[var(--ops-card)] px-3 text-[12.5px] font-medium text-[var(--ops-title)] transition-colors",
            open ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)] hover:bg-[var(--ops-hover)]",
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ background: grp.cor }}>
            <Icon icon={grp.icon} customSize={11} />
          </span>
          {cur[1]}
          <span className={cn("flex text-[var(--ops-mut)] transition-transform", open && "rotate-180")}>
            <Icon icon={ChevronDown} customSize={12} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[250px] rounded-[10px] border-[var(--ops-border)] bg-[var(--ops-card)] p-[5px] shadow-lg">
        {CT_CANAIS.map((g, gi) => (
          <div key={g.canal} className={cn(gi > 0 && "mt-1 border-t border-[var(--ops-border)] pt-1")}>
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--ops-mut)]">{g.canal}</div>
            {g.itens.map(([k, l, d]) => {
              const on = k === val
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onChange(k)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left transition-colors hover:bg-[var(--ops-hover)]",
                    on && "bg-[var(--ops-hover)]",
                  )}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: g.cor }}>
                    <Icon icon={g.icon} customSize={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[12.5px] text-[var(--ops-title)]", on ? "font-semibold" : "font-medium")}>{l}</span>
                    <span className="block text-[10.5px] text-[var(--ops-mut)]">{d}</span>
                  </span>
                  {on && (
                    <span className="flex text-[var(--ops-accent)]">
                      <Icon icon={Check} customSize={13} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
