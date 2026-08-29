/**
 * Arquitetura dos Emails — o único ponto de escrita da régua e do conteúdo
 * editorial por (flow_type, email_number).
 *
 * Substitui `/api/admin/outlines` e `/api/admin/email-blueprints`, que
 * editavam metades do mesmo e-mail em telas diferentes e por isso divergiam
 * (14 das 34 linhas divergem hoje).
 *
 *   GET    → { rows, flows } já mesclado por `mergeRows`
 *   PUT    → grava a linha nas três tabelas, com desfazer em caso de falha
 *   POST   → acrescenta um e-mail ao fim da régua do fluxo
 *   DELETE → desativa o último e-mail da régua (o conteúdo fica)
 *
 * As três tabelas têm UNIQUE (flow_type, email_number), então toda escrita é
 * upsert por esse par — nenhuma depende de id.
 *
 * Auth: `assertCanManagePrompts` (admin/owner ou tag `dev`), o mesmo gate do
 * resto do hub de geração.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import { COMPONENT_CATEGORY_KEYS } from "@/lib/agents/shared/component-categories"
import { FLOW_TYPE_LABELS } from "@/components/email-generation/flow-labels"
import {
  flowTriggerLabel,
  IMPLEMENTATION_FLOW_TYPES,
} from "@/lib/email-workspace/implementation/flow-meta"
import { mergeRows, splitRow } from "@/lib/email-architecture/merge"
import type {
  ArchFlow,
  EmailArchitectureRow,
  FlowTemplateRow,
  RawBlueprint,
  RawOutline,
} from "@/lib/email-architecture/types"

const log = logger.child("EmailArchitecture")

export const dynamic = "force-dynamic"

/**
 * Bloco vindo da tela. A categoria é fechada nas 8 canônicas: o endpoint
 * antigo aceitava JSONB livre e um tipo torto ia direto para o
 * `seedBlocksFromBlueprint`, onde degradava para 'text' com log.error.
 */
const blockSchema = z.object({
  id: z.string(),
  category: z.enum(COMPONENT_CATEGORY_KEYS as [string, ...string[]]),
  label: z.string().default(""),
  purpose: z.string().default(""),
  needs_image: z.boolean().default(false),
  image_brief: z.string().nullable().default(null),
  legacy_type: z.string().nullable().optional(),
})

const rowSchema = z.object({
  flow_type: z.string().min(1),
  email_number: z.number().int().min(1),
  name: z.string().default(""),
  delay_hours: z.number().int().min(0).max(24 * 365).default(0),
  is_active: z.boolean().default(true),
  intent: z.string().default(""),
  should: z.array(z.string()).default([]),
  should_not: z.array(z.string()).default([]),
  blocks: z.array(blockSchema).max(40).default([]),
  subject_hint: z.string().nullable().default(null),
  tone: z.string().nullable().default(null),
  coupon_code: z.string().nullable().default(null),
  text_only: z.boolean().default(false),
})

type Admin = ReturnType<typeof createAdminClient>

/** Colunas que a tela usa. Selecionar `*` traria as 5 de imagem sem editor. */
const BP_COLS =
  "id, flow_type, email_number, objective, messaging, subject_hint, blocks, tone_override, text_only, updated_at"
const OL_COLS =
  "id, flow_type, email_number, objective, guidance, restrictions, suggested_blocks, tone_hint, coupon_code, is_active"
const FT_COLS =
  "id, flow_type, email_number, name, delay_hours, is_active, updated_at"

async function loadAll(admin: Admin) {
  const [ftRes, bpRes, olRes] = await Promise.all([
    admin.from("email_flow_templates").select(FT_COLS),
    admin.from("email_blueprints").select(BP_COLS),
    admin.from("email_outline_templates").select(OL_COLS),
  ])
  if (ftRes.error) throw ftRes.error
  if (bpRes.error) throw bpRes.error
  if (olRes.error) throw olRes.error
  return {
    flowTemplates: (ftRes.data ?? []) as unknown as FlowTemplateRow[],
    blueprints: (bpRes.data ?? []) as unknown as RawBlueprint[],
    outlines: (olRes.data ?? []) as unknown as RawOutline[],
  }
}

/** Catálogo do seletor de fluxo, com o gatilho já em PT. */
function buildFlows(rows: EmailArchitectureRow[]): ArchFlow[] {
  const count = new Map<string, number>()
  for (const r of rows) {
    if (r.is_active) count.set(r.flow_type, (count.get(r.flow_type) ?? 0) + 1)
  }
  // Os 7 fluxos canônicos primeiro, na ordem do seed; depois qualquer
  // flow_type órfão que apareça só nos dados (nunca sumir da tela).
  const known = IMPLEMENTATION_FLOW_TYPES as readonly string[]
  const extras = [...new Set(rows.map((r) => r.flow_type))]
    .filter((f) => !known.includes(f))
    .sort()
  return [...known, ...extras].map((flow_type) => ({
    flow_type,
    label: FLOW_TYPE_LABELS[flow_type] ?? flow_type,
    trigger: flowTriggerLabel(flow_type as Parameters<typeof flowTriggerLabel>[0]),
    emails: count.get(flow_type) ?? 0,
  }))
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const { flowTemplates, blueprints, outlines } = await loadAll(admin)
    const rows = mergeRows(flowTemplates, blueprints, outlines)

    return successResponse(request, { rows, flows: buildFlows(rows) })
  } catch (error) {
    log.error("architecture.get", error)
    return errorResponse(request, error, "email-architecture-get")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = rowSchema.parse(await request.json())
    const payloads = splitRow({
      ...parsed,
      blocks: parsed.blocks.map((b) => ({
        ...b,
        legacy_type: b.legacy_type ?? null,
      })),
      outline_extras: [],
      blueprint_id: null,
      outline_id: null,
      flow_template_id: null,
      updated_at: null,
    })

    const { flow_type, email_number } = parsed
    const match = { flow_type, email_number }

    // Estado anterior das três linhas — é o que o desfazer recoloca. Sem
    // isto, uma falha na 2ª escrita deixaria as tabelas divergentes em
    // silêncio, que é exatamente o defeito que esta tela veio corrigir.
    // A régua é a última escrita, então não há o que desfazer depois dela —
    // por isso só as duas primeiras precisam do estado anterior.
    const [bpBefore, olBefore] = await Promise.all([
      admin.from("email_blueprints").select(BP_COLS).match(match).maybeSingle(),
      admin
        .from("email_outline_templates")
        .select(OL_COLS)
        .match(match)
        .maybeSingle(),
    ])

    const undo: Array<() => Promise<unknown>> = []
    const rollback = async (etapa: string, err: unknown) => {
      for (const fn of undo.reverse()) {
        await fn().catch((e) =>
          // O desfazer falhar é pior que a escrita falhar: aqui as tabelas
          // ficam divergentes de verdade e alguém precisa saber.
          log.error("architecture.rollback_failed", { flow_type, email_number, e }),
        )
      }
      log.error("architecture.put_failed", { etapa, flow_type, email_number, err })
    }

    // 1. Blueprint
    const bpUp = await admin
      .from("email_blueprints")
      .upsert({ ...payloads.blueprint, updated_by: user.id }, { onConflict: "flow_type,email_number" })
    if (bpUp.error) throw bpUp.error
    undo.push(async () =>
      bpBefore.data
        ? admin.from("email_blueprints").update(bpBefore.data).match(match)
        : admin.from("email_blueprints").delete().match(match),
    )

    // 2. Outline
    const olUp = await admin
      .from("email_outline_templates")
      .upsert(payloads.outline, { onConflict: "flow_type,email_number" })
    if (olUp.error) {
      await rollback("outline", olUp.error)
      throw olUp.error
    }
    undo.push(async () =>
      olBefore.data
        ? admin.from("email_outline_templates").update(olBefore.data).match(match)
        : admin.from("email_outline_templates").delete().match(match),
    )

    // 3. Régua
    const ftUp = await admin.from("email_flow_templates").upsert(
      { ...payloads.flowTemplate, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: "flow_type,email_number" },
    )
    if (ftUp.error) {
      await rollback("flow_template", ftUp.error)
      throw ftUp.error
    }

    // Devolve a linha REMONTADA do banco, não o que veio no corpo: é a
    // única forma de a tela saber o que ficou gravado de fato.
    const { flowTemplates, blueprints, outlines } = await loadAll(admin)
    const rows = mergeRows(flowTemplates, blueprints, outlines)
    const row =
      rows.find(
        (r) => r.flow_type === flow_type && r.email_number === email_number,
      ) ?? null

    return successResponse(request, { row })
  } catch (error) {
    log.error("architecture.put", error)
    return errorResponse(request, error, "email-architecture-put")
  }
}

const addSchema = z.object({ flow_type: z.string().min(1) })

/**
 * Acrescenta um e-mail ao FIM da régua. Um número desativado volta a ficar
 * ativo com o conteúdo que tinha — remover e readicionar é desfazer, não
 * recomeçar.
 */
export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const { flow_type } = addSchema.parse(await request.json())

    const { data: existing, error } = await admin
      .from("email_flow_templates")
      .select("email_number, is_active, delay_hours")
      .eq("flow_type", flow_type)
      .order("email_number", { ascending: true })
    if (error) throw error

    const rows = (existing ?? []) as Array<{
      email_number: number
      is_active: boolean
      delay_hours: number
    }>

    // Reativar o primeiro desativado antes de criar um novo: é o desfazer
    // do "Remover e-mail".
    const reusable = rows.find((r) => !r.is_active)
    if (reusable) {
      const { error: reErr } = await admin
        .from("email_flow_templates")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .match({ flow_type, email_number: reusable.email_number })
      if (reErr) throw reErr
      return successResponse(request, {
        email_number: reusable.email_number,
        reactivated: true,
      })
    }

    const last = rows[rows.length - 1] ?? null
    const emailNumber = (last?.email_number ?? 0) + 1
    const label = FLOW_TYPE_LABELS[flow_type] ?? flow_type
    const { error: insErr } = await admin.from("email_flow_templates").insert({
      flow_type,
      email_number: emailNumber,
      name: `${label} ${emailNumber}`,
      // +24h sobre o último é palpite explícito, e a tela deixa editar.
      delay_hours: (last?.delay_hours ?? 0) + 24,
      is_active: true,
      updated_by: user.id,
    })
    if (insErr) throw insErr

    return successResponse(
      request,
      { email_number: emailNumber, reactivated: false },
      { status: 201 },
    )
  } catch (error) {
    log.error("architecture.post", error)
    return errorResponse(request, error, "email-architecture-post")
  }
}

const removeSchema = z.object({
  flow_type: z.string().min(1),
  email_number: z.number().int().min(1),
})

/**
 * Remove o ÚLTIMO e-mail ativo do fluxo, desativando-o.
 *
 * Só o último: `email_number` é a chave que liga a régua ao blueprint e ao
 * outline, então tirar do meio deixaria um buraco (1,2,4,5) ou exigiria
 * renumerar — e renumerar desconectaria todo o conteúdo curado das posições
 * seguintes. Desativar em vez de apagar mantém o conteúdo para quando o
 * e-mail voltar.
 */
export async function DELETE(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const { flow_type, email_number } = removeSchema.parse(await request.json())

    const { data, error } = await admin
      .from("email_flow_templates")
      .select("email_number")
      .eq("flow_type", flow_type)
      .eq("is_active", true)
      .order("email_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    const last = (data as { email_number: number } | null)?.email_number ?? null
    if (last === null) {
      throw new AppError(
        "Este fluxo não tem e-mail ativo para remover.",
        422,
        "NO_ACTIVE_EMAIL",
      )
    }
    if (last !== email_number) {
      throw new AppError(
        `Só dá para remover o último e-mail da régua (#${last}). Tirar o #${email_number} do meio deixaria um buraco na numeração, que é a chave do conteúdo curado.`,
        422,
        "NOT_LAST_EMAIL",
      )
    }

    const { error: updErr } = await admin
      .from("email_flow_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .match({ flow_type, email_number })
    if (updErr) throw updErr

    // Espelha no outline: `generate.service` filtra por is_active=true, e
    // um e-mail fora da régua não pode seguir alimentando o Montador.
    await admin
      .from("email_outline_templates")
      .update({ is_active: false })
      .match({ flow_type, email_number })

    return successResponse(request, { email_number, removed: true })
  } catch (error) {
    log.error("architecture.delete", error)
    return errorResponse(request, error, "email-architecture-delete")
  }
}
