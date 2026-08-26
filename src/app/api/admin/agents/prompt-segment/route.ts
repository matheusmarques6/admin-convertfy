/**
 * GET /api/admin/agents/prompt-segment?ref=catalogo&sha8=… — resolve um
 * segmento GRANDE que não viaja dentro da run.
 *
 * O catálogo da biblioteca tem ~120k chars e é IDÊNTICO entre lojas (é o
 * prefixo cacheável do system do Curador). Gravá-lo em toda run multiplicaria
 * o banco por nada; a run guarda `{ref: "catalogo", sha8}` e a UI resolve
 * aqui, sob demanda.
 *
 * O sha8 não é decoração: ele é conferido contra o catálogo ATUAL. Divergiu,
 * a biblioteca mudou desde a run — a rota devolve o conteúdo de hoje com
 * `stale: true` em vez de fingir que é o que o agente viu.
 *
 * Auth: canManagePrompts (mesmo gate das demais rotas do hub).
 */

import crypto from "crypto"

import { NextRequest } from "next/server"

import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { buildCatalog } from "@/lib/agents/architect/catalog-builder"
import { loadActiveVariantsByType } from "@/lib/agents/architect/component-assembler.service"
import { logger } from "@/lib/logger"

const log = logger.child("PromptSegmentRoute")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const ref = request.nextUrl.searchParams.get("ref")
    const sha8 = request.nextUrl.searchParams.get("sha8")
    if (ref !== "catalogo") {
      throw new ValidationError("Segmento desconhecido. Refs suportados: catalogo")
    }

    const { all: eligible } = await loadActiveVariantsByType()
    const catalog = buildCatalog(eligible)
    const currentSha8 = crypto
      .createHash("sha256")
      .update(catalog.json)
      .digest("hex")
      .slice(0, 8)
    const stale = Boolean(sha8) && sha8 !== currentSha8

    return successResponse(request, {
      ref,
      texto: catalog.json,
      chars: catalog.json.length,
      sha8: currentSha8,
      sha8_da_run: sha8 ?? null,
      // true = a biblioteca mudou desde a run; o texto abaixo é o de HOJE.
      stale,
      total_variantes: catalog.total,
      tipos: catalog.types,
    })
  } catch (error) {
    log.error("GET agents/prompt-segment error", error)
    return errorResponse(request, error, "agents-prompt-segment-get")
  }
}
