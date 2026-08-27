/**
 * Inspeção do Component Assembler: o que foi gerado por loja.
 * GET → junta store_email_blueprints + store_email_references por email.
 */
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreGenerated")

export const dynamic = "force-dynamic"

interface BlueprintRow {
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: unknown
  source: string
  model: string | null
  updated_at: string
}
interface ReferenceRow {
  flow_type: string
  email_number: number
  html: string
  variant_ids: string[]
  source: string
  model: string | null
  updated_at: string
}
interface GeneratedItem {
  flow_type: string
  email_number: number
  blueprint: BlueprintRow | null
  reference: ReferenceRow | null
  // Reference que o HTML agent EFETIVAMENTE recebe (loja > global > nenhum).
  consumed?: {
    match: "loja" | "global" | "nenhum"
    html: string | null
  }
  /**
   * O que aconteceu com o Estruturador na última geração deste email.
   * Sem isto, "montado na estrutura genérica do outline" só existia como
   * nó vermelho no Estúdio e log de servidor — quem abre o email pronto
   * não tinha como saber.
   */
  estruturador?: {
    status: string
    erro: string | null
    quando: string | null
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const [bpRes, refRes, globalRes, estRes] = await Promise.all([
      admin
        .from("store_email_blueprints")
        .select(
          "flow_type, email_number, objective, messaging, subject_hint, blocks, source, model, updated_at",
        )
        .eq("store_id", storeId),
      admin
        .from("store_email_references")
        .select(
          "flow_type, email_number, html, variant_ids, source, model, updated_at",
        )
        .eq("store_id", storeId),
      // Reference global — o fallback que o HTML agent usa quando não há
      // reference da loja (build-vars.ts: loja > global > vazio).
      admin
        .from("email_reference_templates")
        .select("flow_type, email_number, html")
        .eq("is_active", true),
      // Última run do Estruturador por email desta loja. Ordenada desc: a
      // primeira linha de cada (flow, número) é a vigente.
      admin
        .from("email_generation_runs")
        .select(
          "status, error_message, created_at, email:email_flow_emails!inner(number, flow:email_flows!inner(flow_type))",
        )
        .eq("agent", "estruturador")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(200),
    ])
    if (bpRes.error) throw bpRes.error
    if (refRes.error) throw refRes.error

    const map = new Map<string, GeneratedItem>()
    for (const b of (bpRes.data as BlueprintRow[] | null) ?? []) {
      const k = `${b.flow_type}:${b.email_number}`
      map.set(k, {
        flow_type: b.flow_type,
        email_number: b.email_number,
        blueprint: b,
        reference: null,
      })
    }
    for (const r of (refRes.data as ReferenceRow[] | null) ?? []) {
      const k = `${r.flow_type}:${r.email_number}`
      const cur = map.get(k) ?? {
        flow_type: r.flow_type,
        email_number: r.email_number,
        blueprint: null,
        reference: null,
      }
      cur.reference = r
      map.set(k, cur)
    }

    // Estruturador por email — a primeira linha de cada chave é a vigente.
    const estMap = new Map<string, GeneratedItem["estruturador"]>()
    for (const r of ((estRes.data ?? []) as unknown as Array<{
      status: string
      error_message: string | null
      created_at: string
      email?: { number?: number; flow?: { flow_type?: string } | null } | null
    }>)) {
      const flowType = r.email?.flow?.flow_type
      const numero = r.email?.number
      if (!flowType || numero == null) continue
      const k = `${flowType}:${numero}`
      if (estMap.has(k)) continue
      estMap.set(k, {
        status: r.status,
        erro: r.error_message ?? null,
        quando: r.created_at ?? null,
      })
    }

    // Espelha a resolução do build-vars: loja > global > nenhum.
    const globalMap = new Map<string, string>()
    for (const g of (globalRes.data as Array<{
      flow_type: string
      email_number: number
      html: string
    }> | null) ?? []) {
      globalMap.set(`${g.flow_type}:${g.email_number}`, g.html)
    }
    for (const item of map.values()) {
      const storeHtml = item.reference?.html ?? null
      const globalHtml =
        globalMap.get(`${item.flow_type}:${item.email_number}`) ?? null
      item.consumed = storeHtml
        ? { match: "loja", html: storeHtml }
        : globalHtml
          ? { match: "global", html: globalHtml }
          : { match: "nenhum", html: null }
      const est = estMap.get(`${item.flow_type}:${item.email_number}`)
      if (est) item.estruturador = est
    }

    const items = Array.from(map.values()).sort((a, b) =>
      a.flow_type === b.flow_type
        ? a.email_number - b.email_number
        : a.flow_type.localeCompare(b.flow_type),
    )
    return successResponse(request, { items })
  } catch (error) {
    log.error("store_generated.get", error)
    return errorResponse(request, error, "store-generated-get")
  }
}
