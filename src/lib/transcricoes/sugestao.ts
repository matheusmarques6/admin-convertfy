/**
 * Sugestão de coleção — puro.
 *
 * A heurística do design (aula/academy, klaviyo/shopify, reel/tiktok,
 * call/ritual/treino) NÃO vive hardcoded no componente: as regras vêm da
 * tabela `transcricoes_regras`, que o time edita sem deploy. Aqui fica só
 * o casamento, que é o que precisa ser previsível e testado.
 *
 * A sugestão é sempre uma sugestão: o usuário troca antes de enfileirar.
 */

import type { Plataforma } from "./types"

export interface Regra {
  id: string
  /** Casados sem acento e sem caixa contra título + canal + URL. */
  termos: string[]
  colecaoId: string
  /** Quando presente, a regra só vale para essa plataforma. */
  plataforma: Plataforma | null
  prioridade: number
}

export interface AlvoSugestao {
  titulo: string | null
  canal: string | null
  url: string | null
  plataforma: Plataforma | null
}

/** Minúsculas, sem acento — é como o termo digitado à mão casa com o real. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * Devolve a coleção sugerida ou null. Empate de prioridade é decidido pelo
 * termo MAIS LONGO casado: "treino comercial" é mais específico que
 * "treino" e deve vencer, senão a regra genérica engole a específica.
 */
export function sugerirColecao(alvo: AlvoSugestao, regras: Regra[]): string | null {
  const alvoTexto = normalizar([alvo.titulo, alvo.canal, alvo.url].filter(Boolean).join(" "))
  if (!alvoTexto) return null

  let melhor: { colecaoId: string; prioridade: number; peso: number } | null = null
  for (const r of regras) {
    if (r.plataforma && r.plataforma !== alvo.plataforma) continue
    let peso = 0
    for (const termo of r.termos) {
      const t = normalizar(termo).trim()
      if (t && alvoTexto.includes(t)) peso = Math.max(peso, t.length)
    }
    if (peso === 0) continue
    if (!melhor || r.prioridade > melhor.prioridade || (r.prioridade === melhor.prioridade && peso > melhor.peso)) {
      melhor = { colecaoId: r.colecaoId, prioridade: r.prioridade, peso }
    }
  }
  return melhor?.colecaoId ?? null
}

/**
 * Regras que uma org nova recebe na primeira visita. São a heurística do
 * design, virada dado — o time renomeia, apaga e acrescenta pela tela.
 * `colecao` é o nome da coleção que a semente cria junto.
 */
export const SEMENTE_COLECOES: ReadonlyArray<{
  nome: string
  filhas?: string[]
}> = [
  { nome: "Convertfy Academy", filhas: ["Fundamentos de e-mail", "Fluxos e automações", "Copy e ofertas"] },
  { nome: "Referências externas", filhas: ["Klaviyo e Shopify", "Social e criativos"] },
  { nome: "Calls internas", filhas: ["Rituais de CS", "Treinos comerciais"] },
]

export const SEMENTE_REGRAS: ReadonlyArray<{
  colecao: string
  termos: string[]
  plataforma?: Plataforma
  prioridade: number
}> = [
  { colecao: "Convertfy Academy", termos: ["aula", "academy", "módulo", "modulo"], prioridade: 10 },
  { colecao: "Fluxos e automações", termos: ["fluxo", "automação", "automacao", "flow"], prioridade: 20 },
  { colecao: "Copy e ofertas", termos: ["copy", "oferta", "promessa"], prioridade: 20 },
  { colecao: "Fundamentos de e-mail", termos: ["fundamentos", "segmentação", "segmentacao", "rfm"], prioridade: 20 },
  { colecao: "Klaviyo e Shopify", termos: ["klaviyo", "shopify", "omnisend"], prioridade: 30 },
  { colecao: "Social e criativos", termos: ["reel", "criativo", "benchmark"], prioridade: 15 },
  { colecao: "Social e criativos", termos: ["tiktok"], plataforma: "tiktok", prioridade: 15 },
  { colecao: "Rituais de CS", termos: ["ritual", "carteira", "leitura de carteira"], prioridade: 25 },
  { colecao: "Treinos comerciais", termos: ["treino", "objeção", "objecao", "call"], prioridade: 25 },
]
