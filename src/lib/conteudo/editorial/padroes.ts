/**
 * Padrões de headline e gatilhos — a TABELA da casa, adaptada ao dono de
 * e-commerce. A régua vem da BrandsDecoded (≥ 1 padrão, ≥ 2 gatilhos,
 * checklist de rejeição); a tabela NÃO: a deles mede conteúdo cultural
 * (Brasil, geracional) e a nossa foi extraída do carrossel "8% dos clientes
 * fazem 41% do faturamento", o que o time considera bom. É hipótese
 * inicial — o loop de dado (salvamentos por padrão) calibra depois.
 *
 * Puro: sem I/O. O prompt lê daqui; a UI lê daqui; o teste fixa a régua.
 */

import { CONECTIVOS_DE_CONTINUACAO } from "./anti-slop"

export interface PadraoHeadline {
  id: string
  nome: string
  /** Como se escreve. */
  formula: string
  /** Quando cabe. */
  quando: string
  /** Exemplo da casa (nunca copiar literalmente). */
  exemplo: string
}

export const PADROES_HEADLINE: PadraoHeadline[] = [
  {
    id: "dado_contraintuitivo",
    nome: "Dado contraintuitivo",
    formula: "[número improvável] + [consequência que o leitor não esperava]",
    quando: "Há um número real (da pauta ou de fonte nomeada) que inverte a intuição de quem vende online.",
    exemplo: "8% dos clientes fazem 41% do faturamento. Você conhece os seus 8%?",
  },
  {
    id: "morte_de_x",
    nome: "A morte de X",
    formula: "A morte de [prática que todo mundo faz]: [o que toma o lugar]",
    quando: "Uma prática comum (cupom, disparo em massa, black friday de 30 dias) está perdendo o efeito e há sinal disso.",
    exemplo: "A morte do cupom: por que a loja que mais desconta é a que menos retém",
  },
  {
    id: "vilao_externo",
    nome: "Vilão externo",
    formula: "[fato externo com número e data] + [o que muda na conta da loja]",
    quando: "Plataforma, imposto ou leilão mudaram a regra e o dono ainda não sentiu na fatura.",
    exemplo: "A conta piorou em 2026: a Meta repassa 12,15% de imposto e R$ 1.000 de mídia viraram R$ 1.121,50",
  },
  {
    id: "conta_traduzida",
    nome: "Conta traduzida para a loja",
    formula: "[os números do leitor] × [o dado] = [o que ele deixa na mesa]",
    quando: "Dá para fazer a conta com uma loja típica (faturamento, ticket, pedidos) e o resultado é grande.",
    exemplo: "2.000 pedidos por mês × 8% = 160 pessoas respondendo por R$ 123 mil",
  },
  {
    id: "marca_ancora",
    nome: "Marca como âncora",
    formula: "[marca ou plataforma conhecida] + [o que ela sabe ou fez que o leitor não faz]",
    quando: "Shopify, Smile.io, Amazon, Meta, Klaviyo ou uma loja conhecida carrega a prova.",
    exemplo: "O Smile.io cruzou 1,1 bilhão de compradores e achou o mesmo padrão em 250 mil lojas",
  },
  {
    id: "contraste",
    nome: "Contraste",
    formula: "[polo A com custo ou esforço] . [polo B com custo ou esforço oposto]",
    quando: "Duas escolhas do dono de loja têm custos diferentes e ele trata como iguais.",
    exemplo: "Cliente novo custa mais a cada ano. Vender de novo pros seus 160 custa o mesmo de sempre.",
  },
  {
    id: "por_que_lojas",
    nome: "Por que [grupo] está [comportamento inesperado]",
    formula: "Por que [lojas de X por mês / donos de Y] estão [fazendo algo que contraria o senso comum]?",
    quando: "Um grupo identificável de lojistas mudou de comportamento e o leitor se reconhece no grupo.",
    exemplo: "Por que lojas de R$ 300 mil por mês pararam de comprar tráfego para cliente novo?",
  },
  {
    id: "investigando",
    nome: "Investigando",
    formula: "Investigando [fenômeno do e-commerce]: [o que os dados mostram]",
    quando: "O tema pede tom documental e há dado para investigar, não opinião.",
    exemplo: "Investigando por que a segunda compra acontece em 21 dias ou não acontece nunca",
  },
  {
    id: "dois_pontos",
    nome: "Dois-pontos",
    formula: "[Reenquadramento provocativo]: [hook de curiosidade]",
    quando: "A primeira frase redefine o fenômeno e a segunda abre a lacuna. Combina com qualquer outro padrão.",
    exemplo: "O que o Smile.io mediu em 250 mil lojas: metade do seu mês vem de menos de 1 em cada 10 clientes",
  },
]

export interface Gatilho {
  id: string
  nome: string
  ativa: string
}

export const GATILHOS: Gatilho[] = [
  { id: "medo_alerta", nome: "Medo / alerta", ativa: "Algo em risco para a loja: imposto, CPM, base que esfria, cliente que não volta." },
  { id: "identidade", nome: "Identidade", ativa: "O leitor se reconhece: dono de loja de R$ 300 mil, quem vende moda, quem depende de tráfego." },
  { id: "indignacao", nome: "Indignação", ativa: "Ele paga duas vezes pelo mesmo cliente, a plataforma mudou a regra, o cupom come a margem." },
  { id: "curiosidade", nome: "Curiosidade", ativa: "Lacuna de informação: um número que ele não sabe da própria loja." },
  { id: "aspiracao", nome: "Aspiração", ativa: "R$ 123 mil por mês com quem já comprou; a loja que fatura sem depender de anúncio." },
  { id: "nostalgia", nome: "Nostalgia", ativa: "Como era vender antes do leilão ficar caro. Raro no nosso público — usar com dado." },
]

/** Combinações que a régua da casa considera fortes (mínimo 2 por headline). */
export const COMBINACOES_FORTES: Array<[string, string]> = [
  ["medo_alerta", "identidade"],
  ["curiosidade", "identidade"],
  ["indignacao", "aspiracao"],
  ["curiosidade", "aspiracao"],
  ["medo_alerta", "indignacao"],
]

const PADRAO_IDS = new Set(PADROES_HEADLINE.map((p) => p.id))
const GATILHO_IDS = new Set(GATILHOS.map((g) => g.id))

export const padraoValido = (id: string): boolean => PADRAO_IDS.has(id)
export const gatilhoValido = (id: string): boolean => GATILHO_IDS.has(id)

/** Checklist de rejeição: cair em um destes é reescrever, nunca entregar. */
export const ANTI_PADROES_HEADLINE: Array<{ id: string; nome: string; re: RegExp }> = [
  { id: "revelacao_generica", nome: "Revelação genérica (descubra, saiba, conheça, aprenda)", re: /^\s*(descubra|saiba|conheça|conheca|aprenda|veja)\b/i },
  { id: "lista_saturada", nome: "Lista saturada (N dicas, N formas, N erros)", re: /\b\d+\s+(dicas?|formas?|lições|licoes|erros?|passos?|maneiras?|segredos?)\b/i },
  { id: "quando_x_vira_y", nome: "\"Quando X vira Y\"", re: /\bquando\b[^.:!?]{2,60}\bvira\b/i },
  { id: "ascensao_de", nome: "\"A ascensão de\"", re: /\ba ascens[ãa]o d[eao]s?\b/i },
  { id: "impacto_de", nome: "\"O impacto de\"", re: /\bo impacto d[eao]s?\b/i },
  { id: "esta_mudando", nome: "\"Por que X está mudando Y\"", re: /\bpor que\b[^.:!?]{2,60}\best[áa] mudando\b/i },
  { id: "nao_e_x_e_y", nome: "\"Não é X, é Y\"", re: /\bn[ãa]o [ée] (sobre )?[^,.:!?]{2,40},\s*[ée] (sobre )?/i },
  { id: "virou", nome: "\"Virou\" como verbo principal", re: /\bvirou\b/i },
  { id: "tudo_que_precisa", nome: "\"Tudo que você precisa saber\" / \"guia definitivo\"", re: /\btudo (o )?que (voc[êe] )?precisa saber\b|\bguia definitivo\b/i },
  { id: "mudou_para_sempre", nome: "\"Mudou para sempre\"", re: /\bmudou para sempre\b/i },
  { id: "muda_tudo", nome: "\"E isso muda tudo\"", re: /\bisso muda tudo\b/i },
]

export interface AvaliacaoHeadline {
  antiPadroes: string[]
  padraoDeclarado: boolean
  gatilhosSuficientes: boolean
  veredito: "aprovada" | "ressalva" | "reprovada"
}

/**
 * Avaliação por CÓDIGO de uma headline (a IA também dá o veredito dela;
 * este é o que não depende de julgamento). Anti-padrão → reprovada; sem
 * padrão válido ou com menos de 2 gatilhos → ressalva.
 */
export function avaliarHeadline(h: { texto: string; padrao?: string; gatilhos?: string[] }): AvaliacaoHeadline {
  const antiPadroes = ANTI_PADROES_HEADLINE.filter((a) => a.re.test(h.texto)).map((a) => a.id)
  const padraoDeclarado = Boolean(h.padrao && padraoValido(h.padrao))
  const gatilhos = (h.gatilhos ?? []).filter(gatilhoValido)
  const gatilhosSuficientes = new Set(gatilhos).size >= 2
  const veredito = antiPadroes.length ? "reprovada" : padraoDeclarado && gatilhosSuficientes ? "aprovada" : "ressalva"
  return { antiPadroes, padraoDeclarado, gatilhosSuficientes, veredito }
}

/**
 * Contrato da capa: texto 1 e texto 2 são independentes — o subtítulo não
 * pode começar com conectivo de continuação nem depender sintaticamente do
 * título. Os LIMITES vêm do canvas (`ST_LIMITES`), não de contagem fixa de
 * palavras: a capa Editorial da casa tem 8 palavras e cabe.
 */
export function validarContratoCapa(titulo: string, subtitulo: string | undefined, limites: { titulo?: number; subtitulo?: number }): string[] {
  const problemas: string[] = []
  const t = titulo.trim()
  const s = (subtitulo ?? "").trim()
  if (!t) problemas.push("Título vazio.")
  if (limites.titulo && t.length > limites.titulo) problemas.push(`Título com ${t.length} caracteres; o canvas comporta ${limites.titulo}.`)
  if (s) {
    if (limites.subtitulo && s.length > limites.subtitulo) problemas.push(`Subtítulo com ${s.length} caracteres; o canvas comporta ${limites.subtitulo}.`)
    const primeira = s.split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, "") ?? ""
    if (CONECTIVOS_DE_CONTINUACAO.has(primeira)) problemas.push(`Subtítulo começa com "${primeira}": ele tem de funcionar sozinho, sem depender do título.`)
    if (s.toLowerCase() === t.toLowerCase()) problemas.push("Subtítulo repete o título.")
  }
  return problemas
}
