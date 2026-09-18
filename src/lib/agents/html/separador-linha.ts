/**
 * separador-linha — a `<tr>` que carrega a separação.
 *
 * **Nada de `<table>` aqui dentro, e é guarda de vida.** O runner conta
 * `<table[\s>]` antes e depois do passo de cor e derruba o step quando a
 * conta não bate (`phase2-runner.service.ts`), e o step é FAIL-OPEN: a
 * exceção descartaria *todo* o plano de cor — faixas, botões, valores —,
 * não só a separação. A `<tr>` entra como irmã das linhas do documento,
 * pelo mesmo endereçamento do `add_cta`, e a contagem de tabelas não muda.
 *
 * O filete não vira imagem: três `<tr>` (respiro, linha, respiro) desenham
 * o mesmo e são a única forma que nenhum cliente de e-mail erra.
 *
 * Puro (zero I/O) — a URL do PNG chega pronta.
 */

import type { FormaDeSeparacao } from "./separador-catalogo"

export interface LinhaDeSeparacao {
  forma: FormaDeSeparacao
  /** O que está atrás: a faixa de cima (emenda) ou a faixa inteira (marca). */
  fundo: string
  /** A faixa de baixo (emenda) ou a tinta do ornamento (marca). */
  tinta: string
  /** A imagem já hospedada. Exigida em `render: "png"`. */
  src?: string | null
}

/** Célula vazia com altura — o espaçador que não precisa de tabela. */
function respiro(altura: number, fundo: string): string {
  return (
    `<tr><td bgcolor="${fundo}" height="${altura}" ` +
    `style="height:${altura}px;line-height:${altura}px;font-size:0;mso-line-height-rule:exactly">&nbsp;</td></tr>`
  )
}

/**
 * A(s) `<tr>` da separação, ou `""` quando não há como desenhá-la.
 *
 * String vazia em vez de `<tr>` com `<img src="">`: falhou o upload, a
 * separação não entra. Linha fantasma é pior que emenda seca — ela ocupa
 * altura, quebra o ritmo que o plano decidiu e não desenha nada.
 */
export function linhaDeSeparacao({ forma, fundo, tinta, src }: LinhaDeSeparacao): string {
  if (forma.render === "html") {
    // O filete: respiro, 1px, respiro. A altura declarada no catálogo é a
    // soma das três — se elas divergirem, o plano reserva um espaço e o
    // documento usa outro.
    const folga = Math.max(0, Math.round((forma.alturaPx - 1) / 2))
    return (
      respiro(folga, fundo) +
      `<tr><td bgcolor="${tinta}" height="1" ` +
      `style="height:1px;line-height:1px;font-size:0;mso-line-height-rule:exactly">&nbsp;</td></tr>` +
      respiro(folga, fundo)
    )
  }
  if (!src) return ""
  return (
    `<tr><td align="center" bgcolor="${fundo}" ` +
    `style="padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly">` +
    // `alt` VAZIO de propósito: é ornamento, e um leitor de tela anunciando
    // "onda decorativa" é ruído no meio da leitura. `bgcolor` na cor de
    // cima porque imagem bloqueada é rotina em e-mail — aí a peça volta ao
    // estado de hoje (emenda seca) em vez de abrir uma tira branca.
    `<img src="${src}" width="600" height="${forma.alturaPx}" alt="" ` +
    `style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none">` +
    `</td></tr>`
  )
}
