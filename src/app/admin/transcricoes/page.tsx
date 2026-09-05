/**
 * /admin/transcricoes — biblioteca.
 *
 * Server Component: a primeira página vem pronta do servidor, com as
 * consultas em PARALELO. Nada de `useEffect` encadeado disparando fetch no
 * mount — a dívida que este módulo não repete.
 */

import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ROUTES } from "@/lib/routes"
import { Biblioteca } from "@/components/transcricoes/biblioteca"
import {
  carregarBiblioteca,
  carregarColecoes,
  estadoDaFila,
  garantirInbox,
} from "@/lib/services/transcricoes.service"
import { buscarTrechos } from "@/lib/services/transcricoes-busca.service"
import type { OrdemBiblioteca, Plataforma, StatusTranscricao } from "@/lib/transcricoes/types"

export const dynamic = "force-dynamic"

const ORDENS: OrdemBiblioteca[] = ["recentes", "antigas", "duracao", "titulo"]
const PLATAFORMAS: Plataforma[] = ["youtube", "instagram", "tiktok", "upload"]
const STATUS: StatusTranscricao[] = ["aguardando", "processando", "pronta", "erro"]

type Busca = Record<string, string | string[] | undefined>

const um = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export default async function TranscricoesPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect(ROUTES.LOGIN)

  const admin = createAdminClient()
  const orgId = await resolveOrgId(user.id)
  await garantirInbox(admin, orgId, user.id)

  const q = await searchParams
  const colecaoParam = um(q.colecao)
  const termo = (um(q.q) ?? "").trim()
  const plataforma = um(q.plataforma)
  const status = um(q.status)
  const ordem = um(q.ordem)

  const filtro = {
    colecaoId: colecaoParam && colecaoParam !== "sem-colecao" ? colecaoParam : null,
    semColecao: colecaoParam === "sem-colecao",
    plataforma: PLATAFORMAS.includes(plataforma as Plataforma) ? (plataforma as Plataforma) : null,
    status: STATUS.includes(status as StatusTranscricao) ? (status as StatusTranscricao) : null,
    ordem: ORDENS.includes(ordem as OrdemBiblioteca) ? (ordem as OrdemBiblioteca) : ("recentes" as OrdemBiblioteca),
    termo,
    pagina: 0,
  }

  // A árvore vem primeiro porque o recorte por coleção depende dela; o
  // resto sai em paralelo.
  const arvore = await carregarColecoes(admin, orgId)
  const [pagina, trechos, fila] = await Promise.all([
    carregarBiblioteca(admin, orgId, filtro, arvore),
    termo
      ? buscarTrechos(admin, orgId, termo, { colecaoId: filtro.colecaoId, arvore })
      : Promise.resolve({ trechos: [], total: 0, semanticaIndisponivel: false }),
    estadoDaFila(admin, orgId),
  ])

  return (
    <Biblioteca
      orgId={orgId}
      inicial={{
        pagina,
        arvore: {
          raizes: arvore.raizes,
          totalGeral: arvore.totalGeral,
          semColecao: arvore.semColecao,
          inboxId: arvore.inboxId,
        },
        colecoes: arvore.todas.map((c) => ({ id: c.id, nome: c.nome, paiId: c.paiId, reservada: c.reservada })),
        busca: {
          termo,
          trechos: trechos.trechos,
          totalTrechos: trechos.total,
          semanticaIndisponivel: trechos.semanticaIndisponivel,
        },
        fila,
      }}
    />
  )
}
