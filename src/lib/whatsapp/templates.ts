/**
 * Helpers puros de templates Meta (validação de variáveis e montagem
 * de components pro envio). O sync com a Meta vive em
 * template-service.ts; aqui é só o que a rota de envio precisa.
 */

export interface TemplateForSend {
  id: string
  name: string
  language: string
  status: string
  category: string | null
  body_text: string | null
  body_variables: number
}

/**
 * Valida a contagem de parâmetros contra os {{n}} do body do template
 * (portado do quickValidateVariables do worder).
 */
export function validateTemplateVariables(
  template: Pick<TemplateForSend, "body_variables" | "name">,
  params: string[],
): { valid: true } | { valid: false; error: string } {
  const expected = template.body_variables ?? 0
  const received = params.length

  if (received !== expected) {
    return {
      valid: false,
      error: `Template "${template.name}" espera ${expected} variável(is) no body, recebeu ${received}`,
    }
  }

  const emptyIndex = params.findIndex((p) => !p || !p.trim())
  if (emptyIndex >= 0) {
    return { valid: false, error: `Variável {{${emptyIndex + 1}}} está vazia` }
  }

  return { valid: true }
}

/** Monta o array components (só body params — escopo núcleo). */
export function buildTemplateBodyComponents(params: string[]): unknown[] {
  if (params.length === 0) return []
  return [
    {
      type: "body",
      parameters: params.map((text) => ({ type: "text", text })),
    },
  ]
}
