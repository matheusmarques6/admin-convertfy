"use client"

/**
 * Estado vazio "em breve" das rotas do módulo Conteúdo que ainda não têm
 * tela (Reels, Calendário, Ideias). Mesmo container e tokens do dashboard
 * (--ops-*), com atalhos para o que já existe.
 */

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"

export function ConteudoEmBreve({
  icon,
  titulo,
  descricao,
  itens,
}: {
  icon: LucideIcon
  titulo: string
  descricao: string
  /** O que a tela vai fazer quando chegar. */
  itens: string[]
}) {
  return (
    <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
        <div className="flex flex-wrap items-end gap-3.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Conteúdo</div>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">{titulo}</h1>
            <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">{descricao}</div>
          </div>
        </div>

        <div className="flex flex-col items-center rounded-[10px] border border-dashed border-[var(--ops-border)] bg-[var(--ops-card)] px-6 py-14 text-center">
          <span className="flex text-[var(--ops-mut)]">
            <Icon icon={icon} customSize={28} />
          </span>
          <div className="mt-3 text-[14px] font-semibold text-[var(--ops-title)]">Em breve</div>
          <div className="mt-1 max-w-[440px] text-[12.5px] leading-relaxed text-[var(--ops-sec)]">
            Esta tela ainda está sendo construída. Enquanto ela não chega, o Dashboard e o Estúdio já estão completos.
          </div>
          <ul className="mt-5 flex w-full max-w-[420px] flex-col gap-1.5 text-left">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--ops-text)]">
                <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--ops-mut)]" />
                {i}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href={ROUTES.ADMIN.CONTEUDO.DASHBOARD}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ops-accent)] px-3 text-[12px] font-semibold text-[var(--ops-on-accent)]"
            >
              Abrir o Dashboard
              <Icon icon={ArrowRight} customSize={12} />
            </Link>
            <Link
              href={ROUTES.ADMIN.CONTEUDO.ESTUDIO}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-3 text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]"
            >
              Abrir o Estúdio
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
