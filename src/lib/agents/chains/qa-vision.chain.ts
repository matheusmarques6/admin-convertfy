/**
 * QA Vision Chain — Etapa 2 do QA cascade (story AE-15).
 *
 * Avalia visualmente uma imagem hero gerada (Claude Sonnet 4.6 com vision)
 * em 3 dimensoes: paleta, overlay reserve, cena. Dispara somente quando:
 *   - EMAIL_QA_VISION_ENABLED === 'true'
 *   - Etapa 1 (textual `qa.chain.ts`) NAO reportou
 *     `image_nicho_mismatch` severity=high (filtro determinístico)
 *
 * Custo aproximado: ~1.5¢/email quando dispara. Default OFF.
 *
 * Falha graceful: qualquer erro (timeout, JSON invalido, vision API down)
 * retorna `issues: []` + log.warn. Nunca bloqueia o `passed` do textual.
 */

import { ChatAnthropic } from "@langchain/anthropic"
import { z } from "zod"

import { logger } from "@/lib/logger"
import type { QaIssue, QaIssueSeverity } from "@/types/email-generation"

const log = logger.child("QaVisionChain")

const VISION_TIMEOUT_MS = 10_000
const VISION_MODEL = "claude-sonnet-4-6"
const VISION_MAX_TOKENS = 800
const VISION_TEMPERATURE = 0.2
// Estimativa MVP: 1KB input + 0.5KB output via Claude Sonnet 4.6 (~$3/MTok
// input, $15/MTok output) → ~$0.015 = 1.5 cents. Refinar com response.usage
// quando a chain expuser.
const VISION_COST_CENTS_ESTIMATE = 1.5

const VISION_ISSUE_TYPES = [
  "image_paleta_off",
  "image_overlay_reserva_ausente",
  "image_cena_inadequada",
] as const

const SEVERITIES = ["low", "medium", "high"] as const satisfies readonly QaIssueSeverity[]

const VisionIssueSchema = z.object({
  type: z.enum(VISION_ISSUE_TYPES),
  severity: z.enum(SEVERITIES),
  message: z.string().min(1),
  location: z.string().optional(),
})

const VisionOutputSchema = z.object({
  issues: z.array(VisionIssueSchema),
})

export interface RunQaVisionCheckInput {
  imageUrl: string
  nicho: string
  produtoHeroi: string
  paleta1: string
  paleta2: string
  overlayReserveExpected: boolean
  /** Bloco onde a imagem esta (pra location), ex "block:0:hero". */
  location?: string
}

export interface RunQaVisionCheckResult {
  issues: QaIssue[]
  costCents: number
  durationMs: number
}

function tryParseVisionJson(raw: string): unknown | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        /* fall-through */
      }
    }
  }
  return null
}

/**
 * Roda QA visual em uma imagem.
 *
 * Sempre retorna — nunca throw. Em caso de erro, retorna 0 issues
 * + log.warn pro caller decidir como tratar.
 */
export async function runQaVisionCheck(
  input: RunQaVisionCheckInput,
): Promise<RunQaVisionCheckResult> {
  const start = Date.now()

  const systemPrompt = `Voce e um QA visual de email marketing. Avalie a imagem fornecida em 3 dimensoes:

1. PALETA: as cores dominantes da imagem batem com a paleta da marca? (paleta principal=${input.paleta1 || "n/a"}, secundaria=${input.paleta2 || "n/a"})
2. OVERLAY RESERVE: o terco inferior da imagem ${input.overlayReserveExpected ? "DEVE estar mais escuro/limpo para receber overlay de texto" : "NAO precisa estar reservado para texto"}.
3. CENA: a cena e coerente com NICHO="${input.nicho || "n/a"}" e PRODUTO_HEROI="${input.produtoHeroi || "n/a"}"? (ambiente, contexto, mood)

Retorne JSON estrito no formato:
{"issues": [{"type": "...", "severity": "low|medium|high", "message": "..."}]}

Tipos permitidos:
- image_paleta_off: cores dominantes nao batem com paleta
- image_overlay_reserva_ausente: terco inferior nao reservado quando esperado
- image_cena_inadequada: ambiente/mood incompativel com nicho/posicionamento

Severity:
- high: defeito grave (paleta totalmente errada, cena descontextualizada)
- medium: nuances perceptiveis mas aceitaveis
- low: pequenas observacoes

Se tudo OK: {"issues": []}.
Responda APENAS o JSON, sem markdown, sem texto extra.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

  try {
    const llm = new ChatAnthropic({
      model: VISION_MODEL,
      temperature: VISION_TEMPERATURE,
      maxTokens: VISION_MAX_TOKENS,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    })

    // LangChain ChatAnthropic aceita HumanMessage com content array
    // (multimodal) — image_url + text. Formato espelha o esperado pelo
    // Anthropic Messages API.
    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: [
          { type: "image_url" as const, image_url: { url: input.imageUrl } },
          {
            type: "text" as const,
            text: "Avalie esta imagem hero conforme as 3 dimensoes.",
          },
        ],
      },
    ]

    const result = await llm.invoke(messages, { signal: controller.signal })
    const raw =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content
              .map((c) =>
                typeof c === "string"
                  ? c
                  : c && typeof c === "object" && "text" in c
                    ? String((c as { text: unknown }).text)
                    : "",
              )
              .join("")
          : ""

    const parsed = tryParseVisionJson(raw)
    if (!parsed) {
      log.warn("qa.vision.parse_failed", {
        imageUrl: input.imageUrl,
        rawSample: raw.slice(0, 200),
      })
      return { issues: [], costCents: 0, durationMs: Date.now() - start }
    }

    const zod = VisionOutputSchema.safeParse(parsed)
    if (!zod.success) {
      log.warn("qa.vision.zod_failed", {
        imageUrl: input.imageUrl,
        error: zod.error.message.slice(0, 200),
      })
      return { issues: [], costCents: 0, durationMs: Date.now() - start }
    }

    // Decora cada issue com location (se nao veio do LLM).
    const issues: QaIssue[] = zod.data.issues.map((iss) => ({
      type: iss.type,
      severity: iss.severity,
      message: iss.message,
      location: iss.location ?? input.location ?? "image",
    }))

    return {
      issues,
      costCents: VISION_COST_CENTS_ESTIMATE,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const aborted = controller.signal.aborted
    log.warn("qa.vision.failed", {
      imageUrl: input.imageUrl,
      aborted,
      error: msg,
    })
    return { issues: [], costCents: 0, durationMs: Date.now() - start }
  } finally {
    clearTimeout(timer)
  }
}
