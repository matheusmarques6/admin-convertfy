/**
 * Busca híbrida — exata (full-text nos blocos) + semântica (pgvector nos
 * chunks), mescladas priorizando o match exato.
 *
 * O requisito que decide o desenho: o resultado precisa devolver o OFFSET
 * em segundos, não só o id do item. Por isso a busca exata roda em
 * `transcricoes_blocos` e não em `transcricoes.texto_completo` — o bloco já
 * carrega o `s`, então o timestamp sai de graça.
 *
 * A semântica é complementar e pode faltar (sem chave do OpenRouter, por
 * exemplo). Quando falta, a resposta DIZ que faltou em vez de devolver
 * menos resultado em silêncio.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { embedQuery } from "@/lib/ai/convertia/knowledge-embeddings"
import type { Plataforma, ResultadoBusca, TrechoEncontrado } from "@/lib/transcricoes/types"
import { assinarLote } from "./transcricoes-assets"
import { idsComDescendentes, type ArvoreColecoes } from "./transcricoes.service"

const log = logger.child("TranscricoesBusca")

type Admin = ReturnType<typeof createAdminClient>

const LIMITE_EXATA = 40
const LIMITE_SEMANTICA = 12
/** Abaixo disso o vizinho semântico não é parecido o bastante para mostrar. */
const CORTE_SIMILARIDADE = 0.28

interface LinhaExata {
  transcricao_id: string
  titulo: string
  plataforma: string
  thumb_path: string | null
  bloco_id: number
  s: number
  locutor: string | null
  trecho: string
  rank: number
}

interface LinhaSemantica {
  chunk_id: number
  transcricao_id: string
  titulo: string
  s: number
  fim: number
  contexto: string | null
  texto: string
  similaridade: number
}

export interface OpcoesBusca {
  colecaoId?: string | null
  arvore?: ArvoreColecoes | null
  incluirSemantica?: boolean
}

export async function buscarTrechos(
  admin: Admin,
  orgId: string,
  termo: string,
  opts: OpcoesBusca = {},
): Promise<{ trechos: TrechoEncontrado[]; total: number; semanticaIndisponivel: boolean }> {
  const t = termo.trim()
  if (!t) return { trechos: [], total: 0, semanticaIndisponivel: false }

  const colecaoIds =
    opts.colecaoId && opts.arvore ? idsComDescendentes(opts.arvore.todas, opts.colecaoId) : null

  const [exataRes, totalRes, vetor] = await Promise.all([
    admin.rpc("transcricoes_busca_exata", {
      p_org_id: orgId,
      p_termo: t,
      p_limite: LIMITE_EXATA,
      p_colecao_ids: colecaoIds,
    }),
    admin.rpc("transcricoes_conta_trechos", { p_org_id: orgId, p_termo: t, p_colecao_ids: colecaoIds }),
    opts.incluirSemantica === false ? Promise.resolve(null) : embedQuery(t),
  ])

  if (exataRes.error) {
    log.warn("busca exata falhou", { erro: exataRes.error.message })
  }
  const exatas = (exataRes.data ?? []) as LinhaExata[]

  let semanticas: LinhaSemantica[] = []
  const semanticaIndisponivel = vetor == null && opts.incluirSemantica !== false
  if (vetor) {
    const { data, error } = await admin.rpc("transcricoes_busca_semantica", {
      // O pgvector recebe o vetor como texto JSON — é como a RPC de
      // conhecimento da ConvertIA já o passa.
      query_embedding: JSON.stringify(vetor),
      p_org_id: orgId,
      match_count: LIMITE_SEMANTICA,
      p_colecao_ids: colecaoIds,
      somente_base: false,
    })
    if (error) log.warn("busca semântica falhou", { erro: error.message })
    else semanticas = ((data ?? []) as LinhaSemantica[]).filter((r) => r.similaridade >= CORTE_SIMILARIDADE)
  }

  // Assina as thumbs dos dois conjuntos numa chamada só.
  const porTranscricao = new Map<string, { plataforma: string; thumbPath: string | null }>()
  for (const e of exatas) porTranscricao.set(e.transcricao_id, { plataforma: e.plataforma, thumbPath: e.thumb_path })
  const faltando = semanticas.map((s) => s.transcricao_id).filter((id) => !porTranscricao.has(id))
  if (faltando.length) {
    const { data } = await admin
      .from("transcricoes")
      .select("id, plataforma, thumb_path")
      .eq("org_id", orgId)
      .in("id", [...new Set(faltando)])
      .returns<Array<{ id: string; plataforma: string; thumb_path: string | null }>>()
    for (const r of data ?? []) porTranscricao.set(r.id, { plataforma: r.plataforma, thumbPath: r.thumb_path })
  }
  const thumbs = await assinarLote(
    admin,
    [...porTranscricao.values()].map((v) => v.thumbPath ?? "").filter(Boolean),
  )

  const trechos: TrechoEncontrado[] = exatas.map((e) => ({
    transcricaoId: e.transcricao_id,
    titulo: e.titulo,
    plataforma: e.plataforma as Plataforma,
    thumbUrl: e.thumb_path ? thumbs.get(e.thumb_path) ?? null : null,
    s: Number(e.s),
    trecho: e.trecho,
    locutor: e.locutor,
    origem: "exata",
    similaridade: null,
  }))

  // Semântica entra DEPOIS e só onde a exata não chegou. O usuário que
  // digitou um termo literal espera vê-lo primeiro; o vizinho semântico é
  // complemento, não competidor.
  const jaTem = new Set(trechos.map((t2) => `${t2.transcricaoId}:${Math.round(t2.s)}`))
  for (const s of semanticas) {
    const chave = `${s.transcricao_id}:${Math.round(Number(s.s))}`
    if (jaTem.has(chave)) continue
    // Um trecho semântico com timestamp que já apareceu na exata a 20 s de
    // distância é o mesmo assunto: não vale repetir.
    if (trechos.some((x) => x.transcricaoId === s.transcricao_id && Math.abs(x.s - Number(s.s)) < 20)) continue
    const meta = porTranscricao.get(s.transcricao_id)
    trechos.push({
      transcricaoId: s.transcricao_id,
      titulo: s.titulo,
      plataforma: (meta?.plataforma ?? "upload") as Plataforma,
      thumbUrl: meta?.thumbPath ? thumbs.get(meta.thumbPath) ?? null : null,
      s: Number(s.s),
      trecho: resumirTrecho(s.texto),
      locutor: null,
      origem: "semantica",
      similaridade: Number(s.similaridade),
    })
  }

  const totalExatas = typeof totalRes.data === "number" ? totalRes.data : exatas.length
  return {
    trechos,
    // O contador é o total REAL da query exata mais os vizinhos semânticos
    // efetivamente mostrados — não o tamanho da página.
    total: totalExatas + trechos.filter((x) => x.origem === "semantica").length,
    semanticaIndisponivel,
  }
}

/** Corta o chunk num pedaço legível, sem cortar palavra pela metade. */
export function resumirTrecho(texto: string, max = 260): string {
  const t = texto.trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const ultimoEspaco = corte.lastIndexOf(" ")
  return `${corte.slice(0, ultimoEspaco > max * 0.6 ? ultimoEspaco : max)}…`
}

export type { ResultadoBusca }
