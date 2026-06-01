/**
 * Blueprint management service — análogo a prompt-management.service.
 *
 * Provê:
 *   - `canManageEmailBlueprints(actor)`: gate de auth (admin/owner/dev).
 *   - `listBlueprintsWithDefaults()`: lista mesclada de DB + DEFAULT_BLUEPRINTS,
 *     identificando a origem (`source: 'db' | 'default'`) pra UI badgear quem
 *     está customizado vs usando fallback do código.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  DEFAULT_BLUEPRINTS,
  type BlueprintBlockDef,
} from "@/lib/agents/email-blueprint"
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"

export interface BlueprintActor {
  id: string
  role: string | null
  tags: string[]
}

export function canManageEmailBlueprints(actor: BlueprintActor): boolean {
  if (actor.role === "admin" || actor.role === "owner") return true
  if (actor.tags.includes("dev")) return true
  return false
}

export interface BlueprintRow {
  id: string | null
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlockDef[]
  tone_override: string | null
  updated_at: string | null
  source: "db" | "default"
}

interface DbBlueprintRow {
  id: string
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlockDef[] | null
  tone_override: string | null
  updated_at: string
}

export async function listBlueprintsWithDefaults(): Promise<BlueprintRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_blueprints")
    .select(
      "id, flow_type, email_number, objective, messaging, subject_hint, blocks, tone_override, updated_at",
    )
    .order("flow_type")
    .order("email_number")

  if (error) throw error

  const dbRows = (data ?? []) as DbBlueprintRow[]
  const seen = new Set<string>()
  const result: BlueprintRow[] = []

  for (const r of dbRows) {
    const key = `${r.flow_type}:${r.email_number}`
    seen.add(key)
    result.push({
      id: r.id,
      flow_type: r.flow_type,
      email_number: r.email_number,
      objective: r.objective,
      messaging: r.messaging,
      subject_hint: r.subject_hint,
      blocks: Array.isArray(r.blocks) ? r.blocks : [],
      tone_override: r.tone_override,
      updated_at: r.updated_at,
      source: "db",
    })
  }

  for (const [flowType, byNumber] of Object.entries(DEFAULT_BLUEPRINTS)) {
    for (const [emailNumberStr, def] of Object.entries(byNumber)) {
      const emailNumber = Number(emailNumberStr)
      const key = `${flowType}:${emailNumber}`
      if (seen.has(key)) continue
      result.push({
        id: null,
        flow_type: flowType,
        email_number: emailNumber,
        objective: def.objective,
        messaging: def.messaging,
        subject_hint: def.subject_hint,
        blocks: def.blocks,
        tone_override: null,
        updated_at: null,
        source: "default",
      })
    }
  }

  result.sort((a, b) => {
    if (a.flow_type !== b.flow_type)
      return a.flow_type.localeCompare(b.flow_type)
    return a.email_number - b.email_number
  })

  return result
}

export const BLOCK_TYPE_OPTIONS = [
  { value: "hero", label: "Hero (banner com imagem)" },
  { value: "text", label: "Text (parágrafo)" },
  { value: "coupon", label: "Coupon (código + CTA)" },
  { value: "products", label: "Products (carrossel)" },
  { value: "cta", label: "CTA (botão isolado)" },
  { value: "footer", label: "Footer (links + copyright)" },
  { value: "image", label: "Image (banner sem texto)" },
  { value: "divider", label: "Divider (linha)" },
  { value: "spacer", label: "Spacer (espaço)" },
] as const

export type BlueprintBlockType = (typeof BLOCK_TYPE_OPTIONS)[number]["value"]

export { AppError, ConflictError, NotFoundError, ValidationError }
