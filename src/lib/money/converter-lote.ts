/**
 * Converter para real o que vem de VÁRIAS lojas com moedas diferentes.
 *
 * O dashboard soma 54 lojas — libra, euro, zloty, coroa dinamarquesa — e
 * publica o resultado com "R$" na frente. Três caminhos faziam essa soma
 * **sem converter nada**: a série diária (`store_daily_metrics`, que TEM
 * a coluna `currency` e não a selecionava), o fallback por campanhas do
 * gráfico e o card Performance do Email. Somar 1 libra como 1 real
 * SUBESTIMA em ~7×, e o total continua parecendo plausível — é o modo de
 * falha mais caro deste dashboard, porque ninguém desconfia de um número
 * que só está menor do que deveria.
 *
 * A conversão é feita **uma vez por MOEDA**, não por linha: são poucas
 * moedas distintas e milhares de linhas, e `convertToBRL` já tem cache em
 * três camadas. `taxasPara` busca; `somarEmBRL` (puro) soma.
 */

import { convertToBRL } from "@/lib/services/exchange-rate.service"

/** Quantos reais vale UMA unidade de cada moeda pedida. */
export type TaxasPorMoeda = Map<string, number>

/** Moeda vazia/desconhecida cai em BRL — o mesmo default do resto do código. */
export function normalizarMoeda(m: string | null | undefined): string {
  const c = (m || "").trim().toUpperCase()
  return c || "BRL"
}

/**
 * Taxa de cada moeda distinta da lista (reais por 1 unidade).
 *
 * Câmbio indisponível vira taxa **1**, que é o comportamento antigo — o
 * valor entra na moeda original em vez de sumir do total. Quem precisa
 * denunciar isso na tela usa `moedasNaoConvertidas`.
 */
export async function taxasPara(
  moedas: Iterable<string | null | undefined>,
): Promise<TaxasPorMoeda> {
  const distintas = new Set<string>()
  for (const m of moedas) distintas.add(normalizarMoeda(m))
  const taxas: TaxasPorMoeda = new Map()
  await Promise.all(
    [...distintas].map(async (moeda) => {
      if (moeda === "BRL") {
        taxas.set(moeda, 1)
        return
      }
      // `convertToBRL(1, moeda)` devolve quantos reais vale uma unidade —
      // e reaproveita o cache que as outras rotas já aqueceram.
      const umaUnidade = await convertToBRL(1, moeda)
      taxas.set(moeda, Number.isFinite(umaUnidade) && umaUnidade > 0 ? umaUnidade : 1)
    }),
  )
  return taxas
}

/** Moedas que a conversão não conseguiu resolver (taxa 1 fora do BRL). */
export function moedasNaoConvertidas(taxas: TaxasPorMoeda): string[] {
  return [...taxas.entries()].filter(([m, t]) => m !== "BRL" && t === 1).map(([m]) => m)
}

/** Um valor na moeda dele, em reais. Puro. */
export function emBRL(
  valor: number | string | null | undefined,
  moeda: string | null | undefined,
  taxas: TaxasPorMoeda,
): number {
  const n = Number(valor) || 0
  if (n === 0) return 0
  return n * (taxas.get(normalizarMoeda(moeda)) ?? 1)
}

/** Soma de linhas com moedas diferentes, em reais. Puro. */
export function somarEmBRL<T>(
  linhas: readonly T[],
  valorDe: (l: T) => number | string | null | undefined,
  moedaDe: (l: T) => string | null | undefined,
  taxas: TaxasPorMoeda,
): number {
  let total = 0
  for (const l of linhas) total += emBRL(valorDe(l), moedaDe(l), taxas)
  return total
}
