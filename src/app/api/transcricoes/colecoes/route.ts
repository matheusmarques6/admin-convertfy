/**
 * GET  /api/transcricoes/colecoes — árvore com contagem recursiva.
 * POST /api/transcricoes/colecoes — cria coleção (ou a estrutura sugerida).
 *
 * A estrutura sugerida (Convertfy Academy, Referências externas, Calls
 * internas + as regras de sugestão) é OFERECIDA, nunca semeada sozinha:
 * criar oito pastas que ninguém pediu é decidir pelo time. Só a coleção
 * reservada "Não organizadas" nasce automática, porque é infraestrutura do
 * módulo — todo item precisa de um destino.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { carregarColecoes, garantirInbox } from "@/lib/services/transcricoes.service"
import { SEMENTE_COLECOES, SEMENTE_REGRAS } from "@/lib/transcricoes/sugestao"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    await garantirInbox(admin, orgId, user.id)
    const arvore = await carregarColecoes(admin, orgId)
    return successResponse(request, {
      raizes: arvore.raizes,
      todas: arvore.todas,
      totalGeral: arvore.totalGeral,
      semColecao: arvore.semColecao,
      inboxId: arvore.inboxId,
      // Só faz sentido oferecer a estrutura quando não há nada além da
      // reservada — depois disso o time já tem a própria organização.
      podeSemear: arvore.todas.filter((c) => !c.reservada).length === 0,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-colecoes")
  }
}

const criarSchema = z.union([
  z.object({
    nome: z.string().min(1).max(120),
    paiId: z.string().uuid().nullable().optional(),
    naBaseDeConhecimento: z.boolean().optional(),
  }),
  z.object({ semearEstrutura: z.literal(true) }),
])

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Dados da coleção inválidos.", 400)

    if ("semearEstrutura" in parsed.data) {
      const criadas = await semear(admin, orgId, user.id)
      return successResponse(request, { criadas })
    }

    const { nome, paiId, naBaseDeConhecimento } = parsed.data
    if (paiId) {
      const { data } = await admin
        .from("transcricoes_colecoes")
        .select("id")
        .eq("id", paiId)
        .eq("org_id", orgId)
        .maybeSingle<{ id: string }>()
      if (!data) throw new AppError("Coleção pai não encontrada.", 404)
    }

    const { data, error } = await admin
      .from("transcricoes_colecoes")
      .insert({
        org_id: orgId,
        nome: nome.trim(),
        pai_id: paiId ?? null,
        na_base_de_conhecimento: naBaseDeConhecimento ?? false,
        criado_por: user.id,
      })
      .select("id, nome, pai_id, na_base_de_conhecimento")
      .maybeSingle<{ id: string; nome: string; pai_id: string | null; na_base_de_conhecimento: boolean }>()
    if (error) throw error

    return successResponse(request, {
      colecao: {
        id: data!.id,
        nome: data!.nome,
        paiId: data!.pai_id,
        naBaseDeConhecimento: data!.na_base_de_conhecimento,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-colecao-criar")
  }
}

type Admin = ReturnType<typeof createAdminClient>

/** Cria a estrutura sugerida + as regras que a alimentam. */
async function semear(admin: Admin, orgId: string, userId: string): Promise<number> {
  const porNome = new Map<string, string>()
  let ordem = 0
  let criadas = 0

  for (const raiz of SEMENTE_COLECOES) {
    const { data: pai } = await admin
      .from("transcricoes_colecoes")
      .insert({ org_id: orgId, nome: raiz.nome, ordem: ordem++, criado_por: userId })
      .select("id")
      .maybeSingle<{ id: string }>()
    if (!pai) continue
    porNome.set(raiz.nome, pai.id)
    criadas++

    for (const filha of raiz.filhas ?? []) {
      const { data } = await admin
        .from("transcricoes_colecoes")
        .insert({ org_id: orgId, nome: filha, pai_id: pai.id, ordem: ordem++, criado_por: userId })
        .select("id")
        .maybeSingle<{ id: string }>()
      if (!data) continue
      porNome.set(filha, data.id)
      criadas++
    }
  }

  const regras = SEMENTE_REGRAS.map((r) => {
    const colecaoId = porNome.get(r.colecao)
    return colecaoId
      ? { org_id: orgId, termos: r.termos, colecao_id: colecaoId, plataforma: r.plataforma ?? null, prioridade: r.prioridade }
      : null
  }).filter((r): r is NonNullable<typeof r> => r !== null)
  if (regras.length) await admin.from("transcricoes_regras").insert(regras)

  return criadas
}
