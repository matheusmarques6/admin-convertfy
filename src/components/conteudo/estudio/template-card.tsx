"use client"

/**
 * Card de template com PRÉVIA REAL (o renderer desenha a capa com o texto
 * guia do molde) + desempenho: posts publicados classificados com o molde,
 * leads/post e alcance médio — só quando há posts; sem posts, diz isso.
 */

import { useMemo } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { novoDocumento } from "@/lib/conteudo/documento"
import { moldeKeyDoTemplate } from "@/lib/conteudo/templates"
import type { BrandKit, Post, Template } from "@/lib/conteudo/types"
import { TNUM, fmtDec, fmtNum } from "../ui"
import { ThumbFit } from "./thumb"

export function docDePrevia(tpl: Template, brandKit?: BrandKit) {
  const d = novoDocumento(tpl.nome, "", tpl.id, { brandKit })
  d.frames[0].textos.titulo = tpl.nome
  d.frames[0].textos.subtitulo = tpl.descricao.split(".")[0]
  return d
}

export function TemplateCard({ tpl, posts, sel, onClick, compact, brandKit }: { tpl: Template; posts: Post[]; sel?: boolean; onClick?: () => void; compact?: boolean; brandKit?: BrandKit }) {
  const doc = useMemo(() => docDePrevia(tpl, brandKit), [tpl, brandKit])
  const k = moldeKeyDoTemplate(tpl)
  const ps = posts.filter((p) => p.molde === k)
  const med = ps.length ? ps.reduce((a, p) => a + p.leads, 0) / ps.length : null
  const alc = ps.map((p) => p.alc).filter((v): v is number => v != null)
  const alcMed = alc.length ? alc.reduce((a, b) => a + b, 0) / alc.length : null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={sel}
      className={cn(
        "relative flex flex-col gap-2.5 rounded-[10px] border bg-[var(--ops-card)] text-left transition-colors",
        compact ? "p-2" : "p-3",
        sel ? "border-[var(--ops-accent)] shadow-[0_0_0_2px_var(--ops-track)]" : "border-[var(--ops-border)] hover:border-[var(--ops-mut)]",
      )}
    >
      {sel && (
        <span className="absolute right-3.5 top-3.5 z-[2] inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--ops-accent)] text-[var(--ops-on-accent)] shadow">
          <Icon icon={Check} customSize={12} />
        </span>
      )}
      <div className="relative aspect-[4/5] overflow-hidden rounded-[7px]">
        <div className="absolute inset-0">
          <ThumbFit doc={doc} ix={0} />
        </div>
      </div>
      <div>
        <div className={cn("font-semibold text-[var(--ops-title)]", compact ? "text-[12px]" : "text-[12.5px]")}>{tpl.nome}</div>
        {!compact && <div className="mt-0.5 text-[11px] leading-[1.45] text-[var(--ops-sec)]">{tpl.descricao}</div>}
        <div className={cn("flex flex-col gap-0.5 text-[10.5px] text-[var(--ops-mut)]", compact ? "mt-1" : "mt-2")} style={TNUM}>
          <span className="whitespace-nowrap">
            {tpl.frames.length} frames · {ps.length} {ps.length === 1 ? "post publicado" : "posts publicados"}
          </span>
          {med != null ? (
            <span className="whitespace-nowrap font-semibold text-[var(--ops-title)]">
              {fmtDec(med)} leads/post{alcMed != null ? ` · alcance ${fmtNum(Math.round(alcMed))}` : ""}
            </span>
          ) : (
            <span className="whitespace-nowrap">sem histórico ainda</span>
          )}
        </div>
      </div>
    </button>
  )
}
