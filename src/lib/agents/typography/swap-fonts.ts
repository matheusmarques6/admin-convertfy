/**
 * Trocar as fontes da PEÇA inteira, a partir do painel de tipografia do
 * e-mail — sem passar por `normalizeFonts`.
 *
 * `normalizeFonts` (`html/hero-graft.ts`) reescreve TODA declaração do
 * documento. Rodá-la de novo num e-mail já finalizado desfaz o trabalho do
 * tipógrafo: a família secundária que ele injetou volta a ser a da loja (e o
 * `<link>` dela fica órfão no head), os pesos são achatados de volta e — pior
 * — um item de corpo que ele levou a 700 passa a satisfazer a heurística de
 * título e ganha também a família de título.
 *
 * Aqui a troca é cirúrgica: só as declarações cuja família É a principal
 * atual viram op. Quem está em outra família (a secundária do tipógrafo, um
 * mono deliberado num código de cupom) fica exatamente como está.
 *
 * O papel (título × corpo) sai do próprio inventário — `sizePx`, `weight` e a
 * tag —, espelhando o `looksLikeHeading` da normalização. Ler do inventário
 * em vez de reparsear o HTML é o que mantém as duas leituras alinhadas.
 *
 * Puro (zero I/O) — testável.
 */

import type { TypographyOccurrence } from "./inventory"
import type { TypographyOpHumana } from "./rules"

/** Limiar de "isto é título" — o mesmo da normalização da montagem. */
const HEADING_MIN_PX = 20
const HEADING_TAGS = new Set(["h1", "h2", "h3"])

/** Primeira família da cadeia, sem aspas e em minúsculas. */
export function familiaPrincipal(stack: string): string {
  return (stack.split(",")[0] ?? "")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase()
}

export function ehTitulo(oc: TypographyOccurrence): boolean {
  if (oc.sizePx !== null && oc.sizePx >= HEADING_MIN_PX) return true
  if (oc.weight !== null && oc.weight >= 600) return true
  return HEADING_TAGS.has(oc.tag)
}

export interface TrocaDeFontes {
  /** Família que está no documento hoje (título). Vazio = não troca título. */
  deTitulo?: string | null
  deCorpo?: string | null
  paraTitulo?: string | null
  paraCorpo?: string | null
  pesoTitulo?: number | null
  pesoCorpo?: number | null
}

/**
 * As ops da troca. Item que já está na família de destino não gera op — o
 * `applyTypographyOps` descartaria a reescrita sem efeito, mas devolver a op
 * mesmo assim inflaria a contagem que a tela mostra.
 */
export function opsParaTrocarFontesDaPeca(
  inventario: ReadonlyArray<TypographyOccurrence>,
  troca: TrocaDeFontes,
): TypographyOpHumana[] {
  const deTitulo = familiaPrincipal(troca.deTitulo ?? "")
  const deCorpo = familiaPrincipal(troca.deCorpo ?? "")
  const paraTitulo = (troca.paraTitulo ?? "").trim()
  const paraCorpo = (troca.paraCorpo ?? "").trim()

  const ops: TypographyOpHumana[] = []
  for (const oc of inventario) {
    const atual = familiaPrincipal(oc.family)
    const titulo = ehTitulo(oc)
    const deEsperado = titulo ? deTitulo : deCorpo
    // Só mexe em quem está na família que se pretende substituir. Sem esta
    // linha a troca vira `normalizeFonts` de novo, com o mesmo estrago.
    if (deEsperado && atual !== deEsperado) continue

    const familia = titulo ? paraTitulo : paraCorpo
    const peso = titulo ? troca.pesoTitulo : troca.pesoCorpo

    const trocaFamilia = Boolean(familia) && familiaPrincipal(familia) !== atual
    const trocaPeso =
      typeof peso === "number" && Number.isFinite(peso) && oc.weight !== peso
    if (!trocaFamilia && !trocaPeso) continue

    ops.push({
      item: oc.index,
      ...(trocaFamilia ? { familia } : {}),
      ...(trocaPeso ? { peso: peso as number } : {}),
      motivo: titulo ? "troca da fonte de título da peça" : "troca da fonte de corpo da peça",
    })
  }
  return ops
}
