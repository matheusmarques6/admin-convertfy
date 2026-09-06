/**
 * GET  /api/transcricoes — página da biblioteca (filtros, busca, paginação).
 * POST /api/transcricoes — enfileira links.
 *
 * A criação NÃO transcreve: grava a linha em `aguardando` e o worker
 * reivindica. É o que faz "fechar a aba não interrompe o processamento".
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { detectarPlataforma, limparUrl, normalizarUrl } from "@/lib/transcricoes/url"
import type { OrdemBiblioteca, Plataforma, StatusTranscricao } from "@/lib/transcricoes/types"
import { carregarBiblioteca, carregarColecoes, estadoDaFila, garantirInbox } from "@/lib/services/transcricoes.service"
import { buscarTrechos } from "@/lib/services/transcricoes-busca.service"
import { carregarRegras, resolverPrevia } from "@/lib/services/transcricoes-previa.service"
import { guardarThumbDaUrl } from "@/lib/services/transcricoes-assets"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ORDENS: OrdemBiblioteca[] = ["recentes", "antigas", "duracao", "titulo"]
const PLATAFORMAS: Plataforma[] = ["youtube", "instagram", "tiktok", "upload"]
const STATUS: StatusTranscricao[] = ["aguardando", "processando", "pronta", "erro"]

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const q = request.nextUrl.searchParams
    const termo = (q.get("q") ?? "").trim()
    const colecaoId = q.get("colecao")
    const filtro = {
      colecaoId: colecaoId && colecaoId !== "todas" && colecaoId !== "sem-colecao" ? colecaoId : null,
      semColecao: colecaoId === "sem-colecao",
      plataforma: PLATAFORMAS.includes(q.get("plataforma") as Plataforma) ? (q.get("plataforma") as Plataforma) : null,
      status: STATUS.includes(q.get("status") as StatusTranscricao) ? (q.get("status") as StatusTranscricao) : null,
      ordem: ORDENS.includes(q.get("ordem") as OrdemBiblioteca) ? (q.get("ordem") as OrdemBiblioteca) : "recentes",
      termo,
      pagina: Math.max(0, Number(q.get("pagina") ?? 0) || 0),
    }

    const arvore = await carregarColecoes(admin, orgId)
    // Os trechos só interessam quando há termo; sem ele a busca semântica
    // custaria um embedding por abertura da biblioteca.
    const [pagina, trechos, fila] = await Promise.all([
      carregarBiblioteca(admin, orgId, filtro, arvore),
      termo
        ? buscarTrechos(admin, orgId, termo, { colecaoId: filtro.colecaoId, arvore })
        : Promise.resolve({ trechos: [], total: 0, semanticaIndisponivel: false }),
      estadoDaFila(admin, orgId),
    ])

    return successResponse(request, {
      pagina,
      arvore: { raizes: arvore.raizes, totalGeral: arvore.totalGeral, semColecao: arvore.semColecao, inboxId: arvore.inboxId },
      colecoes: arvore.todas.map((c) => ({ id: c.id, nome: c.nome, paiId: c.paiId, reservada: c.reservada })),
      busca: { termo, trechos: trechos.trechos, totalTrechos: trechos.total, semanticaIndisponivel: trechos.semanticaIndisponivel },
      fila,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-lista")
  }
}

const criarSchema = z.object({
  urls: z.array(z.string().min(4).max(2000)).min(1).max(30),
  colecaoId: z.string().uuid().nullable().optional(),
  idioma: z.string().min(2).max(10).default("pt-BR"),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Envie ao menos um link válido.", 400)
    const { urls, idioma, tags } = parsed.data

    const [regras, inboxId] = await Promise.all([
      carregarRegras(admin, orgId),
      garantirInbox(admin, orgId, user.id),
    ])
    const colecaoPadrao = parsed.data.colecaoId ?? null

    // As prévias são REDE (worker com 20 s de teto cada). Em série, 30 links
    // estouram o `maxDuration` desta rota muito antes de terminar. Vão em
    // paralelo limitado, com prazo global: quem não voltou a tempo entra na
    // fila sem metadados — o worker preenche o título quando processar, que
    // é melhor que a rota inteira dar timeout e nada ser enfileirado.
    const PRAZO_PREVIAS_MS = 35_000
    const PARALELAS = 5
    const limite = Date.now() + PRAZO_PREVIAS_MS

    const alvos = urls.map((bruta) => ({
      bruta,
      plataforma: detectarPlataforma(bruta),
      url: limparUrl(bruta),
    }))
    const previas = new Map<string, Awaited<ReturnType<typeof resolverPrevia>>>()
    const aResolver = alvos.filter((a) => a.plataforma && a.url)
    let cursor = 0
    await Promise.all(
      Array.from({ length: Math.min(PARALELAS, aResolver.length) }, async () => {
        while (cursor < aResolver.length) {
          const item = aResolver[cursor++]
          if (Date.now() > limite) return
          try {
            previas.set(item.bruta, await resolverPrevia(admin, orgId, item.url!, regras))
          } catch {
            // Prévia é enriquecimento: falhar aqui não impede enfileirar.
          }
        }
      }),
    )

    const criadas: Array<{ url: string; id: string | null; titulo: string | null; erro: string | null }> = []
    for (const { bruta, plataforma, url } of alvos) {
      if (!plataforma || !url) {
        criadas.push({ url: bruta, id: null, titulo: null, erro: "Link não suportado." })
        continue
      }

      const previa = previas.get(bruta)
      if (previa?.duplicadaDe) {
        criadas.push({ url, id: null, titulo: previa.duplicadaDe.titulo, erro: "Já existe na biblioteca." })
        continue
      }

      const { data, error } = await admin
        .from("transcricoes")
        .insert({
          org_id: orgId,
          colecao_id: colecaoPadrao ?? previa?.colecaoSugeridaId ?? inboxId,
          // Sem título ainda: o worker preenche. Um placeholder genérico é
          // melhor que inventar nome a partir da URL.
          titulo: previa?.titulo?.slice(0, 300) || "Transcrição em processamento",
          plataforma,
          canal: previa?.canal ?? null,
          url_original: url,
          url_normalizada: normalizarUrl(url),
          duracao_seg: previa?.duracaoSeg ?? null,
          idioma,
          tags,
          status: "aguardando",
          etapa: 0,
          progresso: null,
          criado_por: user.id,
        })
        .select("id, titulo")
        .maybeSingle<{ id: string; titulo: string }>()

      if (error) {
        // 23505 = o índice único de URL pegou uma corrida entre duas abas.
        criadas.push({
          url,
          id: null,
          titulo: null,
          erro: error.code === "23505" ? "Já existe na biblioteca." : "Não foi possível enfileirar.",
        })
        continue
      }
      criadas.push({ url, id: data?.id ?? null, titulo: data?.titulo ?? null, erro: null })

      // A capa que a prévia trouxe é gravada no NOSSO bucket. Sem isto o
      // card fica um retângulo vazio até o worker extrair um frame — e o
      // worker pode demorar, ou nem estar de pé. Fail-open: capa é detalhe,
      // a transcrição já está na fila.
      if (data?.id && previa?.thumbUrl) {
        const caminho = await guardarThumbDaUrl(admin, orgId, data.id, previa.thumbUrl)
        if (caminho) await admin.from("transcricoes").update({ thumb_path: caminho }).eq("id", data.id)
      }
    }

    const enfileiradas = criadas.filter((c) => c.id).length
    if (enfileiradas === 0) {
      throw new AppError(criadas[0]?.erro ?? "Nenhum link pôde ser enfileirado.", 422)
    }
    return successResponse(request, { itens: criadas, enfileiradas })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-criar")
  }
}
