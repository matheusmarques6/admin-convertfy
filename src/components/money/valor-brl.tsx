"use client"

/**
 * Valor em real, com a memória de cálculo no hover.
 *
 * O dashboard consolida tudo em BRL. Sozinho, esse número é uma conta
 * sem as parcelas: quem lê não sabe que a loja fatura em euro, qual
 * cotação foi usada, nem de que dia ela é. Foi por isso que uma loja
 * polonesa cadastrada em EUR passou meses convertida errado — o valor
 * final continuava parecendo plausível.
 *
 * Aqui o real fica no texto (é o que se compara de relance) e o original
 * fica no hover. Duas variantes:
 *
 *  - `<ValorBRL>`   — uma parcela: uma loja, uma linha, uma moeda só.
 *  - `<ValorBRLTotal>` — um total de várias moedas: o hover mostra a
 *    COMPOSIÇÃO, porque ali não existe "o valor original".
 *
 * O `title` nativo vai junto de propósito: o Radix não abre no toque, e
 * em tablet o `title` é o que sobra. Também é o que aparece na
 * impressão do relatório.
 */

import * as React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  descreverParcela,
  explicarConversao,
  formatarBRL,
  formatarBRLCompacto,
  resumirComposicao,
  type ParcelaEmMoeda,
  type ValorConvertido,
} from "@/lib/money/conversao"
import { cn } from "@/lib/utils"

interface ValorBRLProps extends ValorConvertido {
  /** "R$ 1,2 mi" em vez do valor cheio. */
  compacto?: boolean
  semCentavos?: boolean
  className?: string
}

/** Sublinhado pontilhado — a dica visual de "tem mais aqui". */
const DICA = "underline decoration-dotted decoration-slate-300 underline-offset-4 cursor-help"

export function ValorBRL({ compacto, semCentavos, className, ...valor }: ValorBRLProps) {
  const linhas = explicarConversao(valor)
  const texto = compacto
    ? formatarBRLCompacto(valor.valorBRL)
    : formatarBRL(valor.valorBRL, { semCentavos })

  // Nada a explicar (já é real): texto puro, sem sublinhado nem tooltip
  // que só repetiria o que está na tela.
  if (linhas.length === 0) return <span className={className}>{texto}</span>

  return (
    <ExplicacaoNoHover linhas={linhas} alerta={valor.naoConvertido}>
      <span className={cn(DICA, valor.naoConvertido && "text-amber-600 dark:text-amber-400", className)}>
        {texto}
        {valor.naoConvertido && <span aria-hidden> ⚠</span>}
      </span>
    </ExplicacaoNoHover>
  )
}

interface ValorBRLTotalProps {
  /** Total já somado em BRL. */
  valorBRL: number
  /** As parcelas que formam o total — é o que o hover explica. */
  parcelas: ParcelaEmMoeda[]
  compacto?: boolean
  semCentavos?: boolean
  className?: string
}

export function ValorBRLTotal({
  valorBRL,
  parcelas,
  compacto,
  semCentavos,
  className,
}: ValorBRLTotalProps) {
  const resumo = resumirComposicao(parcelas)
  const texto = compacto ? formatarBRLCompacto(valorBRL) : formatarBRL(valorBRL, { semCentavos })

  if (resumo.soReal) return <span className={className}>{texto}</span>

  const linhas = [
    `Composto por ${resumo.porMoeda.length} moedas:`,
    ...resumo.porMoeda.map((m) => `• ${descreverParcela(m)}`),
  ]
  if (resumo.temNaoConvertido) {
    linhas.push(
      "⚠ Parte deste total NÃO foi convertida (câmbio indisponível) — o número mistura moedas.",
    )
  }

  return (
    <ExplicacaoNoHover linhas={linhas} alerta={resumo.temNaoConvertido}>
      <span className={cn(DICA, resumo.temNaoConvertido && "text-amber-600 dark:text-amber-400", className)}>
        {texto}
      </span>
    </ExplicacaoNoHover>
  )
}

function ExplicacaoNoHover({
  linhas,
  alerta,
  children,
}: {
  linhas: string[]
  alerta?: boolean
  children: React.ReactNode
}) {
  const comoTexto = linhas.join("\n")
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        {/* asChild: o gatilho é o próprio número, sem <button> no meio de
            uma célula de tabela. `title` cobre toque e impressão. */}
        <TooltipTrigger asChild>
          <span title={comoTexto}>{children}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px] px-3 py-2">
          <div className="space-y-1 text-[12px] leading-relaxed">
            {linhas.map((l, i) => (
              <div
                key={i}
                className={cn(
                  i === 0 && !alerta && "font-medium",
                  l.startsWith("⚠") && "text-amber-600 dark:text-amber-400",
                )}
              >
                {l}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
