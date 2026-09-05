/**
 * Vercel Cron — reindexação pendente do módulo Transcrições.
 *
 * Schedule: a cada 5 min.
 *
 * Cuida do que NÃO precisa de binário e por isso não depende do container:
 *
 *  1. Chunks marcados `desatualizado` — fala editada na tela. É a ponte que
 *     impede a base de conhecimento de divergir do texto que o usuário está
 *     vendo, e a divergência seria silenciosa.
 *  2. Chunks sem embedding — a faísca da coleção acabou de ser ligada, ou o
 *     OpenRouter estava sem crédito quando a transcrição indexou.
 *
 * Orçamento de tempo explícito: melhor terminar o lote e voltar no próximo
 * tick do que tomar 504 no meio e não gravar nada.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { gerarEmbeddings } from "@/lib/transcricoes/indexar"
import { embeddingsAvailable } from "@/lib/ai/convertia/knowledge-embeddings"

const log = logger.child("CronTranscricoesIndexar")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const ORCAMENTO_MS = 240_000
const LOTE = 200

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const inicio = Date.now()
  try {
    if (!embeddingsAvailable()) {
      // Sem chave não há o que fazer, e dizer isso é melhor que reportar
      // "0 processados" como se estivesse tudo em dia.
      return NextResponse.json({ success: true, pulado: "sem OPENROUTER_API_KEY", processados: 0 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("transcricoes_chunks")
      .select("id, contexto, texto, transcricao_id")
      .or("embedding.is.null,desatualizado.is.true")
      .order("atualizado_em", { ascending: true })
      .limit(LOTE)
      .returns<Array<{ id: number; contexto: string | null; texto: string; transcricao_id: string }>>()
    if (error) throw error

    const pendentes = data ?? []
    if (!pendentes.length) return NextResponse.json({ success: true, processados: 0, pendentes: 0 })

    // Corta o lote pelo orçamento: cada bloco de 48 leva alguns segundos.
    const cabe = pendentes.slice(0, Math.max(48, Math.floor(((ORCAMENTO_MS - (Date.now() - inicio)) / 6000) * 48)))
    const processados = await gerarEmbeddings(admin, cabe)

    // Transcrição que ficou sem pendência recebe o carimbo — é o que a
    // árvore lê para tirar o "indexando" do item da coleção.
    const tocadas = [...new Set(cabe.map((c) => c.transcricao_id))]
    for (const id of tocadas) {
      const { count } = await admin
        .from("transcricoes_chunks")
        .select("id", { count: "exact", head: true })
        .eq("transcricao_id", id)
        .or("embedding.is.null,desatualizado.is.true")
      if ((count ?? 0) === 0) {
        await admin.from("transcricoes").update({ indexado_em: new Date().toISOString() }).eq("id", id)
      }
    }

    const resultado = { processados, transcricoes: tocadas.length, ms: Date.now() - inicio }
    log.info("reindexação", resultado)
    return NextResponse.json({ success: true, ...resultado })
  } catch (error) {
    log.error("reindexação falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
