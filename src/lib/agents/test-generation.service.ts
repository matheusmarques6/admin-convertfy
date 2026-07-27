/**
 * Orquestra a geração de TESTE de um único email (aba "Testar" do hub).
 *
 * Regra de produto:
 *  - Se o email JÁ tem copy  → Montador → Blueprint (síncrono no handler),
 *    depois retorna imediato. O render (imagem + HTML + QA) é disparado
 *    em background via `after(runPhase2InBackground)` no route handler.
 *    Sem isso, image (~166s) + html (~90s) + qa (~15s) estouram o
 *    maxDuration=300s da Vercel.
 *  - Se NÃO tem copy         → caminho normal de dispatch, que já faz
 *    Montador → Blueprint → seed → N8N. O render acontece depois, via gate
 *    de brand / callback do N8N (assíncrono).
 */
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { generateBlueprintAndReference } from "./architect/generate.service"
import { dispatchEmailCopyWebhook } from "../services/email-copy-webhook.service"

const log = logger.child("TestGeneration")

// Status de geração EM VOO (não-terminais). Um teste completo disparado
// enquanto o email está num desses estados com atividade recente abriria
// uma segunda geração paralela (incidente Luxe Lift 27/07: o gateway corta
// a request aos 300s, o operador reclica e nasce um pipeline duplicado).
const IN_FLIGHT_STATUSES = [
  "pending",
  "in_progress",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "image_done",
  "qa_running",
]

// Janela de dedup: atividade mais antiga que isso é considerada travada e
// o re-teste é permitido (o watchdog cuida de matar o que ficou pra trás).
const GENERATION_DEDUP_WINDOW_MIN = (() => {
  const env = Number(process.env.GENERATION_DEDUP_WINDOW_MIN)
  return Number.isFinite(env) && env > 0 ? env : 10
})()

export interface TestGenerationInput {
  storeId: string
  flowId: string
  emailId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy: string
  /**
   * Roda SÓ da fase 2 em diante (imagem → HTML → QA), reusando o
   * blueprint/reference persistidos e a copy existente — sem repagar
   * Montador/Blueprint. Requer copy no email (erro se não houver).
   */
  phase2Only?: boolean
  /**
   * TESTE COMPLETO: roda a fase 1 fresca (Curador + Montador + Blueprint),
   * dispara copy NOVA via n8n só deste email e, ao chegar copy_ready, a
   * fase 2 (imagem → HTML → QA) roda automática em modo relaxado (sem gate
   * de identidade). Fluxo assíncrono: a request retorna "dispatched" e o
   * email progride copy_generating → copy_ready → rendering → ready.
   */
  fullPipeline?: boolean
  /**
   * Contexto livre do operador (aba Testar → "Objetivo / contexto").
   * Vai APENAS pro payload da copy (chave aditiva `test_context`) — NÃO
   * pro Architect: a arquitetura/blueprint/variantes são persistidos em
   * store_email_references/store_email_blueprints (linha de PRODUÇÃO,
   * reusada pelo dispatch), então enviesá-los com o contexto de teste
   * vazaria pra copies de produção. A copy é regenerada a cada dispatch,
   * então recebê-lo ali é seguro.
   */
  testContext?: string
}

export interface TestGenerationResult {
  status: "running" | "dispatched" | "error"
  path: "with_copy" | "without_copy"
  hasCopy: boolean
  error?: string
  batchId: string
  emailId: string
  /**
   * True quando o path com_copy preparou e marcou email pronto pra
   * phase2 — o route handler deve disparar `runPhase2InBackground`
   * via `after()` antes de devolver a response. Polling em
   * /generation-status/{batchId} traz status final.
   */
  triggerPhase2?: boolean
  /**
   * True quando o phase2 deve rodar com precheck relaxado (TestTab).
   * UI mostra banner informativo de que brand pode estar incompleta.
   */
  relaxedBrand?: boolean
  /**
   * True quando o disparo foi o teste completo (fase 1 + copy n8n + fase 2).
   * O front usa pra fazer polling do batch mesmo com status "dispatched"
   * (a copy vem async e a fase 2 dispara sozinha ao chegar copy_ready).
   */
  fullPipeline?: boolean
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

  // ── TESTE COMPLETO ──────────────────────────────────────────────────
  // Fase 1 (Architect) síncrona → dispara copy NOVA via n8n só deste email
  // → marca auto_phase2_relaxed pra fase 2 disparar sozinha no copy_ready.
  if (input.fullPipeline === true) {
    log.info("test.full_pipeline.start", { storeId, emailId, batchId })
    const admin = createAdminClient()

    // 0) DEDUP: se o email já está numa geração em voo com atividade
    //    recente, NÃO abre outra. A fase 1 é síncrona (~4-5min) e o
    //    gateway pode cortar a conexão antes dela terminar — o trabalho
    //    continua no servidor, e um reclique abriria pipeline duplicado.
    const { data: current } = await admin
      .from("email_flow_emails")
      .select("status, generation_batch_id, updated_at, auto_phase2_relaxed")
      .eq("id", emailId)
      .maybeSingle()
    // Em voo = status não-terminal de geração OU claim de full pipeline
    // ainda ativo (auto_phase2_relaxed cobre a janela da fase 1 síncrona,
    // quando o status ainda é draft/ready — o claim abaixo seta o flag e o
    // callback do n8n/o catch de erro o limpam).
    const inFlight =
      current != null &&
      (IN_FLIGHT_STATUSES.includes(current.status as string) ||
        current.auto_phase2_relaxed === true)
    if (current && inFlight) {
      const updatedAt = current.updated_at
        ? new Date(current.updated_at as string).getTime()
        : 0
      const ageMs = Date.now() - updatedAt
      if (ageMs < GENERATION_DEDUP_WINDOW_MIN * 60_000) {
        log.warn("test.full_pipeline.dedup_blocked", {
          storeId,
          emailId,
          status: current.status,
          activeBatchId: current.generation_batch_id,
          ageMs,
        })
        return {
          status: "error",
          path: "without_copy",
          hasCopy: false,
          error:
            "generation_in_progress: já existe uma geração em andamento para este email " +
            `(status ${current.status}). Aguarde ela terminar ou falhar antes de re-testar.`,
          batchId,
          emailId,
        }
      }
    }

    // 1) CLAIM antes da fase 1: batch + flag de auto-fase2 relaxada. Setado
    //    AQUI (e não depois da fase 1) para que o dedup acima enxergue a
    //    geração em voo durante os ~5min síncronos do Architect, e porque o
    //    flag atravessa o callback async do n8n (sem corrida com o callback,
    //    que pode chegar rápido).
    //    IMPORTANTE (acoplamento com o dispatch_batch_id): o dispatch lê o
    //    generation_batch_id do email e o ecoa no payload — o callback
    //    descarta copy cujo batch divirja do vigente. O claim ANTES do
    //    dispatch é o que faz a copy DESTE teste voltar com o batch certo.
    //    Em falha (fase 1 ou dispatch), o rollback abaixo restaura o estado
    //    anterior — senão uma copy legítima em voo do batch antigo seria
    //    descartada como stale e a flag da geração original seria apagada.
    const prevBatchId = (current?.generation_batch_id as string | null) ?? null
    const prevRelaxed = current?.auto_phase2_relaxed === true
    const rollbackClaim = async () => {
      await admin
        .from("email_flow_emails")
        .update({
          auto_phase2_relaxed: prevRelaxed,
          generation_batch_id: prevBatchId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailId)
        // Só desfaz se o claim DESTE teste ainda é o vigente — se o callback
        // ou outra geração já moveu o batch, não sobrescreve.
        .eq("generation_batch_id", batchId)
    }
    await admin
      .from("email_flow_emails")
      .update({
        auto_phase2_relaxed: true,
        generation_batch_id: batchId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)

    // 2) Fase 1: Curador + Montador + Blueprint (força reescrita da estrutura).
    try {
      await generateBlueprintAndReference({
        storeId,
        flowType,
        emailNumber,
        batchId,
        triggeredBy,
        force: true,
      })
    } catch (err) {
      // Sem fase 1 não haverá dispatch: desfaz o claim (batch + flag).
      await rollbackClaim()
      return {
        status: "error",
        path: "without_copy",
        hasCopy: false,
        error: `Falha na fase 1 (Architect): ${
          err instanceof Error ? err.message : String(err)
        }`,
        batchId,
        emailId,
      }
    }

    // 3) Dispara copy NOVA pro n8n, restrita a este email.
    const dispatch = await dispatchEmailCopyWebhook(storeId, {
      triggerSource: "test_full_pipeline",
      flowIds: [flowId],
      emailIds: [emailId],
      triggeredBy,
      // Copy NOVA do email INTEIRO: sem isso o mixed-mode enviava só os
      // blocos que o reconcile criou vazios e preservava a copy antiga
      // dos demais (Luxe Lift w#3: 1 bloco de 12 foi pro n8n).
      regenerateAll: true,
      testContext: input.testContext,
    })

    if (!dispatch.ok) {
      // Sem copy a caminho: desfaz o claim (batch + flag).
      await rollbackClaim()
      return {
        status: "error",
        path: "without_copy",
        hasCopy: false,
        error: `Falha ao disparar copy no n8n: ${dispatch.reason ?? "desconhecido"}`,
        batchId,
        emailId,
      }
    }

    log.info("test.full_pipeline.dispatched", { storeId, emailId, batchId })
    return {
      status: "dispatched",
      path: "without_copy",
      hasCopy: false,
      batchId,
      emailId,
      relaxedBrand: true,
      fullPipeline: true,
    }
  }

  const hasCopy = await emailHasCopy(emailId)
  const phase2Only = input.phase2Only === true
  log.info("test.start", { storeId, emailId, batchId, hasCopy, phase2Only })

  // Fase 2 exige copy — sem ela não há o que renderizar.
  if (phase2Only && !hasCopy) {
    return {
      status: "error",
      path: "without_copy",
      hasCopy: false,
      error:
        "Email sem copy — 'só fase 2' precisa de copy existente. Use a geração completa.",
      batchId,
      emailId,
    }
  }

  if (hasCopy) {
    // COM copy: Montador + Blueprint síncronos (~10-20s, cabem em 300s).
    // O render (image + html + qa) é disparado em background pelo route
    // handler via `after(runPhase2InBackground)` — sem isso, image (~166s)
    // + html (~90s) estouram o maxDuration da Vercel.
    //
    // phase2Only: NÃO re-roda o Architect — reusa store_email_references/
    // store_email_blueprints (ou fallback global) exatamente como estão,
    // sem repagar Montador/Blueprint.
    if (phase2Only) {
      log.info("test.phase2_only.skip_architect", { storeId, emailId, batchId })
    } else {
      await generateBlueprintAndReference({
        storeId,
        flowType,
        emailNumber,
        batchId,
        triggeredBy,
      })
    }

    // Reset de status pra `copy_ready` pra que phase2 possa fazer claim
    // atômico. Cobre re-execução de email que ficou `failed` ou já
    // chegou em `ready` num teste anterior. Persiste batchId pra que
    // /generation-status leia os runs corretos.
    const admin = createAdminClient()
    await admin
      .from("email_flow_emails")
      .update({
        status: "copy_ready",
        generation_batch_id: batchId,
        rendering_started_at: null,
        qa_started_at: null,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)

    log.info("test.with_copy.ready_for_phase2", { storeId, emailId, batchId })
    return {
      status: "running",
      path: "with_copy",
      hasCopy: true,
      batchId,
      emailId,
      triggerPhase2: true,
      relaxedBrand: true,
    }
  }

  // SEM copy: o dispatch já faz Montador → Blueprint → seed → N8N.
  // O render (imagem/HTML/QA) virá depois, via gate de brand / callback.
  await dispatchEmailCopyWebhook(storeId, {
    triggerSource: "manual_store_button",
    flowIds: [flowId],
    triggeredBy,
    testContext: input.testContext,
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
