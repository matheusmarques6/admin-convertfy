/**
 * Validador do output do Estruturador (módulo PURO).
 *
 * O LLM devolve intenção; código decide o que vale — filosofia de todos os
 * agentes da casa. Duas classes de resultado:
 *
 *   - erro FATAL → output inteiro reprovado (o caller faz retry 1× com o
 *     erro anexado; 2 falhas = fallback integral no outline);
 *   - posição REMOVÍVEL → sai da estrutura e entra em `descartes` com
 *     `origem: "validador"` (distinta de "modelo": "o código rejeitou o
 *     emitido" ≠ "o agente decidiu não emitir" — é o dado que impede o
 *     loop do COO de corrigir o modelo por falha da biblioteca).
 *
 * Regras (spec + lotes 1-2 do review): categorias construíveis apenas;
 * header/cta REJEITADOS (absorvidos por design); referencia+porque
 * obrigatórios (fatal); slugs ∈ servidos (fatal — anti-alucinação,
 * executável porque os embrulhos viajam); dedup vs proibidas (fatal);
 * product_slots; text_only nunca por escassez.
 */

import type {
  EstruturadorDescarte,
  EstruturadorOutput,
  EstruturadorPosicao,
} from "./estruturador-prompt"

export interface CapacidadeBiblioteca {
  /** Categoria → nº de variantes preenchíveis ativas. */
  porCategoria: Record<string, number>
  /** Máximo de produtos que alguma variante de products exige/aceita. */
  produtosDaLoja: number
}

export interface ValidacaoInput {
  output: unknown
  refsServidas: string[]
  aprendizadosServidos: string[]
  capacidade: CapacidadeBiblioteca
  /** Sequências (arrays de section) já emitidas — proibidas de repetir. */
  sequenciasProibidas: string[][]
}

export interface ValidacaoResultado {
  ok: boolean
  /** Presente quando ok — estrutura já limpa + descartes consolidados. */
  saida?: EstruturadorOutput
  /** Posições removidas pelo validador (também já dentro de saida.descartes). */
  removidasPeloValidador: EstruturadorDescarte[]
  /** Motivos fatais (para o retry levar de volta ao modelo). */
  errosFatais: string[]
}

const CATEGORIAS_ABSORVIDAS = new Set(["header", "cta"])

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i])
}

export function validarOutput(input: ValidacaoInput): ValidacaoResultado {
  const fatais: string[] = []
  const removidas: EstruturadorDescarte[] = []
  const o = input.output as Partial<EstruturadorOutput> | null

  // ── Shape básico ──
  if (!o || typeof o !== "object") {
    return { ok: false, removidasPeloValidador: [], errosFatais: ["output não é um objeto JSON"] }
  }
  if (!Array.isArray(o.estrutura) || o.estrutura.length === 0) {
    fatais.push("`estrutura` ausente ou vazia")
  }
  if (!isStr(o.fio_narrativo)) fatais.push("`fio_narrativo` ausente")
  if (!o.diagnostico || !isStr(o.diagnostico.objecao_dominante)) {
    fatais.push("`diagnostico.objecao_dominante` ausente")
  }
  if (fatais.length > 0) return { ok: false, removidasPeloValidador: [], errosFatais: fatais }

  const estrutura = o.estrutura as EstruturadorPosicao[]
  const refsSet = new Set(input.refsServidas)
  const aprSet = new Set(input.aprendizadosServidos)

  // ── Justificativa dupla + anti-alucinação (fatais) ──
  for (const [i, p] of estrutura.entries()) {
    if (!isStr(p.section)) fatais.push(`posição ${i}: sem \`section\``)
    if (!isStr(p.papel)) fatais.push(`posição ${i}: sem \`papel\``)
    if (!isStr(p.referencia) || !isStr(p.porque)) {
      fatais.push(`posição ${i} (${p.section ?? "?"}): "referencia" e "porque" são obrigatórios`)
    } else if (!refsSet.has(p.referencia)) {
      fatais.push(
        `posição ${i}: referencia "${p.referencia}" não está entre as servidas — use exatamente os slugs dos embrulhos`,
      )
    }
  }
  for (const f of o.fontes ?? []) {
    if (isStr(f?.ref) && !refsSet.has(f.ref)) {
      fatais.push(`fonte "${f.ref}" não está entre as referências servidas`)
    }
  }
  for (const a of o.aprendizados_aplicados ?? []) {
    if (isStr(a?.slug) && !aprSet.has(a.slug)) {
      fatais.push(`aprendizado "${a.slug}" não está entre os servidos`)
    }
  }
  if (fatais.length > 0) return { ok: false, removidasPeloValidador: [], errosFatais: fatais }

  // ── Filtro de posições (removível, origem: validador) ──
  const limpa: EstruturadorPosicao[] = []
  for (const p of estrutura) {
    if (CATEGORIAS_ABSORVIDAS.has(p.section)) {
      removidas.push({
        section: p.section,
        papel_na_referencia: p.papel,
        porque: `"${p.section}" é absorvido por design (header→1ª posição, cta→anterior) — o prompt proíbe emiti-lo`,
        origem: "validador",
      })
      continue
    }
    const cap = input.capacidade.porCategoria[p.section] ?? 0
    if (cap <= 0) {
      removidas.push({
        section: p.section,
        papel_na_referencia: p.papel,
        porque: `sem variante preenchível de "${p.section}" na biblioteca — demanda de curadoria registrada`,
        origem: "validador",
      })
      continue
    }
    limpa.push(p)
  }

  if (limpa.length === 0) {
    return {
      ok: false,
      removidasPeloValidador: removidas,
      errosFatais: ["nenhuma posição construível restou após o filtro de capacidade"],
    }
  }

  // ── Dedup vs sequências proibidas (fatal — anti-repetição em código) ──
  const seq = limpa.map((p) => p.section)
  if (input.sequenciasProibidas.some((prev) => sameSequence(prev, seq))) {
    return {
      ok: false,
      removidasPeloValidador: removidas,
      errosFatais: [
        `a sequência [${seq.join(", ")}] repete uma estrutura recente desta loja — varie a composição`,
      ],
    }
  }

  const saida: EstruturadorOutput = {
    diagnostico: o.diagnostico as EstruturadorOutput["diagnostico"],
    estrutura: limpa,
    fio_narrativo: o.fio_narrativo as string,
    fontes: (o.fontes ?? []) as EstruturadorOutput["fontes"],
    aprendizados_aplicados: (o.aprendizados_aplicados ?? []) as EstruturadorOutput["aprendizados_aplicados"],
    text_only: o.text_only === true,
    // Descartes do MODELO normalizados + os do validador. Shape único com
    // `origem` (contrato P3 do lote 2).
    descartes: [
      ...((o.descartes ?? []) as EstruturadorDescarte[]).map((d) => ({
        section: d.section ?? null,
        papel_na_referencia: d.papel_na_referencia ?? null,
        porque: d.porque ?? "(sem motivo)",
        origem: "modelo" as const,
      })),
      ...removidas,
    ],
  }
  return { ok: true, saida, removidasPeloValidador: removidas, errosFatais: [] }
}
