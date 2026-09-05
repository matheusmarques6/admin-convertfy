"use client"

/**
 * Orquestrador da home do Estúdio: biblioteca + fluxo Novo carrossel.
 * Parâmetros de URL: `?novo=template|ia|inspiracao&perfil=<id do canal>`
 * (o Dashboard chega assim) e `?criar-template=1`.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/lib/hooks/use-toast"
import { getPromptsProntos } from "@/lib/conteudo/data"
import { comHistorico, novoUuid } from "@/lib/conteudo/documento"
import type { PerfilEditavel } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { Biblioteca, type Caminho } from "./biblioteca"
import { NovoFlow, type CriacaoResultado } from "./novo-flow"
import { useBrandKits, useDocumentos, useMeusTemplates, usePerfis, usePostsPublicados } from "./use-estudio-data"

const CAMINHOS: Caminho[] = ["template", "ia", "inspiracao"]

export const ANEXOS_KEY = (docId: string) => `conteudo:anexos:${docId}`

export function EstudioHome() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const { docs, error, criar, salvar, excluir } = useDocumentos()
  const { meus, criar: criarMeuTemplate, usar: usarMeuTemplate, excluir: excluirMeuTemplate } = useMeusTemplates()
  const { kits } = useBrandKits()
  const { perfis } = usePerfis()
  const posts = usePostsPublicados()
  const [novo, setNovo] = useState<{ caminho?: Caminho | null; perfil?: PerfilEditavel; meuTemplateId?: string; modoTemplate?: boolean } | null>(null)

  useEffect(() => {
    const n = params.get("novo")
    const p = params.get("perfil")
    if (params.get("criar-template")) setNovo({ modoTemplate: true })
    else if (n) setNovo({ caminho: CAMINHOS.includes(n as Caminho) ? (n as Caminho) : null, perfil: p ?? undefined })
  }, [params])

  const fecharNovo = useCallback(() => {
    setNovo(null)
    if (params.get("novo") || params.get("criar-template")) router.replace(ROUTES.ADMIN.CONTEUDO.ESTUDIO)
  }, [params, router])

  const abrir = (id: string, modal?: string) => router.push(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(id)}${modal ? `?modal=${modal}` : ""}`)

  const onCriado = async (r: CriacaoResultado) => {
    try {
      await criar(r.doc)
      if (r.salvarTemplate) {
        await criarMeuTemplate({ ...r.salvarTemplate, usos: r.caminho === "template-review" ? 0 : 1 })
      }
      if (r.meuTemplateUsado) void usarMeuTemplate(r.meuTemplateUsado).catch(() => undefined)
      if (r.anexos?.length) {
        try {
          sessionStorage.setItem(ANEXOS_KEY(r.doc.id), JSON.stringify(r.anexos))
        } catch {
          /* sem sessionStorage: as referências ficam de fora do chat */
        }
      }
      setNovo(null)
      const q = r.caminho === "template-review" ? "?modo=template" : r.caminho === "ia" ? "?aba=ia" : ""
      router.push(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(r.doc.id)}${q}`)
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" })
    }
  }

  const duplicar = async (id: string) => {
    const d = docs?.find((x) => x.id === id)
    if (!d) return
    const agora = new Date()
    const copia = comHistorico(
      {
        ...d,
        id: novoUuid(),
        nome: `${d.nome} (cópia)`,
        status: "rascunho",
        data: agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        agenda: undefined,
        publicacao: undefined,
        criadoEm: agora.toISOString(),
        atualizadoEm: agora.toISOString(),
      },
      `Duplicado de "${d.nome}"`,
    )
    try {
      await criar(copia)
      toast({ title: "Carrossel duplicado" })
    } catch (e) {
      toast({ title: "Não foi possível duplicar", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const renomear = async (id: string, nome: string) => {
    const d = docs?.find((x) => x.id === id)
    if (!d || d.nome === nome) return
    try {
      await salvar(comHistorico({ ...d, nome }, `Renomeado para "${nome}"`), { baseAtualizadoEm: d.atualizadoEm })
    } catch (e) {
      toast({ title: "Não foi possível renomear", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const excluirDoc = async (id: string) => {
    try {
      await excluir(id)
      toast({ title: "Carrossel excluído" })
    } catch (e) {
      toast({ title: "Não foi possível excluir", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const excluirTemplate = async (id: string) => {
    try {
      await excluirMeuTemplate(id)
      toast({ title: "Template removido" })
    } catch (e) {
      toast({ title: "Não foi possível remover", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  return (
    <>
      <Biblioteca
        docs={docs}
        erro={error?.message ?? null}
        perfis={perfis}
        meusTemplates={meus}
        promptsProntos={getPromptsProntos().length}
        onAbrir={abrir}
        onNovo={(caminho, perfil, meuTemplateId) => setNovo({ caminho: caminho ?? null, perfil, meuTemplateId })}
        onCriarTemplate={() => setNovo({ modoTemplate: true })}
        onExcluir={excluirDoc}
        onExcluirTemplate={excluirTemplate}
        onDuplicar={duplicar}
        onRenomear={renomear}
        onBrandKit={() => {
          const primeiro = docs?.[0]
          if (primeiro) abrir(primeiro.id, "brandkit")
          else setNovo({ caminho: "template" })
        }}
      />
      {novo && (
        <NovoFlow
          caminhoInicial={novo.caminho ?? null}
          perfilInicial={novo.perfil}
          meuTemplateInicial={novo.meuTemplateId ?? null}
          modoTemplate={novo.modoTemplate}
          posts={posts}
          perfis={perfis ?? []}
          meusTemplates={meus}
          brandKits={kits}
          onClose={fecharNovo}
          onCriado={onCriado}
        />
      )}
    </>
  )
}
