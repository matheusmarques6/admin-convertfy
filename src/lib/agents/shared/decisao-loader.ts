/**
 * Leitura da `DecisaoDoEmail` persistida em `store_email_blueprints.decisao`
 * (migration 20261145) — para os nós que não recebem o blueprint inteiro
 * (o callback de copy do n8n). Fail-open: coluna ausente ou linha sem
 * decisão devolvem null e dizem isso no log.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { lerDecisao, type DecisaoDoEmail } from "./decisao-do-email"

const log = logger.child("DecisaoLoader")

export async function carregarDecisaoDoEmail(
  admin: SupabaseClient,
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<DecisaoDoEmail | null> {
  const { data, error } = await admin
    .from("store_email_blueprints")
    .select("decisao")
    .eq("store_id", storeId)
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .maybeSingle()
  if (error) {
    log.warn("decisao.load_failed", { storeId, flowType, emailNumber, error: error.message, hint: "aplicar a migration 20261145" })
    return null
  }
  return lerDecisao((data as { decisao?: unknown } | null)?.decisao)
}
