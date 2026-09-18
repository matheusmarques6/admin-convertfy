/**
 * separador-tinta — a cor do ornamento, decidida por código.
 *
 * Achado RENDERIZANDO as oito formas do catálogo no Chromium, e nenhum
 * teste pegaria: com a tinta em `#E3E3E3` sobre fundo branco, o filete, o
 * traço, os pontos e o losango **somem da tela**. A separação existiria no
 * HTML, custaria um PNG no Storage e não apareceria para ninguém — que é
 * pior que não ter separação, porque gasta sem entregar.
 *
 * Medido nos mesmos hex: `#E3E3E3` sobre `#FFFFFF` dá **1,28:1**;
 * `#C9C9C9` dá 1,66; `#B0B0B0` dá 2,13; o verde da marca (`#034326`) dá
 * 12,2 e desenha perfeitamente. O piso de {@link CONTRASTE_MINIMO} está em
 * 2,0: abaixo disso um filete de 1px não é sutil, é ausente.
 *
 * A divisão de trabalho é a de `cor-do-botao.ts`: o agente indica a
 * preferência entre os papéis da paleta, e o código confirma ou corrige.
 * Ele não tem como medir contraste, e pedir que meça é pedir aritmética a
 * quem já tem decisão de sobra para tomar.
 *
 * Puro (zero I/O).
 */

import { contrastRatio } from "./color-roles"
import type { PapeisParaBotao } from "./cor-do-botao"
import { canonicalHex, isColorLiteral } from "./color-inventory"

/**
 * O piso de contraste de um ornamento contra o fundo dele.
 *
 * Não é o 4,5:1 de texto nem o 3:1 de elemento de interface: um filete
 * decorativo pode ser discreto. É o ponto medido em que ele deixa de
 * existir na tela.
 */
export const CONTRASTE_MINIMO = 2.0

export interface TintaEscolhida {
  /** `null` = nenhum papel da paleta serve; a separação não entra. */
  tinta: string | null
  /** O código trocou o que o agente pediu. */
  trocada: boolean
  /** Por que trocou, ou por que não há tinta. */
  motivo: string | null
}

const ok = (h: string | null | undefined): h is string =>
  typeof h === "string" && isColorLiteral(h)

/**
 * A tinta que o ornamento vai usar sobre `fundo`.
 *
 * A cascata prefere `accent` — é o papel que existe para destacar — e cai
 * para `button_bg` e depois `text`, nesta ordem porque um filete na cor do
 * texto é o mais forte e o mais genérico: serve quase sempre, e por isso é
 * tarde, não primeiro.
 *
 * `button_text` e `bg` fecham a lista porque são as cores CLARAS da paleta,
 * e sem elas uma faixa escura ficava sem tinta possível quando o acento da
 * marca também é escuro — o ornamento sumiria exatamente onde a peça mais
 * precisa dele, e o teste que escrevi para esse caso passou pelo motivo
 * errado (o acento daquela loja é claro).
 */
export function tintaDoOrnamento(
  fundo: string | null | undefined,
  pedida: string | null | undefined,
  papeis: PapeisParaBotao | null | undefined,
): TintaEscolhida {
  if (!ok(fundo)) {
    return { tinta: null, motivo: "a faixa não declara fundo — sem ele o contraste não é medível", trocada: false }
  }
  const base = canonicalHex(fundo)
  const serve = (h: string | null | undefined) =>
    ok(h) && contrastRatio(canonicalHex(h), base) >= CONTRASTE_MINIMO

  if (serve(pedida)) return { tinta: canonicalHex(pedida as string), trocada: false, motivo: null }

  const razao = ok(pedida)
    ? `${canonicalHex(pedida)} sobre ${base} dá ${contrastRatio(canonicalHex(pedida), base).toFixed(2)}:1`
    : "nenhuma tinta foi pedida"

  for (const papel of [
    papeis?.accent,
    papeis?.button_bg,
    papeis?.text,
    papeis?.button_text,
    papeis?.bg,
  ]) {
    if (serve(papel)) {
      return {
        tinta: canonicalHex(papel as string),
        trocada: true,
        motivo: `${razao} — abaixo do piso de ${CONTRASTE_MINIMO}:1; o código usou ${canonicalHex(papel as string)}`,
      }
    }
  }
  return {
    tinta: null,
    trocada: false,
    motivo: `${razao}, e nenhum papel da paleta alcança o piso de ${CONTRASTE_MINIMO}:1 sobre este fundo`,
  }
}
