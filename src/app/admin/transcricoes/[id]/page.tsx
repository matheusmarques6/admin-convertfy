/**
 * /admin/transcricoes/[id] — o detalhe.
 *
 * Rota própria, nunca modal: tem URL compartilhável e aceita `?t=MM:SS`
 * como posição inicial do player — é o que faz o resultado da busca cair
 * no segundo certo.
 */

import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ROUTES } from "@/lib/routes"
import { DetalheTranscricao } from "@/components/transcricoes/detalhe"
import { carregarColecoes, carregarDetalhe } from "@/lib/services/transcricoes.service"
import { parseTimestamp } from "@/lib/transcricoes/pipeline"

export const dynamic = "force-dynamic"

type Busca = Record<string, string | string[] | undefined>

const um = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params
    const sb = await createClient()
    const {
      data: { user },
    } = await sb.auth.getUser()
    if (!user) return { title: "Transcrição" }
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { data } = await admin
      .from("transcricoes")
      .select("titulo")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<{ titulo: string }>()
    return { title: data?.titulo ? `${data.titulo} · Transcrições` : "Transcrição" }
  } catch {
    return { title: "Transcrição" }
  }
}

export default async function TranscricaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busca>
}) {
  const { id } = await params
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect(ROUTES.LOGIN)

  const admin = createAdminClient()
  const orgId = await resolveOrgId(user.id)

  const [detalhe, arvore, q] = await Promise.all([
    carregarDetalhe(admin, orgId, id),
    carregarColecoes(admin, orgId),
    searchParams,
  ])
  if (!detalhe) notFound()

  return (
    <DetalheTranscricao
      inicial={detalhe}
      colecoes={arvore.todas.map((c) => ({ id: c.id, nome: c.nome, paiId: c.paiId, reservada: c.reservada }))}
      inicioSeg={parseTimestamp(um(q.t))}
    />
  )
}
