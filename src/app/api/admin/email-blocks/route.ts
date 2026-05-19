/**
 * POST /api/admin/email-blocks
 *   Cria um novo bloco em um email. Recebe email_id, block_type, label, content,
 *   e position opcional (default: append). Trigger no banco recalcula progresso.
 *
 * PATCH /api/admin/email-blocks
 *   Body: { email_id, order: string[] } — reordena blocos do email.
 *   Aplica nova `position` (1..N) na ordem informada (whitelist por email).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailBlocks")

export const dynamic = "force-dynamic"

const blockTypeEnum = z.enum([
  "hero",
  "text",
  "coupon",
  "products",
  "footer",
  "image",
  "cta",
  "divider",
  "spacer",
  "social",
])

const postSchema = z.object({
  email_id: z.string().uuid(),
  block_type: blockTypeEnum,
  label: z.string().min(1).max(80).optional(),
  position: z.number().int().min(1).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
})

const DEFAULT_LABEL: Record<z.infer<typeof blockTypeEnum>, string> = {
  hero: "Hero",
  text: "Texto",
  coupon: "Cupom",
  products: "Produtos",
  footer: "Rodapé",
  image: "Imagem",
  cta: "Botão (CTA)",
  divider: "Divisor",
  spacer: "Espaçador",
  social: "Redes sociais",
}

const DEFAULT_CONTENT: Record<
  z.infer<typeof blockTypeEnum>,
  Record<string, unknown>
> = {
  hero: { eyebrow: "", headline: "", body: "", cta_text: "", cta_url: "" },
  text: { headline: "", body: "" },
  coupon: { code: "", hint: "", cta_text: "Aproveitar", cta_url: "" },
  products: { title: "Recomendados", products: [] },
  footer: { columns: [], social: [], copyright: "", unsubscribe_url: "" },
  image: { image_url: "", image_alt: "", link_url: "" },
  cta: { text: "Clique aqui", url: "", style: "primary" },
  divider: {},
  spacer: { height: 24 },
  social: { platforms: [] },
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = postSchema.parse(body)

    // Descobre próxima posição se nao foi informada
    let position = parsed.position
    if (position === undefined) {
      const { data: maxRow } = await admin
        .from("email_blocks")
        .select("position")
        .eq("email_id", parsed.email_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      position = ((maxRow?.position as number | undefined) ?? 0) + 1
    }

    const insert = {
      email_id: parsed.email_id,
      block_type: parsed.block_type,
      label: parsed.label ?? DEFAULT_LABEL[parsed.block_type],
      position,
      content: parsed.content ?? DEFAULT_CONTENT[parsed.block_type],
      applied: false,
    }

    const { data, error } = await admin
      .from("email_blocks")
      .insert(insert)
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { block: data })
  } catch (error) {
    log.error("Block POST error:", error)
    return errorResponse(request, error, "block-post")
  }
}

const patchSchema = z.object({
  email_id: z.string().uuid(),
  order: z.array(z.string().uuid()).min(1),
})

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    // Validar que todos os blocos pertencem ao email
    const { data: existing, error: fetchErr } = await admin
      .from("email_blocks")
      .select("id")
      .eq("email_id", parsed.email_id)

    if (fetchErr) throw fetchErr

    const existingIds = new Set((existing ?? []).map((b) => b.id as string))
    const allBelong = parsed.order.every((id) => existingIds.has(id))
    if (!allBelong) {
      return errorResponse(
        request,
        new Error("Algum bloco não pertence ao email"),
        "block-reorder-mismatch",
      )
    }

    // Aplica nova posição (1..N)
    const updates = parsed.order.map((id, idx) =>
      admin
        .from("email_blocks")
        .update({ position: idx + 1 })
        .eq("id", id),
    )
    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)?.error
    if (firstError) throw firstError

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Block reorder PATCH error:", error)
    return errorResponse(request, error, "block-reorder")
  }
}
