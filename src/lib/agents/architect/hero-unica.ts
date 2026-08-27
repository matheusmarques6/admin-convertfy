/**
 * Uma hero por email — módulo PURO (sem I/O), aplicado depois que o Montador
 * escolhe e antes de o documento ser montado.
 *
 * Desde 27/08 a escolha de variante de OUTRA seção vale e a posição adota a
 * forma escolhida (`d18ab657`). Bom para tudo, menos para a hero: o
 * documento marca cada bloco com a forma da variante
 * (`cfy:block:{i}:{section}`), e o localizador da hero recusa por
 * ambiguidade quando acha dois blocos `hero` (`hero-locator.ts:173`). Sem
 * região, o step falha com `hero_region_not_found` → email `failed` com
 * `hero_failed`, e sem run nenhuma para explicar.
 *
 * Foi o que aconteceu no Welcome 1 da Innova: o Estruturador pediu
 * `hero · body · …` e o Montador pôs a variante "hero section 10" na posição
 * do body — um body com forma de hero. Documento com duas heroes, geração
 * perdida.
 *
 * A regra é na ESCOLHA, não no localizador: **no máximo uma posição do email
 * recebe variante de forma hero**. Quem fica com ela é quem tem o PAPEL de
 * hero; as demais descem o ranking do Curador atrás de uma forma diferente.
 */

/** Forma que só pode aparecer uma vez por email. */
const FORMA_UNICA = "hero"

export interface PosicaoEscolhida {
  /** Índice da posição no email (ordem do documento). */
  index: number
  /** Seção que o Estruturador/outline propôs para a posição — o PAPEL. */
  papel: string
  /** Variante escolhida pelo Montador. */
  escolhido: string | null
  /** Ranking do Curador para esta posição, em ordem de preferência. */
  finalistas: string[]
}

export interface TrocaDeHero {
  index: number
  papel: string
  /** Variante que estava escolhida. */
  de: string
  /** Variante que entrou no lugar — null quando não havia alternativa. */
  para: string | null
  motivo: "forma_hero_duplicada" | "sem_alternativa"
}

export interface ResultadoHeroUnica {
  /** Escolha final por posição, na mesma ordem da entrada. */
  escolhas: Array<{ index: number; variant_id: string | null }>
  /** O que foi trocado — telemetria: a regra nunca age em silêncio. */
  trocas: TrocaDeHero[]
}

/**
 * Garante uma única variante de forma `hero` no email.
 *
 * `formaDe` devolve o `block_type` da variante (undefined = fora do
 * catálogo, tratado como não-hero: inventar forma seria pior).
 *
 * Ordem da decisão:
 *   1. zero ou uma hero → nada muda (identidade);
 *   2. fica com a hero quem tem `papel === 'hero'`;
 *   3. sem ninguém com esse papel, fica a PRIMEIRA na ordem do documento —
 *      a hero é a abertura do email;
 *   4. as perdedoras descem as finalistas até a primeira forma não-hero;
 *   5. sem alternativa, a posição sai `null` (vira slot `missing`, que a
 *      montagem já sabe pular). Perder um bloco é ruim; derrubar a geração
 *      inteira é pior — e a troca fica registrada nos dois casos.
 */
export function garantirHeroUnica(
  posicoes: ReadonlyArray<PosicaoEscolhida>,
  formaDe: (variantId: string) => string | undefined,
): ResultadoHeroUnica {
  const escolhas = posicoes.map((p) => ({
    index: p.index,
    variant_id: p.escolhido,
  }))
  const trocas: TrocaDeHero[] = []

  const ehHero = (id: string | null | undefined): boolean =>
    Boolean(id) && formaDe(id as string) === FORMA_UNICA

  const comHero = posicoes.filter((p) => ehHero(p.escolhido))
  if (comHero.length <= 1) return { escolhas, trocas }

  const guardada =
    comHero.find((p) => p.papel === FORMA_UNICA) ??
    // Ordem do documento, não a ordem em que vieram na lista.
    [...comHero].sort((a, b) => a.index - b.index)[0]

  for (const p of comHero) {
    if (p.index === guardada.index) continue
    const alternativa =
      p.finalistas.find((id) => id !== p.escolhido && !ehHero(id)) ?? null
    const alvo = escolhas.find((e) => e.index === p.index)
    if (alvo) alvo.variant_id = alternativa
    trocas.push({
      index: p.index,
      papel: p.papel,
      de: p.escolhido as string,
      para: alternativa,
      motivo: alternativa ? "forma_hero_duplicada" : "sem_alternativa",
    })
  }

  return { escolhas, trocas }
}
