/**
 * Nome de evento personalizado da Meta — o mesmo dos dois lados.
 *
 * O pixel do navegador manda o nome do evento na URL da requisição.
 * Com espaço, o nome chega à Meta já codificado e ela registra o
 * literal: o Gerenciador de Eventos passa a mostrar DOIS eventos
 * diferentes para a mesma conversão —
 *
 *   Lead%20qualificado   ← navegador
 *   Lead qualificado     ← API de Conversões
 *
 * — e, como os nomes divergem, a deduplicação por `event_id` não
 * acontece, a conversão conta duas vezes e nenhum dos dois serve para
 * otimizar campanha (é preciso escolher um só na hora de criar a
 * conversão personalizada).
 *
 * A saída segue a convenção dos eventos padrão da Meta (PascalCase, sem
 * espaço nem acento): "Lead qualificado" → "LeadQualificado".
 *
 * Módulo puro e client-safe: o servidor sanitiza antes de enviar pela
 * CAPI **e** antes de devolver o nome ao browser, então os dois lados
 * usam exatamente a mesma string por construção.
 */

/** Fallback quando o nome configurado não sobra nada utilizável. */
export const DEFAULT_QUALIFIED_EVENT_NAME = "LeadQualificado"

/**
 * Converte um nome livre no identificador que a Meta aceita sem
 * ambiguidade. Nome que já vem sem espaço passa intacto.
 */
export function metaEventName(raw: string | null | undefined): string {
  const base = (raw ?? "").trim()
  if (!base) return DEFAULT_QUALIFIED_EVENT_NAME

  const clean = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acento (NFD separa a marca)
    .replace(/[^A-Za-z0-9 _-]/g, " ") // só o que a Meta lê sem escapar
    .trim()

  if (!clean) return DEFAULT_QUALIFIED_EVENT_NAME

  // Sem separador nenhum: respeita a grafia de quem escreveu
  // ("LeadQualificado", "lead_qualificado" continuam como estão).
  if (!/[\s]/.test(clean)) return clean

  return clean
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
}

/** true quando o nome configurado será alterado no envio. */
export function willRenameEvent(raw: string | null | undefined): boolean {
  const base = (raw ?? "").trim()
  return base.length > 0 && metaEventName(base) !== base
}
