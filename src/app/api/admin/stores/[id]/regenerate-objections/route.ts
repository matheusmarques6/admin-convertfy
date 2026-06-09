/**
 * POST /api/admin/stores/[id]/regenerate-objections
 *
 * Regenera as 5 "Objeções principais" do Cliente Ideal (Pilar 3 da Pesquisa)
 * usando IA in-process (Anthropic Messages API direto, sem SDK — mesmo padrão
 * de process-briefing). Persiste em client_stores.icp_objections e devolve o
 * array para a UI atualizar sem reload.
 *
 * Requer ANTHROPIC_API_KEY e algum contexto de ICP (persona / dia-na-vida /
 * motivações) — caso contrário responde 400.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("RegenerateObjections")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const OBJECTIONS_SCHEMA = {
  type: "object",
  properties: {
    objections: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          objection: { type: "string", description: "Dúvida/objeção na voz da cliente (1ª pessoa, coloquial)" },
          treatment: { type: "string", description: "Como tratar: prova, oferta ou conteúdo específico da loja" },
        },
        required: ["objection", "treatment"],
        additionalProperties: false,
      },
    },
  },
  required: ["objections"],
  additionalProperties: false,
}

interface Objection {
  objection: string
  treatment: string
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select(
        "id, store_name, niche, brand_thesis, brand_about, icp_persona, icp_demographics, icp_day_in_life, icp_motivations, icp_frictions, icp_unique_mechanism",
      )
      .eq("id", storeId)
      .single()

    if (storeErr || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    const hasContext =
      store.icp_persona ||
      store.icp_day_in_life ||
      (Array.isArray(store.icp_motivations) && store.icp_motivations.length > 0)
    if (!hasContext) {
      throw new AppError(
        "Defina a persona (ICP) antes de gerar objeções com IA.",
        400,
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new AppError("ANTHROPIC_API_KEY não configurada", 502)
    }

    const objections = await generateObjections(store, apiKey)
    if (!objections) {
      throw new AppError("A IA não retornou objeções válidas. Tente novamente.", 502)
    }

    const { error } = await admin
      .from("client_stores")
      .update({ icp_objections: objections })
      .eq("id", storeId)
    if (error) throw error

    log.info("[RegenerateObjections] success", { store_id: storeId, count: objections.length })
    return successResponse(request, { objections })
  } catch (error) {
    log.error("RegenerateObjections error:", error)
    return errorResponse(request, error, "regenerate-objections")
  }
}

async function generateObjections(
  store: {
    store_name: string | null
    niche: string | null
    brand_thesis: string | null
    brand_about: string | null
    icp_persona: { name?: string; age?: string; city?: string } | null
    icp_demographics: Record<string, string> | null
    icp_day_in_life: string | null
    icp_motivations: string[] | null
    icp_frictions: string[] | null
    icp_unique_mechanism: { headline?: string; body?: string } | null
  },
  apiKey: string,
): Promise<Objection[] | null> {
  const systemPrompt = `Você é estrategista de copywriting de resposta direta.
Dado o ICP (cliente ideal) de uma loja, gere EXATAMENTE 5 objeções principais — as
dúvidas reais que a cliente trava antes de comprar — e como tratar cada uma.

Regras:
- "objection": escreva na VOZ da cliente, 1ª pessoa, coloquial (ex.: "Será que esse tecido é fininho?").
- "treatment": ação concreta e específica do contexto da loja (prova/UGC, oferta, política, conteúdo).
- Sem repetir objeções; cubra preço/frete, qualidade, confiança/risco, prazo e adequação.
- Português do Brasil, direto, sem rodeios.`

  const persona = store.icp_persona
  const ctx = [
    `Loja: ${store.store_name ?? "—"}`,
    `Nicho: ${store.niche ?? "—"}`,
    persona ? `Persona: ${persona.name ?? "—"}, ${persona.age ?? "—"} · ${persona.city ?? "—"}` : null,
    store.icp_demographics
      ? `Demografia: ${Object.entries(store.icp_demographics).map(([k, v]) => `${k}=${v}`).join("; ")}`
      : null,
    store.brand_thesis ? `Tese da marca: ${store.brand_thesis}` : null,
    store.brand_about ? `Sobre a marca: ${store.brand_about}` : null,
    store.icp_unique_mechanism?.body ? `Mecanismo único: ${store.icp_unique_mechanism.body}` : null,
    store.icp_day_in_life ? `Um dia na vida: ${store.icp_day_in_life}` : null,
    store.icp_motivations?.length ? `Motivações: ${store.icp_motivations.join(" | ")}` : null,
    store.icp_frictions?.length ? `Atritos: ${store.icp_frictions.join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")

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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: `${ctx}\n\nGere as 5 objeções e tratamentos.` }],
        tools: [
          {
            name: "save_objections",
            description: "Salva as 5 objeções e seus tratamentos",
            input_schema: OBJECTIONS_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "save_objections" },
      }),
    })
    if (!res.ok) {
      log.warn("[RegenerateObjections] AI HTTP error", { status: res.status })
      return null
    }
    const json = (await res.json()) as { content: Array<{ type: string; input?: unknown }> }
    const toolUse = json.content.find((c) => c.type === "tool_use") as
      | { input: { objections: Objection[] } }
      | undefined
    const objections = toolUse?.input?.objections
    if (!Array.isArray(objections) || objections.length === 0) return null
    // Sanitiza: mantém só itens completos
    const clean = objections
      .filter((o) => o && typeof o.objection === "string" && typeof o.treatment === "string")
      .map((o) => ({ objection: o.objection.trim(), treatment: o.treatment.trim() }))
      .filter((o) => o.objection && o.treatment)
    return clean.length > 0 ? clean : null
  } catch (e) {
    log.warn("[RegenerateObjections] AI call failed:", e)
    return null
  }
}
