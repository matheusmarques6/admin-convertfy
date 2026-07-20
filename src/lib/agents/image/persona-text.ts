/**
 * personaToText — normaliza o campo de persona/ICP para TEXTO de prompt.
 *
 * `client_stores.icp_persona` (pilar de pesquisa) é um OBJETO estruturado;
 * interpolá-lo direto em template string produzia `[object Object]` no
 * prompt do agente de imagem (avatares Luxe Lift, 20/jul). Aceita string,
 * objeto (pega o primeiro campo textual conhecido) ou null.
 *
 * Puro (zero deps) — testável.
 */

const TEXT_FIELDS = [
  "resumo",
  "summary",
  "descricao",
  "description",
  "persona",
  "perfil",
  "nome",
  "name",
] as const

const MAX_LEN = 300

export function personaToText(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, MAX_LEN)
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const field of TEXT_FIELDS) {
      const v = obj[field]
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, MAX_LEN)
    }
    // Sem campo textual conhecido: serializa compacto (melhor um JSON curto
    // e legível do que "[object Object]" ou perder o contexto inteiro).
    try {
      const json = JSON.stringify(obj)
      return json && json !== "{}" ? json.slice(0, MAX_LEN) : ""
    } catch {
      return ""
    }
  }
  return ""
}
