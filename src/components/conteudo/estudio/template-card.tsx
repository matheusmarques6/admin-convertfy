"use client"

/**
 * Card de template com PRÉVIA REAL (o renderer desenha a capa com uma
 * headline de exemplo) + desempenho: posts publicados com o molde,
 * leads/post e tendência.
 */

import { useMemo } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { imagemBanco } from "@/lib/conteudo/data"
import { novoDocumento } from "@/lib/conteudo/documento"
import { moldeKeyDoTemplate } from "@/lib/conteudo/templates"
import type { Post, Template } from "@/lib/conteudo/types"
import { TNUM, fmtDec } from "../ui"
import { ThumbFit } from "./thumb"

const HEADLINE_EXEMPLO: Record<string, string> = {
  "molde-turbo": "8% dos clientes fazem 41% do faturamento",
  "molde-lista": "5 coisas que você precisa entender sobre e-mail",
  "molde-mec": "Quem faz o quê num time de e-mail que dá certo",
  "molde-bastidor": "O que eu fiz para dobrar a receita de SMS",
  "molde-benchmark": "A Sephora cresceu 75% em fidelidade sem desconto",
}

export function docDePrevia(tpl: Template) {
  const d = novoDocumento(HEADLINE_EXEMPLO[tpl.id] ?? tpl.nome, "convertfy", tpl.id)
  d.frames[0].textos.titulo = d.nome
  d.frames[0].imagens.slot1 = imagemBanco(`tpl${tpl.id}`)
  return d
}

export function TemplateCard({
  tpl,
  posts,
  sel,
  onClick,
  compact,
}: {
  tpl: Template
  posts: Post[]
  sel?: boolean
  onClick?: () => void
  compact?: boolean
}) {
  const doc = useMemo(() => docDePrevia(tpl), [tpl])
  const ps = posts.filter((p) => p.molde === moldeKeyDoTemplate(tpl))
  const med = ps.length ? ps.reduce((a, p) => a + p.leads, 0) / ps.length : tpl.leads
  const up = ps.length >= 2 ? ps[0].leads >= ps[ps.length - 1].leads : true
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
          <span className="whitespace-nowrap font-semibold text-[var(--ops-title)]">
            {fmtDec(med)} leads/post <span className={cn("font-bold", up ? "text-[var(--ops-pos)]" : "text-[var(--ops-neg)]")}>{up ? "↑" : "↓"}</span>
          </span>
        </div>
      </div>
    </button>
  )
}
