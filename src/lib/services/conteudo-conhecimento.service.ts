/**
 * Carrega da base do Obsidian a doutrina pertinente ao que o Estúdio vai
 * escrever. I/O só; a régua (procedência, tetos, avisos) é o módulo puro
 * `lib/conteudo/conhecimento.ts`.
 *
 * Usa `buscarConhecimento` — a MESMA busca do `conhecimento_buscar` da
 * ConvertIA e do `buscar_doutrina` do Curador de e-mail. Um segundo buscador
 * divergiria na primeira mudança e ninguém saberia por que o Estúdio "não
 * acha" o que a ConvertIA acha.
 *
 * **Fail-open, sempre**: a base indisponível não pode impedir alguém de
 * escrever um carrossel. Sem nota, o bloco é vazio e o prompt volta a ser o
 * de antes.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { buscarConhecimento, lerNotaDaBase } from "@/lib/ai/convertia/knowledge"
import { blocoDeConhecimento, selecionarNotas, type NotaParaPrompt, type Procedencia } from "@/lib/conteudo/conhecimento"
import { logger } from "@/lib/logger"

const log = logger.child("ConteudoConhecimento")

/** Quantas candidatas a busca traz antes dos tetos do módulo puro. */
const CANDIDATAS = 8

export interface FonteDeConhecimento {
  path: string
  titulo: string
  procedencia: Procedencia
  chars: number
}

export interface ConhecimentoDoPedido {
  /** Já renderizado para o prompt. Vazio quando não há nota utilizável. */
  bloco: string
  fontes: FonteDeConhecimento[]
  /** A busca por SIGNIFICADO rodou — não "a chave existe". */
  semanticaRodou: boolean
  /** Por que veio vazio, quando veio. */
  motivo?: "sem_consulta" | "sem_resultado" | "erro"
}

const VAZIO: ConhecimentoDoPedido = { bloco: "", fontes: [], semanticaRodou: false }

export async function carregarConhecimento(
  admin: SupabaseClient,
  consulta: string | null,
  opts: { limites?: { maxNotas?: number; maxChars?: number; maxCharsNota?: number } } = {},
): Promise<ConhecimentoDoPedido> {
  if (!consulta) return { ...VAZIO, motivo: "sem_consulta" }
  try {
    const { notas, semanticaRodou } = await buscarConhecimento(admin, { query: consulta, limit: CANDIDATAS })
    if (!notas.length) return { ...VAZIO, semanticaRodou, motivo: "sem_resultado" }

    // O corpo vem numa segunda leitura porque a busca devolve só o resumo —
    // e é o corpo que carrega o mecanismo, que é o que a peça precisa.
    const corpos: NotaParaPrompt[] = []
    for (const n of notas) {
      if (corpos.length >= CANDIDATAS) break
      const lida = await lerNotaDaBase(admin, n.path)
      if (lida?.body?.trim()) corpos.push({ path: lida.path, titulo: lida.title, corpo: lida.body })
    }

    const selecionadas = selecionarNotas(corpos, opts.limites)
    if (!selecionadas.length) return { ...VAZIO, semanticaRodou, motivo: "sem_resultado" }

    return {
      bloco: blocoDeConhecimento(selecionadas, { semanticaRodou }),
      fontes: selecionadas.map((n) => ({ path: n.path, titulo: n.titulo, procedencia: n.procedencia, chars: n.corpo.length })),
      semanticaRodou,
    }
  } catch (e) {
    // Fail-open declarado: escrever carrossel não pode depender da base.
    log.warn("conteudo.conhecimento_indisponivel", { erro: e instanceof Error ? e.message : String(e) })
    return { ...VAZIO, motivo: "erro" }
  }
}

/**
 * Os assuntos que a base cobre, para o `contextoDaOrg` de pautas e trends.
 *
 * Aqui não se busca nada: a pergunta é "sobre o que a casa tem doutrina", e
 * a resposta é o mapa de pastas com quantas notas cada uma tem. Serve para o
 * modelo propor pauta que a casa consegue SUSTENTAR em vez de tema genérico
 * de marketing — e para ele saber quando o assunto está fora do que sabemos.
 */
export async function assuntosDaBase(admin: SupabaseClient, teto = 12): Promise<string> {
  try {
    const { data, error } = await admin
      .from("ai_knowledge_notes")
      .select("folder")
      .eq("is_active", true)
      .eq("status", "aprovado")
      .limit(1000)
    if (error || !data?.length) return ""
    const porPasta = new Map<string, number>()
    for (const r of data as Array<{ folder: string | null }>) {
      // A folha da pasta é o assunto ("flows", "deliverability"); a raiz só
      // diz de quem é a doutrina, e isso o bloco de conhecimento já declara.
      const folha = (r.folder ?? "").split("/").filter(Boolean).pop()
      if (!folha || folha.startsWith("_")) continue
      porPasta.set(folha, (porPasta.get(folha) ?? 0) + 1)
    }
    const linhas = [...porPasta.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, teto)
      .map(([k, n]) => `${k} (${n})`)
    if (!linhas.length) return ""
    return `Assuntos com doutrina escrita na base da casa, e quantas notas cada um tem: ${linhas.join(", ")}. Pauta sobre um destes tem lastro; fora deles, a peça vai depender do que o usuário trouxer.`
  } catch {
    return ""
  }
}
