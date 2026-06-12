/**
 * POST /api/admin/stores/[id]/process-briefing
 *
 * Trata o briefing da loja com IA, transformando inputs brutos em
 * texto profissional voltado pra equipe (designers + copywriters).
 *
 * Sem ANTHROPIC_API_KEY: usa fallback baseado nos dados da loja.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"

const log = logger.child("ProcessBriefing")

export const dynamic = "force-dynamic"

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    marca: {
      type: "object",
      properties: {
        nicho: { type: "string" },
        diferencial: { type: "string" },
        persona: { type: "string" },
        slogan: { type: ["string", "null"] },
        tom_voz: {
          type: "string",
          enum: ["formal", "casual", "afetivo", "divertido"],
        },
        posicionamento: {
          type: "string",
          enum: ["popular", "medio", "premium"],
        },
        hashtags: { type: "array", items: { type: "string" } },
      },
      required: ["nicho", "tom_voz", "posicionamento"],
    },
    briefing: {
      type: "object",
      properties: {
        nivel_liberdade: {
          type: "string",
          enum: ["Alto", "Médio", "Baixo"],
        },
        conceito: { type: "string" },
        diferenciais: { type: "array", items: { type: "string" } },
        restricoes: { type: "array", items: { type: "string" } },
        competidores: { type: "array", items: { type: "string" } },
      },
      required: ["nivel_liberdade", "diferenciais", "restricoes"],
    },
  },
  required: ["marca", "briefing"],
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

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id, store_name, store_url, platform, niche")
      .eq("id", storeId)
      .single()

    if (storeErr || !store) {
      throw new Error("Loja nao encontrada")
    }

    // Pega briefing anterior se houver pra usar como raw_input
    const { data: prev } = await admin
      .from("store_briefings")
      .select("version, raw_input, marca, briefing")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    let result = await processBriefingWithAI(store, prev?.raw_input)
    if (!result) {
      result = generateFallbackBriefing(store)
    }

    const nextVersion = (prev?.version ?? 0) + 1
    const { data, error } = await admin
      .from("store_briefings")
      .insert({
        store_id: storeId,
        version: nextVersion,
        raw_input: prev?.raw_input ?? null,
        marca: result.marca,
        briefing: result.briefing,
        source: "ai_treatment",
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error
    log.info("[ProcessBriefing] success", {
      store_id: storeId,
      version: nextVersion,
    })

    return successResponse(request, { briefing: data })
  } catch (error) {
    log.error("ProcessBriefing error:", error)
    return errorResponse(request, error, "process-briefing")
  }
}

interface BriefingResult {
  marca: Record<string, unknown>
  briefing: Record<string, unknown>
  _source: "ai" | "fallback"
}

async function processBriefingWithAI(
  store: {
    store_name: string
    store_url: string | null
    niche: string | null
  },
  rawInput: unknown,
): Promise<BriefingResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const systemPrompt = `Você está organizando informações brutas que um cliente enviou via formulário, transformando-as em briefing claro para a equipe interna (designers e copywriters).

Sua função:
1. EXTRAIR e ORGANIZAR em 2 categorias:
   - MARCA: nicho, persona, slogan, tom de voz, posicionamento, hashtags
   - BRIEFING: nivel_liberdade, conceito, diferenciais (verde), restrições (âmbar), competidores
2. REESCREVA em linguagem profissional voltada ao designer (terceira pessoa).
3. INFERIR quando há dados (ex: ticket R$ 300+ → posicionamento "premium").
4. Para "tom_voz" escolha: formal | casual | afetivo | divertido
5. Para "posicionamento" escolha: popular | medio | premium
6. Não copie texto literal.`

  const userMsg = `Loja: ${store.store_name}
URL: ${store.store_url ?? "—"}
Nicho: ${store.niche ?? "—"}

Raw input: ${JSON.stringify(rawInput ?? {})}

Gere briefing tratado.`

  const MODEL = "claude-haiku-4-5-20251001"
  const t0 = Date.now()
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tools: [
          {
            name: "save_briefing",
            description: "Salva o briefing tratado",
            input_schema: BRIEFING_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "save_briefing" },
      }),
    })
    if (!res.ok) {
      log.warn("[ProcessBriefing] AI HTTP error", { status: res.status })
      void recordAiUsage({
        feature: "process_briefing",
        model: MODEL,
        provider: "anthropic",
        status: "error",
        durationMs: Date.now() - t0,
        errorMessage: `HTTP ${res.status}`,
      })
      return null
    }
    const json = (await res.json()) as {
      content: Array<{ type: string; input?: unknown }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    void recordAiUsage({
      feature: "process_briefing",
      model: MODEL,
      provider: "anthropic",
      tokensInput: json.usage?.input_tokens ?? 0,
      tokensOutput: json.usage?.output_tokens ?? 0,
      durationMs: Date.now() - t0,
    })
    const toolUse = json.content.find((c) => c.type === "tool_use") as
      | { input: { marca: Record<string, unknown>; briefing: Record<string, unknown> } }
      | undefined
    if (!toolUse?.input) return null
    return {
      marca: toolUse.input.marca,
      briefing: toolUse.input.briefing,
      _source: "ai",
    }
  } catch (e) {
    log.warn("[ProcessBriefing] AI call failed:", e)
    return null
  }
}

function generateFallbackBriefing(store: {
  store_name: string
  niche: string | null
}): BriefingResult {
  const niche = (store.niche ?? "E-commerce").trim()
  return {
    marca: {
      nicho: niche,
      diferencial: "—",
      persona: "Público-alvo a definir conforme dados Shopify",
      slogan: null,
      tom_voz: "casual",
      posicionamento: "medio",
      hashtags: [store.store_name.toLowerCase()],
    },
    briefing: {
      nivel_liberdade: "Médio",
      aprova_antes: "Cliente aprova antes do envio",
      sensibilidade: "—",
      conceito: "—",
      diferenciais: ["A definir após onboarding"],
      restricoes: ["A definir após onboarding"],
      competidores: [],
    },
    _source: "fallback",
  }
}
