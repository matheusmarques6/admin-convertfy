/**
 * Refiner Chain — Refinador (voz da marca em 3 camadas: tipografia de
 * display + linguagem de formas/border-radius + ritmo vertical).
 *
 * Roda DEPOIS do HTML agent e ANTES do QA na fase 2. NÃO reescreve HTML:
 * recebe 3 inventários numerados extraídos do HTML (apply-delta.ts) +
 * Pesquisa & Diagnóstico da loja e devolve UM delta JSON com 3 seções
 * independentes (typography/shapes/spacing) — as decisões saem coerentes
 * entre si porque vêm da mesma leitura do posicionamento. O código aplica
 * mecanicamente com clamps e guards.
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
import {
  NONE_SHAPES,
  NONE_SPACING,
  NONE_TYPOGRAPHY,
} from "../refiner/apply-delta"
import type {
  RefinerDelta,
  RefinerDeltaV2,
  RefinerTarget,
  ShapesDelta,
  ShapesTarget,
  SpacingAdjust,
  SpacingDelta,
  SpacingInsert,
} from "../refiner/apply-delta"

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
Você é o Refinador de um pipeline de emails de e-commerce. O email chega PRONTO (estrutura, copy, cores, imagens). Você NÃO reescreve HTML, copy, cores ou layout. Você devolve APENAS um JSON de decisão de refinamento visual em 3 camadas — tipografia de display, linguagem de formas (border-radius) e ritmo vertical (espaçamento) — que o sistema aplica mecanicamente. As 3 decisões devem sair COERENTES entre si: todas expressam o MESMO posicionamento da loja (espectro quente/acolhedor ↔ afiado/minimalista), lido da Pesquisa & Diagnóstico.
</role>

<two_layer_thesis>
A tipografia de um email trabalha em duas camadas com funções opostas:
- CAMADA 1 (fixa, INTOCÁVEL): a base utilitária — corpo de texto, botões/CTAs, navegação, selos, rodapé, linha legal. Sans neutra e legível. O trabalho dela é função e leitura, não identidade. NUNCA selecione esses alvos.
- CAMADA 2 (variável — o seu trabalho): a VOZ DA MARCA — a fonte de DISPLAY do nome da marca, da headline do herói e, quando fizer sentido, de preços, depoimentos e títulos de seção. É ela que carrega o posicionamento (luxo, moda, farma, devoção). Trocar essa fonte é o que "reveste" o template com a identidade da loja.
</two_layer_thesis>

<typography_strategies>
Escolha UMA estratégia com base na Pesquisa & Diagnóstico (tom, nicho, persona, posicionamento):
- "serif_luxury": serifada de display para luxo, tradição, joalheria, relojoaria, devoção, atemporalidade. Ex.: relógios premium → Playfair Display.
- "personality_sans": sans com personalidade para moda contemporânea, streetwear, beleza moderna, tech. Ex.: menswear atual → Red Hat Display.
- "mono_weight_contrast": NÃO troca a família — cria hierarquia por contraste EXTREMO de peso (fino 200 × forte 700-800) na mesma fonte. Para categorias clínicas (suplemento, farma, skincare científico) ou minimalismo de moda preto-e-branco. A restrição É o statement.
- "none": a tipografia atual já comunica o posicionamento — não mexa. Devolver "none" é uma decisão legítima e valorizada; não force refinamento onde não agrega.

Técnicas:
- Tracking (letter-spacing) NEGATIVO apenas em displays GRANDES (font-size >= 32px): -0.5px a -2px aperta o título e dá ar premium e deliberado. NUNCA em corpo de texto.
- Escada de pesos: use font_weight nos targets para criar contraste fino×forte dentro da headline (uma linha 200/300, outra 600-800).
- Máximo ~10 targets. Menos é mais: nome da marca + headline do herói são o essencial.
- Seleção pelo inventário font_occurrences (index, tag, font-size, trecho): escolha índices cujo CONTEXTO indica display (font-size >= 28px, nome da marca, headline). REJEITE corpo, botão/CTA, navegação, selo, rodapé, linha legal.
</typography_strategies>

<font_whitelist>
A display_font.family DEVE ser EXATAMENTE uma destas (e DIFERENTE da fonte atual da identidade, current_font_heading):
{{font_whitelist}}
</font_whitelist>

<shapes_rules>
A gramática de formas dos templates premium (estudo de 5 referências reais):
- QUADRADO é o chão fixo: imagens, faixas full-width, rodapé e divisórias NUNCA arredondam (imagens nem aparecem no inventário — não tente).
- ARREDONDAMENTO é sinal de "clicável": concentre o raio nos CTAs/botões. Elementos <a> do inventário sem raio (hasRadius=false) podem GANHAR raio.
- O raio CRESCE com a importância do botão: "BUY NOW" de card de produto 0-2px → CTA de seção ~5px → CTA principal do herói/final 12-15px.
- Stance pelo tom da loja:
  - "rounded_warm": marca acolhedora/devocional/comunitária → desce o raio até caixa de cupom e cards (3-9px); card de depoimento pode chegar a 16-20px. Suavidade é a voz.
  - "disciplined_minimal": categoria clínica (suplemento/farma/skincare científico) ou minimalismo afiado → raio único ~5px SÓ nos CTAs macro; todo o resto reto. A restrição é o statement.
  - "angular_premium": luxo/editorial/menswear → base reta dominante, CTAs discretos 2-5px, e no máximo o CTA do herói mais suave (12-15px) quando precisa saltar de um fundo escuro.
  - "none": as formas atuais já comunicam o posicionamento.
- radius_px permitido: 0 a 24. Máximo ~8 targets — mexa só no que muda a leitura da marca.
</shapes_rules>

<spacing_rules>
As 3 leis do ritmo vertical (estudo das mesmas 5 referências):
1. Grupos compactos, seções espaçadas: DENTRO de uma fase os elementos ficam colados (10-35px); ENTRE fases o respiro é generoso (50-140px). É o que torna um email longo escaneável.
2. O MAIOR vazio antecede uma troca de contexto (fundo claro↔escuro, bloco de destaque): o espaço em branco é o amortecedor que prepara o olho.
3. O funil aperta no núcleo de conversão (missão → cupom → CTA quase colados) e abre no fim (prova social e rodapé ganham pausa).

Assinaturas de respiro (escolha pela personalidade, coerente com typography/shapes):
- "intimate_uniform": gaps uniformes 20-49px — próximo, contínuo, íntimo (marca acolhedora).
- "editorial_spaced": gaps 86-120px entre seções — ar de revista premium (marca editorial/luxo).
- "contrast_peaks": extremos deliberados (~0px colado no núcleo de conversão × 100-140px antes de prova social/rodapé) — picos de atenção (clínico/minimal/moda afiada).
- "none": o ritmo atual já serve.

Ferramentas:
- "adjust": muda valores EXISTENTES do inventário spacing_occurrences (index → value_px 0-160). PREFIRA adjust.
- "insert": cria respiro NOVO entre seções — use as junções numeradas de section_junctions (junction → height_px 8-64, típico 24-48; máximo 6 inserções). Use SÓ onde falta respiro estrutural entre duas fases coladas. Cada junção traz beforeBg/afterBg (cor de fundo das seções vizinhas) e o spacer herda essa cor automaticamente. NUNCA insira respiro nas junções do rodapé (logo final, links legais, redes sociais, endereço/unsubscribe) — essa área é um bloco visual contínuo.
- Máximo ~10 adjusts. Não redistribua tudo — ajuste os pontos que violam as 3 leis ou que contradizem a assinatura escolhida.
</spacing_rules>

<output>
Emita SOMENTE o JSON (sem fences, sem prosa), no shape exato:
{"typography":{"strategy":"serif_luxury|personality_sans|mono_weight_contrast|none","rationale":"1-2 frases","display_font":{"family":"Playfair Display","weights":[400,700]} ou null,"targets":[{"index":3,"role":"brand_name","font_weight":700,"letter_spacing":"-1.5px"}]},"shapes":{"stance":"angular_premium|rounded_warm|disciplined_minimal|none","rationale":"1-2 frases","targets":[{"index":4,"radius_px":12}]},"spacing":{"rhythm":"intimate_uniform|editorial_spaced|contrast_peaks|none","rationale":"1-2 frases","adjust":[{"index":5,"value_px":96}],"insert":[{"junction":2,"height_px":64}]}}
- Cada seção aceita "none" de forma independente (com targets/adjust/insert vazios).
- typography "none" → display_font null e targets []. "mono_weight_contrast" → display_font null; targets só com font_weight/letter_spacing.
- weights: apenas os pesos usados nos targets (o sistema gera o @import).
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

<radius_occurrences>
{{radius_occurrences_json}}
</radius_occurrences>

<spacing_occurrences>
{{spacing_occurrences_json}}
</spacing_occurrences>

<section_junctions>
{{section_junctions_json}}
</section_junctions>

Decida a voz visual desta marca (tipografia + formas + ritmo, coerentes entre si) e emita SOMENTE o JSON do delta.`

export interface RefinerChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

export interface InvokeRefinerResult {
  delta: RefinerDeltaV2
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
const VALID_STANCES = new Set([
  "angular_premium",
  "rounded_warm",
  "disciplined_minimal",
  "none",
])
const VALID_RHYTHMS = new Set([
  "intimate_uniform",
  "editorial_spaced",
  "contrast_peaks",
  "none",
])

function parseTypographySection(parsed: Record<string, unknown>): RefinerDelta {
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

function parseShapesSection(raw: unknown): ShapesDelta {
  if (!raw || typeof raw !== "object") return NONE_SHAPES
  const s = raw as Record<string, unknown>
  const stance = typeof s.stance === "string" && VALID_STANCES.has(s.stance)
    ? (s.stance as ShapesDelta["stance"])
    : "none"
  const targets: ShapesTarget[] = []
  if (stance !== "none" && Array.isArray(s.targets)) {
    for (const t of s.targets) {
      if (!t || typeof t !== "object") continue
      const tt = t as Record<string, unknown>
      if (typeof tt.index !== "number" || !Number.isInteger(tt.index)) continue
      if (typeof tt.radius_px !== "number" || !Number.isFinite(tt.radius_px)) continue
      targets.push({ index: tt.index, radius_px: Math.round(tt.radius_px) })
    }
  }
  return {
    stance: targets.length === 0 ? "none" : stance,
    rationale: typeof s.rationale === "string" ? s.rationale : "",
    targets,
  }
}

function parseSpacingSection(raw: unknown): SpacingDelta {
  if (!raw || typeof raw !== "object") return NONE_SPACING
  const s = raw as Record<string, unknown>
  const rhythm = typeof s.rhythm === "string" && VALID_RHYTHMS.has(s.rhythm)
    ? (s.rhythm as SpacingDelta["rhythm"])
    : "none"
  const adjust: SpacingAdjust[] = []
  const insert: SpacingInsert[] = []
  if (rhythm !== "none") {
    if (Array.isArray(s.adjust)) {
      for (const a of s.adjust) {
        if (!a || typeof a !== "object") continue
        const aa = a as Record<string, unknown>
        if (typeof aa.index !== "number" || !Number.isInteger(aa.index)) continue
        if (typeof aa.value_px !== "number" || !Number.isFinite(aa.value_px)) continue
        adjust.push({ index: aa.index, value_px: Math.round(aa.value_px) })
      }
    }
    if (Array.isArray(s.insert)) {
      for (const i of s.insert) {
        if (!i || typeof i !== "object") continue
        const ii = i as Record<string, unknown>
        if (typeof ii.junction !== "number" || !Number.isInteger(ii.junction)) continue
        if (typeof ii.height_px !== "number" || !Number.isFinite(ii.height_px)) continue
        insert.push({ junction: ii.junction, height_px: Math.round(ii.height_px) })
      }
    }
  }
  return {
    rhythm: adjust.length === 0 && insert.length === 0 ? "none" : rhythm,
    rationale: typeof s.rationale === "string" ? s.rationale : "",
    adjust,
    insert,
  }
}

/**
 * Strip fences + parse + validação estrutural. Aceita o shape v2
 * ({typography, shapes, spacing} — seções ausentes viram "none") e o
 * shape v1 flat ({strategy, display_font, targets} — vira só typography),
 * protegendo a janela deploy-antes-de-migration. Exportada para teste.
 */
export function parseRefinerDelta(raw: string): RefinerDeltaV2 {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new RefinerDeltaInvalidError("output sem JSON")

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    throw new RefinerDeltaInvalidError("JSON inválido")
  }

  // Shape v1 flat (compat): strategy na raiz → tudo é typography.
  if (typeof parsed.strategy === "string") {
    return {
      typography: parseTypographySection(parsed),
      shapes: NONE_SHAPES,
      spacing: NONE_SPACING,
    }
  }

  const hasAnySection =
    (parsed.typography && typeof parsed.typography === "object") ||
    (parsed.shapes && typeof parsed.shapes === "object") ||
    (parsed.spacing && typeof parsed.spacing === "object")
  if (!hasAnySection) {
    throw new RefinerDeltaInvalidError("delta sem nenhuma seção reconhecível")
  }

  const typography =
    parsed.typography && typeof parsed.typography === "object"
      ? parseTypographySection(parsed.typography as Record<string, unknown>)
      : NONE_TYPOGRAPHY

  return {
    typography,
    shapes: parseShapesSection(parsed.shapes),
    spacing: parseSpacingSection(parsed.spacing),
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
