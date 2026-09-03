/**
 * Consumo do output do Estruturador (fase 3 — modo 'on'). Módulo PURO.
 *
 * Quando `estruturador_mode='on'` e a run devolve estrutura, a sequência
 * decidida pelo agente SUBSTITUI a da aba Arquitetura: as posições viram a
 * `structure` do Montador e do Curador (categoria + papel como rótulo) e o
 * papel narrativo de cada posição sobrescreve o `purpose` do bloco
 * correspondente no blueprint — é assim que a decisão chega à copy do n8n
 * (o purpose já viaja no payload por bloco). A intenção por bloco da
 * Arquitetura não entra nesse caminho (a sequência é do Estruturador).
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
  /** Porquê da posição (embasamento) — entra no resumo servido ao Curador. */
  porque: string
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
      porque: p.porque?.trim() ?? "",
    }
  })
}

/**
 * A decisão do Estruturador servida ao CURADOR (var `estruturador_decisao`
 * do prompt): o output INTEIRO, em JSON legível — diagnóstico, cada posição
 * com papel/referência/adaptação/porquê, fio, fontes, aprendizados
 * aplicados e descartes.
 *
 * Era um resumo (`resumoParaCurador`: objeção + mecanismo + fio + papel/
 * porquê por posição). Decisão do owner (02/09): o Curador recebe tudo. Os
 * descartes importam na prática — se o Estruturador tirou o CTA isolado
 * "para não competir com os botões da grade", o Curador precisa saber, senão
 * escolhe um body com CTA pesado e recoloca o dispositivo por outra via.
 *
 * Clamp de segurança (24k chars, marcador explícito) no mesmo espírito do
 * `clampPromptText`: um output patológico não pode engolir o prompt.
 */
export const DECISAO_MAX_CHARS = 24_000

export function decisaoCompletaParaCurador(output: EstruturadorOutput): string {
  const json = JSON.stringify(output, null, 2)
  if (json.length <= DECISAO_MAX_CHARS) return json
  return `${json.slice(0, DECISAO_MAX_CHARS)}\n(… decisão truncada em ${DECISAO_MAX_CHARS} caracteres — o restante está na run do Estruturador)`
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

/**
 * Intenção HUMANA do bloco (aba Arquitetura) × papel do agente (Estruturador
 * ou Curador do vault). A intenção é a âncora: vem PRIMEIRO no purpose do
 * blueprint — é a 1ª linha que o n8n lê como `bloco.purpose` e o agente de
 * imagem como `blueprint_purpose`. O papel do agente entra embaixo, como
 * detalhe ("Papel (Curador): …"); sem agente, só a intenção; sem intenção,
 * só o papel (comportamento de antes). `null` quando não há nada.
 */
export function combinarIntencaoComPapel(
  intencao: string | null | undefined,
  papelAgente: string | null | undefined,
): string | null {
  const i = (intencao ?? "").trim()
  const p = (papelAgente ?? "").trim()
  if (i && p) return `${i}\n\nPapel (Curador): ${p}`
  if (i) return i
  if (p) return p
  return null
}
