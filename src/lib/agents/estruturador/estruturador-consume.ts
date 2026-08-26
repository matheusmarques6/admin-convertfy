/**
 * Consumo do output do Estruturador (fase 3 — modo 'on'). Módulo PURO.
 *
 * Quando `estruturador_mode='on'` e a run valida, a estrutura decidida pelo
 * agente SUBSTITUI o outline: as posições viram a `structure` do Montador
 * (categoria + papel como rótulo) e o papel narrativo de cada posição
 * sobrescreve o `purpose` do bloco correspondente no blueprint — é assim que
 * a decisão chega à copy do n8n (o purpose já viaja no payload por bloco).
 * O `fio_narrativo` vira o guidance do Montador e persiste no blueprint
 * (coluna própria, migration 20261083) para alimentar EMAIL_IDEIA e o
 * payload de copy.
 */

import type { EstruturadorOutput } from "./estruturador-prompt"

/** Posição consumível: OutlineSection + papel narrativo completo. */
export interface PosicaoEstruturada {
  section: string
  /** Rótulo curto p/ o Montador (papel truncado — o prompt lista 1 linha/bloco). */
  label: string
  /** Papel narrativo completo (+ adaptação) — vira o purpose do blueprint. */
  papel: string
}

const LABEL_MAX = 90

function truncateLabel(s: string): string {
  const t = s.trim().replace(/\s+/g, " ")
  if (t.length <= LABEL_MAX) return t
  return `${t.slice(0, LABEL_MAX - 1).trimEnd()}…`
}

/**
 * Converte a estrutura do agente nas posições consumíveis pelo pipeline.
 * O rótulo carrega o papel (é o que o Montador lê por bloco); o papel
 * completo (com a adaptação quando existe) segue para o blueprint.
 */
export function estruturaParaPosicoes(
  output: EstruturadorOutput,
): PosicaoEstruturada[] {
  return output.estrutura.map((p) => {
    const papelBase = p.papel.trim()
    const adaptacao = p.adaptacao?.trim()
    return {
      section: p.section,
      label: truncateLabel(papelBase) || p.section,
      papel: adaptacao ? `${papelBase} — Adaptação: ${adaptacao}` : papelBase,
    }
  })
}

/**
 * Aplica papéis + fio no blueprint gerado (AMBAS as rotas — determinística e
 * LLM — passam aqui antes do upsert). Por posição (índice), o papel do
 * Estruturador vira a 1ª linha do purpose; a diretiva original (derivada da
 * variante/HTML) é mantida como "Forma" — o papel diz O QUE a posição faz no
 * arco, a forma diz COMO a variante entrega. Comprimentos divergentes são
 * tolerados: posição sem papel mantém o purpose original (blueprint pode ter
 * ganho/perdido bloco no clamp ou no builder).
 *
 * Retorna um NOVO objeto — não muta o input.
 */
export function aplicarEstruturadorNoBlueprint<
  B extends { purpose: string },
  T extends { blocks: B[]; fio_narrativo?: string | null },
>(blueprint: T, papeis: string[], fioNarrativo: string): T {
  return {
    ...blueprint,
    fio_narrativo: fioNarrativo.trim() || null,
    blocks: blueprint.blocks.map((b, i) => {
      const papel = papeis[i]?.trim()
      if (!papel) return b
      const original = b.purpose?.trim()
      return {
        ...b,
        purpose: original ? `${papel}\n\nForma (variante): ${original}` : papel,
      }
    }),
  }
}
