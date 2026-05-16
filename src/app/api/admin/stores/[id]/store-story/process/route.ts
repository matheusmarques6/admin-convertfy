/**
 * POST /api/admin/stores/[id]/store-story/process
 *
 * Lê history_raw + milestones_raw de store_onboarding_data, processa via
 * Claude Haiku 4.5 e persiste o resultado limpo em:
 *   - client_stores.store_story (3 parágrafos estruturados)
 *   - client_stores.store_milestones (jsonb array de {date, description})
 *
 * Idempotente: sobrescreve os campos a cada execução.
 * Sem ANTHROPIC_API_KEY: copia o conteúdo bruto direto (fallback).
 */

import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreStoryProcess")

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface MilestoneRaw {
  date?: string | null
  description?: string | null
}

// Formato canônico esperado pelo UI (PesquisaSection.Milestone):
//   { year: string, event: string, highlight?: boolean, muted?: boolean }
interface ProcessedMilestone {
  year: string
  event: string
  highlight?: boolean
  muted?: boolean
}

interface AIOutput {
  story: string
  milestones: ProcessedMilestone[]
}

function extractYear(raw: string | null | undefined): string {
  if (!raw) return "—"
  const trimmed = raw.trim()
  const yearMatch = trimmed.match(/(\d{4})/)
  return yearMatch ? yearMatch[1] : trimmed
}

function fallback(historyRaw: string | null, milestonesRaw: MilestoneRaw[] | null): AIOutput {
  return {
    story: historyRaw?.trim() ?? "",
    milestones: (milestonesRaw ?? [])
      .filter((m) => m.description?.trim())
      .map((m) => ({
        year: extractYear(m.date),
        event: m.description!.trim(),
      })),
  }
}

function parseAi(raw: string, fb: AIOutput): AIOutput {
  try {
    const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*\})/)
    const text = match ? match[1] : raw
    const parsed = JSON.parse(text) as Partial<AIOutput>

    const story = typeof parsed.story === "string" && parsed.story.trim() ? parsed.story.trim() : fb.story
    const milestones = Array.isArray(parsed.milestones)
      ? parsed.milestones
          .map((m) => {
            const event = typeof m?.event === "string" ? m.event.trim() : ""
            if (!event) return null
            const year = typeof m?.year === "string" && m.year.trim() ? m.year.trim() : "—"
            return { year, event } satisfies ProcessedMilestone
          })
          .filter((m): m is ProcessedMilestone => m !== null)
          .slice(0, 20)
      : fb.milestones

    return { story, milestones }
  } catch (err) {
    log.warn("Falha ao parsear JSON do AI, usando fallback", err)
    return fb
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id, store_name, niche")
      .eq("id", storeId)
      .single()
    if (storeErr || !store) throw new AppError("Loja não encontrada", 404)

    const { data: od } = await admin
      .from("store_onboarding_data")
      .select("history_raw, milestones_raw")
      .eq("store_id", storeId)
      .maybeSingle()

    const historyRaw = ((od as { history_raw?: string | null } | null)?.history_raw ?? null) as string | null
    const milestonesRaw = ((od as { milestones_raw?: MilestoneRaw[] | null } | null)?.milestones_raw ?? null) as MilestoneRaw[] | null

    if (!historyRaw && !(milestonesRaw && milestonesRaw.length > 0)) {
      throw new AppError(
        "Nenhum conteúdo de história ou marcos preenchido no formulário",
        400,
      )
    }

    const fb = fallback(historyRaw, milestonesRaw)
    let result = fb

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey && historyRaw) {
      try {
        const client = new Anthropic({ apiKey })
        const systemPrompt = `Você é um editor da Convertfy especializado em transformar narrativas brutas de fundadores em histórias de marca claras e estruturadas.

Loja: ${(store as { store_name: string }).store_name}
Nicho: ${(store as { niche: string | null }).niche ?? "—"}

Saída em JSON puro, sem markdown ou preâmbulo.`

        const userPrompt = `Transforme o texto bruto do fundador em uma história de 3 parágrafos curtos (cada um com 2-4 frases) seguindo esta estrutura:
1) Origem — quando/por que a marca nasceu
2) Jornada — desafios, virada de chave, evolução
3) Hoje — posicionamento e ambição

E organize os marcos em ordem cronológica.

Devolva JSON exato:
{
  "story": "<3 parágrafos separados por \\n\\n>",
  "milestones": [
    {"year": "YYYY", "event": "<marco curto, 1 frase>"}
  ]
}

Regras:
- PT-BR, sem emoji, sem hype ("revolucionário", "incrível"), sem clichês
- year: extraia o ano (4 dígitos) das datas brutas; se não houver, use "—"
- event: 1 frase curta descrevendo o marco
- Máximo 10 marcos, priorize os mais significativos
- Mantenha o tom do fundador, só limpe e estruture

Texto bruto da história:
\`\`\`
${historyRaw}
\`\`\`

${milestonesRaw && milestonesRaw.length > 0 ? `Marcos brutos:\n\`\`\`json\n${JSON.stringify(milestonesRaw, null, 2)}\n\`\`\`` : "Sem marcos brutos."}`

        const aiResult = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        })

        const block = aiResult.content[0]
        if (block && block.type === "text") {
          result = parseAi(block.text, fb)
        }
      } catch (err) {
        log.error("Anthropic call failed, using fallback", err)
        result = fb
      }
    }

    const { error: updateErr } = await admin
      .from("client_stores")
      .update({
        store_story: result.story,
        store_milestones: result.milestones,
      })
      .eq("id", storeId)
    if (updateErr) throw updateErr

    return successResponse(request, {
      store_id: storeId,
      story_length: result.story.length,
      milestones_count: result.milestones.length,
      ai_used: !!apiKey,
    })
  } catch (error) {
    return errorResponse(request, error, "admin/stores/store-story/process")
  }
}
