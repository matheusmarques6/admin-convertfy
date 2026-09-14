/**
 * Paleta da identidade visual: UMA cor principal e N secundárias.
 *
 * A Trilha B5 (14/09) tinha introduzido um papel FECHADO por cor
 * (`principal|fundo|texto|destaque|superficie`), com um select por cor na
 * tela e 422 no PATCH quando havia duas "principais". Medido no mesmo dia:
 * das 10 lojas com identidade, ZERO usam papel de lugar — 6 têm duas
 * "Principal" e 4 nenhuma. O papel presumia que cada cor mora num lugar só,
 * e quem decide onde a cor entra é o agente Cores & Botões, não o cadastro
 * (decisão do dono, 14/09).
 *
 * O modelo passa a ser o que a tela sempre teve em duas seções:
 * `colors_primary` = A cor da marca (uma), `colors_secondary` = apoio (N).
 * O `role` continua existindo na linha para os leitores antigos
 * (`color-roles.ts` deriva `button_bg` da principal e o resto por
 * luminância), mas é CARIMBADO por `normalizarPaleta`, não escolhido por
 * humano: a primeira primária vira `principal`, o excedente desce para as
 * secundárias sem papel. Puro (zero I/O).
 */

export const PAPEIS_DE_COR = ["principal", "fundo", "texto", "destaque", "superficie"] as const

export type PapelDeCor = (typeof PAPEIS_DE_COR)[number]

export const ROTULO_DO_PAPEL: Record<PapelDeCor, string> = {
  principal: "Principal — botões e títulos",
  fundo: "Fundo — canvas do e-mail",
  texto: "Texto — cor do corpo",
  destaque: "Destaque — acento pontual",
  superficie: "Superfície — painéis e faixas",
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")

/**
 * "Principal" → "principal"; "Superfície" → "superficie"; "Secundário",
 * "" e qualquer rótulo fora do vocabulário → "" (sem papel). Sem papel não
 * é erro: a derivação por luminância continua valendo para a cor.
 */
export function normalizarPapel(raw: unknown): PapelDeCor | "" {
  if (typeof raw !== "string") return ""
  const t = semAcento(raw.trim().toLowerCase())
  return (PAPEIS_DE_COR as readonly string[]).includes(t) ? (t as PapelDeCor) : ""
}

export function ehPapelDeCor(x: unknown): x is PapelDeCor {
  return typeof x === "string" && (PAPEIS_DE_COR as readonly string[]).includes(x)
}

export interface CorComPapel {
  hex?: string
  name?: string
  role?: string | null
}

export interface PaletaNormalizada<T extends CorComPapel> {
  /** Zero ou UMA cor, sempre com `role: "principal"`. */
  principal: T[]
  /** As demais, na ordem em que estavam, com `role: ""`. */
  secundarias: T[]
  /** Quantas primárias excedentes desceram para as secundárias. */
  movidas: number
}

/**
 * Uma principal, N secundárias — a régua que a tela e o PATCH aplicam.
 *
 * A primeira primária é a cor da marca; a segunda em diante desce para o
 * TOPO das secundárias (antes das que já estavam lá), porque quem cadastrou
 * duas "principais" pôs a mais importante primeiro — é a mesma ordem que a
 * derivação já usava para o botão. Papel de lugar (`fundo`, `texto`…) é
 * apagado nas secundárias: o agente decide onde a cor entra. Não altera o
 * hex nem o nome de ninguém, e nunca inventa cor: paleta vazia sai vazia.
 */
export function normalizarPaleta<T extends CorComPapel>(
  primarias: T[] = [],
  secundarias: T[] = [],
): PaletaNormalizada<T> {
  const [primeira, ...excedentes] = primarias
  const principal = primeira ? [{ ...primeira, role: "principal" as const }] : []
  const semPapel = (c: T): T => ({ ...c, role: "" })
  return {
    principal,
    secundarias: [...excedentes.map(semPapel), ...secundarias.map(semPapel)],
    movidas: excedentes.length,
  }
}
