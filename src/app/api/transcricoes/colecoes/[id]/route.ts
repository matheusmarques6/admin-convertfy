/**
 * PATCH  /api/transcricoes/colecoes/[id] — nome, pai, jargão, modelo e a
 *        FAÍSCA (entrar ou sair da base da ConvertIA).
 * DELETE /api/transcricoes/colecoes/[id] — apaga a pasta; o conteúdo vai
 *        para "Não organizadas", nunca some junto.
 *
 * Ligar a faísca enfileira os embeddings que faltam e a UI mostra o estado
 * de processamento no item da árvore — é assíncrono, não trava a tela.
 * Desligar EXCLUI da recuperação mas NÃO apaga os embeddings: religar tem
 * de ser instantâneo.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const schema = z.object({
  nome: z.string().min(1).max(120).optional(),
  paiId: z.string().uuid().nullable().optional(),
  naBaseDeConhecimento: z.boolean().optional(),
  phraseList: z.array(z.string().min(1).max(80)).max(500).optional(),
  modelo: z.string().min(3).max(120).optional(),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Dados inválidos.", 400)
    const p = parsed.data

    const { data: atual } = await admin
      .from("transcricoes_colecoes")
      .select("id, reservada, na_base_de_conhecimento")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<{ id: string; reservada: string | null; na_base_de_conhecimento: boolean }>()
    if (!atual) throw new AppError("Coleção não encontrada.", 404)

    const patch: Record<string, unknown> = {}
    if (p.nome !== undefined) {
      if (atual.reservada) throw new AppError("A coleção reservada não pode ser renomeada.", 409)
      patch.nome = p.nome.trim()
    }
    if ("paiId" in p) {
      if (atual.reservada) throw new AppError("A coleção reservada não pode ser movida.", 409)
      if (p.paiId === id) throw new AppError("Uma coleção não pode ser pai de si mesma.", 400)
      if (p.paiId) {
        // Ciclo na árvore trava a soma recursiva e o menu de destino: a
        // descendência do alvo não pode conter o novo pai.
        const { data: todas } = await admin
          .from("transcricoes_colecoes")
          .select("id, pai_id")
          .eq("org_id", orgId)
          .returns<Array<{ id: string; pai_id: string | null }>>()
        if (descende(todas ?? [], p.paiId, id)) {
          throw new AppError("Não dá para mover uma coleção para dentro dela mesma.", 400)
        }
      }
      patch.pai_id = p.paiId ?? null
    }
    if (p.naBaseDeConhecimento !== undefined) patch.na_base_de_conhecimento = p.naBaseDeConhecimento
    if (p.phraseList !== undefined) {
      patch.phrase_list = [...new Set(p.phraseList.map((t) => t.trim()).filter(Boolean))]
    }
    if (p.modelo !== undefined) patch.modelo = p.modelo.trim()
    if (!Object.keys(patch).length) throw new AppError("Nada para atualizar.", 400)

    const { data, error } = await admin
      .from("transcricoes_colecoes")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id, nome, pai_id, na_base_de_conhecimento, phrase_list, modelo")
      .maybeSingle<{
        id: string
        nome: string
        pai_id: string | null
        na_base_de_conhecimento: boolean
        phrase_list: string[] | null
        modelo: string
      }>()
    if (error) throw error

    // Ligar a faísca: enfileira o que ainda não tem vetor. Desligar não
    // apaga nada — religar precisa ser instantâneo.
    // A conta é do que o cron REALMENTE vai processar: chunk sem vetor ou
    // marcado como desatualizado. Contar "transcrições sem indexado_em"
    // somava o que falhou e o que ainda está processando — número que a
    // fila nunca ia honrar, e o usuário ficaria esperando por ele.
    let enfileirados = 0
    if (p.naBaseDeConhecimento === true && !atual.na_base_de_conhecimento) {
      const { data: doGrupo } = await admin
        .from("transcricoes")
        .select("id")
        .eq("org_id", orgId)
        .eq("colecao_id", id)
        .eq("status", "pronta")
        .returns<Array<{ id: string }>>()
      const ids = (doGrupo ?? []).map((t) => t.id)
      if (ids.length) {
        const { count } = await admin
          .from("transcricoes_chunks")
          .select("id", { count: "exact", head: true })
          .in("transcricao_id", ids)
          .or("embedding.is.null,desatualizado.is.true")
        enfileirados = count ?? 0
      }
    }

    return successResponse(request, {
      colecao: {
        id: data!.id,
        nome: data!.nome,
        paiId: data!.pai_id,
        naBaseDeConhecimento: data!.na_base_de_conhecimento,
        phraseList: data!.phrase_list ?? [],
        modelo: data!.modelo,
      },
      enfileirados,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-colecao-patch")
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: atual } = await admin
      .from("transcricoes_colecoes")
      .select("id, reservada, pai_id")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<{ id: string; reservada: string | null; pai_id: string | null }>()
    if (!atual) throw new AppError("Coleção não encontrada.", 404)
    if (atual.reservada) throw new AppError("A coleção reservada não pode ser excluída.", 409)

    // As filhas sobem um nível em vez de sumirem por CASCADE: apagar uma
    // pasta não pode levar junto a organização que está dentro dela.
    await admin.from("transcricoes_colecoes").update({ pai_id: atual.pai_id }).eq("org_id", orgId).eq("pai_id", id)
    // O conteúdo vai para "Não organizadas" (colecao_id fica NULL pela FK).
    const { error } = await admin.from("transcricoes_colecoes").delete().eq("org_id", orgId).eq("id", id)
    if (error) throw error

    return successResponse(request, { excluida: true })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-colecao-excluir")
  }
}

/** `alvo` está na descendência de `raiz`? (guarda de ciclo na árvore) */
function descende(todas: Array<{ id: string; pai_id: string | null }>, alvo: string, raiz: string): boolean {
  const porPai = new Map<string, string[]>()
  for (const c of todas) {
    if (!c.pai_id) continue
    porPai.set(c.pai_id, [...(porPai.get(c.pai_id) ?? []), c.id])
  }
  const fila = [raiz]
  const visto = new Set<string>()
  while (fila.length) {
    const atual = fila.shift()!
    if (visto.has(atual)) continue
    visto.add(atual)
    if (atual === alvo && atual !== raiz) return true
    fila.push(...(porPai.get(atual) ?? []))
  }
  return visto.has(alvo) && alvo !== raiz
}
