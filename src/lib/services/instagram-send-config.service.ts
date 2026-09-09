/**
 * Config de envio do Instagram — fonte ÚNICA do inbox e das automações.
 *
 * Vivia dentro da rota do inbox; a automação que responde no direct
 * precisa exatamente da mesma resolução (inclusive a auto-cura do
 * vínculo da Página), e duas cópias divergiriam na primeira mudança.
 */

import { logger } from "@/lib/logger"
import type { createAdminClient } from "@/lib/supabase/server"
import { resolveAndHealInstagramChannel } from "./instagram-activity.service"
import type { InstagramChannelConfig } from "./instagram-graph.service"

const log = logger.child("InstagramSendConfig")

export async function resolveInstagramSendConfig(
  admin: ReturnType<typeof createAdminClient>,
  channel: { id: string; external_id: string | null; config: Record<string, unknown> | null },
): Promise<InstagramChannelConfig> {
  const raw = (channel.config ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v ? v : null)

  const base: InstagramChannelConfig = {
    instagram_business_account_id:
      channel.external_id || str(raw.instagram_business_account_id) || "",
    access_token: str(raw.access_token) || "",
    facebook_page_id: str(raw.facebook_page_id),
    facebook_page_token: str(raw.facebook_page_token),
  }

  if (base.facebook_page_token || !base.access_token) return base

  try {
    const healed = await resolveAndHealInstagramChannel(
      admin,
      { id: channel.id, external_id: channel.external_id ?? "" },
      raw,
      { instagram_business_account_id: base.instagram_business_account_id, access_token: base.access_token },
    )
    return {
      ...base,
      instagram_business_account_id: healed.config.instagram_business_account_id,
      facebook_page_id: healed.pageId,
      facebook_page_token: healed.pageToken,
    }
  } catch (err) {
    // Cura é oportunista: se a Graph API estiver fora do ar, ainda vale
    // tentar o caminho do IG User com o token do canal.
    log.warn("[Instagram] auto-cura do canal falhou no envio", {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return base
  }
}
