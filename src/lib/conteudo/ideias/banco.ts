/**
 * Banco de ideias: busca, filtros, ordenação e contagem por funil.
 *
 * Três decisões que erram em silêncio se ficarem na tela:
 *
 * 1. **Score da IA e voto do time são julgamentos DIFERENTES** e a tela
 *    ordena por um ou por outro. Somá-los num "score final" apagaria
 *    justamente a informação interessante: onde a máquina e o time
 *    discordam.
 * 2. **Ideia sem score não é ideia ruim** — é ideia não avaliada. Ela vai
 *    para o FIM da ordenação por score, nunca some da lista, e a tela
 *    mostra o traço no lugar do número.
 * 3. **A busca casa título E tag**, com cada palavra do termo em qualquer
 *    um dos dois: quem procura "carrinho viral" está lembrando de um
 *    pedaço do título e de uma hashtag ao mesmo tempo. Exigir a frase
 *    inteira num campo só não acha nada.
 *
 * Puro e testado.
 */

import type { EtapaFunil, Formato } from "../types"

export type FonteIdeia = "time" | "convertia" | "trend" | "dashboard" | "inbox" | "cs"
export type StatusIdeia = "banco" | "enviada" | "arquivada"
export type OrdemIdeias = "score" | "votos"

export interface Ideia {
  id: string
  titulo: string
  funil: EtapaFunil | null
  formato: Formato | null
  pilar: string | null
  tags: string[]
  fonte: FonteIdeia
  fonteDetalhe: string | null
  /** 0..100 da IA; null = não avaliada. */
  score: number | null
  porQue: string | null
  molde: string | null
  status: StatusIdeia
  votos: number
  /** O usuário atual já votou nesta? */
  votei: boolean
  reelId: string | null
  documentoId: string | null
  criadoEm: string
}

export interface FiltroIdeias {
  busca?: string
  /** null = todo o funil. */
  funil?: EtapaFunil | null
  /** null = todos os formatos. */
  formato?: Formato | null
  ordem?: OrdemIdeias
}

const normalizar = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

/** As palavras do termo, sem pontuação nem vazios. */
export function palavrasDaBusca(termo: string): string[] {
  return normalizar(termo)
    .replace(/[^a-z0-9#]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
}

/** Toda palavra do termo aparece no título OU em alguma tag. */
export function ideiaCasaBusca(ideia: Pick<Ideia, "titulo" | "tags">, termo: string): boolean {
  const palavras = palavrasDaBusca(termo)
  if (palavras.length === 0) return true
  const alvo = normalizar([ideia.titulo, ...ideia.tags].join(" "))
  return palavras.every((p) => alvo.includes(p))
}

/**
 * Filtra e ordena. Termo vazio e filtros nulos devolvem a MESMA referência
 * do array quando a ordem também não muda nada — a tela re-renderiza a
 * grade a cada tecla, e criar array novo à toa custa render.
 */
export function filtrarIdeias(ideias: Ideia[], filtro: FiltroIdeias = {}): Ideia[] {
  const { busca = "", funil = null, formato = null, ordem = "score" } = filtro

  let saida = ideias
  if (funil) saida = saida.filter((i) => i.funil === funil)
  if (formato) saida = saida.filter((i) => i.formato === formato)
  if (palavrasDaBusca(busca).length > 0) saida = saida.filter((i) => ideiaCasaBusca(i, busca))

  const ordenada = [...saida].sort((a, b) => {
    if (ordem === "votos") {
      if (b.votos !== a.votos) return b.votos - a.votos
    }
    // Não avaliada vai para o fim, sem sumir da lista.
    const sa = a.score ?? -1
    const sb = b.score ?? -1
    if (sb !== sa) return sb - sa
    if (ordem !== "votos" && b.votos !== a.votos) return b.votos - a.votos
    // Empate desempata por data e depois por id: ordem estável entre renders.
    if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? 1 : -1
    return a.id < b.id ? -1 : 1
  })

  return ordenada
}

/** Quantas ideias do banco em cada faixa do funil (o contador do topo). */
export function contarPorFunil(ideias: Ideia[]): { topo: number; meio: number; fundo: number; semFunil: number } {
  const c = { topo: 0, meio: 0, fundo: 0, semFunil: 0 }
  for (const i of ideias) {
    if (i.funil === "topo") c.topo++
    else if (i.funil === "meio") c.meio++
    else if (i.funil === "fundo") c.fundo++
    else c.semFunil++
  }
  return c
}

export const FONTE_LABEL: Record<FonteIdeia, string> = {
  time: "Time",
  convertia: "ConvertIA",
  trend: "Em alta",
  dashboard: "Dashboard",
  inbox: "Inbox",
  cs: "Call de CS",
}

/** O rótulo que a tela mostra no rodapé do card. */
export function fonteLabel(ideia: Pick<Ideia, "fonte" | "fonteDetalhe">): string {
  const base = FONTE_LABEL[ideia.fonte] ?? ideia.fonte
  const detalhe = (ideia.fonteDetalhe ?? "").trim()
  return detalhe ? `${base} · ${detalhe}` : base
}
