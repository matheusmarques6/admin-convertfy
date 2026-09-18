/**
 * escala-do-botao — o botão que o agente manda criar nasce do tamanho DESTA
 * peça, não de uma constante.
 *
 * Medido em 11/09, renderizando a peça a 600px no Chromium (Hero Boxers,
 * welcome 1). Os três botões inseridos pelo Cores & Botões saíram
 * 152×48, 139×48 e 159×48 com fonte de 15px; o botão nativo da mesma peça
 * mede 368×59 com fonte de 24px, e o corpo de texto roda em 24px com título
 * em 50px. **41% da largura e 62% da altura** do vizinho — "nem parece um
 * CTA", e é exatamente isso.
 *
 * A causa é uma constante: `cta-template.ts` monta o botão com
 * `font-size:15px` e `padding:14px 36px`, copiados do template de
 * referência da casa. É o tamanho certo para uma peça de proporções médias
 * e errado para todas as outras, porque o template nunca olhava a peça em
 * que estava entrando — enquanto `ctas_json` já carregava largura, raio e
 * (agora) tipografia de cada botão existente. O dado servia para recolorir
 * e era descartado na hora de criar.
 *
 * **Só botão PREENCHIDO define a escala.** No caso real, dos 7 CTAs do
 * documento 6 são os links "Link Here" do rodapé, vazados, com 18px — a
 * mediana de todos seria puxada por eles e o botão novo sairia menor ainda.
 * Preenchido é o botão de ação; vazado é secundário ou navegação. Na falta
 * de preenchidos vale o conjunto, e na falta de tudo vale o padrão da casa.
 *
 * **Mediana, não média**: um botão gigante de banner não pode deslocar a
 * escala inteira, e com dois valores a mediana devolve o menor — o lado
 * conservador quando a peça é ambígua.
 *
 * Puro (zero I/O) — testável.
 */

import { EMAIL_WIDTH } from "@/lib/email-workspace/email-width"
import type { Cta } from "./color-faixas"

/**
 * Piso de largura para um botão ser de SEÇÃO.
 *
 * O botão que o agente manda criar é de seção: entra numa `<tr>` própria,
 * centralizado, na largura da faixa. Um botão de CARD de produto vive numa
 * coluna e é pequeno por DESENHO — aumentá-lo quebraria a grade —, então
 * ele não pode decidir a escala do outro.
 *
 * Medido no Chromium em 17/09 (Innova Bay, welcome 1): os botões de seção
 * fazem 354–405px com fonte de 22–32px; os três de card fazem 164px com
 * fonte de 20px. A mediana dos seis preenchidos dava **20px** — o botão
 * novo nascia do tamanho do menor botão da peça. É o defeito de 11/09 pela
 * outra ponta: lá o filtro `preenchido` tirou os "Link Here" do rodapé, e
 * botão de card também é preenchido.
 *
 * Metade da largura canônica: os de seção passam com folga, os de card e
 * os de menu de rodapé (236px, em duas colunas) ficam de fora.
 */
export const LARGURA_DE_BOTAO_DE_SECAO = Math.round(EMAIL_WIDTH / 2)

/** O padrão da casa, de `default-reference.ts`. Vale quando a peça não fala. */
export const ESCALA_PADRAO = {
  fontSizePx: 15,
  peso: 600,
  paddingV: 14,
  paddingH: 36,
  radiusPx: 4,
} as const

export interface EscalaDoBotao {
  fontSizePx: number
  peso: number
  paddingV: number
  paddingH: number
  radiusPx: number
  /**
   * Qual degrau respondeu: `secao` = os botões de seção da peça (o melhor
   * dado); `peca` = todos os preenchidos, ou todos, quando nenhum é de
   * seção; `padrao` = a peça não declarou nada.
   */
  origem: "secao" | "peca" | "padrao"
  /** Quantos botões entraram na conta — 0 quando a origem é o padrão. */
  base: number
}

/** Mediana de uma lista não vazia; com par de valores devolve o menor. */
function mediana(ns: number[]): number {
  const ord = [...ns].sort((a, b) => a - b)
  return ord[Math.floor((ord.length - 1) / 2)]
}

/** Mediana dos valores conhecidos, ou o padrão quando ninguém declara. */
function medianaOu(valores: Array<number | null | undefined>, padrao: number): number {
  const ns = valores.filter((v): v is number => typeof v === "number" && v > 0)
  return ns.length > 0 ? mediana(ns) : padrao
}

/**
 * A escala que um botão novo deve ter nesta peça.
 *
 * Cada dimensão cai para o padrão de forma independente: peça cujos botões
 * declaram tamanho de fonte mas não declaram raio herda a fonte e usa o
 * raio da casa, em vez de descartar a medida inteira por um campo ausente.
 */
export function escalaDoBotao(ctas: Cta[]): EscalaDoBotao {
  const preenchidos = ctas.filter((c) => c.tipo === "preenchido")
  const deSecao = preenchidos.filter(
    (c) => c.largura_px != null && c.largura_px >= LARGURA_DE_BOTAO_DE_SECAO,
  )
  // Cada degrau só é usado quando o de cima está vazio — peça que não
  // declara largura nenhuma continua medindo como antes.
  const base = deSecao.length > 0 ? deSecao : preenchidos.length > 0 ? preenchidos : ctas
  const classe: "secao" | "peca" = deSecao.length > 0 ? "secao" : "peca"
  if (base.length === 0) {
    return { ...ESCALA_PADRAO, peso: ESCALA_PADRAO.peso, origem: "padrao", base: 0 }
  }
  // Só conta como "medida da peça" quando alguma dimensão foi de fato
  // declarada; botões sem nenhum estilo inline deixariam a origem mentindo.
  const declarou = base.some(
    (c) => c.font_size_px != null || c.padding_v != null || c.radius_px != null,
  )
  return {
    fontSizePx: medianaOu(base.map((c) => c.font_size_px), ESCALA_PADRAO.fontSizePx),
    peso: medianaOu(base.map((c) => c.peso), ESCALA_PADRAO.peso),
    paddingV: medianaOu(base.map((c) => c.padding_v), ESCALA_PADRAO.paddingV),
    paddingH: medianaOu(base.map((c) => c.padding_h), ESCALA_PADRAO.paddingH),
    radiusPx: medianaOu(base.map((c) => c.radius_px), ESCALA_PADRAO.radiusPx),
    origem: declarou ? classe : "padrao",
    base: declarou ? base.length : 0,
  }
}
