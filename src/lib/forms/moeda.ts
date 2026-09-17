/**
 * Faturamento em outra moeda: a faixa muda de rótulo, não de significado.
 *
 * O formulário de diagnóstico pergunta o faturamento mensal em REAL. Quem
 * vende nos Estados Unidos fatura em dólar e faz uma de duas coisas:
 * converte de cabeça (e erra), ou responde a faixa achando que é a moeda
 * dele. O segundo caso é o caro e é SILENCIOSO — uma loja de US$ 50 mil
 * (≈ R$ 250 mil) marca "Até R$100 mil", cai no final de recusa e nunca
 * mais é falada. Perder lead bom por causa da unidade é o pior desfecho
 * possível num funil de qualificação.
 *
 * O desenho tem três peças e a terceira é a que evita o defeito voltar:
 *
 * 1. Uma pergunta de REGIÃO antes do faturamento decide a moeda.
 * 2. As opções de faturamento são escritas na moeda da região — números
 *    redondos do mercado de lá, não a conversão do número daqui (ninguém
 *    responde "US$ 21.739").
 * 3. **Toda faixa carrega um PISO canônico em BRL.** É ele que a
 *    qualificação compara, não o texto. Renomear a opção no editor deixa
 *    de desligar o `LeadQualificado` em silêncio — o modo de falha que
 *    este repositório já pagou com um mês de evento sem sair —, e o funil
 *    consegue somar regiões diferentes na mesma conta.
 *
 * A taxa é FIXA e declarada, nunca cotação do dia: faixa de qualificação
 * é decisão comercial. Com cotação ao vivo o mesmo lead mudaria de lado
 * conforme o câmbio da manhã, e o relatório do mês passado mudaria
 * sozinho.
 */

import type { FormOption } from "@/types/forms-conversational"

export type Moeda = "BRL" | "USD" | "EUR"

/**
 * Quanto vale 1 unidade da moeda em REAL, para efeito de corte comercial.
 *
 * Números redondos de propósito. Eles não pagam ninguém — só põem faixas
 * de moedas diferentes na mesma régua.
 */
export const TAXA_PARA_BRL: Record<Moeda, number> = {
  BRL: 1,
  USD: 5,
  EUR: 6,
}

export const SIMBOLO: Record<Moeda, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
}

export interface RegiaoDeVenda {
  /** O que é gravado na resposta. */
  value: string
  label: string
  moeda: Moeda
}

/**
 * Para onde a loja vende. A moeda sai daqui.
 *
 * LATAM e "vários países" caem em dólar porque é a moeda em que a
 * operação de dropshipping global fatura e pensa — pedir a moeda local de
 * cada país da LATAM daria uma lista que ninguém responde.
 */
export const REGIOES: readonly RegiaoDeVenda[] = [
  { value: "Brasil", label: "Brasil", moeda: "BRL" },
  { value: "Estados Unidos", label: "Estados Unidos", moeda: "USD" },
  { value: "Europa", label: "Europa", moeda: "EUR" },
  { value: "LATAM (fora do Brasil)", label: "LATAM (fora do Brasil)", moeda: "USD" },
  { value: "Vários países", label: "Vários países (worldwide)", moeda: "USD" },
] as const

/**
 * A moeda de uma resposta de região.
 *
 * Região desconhecida devolve `null`, e quem chama decide — cair no BRL
 * por padrão faria a loja americana receber faixas em real de novo, que é
 * exatamente o defeito que este módulo existe para fechar.
 */
export function moedaDaRegiao(resposta: unknown): Moeda | null {
  if (typeof resposta !== "string") return null
  const alvo = normalizar(resposta)
  if (!alvo) return null
  const achou = REGIOES.find((r) => normalizar(r.value) === alvo || normalizar(r.label) === alvo)
  return achou?.moeda ?? null
}

function normalizar(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

interface Degrau {
  /** Piso da faixa, na própria moeda. */
  de: number
  /** Teto, na própria moeda. `null` = último degrau, aberto. */
  ate: number | null
}

/**
 * As escadas, por moeda, em números REDONDOS do mercado de cada uma.
 *
 * A de dólar é a do funil de referência (Social Scout), que é a escada
 * que o dono de loja global reconhece. A de real é a que o funil daqui já
 * usava — trocá-la mudaria o vocabulário de quem já responde bem.
 *
 * As escadas têm número de degraus DIFERENTE de propósito: o mercado
 * brasileiro se separa em 100/200/500 mil e o global em 20/50/100 mil, e
 * forçar o mesmo número de degraus criaria faixa que ninguém usa.
 */
const ESCADAS: Record<Moeda, readonly Degrau[]> = {
  BRL: [
    { de: 0, ate: 100_000 },
    { de: 100_000, ate: 200_000 },
    { de: 200_000, ate: 500_000 },
    { de: 500_000, ate: 1_000_000 },
    { de: 1_000_000, ate: 5_000_000 },
    { de: 5_000_000, ate: null },
  ],
  USD: [
    { de: 0, ate: 20_000 },
    { de: 20_000, ate: 50_000 },
    { de: 50_000, ate: 100_000 },
    { de: 100_000, ate: 500_000 },
    { de: 500_000, ate: 1_000_000 },
    { de: 1_000_000, ate: 3_000_000 },
    { de: 3_000_000, ate: null },
  ],
  EUR: [
    { de: 0, ate: 20_000 },
    { de: 20_000, ate: 50_000 },
    { de: 50_000, ate: 100_000 },
    { de: 100_000, ate: 500_000 },
    { de: 500_000, ate: 1_000_000 },
    { de: 1_000_000, ate: 3_000_000 },
    { de: 3_000_000, ate: null },
  ],
}

/** "1,5 milhão" é pior que "1,5M" numa lista de sete opções. */
function abreviar(n: number, moeda: Moeda): string {
  const s = SIMBOLO[moeda]
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const txt = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ",")
    return `${s}${txt}M`
  }
  if (n >= 1_000) return `${s}${Math.round(n / 1_000)}k`
  return `${s}${n}`
}

function rotuloDoDegrau(d: Degrau, moeda: Moeda): string {
  if (d.de === 0) return `Até ${abreviar(d.ate ?? 0, moeda)}`
  if (d.ate === null) return `Acima de ${abreviar(d.de, moeda)}`
  return `${abreviar(d.de, moeda)} – ${abreviar(d.ate, moeda)}`
}

/**
 * As opções de faturamento naquela moeda.
 *
 * O `value` é o rótulo NA MOEDA que a pessoa viu, porque é o que ela
 * respondeu — o vendedor abre o card e lê "US$50k – US$100k", não uma
 * conversão que o lead nunca disse. Quem carrega a comparabilidade é o
 * `piso`, que viaja junto e é gravado num campo próprio.
 */
export function opcoesDeFaturamento(moeda: Moeda): FormOption[] {
  return ESCADAS[moeda].map((d) => {
    const label = rotuloDoDegrau(d, moeda)
    return {
      label,
      value: label,
      piso: Math.round(d.de * TAXA_PARA_BRL[moeda]),
      moeda,
    }
  })
}

/** Todas as opções de todas as moedas — o que a auditoria precisa varrer. */
export function todasAsOpcoesDeFaturamento(): FormOption[] {
  const moedas: Moeda[] = ["BRL", "USD", "EUR"]
  const vistas = new Set<string>()
  const out: FormOption[] = []
  for (const m of moedas) {
    for (const o of opcoesDeFaturamento(m)) {
      // EUR e USD compartilham a escada em número, não em símbolo — o
      // rótulo difere, então nenhuma some; a guarda é contra escada
      // duplicada que alguém acrescente depois.
      if (vistas.has(o.value)) continue
      vistas.add(o.value)
      out.push(o)
    }
  }
  return out
}

/**
 * O piso em BRL de uma resposta de faturamento.
 *
 * Lê pela LISTA de opções conhecidas, nunca interpretando o texto: um
 * parser de "US$50k – US$100k" passaria a decidir sozinho o que fazer
 * quando alguém editasse o rótulo, e decidir sozinho aqui é reintroduzir
 * a comparação frágil que o piso existe para substituir.
 *
 * `null` = a resposta não corresponde a nenhuma faixa conhecida. Quem
 * chama trata como "não dá para dizer", nunca como zero — zero
 * desqualificaria o lead por causa de um rótulo que mudou.
 */
export function pisoDaResposta(resposta: unknown, opcoes?: FormOption[]): number | null {
  if (typeof resposta !== "string") return null
  const alvo = normalizar(resposta)
  if (!alvo) return null
  const lista = opcoes && opcoes.length > 0 ? opcoes : todasAsOpcoesDeFaturamento()
  for (const o of lista) {
    if (typeof o.piso !== "number") continue
    if (normalizar(o.value) === alvo || normalizar(o.label) === alvo) return o.piso
  }
  return null
}

/** Piso do corte comercial, em BRL. Uma régua para todas as moedas. */
export const PISO_DE_QUALIFICACAO_BRL = 200_000

/**
 * Qualifica pelo piso.
 *
 * Piso desconhecido devolve `null` — a decisão é de quem chama, e é
 * diferente de `false`: "não sei" não é "não serve". A régua do evento
 * trata `null` como não-qualificado (não dispara), e a tela de auditoria
 * o mostra como lacuna, que é onde alguém conserta.
 */
export function qualificaPeloPiso(
  piso: number | null,
  minimo = PISO_DE_QUALIFICACAO_BRL,
): boolean | null {
  if (piso === null) return null
  return piso >= minimo
}

/**
 * O que o corte único significa em cada moeda — para a tela dizer, em vez
 * de o operador ter de fazer a conta.
 */
export function efeitoDoCorte(minimo = PISO_DE_QUALIFICACAO_BRL): Array<{
  moeda: Moeda
  /** A primeira faixa daquela moeda que qualifica. */
  primeiraQueQualifica: string | null
  /** A última que NÃO qualifica — é a linha de corte que o lead vê. */
  ultimaQueNaoQualifica: string | null
}> {
  const moedas: Moeda[] = ["BRL", "USD", "EUR"]
  return moedas.map((moeda) => {
    const opts = opcoesDeFaturamento(moeda)
    const passa = opts.filter((o) => (o.piso ?? 0) >= minimo)
    const naoPassa = opts.filter((o) => (o.piso ?? 0) < minimo)
    return {
      moeda,
      primeiraQueQualifica: passa[0]?.label ?? null,
      ultimaQueNaoQualifica: naoPassa[naoPassa.length - 1]?.label ?? null,
    }
  })
}
