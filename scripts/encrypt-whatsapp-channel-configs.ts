/**
 * One-shot: cifra o access_token dos canais WhatsApp em crm_channels.
 *
 * Idempotente — encrypt() não re-cifra valores já com prefixo enc:v1:.
 * Rodar manualmente (produção) após deploy da lib de canal:
 *
 *   npx tsx scripts/encrypt-whatsapp-channel-configs.ts
 *
 * Requer env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ENCRYPTION_KEY (64 hex chars).
 */

import { createClient } from "@supabase/supabase-js"
import { encrypt } from "../src/lib/crypto"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const admin = createClient(url, key)

  const { data: channels, error } = await admin
    .from("crm_channels")
    .select("id, config")
    .eq("type", "whatsapp")

  if (error) {
    console.error("Falha ao listar canais:", error.message)
    process.exit(1)
  }

  let updated = 0
  for (const channel of channels ?? []) {
    const config = (channel.config ?? {}) as Record<string, unknown>
    const token = config.access_token
    if (typeof token !== "string" || !token || token.startsWith("enc:v1:")) continue

    const { error: updateError } = await admin
      .from("crm_channels")
      .update({ config: { ...config, access_token: encrypt(token) } })
      .eq("id", channel.id)

    if (updateError) {
      console.error(`Canal ${channel.id}: falha ao atualizar —`, updateError.message)
    } else {
      updated++
      console.log(`Canal ${channel.id}: token cifrado`)
    }
  }

  console.log(`Concluído: ${updated} canal(is) atualizados de ${channels?.length ?? 0} encontrados.`)
}

main()
