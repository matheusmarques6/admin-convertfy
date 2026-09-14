/**
 * Decisão × entregue — módulo PURO (Trilha B6, set/2026).
 *
 * Para cada posição de um e-mail, cruza quatro "quem disse o quê":
 *
 *   pedido    — `DecisaoDoEmail.posicoes[i]` (papel, requisitos, dispositivo)
 *   curador   — a escolha final do Curador/Montador (`escolhas[]` da run
 *               `assembler`)
 *   blueprint — `store_email_blueprints.blocks[i].variant_id`
 *   montado   — `store_email_references.slot_map[i].variant_id`
 *   entregue  — `email_blocks.variant_id` (position = i + 1)
 *
 * e as violações que os validadores gravaram em `_contrato` das runs
 * (`assembler`, `blueprint`, `copy`). Quando a run não tem `_contrato`
 * (geração anterior ao Passo 8) mas há decisão e os contratos das variantes,
 * a régua de escolha roda AQUI, retroativa — é a MESMA `violacoesDaEscolha`
 * do pipeline, não uma cópia.
 *
 * `no_responsavel` é a primeira fronteira em que a variante mudou de mãos
 * — é o que responde "onde a decisão morreu" sem cruzar quatro tabelas à
 * mão. A ordem é a do pipeline: curador → blueprint → montagem → seed.
 *
 * Três estados por posição, e não dois: `conforme`, `divergente` e
 * `nao_avaliada` — regra pendente (o `dispositivo` nasce em B3) ou decisão
 * ausente. Zero violações NÃO vira "conforme" quando nada foi conferido.
 */

import type { DecisaoDoEmail } from "./decisao-do-email"
import type { ContratoResumo } from "./field-roles"
import { violacoesDaEscolha } from "./validadores/escolhas"
import type { Violacao } from "./validadores/tipos"

export type NoResponsavel = "assembler_chooser" | "assembler" | "blueprint" | "seed" | "copy"

export type EstadoDaPosicao = "conforme" | "divergente" | "nao_avaliada"

export interface ViolacaoComOrigem extends Violacao {
  /** Run em que a violação foi gravada (ou `retroativa` quando calculada aqui). */
  origem: "assembler" | "blueprint" | "copy" | "retroativa"
}

export interface LinhaDeConformidade {
  block_index: number
  section: string | null
  dispositivo_pedido: string | null
  papel: string | null
  requisitos: unknown
  variante_curador: string | null
  variante_blueprint: string | null
  variante_montada: string | null
  variante_entregue: string | null
  violacoes: ViolacaoComOrigem[]
  regra_pendente: string[]
  /**
   * Quem pôs a variante na posição: o Curador escolheu (`curador`) ou o
   * código resgatou uma posição que ele deixou vazia (`resgate`). Resgate
   * não é divergência por si — as concessões dele vêm em `resgate_*`.
   */
  origem_da_variante: "curador" | "resgate" | null
  estado: EstadoDaPosicao
  no_responsavel: NoResponsavel | null
  /** Uma linha, para a tabela. */
  motivo: string | null
}

export interface ResumoDeConformidade {
  posicoes: number
  conformes: number
  divergentes: number
  nao_avaliadas: number
  por_no: Partial<Record<NoResponsavel, number>>
}

export interface PosicaoCrua {
  block_index: number
  section?: string | null
  dispositivo_pedido?: string | null
  papel?: string | null
  requisitos?: unknown
  variante_curador?: string | null
  variante_blueprint?: string | null
  variante_montada?: string | null
  variante_entregue?: string | null
  /** Violações já gravadas em `_contrato`, com a origem. */
  violacoes?: ViolacaoComOrigem[]
  regra_pendente?: string[]
  /** A run `assembler` tinha `_contrato` (os validadores rodaram). */
  contrato_presente?: boolean
}

export interface MontarConformidadeInput {
  posicoes: PosicaoCrua[]
  /** Decisão persistida (null = geração anterior ao contrato). */
  decisao: DecisaoDoEmail | null
  /** Contratos das variantes por id — habilita a validação retroativa. */
  contratoPorId?: ReadonlyMap<string, ContratoResumo>
}

const NO_DA_ORIGEM: Record<ViolacaoComOrigem["origem"], NoResponsavel> = {
  assembler: "assembler_chooser",
  retroativa: "assembler_chooser",
  blueprint: "blueprint",
  copy: "copy",
}

function noDaViolacao(v: ViolacaoComOrigem): NoResponsavel {
  // Resgate por código é do Montador, não do Curador.
  if (v.tipo.startsWith("resgate_")) return "assembler"
  return NO_DA_ORIGEM[v.origem]
}

export function montarConformidade(input: MontarConformidadeInput): { linhas: LinhaDeConformidade[]; resumo: ResumoDeConformidade } {
  const linhas: LinhaDeConformidade[] = [...input.posicoes]
    .sort((a, b) => a.block_index - b.block_index)
    .map((p) => {
      const i = p.block_index
      const pos = input.decisao?.posicoes[i] ?? null
      const violacoes: ViolacaoComOrigem[] = [...(p.violacoes ?? [])]
      const regra_pendente = [...(p.regra_pendente ?? [])]

      // Retroativa: sem `_contrato` gravado, mas com decisão e contrato da
      // variante entregue — a mesma régua do pipeline, sobre o que foi ao
      // cliente. Zero violações aqui É avaliação (a régua rodou).
      let retroativaRodou = false
      if (!p.contrato_presente && input.decisao && input.contratoPorId && p.variante_entregue) {
        const c = input.contratoPorId.get(p.variante_entregue)
        if (c) {
          retroativaRodou = true
          for (const v of violacoesDaEscolha(input.decisao, i, p.variante_entregue, c)) violacoes.push({ ...v, origem: "retroativa" })
          if (!regra_pendente.includes("dispositivo")) regra_pendente.push("dispositivo")
        }
      }

      const curador = p.variante_curador ?? null
      const blueprint = p.variante_blueprint ?? null
      const montada = p.variante_montada ?? null
      const entregue = p.variante_entregue ?? null

      let no: NoResponsavel | null = null
      let motivo: string | null = null
      if (curador && blueprint && curador !== blueprint) {
        no = "blueprint"
        motivo = "o blueprint gravou variante diferente da escolhida pelo Curador"
      } else if (blueprint && montada && blueprint !== montada) {
        no = "assembler"
        motivo = "a montagem colocou variante diferente da do blueprint"
      } else if (montada && entregue && montada !== entregue) {
        no = "seed"
        motivo = "o bloco do e-mail não carrega a variante montada"
      } else if (violacoes.length > 0) {
        const pior = [...violacoes].sort((a, b) => (a.severidade === "high" ? -1 : 1) - (b.severidade === "high" ? -1 : 1))[0]
        no = noDaViolacao(pior)
        motivo = `${pior.tipo}: ${pior.evidencia}`
      }

      const avaliada = Boolean(input.decisao) && (Boolean(p.contrato_presente) || retroativaRodou || no != null)
      const estado: EstadoDaPosicao = no != null ? "divergente" : avaliada ? "conforme" : "nao_avaliada"
      if (estado === "nao_avaliada") {
        motivo = !input.decisao
          ? "geração anterior ao contrato de decisão (sem decisão persistida)"
          : regra_pendente.length > 0
            ? `regra pendente: ${regra_pendente.join(", ")}`
            : "sem validador gravado nesta geração"
      }

      return {
        block_index: i,
        section: p.section ?? pos?.section ?? null,
        dispositivo_pedido: p.dispositivo_pedido ?? pos?.dispositivo ?? null,
        papel: p.papel ?? pos?.papel ?? null,
        requisitos: p.requisitos ?? pos?.requisitos ?? null,
        variante_curador: curador,
        variante_blueprint: blueprint,
        variante_montada: montada,
        variante_entregue: entregue,
        violacoes,
        regra_pendente,
        origem_da_variante: curador ? "curador" : montada || entregue ? "resgate" : null,
        estado,
        no_responsavel: no,
        motivo,
      }
    })

  const resumo: ResumoDeConformidade = {
    posicoes: linhas.length,
    conformes: linhas.filter((l) => l.estado === "conforme").length,
    divergentes: linhas.filter((l) => l.estado === "divergente").length,
    nao_avaliadas: linhas.filter((l) => l.estado === "nao_avaliada").length,
    por_no: {},
  }
  for (const l of linhas) if (l.no_responsavel) resumo.por_no[l.no_responsavel] = (resumo.por_no[l.no_responsavel] ?? 0) + 1
  return { linhas, resumo }
}

/**
 * Custo gasto até a divergência: soma das runs criadas até a run do
 * primeiro nó responsável (inclusive). Sem divergência, null.
 */
export function custoAteDivergencia(
  linhas: LinhaDeConformidade[],
  runs: Array<{ agent: string; cost_cents: number | null; created_at: string }>,
): number | null {
  const nos = linhas.map((l) => l.no_responsavel).filter((n): n is NoResponsavel => n != null)
  if (nos.length === 0) return null
  const ordenadas = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const primeira = ordenadas.find((r) => nos.includes(r.agent as NoResponsavel))
  if (!primeira) return null
  let soma = 0
  for (const r of ordenadas) {
    soma += Number(r.cost_cents ?? 0)
    if (r === primeira) break
  }
  return soma
}
