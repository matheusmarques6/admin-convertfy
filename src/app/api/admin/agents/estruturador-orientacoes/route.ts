/**
 * Orientações do COO ao Estruturador (migration 20261086).
 *
 * O outro lado do ciclo do `estruturador-feedback`: aquele julga UMA run e
 * vira rascunho de aprendizado; este instrui as PRÓXIMAS gerações e vale
 * imediatamente, servido em `<orientacao_do_coo>`.
 *
 * GET  ?flow_type=&email_number=  — as TRÊS aplicáveis (global, flow,
 *      email), preenchidas ou não: a UI mostra os três campos sempre.
 * PUT  { escopo, flow_type?, email_number?, texto, origem_run_id? }
 *      — upsert por escopo (uma por escopo, editável). Texto vazio
 *      DESATIVA em vez de apagar: o histórico de quem pediu o quê
 *      sobrevive, e reativar é reescrever.
 *
 * Alcance é sempre global entre lojas (decisão 27/08): a regra editorial é
 * do MÉTODO, não do cliente — como as intenções e os aprendizados do vault.
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate do Estúdio.
 * RLS sem policies = service-role only; este endpoint É o caminho.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import type { EscopoOrientacao } from "@/lib/agents/estruturador/orientacoes"

const log = logger.child("EstruturadorOrientacoesRoute")

export const dynamic = "force-dynamic"

async function requireManager(userId: string) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, tags")
    .eq("id", userId)
    .maybeSingle()
  const actor = {
    id: userId,
    role: (profile as { role?: string | null } | null)?.role ?? null,
    tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
  }
  if (!canManagePrompts(actor)) throw new ForbiddenError()
  return admin
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = await requireManager(user.id)

    const flowType = request.nextUrl.searchParams.get("flow_type")
    const emailNumberRaw = request.nextUrl.searchParams.get("email_number")
    const emailNumber = emailNumberRaw ? Number(emailNumberRaw) : null

    // As três de uma vez: a global sempre, e as do flow/email quando o
    // caller diz de qual email está falando. Sem `or()` encadeado — o
    // filtro em memória é trivial e não arrisca a sintaxe do PostgREST.
    const { data, error } = await admin
      .from("estruturador_orientacoes")
      .select(
        "id, escopo, flow_type, email_number, texto, is_active, created_by, updated_at",
      )
      .eq("is_active", true)
    if (error) throw error

    const todas = (data ?? []) as Array<{
      escopo: EscopoOrientacao
      flow_type: string | null
      email_number: number | null
      texto: string
    }>

    const acha = (escopo: EscopoOrientacao) =>
      todas.find(
        (o) =>
          o.escopo === escopo &&
          (escopo === "global" || o.flow_type === flowType) &&
          (escopo !== "email" || o.email_number === emailNumber),
      ) ?? null

    return successResponse(request, {
      global: acha("global"),
      flow: flowType ? acha("flow") : null,
      email: flowType && emailNumber != null ? acha("email") : null,
    })
  } catch (error) {
    log.error("GET estruturador orientações error", error)
    return errorResponse(request, error, "estruturador-orientacoes-get")
  }
}

const putSchema = z.object({
  escopo: z.enum(["email", "flow", "global"]),
  flow_type: z.string().trim().min(1).optional().nullable(),
  email_number: z.number().int().positive().optional().nullable(),
  // Vazio é legítimo: é como se desativa.
  texto: z.string().max(4000),
  origem_run_id: z.string().uuid().optional().nullable(),
})

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = await requireManager(user.id)

    const body = putSchema.parse(await request.json())

    // O CHECK do banco já garante isto, mas errar aqui devolve mensagem
    // legível em vez de 23514.
    const flowType = body.escopo === "global" ? null : (body.flow_type ?? null)
    const emailNumber =
      body.escopo === "email" ? (body.email_number ?? null) : null
    if (body.escopo !== "global" && !flowType) {
      throw new ValidationError("flow_type é obrigatório neste escopo")
    }
    if (body.escopo === "email" && emailNumber == null) {
      throw new ValidationError("email_number é obrigatório no escopo 'email'")
    }

    const texto = body.texto.trim()

    // Busca-e-decide em vez de upsert: o índice único usa COALESCE (UNIQUE
    // ignora NULL, e 'global' tem flow_type/email_number nulos), e índice
    // por EXPRESSÃO está fora do alcance do `onConflict` do PostgREST —
    // mesma armadilha do `crm_sales_goals`. Com o upsert, cada PUT de uma
    // orientação global criaria uma linha nova em vez de editar a que
    // existe, e o bloco do prompt teria duplicatas.
    const campos = {
      texto,
      // Texto vazio DESATIVA: some do prompt, fica no histórico.
      is_active: texto.length > 0,
      origem_run_id: body.origem_run_id ?? null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let existente = admin
      .from("estruturador_orientacoes")
      .select("id")
      .eq("escopo", body.escopo)
    existente =
      flowType == null
        ? existente.is("flow_type", null)
        : existente.eq("flow_type", flowType)
    existente =
      emailNumber == null
        ? existente.is("email_number", null)
        : existente.eq("email_number", emailNumber)
    const { data: atual } = await existente.maybeSingle()

    const q = atual?.id
      ? admin
          .from("estruturador_orientacoes")
          .update(campos)
          .eq("id", atual.id as string)
      : admin.from("estruturador_orientacoes").insert({
          escopo: body.escopo,
          flow_type: flowType,
          email_number: emailNumber,
          ...campos,
        })

    const { data, error } = await q
      .select("id, escopo, flow_type, email_number, texto, is_active, updated_at")
      .single()

    if (error) throw error

    log.info("estruturador.orientacao_salva", {
      escopo: body.escopo,
      flowType,
      emailNumber,
      ativa: texto.length > 0,
      chars: texto.length,
    })

    return successResponse(request, { orientacao: data })
  } catch (error) {
    log.error("PUT estruturador orientações error", error)
    return errorResponse(request, error, "estruturador-orientacoes-put")
  }
}
