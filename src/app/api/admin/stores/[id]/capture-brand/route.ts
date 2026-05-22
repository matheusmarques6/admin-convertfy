/**
 * POST /api/admin/stores/[id]/capture-brand
 *
 * Dispara a captura automática de identidade visual da loja via IA.
 *
 * Fluxo:
 *   1. Le store_url da loja
 *   2. Chama Anthropic Claude com structured output pra extrair:
 *      - logos (svg/png placeholders por hora)
 *      - cores principais e secundárias
 *      - tipografia (heading + body)
 *      - tom de voz
 *      - trust icons sugeridos
 *   3. Cria nova versão em store_brand_identity
 *
 * Implementação atual: stub determinístico baseado no store_url +
 * nome da loja. Anthropic integration plugada via ANTHROPIC_API_KEY
 * — sem a key, retorna fallback razoável (não mock; é melhor que
 * deixar o usuario travado sem nada).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CaptureBrand")

export const dynamic = "force-dynamic"

interface AnthropicResponseContent {
  type: string
  text?: string
}

interface AnthropicResponse {
  content: AnthropicResponseContent[]
}

const BRAND_IDENTITY_SCHEMA = {
  type: "object",
  properties: {
    colors_primary: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          name: { type: "string" },
          role: {
            type: "string",
            enum: ["Principal", "Fundo", "Destaque"],
          },
        },
        required: ["hex", "name", "role"],
      },
    },
    colors_secondary: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          name: { type: "string" },
          role: { type: "string" },
        },
        required: ["hex", "name"],
      },
    },
    font_heading: { type: ["string", "null"] },
    font_heading_weight: {
      type: ["string", "null"],
      description: "Peso da fonte de headlines, ex: 'Black 900', 'Bold 700'.",
    },
    font_body: { type: ["string", "null"] },
    font_body_weight: {
      type: ["string", "null"],
      description: "Peso da fonte de body, ex: 'Regular 400 / Medium 500'.",
    },
    voice: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
    },
  },
  required: ["colors_primary", "voice"],
  additionalProperties: false,
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // 1. Le store
    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id, store_name, store_url, platform, niche")
      .eq("id", storeId)
      .single()

    if (storeErr || !store) {
      throw new Error("Loja nao encontrada")
    }

    // 2. Chama Anthropic se disponivel; fallback determinístico caso contrário
    let identity = await captureBrandWithAI(store)

    // Fallback resiliente: se IA falhou, gera identidade básica
    if (!identity) {
      identity = generateFallbackIdentity(store)
    }

    // 3. Pega versão atual pra incrementar
    const { data: last } = await admin
      .from("store_brand_identity")
      .select("version")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (last?.version ?? 0) + 1

    const { data, error } = await admin
      .from("store_brand_identity")
      .insert({
        store_id: storeId,
        version: nextVersion,
        colors_primary: identity.colors_primary,
        colors_secondary: identity.colors_secondary ?? [],
        font_heading: identity.font_heading ?? null,
        font_heading_weight: identity.font_heading_weight ?? null,
        font_body: identity.font_body ?? null,
        font_body_weight: identity.font_body_weight ?? null,
        voice: identity.voice ?? [],
        // trust_icons agora sao PNGs uploadados manualmente pelo designer.
        // IA nao consegue gerar imagens, entao sempre [] na captura.
        trust_icons: [],
        top_products: [],
        source: "ai_capture",
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    log.info("[CaptureBrand] success", {
      store_id: storeId,
      version: nextVersion,
      via_ai: identity._source === "ai",
    })

    return successResponse(request, { brand: data, source: identity._source })
  } catch (error) {
    log.error("CaptureBrand error:", error)
    return errorResponse(request, error, "capture-brand")
  }
}

interface CapturedIdentity {
  colors_primary: Array<{ hex: string; name: string; role: string }>
  colors_secondary?: Array<{ hex: string; name: string; role?: string }>
  font_heading?: string | null
  font_heading_weight?: string | null
  font_body?: string | null
  font_body_weight?: string | null
  voice?: string[]
  _source: "ai" | "fallback"
}

async function captureBrandWithAI(store: {
  store_name: string
  store_url: string | null
  niche: string | null
}): Promise<CapturedIdentity | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    log.warn(
      "[CaptureBrand] ANTHROPIC_API_KEY ausente; usando fallback deterministico",
    )
    return null
  }

  const systemPrompt = `Você é especialista em identidade visual de e-commerces brasileiros analisando uma loja para uma agência de email marketing que vai criar campanhas alinhadas com a marca.

Com base apenas no nome da loja e nicho, sugira uma identidade visual razoável que sirva como ponto de partida.

Regras:
- Cores em hex #RRGGBB
- Pelo menos 1 cor primária (Principal) e tente sugerir 2-3 secundárias
- Tom de voz: 3-5 adjetivos curtos em PT-BR
- Trust icons em PORTUGUÊS uppercase nos titles
- Se o nicho sugere certa paleta (ex: esportes → cores vibrantes), use isso`

  const userMsg = `Loja: ${store.store_name}
URL: ${store.store_url ?? "—"}
Nicho: ${store.niche ?? "—"}

Sugira identidade visual.`

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tools: [
          {
            name: "save_brand_identity",
            description: "Salva a identidade visual sugerida",
            input_schema: BRAND_IDENTITY_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "save_brand_identity" },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      log.warn("[CaptureBrand] Anthropic API erro", {
        status: res.status,
        body: body.slice(0, 500),
      })
      return null
    }

    const json = (await res.json()) as AnthropicResponse
    const toolUse = json.content.find(
      (c) => c.type === "tool_use",
    ) as unknown as { input: Record<string, unknown> } | undefined
    if (!toolUse?.input) {
      return null
    }
    const parsed = toolUse.input as unknown as CapturedIdentity
    parsed._source = "ai"
    return parsed
  } catch (e) {
    log.warn("[CaptureBrand] AI call failed:", e)
    return null
  }
}

function generateFallbackIdentity(store: {
  store_name: string
  niche: string | null
}): CapturedIdentity {
  // Deriva cor primária do hash do nome (consistente)
  const name = store.store_name
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  const palette = [
    { hex: "#4E62D8", name: "Brand Blue" },
    { hex: "#2547F5", name: "Royal Blue" },
    { hex: "#1E40AF", name: "Deep Blue" },
    { hex: "#7C3AED", name: "Purple" },
    { hex: "#DC2626", name: "Red" },
    { hex: "#059669", name: "Green" },
    { hex: "#D97706", name: "Amber" },
    { hex: "#0F172A", name: "Slate" },
  ]
  const primary = palette[Math.abs(h) % palette.length]

  return {
    colors_primary: [
      { hex: primary.hex, name: primary.name, role: "Principal" },
      { hex: "#0F0F0F", name: "Preto", role: "Fundo" },
    ],
    colors_secondary: [
      { hex: "#F8F8F8", name: "Off white", role: "Background" },
      { hex: "#2A2A2A", name: "Carbon", role: "Texto" },
      { hex: "#999999", name: "Gray 50", role: "Secundario" },
    ],
    font_heading: "Inter",
    font_heading_weight: "Black 900",
    font_body: "Inter",
    font_body_weight: "Regular 400 / Medium 500",
    voice: ["Direto", "Confiante", "Próximo"],
    _source: "fallback",
  }
}
