/**
 * Quem consegue entregar foto de perfil HOJE (puro, sem I/O).
 *
 * Existe porque o lote do cron é pequeno (APIs de terceiro têm rate
 * limit) e, sem esta régua, um canal desconectado o ocupa inteiro sendo
 * pulado: em produção 54 das 59 conversas são de uma instância Evolution
 * deslogada desde 04/08/2026, e o Instagram — que tem foto para buscar —
 * nunca era alcançado.
 *
 * Também é a regra que faz a foto aparecer na PRIMEIRA rodada depois de
 * religar o número: canal inelegível não entra no lote, então não gasta
 * a janela de re-tentativa de 7 dias.
 */

export interface CanalParaAvatar {
  id: string
  type: string | null
  provider?: string | null
  config?: Record<string, unknown> | null
  is_active?: boolean | null
}

/**
 * `true` quando o canal tem como responder uma foto de contato agora.
 *
 * - Instagram: Messaging Profile API, disponível enquanto o canal existe.
 * - WhatsApp/Evolution: a foto vem da sessão do WhatsApp — instância
 *   deslogada (`connection_state` diferente de `open`) não responde.
 *   Estado ausente é tratado como aberto: canal recém-conectado ainda
 *   não recebeu `connection.update`, e presumir fechado o deixaria de
 *   fora para sempre.
 * - WhatsApp Cloud (oficial) e qualquer outro provedor: a Meta não expõe
 *   foto de contato.
 */
export function canalPodeEntregarFoto(canal: CanalParaAvatar): boolean {
  if (canal.is_active === false) return false
  if (canal.type === "instagram") return true
  if (canal.type !== "whatsapp" || canal.provider !== "evolution") return false
  const estado = canal.config?.connection_state
  return typeof estado !== "string" || estado === "" || estado === "open"
}

/** Ids dos canais elegíveis — o que o cron usa para filtrar o lote. */
export function canaisElegiveisParaAvatar(canais: CanalParaAvatar[]): string[] {
  return canais.filter(canalPodeEntregarFoto).map((c) => c.id)
}
