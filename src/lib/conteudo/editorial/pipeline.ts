/**
 * Etapas do motor editorial e o que cada uma exige da anterior. A ordem é
 * o que separa "gerou um carrossel" de "gerou um bom": a headline é
 * escolhida entre várias e a espinha é aprovada ANTES da copy.
 */

import type { Editorial, HeadlineOpcao } from "../types"

export type EtapaEditorial = "insumo" | "triagem" | "headline" | "espinha" | "copy" | "revisao"

export const ETAPAS: Array<{ id: EtapaEditorial; nome: string; descricao: string }> = [
  { id: "insumo", nome: "Pauta", descricao: "O que você tem: ideia, texto, dado, link." },
  { id: "triagem", nome: "Triagem", descricao: "Transformação, fricção, ângulo e evidências." },
  { id: "headline", nome: "Headline", descricao: "10 opções com padrão e gatilhos; você escolhe." },
  { id: "espinha", nome: "Espinha dorsal", descricao: "Hook, mecanismo, prova, aplicação, direção, fechamento." },
  { id: "copy", nome: "Copy", descricao: "Os slides, derivados da espinha aprovada." },
  { id: "revisao", nome: "Revisão", descricao: "7 parâmetros + filtro editorial." },
]

/** Próxima etapa a cumprir — a primeira cuja pré-condição falta. */
export function etapaAtual(ed: Editorial | undefined): EtapaEditorial {
  if (!ed || !ed.insumo.trim()) return "insumo"
  if (!ed.triagem) return "triagem"
  if (!ed.headlines?.length || ed.headlineEscolhida == null || !ed.headlines[ed.headlineEscolhida]) return "headline"
  if (!ed.espinha) return "espinha"
  if (!ed.revisao) return "copy"
  return "revisao"
}

export function indiceDaEtapa(e: EtapaEditorial): number {
  return ETAPAS.findIndex((x) => x.id === e)
}

export function headlineEscolhida(ed: Editorial | undefined): HeadlineOpcao | null {
  if (!ed?.headlines?.length || ed.headlineEscolhida == null) return null
  return ed.headlines[ed.headlineEscolhida] ?? null
}

/** A copy só pode ser derivada com triagem + headline escolhida + espinha. */
export function podeGerarCopy(ed: Editorial | undefined): boolean {
  return Boolean(ed?.triagem && headlineEscolhida(ed) && ed?.espinha)
}

export function editorialVazio(insumo: string, voz: "marca" | "pessoal", segundaPessoa = true): Editorial {
  return { insumo, voz, segundaPessoa }
}
