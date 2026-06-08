/**
 * Prompt Management Service (Epic AE — AE-8)
 *
 * Centraliza CRUD versionado da tabela `email_agent_configs`. Tanto o
 * endpoint legacy (`/api/admin/email-agent-configs`) quanto os endpoints
 * novos (`/api/admin/agents/prompts/*`) chamam este service. Route
 * handlers ficam finos; toda a lógica (versionamento, activate, rollback,
 * validação de schema) mora aqui.
 *
 * Decisões:
 * - Sem transação SQL nativa do Supabase JS: activate faz 2 UPDATEs em
 *   sequência. O unique index `idx_agent_config_active` garante que duas
 *   versões não fiquem ativas simultaneamente — se a 2ª update falhar,
 *   a 1ª deixou o agent_type sem ativo (estado recuperável via rollback).
 * - Idempotência: activate em row já ativa retorna sem mudanças.
 * - Validação de output_schema: estrutural mínima (JSON Schema deve ter
 *   `type` ou `properties`/`items`). Suficiente para barrar lixo no POST
 *   sem dependência de Ajv.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"
import type { AgentType, EmailAgentConfig } from "@/types/email-generation"

const log = logger.child("PromptManagement")

export type PromptRow = EmailAgentConfig & {
  created_by_name?: string | null
}

export interface PromptListGroup {
  active: PromptRow | null
  history: PromptRow[]
}

export interface ListPromptsResult {
  by_type: Record<AgentType, PromptListGroup>
}

const ALL_AGENT_TYPES: AgentType[] = [
  "copy",
  "image",
  "html",
  "qa",
  "blueprint",
  "assembler",
]

// ── Validação de output_schema ─────────────────────────────
//
// JSON Schema válido (na medida do que o pipeline AE consome):
// - objeto não-nulo
// - tem `type` OU `properties`/`items`/`$ref`
function validateOutputSchema(schema: unknown): void {
  if (schema === null || schema === undefined) return
  if (typeof schema !== "object" || Array.isArray(schema)) {
    throw new ValidationError("output_schema deve ser um objeto JSON")
  }
  const s = schema as Record<string, unknown>
  const hasType = typeof s.type === "string"
  const hasProps =
    s.properties !== undefined ||
    s.items !== undefined ||
    s.$ref !== undefined ||
    s.anyOf !== undefined ||
    s.oneOf !== undefined
  if (!hasType && !hasProps) {
    throw new ValidationError(
      "output_schema inválido: precisa de `type` ou `properties`/`items`/`$ref`",
    )
  }
}

// ── Resolver nome do criador (best-effort) ─────────────────
async function attachCreatorNames(rows: EmailAgentConfig[]): Promise<PromptRow[]> {
  if (rows.length === 0) return []
  const admin = createAdminClient()
  const ids = Array.from(
    new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
  )
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, created_by_name: null }))
  }
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("id", ids)
  const byId = new Map<string, string>()
  for (const p of (profiles ?? []) as Array<{ id: string; name?: string; email?: string }>) {
    byId.set(p.id, p.name || p.email || p.id)
  }
  return rows.map((r) => ({
    ...r,
    created_by_name: r.created_by ? byId.get(r.created_by) ?? null : null,
  }))
}

// ── Truncate preview p/ listagem ───────────────────────────
function truncate(s: string | null | undefined, max = 500): string {
  if (!s) return ""
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// ── List ──────────────────────────────────────────────────
export async function listPrompts(opts: {
  agentType?: AgentType
  truncatePreview?: boolean
} = {}): Promise<ListPromptsResult> {
  const admin = createAdminClient()
  let query = admin
    .from("email_agent_configs")
    .select("*")
    .order("agent_type")
    .order("version", { ascending: false })

  if (opts.agentType) query = query.eq("agent_type", opts.agentType)

  const { data, error } = await query
  if (error) throw error

  const enriched = await attachCreatorNames((data ?? []) as EmailAgentConfig[])

  // Aplica truncate p/ listagem (não p/ detalhe).
  const rows: PromptRow[] = opts.truncatePreview !== false
    ? enriched.map((r) => ({
        ...r,
        system_prompt: truncate(r.system_prompt),
        user_template: truncate(r.user_template),
      }))
    : enriched

  const by_type: Record<AgentType, PromptListGroup> = {
    copy: { active: null, history: [] },
    image: { active: null, history: [] },
    html: { active: null, history: [] },
    qa: { active: null, history: [] },
    blueprint: { active: null, history: [] },
    assembler: { active: null, history: [] },
  }

  for (const row of rows) {
    const at = row.agent_type
    if (!ALL_AGENT_TYPES.includes(at)) continue
    if (row.is_active) by_type[at].active = row
    else by_type[at].history.push(row)
  }

  return { by_type }
}

// ── Detail (full, sem truncate) ───────────────────────────
export async function getPromptDetail(id: string): Promise<PromptRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_agent_configs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError("Prompt")
  const [enriched] = await attachCreatorNames([data as EmailAgentConfig])
  return enriched
}

// ── Create new version ────────────────────────────────────
export interface CreatePromptInput {
  agentType: AgentType
  model: string
  systemPrompt: string
  userTemplate: string
  temperature: number
  maxTokens: number
  outputSchema?: unknown
  createdBy: string
}

export async function createPromptVersion(
  input: CreatePromptInput,
): Promise<PromptRow> {
  validateOutputSchema(input.outputSchema ?? null)
  const admin = createAdminClient()

  // next_version = max(version) + 1 do mesmo agent_type
  const { data: maxRows, error: maxErr } = await admin
    .from("email_agent_configs")
    .select("version")
    .eq("agent_type", input.agentType)
    .order("version", { ascending: false })
    .limit(1)
  if (maxErr) throw maxErr
  const currentMax =
    (maxRows ?? []).length > 0
      ? Number(((maxRows ?? [])[0] as { version?: number }).version ?? 0)
      : 0
  const nextVersion = currentMax + 1

  const { data, error } = await admin
    .from("email_agent_configs")
    .insert({
      agent_type: input.agentType,
      model: input.model,
      system_prompt: input.systemPrompt,
      user_template: input.userTemplate,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      output_schema: (input.outputSchema ?? null) as Record<string, unknown> | null,
      version: nextVersion,
      is_active: false,
      created_by: input.createdBy,
    })
    .select("*")
    .single()

  if (error) throw error

  log.info("Prompt version created", {
    agent_type: input.agentType,
    version: nextVersion,
    id: (data as { id?: string })?.id,
    created_by: input.createdBy,
  })

  const [enriched] = await attachCreatorNames([data as EmailAgentConfig])
  return enriched
}

// ── Activate (atomic, idempotent) ─────────────────────────
export interface ActivateResult {
  activated: PromptRow
  was_already_active: boolean
  deactivated_version: number | null
}

export async function activatePrompt(
  id: string,
  actorId: string,
): Promise<ActivateResult> {
  const admin = createAdminClient()

  const { data: target, error: tErr } = await admin
    .from("email_agent_configs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) throw new NotFoundError("Prompt")
  const targetRow = target as EmailAgentConfig

  // Idempotente: já ativo
  if (targetRow.is_active) {
    const [enriched] = await attachCreatorNames([targetRow])
    return {
      activated: enriched,
      was_already_active: true,
      deactivated_version: null,
    }
  }

  // Busca a atual ativa pra logar a version desativada
  const { data: currentActive } = await admin
    .from("email_agent_configs")
    .select("id, version")
    .eq("agent_type", targetRow.agent_type)
    .eq("is_active", true)
    .maybeSingle()

  // Passo 1: desativa anterior (se existir).
  // O unique index parcial garante consistência: nunca havera 2 ativas.
  if (currentActive) {
    const { error: dErr } = await admin
      .from("email_agent_configs")
      .update({ is_active: false })
      .eq("id", (currentActive as { id: string }).id)
    if (dErr) throw dErr
  }

  // Passo 2: ativa target.
  // Se este UPDATE falhar, tentamos reverter o passo 1 para nao deixar
  // `agent_type` sem nenhuma versao ativa. O caller ve o erro original;
  // o revert e best-effort + logado.
  const { data: updated, error: uErr } = await admin
    .from("email_agent_configs")
    .update({ is_active: true })
    .eq("id", id)
    .select("*")
    .single()
  if (uErr) {
    if (currentActive) {
      const { error: revertErr } = await admin
        .from("email_agent_configs")
        .update({ is_active: true })
        .eq("id", (currentActive as { id: string }).id)
      if (revertErr) {
        log.error("prompt.activate.revert_failed", {
          agent_type: targetRow.agent_type,
          target_id: id,
          previous_active_id: (currentActive as { id: string }).id,
          activate_error: uErr.message,
          revert_error: revertErr.message,
        })
      } else {
        log.warn("prompt.activate.reverted_after_failure", {
          agent_type: targetRow.agent_type,
          target_id: id,
          previous_active_id: (currentActive as { id: string }).id,
          activate_error: uErr.message,
        })
      }
    }
    throw uErr
  }

  log.info("prompt.activated", {
    agent_type: targetRow.agent_type,
    version: targetRow.version,
    id,
    activated_by: actorId,
  })

  const [enriched] = await attachCreatorNames([updated as EmailAgentConfig])
  return {
    activated: enriched,
    was_already_active: false,
    deactivated_version: currentActive
      ? Number((currentActive as { version?: number }).version ?? 0)
      : null,
  }
}

// ── Rollback ──────────────────────────────────────────────
export interface RollbackResult {
  activated_version: number
  previous_active_version: number | null
}

export async function rollbackToVersion(
  currentId: string,
  toVersion: number,
  actorId: string,
): Promise<RollbackResult> {
  const admin = createAdminClient()

  // Descobre agent_type do row referido
  const { data: current, error: cErr } = await admin
    .from("email_agent_configs")
    .select("agent_type, version, is_active")
    .eq("id", currentId)
    .maybeSingle()
  if (cErr) throw cErr
  if (!current) throw new NotFoundError("Prompt")
  const currentRow = current as Pick<EmailAgentConfig, "agent_type" | "version" | "is_active">

  // Busca a versão target
  const { data: target, error: tErr } = await admin
    .from("email_agent_configs")
    .select("*")
    .eq("agent_type", currentRow.agent_type)
    .eq("version", toVersion)
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) throw new NotFoundError(`Versão ${toVersion}`)
  const targetRow = target as EmailAgentConfig

  if (targetRow.is_active) {
    throw new ConflictError(`Versão ${toVersion} já é a ativa`)
  }

  const result = await activatePrompt(targetRow.id, actorId)

  log.info("prompt.rolled_back", {
    agent_type: currentRow.agent_type,
    to_version: toVersion,
    from_version: result.deactivated_version,
    activated_by: actorId,
  })

  return {
    activated_version: targetRow.version,
    previous_active_version: result.deactivated_version,
  }
}

// ── Authz helper (consumido pelos route handlers) ─────────
export interface PromptManagementActor {
  id: string
  role: string | null
  tags: string[]
}

export function canManagePrompts(actor: PromptManagementActor): boolean {
  if (actor.role === "admin" || actor.role === "owner") return true
  if (actor.tags.includes("dev")) return true
  return false
}

// Re-export para uso em error responses
export { AppError, ConflictError, NotFoundError, ValidationError }
