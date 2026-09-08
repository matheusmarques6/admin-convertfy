/**
 * Execução MANUAL do pipeline — criar, cancelar.
 *
 * POST   /api/admin/agents/executions/manual  → cria a execução com os
 *        overrides (desativar / pinar / parar / retomar) e diz qual disparo
 *        a tela deve fazer em seguida.
 * PATCH  /api/admin/agents/executions/manual  → cancela a execução viva de
 *        um e-mail (libera o índice único e o watchdog volta a cuidar dele).
 *
 * ── Por que a criação e o disparo são DUAS chamadas ───────────────────
 *
 * O disparo já existe e é grande: `POST /api/admin/stores/[id]/generate-email`
 * resolve fase 1 síncrona, escolhe entre o split interno da fase 2 e o
 * fallback direto, e trata INTERNAL_SECRET ausente. Reimplementar isso aqui
 * criaria um segundo caminho de disparo que divergiria do primeiro na
 * primeira mudança. Então esta rota só PREPARA o terreno — grava a execução
 * e o estágio de retomada — e devolve `dispatch` dizendo o que chamar.
 *
 * O runner encontra a execução sozinho, pelo `email_id`
 * (`contextoDaExecucao`): nenhum parâmetro novo atravessa as três
 * fronteiras de processo do pipeline.
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate do resto
 * do Estúdio.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import {
  carregarExecucaoManualViva,
  criarExecucaoManual,
  finalizarExecucao,
  snapshotDeConfig,
} from "@/lib/agents/execucao/execution.service"
import {
  ESTAGIO_ANTES,
  resumirOverrides,
  type ExecutionOverrides,
} from "@/lib/agents/execucao/overrides"
import { logger } from "@/lib/logger"

const log = logger.child("ExecucaoManualRoute")

export const dynamic = "force-dynamic"

const pinSchema = z.object({ kind: z.literal("reusar") })

const bodySchema = z.object({
  email_id: z.string().uuid(),
  overrides: z
    .object({
      disabled: z.array(z.string().min(1)).max(30).optional(),
      pinned: z.record(z.string().min(1), pinSchema).optional(),
      stop_after: z.string().min(1).nullable().optional(),
      start_from: z.string().min(1).nullable().optional(),
    })
    .default({}),
})

async function assertPodeGerenciar(userId: string) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, tags")
    .eq("id", userId)
    .maybeSingle()
  const actor = {
    id: userId,
    role: (profile as { role?: string | null } | null)?.role ?? null,
    tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
  }
  if (!canManagePrompts(actor)) throw new ForbiddenError()
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await assertPodeGerenciar(user.id)

    const parsed = bodySchema.parse(await request.json())
    const overrides = parsed.overrides as ExecutionOverrides

    const admin = createAdminClient()
    const { data: email } = await admin
      .from("email_flow_emails")
      .select("id, flow_id, flow:email_flows!inner(store_id)")
      .eq("id", parsed.email_id)
      .maybeSingle()
    if (!email) {
      return errorResponse(
        request,
        new Error("E-mail não encontrado"),
        "execucao-manual-post",
      )
    }
    const embed = (email as unknown as {
      flow?: { store_id: string } | Array<{ store_id: string }>
    }).flow
    const storeId = (Array.isArray(embed) ? embed[0] : embed)?.store_id
    if (!storeId) {
      return errorResponse(
        request,
        new Error("E-mail sem loja vinculada"),
        "execucao-manual-post",
      )
    }

    const criada = await criarExecucaoManual({
      storeId,
      flowId: (email as { flow_id: string | null }).flow_id,
      emailId: parsed.email_id,
      overrides,
      triggeredBy: user.id,
      configSnapshot: await snapshotDeConfig(storeId),
    })

    if (!criada.ok) {
      if (criada.kind === "recusado") {
        // 422 com a LISTA, não uma mensagem só: a tela mostra nó por nó o
        // que falta, e é isso que transforma "não deu" em "pine o Curador
        // ou reative-o".
        return Response.json(
          {
            error: "Overrides recusados",
            recusas: criada.recusas,
          },
          { status: 422 },
        )
      }
      if (criada.kind === "conflito") {
        return Response.json(
          {
            error:
              "Já existe uma execução manual em curso para este e-mail. Cancele-a antes de abrir outra.",
            viva: criada.viva,
          },
          { status: 409 },
        )
      }
      return errorResponse(
        request,
        new Error(criada.mensagem),
        "execucao-manual-post",
      )
    }

    // `start_from` vira `html_pipeline_stage` — o mecanismo de resume que a
    // cadeia de formatação já tem. Gravado AQUI, e não no runner, porque é
    // pré-condição do disparo: se a cadeia começar antes disso, ela
    // recomeça da hero e reescreve o HTML que se quer preservar.
    if (overrides.start_from && overrides.start_from in ESTAGIO_ANTES) {
      const estagio = ESTAGIO_ANTES[overrides.start_from]
      const { error } = await admin
        .from("email_flow_emails")
        .update({ html_pipeline_stage: estagio })
        .eq("id", parsed.email_id)
      if (error) {
        log.error("execucao.estagio_nao_gravado", {
          emailId: parsed.email_id,
          estagio,
          error,
        })
        await finalizarExecucao(
          criada.executionId,
          "error",
          "não foi possível gravar o estágio de retomada",
        )
        return errorResponse(
          request,
          new Error("Não foi possível preparar a retomada"),
          "execucao-manual-post",
        )
      }
    }

    // Que disparo a tela deve fazer: com a copy pinada, a fase 2 basta
    // (reusa copy e fase 1); sem pin de copy, é pipeline completo.
    const copyPinada = Boolean(
      overrides.pinned?.copy ?? overrides.pinned?.copy_dispatch,
    )

    log.info("execucao.manual_pronta", {
      executionId: criada.executionId,
      emailId: parsed.email_id,
      overrides: resumirOverrides(overrides),
      dispatch: copyPinada ? "phase2" : "full",
    })

    return successResponse(request, {
      execution_id: criada.executionId,
      dispatch: copyPinada ? "phase2" : "full",
      resumo: resumirOverrides(overrides),
    })
  } catch (error) {
    log.error("POST execução manual", error)
    return errorResponse(request, error, "execucao-manual-post")
  }
}

const patchSchema = z.object({
  email_id: z.string().uuid(),
  action: z.literal("cancelar"),
})

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await assertPodeGerenciar(user.id)

    const parsed = patchSchema.parse(await request.json())
    const viva = await carregarExecucaoManualViva(parsed.email_id)
    if (!viva) {
      return successResponse(request, { cancelada: false, motivo: "nenhuma viva" })
    }
    await finalizarExecucao(viva.id, "cancelled")
    log.info("execucao.cancelada", { executionId: viva.id, por: user.id })
    return successResponse(request, { cancelada: true, execution_id: viva.id })
  } catch (error) {
    log.error("PATCH execução manual", error)
    return errorResponse(request, error, "execucao-manual-patch")
  }
}
