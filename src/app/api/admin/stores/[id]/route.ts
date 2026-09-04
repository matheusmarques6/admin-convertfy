/**
 * PATCH /api/admin/stores/[id]
 *
 * Atualiza campos editáveis de client_stores: identidade (nome, URL,
 * plataforma, país/idioma/moeda, nicho) e contrato (MRR, vigência,
 * alerta de receita). É a rota por trás do "Editar" do Setup da loja e
 * dos popovers de idioma/país do hero.
 *
 * Só o que veio no body muda; `null` limpa. A loja precisa ser da org
 * de quem edita (assertStoreInUserOrg — a rota usa service role).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { assertStoreInUserOrg } from "@/lib/api/store-org-guard"
import { handleCorsPreFlight } from "@/lib/cors"
import { STORE_LANGUAGE_CODES } from "@/lib/i18n/store-language"
import { COUNTRY_VALUES, PLATFORM_VALUES } from "@/lib/constants/onboarding"
import { STORE_CURRENCY_VALUES } from "@/lib/constants/currencies"
import { logger } from "@/lib/logger"

const log = logger.child("StorePatch")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato YYYY-MM-DD")

const patchSchema = z.object({
  // Identidade
  store_name: z.string().trim().min(2, "nome muito curto").max(160).optional(),
  store_url: z.string().trim().max(300).nullable().optional(),
  platform: z.enum(PLATFORM_VALUES).nullable().optional(),
  currency: z.enum(STORE_CURRENCY_VALUES).nullable().optional(),
  niche: z.string().max(240).nullable().optional(),
  language: z.enum(STORE_LANGUAGE_CODES).nullable().optional(),
  country: z.enum(COUNTRY_VALUES).nullable().optional(),
  countries: z.array(z.enum(COUNTRY_VALUES)).nullable().optional(),
  // Contrato
  mrr_cents: z.number().int().min(0).max(9_999_999_999).nullable().optional(),
  contract_start_date: isoDate.nullable().optional(),
  contract_end_date: isoDate.nullable().optional(),
  alert_revenue_threshold: z.number().int().min(0).max(999_999_999).nullable().optional(),
})

/** "minhaloja.com.br" → "https://minhaloja.com.br"; inválida → 400. */
function normalizeStoreUrl(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new AppError("URL da loja inválida", 400, "validation-error")
  }
  if (!url.hostname.includes(".")) {
    throw new AppError("URL da loja inválida", 400, "validation-error")
  }
  // Sem barra final e sem query: é o formato que as integrações
  // (Shopify/Klaviyo) comparam.
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertStoreInUserOrg(admin, user.id, id)

    const body = await request.json().catch(() => ({}))
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw new AppError(
        `${first?.path.join(".") || "body"}: ${first?.message || "inválido"}`,
        400,
        "validation-error",
      )
    }

    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updateData[k] = v
    }

    if (parsed.data.store_url !== undefined) {
      updateData.store_url = normalizeStoreUrl(parsed.data.store_url)
    }

    // `country` é sempre o PRINCIPAL (= countries[0]). Mantemos os dois
    // sincronizados em ambas as direções para os ~12 consumidores que leem
    // `country` (singular) continuarem corretos.
    if (parsed.data.countries !== undefined) {
      const list = parsed.data.countries
      updateData.countries = list && list.length ? list : null
      updateData.country = list && list.length ? list[0] : null
    } else if (parsed.data.country !== undefined) {
      // Retrocompat: se vier só `country`, espelha em `countries`.
      updateData.countries = parsed.data.country ? [parsed.data.country] : null
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError("nothing_to_update", 400)
    }

    // Vigência: fim antes do início não existe. Compara com o que já
    // está gravado quando só um dos lados veio no body.
    if (parsed.data.contract_start_date !== undefined || parsed.data.contract_end_date !== undefined) {
      const { data: current } = await admin
        .from("client_stores")
        .select("contract_start_date, contract_end_date")
        .eq("id", id)
        .maybeSingle()
      const start =
        parsed.data.contract_start_date !== undefined
          ? parsed.data.contract_start_date
          : (current?.contract_start_date as string | null) ?? null
      const end =
        parsed.data.contract_end_date !== undefined
          ? parsed.data.contract_end_date
          : (current?.contract_end_date as string | null) ?? null
      if (start && end && end < start) {
        throw new AppError("O fim da vigência não pode ser antes do início", 400, "validation-error")
      }
    }

    const { data, error } = await admin
      .from("client_stores")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, store_name, store_url, platform, niche, language, country, countries, currency, " +
          "mrr_cents, contract_start_date, contract_end_date, alert_revenue_threshold",
      )
      .single()

    if (error) {
      // Plataforma fora do enum do banco (migration 20261113 adiciona
      // tray/vtex/dupla_estrutura).
      if (error.code === "22P02" && /store_platform/.test(error.message)) {
        throw new AppError(
          "Plataforma ainda não aceita pelo banco — aplique a migration 20261113_cobranca_tipo_meses_lojas.",
          422,
          "validation-error",
        )
      }
      throw error
    }
    log.info("store atualizada", { storeId: id, fields: Object.keys(updateData) })
    return successResponse(request, { store: data })
  } catch (error) {
    log.error("store patch error:", error)
    return errorResponse(request, error, "store-patch")
  }
}
