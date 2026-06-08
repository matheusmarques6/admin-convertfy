/**
 * Orquestra a geração de TESTE de um único email (aba "Testar" do hub).
 *
 * Regra de produto:
 *  - Se o email JÁ tem copy  → Montador → Blueprint → render síncrono
 *    (imagem + HTML + QA), SEM passar pelo N8N.
 *  - Se NÃO tem copy         → caminho normal de dispatch, que já faz
 *    Montador → Blueprint → seed → N8N. O render acontece depois, via gate
 *    de brand / callback do N8N (assíncrono).
 */
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { generateBlueprintAndReference } from "./architect/generate.service"
import { generateEmail } from "./email-generation.service"
import { dispatchEmailCopyWebhook } from "../services/email-copy-webhook.service"

const log = logger.child("TestGeneration")

export interface TestGenerationInput {
  storeId: string
  flowId: string
  emailId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy: string
}

export interface TestGenerationResult {
  status: "done" | "dispatched" | "error"
  path: "with_copy" | "without_copy"
  hasCopy: boolean
  error?: string
  batchId: string
  emailId: string
}

/** Um bloco "tem copy" quando seu content é um objeto com pelo menos 1 chave. */
export function blockHasCopy(content: unknown): boolean {
  return (
    content != null &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    Object.keys(content as Record<string, unknown>).length > 0
  )
}

/** O email tem copy se algum dos seus blocos tem content preenchido. */
export async function emailHasCopy(emailId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_blocks")
    .select("content")
    .eq("email_id", emailId)
  if (error || !data) return false
  return data.some((b) => blockHasCopy((b as { content: unknown }).content))
}

export async function runTestGeneration(
  input: TestGenerationInput,
): Promise<TestGenerationResult> {
  const { storeId, flowId, emailId, flowType, emailNumber, batchId, triggeredBy } =
    input

  const hasCopy = await emailHasCopy(emailId)
  log.info("test.start", { storeId, emailId, batchId, hasCopy })

  if (hasCopy) {
    // COM copy: Montador → Blueprint → render síncrono (sem N8N).
    await generateBlueprintAndReference({
      storeId,
      flowType,
      emailNumber,
      batchId,
      triggeredBy,
    })
    const r = await generateEmail({
      storeId,
      flowId,
      emailId,
      flowType,
      emailNumber,
      triggeredBy,
      batchId,
      skipSeed: true, // preserva a copy existente (não re-seedeia)
    })
    return {
      status: r.status,
      path: "with_copy",
      hasCopy: true,
      error: r.error,
      batchId,
      emailId,
    }
  }

  // SEM copy: o dispatch já faz Montador → Blueprint → seed → N8N.
  // O render (imagem/HTML/QA) virá depois, via gate de brand / callback.
  await dispatchEmailCopyWebhook(storeId, {
    triggerSource: "manual_store_button",
    flowIds: [flowId],
    triggeredBy,
  })
  log.info("test.dispatched_n8n", { storeId, emailId, flowId, batchId })
  return {
    status: "dispatched",
    path: "without_copy",
    hasCopy: false,
    batchId,
    emailId,
  }
}
