import type { SupabaseClient } from "@supabase/supabase-js"
import type { EmailBlueprint } from "@/types/email-generation"
import { logger } from "@/lib/logger"

const log = logger.child("BlueprintLoader")

/**
 * Cascata pra resolver o blueprint efetivo de um email:
 *   1. store_email_blueprints (custom da loja, populado pelo
 *      Architect Agent — generateBlueprintAndReference)
 *   2. email_blueprints (global, template default)
 *   3. null (caller deve cair em DEFAULT_BLUEPRINTS in-code)
 *
 * Schemas das duas tabelas sao compativeis pros campos consumidos
 * (blocks, objective, messaging, subject_hint). Campos extras de
 * store_email_blueprints (image_brief, image_mode, image_aspect,
 * source, version) sao ignorados pelo cast.
 *
 * Loga qual fonte serviu pra debug. Sem esse log, fica indistinguivel
 * "loja com blueprint custom" de "loja sem custom".
 */
export async function loadEffectiveBlueprint(
  admin: SupabaseClient,
  storeId: string | null,
  flowType: string,
  emailNumber: number,
): Promise<EmailBlueprint | null> {
  if (storeId) {
    const { data, error } = await admin
      .from("store_email_blueprints")
      .select("*")
      .eq("store_id", storeId)
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle()
    if (error) {
      log.warn("loadEffectiveBlueprint.store_query_failed", {
        storeId, flowType, emailNumber, error: error.message,
      })
    }
    if (data) {
      log.info("loadEffectiveBlueprint.source", { source: "store", storeId, flowType, emailNumber })
      return data as EmailBlueprint
    }
  }

  const { data: globalRow, error: globalErr } = await admin
    .from("email_blueprints")
    .select("*")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .maybeSingle()

  if (globalErr) {
    log.warn("loadEffectiveBlueprint.global_query_failed", {
      flowType, emailNumber, error: globalErr.message,
    })
  }
  if (globalRow) {
    log.info("loadEffectiveBlueprint.source", { source: "global", flowType, emailNumber })
    return globalRow as EmailBlueprint
  }

  log.info("loadEffectiveBlueprint.source", { source: "none", flowType, emailNumber })
  return null
}

/**
 * Variante batch da cascata: pra multiplos flow_types ao mesmo tempo.
 *
 * Retorna um Map cuja chave e `${flow_type}__${email_number}`. Aplica a
 * mesma prioridade do single (`loadEffectiveBlueprint`): store-specific
 * sobrescreve global. Usado pelo pipeline de webhook do Email Copy onde
 * precisamos do blueprint efetivo de cada email de varios flows em uma
 * tacada so.
 *
 * Falhas de query sao logadas e tratadas como "sem dados" (Map vazio
 * naquela camada) — caller cai no DEFAULT_BLUEPRINTS in-code.
 */
export async function loadEffectiveBlueprintsBatch(
  admin: SupabaseClient,
  storeId: string | null,
  flowTypes: string[],
): Promise<Map<string, EmailBlueprint>> {
  const result = new Map<string, EmailBlueprint>()
  if (flowTypes.length === 0) return result

  // 1. Globais primeiro (base da cascata)
  const { data: globals, error: globalErr } = await admin
    .from("email_blueprints")
    .select("*")
    .in("flow_type", flowTypes)

  if (globalErr) {
    log.warn("loadEffectiveBlueprintsBatch.global_query_failed", {
      flowTypes, error: globalErr.message,
    })
  }
  for (const bp of (globals ?? []) as EmailBlueprint[]) {
    result.set(`${bp.flow_type}__${bp.email_number}`, bp)
  }

  // 2. Store-specific sobrescreve (topo da cascata)
  if (storeId) {
    const { data: stores, error: storeErr } = await admin
      .from("store_email_blueprints")
      .select("*")
      .eq("store_id", storeId)
      .in("flow_type", flowTypes)

    if (storeErr) {
      log.warn("loadEffectiveBlueprintsBatch.store_query_failed", {
        storeId, flowTypes, error: storeErr.message,
      })
    }
    for (const bp of (stores ?? []) as EmailBlueprint[]) {
      result.set(`${bp.flow_type}__${bp.email_number}`, bp)
    }
  }

  log.info("loadEffectiveBlueprintsBatch.resolved", {
    storeId, flowTypes, total: result.size,
  })

  return result
}
