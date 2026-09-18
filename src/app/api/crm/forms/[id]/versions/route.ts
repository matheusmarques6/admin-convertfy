/**
 * GET /api/crm/forms/[id]/versions — as versões publicadas, da mais nova
 * para a mais antiga. Só leitura (ver `historico-de-versoes.tsx`).
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: form, error } = await admin
      .from("crm_forms")
      .select("id, org_id, published_version_id")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!form) throw new AppError("Formulário não encontrado", 404, "NOT_FOUND")

    const { data: membro } = await admin
      .from("org_members")
      .select("id")
      .eq("profile_id", user.id)
      .eq("org_id", form.org_id)
      .limit(1)
      .maybeSingle()
    if (!membro) throw new AppError("Sem acesso a este formulário", 403, "FORBIDDEN")

    const { data: versoes, error: vErr } = await admin
      .from("form_versions")
      .select("id, version, published_at, schema")
      .eq("form_id", id)
      .order("version", { ascending: false })
      .limit(50)
    if (vErr) throw vErr

    return successResponse(request, {
      versoes: (versoes ?? []).map((v) => {
        const schema = v.schema as { blocks?: unknown[] } | null
        return {
          id: v.id,
          version: v.version,
          published_at: v.published_at,
          publicada: v.id === form.published_version_id,
          perguntas: Array.isArray(schema?.blocks) ? schema!.blocks!.length : 0,
        }
      }),
    })
  } catch (error) {
    return errorResponse(request, error, "crm-form-versions")
  }
}
