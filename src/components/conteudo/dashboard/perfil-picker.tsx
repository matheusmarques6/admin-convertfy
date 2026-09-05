"use client"

/**
 * Seletor de perfil agrupado por canal: Todos os canais → Consolidado ·
 * Instagram → cada canal conectado da org · YouTube → não conectado (não há
 * integração; o item aparece desabilitado em vez de fingir dado).
 */

import { useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, Instagram, Layers, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COR_CONSOLIDADO } from "@/lib/conteudo/brand"
import { PERFIL_CONSOLIDADO, type Perfil, type PerfilFiltro } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar } from "../ui"

export function PerfilPicker({ val, onChange, perfis }: { val: PerfilFiltro; onChange: (v: PerfilFiltro) => void; perfis: Perfil[] | null }) {
  const [open, setOpen] = useState(false)
  const lista = perfis ?? []
  const atual = lista.find((p) => p.id === val)
  const label = atual ? atual.nome : "Consolidado"
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
          {atual ? (
            <CtAvatar perfil={atual} size={20} />
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ background: COR_CONSOLIDADO }}>
              <Icon icon={Layers} customSize={11} />
            </span>
          )}
          {label}
          <span className={cn("flex text-[var(--ops-mut)] transition-transform", open && "rotate-180")}>
            <Icon icon={ChevronDown} customSize={12} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[270px] rounded-[10px] border-[var(--ops-border)] bg-[var(--ops-card)] p-[5px] shadow-lg">
        <Grupo titulo="Todos os canais">
          <Item on={val === PERFIL_CONSOLIDADO} onClick={() => (onChange(PERFIL_CONSOLIDADO), setOpen(false))} icone={<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: COR_CONSOLIDADO }}><Icon icon={Layers} customSize={12} /></span>} titulo="Consolidado" desc={lista.length ? `${lista.length} ${lista.length === 1 ? "perfil" : "perfis"} do Instagram` : "nenhum canal conectado"} />
        </Grupo>
        <Grupo titulo="Instagram" icone={Instagram} cor="#DB2777">
          {lista.length === 0 ? (
            <Link href={ROUTES.ADMIN.COMERCIAL.CANAIS} className="block rounded-[7px] px-2 py-[7px] text-[11.5px] text-[var(--ops-accent)] hover:bg-[var(--ops-hover)]">
              Nenhum canal conectado. Conectar em Comercial → Canais
            </Link>
          ) : (
            lista.map((p) => <Item key={p.id} on={val === p.id} onClick={() => (onChange(p.id), setOpen(false))} icone={<CtAvatar perfil={p} size={24} />} titulo={p.nome} desc={p.handle ?? (p.erro ? "token com problema" : "lendo perfil…")} />)
          )}
        </Grupo>
        <Grupo titulo="YouTube" icone={Play} cor="#DC2626">
          <div className="flex items-center gap-[9px] rounded-[7px] px-2 py-[7px] opacity-60" title="Sem integração com o YouTube nesta versão">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: "#DC2626" }}>
              <Icon icon={Play} customSize={12} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-[var(--ops-title)]">YouTube</span>
              <span className="block text-[10.5px] text-[var(--ops-mut)]">não conectado</span>
            </span>
          </div>
        </Grupo>
      </PopoverContent>
    </Popover>
  )
}

function Grupo({ titulo, children }: { titulo: string; icone?: typeof Instagram; cor?: string; children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-[var(--ops-border)] pt-1 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--ops-mut)]">{titulo}</div>
      {children}
    </div>
  )
}

function Item({ on, onClick, icone, titulo, desc }: { on: boolean; onClick: () => void; icone: React.ReactNode; titulo: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left transition-colors hover:bg-[var(--ops-hover)]", on && "bg-[var(--ops-hover)]")}>
      {icone}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[12.5px] text-[var(--ops-title)]", on ? "font-semibold" : "font-medium")}>{titulo}</span>
        <span className="block truncate text-[10.5px] text-[var(--ops-mut)]">{desc}</span>
      </span>
      {on && (
        <span className="flex text-[var(--ops-accent)]">
          <Icon icon={Check} customSize={13} />
        </span>
      )}
    </button>
  )
}
