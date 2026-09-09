import type { SupabaseClient } from "@supabase/supabase-js"

import { buscarConhecimento, lerNotaDaBase } from "@/lib/ai/convertia/knowledge"
import { logger } from "@/lib/logger"

const log = logger.child("QaAdvisorContext")
const MAX_NOTES = 3
const MAX_TOTAL_CHARS = 18_000
const MAX_QUERY_CHARS = 4_000
const MAX_SOURCE_CHARS = 7_000
const ADVISOR_MAX_PREFIX = "Advisors/Max"

export interface QaAdvisorSource {
  path: string
  title: string
  chars: number
}

export interface QaAdvisorContext {
  block: string
  sources: QaAdvisorSource[]
  semanticSearch: boolean
  status: "loaded" | "empty" | "unavailable"
}

export interface QaAdvisorContextInput {
  objective: string
  blockViews: unknown[]
  expectedBlocks: Array<{ block_type: string; content: Record<string, unknown> }>
}

export function buildQaAdvisorQuery(input: QaAdvisorContextInput): string {
  const visible = input.blockViews
    .map((view) => JSON.stringify(view))
    .join("\n")
  const blockTypes = input.expectedBlocks.map((block) => block.block_type).join(", ")
  return [
    "Método do Advisor Max para revisar a qualidade de um email de ecommerce.",
    `Objetivo: ${input.objective || "não informado"}.`,
    `Blocos: ${blockTypes || "não informados"}.`,
    "Avaliar promessa, clareza, objeção, prova, oferta, CTA, coerência do flow e persuasão.",
    `Conteúdo visível: ${visible}`,
  ].join("\n").slice(0, MAX_QUERY_CHARS)
}

/**
 * Recupera somente a doutrina pertinente do Advisor Max. Falha aberta: a
 * indisponibilidade da base nunca impede os checks objetivos do QA.
 */
export async function loadQaAdvisorContext(
  admin: SupabaseClient,
  input: QaAdvisorContextInput,
): Promise<QaAdvisorContext> {
  try {
    const result = await buscarConhecimento(admin, {
      query: buildQaAdvisorQuery(input),
      folderPrefix: ADVISOR_MAX_PREFIX,
      limit: 8,
    })
    const candidates = result.notas
      .filter((note) => note.path.startsWith(`${ADVISOR_MAX_PREFIX}/`))
      .slice(0, MAX_NOTES)

    const sources: QaAdvisorSource[] = []
    const sections: string[] = []
    let remaining = MAX_TOTAL_CHARS
    for (const candidate of candidates) {
      if (remaining <= 0) break
      const note = await lerNotaDaBase(admin, candidate.path)
      if (!note) continue
      const body = note.body.trim().slice(0, Math.min(MAX_SOURCE_CHARS, remaining))
      if (!body) continue
      sections.push(`### ${note.title}\nFonte: ${note.path}\n${body}`)
      sources.push({ path: note.path, title: note.title, chars: body.length })
      remaining -= body.length
    }

    if (sources.length === 0) {
      return { block: "(nenhuma doutrina relevante do Advisor Max foi encontrada)", sources, semanticSearch: result.semanticaRodou, status: "empty" }
    }
    return {
      block: sections.join("\n\n"),
      sources,
      semanticSearch: result.semanticaRodou,
      status: "loaded",
    }
  } catch (error) {
    log.warn("qa_advisor_context_unavailable", { error: error instanceof Error ? error.message : String(error) })
    return {
      block: "(base do Advisor Max indisponível; não invente regras em nome do método da casa)",
      sources: [],
      semanticSearch: false,
      status: "unavailable",
    }
  }
}
