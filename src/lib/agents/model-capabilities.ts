/**
 * O que o modelo aceita — as duas perguntas que já custaram geração.
 *
 * Módulo PURO (zero I/O). Existe porque as duas respostas estavam
 * espalhadas: o corte de raciocínio era decidido de novo em cada chain da
 * fase 2, e a capacidade de visão não era perguntada a ninguém — a hero
 * trocava de modelo por precaução, mesmo quando o configurado enxergava.
 *
 * ── O corte de raciocínio ────────────────────────────────────────────
 *
 * Cinco chains mandavam `reasoning: { enabled: false }` INCONDICIONALMENTE
 * (hero, text_format, color_format, typography, qa). O corte foi escrito
 * para o Kimi K3 e o GLM, que pensam por padrão e queimavam minutos num
 * step cujo output é um JSON pequeno de operações. Correto para eles.
 *
 * Errado para todo o resto: o Fable 5.1 tem raciocínio OBRIGATÓRIO e o
 * provedor recusa a requisição inteira com `400 Reasoning is mandatory for
 * this endpoint and cannot be disabled`. Em 08/09 as runs de `color_format`
 * e `typography` morreram assim, a 90ms e zero token — recusa antes de
 * gerar. Os dois são fail-open, então a peça saiu sem tipografia e sem
 * ajuste de cor, em silêncio.
 *
 * A régua abaixo é a que o `llm-invoke.ts` já usava e os chains não: cortar
 * SÓ em quem pensa por padrão e aceita ser cortado. Para o resto, não mandar
 * nada e deixar o default do provedor decidir.
 *
 * A assimetria dos erros manda no desenho. Cortar quem não aceita derruba a
 * chamada (HTTP 400). Não cortar quem aceitaria custa latência e tokens.
 * Por isso a lista é de INCLUSÃO: modelo novo que ninguém mapeou não é
 * cortado, e o pior caso vira lentidão, nunca falha.
 *
 * ── A visão ──────────────────────────────────────────────────────────
 *
 * Mesma assimetria, sinal trocado. Anexar imagem a modelo que não enxerga
 * faz o provedor errar ou descartar o anexo em silêncio; deixar de anexar a
 * quem enxergaria só mantém o comportamento antigo. Por isso aqui a lista é
 * de famílias COMPROVADAS, e o default é "não enxerga".
 *
 * O `/` é parte da pergunta: sem ele o modelo roteia pelo SDK da Anthropic,
 * que não aceita anexo por URL e lança explicitamente (`format-invoke.ts`).
 * Modelo sem barra não serve para visão mesmo sendo capaz.
 */

/**
 * Modelos com raciocínio ligado por padrão QUE aceitam desligá-lo.
 *
 * Kimi K3 e GLM. Não inclua aqui família cujo raciocínio é obrigatório
 * (Fable, Mythos) — é exatamente o 400 que este módulo existe para evitar.
 */
const RACIOCINIO_CORTAVEL = /kimi|glm/i

/** O modelo pensa por padrão e aceita que a gente desligue? */
export function aceitaCorteDeRaciocinio(model: string): boolean {
  return RACIOCINIO_CORTAVEL.test(model)
}

/**
 * O trecho de request que corta o raciocínio, ou nada.
 *
 * Feito para spread direto no corpo da chamada:
 * `...corteDeRaciocinio(config.model)`.
 *
 * `FORMAT_OPS_REASONING=on` devolve o raciocínio a todos sem deploy — é o
 * escape hatch que já existia nos chains, preservado aqui.
 */
export function corteDeRaciocinio(model: string): {
  reasoning?: { enabled: false }
} {
  if (process.env.FORMAT_OPS_REASONING === "on") return {}
  return aceitaCorteDeRaciocinio(model) ? { reasoning: { enabled: false } } : {}
}

/**
 * Famílias com entrada de imagem comprovada em produção neste projeto.
 *
 * Claude 3 em diante (Sonnet, Opus, Haiku, Fable), GPT-4o/4.1/5 e Gemini.
 * Fora da lista o modelo é tratado como cego — ver a assimetria no topo.
 */
const FAMILIAS_COM_VISAO = [
  /^anthropic\/claude-/i,
  /^openai\/gpt-(?:4o|4\.1|5)/i,
  /^google\/gemini/i,
]

/**
 * O modelo aceita imagem anexada à mensagem?
 *
 * Exige rota OpenRouter (o `/`): o caminho Anthropic-direto recusa anexo
 * com exceção, por mais que o modelo enxergue.
 */
export function modeloTemVisao(model: string): boolean {
  if (!model.includes("/")) return false
  return FAMILIAS_COM_VISAO.some((re) => re.test(model))
}
