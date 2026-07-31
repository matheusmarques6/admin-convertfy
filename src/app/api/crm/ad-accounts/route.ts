/**
 * GET  /api/crm/ad-accounts  — contas de anúncio conectadas da org
 * POST /api/crm/ad-accounts  — conecta uma conta Meta Ads
 *
 * O token nunca volta pro cliente: a resposta expõe só os metadados da
 * conexão (conta, status e horário do último sync).
 *
 * Recomendação de token: System User Token do Business Manager, com
 * ads_read — não expira e não fica preso ao login de uma pessoa.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { MetaAdsService } from "@/lib/integrations/meta-ads"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAdAccounts")

export const dynamic = "force-dynamic"

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) return successResponse(request, { accounts: [] })

    const { data, error } = await admin
      .from("crm_ad_accounts")
      .select(
        "id, platform, account_id, account_name, currency, is_active, last_synced_at, last_sync_status, last_sync_error, created_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return successResponse(request, { accounts: data ?? [] })
  } catch (error) {
    log.error("Ad accounts GET error:", error)
    return errorResponse(request, error, "crm-ad-accounts-get")
  }
}

const connectSchema = z.object({
  access_token: z.string().trim().min(20, "Token muito curto"),
  account_id: z.string().trim().min(1, "Informe o ID da conta de anúncio"),
  business_id: z.string().trim().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = connectSchema.parse(body)

    const accountId = parsed.account_id.startsWith("act_")
      ? parsed.account_id
      : `act_${parsed.account_id}`

    // Valida a credencial ANTES de gravar — conexão quebrada só
    // apareceria no primeiro cron, horas depois.
    const service = new MetaAdsService({
      accessToken: parsed.access_token,
      adAccountId: accountId,
      businessId: parsed.business_id ?? undefined,
    })

    let accountName = ""
    let currency = "BRL"
    try {
      const account = await service.getAdAccount()
      accountName = account.name ?? ""
      currency = account.currency ?? "BRL"
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao validar credenciais"
      throw new AppError(`Meta recusou a conexão: ${message}`, 422, "validation-error")
    }

    const { data, error } = await admin
      .from("crm_ad_accounts")
      .upsert(
        {
          org_id: orgId,
          platform: "meta",
          account_id: accountId,
          account_name: accountName,
          currency,
          business_id: parsed.business_id || null,
          access_token: encrypt(parsed.access_token),
          is_active: true,
          created_by: user.id,
        },
        { onConflict: "org_id,platform,account_id" },
      )
      .select("id, account_id, account_name, currency")
      .single()

    if (error) throw error

    log.info("[AdAccounts] conta conectada", { account: accountId, name: accountName })
    return successResponse(request, { account: data }, { status: 201 })
  } catch (error) {
    log.error("Ad accounts POST error:", error)
    return errorResponse(request, error, "crm-ad-accounts-post")
  }
}
