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
 * Resumo da decisão do Estruturador servido ao CURADOR (var
 * `estruturador_decisao` do prompt): diagnóstico + fio + papel/porquê por
 * posição, na MESMA ordem (pós-clamp) da <sequencia_do_email> — por isso
 * recebe as `posicoes` já clampadas, não o output cru. Compacto de
 * propósito: é critério de escolha, não o embasamento completo (que fica
 * na run).
 */
export function resumoParaCurador(
  output: EstruturadorOutput,
  posicoes: PosicaoEstruturada[],
): string {
  const linhas = posicoes.map((p, i) => {
    const porque = p.porque ? ` (porquê: ${p.porque})` : ""
    return `${i + 1}. ${p.section} — ${p.papel}${porque}`
  })
  const aprendizados = (output.aprendizados_aplicados ?? [])
    .map((a) => `- ${a.slug}${a.como ? `: ${a.como}` : ""}`)
    .join("\n")
  const partes = [
    `Objeção dominante: ${output.diagnostico?.objecao_dominante ?? "—"}`,
    `Mecanismo traduzido: ${output.diagnostico?.traducao_do_mecanismo ?? "—"}`,
    `Fio narrativo: ${output.fio_narrativo ?? "—"}`,
    `Papéis por posição (mesma ordem de <sequencia_do_email>):`,
    ...linhas,
  ]
  if (aprendizados) partes.push(`Aprendizados aplicados:\n${aprendizados}`)
  return partes.join("\n")
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
