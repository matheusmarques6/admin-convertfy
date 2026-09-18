/**
 * GET /api/crm/forms/[id]/respostas?dias=30 — as respostas, legíveis.
 *
 * A aba Resultados tinha o funil e não tinha o que as pessoas
 * RESPONDERAM: para ler uma resposta era preciso abrir o lead. Aqui cada
 * envio vem com pergunta e rótulo (`respostasLegiveis`, a mesma
 * tradução do webhook), o lead e o negócio que ele virou.
 *
 * Paginado por `limite` (teto 500) e ordenado do mais recente: o
 * PostgREST corta em 1.000 sem avisar, e a exportação diz quantas
 * ficaram de fora em vez de fingir que a planilha é a base inteira.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { normalizarSchema } from "@/lib/forms/schema"
import { respostasLegiveis } from "@/lib/forms/webhook"
import type { FormAnswers } from "@/types/forms-conversational"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: form, error } = await admin
      .from("crm_forms")
      .select("id, org_id, published_version_id, draft_schema, submissions_count")
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

    const sp = request.nextUrl.searchParams
    const diasBruto = Number(sp.get("dias") ?? 30)
    const dias = Number.isFinite(diasBruto) && diasBruto > 0 ? diasBruto : null
    const limite = Math.min(Math.max(Number(sp.get("limite") ?? 200) || 200, 1), 500)

    // O schema PUBLICADO traduz as respostas (é o que quem respondeu
    // viu); sem ele, o rascunho; sem os dois, o ref cru.
    let schemaBruto: unknown = null
    if (form.published_version_id) {
      const { data: v } = await admin
        .from("form_versions")
        .select("schema")
        .eq("id", form.published_version_id)
        .maybeSingle()
      schemaBruto = v?.schema ?? null
    }
    const schema = normalizarSchema(schemaBruto ?? form.draft_schema ?? null)

    let q = admin
      .from("crm_form_submissions")
      .select(
        "id, created_at, answers, lead_id, deal_id, utm_source, utm_medium, utm_campaign, lead:crm_leads(id, name, email, phone), deal:deals(id, title, stage:pipeline_stages(name))",
      )
      .eq("form_id", id)
      .order("created_at", { ascending: false })
      .limit(limite)
    if (dias) q = q.gte("created_at", new Date(Date.now() - dias * 86_400_000).toISOString())
    const { data: linhas, error: sErr } = await q
    if (sErr) throw sErr

    const respostas = (linhas ?? []).map((l) => {
      const lead = (Array.isArray(l.lead) ? l.lead[0] : l.lead) as { id: string; name: string | null; email: string | null; phone: string | null } | null
      const dealBruto = (Array.isArray(l.deal) ? l.deal[0] : l.deal) as { id: string; title: string | null; stage: unknown } | null
      const stage = dealBruto ? ((Array.isArray(dealBruto.stage) ? dealBruto.stage[0] : dealBruto.stage) as { name: string } | null) : null
      return {
        id: l.id,
        created_at: l.created_at,
        lead: lead ? { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone } : null,
        deal: dealBruto ? { id: dealBruto.id, title: dealBruto.title, etapa: stage?.name ?? null } : null,
        utm: { source: l.utm_source, medium: l.utm_medium, campaign: l.utm_campaign },
        respostas: respostasLegiveis(schema, (l.answers ?? {}) as FormAnswers),
      }
    })

    // As colunas da tabela: toda pergunta do schema, na ordem, mais o
    // que apareceu nas respostas e não está no schema (campo oculto).
    const colunas: Array<{ ref: string; pergunta: string }> = schema.blocks
      .filter((b) => !b.hidden)
      .map((b) => ({ ref: b.ref, pergunta: b.label }))
    for (const r of respostas) {
      for (const x of r.respostas) {
        if (!colunas.some((c) => c.ref === x.ref)) colunas.push({ ref: x.ref, pergunta: x.pergunta })
      }
    }

    return successResponse(request, {
      respostas,
      colunas,
      total: typeof form.submissions_count === "number" ? form.submissions_count : null,
      truncado: (linhas ?? []).length >= limite,
      dias,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-form-respostas")
  }
}
