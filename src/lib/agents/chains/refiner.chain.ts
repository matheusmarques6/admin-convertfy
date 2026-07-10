/**
 * Refiner Chain — Refinador Tipográfico (voz da marca na fonte de display).
 *
 * Roda DEPOIS do HTML agent e ANTES do QA na fase 2. NÃO reescreve HTML:
 * recebe o inventário numerado de ocorrências de font-family (apply-delta.ts)
 * + Pesquisa & Diagnóstico da loja e devolve um DELTA JSON pequeno
 * (~600 tokens): estratégia, fonte da whitelist e índices dos alvos de
 * display com peso/tracking. O código aplica mecanicamente.
 *
 * Config em email_agent_configs (agent_type='refiner'); sem row ativa o
 * passo inteiro é pulado no runner (rollout seguro). Fallbacks hardcoded
 * abaixo espelham o padrão do html.chain.
 */

import Anthropic from "@anthropic-ai/sdk"

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeOpenRouter, isOpenRouterModel } from "../openrouter-invoke"
import { renderWhitelistForPrompt } from "../refiner/font-whitelist"
import type { RefinerDelta, RefinerTarget } from "../refiner/apply-delta"

const log = logger.child("RefinerChain")

// Output curto (JSON) — timeout bem menor que o do HTML agent (200s).
const TIMEOUT_MS = 60_000
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"

export class RefinerDeltaInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RefinerDeltaInvalidError"
  }
}

export const DEFAULT_REFINER_SYSTEM_PROMPT = `<role>
Você é o Refinador Tipográfico de um pipeline de emails de e-commerce. O email chega PRONTO (estrutura, copy, cores, imagens). Você NÃO reescreve HTML, copy, cores ou layout. Você devolve APENAS um JSON de decisão tipográfica que o sistema aplica mecanicamente.
</role>

<two_layer_thesis>
A tipografia de um email trabalha em duas camadas com funções opostas:
- CAMADA 1 (fixa, INTOCÁVEL): a base utilitária — corpo de texto, botões/CTAs, navegação, selos, rodapé, linha legal. Sans neutra e legível. O trabalho dela é função e leitura, não identidade. NUNCA selecione esses alvos.
- CAMADA 2 (variável — o seu trabalho): a VOZ DA MARCA — a fonte de DISPLAY do nome da marca, da headline do herói e, quando fizer sentido, de preços, depoimentos e títulos de seção. É ela que carrega o posicionamento (luxo, moda, farma, devoção). Trocar essa fonte é o que "reveste" o template com a identidade da loja.
</two_layer_thesis>

<strategies>
Escolha UMA estratégia com base na Pesquisa & Diagnóstico (tom, nicho, persona, posicionamento):
- "serif_luxury": serifada de display para luxo, tradição, joalheria, relojoaria, devoção, atemporalidade. Ex.: relógios premium → Playfair Display.
- "personality_sans": sans com personalidade para moda contemporânea, streetwear, beleza moderna, tech. Ex.: menswear atual → Red Hat Display.
- "mono_weight_contrast": NÃO troca a família — cria hierarquia por contraste EXTREMO de peso (fino 200 × forte 700-800) na mesma fonte. Para categorias clínicas (suplemento, farma, skincare científico) ou minimalismo de moda preto-e-branco. A restrição É o statement.
- "none": a tipografia atual já comunica o posicionamento — não mexa. Devolver "none" é uma decisão legítima e valorizada; não force refinamento onde não agrega.
</strategies>

<techniques>
- Tracking (letter-spacing) NEGATIVO apenas em displays GRANDES (font-size >= 32px): -0.5px a -2px aperta o título e dá ar premium e deliberado. NUNCA em corpo de texto.
- Escada de pesos: use font_weight nos targets para criar contraste fino×forte dentro da headline (uma linha 200/300, outra 600-800).
- Máximo ~10 targets. Menos é mais: nome da marca + headline do herói são o essencial; preços/depoimentos/títulos de seção só quando reforçam o posicionamento.
</techniques>

<font_whitelist>
A display_font.family DEVE ser EXATAMENTE uma destas (e DIFERENTE da fonte atual da identidade, current_font_heading):
{{font_whitelist}}
</font_whitelist>

<target_selection>
Você recebe um inventário numerado de ocorrências de font-family (index, tag, font-size, trecho do texto). Selecione os índices cujo CONTEXTO indica display: font-size grande (>= 28px), texto que é o nome da marca ou headline. REJEITE índices cujo trecho pareça corpo, botão/CTA, navegação, selo, rodapé ou linha legal — mesmo que o font-size engane.
</target_selection>

<output>
Emita SOMENTE o JSON (sem fences, sem prosa), no shape exato:
{"strategy":"serif_luxury|personality_sans|mono_weight_contrast|none","rationale":"1-2 frases ligando a escolha ao posicionamento da loja","display_font":{"family":"Playfair Display","weights":[400,700,800]} ou null,"targets":[{"index":3,"role":"brand_name","font_weight":700,"letter_spacing":"-1.5px"}]}
- strategy "none" → display_font null e targets [].
- strategy "mono_weight_contrast" → display_font null (família não muda); targets carregam apenas font_weight/letter_spacing.
- weights: apenas os pesos que você usa nos targets (o sistema gera o @import a partir deles).
</output>`

export const DEFAULT_REFINER_USER_TEMPLATE = `<store>
  <brand_name>{{brand_name}}</brand_name>
  <niche>{{niche}}</niche>
  <locale>{{locale}}</locale>
  <current_font_heading>{{current_font_heading}}</current_font_heading>
  <current_font_body>{{current_font_body}}</current_font_body>
</store>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<pesquisa_diagnostico>
{{pesquisa_full_text}}
</pesquisa_diagnostico>

<font_occurrences>
{{font_occurrences_json}}
</font_occurrences>

Decida a voz tipográfica desta marca e emita SOMENTE o JSON do delta.`

export interface RefinerChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

export interface InvokeRefinerResult {
  delta: RefinerDelta
  tokensInput: number
  tokensOutput: number
  renderedPrompt: string
  rawOutput: string
}

const VALID_STRATEGIES = new Set([
  "serif_luxury",
  "personality_sans",
  "mono_weight_contrast",
  "none",
])
const VALID_ROLES = new Set([
  "brand_name",
  "hero_headline",
  "price",
  "testimonial",
  "section_title",
])

/** Strip fences + parse + validação estrutural. Exportada para teste. */
export function parseRefinerDelta(raw: string): RefinerDelta {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new RefinerDeltaInvalidError("output sem JSON")

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    throw new RefinerDeltaInvalidError("JSON inválido")
  }

  const strategy = parsed.strategy
  if (typeof strategy !== "string" || !VALID_STRATEGIES.has(strategy)) {
    throw new RefinerDeltaInvalidError(`strategy inválida: ${String(strategy)}`)
  }

  const targetsRaw = Array.isArray(parsed.targets) ? parsed.targets : []
  const targets: RefinerTarget[] = []
  for (const t of targetsRaw) {
    if (!t || typeof t !== "object") continue
    const tt = t as Record<string, unknown>
    if (typeof tt.index !== "number" || !Number.isInteger(tt.index)) continue
    const role = typeof tt.role === "string" && VALID_ROLES.has(tt.role)
      ? (tt.role as RefinerTarget["role"])
      : "section_title"
    targets.push({
      index: tt.index,
      role,
      ...(typeof tt.font_weight === "number"
        ? { font_weight: Math.round(tt.font_weight) }
        : {}),
      ...(typeof tt.letter_spacing === "string"
        ? { letter_spacing: tt.letter_spacing }
        : {}),
    })
  }

  let displayFont: RefinerDelta["display_font"] = null
  const df = parsed.display_font
  if (df && typeof df === "object") {
    const dfr = df as Record<string, unknown>
    if (typeof dfr.family === "string" && dfr.family.trim()) {
      displayFont = {
        family: dfr.family.trim(),
        weights: Array.isArray(dfr.weights)
          ? dfr.weights.filter((w): w is number => typeof w === "number")
          : [],
      }
    }
  }

  // Coerência estrutural: troca de família exige a fonte.
  if (
    (strategy === "serif_luxury" || strategy === "personality_sans") &&
    !displayFont
  ) {
    throw new RefinerDeltaInvalidError(`strategy ${strategy} sem display_font`)
  }

  return {
    strategy: strategy as RefinerDelta["strategy"],
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    display_font: displayFont,
    targets,
  }
}

export async function invokeRefinerChain(input: {
  config: RefinerChainConfig
  vars: Record<string, string>
}): Promise<InvokeRefinerResult> {
  const { config, vars } = input

  // A whitelist é injetada pelo código (fonte única: font-whitelist.ts) —
  // o prompt do DB pode referenciar {{font_whitelist}} sem duplicar a lista.
  const systemPrompt = renderImageTemplate(
    config.system_prompt.trim() || DEFAULT_REFINER_SYSTEM_PROMPT,
    { font_whitelist: renderWhitelistForPrompt() },
  )
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_REFINER_USER_TEMPLATE,
    vars,
  )
  const model = config.model || DEFAULT_MODEL

  if (isOpenRouterModel(model)) {
    const or = await invokeOpenRouter({
      model,
      systemPrompt,
      userMessage,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      timeoutMs: TIMEOUT_MS,
      title: "Convertfy Admin Refiner",
    })
    return {
      delta: parseRefinerDelta(or.text),
      tokensInput: or.tokensInput,
      tokensOutput: or.tokensOutput,
      renderedPrompt: userMessage,
      rawOutput: or.text,
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada")
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: TIMEOUT_MS })
  const resp = await client.messages.create({
    model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")

  log.info("refiner.invoke.success", {
    model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
  })

  return {
    delta: parseRefinerDelta(text),
    tokensInput: resp.usage.input_tokens,
    tokensOutput: resp.usage.output_tokens,
    renderedPrompt: userMessage,
    rawOutput: text,
  }
}
