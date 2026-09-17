/**
 * Espionagem — ler o perfil público de um concorrente e achar o TEMA que
 * performou, não o post que tem o maior número.
 *
 * A tela que isto copia ordena por "mais quentes = curtidas + comentários
 * dos posts carregados". Num perfil de 68 mil seguidores isso ranqueia o
 * tamanho da conta, não o acerto: o pior post de um perfil grande ganha do
 * melhor de um pequeno, e o que se quer saber é **o que funcionou ACIMA do
 * normal daquele perfil**. Por isso aqui existem dois eixos, e o padrão é o
 * segundo:
 *
 * - `quente` — curtidas + comentários, o absoluto (o deles).
 * - `destaque` — quantas vezes o post passou da MEDIANA do próprio perfil.
 *   É o número que diz "este tema puxou audiência", e é ele que decide se
 *   vale escrever sobre o assunto.
 *
 * **A fórmula é PARCIAL e a tela é obrigada a dizer isso.** `business_discovery`
 * entrega curtidas e comentários e mais nada — sem alcance, sem salvos, sem
 * compartilhamentos. `taxaDeEngajamento` já nasceu com o campo `completa`
 * para este caso: comparar essa taxa com a do nosso perfil (que tem a
 * fórmula inteira) sem declarar a diferença seria comparar coisas distintas.
 *
 * **A pauta não carrega a copy alheia.** "Usar este tema" leva o ASSUNTO e
 * a instrução de escrever do nosso ângulo — copiar o texto do concorrente é
 * o que transforma pesquisa em plágio, e o resultado ainda sai com a voz
 * errada.
 */

import { taxaDeEngajamento } from "../metricas/sinais"
import type { Formato } from "../types"

export interface PerfilRival {
  handle: string
  nome: string | null
  bio: string | null
  avatar: string | null
  seguidores: number | null
  posts: number | null
}

export interface PostRival {
  id: string
  fmt: Formato
  /** Primeira linha útil da legenda — o tema. */
  head: string
  legenda: string | null
  curtidas: number | null
  comentarios: number | null
  permalink: string | null
  thumb: string | null
  publicadoEm: string | null
  slides: number | null
}

export interface PostAnalisado extends PostRival {
  /** Curtidas + comentários — o eixo absoluto (o da referência). */
  quente: number
  /**
   * Quantas vezes o post passou da MEDIANA do próprio perfil.
   * `null` com amostra curta: com 3 posts "2,4× a mediana" é ruído.
   */
  destaque: number | null
  /** (curtidas + comentários) ÷ seguidores × 100. `null` sem seguidores. */
  taxa: number | null
}

export interface AnaliseDoRival {
  perfil: PerfilRival
  posts: PostAnalisado[]
  /** Mediana de curtidas + comentários do perfil — a base do `destaque`. */
  medianaQuente: number | null
  /** Taxa mediana do perfil, na fórmula PARCIAL. `null` sem seguidores. */
  taxaMediana: number | null
  /** A fórmula usada, para a tela mostrar de onde veio o número. */
  formula: string
  /** Sempre falso aqui: de terceiro não há salvos nem compartilhamentos. */
  completa: boolean
  /** Quantos posts entraram na mediana — o piso da amostra. */
  amostra: number
}

/** Abaixo disto a mediana é ruído e `destaque` não é calculado. */
const MINIMO_PARA_MEDIANA = 5

export function mediana(ns: readonly number[]): number | null {
  if (ns.length === 0) return null
  const o = [...ns].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Primeira linha útil da legenda (sem hashtag solta), até 120 caracteres. */
export function temaDaLegenda(legenda: string | null): string {
  const linha = (legenda ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^#/.test(l))
  if (!linha) return "(sem legenda)"
  return linha.length > 120 ? `${linha.slice(0, 117).trimEnd()}…` : linha
}

/** Formato a partir dos campos da Graph API. */
export function formatoDoRival(mediaType: string | null, productType: string | null): Formato {
  if (mediaType === "CAROUSEL_ALBUM") return "Carrossel"
  if (mediaType === "VIDEO") return productType === "REELS" || productType == null ? "Reels" : "Vídeo"
  return "Imagem"
}

export function analisarRival(perfil: PerfilRival, posts: readonly PostRival[]): AnaliseDoRival {
  const quentes = posts.map((p) => (p.curtidas ?? 0) + (p.comentarios ?? 0))
  const med = posts.length >= MINIMO_PARA_MEDIANA ? mediana(quentes) : null
  const t = taxaDeEngajamento({ curtidas: 0, comentarios: 0 }, perfil.seguidores)

  const analisados: PostAnalisado[] = posts.map((p, i) => {
    const quente = quentes[i]
    return {
      ...p,
      quente,
      destaque: med != null && med > 0 ? quente / med : null,
      taxa: taxaDeEngajamento({ curtidas: p.curtidas, comentarios: p.comentarios }, perfil.seguidores).valor,
    }
  })

  return {
    perfil,
    posts: analisados,
    medianaQuente: med,
    taxaMediana: med != null && perfil.seguidores ? (med / perfil.seguidores) * 100 : null,
    formula: t.formula,
    completa: false,
    amostra: posts.length,
  }
}

export type Ordem = "destaque" | "quente" | "recentes"
export type FiltroFmt = "Todos" | Formato

/**
 * Ordena e filtra.
 *
 * `destaque` cai para `quente` quando a amostra é curta — ordenar por um
 * número que não existe deixaria a lista em ordem arbitrária sem ninguém
 * perceber.
 */
export function ordenarPosts(posts: readonly PostAnalisado[], ordem: Ordem, fmt: FiltroFmt = "Todos"): PostAnalisado[] {
  const base = fmt === "Todos" ? [...posts] : posts.filter((p) => p.fmt === fmt)
  if (ordem === "recentes") return base.sort((a, b) => (b.publicadoEm ?? "").localeCompare(a.publicadoEm ?? ""))
  if (ordem === "destaque" && base.some((p) => p.destaque != null)) return base.sort((a, b) => (b.destaque ?? 0) - (a.destaque ?? 0))
  return base.sort((a, b) => b.quente - a.quente)
}

/**
 * A pauta que "Usar este tema" leva ao Estúdio.
 *
 * Só o ASSUNTO e a instrução de ângulo próprio. A legenda do concorrente
 * fica de fora de propósito: ela levaria a voz dele junto, e é a diferença
 * entre pesquisar e copiar.
 */
export function pautaDoTema(p: Pick<PostAnalisado, "head" | "fmt">, handle: string): string {
  return [
    `Tema que performou no perfil @${handle.replace(/^@/, "")} (${p.fmt}): ${p.head}`,
    "Escreva do nosso ângulo, com a nossa voz e os nossos exemplos. Não reproduza o texto do post original.",
  ].join("\n\n")
}

/**
 * Como o perfil do rival se compara com o nosso, na MESMA fórmula parcial.
 *
 * Recebe a taxa parcial do nosso perfil (curtidas + comentários ÷
 * seguidores) porque comparar a fórmula parcial dele com a completa nossa
 * inflaria o nosso lado — a conta pareceria a nosso favor por construção.
 */
export interface Comparacao {
  /** A razão crua (deles ÷ nosso) — quem faz conta usa esta. */
  razao: number
  /**
   * O número que a TELA mostra: sempre ≥ 1, na direção que a legenda diz.
   *
   * Sem isto o card exibia "0,1×" com a legenda "o seu perfil engaja 6,7× o
   * deles" logo ao lado — número contradizendo a própria legenda, defeito
   * que nenhum teste pega e que apareceu no primeiro render.
   */
  vezes: number
  quem: "deles" | "nosso" | "empate"
  nota: string
}

export function compararComONosso(taxaRival: number | null, taxaNossaParcial: number | null): Comparacao | null {
  if (taxaRival == null || taxaNossaParcial == null || taxaNossaParcial <= 0) return null
  const razao = taxaRival / taxaNossaParcial
  if (razao >= 1.1) {
    return { razao, vezes: razao, quem: "deles", nota: `o perfil deles engaja ${razao.toFixed(1).replace(".", ",")}× o seu, na mesma fórmula parcial` }
  }
  if (razao <= 0.9) {
    const inv = 1 / razao
    return { razao, vezes: inv, quem: "nosso", nota: `o seu perfil engaja ${inv.toFixed(1).replace(".", ",")}× o deles, na mesma fórmula parcial` }
  }
  return { razao, vezes: 1, quem: "empate", nota: "os dois perfis engajam praticamente o mesmo, na mesma fórmula parcial" }
}
