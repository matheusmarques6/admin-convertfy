/**
 * POST /api/webhooks/n8n/email-copy
 *
 * Callback streaming do n8n: cada email completo dispara um POST aqui.
 * Persiste subject/preheader em email_flow_emails e content em email_blocks,
 * marca status = 'copy_ready'.
 *
 * Story AE-3:
 *  - Idempotencia: callbacks duplicados (status >= copy_ready) viram no-op
 *  - copy_ready_at = now() na transicao
 *
 * Story AE-19 (split callback):
 *  - O callback NAO dispara mais fase 2 diretamente. O email fica em
 *    copy_ready aguardando o GATE 2 (designer confirmar a identidade
 *    visual). Quando store_brand_identity.confirmed_at vira NULL -> NOT NULL,
 *    o trigger fn_on_brand_identity_confirmed enfileira um sinal
 *    signal_type='render' em email_generation_queue_signals e o watchdog
 *    (front 1) chama runPhase2InBackground pra cada email em copy_ready.
 */

import { NextRequest, after } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import {
  errorResponse,
  successResponse,
  AppError,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { findFieldDeviations } from "@/lib/email-workspace/copy-spec"
import {
  alvosDeEncurtamento,
  aplicarReescritas,
  type BlocoComContrato,
} from "@/lib/email-workspace/copy-fit"
import { runCopyFit, loadCopyFitMode } from "@/lib/agents/chains/copy-fit.chain"
import { logGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"
import type { InputSummaryItem } from "@/lib/agents/shared/prompt-provenance"
import { normalizeCopyEnvelope } from "@/lib/email-workspace/copy-envelope"
import type { BlueprintBlockField } from "@/types/email-generation"
import { resolveBrandTokens } from "@/lib/agents/html/brand-guards"
import { isTextOnlyEmail } from "@/lib/agents/architect/blueprint-loader"
import {
  checkBatchTerminal,
  runPhase2InBackground,
} from "@/lib/agents/phase2-runner.service"

const log = logger.child("N8nEmailCopy")

export const dynamic = "force-dynamic"

// Status que indicam que a fase 2 ja foi disparada (ou ja terminou).
// Callbacks duplicados nesses estados sao no-op idempotente.
// `failed` foi REMOVIDO: um email que falhou (ex.: timeout/credito hoje) DEVE
// aceitar uma copy nova quando o n8n volta — senao fica preso pra sempre.
const IDEMPOTENT_STATUSES = new Set([
  "copy_ready",
  "rendering",
  "qa_running",
  "ready",
])

const schema = z.object({
  store_id: z.string().uuid(),
  email_id: z.string().uuid(),
  // Eco do batch que originou o dispatch (chave aditiva no payload de
  // dispatch; docs/email-copy-payload-v2.md). Quando presente E divergente
  // do generation_batch_id vigente no email, a copy é STALE (dispatch
  // antigo) e vira no-op — não sobrescreve a geração mais nova. Opcional:
  // flows do n8n que ainda não ecoam o campo mantêm o comportamento atual.
  dispatch_batch_id: z.string().uuid().optional().nullable(),
  subject: z.string().min(1),
  preheader: z.string().optional().nullable(),
  blocks: z.array(
    z.object({
      block_id: z.string().uuid(),
      content: z.record(z.string(), z.unknown()),
    }),
  ),
  meta: z
    .object({
      model: z.string().optional(),
      tokens_input: z.number().int().nonnegative().optional(),
      tokens_output: z.number().int().nonnegative().optional(),
      duration_ms: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  // Lê o corpo BRUTO antes de validar — assim QUALQUER rejeição (secret /
  // schema / email não encontrado) deixa rastro nos logs do que o n8n mandou.
  // Sem isso a falha era invisível e a copy "sumia" sem explicação.
  const rawText = await request.text().catch(() => "")
  let rawJson: Record<string, unknown> = {}
  try {
    rawJson = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    /* corpo não-JSON */
  }
  log.info("email_copy.received", {
    has_secret_header: !!request.headers.get("x-webhook-secret"),
    body_keys: Object.keys(rawJson),
    store_id: rawJson.store_id ?? null,
    email_id: rawJson.email_id ?? null,
    blocks_count: Array.isArray(rawJson.blocks) ? rawJson.blocks.length : null,
    raw_len: rawText.length,
  })

  try {
    requireWebhookSecret(request)

    const validated = schema.safeParse(rawJson)
    if (!validated.success) {
      log.warn("email_copy.validation_failed", {
        store_id: rawJson.store_id ?? null,
        email_id: rawJson.email_id ?? null,
        body_keys: Object.keys(rawJson),
        issues: validated.error.issues.slice(0, 8),
      })
      throw new AppError("Payload do n8n inválido (schema email-copy)", 400)
    }
    const body = validated.data
    const admin = createAdminClient()

    // 1) Verifica email + flow pertencem à store (defesa contra spoofing)
    // `number` (não email_number!) + flow_type servem à checagem text_only.
    const { data: email, error: emailErr } = await admin
      .from("email_flow_emails")
      .select(
        "id, flow_id, status, number, generation_batch_id, auto_phase2_relaxed, flow:email_flows(store_id, flow_type)",
      )
      .eq("id", body.email_id)
      .maybeSingle()

    if (emailErr || !email) {
      log.warn("email_copy.email_not_found", {
        email_id: body.email_id,
        store_id: body.store_id,
        db_error: emailErr?.message ?? null,
      })
      throw new NotFoundError("Email")
    }

    const flow = Array.isArray(email.flow) ? email.flow[0] : email.flow
    const flowStoreId = (flow as { store_id?: string } | null)?.store_id
    if (flowStoreId !== body.store_id) {
      log.warn("email_copy.store_mismatch", {
        email_id: body.email_id,
        body_store_id: body.store_id,
        actual_store_id: flowStoreId ?? null,
      })
      throw new NotFoundError("Email não pertence a esta loja")
    }

    // Email "somente texto" (email_blueprints.text_only): não passa pela
    // fase 2 — a copy É o entregável e o email fica `ready` direto abaixo.
    const flowType = (flow as { flow_type?: string } | null)?.flow_type ?? ""
    const emailNumber = (email as { number?: number }).number ?? 0
    const textOnly = flowType
      ? await isTextOnlyEmail(admin, flowType, emailNumber)
      : false

    // Busca store_name pra sanitizar tokens de brand que o n8n entrega
    // nao-resolvidos (ex: headline: "Bem-vindo {{BRAND_NAME}}!"). A
    // sanitizacao acontece ANTES do UPDATE em email_blocks.content, pra
    // que o HTML Agent receba o nome real no payload.
    const { data: store } = await admin
      .from("client_stores")
      // org_id: kill-switch do encurtador (email_generation_settings é por org).
      // tom de voz: entrada do encurtador — reescrever sem ele troca a voz da
      // marca junto com o tamanho. Mesma cascata do resto do pipeline
      // (architect/generate.service:291).
      .select("store_name, org_id, tone_description, tom_de_voz")
      .eq("id", body.store_id)
      .maybeSingle()
    const brandName = (store?.store_name as string | undefined) || "Loja"
    const tomVoz =
      ((store?.tone_description as string | null) ??
        (store?.tom_de_voz as string | null)) ||
      ""

    // 1.4) Copy STALE: o payload ecoa o batch do dispatch que a originou.
    // Se o email já está numa geração MAIS NOVA (generation_batch_id
    // divergente), esta copy é de um dispatch antigo — aceitar aqui
    // sobrescreveria a geração vigente (incidente Luxe Lift 27/07, dois
    // pipelines paralelos). No-op 200, mesmo contrato do duplicate abaixo.
    const currentBatchId = (email.generation_batch_id as string | null) ?? null
    if (
      body.dispatch_batch_id &&
      currentBatchId &&
      body.dispatch_batch_id !== currentBatchId
    ) {
      log.warn("email_copy.stale_discarded", {
        email_id: body.email_id,
        dispatch_batch_id: body.dispatch_batch_id,
        current_batch_id: currentBatchId,
      })
      // Rastro nos logs de geração — sem isso a copy "some" sem explicação.
      // status='skipped' (NÃO success): o classificador do watchdog só conta
      // copy success como atividade, então o descarte não adia kills.
      await logGenerationRun({
        storeId: body.store_id,
        flowId: email.flow_id,
        emailId: body.email_id,
        batchId: currentBatchId ?? "",
        agent: "copy",
        status: "skipped",
        model: body.meta?.model ?? "n8n",
        inputSummary: [
          {
            rotulo: "Descarte",
            cls: "sistema",
            valor: `copy de um disparo antigo (${body.dispatch_batch_id ?? "sem batch"}) chegou depois de um novo (${currentBatchId ?? "sem batch"})`,
          },
          { rotulo: "Assunto descartado", cls: "upstream", valor: body.subject },
        ],
        parsedOutput: {
          skip_reason: "stale_dispatch_batch",
          dispatch_batch_id: body.dispatch_batch_id,
          current_batch_id: currentBatchId,
          subject: body.subject,
        },
      })
        .then(
          () => {},
          () => {},
        )
      return successResponse(request, {
        stale: true,
        dispatch_batch_id: body.dispatch_batch_id,
        current_batch_id: currentBatchId,
        email_id: body.email_id,
      })
    }

    // 1.5) AC AE-3.2 — idempotencia: callback duplicado para email ja
    // em status >= copy_ready vira no-op (200) sem disparar fase 2.
    const currentStatus = email.status as string | null
    if (currentStatus && IDEMPOTENT_STATUSES.has(currentStatus)) {
      log.info("webhook.duplicate_callback", {
        email_id: body.email_id,
        current_status: currentStatus,
      })
      return successResponse(request, {
        idempotent: true,
        current_status: currentStatus,
        email_id: body.email_id,
      })
    }

    // 2) PATCH email_flow_emails: subject, preheader, status, copy_ready_at.
    // Limpa tambem artefatos de uma fase 2 ANTERIOR (html/qa_issues/timers/
    // failure_reason). Sem isso, um email pre-GATE 2 que ja tinha html+imagem
    // renderizada antes da migration de brand-gate continuava exibindo a
    // imagem-fantasma no preview ate a nova fase 2 sobrescrever — re-disparar
    // a copy nao apagava nada. Agora cada copy nova zera o estado da fase 2.
    const nowIso = new Date().toISOString()
    const { error: updEmailErr } = await admin
      .from("email_flow_emails")
      .update({
        subject: body.subject,
        preheader: body.preheader ?? null,
        // Somente-texto: pula a fase 2 inteira (imagem + HTML agent) —
        // `ready` direto, html null; designers veem só o texto dos blocos.
        // ready_at em paridade com o phase2-runner (que o grava no claim).
        status: textOnly ? "ready" : "copy_ready",
        ...(textOnly ? { ready_at: nowIso } : {}),
        copy_ready_at: nowIso,
        updated_at: nowIso,
        html: null,
        qa_issues: [],
        failure_reason: null,
        rendering_started_at: null,
        qa_started_at: null,
      })
      .eq("id", body.email_id)
    if (updEmailErr) throw updEmailErr

    // 3) PATCH email_blocks.content por block_id (com sanitizacao de tokens).
    // `.select("id")` faz o update RETORNAR as linhas afetadas — assim
    // blocksWritten reflete escritas REAIS (antes contava mesmo quando o
    // block_id nao casava nenhuma linha, mascarando ids velhos pos-reseed).
    //
    // Fallback por POSICAO: se o block_id do n8n nao existe mais (estrutura
    // re-semeada depois do dispatch -> novos ids), casa a copy pelo bloco na
    // MESMA posicao (a ordem do array do callback espelha a ordem dos blocos).
    // Assim a copy nao se perde quando os ids mudam.
    //
    // Buscamos `content` junto pra fazer o cleanup do passo 2.5 numa unica
    // leitura.
    const { data: emailBlocksOrdered } = await admin
      .from("email_blocks")
      .select("id, content, block_type, fields")
      .eq("email_id", body.email_id)
      .order("position", { ascending: true })
    const orderedIds = (
      (emailBlocksOrdered ?? []) as Array<{ id: string; content: unknown }>
    ).map((r) => r.id)
    const orderedTypes = (
      (emailBlocksOrdered ?? []) as Array<{ block_type: string | null }>
    ).map((r) => r.block_type ?? "")
    // O BLOCO É O SCHEMA (20261065): o contrato de copy vem da LINHA, a
    // mesma que o dispatch enviou. Antes o callback refazia, por conta,
    // o casamento bloco↔blueprint por índice — a mesma heurística escrita
    // duas vezes, em dois arquivos, podendo divergir entre ida e volta.
    const orderedFields = (
      (emailBlocksOrdered ?? []) as Array<{ fields?: unknown }>
    ).map((r) => (Array.isArray(r.fields) ? (r.fields as BlueprintBlockField[]) : []))

    // 2.5) Limpa artefatos pre-GATE 2: chaves de imagem persistidas em
    // email_blocks.content por uma renderizacao ANTERIOR a confirmacao da
    // identidade visual. Pre-condicao: a nova copy vai ser escrita logo
    // abaixo. Mantemos `image_instruction` (input do designer, nao artefato).
    const IMAGE_ARTIFACT_KEYS = [
      "image_url",
      "image_alt",
      "image_last_generated_at",
      "image_last_prompt",
    ] as const
    let blocksCleared = 0
    for (const row of (emailBlocksOrdered ?? []) as Array<{
      id: string
      content: Record<string, unknown> | null
    }>) {
      const c = row.content
      if (!c || typeof c !== "object") continue
      const hasArtifact = IMAGE_ARTIFACT_KEYS.some((k) =>
        Object.prototype.hasOwnProperty.call(c, k),
      )
      if (!hasArtifact) continue
      const cleaned: Record<string, unknown> = { ...c }
      for (const k of IMAGE_ARTIFACT_KEYS) delete cleaned[k]
      const { error: clearErr } = await admin
        .from("email_blocks")
        .update({ content: cleaned })
        .eq("id", row.id)
      if (clearErr) {
        log.warn("email_copy.artifact_clear_failed", {
          email_id: body.email_id,
          block_id: row.id,
          error: clearErr.message,
        })
        continue
      }
      blocksCleared++
    }
    if (blocksCleared > 0) {
      log.info("email_copy.artifacts_cleared", {
        email_id: body.email_id,
        blocks_cleared: blocksCleared,
      })
    }

    let blocksWritten = 0
    let blocksByPosition = 0
    let blocksUnmatched = 0
    let blocksSanitized = 0
    // Blocos cuja copy veio embrulhada em `campos`/`fields` — o n8n espelhando
    // a estrutura do payload de ida. Contamos para saber quando o flow migrou.
    const blocksUnwrapped: Array<{ position: number; wrapper: string; keys: number }> = []
    for (let i = 0; i < body.blocks.length; i++) {
      const b = body.blocks[i]
      // O contrato é `content[key]`. Achata o embrulho ANTES de tudo: a
      // sanitização, a auditoria e a gravação precisam ver as chaves reais.
      const { content: flattened, report: envelope } = normalizeCopyEnvelope(
        b.content,
      )
      if (envelope.wrapper) {
        blocksUnwrapped.push({
          position: i,
          wrapper: envelope.wrapper,
          keys: envelope.unwrapped.length,
        })
      }
      const cleaned = resolveBrandTokens(flattened, brandName) as Record<string, unknown>
      // Compara com o achatado, não com o cru: desembrulhar não é sanitizar.
      if (JSON.stringify(cleaned) !== JSON.stringify(flattened)) blocksSanitized++

      // (a) tenta pelo block_id que o n8n mandou
      const { data: byId, error: blkErr } = await admin
        .from("email_blocks")
        .update({ content: cleaned })
        .eq("id", b.block_id)
        .eq("email_id", body.email_id)
        .select("id")
      if (blkErr) {
        log.warn("email_copy.block.update_failed", {
          email_id: body.email_id,
          block_id: b.block_id,
          error: blkErr.message,
        })
        continue
      }
      if (byId && byId.length > 0) {
        blocksWritten++
        continue
      }

      // (b) fallback: bloco na mesma posicao (i-esimo)
      const fallbackId = orderedIds[i]
      if (fallbackId) {
        const { data: byPos } = await admin
          .from("email_blocks")
          .update({ content: cleaned })
          .eq("id", fallbackId)
          .select("id")
        if (byPos && byPos.length > 0) {
          blocksByPosition++
          continue
        }
      }
      blocksUnmatched++
    }
    if (blocksByPosition > 0 || blocksUnmatched > 0) {
      log.warn("email_copy.blocks_fallback", {
        email_id: body.email_id,
        written_by_id: blocksWritten,
        written_by_position: blocksByPosition,
        unmatched: blocksUnmatched,
        total: body.blocks.length,
      })
    }
    blocksWritten += blocksByPosition

    // 3.5) Auditoria da copy contra o contrato do BLOCO (20261065): o mesmo
    // `fields` que o dispatch enviou, lido da própria linha. Observabilidade
    // apenas: NÃO rejeita nem trunca.
    //
    // Bloco sem `fields` na linha significa que o dispatch o enviou sem
    // contrato — erro de curadoria já registrado lá. Aqui não há o que
    // auditar, e inventar um copy_spec por tipo (o que se fazia antes) só
    // produzia desvio contra um contrato que ninguém pediu.
    const copyDeviations: Array<Record<string, unknown>> = []
    // Adesão ao contrato, em número. O desvio já era logado, mas só em log —
    // uma copy que volta INTEIRA fora do schema (o flow no vocabulário antigo:
    // `headline`/`cta` em vez de `hero_headline`/`hero_cta_2_label`) seguia
    // adiante sem deixar rastro consultável, e o email saía com as linhas
    // sem valor removidas. Aqui não muda nada na entrega: só passa a existir
    // o número que diz se o n8n já migrou.
    let keysRecebidas = 0
    let keysNoContrato = 0
    let charsTotal = 0
    const charsPorBloco: Array<{ position: number; type: string; chars: number }> = []
    const contratoPorBloco: Array<Record<string, unknown>> = []
    for (let i = 0; i < body.blocks.length; i++) {
      // Resolve o bloco real pelo block_id (o array do callback pode ser um
      // SUBCONJUNTO dos blocos do email — mixed mode envia só os vazios);
      // fallback pro índice i quando o id não existe mais (pós-reseed).
      const idxById = orderedIds.indexOf(body.blocks[i].block_id)
      const idx = idxById >= 0 ? idxById : i
      const blockType = orderedTypes[idx]
      if (!blockType) continue
      const fields = orderedFields[idx] ?? []
      // Mesma normalização da gravação: auditar o cru contaria `campos` como
      // a única chave recebida e reportaria 0% de adesão para uma copy que,
      // desembrulhada, cumpre o contrato inteiro.
      const { content } = normalizeCopyEnvelope(body.blocks[i].content)
      // Quanto de copy voltou, em caracteres. Não existia medida nenhuma de
      // TAMANHO no callback — só contagem de chaves —, e bloco que volta com
      // as chaves certas e valores vazios passava como 100% de adesão.
      const charsDoBloco = Object.values(content).reduce<number>(
        (n, v) => n + (typeof v === "string" ? v.length : 0),
        0,
      )
      charsPorBloco.push({ position: idx, type: blockType, chars: charsDoBloco })
      charsTotal += charsDoBloco
      if (fields.length === 0) {
        keysRecebidas += Object.keys(content).length
        contratoPorBloco.push({
          position: idx,
          type: blockType,
          esperados: 0,
          recebidos: Object.keys(content).length,
          no_contrato: 0,
        })
        copyDeviations.push({
          position: idx,
          type: blockType,
          source: "schema",
          kind: "sem_contrato",
          key: "",
        })
        continue
      }
      for (const d of findFieldDeviations(content, fields)) {
        copyDeviations.push({ position: idx, type: blockType, source: "schema", ...d })
      }
      // Chave que o n8n mandou e o contrato não previa: ou o flow está no
      // vocabulário antigo, ou inventou campo. É o contador que diz quando
      // o n8n terminou de migrar.
      const known = new Set(fields.map((f) => f.key))
      const recebidas = Object.keys(content)
      const noContrato = recebidas.filter((k) => known.has(k)).length
      keysRecebidas += recebidas.length
      keysNoContrato += noContrato
      contratoPorBloco.push({
        position: idx,
        type: blockType,
        esperados: fields.length,
        recebidos: recebidas.length,
        no_contrato: noContrato,
      })
      for (const k of recebidas) {
        if (known.has(k)) continue
        copyDeviations.push({
          position: idx,
          type: blockType,
          source: "schema",
          kind: "unknown_key",
          key: k,
        })
      }
    }
    const taxaContrato =
      keysRecebidas > 0
        ? Math.round((keysNoContrato / keysRecebidas) * 100)
        : null
    if (copyDeviations.length > 0) {
      log.warn("email_copy.copy_out_of_spec", {
        email_id: body.email_id,
        deviations: copyDeviations,
      })
    }
    // Nenhuma chave dentro do contrato = o flow ignorou o schema por inteiro.
    // Não é copy "parcial": é o vocabulário errado, e cada campo sem par vira
    // uma linha removida no HTML mais adiante.
    if (taxaContrato === 0) {
      log.error("email_copy.contract_ignored", {
        email_id: body.email_id,
        keys_recebidas: keysRecebidas,
        por_bloco: contratoPorBloco,
      })
    }

    // 3.6) Encurtador (migration 20261089). A auditoria acima só MEDIA: até
    // 28/08 o estouro virava `log.warn` + `parsed_output.desvios` e nada lia
    // o campo — a frase longa seguia pelo copy_merge e vazava da caixa no
    // email. Aqui ela passa a ser corrigida na fonte: `email_blocks.content`
    // é o registro da copy, então tudo a jusante (merge, tela, QA, export)
    // vê o texto que cabe, e o original fica no de_para do run `copy_fit`.
    //
    // INLINE de propósito, não em `after()`: a fase 2 sai por dois caminhos
    // (o after() do modo relaxado e o disparo diferido pelo cron/front), e só
    // esperando aqui os dois enxergam a copy já ajustada.
    const desviosPreFit = copyDeviations.length > 0 ? [...copyDeviations] : []
    let copyFitResumo: Record<string, unknown> | null = null
    const alvos = alvosDeEncurtamento(
      (emailBlocksOrdered ?? []) as BlocoComContrato[],
    )
    if (alvos.length > 0) {
      const modo = await loadCopyFitMode(store?.org_id as string | null)
      if (modo === "off") {
        log.info("email_copy.copy_fit_off", {
          email_id: body.email_id,
          alvos: alvos.length,
        })
      } else {
        const fit = await runCopyFit({
          storeId: body.store_id,
          batchId: currentBatchId ?? "",
          emailId: body.email_id,
          flowId: email.flow_id as string,
          brandName,
          tomVoz,
          alvos,
        })
        // Regrava só os blocos tocados; o resto do content passa intacto.
        const porBloco = new Map<string, Array<{ key: string; texto: string }>>()
        for (const a of fit.aceitas) {
          if (!a.block_id) continue
          const lista = porBloco.get(a.block_id) ?? []
          lista.push({ key: a.key, texto: a.texto })
          porBloco.set(a.block_id, lista)
        }
        let blocosRegravados = 0
        for (const [blockId, reescritas] of porBloco) {
          const atual = (emailBlocksOrdered ?? []).find(
            (r) => (r as { id: string }).id === blockId,
          ) as { content?: Record<string, unknown> | null } | undefined
          // Parte do content atual do BANCO, não do payload: a gravação de
          // cima já resolveu tokens de marca e desembrulhou o envelope.
          const { data: fresco } = await admin
            .from("email_blocks")
            .select("content")
            .eq("id", blockId)
            .maybeSingle()
          const base =
            (fresco?.content as Record<string, unknown> | null) ??
            atual?.content ??
            {}
          const { error: fitErr } = await admin
            .from("email_blocks")
            .update({ content: aplicarReescritas(base, reescritas) })
            .eq("id", blockId)
          if (fitErr) {
            log.warn("email_copy.copy_fit.update_failed", {
              email_id: body.email_id,
              block_id: blockId,
              error: fitErr.message,
            })
            continue
          }
          blocosRegravados++
        }
        // Os desvios do run `copy` passam a refletir o estado FINAL: o que
        // sobrou acima do limite é o que ainda precisa de olho humano.
        const corrigidos = new Set(
          fit.aceitas.map((a) => `${a.position}.${a.key}`),
        )
        for (let i = copyDeviations.length - 1; i >= 0; i--) {
          const d = copyDeviations[i]
          if (
            d.kind === "max_len" &&
            corrigidos.has(`${d.position}.${String(d.key)}`)
          ) {
            copyDeviations.splice(i, 1)
          }
        }
        copyFitResumo = {
          alvos: alvos.length,
          corrigidos: fit.aceitas.length,
          mantidos: alvos.length - fit.aceitas.length,
          blocos_regravados: blocosRegravados,
        }
      }
    }

    // 4) Telemetria
    //
    // Entrada estruturada: o que VOLTOU do n8n, com origem. A copy é do
    // agente externo (`upstream`); o contrato contra o qual ela é medida é da
    // biblioteca (o `fields` da variante casada, gravado na linha do bloco).
    const porKind = new Map<string, number>()
    for (const d of copyDeviations) {
      const k = String(d.kind ?? "?")
      porKind.set(k, (porKind.get(k) ?? 0) + 1)
    }
    const inputSummary: InputSummaryItem[] = [
      {
        rotulo: "Copy recebida do n8n",
        cls: "upstream",
        valor: `${body.blocks.length} bloco(s) · ${charsTotal.toLocaleString("pt-BR")} chars de texto`,
      },
      {
        rotulo: "Assunto / preheader",
        cls: "upstream",
        valor: `${body.subject}${body.preheader ? ` · ${body.preheader}` : ""}`,
      },
      {
        rotulo: "Blocos gravados",
        cls: "sistema",
        valor: `${blocksWritten} de ${body.blocks.length} recebido(s)`,
      },
      {
        rotulo: "Adesão ao contrato",
        cls: "biblioteca",
        valor: taxaContrato == null
          ? "sem chaves recebidas"
          : `${taxaContrato}% — ${keysNoContrato} de ${keysRecebidas} chave(s) dentro do schema da variante`,
      },
      {
        rotulo: "Desvios",
        cls: "sistema",
        valor: copyDeviations.length === 0
          ? "nenhum"
          : Array.from(porKind.entries())
              .map(([k, n]) => `${k}: ${n}`)
              .join(" · "),
      },
      {
        rotulo: "Chars por bloco",
        cls: "upstream",
        valor: charsPorBloco.length === 0
          ? "—"
          : charsPorBloco
              .map((b) => `#${b.position} ${b.type}: ${b.chars}`)
              .join(" · "),
      },
      {
        rotulo: "Batch da geração",
        cls: "sistema",
        valor: currentBatchId ?? "(sem batch)",
      },
    ]

    await logGenerationRun({
      storeId: body.store_id,
      flowId: email.flow_id,
      emailId: body.email_id,
      // Sem batch_id a run não entrava na aba Teste como batch-scoped — e o
      // id já estava aqui em escopo desde o guard de batch stale.
      batchId: currentBatchId ?? "",
      agent: "copy",
      status: "success",
      model: body.meta?.model ?? "n8n",
      tokensInput: body.meta?.tokens_input ?? undefined,
      tokensOutput: body.meta?.tokens_output ?? undefined,
      durationMs: body.meta?.duration_ms ?? undefined,
      inputSummary,
      parsedOutput: {
        subject: body.subject,
        preheader: body.preheader ?? null,
        blocks_written: blocksWritten,
        blocks_total: body.blocks.length,
        contrato: {
          keys_recebidas: keysRecebidas,
          keys_no_contrato: keysNoContrato,
          taxa_pct: taxaContrato,
          por_bloco: contratoPorBloco,
        },
        // Qual formato de envelope chegou. É registro, não alarme: as duas
        // formas são válidas e o callback aceita as duas.
        ...(blocksUnwrapped.length > 0
          ? { blocos_desembrulhados: blocksUnwrapped }
          : {}),
        ...(copyDeviations.length > 0
          ? { desvios: copyDeviations.slice(0, 60) }
          : {}),
        // O que o n8n entregou, antes do encurtador — é este número que diz
        // se o flow está respeitando o contrato, e ele não pode sumir só
        // porque a correção deu certo.
        ...(copyFitResumo
          ? { copy_fit: copyFitResumo, desvios_pre_fit: desviosPreFit.slice(0, 60) }
          : {}),
      },
    })

    log.info("email_copy.persisted", {
      email_id: body.email_id,
      blocks_written: blocksWritten,
      blocks_total: body.blocks.length,
      blocks_sanitized: blocksSanitized,
    })
    if (blocksUnwrapped.length > 0) {
      // INFO, não warn: `campos[]` é formato SUPORTADO, não desvio. Quem se
      // adapta é o callback — o flow do n8n é editado por fora e não deve ter
      // de mudar por causa da forma do nosso envelope.
      log.info("email_copy.envelope_unwrapped", {
        email_id: body.email_id,
        blocks: blocksUnwrapped.length,
        sample: blocksUnwrapped.slice(0, 5),
      })
    }
    if (blocksSanitized > 0) {
      log.warn("email_copy.brand_tokens_resolved", {
        email_id: body.email_id,
        blocks_sanitized: blocksSanitized,
        // Indica que o n8n entregou copy com `{{BRAND_NAME}}` nao-resolvido.
        // Quando blocksSanitized for consistentemente > 0 em prod, abrir
        // ticket no workflow n8n pra resolver na origem.
      })
    }

    // 5) AE-19: fase 2 (render) agora aguarda confirmacao da identidade
    // visual. O dispatcher (cron watchdog, front 1) vai chamar
    // runPhase2InBackground quando store_brand_identity.confirmed_at virar
    // NOT NULL e este email estiver em status='copy_ready'. Ver
    // supabase/migrations/20260626c_email_render_signal_type.sql.
    // Somente-texto: já ficou `ready` acima — sem fase 2. Se veio de um
    // batch (aba Testar / legado), fecha a contagem terminal do batch
    // (paridade com o phase2-runner, que faz isso ao marcar ready).
    if (textOnly) {
      const batchId = (email as { generation_batch_id?: string | null })
        .generation_batch_id
      if (batchId) {
        await checkBatchTerminal(body.store_id, batchId).catch(() => {})
      }
      log.info("email_copy.text_only_ready", {
        email_id: body.email_id,
        store_id: body.store_id,
        batch_id: batchId ?? null,
      })
    } else if (
      (email as { auto_phase2_relaxed?: boolean }).auto_phase2_relaxed === true
    ) {
      // Teste "Geração completa": a copy chegou → dispara a fase 2 RELAXADA
      // agora, sem esperar o gate de identidade visual. Limpa o flag primeiro
      // (idempotência: um callback repetido não re-dispara). Mesmo padrão de
      // disparo do generate-email route: fetch interno com fallback direto.
      await admin
        .from("email_flow_emails")
        .update({ auto_phase2_relaxed: false })
        .eq("id", body.email_id)

      const secret = process.env.INTERNAL_SECRET
      const baseUrl = (
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
        `https://${request.headers.get("host") ?? "localhost:3000"}`
      ).replace(/\/$/, "")

      after(async () => {
        const fallbackDirect = async (reason: string) => {
          log.warn("email_copy.full_pipeline.phase2_fallback_direct", {
            email_id: body.email_id,
            reason,
          })
          try {
            await runPhase2InBackground({
              storeId: body.store_id,
              emailId: body.email_id,
              relaxedBrandCheck: true,
            })
          } catch (err) {
            log.error("email_copy.full_pipeline.phase2_fallback_error", err)
          }
        }
        if (!secret) {
          await fallbackDirect("no_internal_secret")
          return
        }
        try {
          const resp = await fetch(
            `${baseUrl}/api/internal/run-phase2-image/${body.email_id}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": secret,
              },
              body: JSON.stringify({
                storeId: body.store_id,
                relaxedBrandCheck: true,
              }),
            },
          )
          if (!resp.ok) await fallbackDirect(`fetch_non_ok_${resp.status}`)
        } catch (err) {
          log.error("email_copy.full_pipeline.phase2_dispatch_error", err)
          await fallbackDirect("fetch_error")
        }
      })

      log.info("email_copy.full_pipeline.phase2_triggered", {
        email_id: body.email_id,
        store_id: body.store_id,
      })
    } else {
      log.info("email_copy.phase2_deferred", {
        email_id: body.email_id,
        store_id: body.store_id,
      })
    }

    return successResponse(request, {
      ok: true,
      email_id: body.email_id,
      blocks_written: blocksWritten,
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:email-copy")
  }
}
