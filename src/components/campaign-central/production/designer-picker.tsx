"use client"

import { ChevronDown } from "lucide-react"
import type { ProductionDesigner } from "@/types/campaign-production"
import { designerInitials } from "./helpers"

interface Props {
  value: string | null
  designers: ProductionDesigner[]
  onChange: (id: string | null) => void
  sub?: string
}

/** Reatribuir designer de uma loja — select nativo "invisível" sobre o chip. */
export function DesignerPicker({ value, designers, onChange, sub }: Props) {
  const current = designers.find((d) => d.id === value) ?? null
  return (
    <div
      className="relative inline-flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {current ? designerInitials(current.name) : "—"}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[12px] font-medium text-foreground">
          <span className="truncate">{current ? current.name : "Não atribuído"}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </div>
        {sub && <div className="text-[10.5px] text-muted-foreground">{sub}</div>}
      </div>
      <select
        aria-label="Designer responsável"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Não atribuído</option>
        {designers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  )
}
