"use client"

/**
 * Hooks de dados do Estúdio (SWR sobre `lib/conteudo/data.ts`). Toda escrita
 * passa por aqui e revalida a lista — a biblioteca e o editor nunca divergem.
 */

import { useCallback } from "react"
import useSWR from "swr"
import {
  deleteDocumento,
  getBrandKits,
  getDocumentos,
  getMeusTemplates,
  getPosts,
  saveBrandKit,
  saveDocumento,
  saveMeuTemplate,
} from "@/lib/conteudo/data"
import type { BrandKit, Documento, MeuTemplate, PerfilEditavel } from "@/lib/conteudo/types"

export function useDocumentos() {
  const { data, error, isLoading, mutate } = useSWR("conteudo:documentos", getDocumentos, { revalidateOnFocus: false })
  const salvar = useCallback(
    async (doc: Documento) => {
      const lista = await saveDocumento(doc)
      await mutate(lista, { revalidate: false })
      return lista
    },
    [mutate],
  )
  const excluir = useCallback(
    async (id: string) => {
      const lista = await deleteDocumento(id)
      await mutate(lista, { revalidate: false })
      return lista
    },
    [mutate],
  )
  return { docs: data ?? null, error, isLoading, salvar, excluir, recarregar: () => mutate() }
}

export function useMeusTemplates() {
  const { data, mutate } = useSWR("conteudo:meus-templates", getMeusTemplates, { revalidateOnFocus: false })
  const salvar = useCallback(
    async (t: MeuTemplate) => {
      const lista = await saveMeuTemplate(t)
      await mutate(lista, { revalidate: false })
    },
    [mutate],
  )
  return { meus: data ?? [], salvar }
}

export function useBrandKits() {
  const { data, mutate } = useSWR("conteudo:brandkits", getBrandKits, { revalidateOnFocus: false })
  const salvar = useCallback(
    async (perfil: PerfilEditavel, kit: BrandKit) => {
      const novo = await saveBrandKit(perfil, kit)
      await mutate(novo, { revalidate: false })
    },
    [mutate],
  )
  return { kits: data ?? null, salvar }
}

export function usePostsPublicados() {
  const { data } = useSWR("conteudo:posts", () => getPosts("consolidado"), { revalidateOnFocus: false })
  return data ?? []
}
