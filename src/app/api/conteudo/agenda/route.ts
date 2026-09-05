/**
 * Agenda do Calendário (Estúdio → "Enviar para o calendário").
 *
 * GET    ?start=YYYY-MM-DD&end=YYYY-MM-DD — itens com nome/status/perfil do documento.
 * PUT    { documentoId, perfil, data, hora } — 1 agendamento por documento
 *        (substitui) e marca o documento como `agendado`.
 * DELETE ?documentoId= — remove o agendamento e volta o documento a `pronto`.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import type { Agendado, DocStatus } from "@/lib/conteudo/types"

export const dynamic = "force-dynamic"

interface Row {
  id: string
  documento_id: string
  channel_id: string | null
  data: string
  hora: string
  documento: { nome: string; status: string } | null
}

const toAgendado = (a: Row): Agendado => ({
  id: a.id,
  documentoId: a.documento_id,
  nome: a.documento?.nome ?? "Carrossel",
  perfil: a.channel_id,
  data: a.data,
  hora: String(a.hora).slice(0, 5),
  status: ((a.documento?.status as DocStatus | undefined) ?? "agendado"),
})

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const q = request.nextUrl.searchParams
    let query = admin.from("conteudo_agenda").select("id, documento_id, channel_id, data, hora, documento:conteudo_documentos(nome, status)").eq("org_id", orgId).order("data", { ascending: true }).order("hora", { ascending: true }).limit(500)
    const start = q.get("start")
    const end = q.get("end")
    if (start && ISO.test(start)) query = query.gte("data", start)
    if (end && ISO.test(end)) query = query.lte("data", end)
    const { data, error } = await query
    if (error) throw error
    return successResponse(request, { itens: ((data ?? []) as unknown as Row[]).map(toAgendado) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-agenda")
  }
}

const putSchema = z.object({
  documentoId: z.string().uuid(),
  perfil: z.string().uuid().nullable().optional(),
  data: z.string().regex(ISO),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
})

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = putSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Agendamento inválido (documento, data e hora).", 400)
    const p = parsed.data
    const { data: doc } = await admin.from("conteudo_documentos").select("id, dados").eq("org_id", orgId).eq("id", p.documentoId).maybeSingle<{ id: string; dados: Record<string, unknown> }>()
    if (!doc) throw new AppError("Carrossel não encontrado", 404, "not-found")
    let channelId: string | null = null
    if (p.perfil) {
      const { data: canal } = await admin.from("crm_channels").select("id").eq("org_id", orgId).eq("id", p.perfil).maybeSingle()
      channelId = canal?.id ?? null
    }
    const { data, error } = await admin
      .from("conteudo_agenda")
      .upsert({ org_id: orgId, documento_id: p.documentoId, channel_id: channelId, data: p.data, hora: p.hora }, { onConflict: "documento_id" })
      .select("id, documento_id, channel_id, data, hora, documento:conteudo_documentos(nome, status)")
      .single()
    if (error) throw error
    const agenda = { perfil: channelId ?? (doc.dados.perfil as string), data: `${p.data.slice(8, 10)}/${p.data.slice(5, 7)}`, dataIso: p.data, hora: p.hora }
    await admin.from("conteudo_documentos").update({ status: "agendado", dados: { ...doc.dados, status: "agendado", agenda, data: agenda.data } }).eq("id", doc.id)
    return successResponse(request, { item: toAgendado(data as unknown as Row), agenda })
  } catch (error) {
    return errorResponse(request, error, "conteudo-agenda-put")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const documentoId = request.nextUrl.searchParams.get("documentoId")
    if (!documentoId) throw new AppError("documentoId obrigatório", 400)
    const { error } = await admin.from("conteudo_agenda").delete().eq("org_id", orgId).eq("documento_id", documentoId)
    if (error) throw error
    const { data: doc } = await admin.from("conteudo_documentos").select("id, dados, status").eq("org_id", orgId).eq("id", documentoId).maybeSingle<{ id: string; dados: Record<string, unknown>; status: string }>()
    if (doc && doc.status === "agendado") {
      const dados: Record<string, unknown> = { ...doc.dados, status: "pronto" }
      delete dados.agenda
      await admin.from("conteudo_documentos").update({ status: "pronto", dados }).eq("id", doc.id)
    }
    return successResponse(request, { documentoId })
  } catch (error) {
    return errorResponse(request, error, "conteudo-agenda-delete")
  }
}
