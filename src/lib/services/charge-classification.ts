/**
 * Validação server-side da classificação de uma cobrança
 * (tipo + meses de referência + loja) — compartilhada pelas rotas de
 * cobrança local, fatura Asaas e reclassificação.
 */

import { AppError } from "@/lib/api/errors"
import { isMonthKey } from "@/lib/services/call-coverage"
import { isChargeType, type ChargeType } from "@/lib/services/charge-description"

export interface ChargeClassification {
  charge_type?: ChargeType
  reference_months?: string[] | null
  store_id?: string | null
  /**
   * Lojas da cobrança (comissão de várias lojas numa fatura — migration
   * 20261118). Contrato: uma loja → `store_id` = ela e `store_ids` =
   * [ela]; várias → `store_id` NULL e `store_ids` = todas.
   */
  store_ids?: string[] | null
}

/** Lojas efetivas de uma classificação/cobrança (store_ids vence; senão store_id). */
export function chargeStoreIds(row: { store_id?: string | null; store_ids?: string[] | null }): string[] {
  if (Array.isArray(row.store_ids) && row.store_ids.length > 0) return row.store_ids
  return row.store_id ? [row.store_id] : []
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lê `charge_type` / `reference_months` / `store_id` do body (qualquer
 * um opcional) e devolve só o que veio, já validado. Chave ausente =
 * não mexe; `null` = limpa.
 */
export function parseChargeClassification(body: Record<string, unknown>): ChargeClassification {
  const out: ChargeClassification = {}
  if (body.charge_type !== undefined) {
    if (!isChargeType(body.charge_type)) {
      throw new AppError("charge_type inválido (subscription | commission | other)", 400, "validation-error")
    }
    out.charge_type = body.charge_type
  }
  if (body.reference_months !== undefined) {
    if (body.reference_months === null) {
      out.reference_months = null
    } else {
      if (!Array.isArray(body.reference_months) || !body.reference_months.every(isMonthKey)) {
        throw new AppError("reference_months deve ser uma lista de meses YYYY-MM", 400, "validation-error")
      }
      const months = [...new Set(body.reference_months as string[])].sort()
      out.reference_months = months.length > 0 ? months : null
    }
  }
  if (body.store_ids !== undefined) {
    if (body.store_ids === null) {
      out.store_id = null
      out.store_ids = null
    } else {
      if (!Array.isArray(body.store_ids) || !body.store_ids.every((s) => typeof s === "string" && UUID_RE.test(s))) {
        throw new AppError("store_ids deve ser uma lista de ids de loja", 400, "validation-error")
      }
      const ids = [...new Set(body.store_ids as string[])]
      out.store_ids = ids.length > 0 ? ids : null
      out.store_id = ids.length === 1 ? ids[0] : null
    }
  } else if (body.store_id !== undefined) {
    if (body.store_id === null || body.store_id === "") {
      out.store_id = null
      out.store_ids = null
    } else {
      if (typeof body.store_id !== "string" || !UUID_RE.test(body.store_id)) {
        throw new AppError("store_id inválido", 400, "validation-error")
      }
      out.store_id = body.store_id
      out.store_ids = [body.store_id]
    }
  }
  return out
}

/** Erro do PostgREST quando a migration 20261113 ainda não rodou. */
export function isMissingClassificationColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  return /charge_type|reference_months|store_ids?|asaas_subscription_id/.test(error.message ?? "") &&
    /column|schema cache/i.test(error.message ?? "")
}

/** Tira as colunas novas de um payload para o retry sem a migration. */
export function stripClassification<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload }
  delete copy.charge_type
  delete copy.reference_months
  delete copy.store_id
  delete copy.store_ids
  delete copy.asaas_subscription_id
  return copy
}

/**
 * Sem a migration 20261118 (`store_ids`) o write falha em 42703 citando
 * só essa coluna — este retry tira `store_ids` e mantém o resto (a loja
 * única continua em `store_id`).
 */
export function isMissingStoreIdsColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (error.code === "42703" || error.code === "PGRST204") && /store_ids/.test(error.message ?? "")
}

export function stripStoreIds<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload }
  delete copy.store_ids
  return copy
}
