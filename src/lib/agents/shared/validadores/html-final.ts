/**
 * Validador TEXTUAL do HTML final, por bloco (views do QA), contra a
 * decisão do e-mail. Roda no runner da fase 2 ao lado dos checks de
 * conteúdo; em `shadow` vira `QaIssue` de severidade `low` (só registro),
 * em `on` `high`/`blocking`. Puro.
 */

import type { DecisaoDoEmail } from "../decisao-do-email"
import { avaliarClaims } from "./claims"
import { resultado, type ResultadoValidacao, type Violacao } from "./tipos"

export interface ViewParaValidar {
  block_id: string | null
  indice: number
  tipo: string
  texto_visivel: string
}

export function validarHtmlFinal(decisao: DecisaoDoEmail, views: ViewParaValidar[]): ResultadoValidacao {
  const violacoes: Violacao[] = []
  for (const v of views) {
    for (const c of avaliarClaims(v.texto_visivel, decisao.incentivo, decisao.proibido)) {
      violacoes.push({
        tipo: c.tipo,
        severidade: c.severidade,
        block_index: v.indice,
        section: v.tipo,
        variant_id: v.block_id,
        evidencia: c.trecho,
        esperado: c.esperado,
      })
    }
  }
  return resultado(violacoes)
}
