/**
 * POST /api/admin/stores/[id]/generate-email
 *
 * Gera um email individual usando a pipeline de IA.
 * Body: { flowId, emailId, flowType, emailNumber }
 *
 * maxDuration: 500s — a fase 1 do teste completo (Seletor → Estruturador →
 * Curador → Blueprint) é síncrona e passou de 280s com o Seletor ligado
 * (08/09), contra os 300s de antes: qualquer retry estourava o gateway e o
 * 504 escondia a causa real da falha. 500 exige Fluid Compute (Vercel Pro),
 * o mesmo que as rotas internas da fase 2 já usam em 800 — se o deploy
 * falhar na validação, ligar em Project Settings → Functions.
 */

import { NextRequest, after } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { runTestGeneration } from "@/lib/agents/test-generation.service"
import { runPhase2InBackground } from "@/lib/agents/phase2-runner.service"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"

const log = logger.child("GenerateEmail")

export const dynamic = "force-dynamic"
export const maxDuration = 500

const bodySchema = z.object({
  flowId: z.string().uuid(),
  emailId: z.string().uuid(),
  flowType: z.string().min(1),
  emailNumber: z.number().int().min(1),
  // Só fase 2 (imagem → HTML → QA): reusa blueprint/reference/copy
  // existentes sem repagar Montador/Blueprint. Requer copy no email.
  phase2_only: z.boolean().optional().default(false),
  // Teste COMPLETO: fase 1 (Architect) → copy nova via n8n só deste email
  // → fase 2 relaxada automática ao chegar copy_ready. Assíncrono.
  full_pipeline: z.boolean().optional().default(false),
  // Contexto livre do operador (aba Testar → "Objetivo / contexto"):
  // flui pro Architect via {{outline_guidance}} e pro payload da copy.
  test_context: z.string().max(2000).optional(),
  /**
   * Batch escolhido pelo CLIENTE (08/09). Sem ele, o id só nascia aqui e a
   * tela só o descobria quando o POST voltava — na fase 1 síncrona, minutos
   * depois. Nesse intervalo o polling de status ficava desligado e a
   * timeline não tinha o que perguntar: os agentes fechavam no servidor e a
   * tela só se preenchia no fim.
   *
   * Com o id vindo do clique, a tela acompanha desde o primeiro segundo. É
   * só um agrupador de telemetria numa rota autenticada de admin — o uuid
   * valida a forma, e um valor repetido só mistura runs na própria tela de
   * quem mandou.
   */
  batch_id: z.string().uuid().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await assertCanManagePrompts(createAdminClient(), user.id)

    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const batchId = parsed.batch_id ?? crypto.randomUUID()

    log.info("generate-email.start", {
      storeId,
      emailId: parsed.emailId,
      batchId,
      triggeredBy: user.id,
    })

    const result = await runTestGeneration({
      storeId,
      flowId: parsed.flowId,
      emailId: parsed.emailId,
      flowType: parsed.flowType,
      emailNumber: parsed.emailNumber,
      triggeredBy: user.id,
      batchId,
      phase2Only: parsed.phase2_only,
      fullPipeline: parsed.full_pipeline,
      testContext: parsed.test_context,
    })

    // Path with_copy: dispara phase2 em background.
    //
    // Preferência: fetch interno pro split run-phase2-image →
    // run-phase2-html-qa, cada um com seu próprio orçamento de 300s.
    // Sem isso, o monolito (image ~250s + html ~90s + qa ~15s) estoura
    // o maxDuration=300s da Vercel.
    //
    // Fallback (sem INTERNAL_SECRET configurado, ou fetch falhando):
    // chama runPhase2InBackground direto. Funciona mas tem risco de
    // timeout no pior caso — preferência clara é configurar
    // INTERNAL_SECRET em prod.
    if (result.triggerPhase2) {
      const secret = process.env.INTERNAL_SECRET
      const baseUrl = (
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
        `https://${request.headers.get("host") ?? "localhost:3000"}`
      ).replace(/\/$/, "")

      const fallbackDirect = async (reason: string) => {
        log.warn("generate-email.phase2.fallback_direct", {
          emailId: result.emailId,
          reason,
        })
        try {
          await runPhase2InBackground({
            storeId,
            emailId: result.emailId,
            triggeredBy: user.id,
            relaxedBrandCheck: result.relaxedBrand === true,
          })
        } catch (err) {
          log.error("generate-email.phase2.fallback_direct_error", err)
        }
      }

      after(async () => {
        if (!secret) {
          await fallbackDirect("no_internal_secret")
          return
        }
        try {
          const resp = await fetch(
            `${baseUrl}/api/internal/run-phase2-image/${result.emailId}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": secret,
              },
              body: JSON.stringify({
                storeId,
                triggeredBy: user.id,
                relaxedBrandCheck: result.relaxedBrand === true,
              }),
            },
          )
          if (!resp.ok) {
            await fallbackDirect(`fetch_non_ok_${resp.status}`)
          }
        } catch (err) {
          log.error("generate-email.phase2.dispatch_error", err)
          await fallbackDirect("fetch_error")
        }
      })
    }

    return successResponse(request, result)
  } catch (error) {
    log.error("generate-email.error", error)
    return errorResponse(request, error, "generate-email")
  }
}
