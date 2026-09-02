/**
 * Varredura da biblioteca — largura canônica de 600px em todo bloco.
 *
 * GET  = prévia: para cada variante, o que a normalização MUDARIA (nada é
 *        gravado). É a revisão humana antes de aplicar.
 * POST = aplica em `ids` (ou em todas as ativas que precisam), gravando
 *        `html` e `html_tagged` normalizados.
 *
 * Hash do renderizado (CM-6): `rendered_html_source_sha` é o SHA do html
 * que originou o exemplo. Normalizar a largura mudaria o html e marcaria
 * TODOS os exemplos como desatualizados — sendo que o exemplo continua
 * descrevendo a mesma variante. Quando o hash estava em dia com o html
 * antigo, ele é re-gravado para o html novo; se já estava velho, fica velho.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { sourceSha } from "@/lib/agents/shared/rendered-reference"
import {
  auditEmailWidth,
  enforceEmailWidth,
  EMAIL_WIDTH,
  type EmailWidthAudit,
  type WidthChange,
} from "@/lib/email-workspace/email-width"
import { logger } from "@/lib/logger"

const log = logger.child("ComponentsNormalizeWidth")

export const dynamic = "force-dynamic"

interface VariantRow {
  id: string
  name: string
  block_type: string
  is_active: boolean
  html: string | null
  html_tagged: string | null
  rendered_html_source_sha: string | null
}

export interface NormalizeWidthItem {
  id: string
  name: string
  block_type: string
  is_active: boolean
  before: EmailWidthAudit
  after: EmailWidthAudit
  changes: WidthChange[]
  html_changed: boolean
  tagged_changed: boolean
  /** Continua fora de 600 mesmo após a normalização (precisa de mão humana). */
  unresolved: boolean
}

function planFor(row: VariantRow): NormalizeWidthItem {
  const html = row.html ?? ""
  const enforced = enforceEmailWidth(html, EMAIL_WIDTH)
  const tagged = row.html_tagged
    ? enforceEmailWidth(row.html_tagged, EMAIL_WIDTH)
    : null
  const after = auditEmailWidth(enforced.html, EMAIL_WIDTH)
  return {
    id: row.id,
    name: row.name,
    block_type: row.block_type,
    is_active: row.is_active,
    before: auditEmailWidth(html, EMAIL_WIDTH),
    after,
    changes: enforced.changes,
    html_changed: enforced.changed,
    tagged_changed: tagged?.changed ?? false,
    unresolved: !after.ok,
  }
}

async function loadRows(
  admin: ReturnType<typeof createAdminClient>,
  opts: { includeInactive: boolean; ids?: string[] },
): Promise<VariantRow[]> {
  let q = admin
    .from("email_component_variants")
    .select(
      "id, name, block_type, is_active, html, html_tagged, rendered_html_source_sha",
    )
    .order("block_type", { ascending: true })
    .order("name", { ascending: true })
  if (opts.ids && opts.ids.length > 0) q = q.in("id", opts.ids)
  else if (!opts.includeInactive) q = q.eq("is_active", true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as VariantRow[]
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "true"
    const rows = await loadRows(admin, { includeInactive })
    const items = rows.map(planFor)
    const summary = {
      width: EMAIL_WIDTH,
      total: items.length,
      to_change: items.filter((i) => i.html_changed || i.tagged_changed).length,
      already_ok: items.filter(
        (i) => !i.html_changed && !i.tagged_changed && i.before.ok,
      ).length,
      unresolved: items.filter((i) => i.unresolved).length,
    }
    return successResponse(request, { items, summary })
  } catch (error) {
    log.error("components.normalize_width.get", error)
    return errorResponse(request, error, "components-normalize-width-get")
  }
}

const postSchema = z.object({
  ids: z.array(z.string().uuid()).max(500).optional(),
  include_inactive: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const rows = await loadRows(admin, {
      includeInactive: body.include_inactive ?? false,
      ids: body.ids,
    })

    const updated: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const row of rows) {
      const html = row.html ?? ""
      const enforced = enforceEmailWidth(html, EMAIL_WIDTH)
      const tagged = row.html_tagged
        ? enforceEmailWidth(row.html_tagged, EMAIL_WIDTH)
        : null
      if (!enforced.changed && !tagged?.changed) continue

      const patch: Record<string, unknown> = {}
      if (enforced.changed) {
        patch.html = enforced.html
        // Hash em dia com o html antigo → acompanha o novo (o exemplo
        // renderizado não mudou de significado). Velho continua velho.
        if (
          row.rendered_html_source_sha &&
          row.rendered_html_source_sha === sourceSha(html)
        ) {
          patch.rendered_html_source_sha = sourceSha(enforced.html)
        }
      }
      if (tagged?.changed) patch.html_tagged = tagged.html

      const { error } = await admin
        .from("email_component_variants")
        .update(patch)
        .eq("id", row.id)
      if (error) {
        failed.push({ id: row.id, error: error.message })
        continue
      }
      updated.push(row.id)
    }

    log.info("components.normalize_width.apply", {
      by: user.id,
      updated: updated.length,
      failed: failed.length,
    })
    return successResponse(request, {
      updated,
      failed,
      width: EMAIL_WIDTH,
    })
  } catch (error) {
    log.error("components.normalize_width.post", error)
    return errorResponse(request, error, "components-normalize-width-post")
  }
}
