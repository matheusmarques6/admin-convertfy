/**
 * Normaliza status de campanha vindos das plataformas (Klaviyo/Omnisend)
 * para os labels que o StatusBadge entende.
 *
 * Antes alguns componentes usavam mapping binario
 * (status === "sent" ? "sent" : "draft") — qualquer coisa diferente de
 * "sent" virava "Rascunho", incluindo agendadas, pausadas, em envio.
 *
 * Klaviyo: sent, scheduled, sending, draft, cancelled
 * Omnisend: sent, scheduled, paused, inProgress, draft
 */
export function normalizeCampaignStatus(status: string | undefined | null): string {
  const s = (status || "").toLowerCase().trim()
  if (s === "sent") return "sent"
  if (s === "scheduled") return "scheduled"
  if (s === "paused") return "paused"
  if (s === "draft") return "draft"
  if (s === "inprogress" || s === "in_progress" || s === "sending") return "in_progress"
  if (s === "cancelled" || s === "canceled") return "cancelled"
  return s || "draft"
}
