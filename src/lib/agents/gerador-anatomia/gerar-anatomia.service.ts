/**
 * Gerador de Anatomias (Trilha B4) — I/O.
 *
 * Um pedido (dispositivo + letra + densidade + notas) vira UMA variante nova
 * de `email_component_variants`, desativada (`is_active=false`,
 * `source='gerada'`), já com tokens de identidade e validada pelo
 * `validar-anatomia.ts`. O modelo tenta até 3 vezes: as duas primeiras no
 * modelo da config, com o relatório do validador como correção; a terceira
 * num modelo mais forte (`GERADOR_ANATOMIA_MODELO_FINAL`) — se ainda
 * reprovar, nada é gravado e a run diz por quê.
 *
 * Prévias: a anatomia aprovada é renderizada nas DUAS paletas de prova
 * (Luxe Lift, Innova Bay) pelo serviço de PNG da casa e as URLs ficam em
 * `geracao_meta.previews`. Fail-open — prévia é auxílio de curadoria, não
 * condição.
 *
 * A run `gerador_anatomia` é gravada na loja de REFERÊNCIA do pedido
 * (`email_generation_runs.store_id` é NOT NULL e a biblioteca é global):
 * por padrão, a primeira paleta de prova que tiver loja real.
 */

import crypto from "crypto"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { withRenderPage } from "@/lib/services/email-png-render.service"

import { invokeAgent, loadActiveAgentConfig, type AgentInvokeConfig } from "../architect/llm-invoke"
import { finishGenerationRun, resolveCostCents, startGenerationRun } from "../callbacks/telemetry.callback"
import { relogioParaTeto } from "../fase1-orcamento"
import { aplicarTokens } from "../html/identity-tokens"
import { paletasDeProva, type PaletaDeProva } from "../html/paletas-de-prova"
import { EMAIL_ASSETS_BUCKET } from "../image/upload-email-asset"
import { renderImageTemplate } from "../image/template-renderer"
import { secaoDoDispositivo, type Dispositivo } from "../shared/dispositivos"
import { buildSegmentedPrompt, type InputSummaryItem } from "../shared/prompt-provenance"
import {
  DEFAULT_GERADOR_SYSTEM,
  DEFAULT_GERADOR_USER,
  GERADOR_ORIGINS,
  montarVars,
  parseSaida,
  type DensidadeDaAnatomia,
  type ReferenciaDeAnatomia,
  type SaidaDoGerador,
} from "./prompt"
import { validarAnatomia, type ValidacaoDaAnatomia } from "./validar-anatomia"

const log = logger.child("GeradorAnatomia")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
/** 3ª tentativa: modelo mais forte. Vazio desliga a escalada. */
const MODELO_FINAL = process.env.GERADOR_ANATOMIA_MODELO_FINAL ?? "~anthropic/claude-fable-latest"
const MAX_ATTEMPTS = 3
const MAX_REFS = 2

export interface GerarAnatomiaInput {
  dispositivo: Dispositivo
  /** Letra que distingue as irmãs do mesmo dispositivo (a, b, c…). */
  variante: string
  densidade: DensidadeDaAnatomia
  idioma?: string | null
  notas?: string | null
  /** Referências escolhidas à mão; ausente → escolha automática. */
  refsIds?: string[] | null
  /** Loja em que a run é gravada; ausente → primeira paleta de prova com loja. */
  storeId?: string | null
  triggeredBy?: string | null
}

export interface PreviewDaAnatomia {
  nome: string
  slug: string
  url: string
}

export interface GerarAnatomiaResult {
  status: "ok" | "reprovada" | "erro"
  variantId: string | null
  runId: string | null
  nome: string | null
  anatomiaSlug: string | null
  tentativas: number
  modeloFinal: string
  /** Erros da ÚLTIMA tentativa (vazio quando ok). */
  erros: string[]
  avisos: string[]
  custoCents: number
  previews: PreviewDaAnatomia[]
  storeId: string | null
}

interface VariantRefRow {
  id: string
  name: string
  block_type: string
  dispositivo: string | null
  tokens_de_identidade: boolean | null
  html: string | null
}

/**
 * 1–2 referências da MESMA seção: mesmo dispositivo primeiro, tokenizadas
 * primeiro. A nova precisa ser diferente delas — o prompt diz isso — mas
 * aprender a calha/ritmo é o que faz a peça sair no padrão da biblioteca.
 */
async function escolherReferencias(
  admin: ReturnType<typeof createAdminClient>,
  dispositivo: Dispositivo,
  refsIds?: string[] | null,
): Promise<ReferenciaDeAnatomia[]> {
  let q = admin
    .from("email_component_variants")
    .select("id, name, block_type, dispositivo, tokens_de_identidade, html")
    .eq("is_active", true)
  if (refsIds && refsIds.length > 0) q = q.in("id", refsIds)
  else q = q.eq("block_type", secaoDoDispositivo(dispositivo))
  const { data, error } = await q
  if (error) {
    log.warn("gerador.refs_failed", { error: error.message })
    return []
  }
  const rows = ((data ?? []) as VariantRefRow[]).filter((r) => (r.html ?? "").trim().length > 0)
  const peso = (r: VariantRefRow) => (r.dispositivo === dispositivo ? 2 : 0) + (r.tokens_de_identidade ? 1 : 0)
  rows.sort((a, b) => peso(b) - peso(a) || a.name.localeCompare(b.name))
  return rows.slice(0, refsIds?.length ? refsIds.length : MAX_REFS).map((r) => ({
    id: r.id,
    name: r.name,
    dispositivo: r.dispositivo,
    html: r.html ?? "",
  }))
}

async function slugDisponivel(admin: ReturnType<typeof createAdminClient>, base: string): Promise<string> {
  const { data } = await admin.from("email_component_variants").select("anatomia_slug").ilike("anatomia_slug", `${base}%`)
  const usados = new Set(((data ?? []) as Array<{ anatomia_slug: string | null }>).map((r) => r.anatomia_slug ?? ""))
  if (!usados.has(base)) return base
  for (let i = 2; i < 50; i++) if (!usados.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/** Prévias nas paletas de prova. Nunca lança; devolve o que conseguiu. */
async function renderizarPrevias(
  admin: ReturnType<typeof createAdminClient>,
  variantId: string,
  html: string,
  paletas: PaletaDeProva[],
): Promise<PreviewDaAnatomia[]> {
  if (process.env.EMAIL_RENDER_PREVIEWS === "off" || process.env.VITEST || process.env.NODE_ENV === "test") return []
  const out: PreviewDaAnatomia[] = []
  try {
    await withRenderPage(async (render) => {
      for (const p of paletas) {
        try {
          const doc = aplicarTokens(html, p.tokens).html
          const png = await render(doc, { width: 600, deviceScaleFactor: 1, timeoutMs: 15_000 })
          const path = `biblioteca/anatomias/${variantId}/${p.slug}.png`
          const { error } = await admin.storage.from(EMAIL_ASSETS_BUCKET).upload(path, png, { contentType: "image/png", upsert: true })
          if (error) throw new Error(error.message)
          const { data: signed } = await admin.storage.from(EMAIL_ASSETS_BUCKET).createSignedUrl(path, 365 * 24 * 60 * 60)
          const url = signed?.signedUrl ?? admin.storage.from(EMAIL_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl
          out.push({ nome: p.nome, slug: p.slug, url })
        } catch (err) {
          log.warn("gerador.preview_failed", { variantId, paleta: p.slug, error: err instanceof Error ? err.message : String(err) })
        }
      }
    })
  } catch (err) {
    log.warn("gerador.previews_unavailable", { variantId, error: err instanceof Error ? err.message : String(err) })
  }
  return out
}

export async function gerarAnatomia(input: GerarAnatomiaInput): Promise<GerarAnatomiaResult> {
  const t0 = Date.now()
  const admin = createAdminClient()
  const paletas = await paletasDeProva(admin)
  const storeId = input.storeId ?? paletas.find((p) => p.storeId)?.storeId ?? null
  const vazio = (status: GerarAnatomiaResult["status"], erros: string[]): GerarAnatomiaResult => ({
    status,
    variantId: null,
    runId: null,
    nome: null,
    anatomiaSlug: null,
    tentativas: 0,
    modeloFinal: "",
    erros,
    avisos: [],
    custoCents: 0,
    previews: [],
    storeId,
  })
  if (!storeId) {
    return vazio("erro", ["nenhuma loja de referência para gravar a run (informe store_id)"])
  }

  const cfgRow = await loadActiveAgentConfig("gerador_anatomia")
  const maxTokens = cfgRow?.max_tokens ?? 12000
  const config: AgentInvokeConfig = {
    model: cfgRow?.model || DEFAULT_MODEL,
    temperature: cfgRow?.temperature ?? 0.4,
    max_tokens: maxTokens,
    timeoutMs: relogioParaTeto(maxTokens),
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_GERADOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_GERADOR_USER,
  }

  const referencias = await escolherReferencias(admin, input.dispositivo, input.refsIds)
  const idioma = (input.idioma ?? "").trim() || "pt-BR"
  const baseVars = montarVars({
    dispositivo: input.dispositivo,
    variante: input.variante,
    densidade: input.densidade,
    idioma,
    notas: input.notas,
    referencias,
  })
  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Dispositivo", cls: "curadoria", valor: `${input.dispositivo} · variante ${input.variante} · ${input.densidade} · ${idioma}` },
    { rotulo: "Referências", cls: "biblioteca", valor: referencias.length ? referencias.map((r) => `${r.name} (${r.dispositivo ?? "?"})`).join(" · ") : "(nenhuma desta seção)" },
    { rotulo: "Notas do curador", cls: "curadoria", valor: (input.notas ?? "").trim() || "(nenhuma)" },
    { rotulo: "Paletas de prova", cls: "loja", valor: paletas.map((p) => `${p.nome} (${p.origem})`).join(" · ") },
  ]

  const batchId = crypto.randomUUID()
  const segBase = buildSegmentedPrompt(config.user_template, baseVars, GERADOR_ORIGINS, { parte: "user" })
  const runId = await startGenerationRun({
    storeId,
    batchId,
    triggeredBy: input.triggeredBy ?? undefined,
    agent: "gerador_anatomia",
    agentConfigId: cfgRow?.id,
    model: config.model,
    inputVars: { dispositivo: input.dispositivo, variante: input.variante, densidade: input.densidade, idioma, refs: referencias.map((r) => r.id) },
    renderedPrompt: segBase.segments ? segBase.prompt : renderImageTemplate(config.user_template, baseVars),
    promptSegments: segBase.segments,
    inputSummary,
  })

  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let raw = ""
  let promptFinal = ""
  let segmentsFinal = segBase.segments
  let correcoes: string[] = []
  let modeloUsado = config.model
  const tentativas: Array<{ modelo: string; erros: string[]; avisos: string[] }> = []
  let aprovada: { saida: SaidaDoGerador; validacao: ValidacaoDaAnatomia } | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt === MAX_ATTEMPTS && MODELO_FINAL && MODELO_FINAL !== config.model) {
      config.model = MODELO_FINAL
    }
    modeloUsado = config.model
    const vars = correcoes.length > 0 ? montarVars({ dispositivo: input.dispositivo, variante: input.variante, densidade: input.densidade, idioma, notas: input.notas, referencias, correcoes }) : baseVars
    try {
      const res = await invokeAgent(config, vars)
      raw = res.raw
      tokensIn += res.tokensInput
      tokensOut += res.tokensOutput
      costUsd += res.costUsd
      const seg = buildSegmentedPrompt(config.user_template, vars, GERADOR_ORIGINS, { parte: "user" })
      promptFinal = seg.segments ? seg.prompt : renderImageTemplate(config.user_template, vars)
      segmentsFinal = seg.segments

      const saida = parseSaida(res.raw)
      const validacao = validarAnatomia({ html: saida.html, output_schema: saida.output_schema, dispositivo: input.dispositivo })
      tentativas.push({ modelo: config.model, erros: validacao.erros, avisos: validacao.avisos })
      if (validacao.ok) {
        aprovada = { saida, validacao }
        break
      }
      correcoes = validacao.erros
      log.warn("gerador.reprovada", { dispositivo: input.dispositivo, attempt, modelo: config.model, erros: validacao.erros.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      tentativas.push({ modelo: config.model, erros: [msg], avisos: [] })
      correcoes = [msg]
      log.warn("gerador.attempt_failed", { dispositivo: input.dispositivo, attempt, modelo: config.model, error: msg })
    }
  }

  const custoCents = resolveCostCents({ model: modeloUsado, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd })
  const ultima = tentativas[tentativas.length - 1]
  const comum = {
    storeId,
    batchId,
    triggeredBy: input.triggeredBy ?? undefined,
    agent: "gerador_anatomia" as const,
    agentConfigId: cfgRow?.id,
    model: modeloUsado,
    renderedPrompt: promptFinal || undefined,
    promptSegments: segmentsFinal,
    inputSummary,
    rawOutput: raw.slice(0, 32000) || undefined,
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    costCents: custoCents,
    durationMs: Date.now() - t0,
    retryCount: Math.max(0, tentativas.length - 1),
  }
  void recordAiUsage({
    feature: "gerar_anatomia",
    model: modeloUsado,
    provider: modeloUsado.includes("/") ? "openrouter" : "anthropic",
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    durationMs: Date.now() - t0,
    storeId,
  })

  if (!aprovada) {
    await finishGenerationRun(runId, {
      ...comum,
      status: "error",
      errorMessage: `reprovada em ${tentativas.length} tentativa(s): ${(ultima?.erros ?? []).slice(0, 5).join(" · ")}`.slice(0, 2000),
      parsedOutput: { dispositivo: input.dispositivo, variante: input.variante, tentativas, aprovada: false },
    })
    return { ...vazio("reprovada", ultima?.erros ?? []), runId, tentativas: tentativas.length, modeloFinal: modeloUsado, avisos: ultima?.avisos ?? [], custoCents }
  }

  const { saida, validacao } = aprovada
  const anatomiaSlug = await slugDisponivel(admin, `${input.dispositivo}_${input.variante.toLowerCase().replace(/[^a-z0-9]+/g, "") || "a"}`)
  const promptSha8 = crypto.createHash("sha256").update(promptFinal, "utf8").digest("hex").slice(0, 8)
  const geracaoMeta: Record<string, unknown> = {
    gerada_em: new Date().toISOString(),
    run_id: runId || null,
    modelo: modeloUsado,
    prompt_sha8: promptSha8,
    refs: referencias.map((r) => ({ id: r.id, name: r.name })),
    tentativas: tentativas.length,
    lint: { itens: validacao.lint.itens, fixes: validacao.lint.fixes },
    avisos: validacao.avisos,
    contrato: validacao.contrato,
    cobertura: validacao.cobertura,
    tokens: validacao.tokens,
    custo_cents: custoCents,
    previews: [],
  }
  const { data: inserted, error: insErr } = await admin
    .from("email_component_variants")
    .insert({
      block_type: secaoDoDispositivo(input.dispositivo),
      name: saida.name,
      html: validacao.html,
      rendered_html: null,
      description: saida.description || null,
      long_description: null,
      slots: [],
      objectives: [],
      tones: [],
      when_use: saida.when_use || null,
      when_not_use: saida.when_not_use || null,
      copy_guidance: saida.copy_guidance || null,
      design_system: saida.design_system || null,
      product_slots: saida.product_slots,
      output_schema: validacao.schema,
      density: saida.density,
      tags: ["gerada"],
      is_active: false,
      dispositivo: input.dispositivo,
      anatomia_slug: anatomiaSlug,
      tokens_de_identidade: true,
      source: "gerada",
      geracao_meta: geracaoMeta,
      created_by: input.triggeredBy ?? null,
    })
    .select("id")
    .single()
  if (insErr || !inserted) {
    const msg = insErr?.message ?? "insert sem retorno"
    await finishGenerationRun(runId, {
      ...comum,
      status: "error",
      errorMessage: `anatomia aprovada, gravação falhou: ${msg}`.slice(0, 2000),
      parsedOutput: { dispositivo: input.dispositivo, variante: input.variante, tentativas, aprovada: true, gravada: false },
    })
    return { ...vazio("erro", [msg]), runId, tentativas: tentativas.length, modeloFinal: modeloUsado, custoCents }
  }
  const variantId = inserted.id as string

  const previews = await renderizarPrevias(admin, variantId, validacao.html, paletas)
  if (previews.length > 0) {
    await admin
      .from("email_component_variants")
      .update({ geracao_meta: { ...geracaoMeta, previews } })
      .eq("id", variantId)
  }

  await finishGenerationRun(runId, {
    ...comum,
    status: "success",
    parsedOutput: {
      dispositivo: input.dispositivo,
      variante: input.variante,
      variant_id: variantId,
      anatomia_slug: anatomiaSlug,
      name: saida.name,
      tentativas,
      aprovada: true,
      contrato: validacao.contrato,
      cobertura: validacao.cobertura,
      tokens: validacao.tokens,
      lint_avisos: validacao.avisos,
      previews,
      output_html: validacao.html.slice(0, 60000),
    },
  })
  log.info("gerador.ok", { dispositivo: input.dispositivo, variantId, anatomiaSlug, tentativas: tentativas.length, modelo: modeloUsado, custoCents })
  return {
    status: "ok",
    variantId,
    runId,
    nome: saida.name,
    anatomiaSlug,
    tentativas: tentativas.length,
    modeloFinal: modeloUsado,
    erros: [],
    avisos: validacao.avisos,
    custoCents,
    previews,
    storeId,
  }
}
