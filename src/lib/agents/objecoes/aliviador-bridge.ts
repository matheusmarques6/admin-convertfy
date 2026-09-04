/**
 * Ponte entre os vocabulários (módulo PURO, testado).
 *
 * O Curador rankeia as variantes pelo eixo `objecao` das notas do vault, que
 * fala uma língua própria de 11 valores (preco-valor, confianca-no-canal,
 * adesao-social…). O Seletor fala a da spec: `tipo_de_risco` (7) ×
 * `aliviador` (10). Sem tradução, o alvo chega como
 * `psicologico + prova_de_terceiro`, nenhuma nota tem esse valor, o eixo
 * vira neutro em 100% das posições e a decisão desce para `registro` — a
 * concentração que se quer desfazer.
 *
 * Duas tabelas:
 *   1. (risco, aliviador) → eixos `objecao` do vault equivalentes — o alvo
 *      sai com `eixo_objecao_equivalente` e o eixo de hoje continua
 *      discriminando.
 *   2. variante → `aliviador[]` + `profundidade` DERIVADOS de
 *      block_type + objecao + exige — bootstrap enquanto as 44 notas não
 *      têm os campos; frontmatter `aliviador:`/`profundidade:` na nota
 *      VENCE a derivação quando existir (regra "o vault vence").
 */

import {
  isAliviador,
  isProfundidade,
  type Aliviador,
  type Profundidade,
  type TipoDeRisco,
} from "./vocabulario"

/** Os 11 valores do eixo `objecao` do vault (componentes/eixos/objecao/*). */
export const EIXOS_OBJECAO_VAULT = [
  "adesao-social",
  "amplitude-de-catalogo",
  "composicao-formulacao",
  "confianca-no-canal",
  "disponibilidade-urgencia",
  "escolha-variedade",
  "pertencimento",
  "preco-valor",
  "qualidade-eficacia",
  "suporte-duvida",
  "uso-aprendizado",
] as const
export type EixoObjecaoVault = (typeof EIXOS_OBJECAO_VAULT)[number]

/** Por ALIVIADOR: o mecanismo diz que dúvida ele fecha. */
const POR_ALIVIADOR: Record<Aliviador, EixoObjecaoVault[]> = {
  garantia_de_devolucao: ["suporte-duvida", "escolha-variedade"],
  prova_de_terceiro: ["adesao-social", "qualidade-eficacia"],
  prova_por_volume: ["adesao-social", "confianca-no-canal"],
  demonstracao_de_mecanismo: ["composicao-formulacao", "qualidade-eficacia"],
  transparencia_de_politica: ["suporte-duvida", "confianca-no-canal"],
  amostra_ou_teste: ["qualidade-eficacia", "escolha-variedade"],
  dado_de_adequacao: ["escolha-variedade", "uso-aprendizado"],
  comparacao_de_categoria: ["preco-valor", "confianca-no-canal"],
  seguranca_de_pagamento: ["confianca-no-canal"],
  reputacao_da_loja: ["confianca-no-canal", "adesao-social"],
}

/** Por RISCO: afina a lista do aliviador (o par decide, não cada um sozinho). */
const POR_RISCO: Record<TipoDeRisco, EixoObjecaoVault[]> = {
  financeiro: ["preco-valor", "disponibilidade-urgencia"],
  desempenho: ["qualidade-eficacia", "composicao-formulacao"],
  tempo: ["suporte-duvida", "disponibilidade-urgencia", "uso-aprendizado"],
  psicologico: ["adesao-social", "qualidade-eficacia", "pertencimento"],
  social: ["pertencimento", "adesao-social"],
  seguranca: ["confianca-no-canal", "suporte-duvida"],
  adequacao: ["escolha-variedade", "uso-aprendizado", "amplitude-de-catalogo"],
}

/**
 * Eixos `objecao` do vault que realizam o par (risco, aliviador). Primeiro
 * a interseção (o par é específico); vazia, a união ordenada pelo aliviador
 * (é o mecanismo que a variante tem de ter). Nunca devolve vazio para um par
 * válido.
 */
export function eixoObjecaoEquivalente(
  risco: TipoDeRisco | null | undefined,
  aliviador: Aliviador | null | undefined,
): EixoObjecaoVault[] {
  const a = aliviador ? POR_ALIVIADOR[aliviador] : []
  const r = risco ? POR_RISCO[risco] : []
  if (a.length && r.length) {
    const inter = a.filter((x) => r.includes(x))
    if (inter.length) return inter
    return Array.from(new Set([...a, ...r]))
  }
  return a.length ? a : r
}

/** `exige` do vault → aliviador cuja anatomia aquele requisito prova. */
const REQUISITO_PARA_ALIVIADOR: Record<string, Aliviador> = {
  "tres-reviews-distintos": "prova_de_terceiro",
  "depoimento-com-credencial": "prova_de_terceiro",
  "foto-do-depoente": "prova_de_terceiro",
  "selo-compra-verificada": "prova_de_terceiro",
  "ugc-autorizado": "prova_de_terceiro",
  "reviews-curtos": "prova_de_terceiro",
  "reviews-longos": "prova_de_terceiro",
  "tres-provas-verificaveis": "demonstracao_de_mecanismo",
  "produto-com-composicao-relevante": "demonstracao_de_mecanismo",
  "quatro-criterios-objetivos": "comparacao_de_categoria",
  "tres-diferenciais-concretos": "comparacao_de_categoria",
  "grade-de-tamanho-real": "dado_de_adequacao",
  "catalogo-de-variantes": "dado_de_adequacao",
  "prazo-real": "transparencia_de_politica",
  "duas-acoes-de-suporte": "transparencia_de_politica",
  "estoque-integrado": "transparencia_de_politica",
  "valores-articulados": "reputacao_da_loja",
  "manifesto-de-marca-escrito": "reputacao_da_loja",
  "gift-card-digital": "amostra_ou_teste",
  "produto-de-entrada-definido": "amostra_ou_teste",
}

/** Eixo `objecao` da nota → aliviador que a seção costuma realizar. */
const EIXO_PARA_ALIVIADOR: Partial<Record<EixoObjecaoVault, Aliviador>> = {
  "adesao-social": "prova_por_volume",
  "composicao-formulacao": "demonstracao_de_mecanismo",
  "confianca-no-canal": "reputacao_da_loja",
  "escolha-variedade": "dado_de_adequacao",
  "preco-valor": "comparacao_de_categoria",
  "qualidade-eficacia": "demonstracao_de_mecanismo",
  "suporte-duvida": "transparencia_de_politica",
  "uso-aprendizado": "demonstracao_de_mecanismo",
}

export interface DerivacaoInput {
  block_type?: string | null
  objecao?: readonly string[] | null
  exige?: readonly string[] | null
  /** Frontmatter explícito — vence a derivação. */
  aliviador?: unknown
  profundidade?: unknown
}

export interface DerivacaoOutput {
  aliviador: Aliviador[]
  profundidade: Profundidade | null
  fonte: "vault" | "derivado"
}

/**
 * Aliviadores e profundidade de uma variante. Frontmatter explícito vence;
 * sem ele, deriva de `exige` (o requisito diz que anatomia a peça tem), do
 * eixo `objecao` e da seção. Footer não alivia nada (por desenho — fecha o
 * e-mail); hero é afirmação.
 */
export function derivarAliviadorEProfundidade(v: DerivacaoInput): DerivacaoOutput {
  const explicitos = (Array.isArray(v.aliviador) ? v.aliviador : v.aliviador != null ? [v.aliviador] : []).filter(isAliviador)
  const profExplicita = isProfundidade(v.profundidade) ? v.profundidade : null
  if (explicitos.length > 0 || profExplicita) {
    return {
      aliviador: explicitos,
      profundidade: profExplicita ?? profundidadeDaSecao(v.block_type, explicitos),
      fonte: "vault",
    }
  }
  const out = new Set<Aliviador>()
  for (const req of v.exige ?? []) {
    const a = REQUISITO_PARA_ALIVIADOR[req]
    if (a) out.add(a)
  }
  const tipo = (v.block_type ?? "").toLowerCase()
  if (tipo === "reviews") out.add("prova_de_terceiro")
  if (out.size === 0) {
    for (const eixo of v.objecao ?? []) {
      const a = EIXO_PARA_ALIVIADOR[eixo as EixoObjecaoVault]
      if (a) out.add(a)
    }
  }
  const aliviador = Array.from(out)
  return { aliviador, profundidade: profundidadeDaSecao(v.block_type, aliviador), fonte: "derivado" }
}

function profundidadeDaSecao(blockType: string | null | undefined, aliviadores: readonly Aliviador[]): Profundidade | null {
  const tipo = (blockType ?? "").toLowerCase()
  if (tipo === "footer") return null
  if (aliviadores.includes("prova_de_terceiro") || tipo === "reviews") return "prova_de_terceiro"
  if (aliviadores.includes("garantia_de_devolucao")) return "garantia"
  if (
    aliviadores.includes("demonstracao_de_mecanismo") ||
    aliviadores.includes("comparacao_de_categoria") ||
    aliviadores.includes("transparencia_de_politica") ||
    aliviadores.includes("dado_de_adequacao")
  ) {
    return "mecanismo"
  }
  return "afirmacao"
}
