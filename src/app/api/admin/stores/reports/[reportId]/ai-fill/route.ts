/**
 * POST /api/admin/stores/reports/[reportId]/ai-fill
 *
 * Preenche o snapshot do relatório com leituras editoriais (insights)
 * geradas pela Anthropic SDK. Para cada slide, gera 1 frase curta
 * em PT-BR baseada nos KPIs já presentes no snapshot.
 *
 * Modelo: Claude Haiku 4.5 (rapido + barato pra essa task de leitura).
 */

import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SLIDE_PROMPTS = [
  { key: "capa", instruction: "Mensagem editorial de boas-vindas pro mês. Tom acolhedor e profissional. Máx 140 caracteres." },
  { key: "resumo", instruction: "Leitura do mês com base nos KPIs principais. Foque em receita e atribuição. Máx 180 caracteres." },
  { key: "atribuida", instruction: "Análise da receita atribuída e split por canal. Aponte canais dominantes e oportunidade. Máx 180 caracteres." },
  { key: "email", instruction: "Leitura dos resultados de e-mail vs benchmark. Aponte o que está acima/abaixo. Máx 180 caracteres." },
  { key: "rankings", instruction: "Insight sobre top campanhas e flows. Padrões observados. Máx 180 caracteres." },
  { key: "trabalho", instruction: "Vitórias do mês baseadas no trabalho realizado (otimizações, testes). Tom celebratório. Máx 180 caracteres." },
  { key: "proximos", instruction: "Compromisso pros próximos 30 dias. Foco em valor e parceria. Máx 160 caracteres." },
] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // Carrega o relatório com snapshot
    const { data: report, error: fetchErr } = await admin
      .from("client_monthly_reports")
      .select("snapshot, tone, month_label, store_id")
      .eq("id", reportId)
      .single()
    if (fetchErr || !report) throw new AppError("Relatório não encontrado", 404)

    // Carrega contexto da loja pra IA ter referencia
    const { data: store } = await admin
      .from("client_stores")
      .select("store_name, niche, tom_de_voz, persona, diferencial")
      .eq("id", report.store_id)
      .single()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Sem API key: gera fallbacks deterministicos
      const fallbackInsights: Record<string, string> = {}
      for (const s of SLIDE_PROMPTS) {
        fallbackInsights[s.key] = fallbackInsight(s.key, report.snapshot)
      }
      await admin
        .from("client_monthly_reports")
        .update({
          snapshot: { ...(report.snapshot as object ?? {}), insights: fallbackInsights },
          ai_filled: false,
        })
        .eq("id", reportId)
      return successResponse(request, {
        ai_filled: false,
        insights: fallbackInsights,
        warning: "ANTHROPIC_API_KEY não configurada — usando fallback editorial.",
      })
    }

    const client = new Anthropic({ apiKey })

    // Sistema prompt — contexto da loja + tom desejado
    const systemPrompt = `Você é um analista de Customer Success da Convertfy escrevendo leituras editoriais para um relatório mensal cliente-facing.

Loja: ${store?.store_name ?? "—"}
Nicho: ${store?.niche ?? "—"}
Tom de voz da marca: ${store?.tom_de_voz ?? "profissional"}
Diferencial: ${store?.diferencial ?? "—"}
Mês: ${report.month_label}
Tom do relatório: ${report.tone}

Regras:
- Escreva em PT-BR
- Tom ${report.tone === "editorial" ? "editorial e analítico" : report.tone === "corporate" ? "corporate sóbrio" : "casual e próximo"}
- Cada insight é uma frase única, sem listas, sem markdown
- Cite números do snapshot quando relevante (ex: "atribuição de 21%")
- Sem emoji, sem hashtag, sem aspas decorativas
- Respeite o limite de caracteres pedido pra cada slide`

    // Gera todos os insights em paralelo
    const snapshotJson = JSON.stringify(report.snapshot ?? {}, null, 2)
    const insights: Record<string, string> = {}

    const promises = SLIDE_PROMPTS.map(async (s) => {
      try {
        const result = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Snapshot do mês (JSON):\n\`\`\`json\n${snapshotJson}\n\`\`\`\n\nSlide: ${s.key}\nInstrução: ${s.instruction}\n\nResponda APENAS com a frase do insight, sem aspas, sem preâmbulo.`,
            },
          ],
        })
        const block = result.content[0]
        if (block && block.type === "text") {
          insights[s.key] = block.text.trim().replace(/^["']|["']$/g, "")
        } else {
          insights[s.key] = fallbackInsight(s.key, report.snapshot)
        }
      } catch (err) {
        console.error(`[ai-fill] slide ${s.key} failed`, err)
        insights[s.key] = fallbackInsight(s.key, report.snapshot)
      }
    })
    await Promise.all(promises)

    // Persiste no snapshot
    const newSnapshot = {
      ...((report.snapshot as object) ?? {}),
      insights,
      ai_filled_at: new Date().toISOString(),
    }
    await admin
      .from("client_monthly_reports")
      .update({ snapshot: newSnapshot, ai_filled: true })
      .eq("id", reportId)

    return successResponse(request, { ai_filled: true, insights })
  } catch (error) {
    return errorResponse(request, error, "report-ai-fill")
  }
}

// Fallback editorial determinístico (quando sem API key ou erro)
function fallbackInsight(key: string, _snapshot: unknown): string {
  const map: Record<string, string> = {
    capa: "Resumo executivo das vitórias e oportunidades do mês.",
    resumo: "Mês positivo com participação Convertfy dentro da meta.",
    atribuida: "Email segue como canal dominante; oportunidade em SMS.",
    email: "Open rate acima do benchmark; CTR em linha com o segmento.",
    rankings: "Welcome Series sustenta a base; campanhas sazonais elevaram receita média.",
    trabalho: "Otimizações compostas elevaram receita por envio.",
    proximos: "Próximos 30 dias com foco em ampliar lista engajada.",
  }
  return map[key] ?? ""
}
