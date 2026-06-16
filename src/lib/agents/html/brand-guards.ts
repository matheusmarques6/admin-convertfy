/**
 * Guards de brand pro HTML Agent v2.
 *
 * Resolve dois problemas distintos:
 *
 * 1) **Placeholders nao-resolvidos no Copy** — n8n as vezes retorna copy
 *    com tokens estilo `{{BRAND_NAME}}` esperando substituicao posterior.
 *    `resolveBrandTokens` faz deep-walk no payload e substitui pelo nome
 *    real da loja. Aplicado no webhook `/api/webhooks/n8n/email-copy`
 *    (defesa de borda) E em `buildHtmlPromptVars` (defesa em camadas —
 *    caso o webhook tenha falhado pra algum email gravado antes do fix).
 *
 * 2) **Brand identity vazia** — `colors_primary=[]`, `logo_main_svg=null`
 *    levam o HTML Agent a defaults brancos/pretos e a "imaginar" logo,
 *    produzindo HTML inutilizavel. `precheckBrandReady` lanca erro
 *    acionavel antes da chamada ao LLM, marcando o email com
 *    `failure_reason='brand_incomplete'` em vez de queimar 200K tokens.
 *
 * Tokens aprovados (que DEVEM ficar literais no output, sao
 * personalizacao real do ESP) — esses nao sao mexidos:
 *   first_name, last_name, product_name, coupon_code, order_id
 *
 * Tokens cuja presenca no payload e' erro upstream — substituidos:
 *   brand_name, brand, store_name + variantes uppercase
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { StoreBrandIdentity } from "@/types/email-workspace"

// Captura `{{BRAND_NAME}}`, `{{ brand }}`, `{{store_name}}`, etc.
// Case-insensitive pra cobrir variantes do n8n.
const BRAND_TOKEN_RE =
  /\{\{\s*(brand_name|brand|store_name|store|loja)\s*\}\}/gi

/**
 * Walk recursivo substituindo tokens de brand pelo nome real da loja.
 * Trata strings, arrays e objects. Deixa outros tipos inalterados.
 */
export function resolveBrandTokens(value: unknown, brandName: string): unknown {
  if (typeof value === "string") {
    return value.replace(BRAND_TOKEN_RE, brandName)
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveBrandTokens(v, brandName))
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveBrandTokens(v, brandName),
      ]),
    )
  }
  return value
}

/**
 * Erro acionavel quando brand identity da loja esta incompleta.
 * `phase2-runner` captura e marca email com `failure_reason='brand_incomplete'`,
 * UI mostra CTA "Completar brand identity" em vez de "Tentar de novo".
 */
export class BrandIncompleteError extends Error {
  readonly missing: string[]
  readonly storeId: string | null

  constructor(message: string, opts: { missing: string[]; storeId?: string | null }) {
    super(message)
    this.name = "BrandIncompleteError"
    this.missing = opts.missing
    this.storeId = opts.storeId ?? null
  }
}

/**
 * Verifica pre-requisitos de brand antes de invocar o HTML Agent.
 * Lanca BrandIncompleteError com lista de campos faltantes — sem isso,
 * o HTML Agent gera com defaults e o output sai inutilizavel.
 *
 * Criterios minimos (produção):
 *   - brand identity existe (row em `store_brand_identity`)
 *   - pelo menos 1 cor (primary OU secondary)
 *   - pelo menos 1 logo (SVG OU PNG — UX sobe so um dos dois)
 *
 * Modo `relaxed` (TestTab): pula validacao de partials. So falha se a
 * row de brand identity for completamente ausente — cores e logo
 * faltando degradam pra defaults (cores via deriveColorRoles, logo
 * via string vazia no markup).
 */
export function precheckBrandReady(
  brand: StoreBrandIdentity | null,
  storeId: string | null,
  opts: { relaxed?: boolean } = {},
): void {
  if (!brand) {
    throw new BrandIncompleteError(
      `Loja sem brand identity. Crie uma em /admin/stores/${storeId ?? "{id}"}/identity.`,
      { missing: ["brand_identity"], storeId },
    )
  }
  if (opts.relaxed) return

  const missing: string[] = []
  const totalColors =
    (brand.colors_primary?.length ?? 0) + (brand.colors_secondary?.length ?? 0)
  if (totalColors === 0) missing.push("colors")
  if (!brand.logo_main_svg && !brand.logo_main_png) missing.push("logo")
  if (missing.length > 0) {
    throw new BrandIncompleteError(
      `Loja sem brand identity completa. Faltam: ${missing.join(", ")}. ` +
        `Complete em /admin/stores/${storeId ?? "{id}"}/identity antes de gerar emails.`,
      { missing, storeId },
    )
  }
}

/**
 * GATE 2 — verifica se a brand de UMA loja esta confirmada.
 *
 * A confirmacao da identidade visual (`/admin/stores/[id]/identity`) grava
 * `confirmed_at` na ultima versao de `store_brand_identity`. Sem isso, a
 * fase 2 (imagem/HTML/QA) NAO deve rodar — o e-mail fica esperando em
 * `copy_ready`. Retorna `true` somente se existe row E a ultima versao tem
 * `confirmed_at` nao-null.
 */
export async function isBrandConfirmed(
  admin: SupabaseClient,
  storeId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("store_brand_identity")
    .select("confirmed_at")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  return Boolean(data && (data as { confirmed_at: string | null }).confirmed_at)
}

/**
 * GATE 2 em lote — dado um conjunto de lojas, retorna o Set das que tem a
 * ultima versao de brand confirmada (`confirmed_at` nao-null).
 *
 * Usado pela Frente 4 do watchdog pra filtrar e-mails em `copy_ready` que
 * ainda estao legitimamente esperando o GATE 2 (nao re-dispatcha esses).
 * Reduz pra ULTIMA versao por loja: ordena por `version` desc e mantem a
 * primeira ocorrencia de cada `store_id`.
 */
export async function getConfirmedBrandStoreIds(
  admin: SupabaseClient,
  storeIds: string[],
): Promise<Set<string>> {
  const confirmed = new Set<string>()
  if (storeIds.length === 0) return confirmed

  const { data } = await admin
    .from("store_brand_identity")
    .select("store_id, version, confirmed_at")
    .in("store_id", storeIds)
    .order("version", { ascending: false })

  const rows = (data ?? []) as Array<{
    store_id: string
    version: number
    confirmed_at: string | null
  }>

  const seen = new Set<string>()
  for (const row of rows) {
    // Primeira ocorrencia (ordem desc) = ultima versao da loja.
    if (seen.has(row.store_id)) continue
    seen.add(row.store_id)
    if (row.confirmed_at) confirmed.add(row.store_id)
  }
  return confirmed
}
