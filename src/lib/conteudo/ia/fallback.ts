/**
 * Modo local da IA do Estúdio — só o que dá para fazer SEM modelo e sem
 * inventar conteúdo: distribuir linhas coladas em slides e a correção
 * mecânica de compliance da legenda. Headline, legenda, estrutura e leitura
 * de inspiração NÃO têm modo local: quando a ConvertIA falha, a UI mostra o
 * erro e deixa o usuário tentar de novo ou escrever à mão.
 */

import { corrigirLegendaLocal } from "../compliance"
import { linhasDeTexto, propostasDeLinhas } from "../documento"
import type { Documento } from "../types"
import type { SaidaChat } from "./schemas"

export function corrigirLocal(legenda: string): { legenda: string } {
  return { legenda: corrigirLegendaLocal(legenda) }
}

/**
 * Resposta local do chat quando a rota falha. Devolve algo aplicável só
 * quando a mensagem tem 2+ linhas (distribuição determinística); no resto,
 * explica o que aconteceu e o que dá para fazer sem a IA.
 */
export function chatLocal(doc: Documento, mensagem: string, erro: string): SaidaChat {
  const linhas = linhasDeTexto(mensagem)
  if (linhas.length >= 2) {
    const props = propostasDeLinhas(doc, mensagem)
    if (props.length) {
      return {
        texto: `A ConvertIA não respondeu (${erro}). Distribuí o texto colado em ${props.length} slides pelo modo local, uma linha por slide, mantendo capa e CTA.`,
        acao: { tipo: "estrutura", label: `Aplicar em ${props.length} slides` },
        props,
      }
    }
  }
  return {
    texto: `A ConvertIA não respondeu: ${erro}. Sem o modelo eu só consigo distribuir texto colado (uma linha por slide) e corrigir compliance da legenda. Tente de novo em alguns instantes ou escreva direto nos slides.`,
    acao: { tipo: "nenhuma", label: "Sem ação" },
  }
}
