/**
 * Biblioteca de componentes — detalhe (PATCH/DELETE).
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { sourceSha } from "@/lib/agents/shared/rendered-reference"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import { COMPONENT_CATEGORY_KEYS } from "@/lib/agents/shared/component-categories"
import { outputFieldSchema } from "@/lib/agents/shared/component-schemas"

const log = logger.child("EmailComponent")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  // Tipo de seção (pill de categoria). Sem isto, mudar "Tipo de seção" no
  // editor não persistia — o Zod removia a chave e a variante não migrava.
  block_type: z.enum(COMPONENT_CATEGORY_KEYS as [string, ...string[]]).optional(),
  name: z.string().min(1).optional(),
  html: z.string().min(1).optional(),
  rendered_html: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  long_description: z.string().nullable().optional(),
  slots: z.array(z.string()).optional(),
  objectives: z.array(z.string()).optional(),
  tones: z.array(z.string()).optional(),
  when_use: z.string().nullable().optional(),
  when_not_use: z.string().nullable().optional(),
  copy_guidance: z.string().nullable().optional(),
  design_system: z.string().nullable().optional(),
  photo_direction: z.string().nullable().optional(),
  product_slots: z.number().int().min(0).max(20).optional(),
  output_schema: z.array(outputFieldSchema).optional(),
  density: z.enum(["minimal", "balanced", "rich"]).nullable().optional(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = patchSchema.parse(await request.json())

    // CM-6 — o hash só é (re)gravado quando o EXEMPLO muda:
    //
    //   - `rendered_html` no payload → o exemplo foi salvo agora, então ele
    //     corresponde ao html vigente (o do payload, se veio junto; senão o
    //     que já está no banco). Grava o hash.
    //   - só `html` no payload → a variante mudou e o exemplo NÃO foi
    //     refeito. O hash fica velho de PROPÓSITO: é exatamente esse
    //     descasamento que sinaliza "renderizado desatualizado".
    //   - `rendered_html: null` → exemplo removido, hash vai junto.
    const patch: Record<string, unknown> = { ...parsed }
    if (parsed.rendered_html !== undefined) {
      if (!parsed.rendered_html?.trim()) {
        patch.rendered_html_source_sha = null
      } else {
        let sourceHtml = parsed.html
        if (sourceHtml === undefined) {
          const { data: current } = await admin
            .from("email_component_variants")
            .select("html")
            .eq("id", id)
            .maybeSingle()
          sourceHtml = (current?.html as string | undefined) ?? ""
        }
        patch.rendered_html_source_sha = sourceSha(sourceHtml)
      }
    }

    const { data, error } = await admin
      .from("email_component_variants")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { variant: data })
  } catch (error) {
    log.error("component.patch", error)
    return errorResponse(request, error, "component-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const { error } = await admin
      .from("email_component_variants")
      .delete()
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { deleted: true })
  } catch (error) {
    log.error("component.delete", error)
    return errorResponse(request, error, "component-delete")
  }
}
