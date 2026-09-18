/**
 * cor-do-botao — a cor do botão é decidida por CÓDIGO, contra o fundo real.
 *
 * O agente decide que um botão existe, onde entra e o que diz; a cor sai
 * daqui. Batch 6249aef2: o segundo botão inserido saiu BRANCO sobre a
 * faixa branca — o agente escolheu `fundo`/`cor_label` pela faixa que
 * imaginou, e nenhuma régua conferiu o par contra o `<td>` real.
 *
 * A régua: só papéis da paleta (`ColorRoles`), o par label/fundo com
 * contraste ≥ AA (4,5:1) e o fundo do botão distinto da faixa em que
 * pousa (≥ 3:1, o mínimo de componente de interface). O pedido do agente
 * é aceito quando passa nas três; senão o código percorre os pares da
 * paleta na ordem da casa e registra o ajuste.
 *
 * Puro (zero I/O) — testável.
 */

import { AA_LARGE, AA_NORMAL, contrastRatio } from "./color-contrast"
import { canonicalHex, isColorLiteral } from "./color-inventory"

export interface PapeisParaBotao {
  button_bg: string
  button_text: string
  bg: string
  text: string
  surface?: string
  accent?: string
}

export interface CorDoBotao {
  fundo: string
  texto: string
  /** O código trocou o que o agente pediu (ou preencheu o que faltava). */
  ajustado: boolean
  motivo: string | null
  /** Contraste label/fundo do par escolhido. */
  contraste: number
}

const ok = (h: string | null | undefined): h is string => typeof h === "string" && isColorLiteral(h)

function passa(fundo: string, texto: string, faixa: string | null): boolean {
  if (contrastRatio(texto, fundo) < AA_NORMAL) return false
  if (faixa && contrastRatio(fundo, faixa) < AA_LARGE) return false
  return true
}

/**
 * @param fundoDaFaixa hex do fundo REAL em que o botão pousa; `null` em foto
 *   ou faixa sem fundo declarado (aí só o par label/fundo é conferido).
 * @param pedido o que o agente pediu, quando pediu.
 */
export function corDoBotao(
  fundoDaFaixa: string | null,
  roles: PapeisParaBotao,
  pedido: { fundo?: string | null; texto?: string | null } = {},
): CorDoBotao {
  const faixa = ok(fundoDaFaixa) ? canonicalHex(fundoDaFaixa) : null
  const paleta = new Set(
    [roles.button_bg, roles.button_text, roles.bg, roles.text, roles.surface, roles.accent]
      .filter(ok)
      .map(canonicalHex),
  )
  const pf = ok(pedido.fundo) ? canonicalHex(pedido.fundo) : null
  const pt = ok(pedido.texto) ? canonicalHex(pedido.texto) : null

  if (pf && pt) {
    const naPaleta = paleta.has(pf) && paleta.has(pt)
    if (naPaleta && passa(pf, pt, faixa)) {
      return { fundo: pf, texto: pt, ajustado: false, motivo: null, contraste: r(pt, pf) }
    }
  }

  // Ordem da casa: o botão da marca; o invertido (é o C3 — botão na faixa
  // da própria cor inverte); o acento; texto sobre fundo; fundo sobre texto.
  const pares: Array<[string | undefined, string | undefined, string]> = [
    [roles.button_bg, roles.button_text, "botão da marca"],
    [roles.button_text, roles.button_bg, "invertido (C3)"],
    [roles.accent, roles.button_text, "acento"],
    [roles.text, roles.bg, "texto sobre fundo"],
    [roles.bg, roles.text, "fundo sobre texto"],
  ]
  for (const [f, t, nome] of pares) {
    if (!ok(f) || !ok(t)) continue
    const cf = canonicalHex(f)
    const ct = canonicalHex(t)
    if (!passa(cf, ct, faixa)) continue
    const motivo =
      pf || pt
        ? `pedido ${pf ?? "?"}/${pt ?? "?"} não passa no AA sobre ${faixa ?? "fundo desconhecido"} — usado o par ${nome}`
        : `cor definida por código: par ${nome}`
    return { fundo: cf, texto: ct, ajustado: true, motivo, contraste: r(ct, cf) }
  }
  // Nenhum par da paleta atinge AA sobre esta faixa: o botão da marca entra
  // assim mesmo (é o que a identidade manda) e a telemetria diz o número.
  const cf = canonicalHex(ok(roles.button_bg) ? roles.button_bg : "#000000")
  const ct = canonicalHex(ok(roles.button_text) ? roles.button_text : "#FFFFFF")
  return {
    fundo: cf,
    texto: ct,
    ajustado: true,
    motivo: `nenhum par da paleta atinge AA sobre ${faixa ?? "fundo desconhecido"} — botão da marca mantido (${r(ct, cf)}:1)`,
    contraste: r(ct, cf),
  }
}

function r(texto: string, fundo: string): number {
  return Number(contrastRatio(texto, fundo).toFixed(2))
}

export interface CorDoLabel {
  texto: string
  /** O código trocou o que o agente pediu. */
  ajustado: boolean
  motivo: string | null
  /** Contraste do label contra o fundo da FAIXA. */
  contraste: number | null
}

/**
 * A cor do LABEL de um botão VAZADO — o par dele não é com um fundo próprio.
 *
 * 17/09, Innova Bay: o agente decidiu dar fundo aos seis links do menu do
 * rodapé ("vazados sem fundo definido recebem button_bg da marca para
 * visibilidade mínima") e o aplicador só troca fundo onde já existe um
 * (`apply-patches.ts`, `if (op.fundo && cta.fundo)`). O verde nunca entrou;
 * o label entrou. Os seis saíram BRANCOS sobre o rodapé `#FDFDFD` —
 * 1,01:1 medido no Chromium, invisíveis, e o único link legível do rodapé
 * passou a ser o de descadastrar.
 *
 * `corDoBotao` aprovou sem ajuste porque conferiu o par PEDIDO, que o
 * documento nunca recebe inteiro. Vazado pousa no fundo da FAIXA, e é
 * contra ele que o label tem de ser medido.
 *
 * Sem faixa conhecida não ajusta nada: afirmar contraste inventando o fundo
 * daria um número que ninguém pode conferir — a mesma razão pela qual
 * `extrairCtas` devolve `contraste: null` no vazado.
 */
export function corDoLabelVazado(
  fundoDaFaixa: string | null,
  roles: PapeisParaBotao,
  pedido: { texto?: string | null } = {},
): CorDoLabel {
  const pt = ok(pedido.texto) ? canonicalHex(pedido.texto) : null
  const faixa = ok(fundoDaFaixa) ? canonicalHex(fundoDaFaixa) : null
  if (!faixa) {
    return {
      texto: pt ?? canonicalHex(ok(roles.text) ? roles.text : "#000000"),
      ajustado: false,
      motivo: null,
      contraste: null,
    }
  }
  if (pt && contrastRatio(pt, faixa) >= AA_NORMAL) {
    return { texto: pt, ajustado: false, motivo: null, contraste: r(pt, faixa) }
  }
  // A tinta da peça primeiro: é a escolha neutra e sempre legível sobre o
  // fundo dela. Depois a cor da marca (que é o que o vazado costuma usar na
  // borda), o acento, e por fim os extremos.
  const ordem: Array<[string | undefined, string]> = [
    [roles.text, "tinta da peça"],
    [roles.button_bg, "cor da marca"],
    [roles.accent, "acento"],
    [roles.button_text, "cor do label do botão"],
    [roles.bg, "fundo da peça"],
  ]
  for (const [c, nome] of ordem) {
    if (!ok(c)) continue
    const cc = canonicalHex(c)
    if (contrastRatio(cc, faixa) < AA_NORMAL) continue
    return {
      texto: cc,
      ajustado: true,
      motivo: pt
        ? `o botão é vazado e o label pousa no fundo da faixa (${faixa}); ${pt} não atinge AA ali — usada a ${nome}`
        : `botão vazado: label definido por código contra a faixa (${faixa}) — ${nome}`,
      contraste: r(cc, faixa),
    }
  }
  // Nenhum papel da paleta atinge AA sobre esta faixa: mantém o que está lá
  // em vez de trocar por outro ilegível, e a telemetria diz o número.
  const atual = pt ?? canonicalHex(ok(roles.text) ? roles.text : "#000000")
  return {
    texto: atual,
    ajustado: false,
    motivo: `nenhum papel da paleta atinge AA sobre ${faixa} — label mantido (${r(atual, faixa)}:1)`,
    contraste: r(atual, faixa),
  }
}
