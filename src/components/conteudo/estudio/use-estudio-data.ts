"use client"

/**
 * Hooks de dados do Estúdio (SWR sobre `lib/conteudo/data.ts`, que fala com
 * `/api/conteudo/*`). Toda escrita passa por aqui e atualiza o cache — a
 * biblioteca e o editor nunca divergem.
 */

import { useCallback } from "react"
import useSWR from "swr"
import {
  criarDocumento,
  criarMeuTemplate,
  deleteDocumento,
  excluirMeuTemplate,
  getAssets,
  getBrandKits,
  getDashboard,
  getDocumentos,
  getMeusTemplates,
  getPerfis,
  saveBrandKit,
  saveDocumento,
  usarMeuTemplate,
} from "@/lib/conteudo/data"
import { PERFIL_CONSOLIDADO, type BrandKit, type Documento, type MeuTemplate, type Perfil, type PerfilEditavel, type Post } from "@/lib/conteudo/types"

const SWR_OPTS = { revalidateOnFocus: false, shouldRetryOnError: false }

export function useDocumentos() {
  const { data, error, isLoading, mutate } = useSWR("conteudo:documentos", getDocumentos, SWR_OPTS)
  const criar = useCallback(
    async (doc: Documento) => {
      const criado = await criarDocumento(doc)
      await mutate((lista) => [criado, ...(lista ?? []).filter((d) => d.id !== criado.id)], { revalidate: false })
      return criado
    },
    [mutate],
  )
  const salvar = useCallback(
    async (doc: Documento, opts?: { baseAtualizadoEm?: string | null; force?: boolean }) => {
      const salvo = await saveDocumento(doc, opts)
      await mutate((lista) => {
        const l = lista ?? []
        return l.some((d) => d.id === salvo.id) ? l.map((d) => (d.id === salvo.id ? salvo : d)) : [salvo, ...l]
      }, { revalidate: false })
      return salvo
    },
    [mutate],
  )
  const excluir = useCallback(
    async (id: string) => {
      await deleteDocumento(id)
      await mutate((lista) => (lista ?? []).filter((d) => d.id !== id), { revalidate: false })
    },
    [mutate],
  )
  return { docs: data ?? null, error: error as Error | undefined, isLoading, criar, salvar, excluir, recarregar: () => mutate() }
}

export function usePerfis() {
  const { data, error, isLoading, mutate } = useSWR("conteudo:perfis", () => getPerfis(false), SWR_OPTS)
  return { perfis: data ?? null, error: error as Error | undefined, isLoading, recarregar: () => mutate() }
}

export function useMeusTemplates() {
  const { data, mutate } = useSWR("conteudo:meus-templates", getMeusTemplates, SWR_OPTS)
  const criar = useCallback(
    async (t: { nome: string; templateId: string; estrutura: MeuTemplate["estrutura"]; fidelidade?: number | null; usos?: number }) => {
      const novo = await criarMeuTemplate(t)
      await mutate((lista) => [novo, ...(lista ?? [])], { revalidate: false })
      return novo
    },
    [mutate],
  )
  const usar = useCallback(
    async (id: string) => {
      const t = await usarMeuTemplate(id)
      await mutate((lista) => (lista ?? []).map((x) => (x.id === id ? t : x)), { revalidate: false })
    },
    [mutate],
  )
  const excluir = useCallback(
    async (id: string) => {
      await excluirMeuTemplate(id)
      await mutate((lista) => (lista ?? []).filter((x) => x.id !== id), { revalidate: false })
    },
    [mutate],
  )
  return { meus: data ?? [], criar, usar, excluir }
}

export function useBrandKits() {
  const { data, mutate } = useSWR("conteudo:brandkits", getBrandKits, SWR_OPTS)
  const salvar = useCallback(
    async (perfil: PerfilEditavel, kit: BrandKit) => {
      await saveBrandKit(perfil, kit)
      await mutate((atual) => (atual ? { ...atual, kits: { ...atual.kits, [perfil]: kit } } : atual), { revalidate: false })
    },
    [mutate],
  )
  return { kits: data?.kits ?? null, perfis: data?.perfis ?? null, salvar }
}

/** Posts reais dos últimos 90 dias (todos os perfis) — desempenho por molde nos cards de template. */
export function usePostsPublicados(): Post[] {
  const { data } = useSWR(
    "conteudo:posts-90d",
    () => {
      const end = new Date()
      const start = new Date(end.getTime() - 89 * 86_400_000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      return getDashboard(PERFIL_CONSOLIDADO, { start: iso(start), end: iso(end) }, { sync: false }).then((d) => d.posts)
    },
    SWR_OPTS,
  )
  return data ?? []
}

export function useAssets() {
  const { data, error, isLoading, mutate } = useSWR("conteudo:assets", () => getAssets(60), SWR_OPTS)
  return { assets: data ?? null, error: error as Error | undefined, isLoading, recarregar: () => mutate() }
}

export function perfilPorId(perfis: Perfil[] | null | undefined, id: string | null | undefined): Perfil | undefined {
  return perfis?.find((p) => p.id === id)
}
