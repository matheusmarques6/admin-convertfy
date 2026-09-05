"use client"

/**
 * Home do Estúdio: começar (três caminhos), meus carrosséis (busca, filtros,
 * menu por card com renomear inline) e meus templates.
 */

import { useState } from "react"
import { ChevronRight, Columns3, Image as ImageIcon, MoreHorizontal, Palette, Plus, Search, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { OpsCard, SectionTitle } from "@/components/dashboard/ops/primitives"
import { getTemplate, ST_TEMPLATES } from "@/lib/conteudo/templates"
import type { DocStatus, Documento, MeuTemplate, PerfilEditavel } from "@/lib/conteudo/types"
import { CtAvatar, CtBadge, CtBtn, CtEmpty, CtSeg, CtSkel, TNUM, inputCls } from "../ui"
import { ThumbFit } from "./thumb"

export const ST_STATUS: Record<DocStatus, [string, string]> = {
  rascunho: ["Rascunho", "#6B7280"],
  pronto: ["Pronto", "#2563EB"],
  agendado: ["Agendado", "#D97706"],
  publicado: ["Publicado", "#047857"],
}

export type Caminho = "template" | "ia" | "inspiracao"

const CAMINHOS: Array<{ k: Caminho; n: string; d: string; icon: LucideIcon; cor: string }> = [
  { k: "template", n: "Template Convertfy", d: "Escolha um dos moldes testados, preencha os slots e exporte em minutos.", icon: Columns3, cor: "#4E62D8" },
  { k: "ia", n: "100% com IA", d: "Descreva a pauta ou use um prompt pronto. A ConvertIA escreve, escolhe o molde e monta tudo.", icon: Sparkles, cor: "#7C3AED" },
  { k: "inspiracao", n: "A partir de inspiração", d: "Suba um carrossel de referência. O sistema lê a estrutura e converte em template fiel, com a sua marca.", icon: ImageIcon, cor: "#0E7490" },
]

interface Props {
  docs: Documento[] | null
  meusTemplates: MeuTemplate[]
  promptsProntos: number
  onAbrir: (id: string, modal?: string) => void
  onNovo: (caminho?: Caminho, perfil?: PerfilEditavel) => void
  onCriarTemplate: () => void
  onExcluir: (id: string) => Promise<void>
  onDuplicar: (id: string) => Promise<void>
  onRenomear: (id: string, nome: string) => Promise<void>
  onBrandKit: () => void
}

export function Biblioteca({ docs, meusTemplates, promptsProntos, onAbrir, onNovo, onCriarTemplate, onExcluir, onDuplicar, onRenomear, onBrandKit }: Props) {
  const [fPerfil, setFPerfil] = useState<"todos" | PerfilEditavel>("todos")
  const [fStatus, setFStatus] = useState<"todos" | DocStatus>("todos")
  const [q, setQ] = useState("")
  const [menu, setMenu] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null)
  const [excluindo, setExcluindo] = useState<Documento | null>(null)

  const vis = (docs ?? []).filter(
    (d) => (fPerfil === "todos" || d.perfil === fPerfil) && (fStatus === "todos" || d.status === fStatus) && (!q || d.nome.toLowerCase().includes(q.toLowerCase())),
  )

  const confirmarRenome = async () => {
    if (!renomeando) return
    const nome = renomeando.nome.trim()
    setRenomeando(null)
    if (nome) await onRenomear(renomeando.id, nome)
  }

  return (
    <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
        <div className="flex flex-wrap items-end gap-3.5">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Estúdio</h1>
            <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">Carrosséis que não quebram: template, IA ou inspiração, sempre dentro da marca</div>
          </div>
          <div className="flex-1" />
          <CtBtn icon={Palette} onClick={onBrandKit}>
            Brand Kit
          </CtBtn>
          <CtBtn kind="primary" size="lg" icon={Plus} onClick={() => onNovo()}>
            Novo carrossel
          </CtBtn>
        </div>

        <SectionTitle title="Começar" hint="três caminhos, o mesmo resultado dentro da marca" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CAMINHOS.map((c) => {
            const meta = c.k === "template" ? `${ST_TEMPLATES.length} moldes · média de 7 leads/post` : c.k === "ia" ? `${promptsProntos} prompts prontos` : `${meusTemplates.length} templates criados assim`
            return (
              <button
                key={c.k}
                type="button"
                onClick={() => onNovo(c.k)}
                className="flex flex-col gap-3 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] pb-4 pt-[18px] text-left transition-colors hover:border-[var(--ops-mut)]"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: `${c.cor}1F`, color: c.cor }}>
                  <Icon icon={c.icon} customSize={17} />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[var(--ops-title)]">{c.n}</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[var(--ops-sec)]">{c.d}</span>
                </span>
                <span className="mt-auto flex items-center gap-1.5 text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                  {meta}
                  <span className="ml-auto flex" style={{ color: c.cor }}>
                    <Icon icon={ChevronRight} customSize={13} />
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-baseline gap-2.5">
          <SectionTitle title="Meus carrosséis" hint={docs ? `${vis.length} de ${docs.length}` : undefined} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-[9px] top-1/2 flex -translate-y-1/2 text-[var(--ops-mut)]">
                <Icon icon={Search} customSize={12} />
              </span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar carrossel" className={cn(inputCls, "h-[30px] w-[180px] bg-[var(--ops-card)] pl-7")} />
            </div>
            <CtSeg<"todos" | PerfilEditavel>
              val={fPerfil}
              onChange={setFPerfil}
              opts={[
                ["todos", "Todos"],
                ["bruno", "Bruno"],
                ["convertfy", "Convertfy"],
              ]}
            />
            <CtSeg<"todos" | DocStatus>
              val={fStatus}
              onChange={setFStatus}
              opts={[
                ["todos", "Status"],
                ["rascunho", "Rascunho"],
                ["pronto", "Pronto"],
                ["agendado", "Agendado"],
                ["publicado", "Publicado"],
              ]}
            />
          </div>
        </div>

        {docs === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-2.5">
                <div className="aspect-[4/5]">
                  <CtSkel h={0} className="h-full" r={7} />
                </div>
                <CtSkel h={12} w="80%" className="mt-2.5" />
                <CtSkel h={10} w="50%" className="mt-2" />
              </div>
            ))}
          </div>
        ) : docs.length === 0 ? (
          <OpsCard>
            <CtEmpty
              icon={ImageIcon}
              title="Nenhum carrossel criado"
              desc="Comece por um dos três caminhos acima. Leva menos de cinco minutos."
              action={
                <div className="mt-2">
                  <CtBtn kind="primary" icon={Plus} onClick={() => onNovo()}>
                    Criar o primeiro
                  </CtBtn>
                </div>
              }
            />
          </OpsCard>
        ) : vis.length === 0 ? (
          <OpsCard>
            <CtEmpty title="Nada com esses filtros" desc="Ajuste a busca, o perfil ou o status." />
          </OpsCard>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3.5">
            {vis.map((d) => {
              const tpl = getTemplate(d.templateId)
              const [stL, stC] = ST_STATUS[d.status]
              const editando = renomeando?.id === d.id
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => !editando && onAbrir(d.id)}
                  onKeyDown={(e) => e.key === "Enter" && !editando && onAbrir(d.id)}
                  className="relative cursor-pointer rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-2.5 transition-colors hover:border-[var(--ops-mut)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ops-accent)]"
                >
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[7px]">
                    <div className="absolute inset-0">
                      <ThumbFit doc={d} ix={0} />
                    </div>
                  </div>
                  {editando ? (
                    <input
                      autoFocus
                      value={renomeando.nome}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenomeando({ id: d.id, nome: e.target.value })}
                      onBlur={confirmarRenome}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmarRenome()
                        if (e.key === "Escape") setRenomeando(null)
                      }}
                      className={cn(inputCls, "mt-2 h-7 text-[12px]")}
                      aria-label="Novo nome"
                    />
                  ) : (
                    <div className="mt-[9px] line-clamp-2 min-h-[32px] text-[12px] font-medium leading-[1.35] text-[var(--ops-title)]">{d.nome}</div>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <CtAvatar perfil={d.perfil} size={16} />
                    <CtBadge txt={stL} cor={stC} />
                    <span className="ml-auto text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
                      {d.data}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--ops-mut)]">
                    <span>{tpl.nome}</span>
                    <Popover open={menu === d.id} onOpenChange={(o) => setMenu(o ? d.id : null)}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Mais ações"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)] hover:text-[var(--ops-title)]"
                        >
                          <Icon icon={MoreHorizontal} customSize={14} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={4} className="w-[150px] rounded-[9px] border-[var(--ops-border)] bg-[var(--ops-card)] p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                        {(
                          [
                            ["Abrir", () => onAbrir(d.id)],
                            ["Duplicar", () => void onDuplicar(d.id)],
                            ["Renomear", () => setRenomeando({ id: d.id, nome: d.nome })],
                            ["Excluir", () => setExcluindo(d)],
                          ] as Array<[string, () => void]>
                        ).map(([l, fn]) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => {
                              setMenu(null)
                              fn()
                            }}
                            className={cn("block w-full rounded-md px-[9px] py-1.5 text-left text-[11.5px] hover:bg-[var(--ops-hover)]", l === "Excluir" ? "text-[var(--ops-neg)]" : "text-[var(--ops-text)]")}
                          >
                            {l}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-baseline gap-2.5">
          <SectionTitle title="Meus templates" hint="criados a partir de inspirações do time" />
          <button type="button" onClick={onCriarTemplate} className="ml-auto text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
            Criar template
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3.5">
          {meusTemplates.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onNovo("template")}
              className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-2.5 text-left transition-colors hover:border-[var(--ops-mut)]"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-[7px] bg-[#111]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://picsum.photos/seed/${m.seed}/240/300`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-85 grayscale" />
                <div className="absolute inset-x-2.5 bottom-2.5 text-white">
                  <span className="block text-[6.5px] font-bold tracking-[0.22em]">CONVERTFY</span>
                  <span className="mt-1 block text-[13px] font-extrabold uppercase leading-[1.05]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Título do template
                  </span>
                </div>
              </div>
              <div className="mt-[9px] text-[12px] font-medium text-[var(--ops-title)]">{m.nome}</div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
                <span>{m.frames} frames</span>
                <span>
                  {m.usos} {m.usos === 1 ? "uso" : "usos"}
                </span>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={onCriarTemplate}
            className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--ops-border)] text-[12px] font-medium text-[var(--ops-sec)] transition-colors hover:bg-[var(--ops-hover)]"
          >
            <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--ops-hover)] text-[var(--ops-mut)]">
              <Icon icon={ImageIcon} customSize={15} />
            </span>
            Criar template
            <span className="px-[18px] text-center text-[10.5px] font-normal leading-relaxed text-[var(--ops-mut)]">Suba uma inspiração e o sistema converte em template</span>
          </button>
        </div>
      </div>

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir carrossel?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{excluindo?.nome}&rdquo; será removido da biblioteca. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (excluindo) await onExcluir(excluindo.id)
                setExcluindo(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
