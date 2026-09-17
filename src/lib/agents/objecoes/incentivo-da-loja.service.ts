/**
 * Lê o que `incentivoDoOutline` precisa e devolve a decisão de incentivo de
 * um toque. É a ÚNICA porta de I/O do incentivo: o runner da fase 2 e o
 * Seletor chamam daqui; o webhook do n8n, que já tem outline, idioma e bloco
 * em escopo, chama a função pura direto.
 *
 * Três leituras, todas fail-open com log nomeado:
 *   1. outline do toque (`coupon_code`, `coupon_codes`, `coupon_value`) —
 *      as duas colunas novas podem não existir (migration aplicada à mão);
 *      o retry sem elas registra `incentivo.sem_traducao`;
 *   2. idioma da loja (`client_stores.language`, senão o formulário do
 *      último onboarding — mesma régua do webhook);
 *   3. override da loja: `content.code` do bloco `coupon` do e-mail.
 *
 * Falha total devolve SEM_INCENTIVO e `log.error`: e-mail sem promessa é o
 * erro barato; e-mail com cupom inventado é o caro.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { resolveStoreLanguage } from "@/lib/i18n/store-language"

import { SEM_INCENTIVO, incentivoDoOutline, type DecisaoDeIncentivo, type OutlineComCupom } from "./incentivo"

const log = logger.child("Incentivo")

export interface ResolverIncentivoInput {
  storeId: string
  flowType: string | null | undefined
  emailNumber: number | null | undefined
  /** Quando conhecido, lê o override do bloco `coupon` deste e-mail. */
  emailId?: string | null
}

function colunaAusente(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? ""
  return code === "42703" || code === "PGRST204"
}

type Admin = ReturnType<typeof createAdminClient>

export async function carregarOutlineComCupom(
  admin: Admin,
  flowType: string,
  emailNumber: number,
): Promise<OutlineComCupom | null> {
  const base = admin
    .from("email_outline_templates")
    .select("coupon_code, coupon_codes, coupon_value")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  const { data, error } = await base
  if (!error) return (data as OutlineComCupom | null) ?? null
  if (!colunaAusente(error)) {
    log.warn("incentivo.outline_load_failed", { flowType, emailNumber, error: error.message })
    return null
  }
  log.warn("incentivo.sem_traducao", {
    flowType,
    emailNumber,
    hint: "colunas coupon_codes/coupon_value ausentes — aplicar a migration 20261144",
  })
  const retry = await admin
    .from("email_outline_templates")
    .select("coupon_code")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (retry.error) {
    log.warn("incentivo.outline_load_failed", { flowType, emailNumber, error: retry.error.message })
    return null
  }
  return (retry.data as OutlineComCupom | null) ?? null
}

export async function carregarIdiomaDaLoja(admin: Admin, storeId: string): Promise<string | null> {
  const { data: store } = await admin.from("client_stores").select("language").eq("id", storeId).maybeSingle()
  const language = typeof (store as { language?: unknown } | null)?.language === "string"
    ? ((store as { language: string }).language)
    : ""
  if (language.trim()) return resolveStoreLanguage(null, language).code
  const { data: onb } = await admin
    .from("onboardings")
    .select("form_responses")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const form = (onb as { form_responses?: Record<string, unknown> | null } | null)?.form_responses ?? null
  const r = resolveStoreLanguage(form, null)
  return r.source === "default" ? null : r.code
}

export async function carregarOverrideDoBloco(admin: Admin, emailId: string): Promise<string | null> {
  const { data } = await admin
    .from("email_blocks")
    .select("content")
    .eq("email_id", emailId)
    .eq("block_type", "coupon")
    .limit(1)
    .maybeSingle()
  const content = (data as { content?: Record<string, unknown> | null } | null)?.content
  const code = content && typeof content.code === "string" ? content.code : null
  return code?.trim() ? code : null
}

export async function resolverIncentivoDoEmail(input: ResolverIncentivoInput): Promise<DecisaoDeIncentivo> {
  if (!input.flowType || input.emailNumber == null) {
    log.warn("incentivo.sem_referencia", { storeId: input.storeId, flowType: input.flowType ?? null, emailNumber: input.emailNumber ?? null })
    return { ...SEM_INCENTIVO }
  }
  try {
    const admin = createAdminClient()
    const [outline, idioma, override] = await Promise.all([
      carregarOutlineComCupom(admin, input.flowType, input.emailNumber),
      carregarIdiomaDaLoja(admin, input.storeId),
      input.emailId ? carregarOverrideDoBloco(admin, input.emailId) : Promise.resolve(null),
    ])
    return incentivoDoOutline(outline, idioma, override)
  } catch (err) {
    log.error("incentivo.resolucao_falhou", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ...SEM_INCENTIVO }
  }
}
