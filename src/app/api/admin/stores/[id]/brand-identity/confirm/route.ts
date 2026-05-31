/**
 * POST /api/admin/stores/[id]/brand-identity/confirm
 *
 * GATE 2 do pipeline AE (Story AE-18). Marca a versao mais recente
 * de `store_brand_identity` como confirmada pelo designer. A trigger
 * SQL `trg_brand_identity_confirmed` (migration 20260626b) cuida de
 * enfileirar o sinal de fase 2 em `email_generation_queue_signals`.
 *
 * Status:
 *   200 — confirmado (ou ja_confirmado, idempotente)
 *   401 — sem auth
 *   404 — store_brand_identity inexistente (code: brand_identity_not_found)
 *   422 — sanity check falhou (code: brand_identity_incomplete,
 *                              details.missing = string[])
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("BrandIdentityConfirm")

export const dynamic = "force-dynamic"

// Body opcional — aceita {} ou nada. Schema vazio pra coerencia com
// padrao do projeto.
const bodySchema = z.object({}).passthrough().optional()

interface BrandIdentityRow {
  id: string
  store_id: string
  version: number
  confirmed_at: string | null
  colors_primary: unknown
  font_heading: string | null
  logo_main_svg: string | null
  logo_main_png: string | null
  logo_alt_svg: string | null
  logo_alt_png: string | null
  logo_monogram_svg: string | null
  logo_monogram_png: string | null
  logo_reverse_svg: string | null
  logo_reverse_png: string | null
}

interface ColorEntry {
  hex?: string
}

function hasAtLeastOneLogo(b: BrandIdentityRow): boolean {
  return Boolean(
    b.logo_main_svg ||
      b.logo_main_png ||
      b.logo_alt_svg ||
      b.logo_alt_png ||
      b.logo_monogram_svg ||
      b.logo_monogram_png ||
      b.logo_reverse_svg ||
      b.logo_reverse_png,
  )
}

function validatePrimaryColors(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false
  const first = raw[0] as ColorEntry | null | undefined
  return Boolean(first && typeof first.hex === "string" && first.hex.length > 0)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Body parse (passa mesmo se vazio)
    const raw = await request.json().catch(() => ({}))
    bodySchema.parse(raw)

    // 1. Buscar versao mais recente
    const { data: brand, error: fetchErr } = await admin
      .from("store_brand_identity")
      .select(
        "id, store_id, version, confirmed_at, colors_primary, font_heading, " +
          "logo_main_svg, logo_main_png, logo_alt_svg, logo_alt_png, " +
          "logo_monogram_svg, logo_monogram_png, logo_reverse_svg, logo_reverse_png",
      )
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<BrandIdentityRow>()

    if (fetchErr) throw fetchErr
    if (!brand) {
      throw new AppError(
        "Identidade visual ainda nao existe para essa loja.",
        404,
        "brand_identity_not_found",
      )
    }

    // 2. Idempotente: ja confirmada
    if (brand.confirmed_at) {
      log.info("already_confirmed", {
        storeId,
        identityId: brand.id,
        version: brand.version,
      })
      return successResponse(request, {
        already_confirmed: true,
        version: brand.version,
        confirmed_at: brand.confirmed_at,
      })
    }

    // 3. Sanity check
    const missing: string[] = []
    if (!validatePrimaryColors(brand.colors_primary)) {
      missing.push("colors_primary")
    }
    if (!brand.font_heading || brand.font_heading.trim().length === 0) {
      missing.push("font_heading")
    }
    if (!hasAtLeastOneLogo(brand)) {
      missing.push("logo")
    }
    if (missing.length > 0) {
      log.warn("incomplete", { storeId, missing })
      // AppError nao expoe `details` no errorResponse, entao montamos
      // a resposta diretamente pra incluir `details.missing` (o frontend
      // depende dessa lista pra avisar quais campos faltam).
      return NextResponse.json(
        {
          error: `Identidade visual incompleta. Preencha: ${missing.join(", ")}.`,
          code: "brand_identity_incomplete",
          details: { missing },
        },
        {
          status: 422,
          headers: corsHeaders(request.headers.get("origin")),
        },
      )
    }

    // 4. Update confirmed_at / confirmed_by
    const confirmedAt = new Date().toISOString()
    const { error: updErr } = await admin
      .from("store_brand_identity")
      .update({
        confirmed_at: confirmedAt,
        confirmed_by: user.id,
      })
      .eq("id", brand.id)

    if (updErr) throw updErr

    // 5. Contar emails em copy_ready (que vao entrar em renderizacao
    // assim que o cron dispatcher picar o sinal).
    let emailsToRender = 0
    const { data: flowRows, error: flowsErr } = await admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)

    if (flowsErr) {
      log.warn("flow_count_failed", { storeId, error: flowsErr.message })
    } else {
      const flowIds = (flowRows ?? []).map((f) => f.id as string)
      if (flowIds.length > 0) {
        const { count, error: countErr } = await admin
          .from("email_flow_emails")
          .select("id", { count: "exact", head: true })
          .in("flow_id", flowIds)
          .eq("status", "copy_ready")
        if (countErr) {
          log.warn("email_count_failed", {
            storeId,
            error: countErr.message,
          })
        } else {
          emailsToRender = count ?? 0
        }
      }
    }

    log.info("confirmed", {
      storeId,
      identityId: brand.id,
      version: brand.version,
      userId: user.id,
      emailsToRender,
    })

    return successResponse(request, {
      confirmed_at: confirmedAt,
      version: brand.version,
      confirmed_by: user.id,
      emails_to_render: emailsToRender,
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "brand-identity-confirm")
  }
}
