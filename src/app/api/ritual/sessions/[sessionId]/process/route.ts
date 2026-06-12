import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"

const log = logger.child("RitualProcess")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/ritual/sessions/[sessionId]/process
 *
 * Processa a gravação do ritual:
 * 1. Lê transcript (se já existir) ou transcreve via Claude
 * 2. Correlaciona trechos com lojas
 * 3. Extrai tasks de cada loja
 * 4. Salva em ritual_sessions.generated_tasks
 *
 * Body opcional: { transcript?: string } — permite colar transcrição manual
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const body = await request.json().catch(() => ({})) as { transcript?: string }

    const { data: session } = await admin
      .from("ritual_sessions")
      .select("id, org_id, store_ids, transcript, recording_url")
      .eq("id", sessionId)
      .maybeSingle()
    if (!session) throw new AppError("Sessão não encontrada", 404)
    if (session.org_id !== (member as { org_id: string }).org_id) throw new AppError("Sem permissão", 403)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError("ANTHROPIC_API_KEY não configurada", 500)

    const ai = new Anthropic({ apiKey })

    // Step 1: Get or set transcript
    let transcript = session.transcript as string | null
    if (body.transcript) {
      transcript = body.transcript
      await admin
        .from("ritual_sessions")
        .update({ transcript, transcript_status: "completed", transcript_processed_at: new Date().toISOString() })
        .eq("id", sessionId)
    }

    if (!transcript) {
      await admin
        .from("ritual_sessions")
        .update({ transcript_status: "processing" })
        .eq("id", sessionId)

      throw new AppError(
        "Transcrição não disponível. Cole a transcrição manualmente no campo transcript ou aguarde o processamento do áudio.",
        400,
      )
    }

    // Step 2: Get store names for correlation
    const storeIds = (session.store_ids ?? []) as string[]
    const { data: stores } = await admin
      .from("client_stores")
      .select("id, store_name, niche, client:clients!client_stores_client_id_fkey(name)")
      .in("id", storeIds.length > 0 ? storeIds : ["__none__"])

    const storeMap = new Map<string, { id: string; name: string; niche: string | null; client: string | null }>()
    for (const s of (stores ?? []) as unknown as Array<{ id: string; store_name: string; niche: string | null; client: { name: string } | null }>) {
      storeMap.set(s.id, { id: s.id, name: s.store_name, niche: s.niche, client: s.client?.name ?? null })
    }

    const storeList = Array.from(storeMap.values()).map((s) => `- ${s.name} (${s.niche ?? "sem nicho"}, cliente ${s.client ?? "N/A"})`).join("\n")

    // Step 3: Correlate transcript with stores + extract tasks
    await admin
      .from("ritual_sessions")
      .update({ transcript_status: "processing" })
      .eq("id", sessionId)

    const extractionPrompt = `Você é assistente da Convertfy. Abaixo está a transcrição de uma call do ritual semanal onde o time discutiu várias lojas.

LOJAS DISCUTIDAS:
${storeList}

TRANSCRIÇÃO:
${transcript.slice(0, 80000)}

TAREFA: Extraia TODAS as decisões e ações concretas discutidas para cada loja.

Retorne APENAS JSON válido no formato:
{
  "tasks": [
    {
      "store_name": "Nome da Loja",
      "title": "Título da ação (verbo no infinitivo, específico)",
      "owner_role": "cs" | "designer" | "estrategista" | "ops",
      "priority": "high" | "medium" | "low",
      "due_hint": "Hoje | Seg | Ter | Qua | Qui | Sex | Próxima semana",
      "origin_quote": "Trecho exato da transcrição entre aspas"
    }
  ],
  "discarded": [
    {
      "text": "O que foi dito",
      "reason": "Por que não é acionável"
    }
  ]
}

REGRAS:
- Só extraia ações CONCRETAS com responsável claro
- Priorize pela urgência mencionada na call
- Se o time disse "deixa pra depois" ou "vamos pensar", coloque em discarded
- Se não identificar a loja de uma ação, use a loja mais recente no contexto
- Máximo 5 tasks por loja, escolha as mais impactantes
- origin_quote deve ser trecho literal da transcrição`

    const llmT0 = Date.now()
    const response = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: extractionPrompt }],
    })

    void recordAiUsage({
      feature: "ritual_process",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - llmT0,
      context: { session_id: sessionId },
    })

    const responseText = response.content[0]?.type === "text" ? response.content[0].text : ""

    let parsed: { tasks: Array<Record<string, unknown>>; discarded: Array<Record<string, unknown>> }
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { tasks: [], discarded: [] }
    } catch {
      log.error("Falha ao parsear JSON da IA", { sessionId, text: responseText.slice(0, 500) })
      parsed = { tasks: [], discarded: [] }
    }

    // Map store_name back to store_id
    const nameToId = new Map<string, string>()
    for (const [id, info] of storeMap) {
      nameToId.set(info.name.toLowerCase(), id)
    }

    const enrichedTasks = (parsed.tasks ?? []).map((t) => {
      const storeName = (t.store_name as string || "").toLowerCase()
      const matchedId = nameToId.get(storeName) ?? storeIds[0] ?? null
      return { ...t, store_id: matchedId }
    })

    await admin
      .from("ritual_sessions")
      .update({
        generated_tasks: { tasks: enrichedTasks, discarded: parsed.discarded ?? [] },
        transcript_status: "completed",
        transcript_processed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)

    log.info("[RitualProcess] extraction done", {
      sessionId,
      tasksExtracted: enrichedTasks.length,
      discarded: (parsed.discarded ?? []).length,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    })

    return successResponse(request, {
      tasks: enrichedTasks,
      discarded: parsed.discarded ?? [],
      tokens: {
        input: response.usage?.input_tokens,
        output: response.usage?.output_tokens,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "RitualProcess")
  }
}

/**
 * GET /api/ritual/sessions/[sessionId]/process
 *
 * Retorna status do processamento + tasks geradas.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const { data: session } = await admin
      .from("ritual_sessions")
      .select("id, org_id, transcript_status, transcript_processed_at, generated_tasks, recording_url, recording_uploaded_at")
      .eq("id", sessionId)
      .maybeSingle()
    if (!session) throw new AppError("Sessão não encontrada", 404)
    if (session.org_id !== (member as { org_id: string }).org_id) throw new AppError("Sem permissão", 403)

    return successResponse(request, {
      transcript_status: session.transcript_status,
      transcript_processed_at: session.transcript_processed_at,
      has_recording: !!session.recording_url,
      recording_uploaded_at: session.recording_uploaded_at,
      generated_tasks: session.generated_tasks,
    })
  } catch (error) {
    return errorResponse(request, error, "RitualProcessStatus")
  }
}
