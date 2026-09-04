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

import { fallbackChainFor } from "../html/hero-graft"
import { familiaPrincipal } from "./font-name"
export { familiaPrincipal } from "./font-name"
import type { TypographyOccurrence } from "./inventory"
import { sanitizarFamilia } from "./rules"
import type { TypographyOpHumana } from "./rules"

/** Limiar de "isto é título" — o mesmo da normalização da montagem. */
const HEADING_MIN_PX = 20
const HEADING_TAGS = new Set(["h1", "h2", "h3"])

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

// ── Troca por NOME de família, no documento inteiro ──────────────────────

/**
 * O `<style>` do head também declara família — o esqueleto legado
 * (`html/default-reference.ts`) traz `font-family: 'Inter', Arial,
 * sans-serif`, e as variantes da biblioteca podem trazer `<style>` próprio.
 * O inventário corta em `<body>` de propósito (o agente decide sobre o que
 * se vê), então uma troca que só olhasse o corpo deixaria o Gmail webmail —
 * que honra `<style>` embutido — com a fonte antiga em tudo que herda.
 *
 * Este regex é o do `hero-graft` (não o do inventário): ele entende nome
 * entre aspas, e aqui o casamento é por NOME, não por posição. Os dois
 * contratos são diferentes de propósito e não devem ser misturados.
 */
const FAMILY_DECL_RE = /font-family\s*:\s*((?:'[^']*'|"[^"]*"|[^;}"'])+)/gi

export interface RemapResult {
  html: string
  trocadas: number
}

/**
 * Troca a família das declarações cuja PRIMEIRA família casa com uma chave
 * do mapa (comparação sem caixa e sem aspas). Varre head e corpo.
 *
 * Só troca VALOR: não cria nem apaga declaração, então a contagem que os
 * invariantes checam não muda.
 */
export function remapFamilies(
  html: string,
  mapa: Readonly<Record<string, string>>,
): RemapResult {
  const alvo = new Map<string, string>()
  for (const [de, para] of Object.entries(mapa)) {
    const nome = sanitizarFamilia(para)
    const chave = familiaPrincipal(de)
    if (nome && chave) alvo.set(chave, nome)
  }
  if (alvo.size === 0) return { html, trocadas: 0 }

  let trocadas = 0
  const out = html.replace(FAMILY_DECL_RE, (match, stack: string) => {
    const nova = alvo.get(familiaPrincipal(stack))
    if (!nova) return match
    trocadas++
    const comAspas = /\s/.test(nova) ? `'${nova}'` : nova
    return `font-family:${comAspas},${fallbackChainFor(nova)}`
  })
  return { html: out, trocadas }
}

/**
 * As famílias do documento com quantas vezes cada uma aparece — o que o
 * painel mostra. Depois que o tipógrafo age a peça tem TRÊS famílias, então
 * dois seletores (título e corpo) não descrevem o documento: listar o que
 * está lá e deixar remapear é a verdade, e sai de graça.
 */
export function familiasDoDocumento(
  inventario: ReadonlyArray<TypographyOccurrence>,
): Array<{ familia: string; ocorrencias: number; maiorTamanho: number | null }> {
  const mapa = new Map<string, { familia: string; ocorrencias: number; maiorTamanho: number | null }>()
  for (const oc of inventario) {
    const chave = familiaPrincipal(oc.family)
    if (!chave) continue
    const atual = mapa.get(chave)
    // Guarda o nome como está escrito no documento (com a caixa original).
    const nome = (oc.family.split(",")[0] ?? "").replace(/["']/g, "").trim()
    if (!atual) {
      mapa.set(chave, { familia: nome, ocorrencias: 1, maiorTamanho: oc.sizePx })
    } else {
      atual.ocorrencias++
      if (oc.sizePx !== null && (atual.maiorTamanho === null || oc.sizePx > atual.maiorTamanho)) {
        atual.maiorTamanho = oc.sizePx
      }
    }
  }
  return [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias)
}
