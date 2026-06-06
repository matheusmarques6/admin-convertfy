/**
 * Seed blocks from blueprint — função determinística.
 *
 * 1. Lê blueprint do banco (`email_blueprints`) por flow_type + email_number
 * 2. Fallback pra `DEFAULT_BLUEPRINTS` se não existir no banco
 * 3. Deleta blocos existentes do email (re-geração limpa)
 * 4. Insere novos blocos com content vazio `{}`
 *
 * Retorna os blocos criados com id, block_type e position.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { DEFAULT_BLUEPRINTS, type BlueprintBlockDef } from "./email-blueprint"

const log = logger.child("SeedBlocks")

export interface SeededBlock {
  id: string
  block_type: string
  position: number
  label: string
  purpose: string
  needs_image: boolean
}

export async function seedBlocksFromBlueprint(
  emailId: string,
  flowType: string,
  emailNumber: number,
): Promise<{ blocks: SeededBlock[] }> {
  const admin = createAdminClient()

  // 1. Tentar ler blueprint do banco
  let blockDefs: BlueprintBlockDef[] | null = null
  try {
    const { data: dbBlueprint } = await admin
      .from("email_blueprints")
      .select("blocks")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle()

    if (dbBlueprint?.blocks && Array.isArray(dbBlueprint.blocks)) {
      blockDefs = dbBlueprint.blocks as BlueprintBlockDef[]
      log.info("blueprint.from_db", { flowType, emailNumber, blockCount: blockDefs.length })
    }
  } catch (err) {
    log.warn("blueprint.db_read_failed", { flowType, emailNumber, error: (err as Error).message })
  }

  // 2. Fallback pra DEFAULT_BLUEPRINTS
  if (!blockDefs) {
    const flowBlueprints = DEFAULT_BLUEPRINTS[flowType]
    const blueprint = flowBlueprints?.[emailNumber]
    if (blueprint) {
      blockDefs = blueprint.blocks
      log.info("blueprint.from_default", { flowType, emailNumber, blockCount: blockDefs.length })
    } else {
      // Fallback mínimo: hero + text + footer
      blockDefs = [
        { type: "hero", label: "Hero", purpose: "Banner principal do email", needs_image: true },
        { type: "text", label: "Texto", purpose: "Corpo principal do email" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé com links" },
      ]
      log.info("blueprint.fallback_minimal", { flowType, emailNumber })
    }
  }

  // 3. Deletar blocos existentes
  const { error: deleteErr } = await admin
    .from("email_blocks")
    .delete()
    .eq("email_id", emailId)

  if (deleteErr) {
    log.error("seed.delete_existing_failed", { emailId, error: deleteErr.message })
    throw new Error(`Falha ao limpar blocos existentes: ${deleteErr.message}`)
  }

  // 4. Inserir novos blocos com content vazio
  const inserts = blockDefs.map((def, idx) => ({
    email_id: emailId,
    block_type: def.type,
    label: def.label,
    position: idx + 1,
    content: {},
    applied: false,
    // Persiste o flag do blueprint. `?? type==='hero'` preserva o
    // comportamento default para blueprints antigos sem o campo.
    needs_image: def.needs_image ?? def.type === "hero",
  }))

  const { data: inserted, error: insertErr } = await admin
    .from("email_blocks")
    .insert(inserts)
    .select("id, block_type, position, label, needs_image")

  if (insertErr) {
    log.error("seed.insert_failed", { emailId, error: insertErr.message })
    throw new Error(`Falha ao inserir blocos: ${insertErr.message}`)
  }

  const blocks: SeededBlock[] = (inserted ?? []).map((row, idx) => {
    const def = blockDefs![idx]
    const blockType = row.block_type as string
    return {
      id: row.id as string,
      block_type: blockType,
      position: row.position as number,
      label: row.label as string,
      purpose: def?.purpose ?? "",
      // Deriva do que foi persistido (coluna needs_image), com fallback
      // ao blueprint/hero por compat com linhas antigas.
      needs_image:
        (row.needs_image as boolean | undefined) ??
        def?.needs_image ??
        blockType === "hero",
    }
  })

  log.info("seed.done", { emailId, blockCount: blocks.length })
  return { blocks }
}

// ──────────────────────────────────────────────────────────────
// Auto-seed lazy (não destrutivo) — usado pelo dispatchEmailCopyWebhook
// pra garantir que cada email do batch tem blocks materializados antes
// de montar o payload pro n8n. Diferente de `seedBlocksFromBlueprint`,
// NÃO deleta blocks existentes — só insere quando a tabela está vazia
// pro `email_id`. Idempotente.
// ──────────────────────────────────────────────────────────────

export interface EnsureBlocksResult {
  /** true se INSERT rolou; false se já tinha blocks (no-op). */
  seeded: boolean
  /** Total de blocks na tabela após a operação. */
  count: number
}

export async function ensureBlocksSeeded(
  emailId: string,
  flowType: string,
  emailNumber: number,
): Promise<EnsureBlocksResult> {
  const admin = createAdminClient()

  // 1. Já tem blocks? Não toca em nada.
  const { count: existing, error: countErr } = await admin
    .from("email_blocks")
    .select("id", { count: "exact", head: true })
    .eq("email_id", emailId)

  if (countErr) {
    log.error("ensure.count_failed", { emailId, error: countErr.message })
    throw new Error(`Falha ao contar blocos: ${countErr.message}`)
  }
  if ((existing ?? 0) > 0) {
    return { seeded: false, count: existing ?? 0 }
  }

  // 2. Lookup blueprint (DB → DEFAULT_BLUEPRINTS → fallback mínimo)
  let blockDefs: BlueprintBlockDef[] | null = null
  try {
    const { data: dbBlueprint } = await admin
      .from("email_blueprints")
      .select("blocks")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle()

    if (dbBlueprint?.blocks && Array.isArray(dbBlueprint.blocks)) {
      blockDefs = dbBlueprint.blocks as BlueprintBlockDef[]
    }
  } catch (err) {
    log.warn("ensure.blueprint_read_failed", {
      flowType,
      emailNumber,
      error: (err as Error).message,
    })
  }

  if (!blockDefs) {
    const flowBlueprints = DEFAULT_BLUEPRINTS[flowType]
    const blueprint = flowBlueprints?.[emailNumber]
    if (blueprint) {
      blockDefs = blueprint.blocks
    } else {
      blockDefs = [
        { type: "hero", label: "Hero", purpose: "Banner principal do email", needs_image: true },
        { type: "text", label: "Texto", purpose: "Corpo principal do email" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ]
    }
  }

  // 3. INSERT direto (sem DELETE — está vazio mesmo)
  const inserts = blockDefs.map((def, idx) => ({
    email_id: emailId,
    block_type: def.type,
    label: def.label,
    position: idx + 1,
    content: {},
    applied: false,
    needs_image: def.needs_image ?? def.type === "hero",
  }))

  const { error: insertErr } = await admin
    .from("email_blocks")
    .insert(inserts)

  if (insertErr) {
    log.error("ensure.insert_failed", { emailId, error: insertErr.message })
    throw new Error(`Falha ao inserir blocos: ${insertErr.message}`)
  }

  log.info("ensure.seeded", {
    emailId,
    flowType,
    emailNumber,
    count: inserts.length,
  })
  return { seeded: true, count: inserts.length }
}

// ──────────────────────────────────────────────────────────────
// Reconciliação ADITIVA com a blueprint (Story: emails legados/stale)
//
// Emails semeados sob uma composição antiga ficam "presos" com menos
// blocos que a blueprint vigente (ensureBlocksSeeded é idempotente e
// nunca atualiza estrutura existente). Esta função adiciona os blocos
// FALTANTES da blueprint PRESERVANDO a copy já gerada dos blocos
// existentes (carry-over de content/applied por match de tipo, na
// ordem da blueprint).
//
// - Se a estrutura JÁ bate com a blueprint (mesma sequência de tipos):
//   no-op (não toca em emails saudáveis — sem churn de IDs).
// - Caso contrário: reescreve os blocos na ORDEM da blueprint, levando
//   o content dos que casam por tipo e deixando os novos vazios ({}).
// ──────────────────────────────────────────────────────────────

/** Resolve os defs da blueprint: DB → DEFAULT_BLUEPRINTS → fallback mínimo. */
async function resolveBlockDefs(
  admin: ReturnType<typeof createAdminClient>,
  flowType: string,
  emailNumber: number,
): Promise<BlueprintBlockDef[]> {
  try {
    const { data } = await admin
      .from("email_blueprints")
      .select("blocks")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle()
    if (data?.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
      return data.blocks as BlueprintBlockDef[]
    }
  } catch (err) {
    log.warn("reconcile.blueprint_read_failed", {
      flowType,
      emailNumber,
      error: (err as Error).message,
    })
  }
  const fromDefault = DEFAULT_BLUEPRINTS[flowType]?.[emailNumber]?.blocks
  if (fromDefault && fromDefault.length > 0) return fromDefault
  return [
    { type: "hero", label: "Hero", purpose: "Banner principal do email", needs_image: true },
    { type: "text", label: "Texto", purpose: "Corpo principal do email" },
    { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
  ]
}

interface ExistingBlockRow {
  id: string
  block_type: string
  position: number
  label: string
  content: Record<string, unknown> | null
  applied: boolean
  applied_at: string | null
}

export interface ReconcileResult {
  /** true se a estrutura foi reescrita; false se já batia (no-op). */
  reconciled: boolean
  /** Quantidade de blocos novos (vazios) adicionados. */
  added: number
  /** Total de blocos após a operação. */
  total: number
}

export async function reconcileBlocksAdditive(
  emailId: string,
  flowType: string,
  emailNumber: number,
): Promise<ReconcileResult> {
  const admin = createAdminClient()
  const blockDefs = await resolveBlockDefs(admin, flowType, emailNumber)

  const { data: existingData, error: readErr } = await admin
    .from("email_blocks")
    .select("id, block_type, position, label, content, applied, applied_at")
    .eq("email_id", emailId)
    .order("position", { ascending: true })
  if (readErr) {
    log.error("reconcile.read_failed", { emailId, error: readErr.message })
    throw new Error(`Falha ao ler blocos: ${readErr.message}`)
  }
  const existing = (existingData ?? []) as ExistingBlockRow[]

  // No-op se a sequência de tipos já é idêntica à blueprint.
  const sameSequence =
    existing.length === blockDefs.length &&
    existing.every((b, i) => b.block_type === blockDefs[i].type)
  if (sameSequence) {
    return { reconciled: false, added: 0, total: existing.length }
  }

  // Fila de blocos existentes por tipo (FIFO por position) para carry-over.
  const poolByType = new Map<string, ExistingBlockRow[]>()
  for (const b of existing) {
    const arr = poolByType.get(b.block_type) ?? []
    arr.push(b)
    poolByType.set(b.block_type, arr)
  }

  let added = 0
  const inserts = blockDefs.map((def, idx) => {
    const match = poolByType.get(def.type)?.shift()
    if (!match) added++
    return {
      email_id: emailId,
      block_type: def.type,
      label: def.label,
      position: idx + 1,
      content: match?.content ?? {},
      applied: match?.applied ?? false,
      applied_at: match?.applied_at ?? null,
      needs_image: def.needs_image ?? def.type === "hero",
    }
  })

  // Reescreve a estrutura (delete + insert) preservando a copy dos matches.
  const { error: delErr } = await admin
    .from("email_blocks")
    .delete()
    .eq("email_id", emailId)
  if (delErr) {
    log.error("reconcile.delete_failed", { emailId, error: delErr.message })
    throw new Error(`Falha ao limpar blocos: ${delErr.message}`)
  }
  const { error: insErr } = await admin.from("email_blocks").insert(inserts)
  if (insErr) {
    log.error("reconcile.insert_failed", { emailId, error: insErr.message })
    throw new Error(`Falha ao inserir blocos: ${insErr.message}`)
  }

  log.info("reconcile.done", {
    emailId,
    flowType,
    emailNumber,
    before: existing.length,
    after: inserts.length,
    added,
  })
  return { reconciled: true, added, total: inserts.length }
}

