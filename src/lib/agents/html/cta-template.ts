/**
 * cta-template — o markup do botão da casa, em uma função.
 *
 * O agente Cores & Botões decide ONDE um botão falta e o que ele diz; o
 * HTML sai daqui. É a divisão de sempre: o modelo devolve intenção, o
 * código escreve — e num e-mail isso não é preferência de estilo. Uma
 * `<tr>` mal fechada quebra o layout no Outlook sem quebrar o parser, e
 * nenhum guard de string pega isso.
 *
 * O markup é o do template de referência (`default-reference.ts`), com uma
 * diferença deliberada: **hex literal, nunca `var(--button-bg)`**. O
 * documento montado concatena variantes de origens diferentes e o bloco de
 * destino pode não estar sob o escopo dessas variáveis — a cor viria vazia
 * e o botão sairia transparente.
 *
 * Puro (zero I/O) — testável.
 */

/** Escapa o que entra em atributo com aspas duplas. */
function attr(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Escapa o texto visível do botão. */
function texto(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export interface BotaoNovo {
  /** O que o botão diz. */
  label: string
  /** Para onde ele leva — resolvido por código, nunca digitado pelo modelo. */
  href: string
  /** Fundo do botão (hex). */
  fundo: string
  /** Cor do label (hex). */
  corLabel: string
  /** Raio em px; herda o da peça para não misturar cantos (R8). */
  radiusPx?: number
  /** Família tipográfica da peça. */
  fontFamily?: string
  /**
   * Fundo da FAIXA em que a linha entra.
   *
   * A linha do botão é irmã da linha que pinta o bloco, não filha dela — o
   * fundo do bloco mora no `<td>` da linha anterior e não alcança esta.
   * Sem repeti-lo aqui, o botão pousa no canvas da tabela e aparece
   * flutuando fora da banda: foi o que o render mostrou, com todos os
   * testes de string passando. Ausente = a faixa não declara fundo e o
   * canvas é o certo.
   */
  fundoFaixa?: string
}

const RADIUS_PADRAO = 4
const FONT_PADRAO = "Arial, sans-serif"

/**
 * Uma `<tr>` autocontida com o botão centralizado.
 *
 * `<tr>` e não `<table>` de propósito: é o formato que o splice do enxerto
 * da hero já sabe inserir, e o que os blocos da biblioteca esperam receber
 * como linha nova.
 */
export function linhaDeBotao(b: BotaoNovo): string {
  const raio = b.radiusPx ?? RADIUS_PADRAO
  const fonte = b.fontFamily ?? FONT_PADRAO
  const banda = b.fundoFaixa
    ? ` bgcolor="${attr(b.fundoFaixa)}" style="background-color:${attr(b.fundoFaixa)};padding:24px 48px 32px 48px;"`
    : ` style="padding:24px 48px 32px 48px;"`
  return [
    `<tr>`,
    `<td align="center"${banda}>`,
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0">`,
    `<tr>`,
    `<td align="center" bgcolor="${attr(b.fundo)}" style="background-color:${attr(b.fundo)};border-radius:${raio}px;">`,
    `<a href="${attr(b.href)}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:${attr(fonte)};font-size:15px;line-height:20px;font-weight:600;color:${attr(b.corLabel)};text-decoration:none;">${texto(b.label)}</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</td>`,
    `</tr>`,
  ].join("")
}

/**
 * Onde a linha nova entra dentro da região de um bloco.
 *
 * Duas formas aparecem na biblioteca: o bloco é uma sequência de `<tr>`
 * (entra no fim da região) ou uma `<table>` fechada (entra antes do
 * `</table>` final, senão a linha ficaria FORA da tabela e o Outlook a
 * descarta). Qualquer outra coisa devolve `null` — não inventar lugar é o
 * que separa inserir um botão de corromper o documento.
 */
export function pontoDeInsercao(html: string, regiao: { start: number; end: number }): number | null {
  const miolo = html.slice(regiao.start, regiao.end)
  const semRabo = miolo.replace(/\s+$/, "")
  if (/<\/tr\s*>$/i.test(semRabo)) {
    return regiao.start + semRabo.length
  }
  if (/<\/table\s*>$/i.test(semRabo)) {
    const ultima = semRabo.toLowerCase().lastIndexOf("</table")
    return ultima === -1 ? null : regiao.start + ultima
  }
  return null
}
