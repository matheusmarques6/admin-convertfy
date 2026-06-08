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

    const [bpRes, refRes] = await Promise.all([
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
