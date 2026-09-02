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
 * Só os `blocks` do blueprint GLOBAL (`email_blueprints`) — a linha que a
 * aba Arquitetura edita. É de onde sai a INTENÇÃO por bloco
 * (`blocks[].purpose`) que ancora cada posição da structure. Best-effort:
 * erro ou ausência devolvem lista vazia (a geração segue sem intenções).
 */
export async function loadGlobalBlueprintBlocks(
  admin: SupabaseClient,
  flowType: string,
  emailNumber: number,
): Promise<Array<{ type: string; purpose?: string | null }>> {
  const { data, error } = await admin
    .from("email_blueprints")
    .select("blocks")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .maybeSingle()
  if (error) {
    log.warn("loadGlobalBlueprintBlocks.failed", { flowType, emailNumber, error: error.message })
    return []
  }
  const blocks = (data as { blocks?: unknown } | null)?.blocks
  return Array.isArray(blocks)
    ? (blocks as Array<{ type?: string; purpose?: string | null }>).map((b) => ({
        type: String(b.type ?? ""),
        purpose: b.purpose ?? null,
      }))
    : []
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

/**
 * Emails "somente texto" dos flows dados: rows GLOBAIS de email_blueprints
 * com text_only=true, indexados por `${flow_type}:${email_number}`.
 *
 * Retorna o row global COMPLETO (não só a flag) porque o dispatch usa o
 * próprio row como blueprint do payload — text_only ignora a camada
 * store_email_blueprints por design.
 *
 * Fail-open: erro de query (ex.: migration da coluna ainda não aplicada)
 * loga warn e retorna Map vazio — todos os emails se comportam como hoje.
 */
export async function loadTextOnlyBlueprints(
  admin: SupabaseClient,
  flowTypes: string[],
): Promise<Map<string, EmailBlueprint>> {
  const result = new Map<string, EmailBlueprint>()
  if (flowTypes.length === 0) return result

  const { data, error } = await admin
    .from("email_blueprints")
    .select("*")
    .in("flow_type", flowTypes)
    .eq("text_only", true)

  if (error) {
    log.warn("loadTextOnlyBlueprints.query_failed", {
      flowTypes, error: error.message,
    })
    return result
  }
  for (const bp of (data ?? []) as EmailBlueprint[]) {
    result.set(`${bp.flow_type}:${bp.email_number}`, bp)
  }
  return result
}

/**
 * Checagem pontual: o par (flow_type, email_number) está marcado como
 * "somente texto"? Mesma semântica fail-open do batch (erro => false).
 */
export async function isTextOnlyEmail(
  admin: SupabaseClient,
  flowType: string,
  emailNumber: number,
): Promise<boolean> {
  const { data, error } = await admin
    .from("email_blueprints")
    .select("id")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .eq("text_only", true)
    .maybeSingle()

  if (error) {
    log.warn("isTextOnlyEmail.query_failed", {
      flowType, emailNumber, error: error.message,
    })
    return false
  }
  return !!data
}
