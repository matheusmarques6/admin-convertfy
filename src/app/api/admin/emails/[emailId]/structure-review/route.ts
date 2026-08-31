/**
 * Revisão humana da estrutura de um email (migration 20261088).
 *
 * `POST` recebe a ordem nova dos blocos, os removidos e a justificativa, e
 * faz as três coisas de uma vez:
 *
 *   1. aplica a ordem em `email_blocks` (posições 1..N; removido é DELETE);
 *   2. move as REGIÕES correspondentes dentro de `html_marked` e re-deriva
 *      `html` sem os marcadores — é o que faz o email mudar de verdade, e
 *      não só o contrato de copy;
 *   3. grava a revisão, que os agentes leem em `<revisao_humana>` na próxima
 *      geração deste email.
 *
 * Email sem `html_marked` (gerado antes da migration 20261087, ou HTML
 * colado por fora) NÃO é erro: a ordem e a revisão salvam, o HTML fica como
 * está, e a resposta diz isso em `html_atualizado: false` para a tela avisar
 * em vez de mentir um "salvo".
 *
 * `GET` devolve as revisões ativas aplicáveis — usado pelo painel e pelos
 * testes de ponta a ponta.
 *
 * Auth: `requireAuth` (mesma régua das demais rotas de `/api/admin/email*`).
 * RLS sem policies = service-role only; esta rota É o caminho.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  BlockRegionsError,
  removeRegions,
  renumberMarkers,
  reorderRegions,
  sequenceOf,
} from "@/lib/agents/html/block-regions"
import { stripCfyBlockMarkers } from "@/lib/agents/html/post-process"
import { buildQaBlockViews } from "@/lib/agents/html/qa-views"

const log = logger.child("EmailStructureReview")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  /** Ids dos blocos que FICAM, na ordem desejada. */
  ordem: z.array(z.string().uuid()).min(1),
  /** Ids dos blocos removidos. */
  removidos: z.array(z.string().uuid()).default([]),
  justificativa: z.string().trim().min(1).max(4000),
  alcance: z.enum(["este_email", "todo_email_do_flow"]),
  leitores: z
    .object({
      estruturador: z.boolean().default(true),
      curador: z.boolean().default(false),
      montador: z.boolean().default(false),
    })
    .default({ estruturador: true, curador: false, montador: false }),
})

interface BlocoRow {
  id: string
  position: number
  block_type: string
}

/** Contexto do email: loja, flow, número e os dois HTMLs. */
async function loadEmail(admin: ReturnType<typeof createAdminClient>, emailId: string) {
  const { data, error } = await admin
    .from("email_flow_emails")
    .select(
      "id, number, html, html_marked, flow:email_flows!inner(id, store_id, flow_type)",
    )
    .eq("id", emailId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ValidationError("Email não encontrado")
  const row = data as unknown as {
    id: string
    number: number
    html: string | null
    html_marked: string | null
    flow: { id: string; store_id: string; flow_type: string }
  }
  return row
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const email = await loadEmail(admin, emailId)
    const { data, error } = await admin
      .from("email_structure_reviews")
      .select("*")
      .eq("is_active", true)
      .eq("flow_type", email.flow.flow_type)
      .eq("email_number", email.number)
    if (error) throw error

    const revisoes = (data ?? []).filter(
      (r: Record<string, unknown>) =>
        r.alcance === "todo_email_do_flow" || r.store_id === email.flow.store_id,
    )
    return successResponse(request, {
      revisoes,
      html_editavel: Boolean(email.html_marked),
    })
  } catch (error) {
    log.error("GET structure review error", error)
    return errorResponse(request, error, "structure-review-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = postSchema.parse(await request.json())
    if (
      !body.leitores.estruturador &&
      !body.leitores.curador &&
      !body.leitores.montador
    ) {
      throw new ValidationError(
        "Escolha pelo menos um agente para receber esta revisão",
      )
    }

    const email = await loadEmail(admin, emailId)

    const { data: blocosData, error: blocosErr } = await admin
      .from("email_blocks")
      .select("id, position, block_type")
      .eq("email_id", emailId)
      .order("position", { ascending: true })
    if (blocosErr) throw blocosErr
    const blocos = (blocosData ?? []) as BlocoRow[]

    // A ordem + os removidos precisam ser uma PARTIÇÃO exata dos blocos do
    // email. Aceitar lista parcial deixaria bloco fora da renumeração e a
    // posição viraria um buraco silencioso.
    const idsAtuais = new Set(blocos.map((b) => b.id))
    const informados = [...body.ordem, ...body.removidos]
    const semDuplicata = new Set(informados).size === informados.length
    if (
      !semDuplicata ||
      informados.length !== blocos.length ||
      informados.some((id) => !idsAtuais.has(id))
    ) {
      throw new ValidationError(
        "A ordem enviada não corresponde aos blocos deste email — recarregue a página",
      )
    }

    const porId = new Map(blocos.map((b) => [b.id, b]))
    const ordemAnterior = blocos.map((b) => b.block_type)
    const ordemNova = body.ordem.map((id) => porId.get(id)!.block_type)
    const removidosTipos = body.removidos.map((id) => porId.get(id)!.block_type)

    // ── 1. HTML ────────────────────────────────────────────────────────
    // O mapa bloco → região usa `buildQaBlockViews`: é o MESMO casamento
    // (sequencial por tipo, em ordem de documento) que o QA já faz. Ter dois
    // mapeamentos para a mesma coisa é como um deles fica errado sem ninguém
    // perceber.
    let htmlAtualizado = false
    let htmlNovo: string | null = null
    let blocosSemRegiao: string[] = []
    if (email.html_marked) {
      try {
        const views = buildQaBlockViews(email.html_marked, blocos)
        const indicePorBloco = new Map(
          views
            .filter((v) => v.block_id)
            .map((v) => [v.block_id as string, v.indice]),
        )
        blocosSemRegiao = [...body.ordem, ...body.removidos]
          .filter((id) => !indicePorBloco.has(id))
          .map((id) => porId.get(id)!.block_type)

        let doc = email.html_marked
        const indicesRemovidos = body.removidos
          .map((id) => indicePorBloco.get(id))
          .filter((i): i is number => i != null)
        if (indicesRemovidos.length > 0) {
          doc = removeRegions(doc, indicesRemovidos)
        }
        const ordemIndices = body.ordem
          .map((id) => indicePorBloco.get(id))
          .filter((i): i is number => i != null)
        // Só reordena quando TODAS as regiões restantes estão endereçadas —
        // `reorderRegions` exige permutação exata e recusa o resto.
        if (ordemIndices.length === sequenceOf(doc).length) {
          doc = reorderRegions(doc, ordemIndices)
        }
        doc = renumberMarkers(doc)

        // NÃO grava aqui. O documento vai junto com as posições e a revisão,
        // na mesma transação (ver a chamada da RPC abaixo). Gravar antes era
        // o que deixava o email com duas verdades quando a renumeração
        // estourava — incidente 28/08.
        htmlNovo = doc
        htmlAtualizado = true
      } catch (err) {
        // Documento que não pode ser editado com segurança não vira
        // documento remendado: a ordem e a revisão seguem, o HTML fica.
        if (err instanceof BlockRegionsError) {
          log.warn("structure_review.html_nao_editavel", {
            emailId,
            code: err.code,
            error: err.message,
          })
        } else {
          throw err
        }
      }
    }

    // ── 2 + 3. Blocos, documento e revisão — TUDO numa transação ───────
    //
    // Uma chamada só. Até 28/08 isto era um `for` de UPDATEs de `position`
    // e, como `email_blocks` tem UNIQUE (email_id, position), mover o 2º
    // bloco para a 1ª posição colidia com o 1º, que ainda estava lá: QUALQUER
    // troca de ordem falhava com "Registro duplicado". E o HTML já tinha sido
    // gravado, então o email ficava com o documento na ordem nova e os blocos
    // na antiga.
    //
    // A função renumera em duas passadas (faixa +1000), grava o documento por
    // último e insere a revisão desativando a anterior do alvo. Ou tudo muda,
    // ou nada muda.
    const storeId =
      body.alcance === "este_email" ? email.flow.store_id : null

    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "aplicar_estrutura_email",
      {
        p_email_id: emailId,
        p_ordem: body.ordem,
        p_removidos: body.removidos,
        p_html: htmlNovo ? stripCfyBlockMarkers(htmlNovo) : null,
        p_html_marked: htmlNovo,
        p_revisao: {
          alcance: body.alcance,
          store_id: storeId,
          flow_type: email.flow.flow_type,
          email_number: email.number,
          ordem_anterior: ordemAnterior,
          ordem_nova: ordemNova,
          blocos_removidos: removidosTipos,
          justificativa: body.justificativa,
          para_estruturador: body.leitores.estruturador,
          para_curador: body.leitores.curador,
          para_montador: body.leitores.montador,
          created_by: user.id,
        },
      },
    )
    if (rpcErr) throw rpcErr
    const revisaoId = (rpcData as { revisao_id?: string } | null)?.revisao_id

    const { data: revisao } = await admin
      .from("email_structure_reviews")
      .select("*")
      .eq("id", revisaoId ?? "")
      .maybeSingle()

    log.info("structure_review.salva", {
      emailId,
      alcance: body.alcance,
      htmlAtualizado,
      removidos: removidosTipos.length,
      blocosSemRegiao: blocosSemRegiao.length,
    })

    return successResponse(request, {
      revisao,
      ordem: ordemNova,
      html_atualizado: htmlAtualizado,
      blocos_sem_regiao: blocosSemRegiao,
    })
  } catch (error) {
    log.error("POST structure review error", error)
    return errorResponse(request, error, "structure-review-post")
  }
}
