/**
 * cta-inventario — o botão de cada bloco pelo CONTRATO, não pela heurística.
 *
 * O Cores & Botões inseriu dois botões onde já havia CTA (batch 6249aef2,
 * body-3 e products-7) porque `extrairCtas` — que lê o HTML e decide por
 * padding/fundo/borda — não viu os botões daquelas variantes. O contrato
 * do bloco (`email_blocks.fields`, o `output_schema` da variante) já dizia
 * que o bloco TEM um campo de CTA; ninguém o consultava neste step.
 *
 * Aqui os dois se cruzam: o contrato responde "o bloco tem botão?" e a
 * heurística vira verificação secundária. Quando discordam, a divergência
 * vai à telemetria (`cta_inventario_divergente`) — é o teste de regressão
 * que faltava para descobrir por que a heurística não viu um botão.
 *
 * Puro (zero I/O) — testável.
 */

import type { BlockContract } from "./block-contract"
import type { Cta, Faixa } from "./color-faixas"

export interface InventarioDeCta {
  /** Índice do marcador `cfy:block` — o endereço das ops. */
  bloco: number
  tipo: string
  /** `null` = o bloco não tem contrato carregado (não dá para afirmar). */
  tem_cta_por_contrato: boolean | null
  /** Campos do contrato que são CTA (label/texto de botão). */
  campos_cta: string[]
  tem_cta_por_heuristica: boolean
  /** Contrato e heurística discordam — só com contrato conhecido. */
  divergente: boolean
}

/** Campo de contrato que é o LABEL de um botão. */
const CAMPO_CTA_RE = /(?:^|_)(?:cta|button|botao)(?:_\d+)?(?:_(?:label|text|texto|copy))?$/i

export function ehCampoDeCta(key: string, tipo?: string | null): boolean {
  if (/_(?:url|href|link|alt|src)$/i.test(key)) return false
  if (tipo && /^(?:url|image|boolean|number)$/i.test(tipo)) return false
  return CAMPO_CTA_RE.test(key)
}

/**
 * Contrato do bloco pelo índice do marcador. `BlockContract.position` é a
 * posição 1-based de `email_blocks`; o marcador é 0-based — a mesma
 * conversão que a Conformidade (B6) faz.
 */
export function contratoDoBloco(
  contratos: ReadonlyArray<BlockContract>,
  bloco: number,
): BlockContract | null {
  return contratos.find((c) => c.position === bloco + 1) ?? null
}

export function inventarioDeCtas(
  faixas: ReadonlyArray<Pick<Faixa, "bloco" | "tipo">>,
  contratos: ReadonlyArray<BlockContract> | null | undefined,
  ctas: ReadonlyArray<Pick<Cta, "bloco" | "somente_outlook">>,
): InventarioDeCta[] {
  const lista = contratos ?? []
  // Botão só do Outlook não conta como presente: fora dali o lugar está
  // vazio (ver `extrairCtas`).
  const comCta = new Set(ctas.filter((c) => !c.somente_outlook && c.bloco != null).map((c) => c.bloco as number))
  return faixas.map((f) => {
    const contrato = contratoDoBloco(lista, f.bloco)
    const campos = contrato
      ? Object.entries(contrato.campos)
          .filter(([key, c]) => ehCampoDeCta(key, c.tipo))
          .map(([key]) => key)
      : []
    const porContrato = contrato ? campos.length > 0 : null
    const porHeuristica = comCta.has(f.bloco)
    return {
      bloco: f.bloco,
      tipo: f.tipo,
      tem_cta_por_contrato: porContrato,
      campos_cta: campos,
      tem_cta_por_heuristica: porHeuristica,
      divergente: porContrato != null && porContrato !== porHeuristica,
    }
  })
}
