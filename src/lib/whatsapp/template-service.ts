/**
 * Sync e listagem de templates Meta por canal (destilado do
 * template-manager do worder — funções em vez de classe, padrão do
 * projeto).
 *
 * O trigger crm_wa_templates_extract_components extrai header/body/
 * footer/buttons e conta {{n}} quando o upsert grava components.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { loadWhatsAppChannel } from "./channel-config"

const log = logger.child("WhatsAppTemplates")

export interface SyncResult {
  channelId: string
  synced: number
  errors: number
}

/**
 * Busca todos os templates da WABA na Meta e faz upsert em
 * crm_whatsapp_templates (onConflict channel_id,name,language).
 */
export async function syncTemplatesForChannel(
  admin: SupabaseClient,
  channelId: string,
): Promise<SyncResult> {
  const loaded = await loadWhatsAppChannel(admin, { channelId })
  if (!loaded) {
    throw new Error(`Canal ${channelId} não encontrado ou sem credenciais`)
  }
  if (!loaded.wabaId) {
    throw new Error(`Canal ${channelId} sem business_account_id (WABA) no config`)
  }

  const templates = await loaded.client.listTemplates(loaded.wabaId)
  let synced = 0
  let errors = 0

  for (const tpl of templates) {
    const { error } = await admin.from("crm_whatsapp_templates").upsert(
      {
        org_id: loaded.channel.org_id,
        channel_id: channelId,
        waba_id: loaded.wabaId,
        meta_template_id: tpl.id,
        name: tpl.name,
        language: tpl.language,
        category: tpl.category ?? null,
        status: (tpl.status ?? "PENDING").toUpperCase(),
        components: tpl.components ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,name,language" },
    )
    if (error) {
      errors++
      log.error("upsert de template falhou", { channelId, name: tpl.name, message: error.message })
    } else {
      synced++
    }
  }

  log.info("sync de templates concluído", { channelId, synced, errors, total: templates.length })
  return { channelId, synced, errors }
}

export interface TemplateListItem {
  id: string
  name: string
  language: string
  category: string | null
  status: string
  header_type: string | null
  header_text: string | null
  body_text: string | null
  body_variables: number
  footer_text: string | null
  buttons: unknown
  use_count: number
  last_used_at: string | null
  synced_at: string | null
}

export async function listTemplates(
  admin: SupabaseClient,
  args: { channelId: string; approvedOnly?: boolean },
): Promise<TemplateListItem[]> {
  let query = admin
    .from("crm_whatsapp_templates")
    .select(
      "id, name, language, category, status, header_type, header_text, body_text, body_variables, footer_text, buttons, use_count, last_used_at, synced_at",
    )
    .eq("channel_id", args.channelId)
    .order("use_count", { ascending: false })
    .order("name", { ascending: true })

  if (args.approvedOnly) query = query.eq("status", "APPROVED")

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TemplateListItem[]
}
