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
  }))

  const { data: inserted, error: insertErr } = await admin
    .from("email_blocks")
    .insert(inserts)
    .select("id, block_type, position, label")

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
      needs_image: def?.needs_image ?? blockType === "hero",
    }
  })

  log.info("seed.done", { emailId, blockCount: blocks.length })
  return { blocks }
}
