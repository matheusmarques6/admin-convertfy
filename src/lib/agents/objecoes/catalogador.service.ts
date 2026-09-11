/**
 * Catalogador — orquestração (I/O).
 *
 * Agente A do plano das objeções (docs/email-generation/plano-objecoes-
 * macro-micro.md). Roda 1× por loja: no callback `pesquisa-completa` (antes
 * de enfileirar a geração), no botão "Regenerar objeções" e no batch de
 * backfill. Grava `client_stores.objection_catalog` e a PROJEÇÃO em
 * `icp_objections` ([{objection, treatment}]) — a UI, o n8n e o PATCH
 * continuam lendo o formato antigo sem mudar.
 *
 * O LLM propõe, `catalogo-regras` confere o que é checável por código;
 * reprovou → 1 retry com os erros no bloco <correcoes>; 2ª falha → run
 * `error` e o catálogo anterior fica intocado. Nunca lança.
 */

import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { loadTopProducts } from "../top-products"
import { renderTopProducts } from "../architect/store-context"
import {
  extractJson,
  invokeAgent,
  loadActiveAgentConfig,
  type AgentInvokeConfig,
} from "../architect/llm-invoke"
import {
  finishGenerationRun,
  resolveCostCents,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  buildSegmentedPrompt,
  type InputSummaryItem,
} from "../shared/prompt-provenance"
import { renderImageTemplate } from "../image/template-renderer"
import {
  CATALOGADOR_ORIGINS,
  DEFAULT_CATALOGADOR_SYSTEM,
  DEFAULT_CATALOGADOR_USER,
  renderObjecoesAnteriores,
  renderVocabularioDaCliente,
} from "./catalogador-prompt"
import { normalizarCatalogo, projetarObjecoes, validarCatalogo } from "./catalogo-regras"
import { aplicarFichaAoCatalogo, fichaParaPrompt, normalizarFicha } from "@/lib/stores/ficha-operacional"
import { relogioDaChamada, relogioParaTeto, restanteDoOrcamento } from "../fase1-orcamento"
import { classificarFalha, planejarRetentativa } from "../retry-teto"
import { motivoDaFalha } from "./catalogador-erros"
import type { CatalogoDeObjecoes } from "./vocabulario"

const log = logger.child("Catalogador")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
const MAX_ATTEMPTS = 2

/**
 * Teto de saída máximo numa retentativa por truncamento.
 *
 * A 90 tok/s medidos, 16.384 tokens pedem ~197s — cabe na janela desta rota
 * quando a 1ª tentativa foi curta, e é `relogioDaChamada` quem corta se não
 * couber. Acima disso a 2ª tentativa não teria como terminar dentro dos
 * 300s da função, e subir o teto sem o relógio acompanhar só aumenta a
 * reserva de crédito que o OpenRouter faz em voo.
 */
const TETO_MAXIMO_TOKENS = 16_384

export interface RunCatalogadorInput {
  storeId: string
  triggeredBy?: string
}

export interface RunCatalogadorResult {
  /** 'ok' | 'sem_contexto' (loja sem pesquisa/ICP) | 'falhou' (2 tentativas reprovadas). */
  status: "ok" | "sem_contexto" | "falhou"
  catalogo: CatalogoDeObjecoes | null
  /** A projeção gravada em `icp_objections` (o que a UI mostra). */
  objections: Array<{ objection: string; treatment: string }>
  runId: string | null
  erros?: string[]
  /** A causa em texto de gente — é o que a rota mostra na tela. */
  motivo?: string
}

/** sha8 do catálogo — o alvo do Seletor guarda isto para saber se ficou velho. */
export function catalogoSha8(catalogo: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(catalogo ?? null)).digest("hex").slice(0, 8)
}

export async function runCatalogador(input: RunCatalogadorInput): Promise<RunCatalogadorResult> {
  const t0 = Date.now()
  const admin = createAdminClient()

  const { data: store, error: storeErr } = await admin
    .from("client_stores")
    .select("*")
    .eq("id", input.storeId)
    .maybeSingle()
  if (storeErr || !store) {
    log.warn("catalogador.store_not_found", { storeId: input.storeId, error: storeErr?.message })
    return { status: "sem_contexto", catalogo: null, objections: [], runId: null }
  }
  const s = store as Record<string, unknown>
  const hasContext =
    Boolean(s.brand_thesis) ||
    Boolean(s.icp_persona) ||
    Boolean(s.icp_day_in_life) ||
    (Array.isArray(s.icp_motivations) && s.icp_motivations.length > 0)
  if (!hasContext) {
    log.info("catalogador.sem_contexto", { storeId: input.storeId })
    return { status: "sem_contexto", catalogo: null, objections: [], runId: null }
  }

  const topProducts = await loadTopProducts(admin, input.storeId, (s.store_url as string | null) ?? null)
  const brandName = (s.store_name as string) || "Loja"
  const pesquisa = pesquisaToFullText(store as PesquisaFields)
  const objecoesAnteriores = Array.isArray(s.icp_objections)
    ? (s.icp_objections as Array<{ objection?: string; treatment?: string }>)
    : []

  const cfgRow = await loadActiveAgentConfig("catalogador")
  const maxTokens = cfgRow?.max_tokens ?? 8192
  const config: AgentInvokeConfig = {
    model: cfgRow?.model || DEFAULT_MODEL,
    temperature: cfgRow?.temperature ?? 0.3,
    max_tokens: maxTokens,
    // O relógio sai do teto de tokens, que mora no BANCO e muda sem deploy.
    // Uma constante aqui envelheceria na primeira troca pela tela — foi
    // exatamente o que aconteceu: 8.192 virou 12.288 em 04/09 e o relógio
    // global (240s) seguiu o mesmo, com a rota declarando 120s de função.
    timeoutMs: relogioParaTeto(maxTokens),
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_CATALOGADOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_CATALOGADOR_USER,
  }

  // Ficha operacional do time (09/09): o que está nela é VERIFICADO e vence
  // a pesquisa. Coluna ausente/vazia → ausência declarada no prompt.
  const ficha = normalizarFicha(s.ficha_operacional)
  const baseVars: Record<string, string> = {
    brand_name: brandName,
    idioma: (s.language as string | null)?.trim() || "pt-BR",
    ficha_operacional: fichaParaPrompt(ficha),
    pesquisa: pesquisa || "(sem pesquisa)",
    top_products: renderTopProducts(topProducts),
    objecoes_anteriores: renderObjecoesAnteriores(objecoesAnteriores),
    vocabulario_da_cliente: renderVocabularioDaCliente(
      Array.isArray(s.icp_vocabulary)
        ? (s.icp_vocabulary as Array<{ type?: string; channel?: string; quote?: string }>)
        : null,
    ),
    correcoes: "(nenhuma — primeira tentativa)",
  }

  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: brandName },
    { rotulo: "Ficha operacional", cls: "loja", valor: ficha ? "preenchida pelo time — vence a pesquisa" : "(ausente — nada verificado)" },
    { rotulo: "Perfil da marca", cls: "loja", valor: `${pesquisa.length.toLocaleString("pt-BR")} chars do dossiê · ${topProducts.length} produto(s)` },
    { rotulo: "Objeções anteriores", cls: "loja", valor: `${objecoesAnteriores.length} cadastrada(s) (material, não gabarito)` },
    { rotulo: "Vocabulário da cliente", cls: "loja", valor: `${Array.isArray(s.icp_vocabulary) ? s.icp_vocabulary.length : 0} quote(s)` },
  ]

  // Run store-level: sem flow/email; batchId próprio (a run precisa de um).
  const batchId = crypto.randomUUID()
  const segBase = buildSegmentedPrompt(config.user_template, baseVars, CATALOGADOR_ORIGINS, { parte: "user" })
  const runId = await startGenerationRun({
    storeId: input.storeId,
    batchId,
    triggeredBy: input.triggeredBy,
    agent: "catalogador",
    agentConfigId: cfgRow?.id,
    model: config.model,
    inputVars: {
      objecoes_anteriores: objecoesAnteriores.length,
      produtos: topProducts.length,
      pesquisa_chars: pesquisa.length,
    },
    renderedPrompt: segBase.segments ? segBase.prompt : renderImageTemplate(config.user_template, baseVars),
    promptSegments: segBase.segments,
    inputSummary,
  })

  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let raw = ""
  let errosAnteriores: string[] = []
  let promptFinal = ""
  let segmentsFinal = segBase.segments
  // Por que o loop parou ANTES de esgotar as tentativas. Fica separado de
  // `errosAnteriores` porque aquilo é a causa da falha do modelo, e
  // sobrescrevê-la apaga a evidência — foi o que aconteceu na run
  // 22ea800a (11/09): a tela mostrou "sem orçamento" e a causa real da 1ª
  // tentativa, que é o que se investiga, não ficou gravada em lugar nenhum.
  let motivoDeParar: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // A 2ª tentativa é uma chamada inteira ao modelo, e o relógio dela é o
    // que SOBROU — não o teto do agente. Exigir o teto cheio recusava por
    // dez segundos uma tentativa que caberia: `relogioDaChamada` devolve
    // zero só abaixo do piso, e aí ela realmente não vale a pena.
    if (attempt > 1) {
      const relogio = relogioDaChamada({
        tetoMs: config.timeoutMs ?? 0,
        restanteMs: restanteDoOrcamento(),
      })
      if (relogio.ms <= 0) {
        motivoDeParar = `não sobrou tempo para a 2ª tentativa (menos que o mínimo de uma chamada)`
        log.warn("catalogador.sem_orcamento_para_retry", { storeId: input.storeId })
        break
      }
    }
    const vars =
      errosAnteriores.length > 0
        ? {
            ...baseVars,
            correcoes: `SEU CATÁLOGO ANTERIOR FOI REPROVADO PELO VALIDADOR. Corrija TODOS os pontos:\n${errosAnteriores.map((e) => `- ${e}`).join("\n")}`,
          }
        : baseVars
    try {
      const res = await invokeAgent(config, vars)
      raw = res.raw
      tokensIn += res.tokensInput
      tokensOut += res.tokensOutput
      costUsd += res.costUsd
      const seg = buildSegmentedPrompt(config.user_template, vars, CATALOGADOR_ORIGINS, { parte: "user" })
      promptFinal = seg.segments ? seg.prompt : renderImageTemplate(config.user_template, vars)
      segmentsFinal = seg.segments

      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(res.raw))
      } catch {
        throw new Error(
          res.tokensOutput >= config.max_tokens
            ? `resposta truncada no teto de ${config.max_tokens} tokens de saída — o JSON veio incompleto`
            : "resposta não é JSON válido",
        )
      }
      const catalogoDoModelo = normalizarCatalogo(parsed)
      const erros = validarCatalogo(catalogoDoModelo)
      if (erros.length > 0) throw new ValidacaoError(erros)
      // A ficha carimba `verificado` e sobrescreve o incentivo DEPOIS do
      // validador (o modelo é validado pelo que ele escreveu; a ficha é do
      // humano e não passa pela régua dele).
      const fichaAplicada = aplicarFichaAoCatalogo(catalogoDoModelo, ficha)
      const catalogo = fichaAplicada.catalogo

      const objections = projetarObjecoes(catalogo)
      const { error: upErr } = await admin
        .from("client_stores")
        .update({
          objection_catalog: catalogo,
          objection_catalog_source: "catalogador_v2",
          objection_catalog_updated_at: new Date().toISOString(),
          icp_objections: objections,
        })
        .eq("id", input.storeId)
      if (upErr) throw new Error(`gravação falhou: ${upErr.message}`)

      await finishGenerationRun(runId, {
        storeId: input.storeId,
        batchId,
        triggeredBy: input.triggeredBy,
        agent: "catalogador",
        agentConfigId: cfgRow?.id,
        status: "success",
        model: config.model,
        renderedPrompt: promptFinal,
        promptSegments: segmentsFinal,
        inputSummary,
        rawOutput: raw.slice(0, 16000),
        parsedOutput: {
          ficha_aplicada: { verificadas: fichaAplicada.verificadas, incentivo_sobrescrito: fichaAplicada.incentivo_sobrescrito },
          ...catalogo,
          _validador: {
            retry_count: attempt - 1,
            erros_da_tentativa_anterior: errosAnteriores,
            catalogo_sha8: catalogoSha8(catalogo),
          },
        },
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        costCents: resolveCostCents({ model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd }),
        durationMs: Date.now() - t0,
        retryCount: attempt - 1,
      })
      void recordAiUsage({
        feature: "regenerate_objections",
        model: config.model,
        provider: config.model.includes("/") ? "openrouter" : "anthropic",
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        durationMs: Date.now() - t0,
        storeId: input.storeId,
      })
      log.info("catalogador.ok", {
        storeId: input.storeId,
        objecoes: catalogo.objecoes.length,
        dominante: catalogo.objecoes.find((o) => o.dominante_da_categoria)?.id ?? null,
        lacunas: catalogo.cobertura.lacunas.length,
        attempt,
      })
      return { status: "ok", catalogo, objections, runId }
    } catch (err) {
      const ehValidacao = err instanceof ValidacaoError
      errosAnteriores = ehValidacao ? err.erros : [err instanceof Error ? err.message : String(err)]

      // Repetir a chamada idêntica não conserta o que o teto cortou: o
      // modelo gasta o orçamento de saída pensando (o Sonnet 5 faz isso) e
      // a resposta volta VAZIA, em 133s e zero token — foi a run 22ea800a.
      // `retry-teto` é o módulo da casa para isso e até agora não tinha
      // descido para este loop.
      const causa = classificarFalha({
        maxTokens: config.max_tokens,
        erro: errosAnteriores.join(" · "),
        ehValidacao,
      })
      const plano = planejarRetentativa({
        causa,
        tentativa: attempt,
        maxAttempts: MAX_ATTEMPTS,
        tetoAtual: config.max_tokens,
        tetoMaximo: TETO_MAXIMO_TOKENS,
      })
      log.warn("catalogador.attempt_failed", {
        storeId: input.storeId,
        attempt,
        causa,
        erros: errosAnteriores,
        proximo_teto: plano.repetir ? plano.maxTokens : null,
      })
      if (!plano.repetir) {
        // Só vira motivo de parada quando ainda HAVIA tentativa sobrando —
        // senão "tentativas esgotadas" viraria a explicação da falha e
        // esconderia a causa real, que é o que se lê na tela.
        if (attempt < MAX_ATTEMPTS) motivoDeParar = plano.motivo
        break
      }
      if (plano.maxTokens !== config.max_tokens) {
        config.max_tokens = plano.maxTokens
        config.timeoutMs = relogioParaTeto(plano.maxTokens)
      }
    }
  }

  // A causa que explica o desfecho, traduzida uma vez e usada nos três
  // lugares que a leem: a run, o log de custo e a resposta da rota. Sem
  // isto, a run grava "timeout" e a telemetria não distingue modelo lento
  // de catálogo reprovado.
  const motivo = motivoDaFalha(errosAnteriores, {
    relogioMs: config.timeoutMs ?? 0,
    maxTokens: config.max_tokens,
  })
  // O motivo da PARADA acompanha a causa, nunca a substitui.
  const mensagem = motivoDeParar ? `${motivo.mensagem} (${motivoDeParar})` : motivo.mensagem

  await finishGenerationRun(runId, {
    storeId: input.storeId,
    batchId,
    triggeredBy: input.triggeredBy,
    agent: "catalogador",
    agentConfigId: cfgRow?.id,
    status: "error",
    model: config.model,
    errorMessage: `[${motivo.codigo}] ${mensagem} · cru: ${errosAnteriores.join("; ")}`.slice(0, 2000),
    renderedPrompt: promptFinal || undefined,
    promptSegments: segmentsFinal,
    inputSummary,
    rawOutput: raw.slice(0, 16000) || undefined,
    parsedOutput: { erros: errosAnteriores, motivo: motivo.codigo, parou_porque: motivoDeParar, relogio_ms: config.timeoutMs ?? null, teto_final: config.max_tokens },
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    costCents: resolveCostCents({ model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd }),
    durationMs: Date.now() - t0,
    retryCount: MAX_ATTEMPTS - 1,
  })
  void recordAiUsage({
    feature: "regenerate_objections",
    model: config.model,
    provider: config.model.includes("/") ? "openrouter" : "anthropic",
    status: "error",
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    durationMs: Date.now() - t0,
    storeId: input.storeId,
    errorMessage: errosAnteriores.join("; ").slice(0, 500),
  })
  return { status: "falhou", catalogo: null, objections: [], runId, erros: errosAnteriores, motivo: mensagem }
}

class ValidacaoError extends Error {
  constructor(public readonly erros: string[]) {
    super(`validação reprovou: ${erros.length} erro(s)`)
  }
}
