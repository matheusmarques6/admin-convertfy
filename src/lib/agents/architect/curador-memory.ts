/**
 * Memória do Curador (assembler_chooser).
 *
 * Histórico append-only em `email_generation_choices`. Dá ao Curador dois
 * sinais na hora de escolher variantes para (loja × flow × email N):
 *   1. previousEmail — o que foi escolhido no email ANTERIOR (N-1) do MESMO
 *      flow/loja → coerência de linguagem visual dentro do flow.
 *   2. crossStore — as últimas escolhas do MESMO email (N) em OUTRAS lojas do
 *      mesmo org → variedade (não escolher sempre as mesmas variantes).
 *
 * Best-effort: qualquer falha de leitura/escrita é logada e NUNCA derruba a
 * geração (memória é sinal, não bloqueio).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CuradorMemory")

const CROSS_STORE_LIMIT = 3

export interface ChoiceEntry {
  section: string
  variant_id: string
  variant_name: string
}

export interface CuradorMemory {
  /** org da loja (resolvido no load; reusado no log pra escopar cross-store). */
  orgId: string | null
  /** Escolha do email N-1 do mesmo flow/loja (coerência). null se N=1 ou sem histórico. */
  previousEmail: { email_number: number; choices: ChoiceEntry[] } | null
  /** Últimas escolhas do email N em outras LOJAS distintas do org (variedade). */
  crossStore: Array<{ store_name: string; created_at: string; choices: ChoiceEntry[] }>
}

const EMPTY: CuradorMemory = { orgId: null, previousEmail: null, crossStore: [] }

export async function loadCuradorMemory(
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<CuradorMemory> {
  try {
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store?.org_id as string | null) ?? null

    // 1. Email anterior (N-1) do mesmo flow/loja — coerência.
    let previousEmail: CuradorMemory["previousEmail"] = null
    if (emailNumber > 1) {
      const { data } = await admin
        .from("email_generation_choices")
        .select("email_number, choices")
        .eq("store_id", storeId)
        .eq("flow_type", flowType)
        .eq("email_number", emailNumber - 1)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        previousEmail = {
          email_number: data.email_number as number,
          choices: (data.choices as ChoiceEntry[]) ?? [],
        }
      }
    }

    // 2. Mesmo email (N) em outras lojas do org — variedade. Busca recentes e
    // dedup por loja (as últimas LOJAS distintas, não a mesma loja repetida).
    const crossStore: CuradorMemory["crossStore"] = []
    if (orgId) {
      const { data } = await admin
        .from("email_generation_choices")
        .select("store_id, choices, created_at, store:client_stores(store_name)")
        .eq("org_id", orgId)
        .eq("flow_type", flowType)
        .eq("email_number", emailNumber)
        .neq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(CROSS_STORE_LIMIT * 5)
      const seen = new Set<string>()
      for (const row of (data as Array<Record<string, unknown>>) ?? []) {
        const sid = row.store_id as string
        if (seen.has(sid)) continue
        seen.add(sid)
        const rel = row.store as { store_name?: string } | { store_name?: string }[] | null
        const storeName =
          (Array.isArray(rel) ? rel[0]?.store_name : rel?.store_name) ?? "Loja"
        crossStore.push({
          store_name: storeName,
          created_at: row.created_at as string,
          choices: (row.choices as ChoiceEntry[]) ?? [],
        })
        if (crossStore.length >= CROSS_STORE_LIMIT) break
      }
    }

    return { orgId, previousEmail, crossStore }
  } catch (err) {
    log.warn("memory.load_failed", {
      storeId,
      flowType,
      emailNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return EMPTY
  }
}

/** Registra a escolha desta geração (append-only). No-op se sem escolhas. */
export async function logCuradorChoice(input: {
  storeId: string
  orgId: string | null
  flowType: string
  emailNumber: number
  batchId?: string
  choices: ChoiceEntry[]
}): Promise<void> {
  if (input.choices.length === 0) return
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("email_generation_choices").insert({
      store_id: input.storeId,
      org_id: input.orgId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      choices: input.choices,
      batch_id: input.batchId ?? null,
    })
    if (error) throw error
  } catch (err) {
    log.warn("memory.log_failed", {
      storeId: input.storeId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Formata a memória para a var {{memoria}} do prompt do Curador. */
export function renderCuradorMemory(mem: CuradorMemory): string {
  const parts: string[] = []
  if (mem.previousEmail) {
    const lines = mem.previousEmail.choices
      .map((c) => `  - ${c.section}: ${c.variant_name}`)
      .join("\n")
    parts.push(
      `<email_anterior_desta_loja email_number="${mem.previousEmail.email_number}">\n${lines || "  (sem blocos)"}\n</email_anterior_desta_loja>`,
    )
  }
  if (mem.crossStore.length > 0) {
    const blocks = mem.crossStore
      .map((s) => {
        const lines = s.choices
          .map((c) => `    - ${c.section}: ${c.variant_name}`)
          .join("\n")
        return `  <loja nome="${s.store_name}">\n${lines || "    (sem blocos)"}\n  </loja>`
      })
      .join("\n")
    parts.push(`<mesmo_email_em_outras_lojas>\n${blocks}\n</mesmo_email_em_outras_lojas>`)
  }
  return parts.join("\n\n") || "(sem histórico ainda)"
}
