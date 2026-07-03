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
import type { BlueprintRow } from "@/lib/email-blueprints/types"

export type { BlueprintRow } from "@/lib/email-blueprints/types"
export {
  BLOCK_TYPE_OPTIONS,
  type BlueprintBlockType,
} from "@/lib/email-blueprints/types"

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
  text_only: boolean | null
}

export async function listBlueprintsWithDefaults(): Promise<BlueprintRow[]> {
  const admin = createAdminClient()
  let { data, error } = await admin
    .from("email_blueprints")
    .select(
      "id, flow_type, email_number, objective, messaging, subject_hint, blocks, tone_override, updated_at, text_only",
    )
    .order("flow_type")
    .order("email_number")

  // Fail-open pré-migration: se a coluna text_only ainda não existe no
  // banco, refaz o select legado (todos os rows viram text_only=false)
  // em vez de derrubar a aba Blueprints inteira.
  if (error) {
    const retry = await admin
      .from("email_blueprints")
      .select(
        "id, flow_type, email_number, objective, messaging, subject_hint, blocks, tone_override, updated_at",
      )
      .order("flow_type")
      .order("email_number")
    data = retry.data as typeof data
    error = retry.error
  }

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
      text_only: r.text_only ?? false,
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
        // A flag só existe em rows do DB — defaults nunca são text_only.
        text_only: false,
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

export { AppError, ConflictError, NotFoundError, ValidationError }
