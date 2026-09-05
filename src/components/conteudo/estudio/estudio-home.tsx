"use client"

/**
 * Orquestrador da home do Estúdio: biblioteca + fluxo Novo carrossel.
 * Parâmetros de URL: `?novo=template|ia|inspiracao&perfil=bruno|convertfy`
 * (o Dashboard e os slots vazios chegam assim) e `?criar-template=1`.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/lib/hooks/use-toast"
import { getPromptsProntos, QuotaExcedidaError } from "@/lib/conteudo/data"
import { comHistorico, novoId } from "@/lib/conteudo/documento"
import type { PerfilEditavel } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { Biblioteca, type Caminho } from "./biblioteca"
import { NovoFlow, type CriacaoResultado } from "./novo-flow"
import { useBrandKits, useDocumentos, useMeusTemplates, usePostsPublicados } from "./use-estudio-data"

const CAMINHOS: Caminho[] = ["template", "ia", "inspiracao"]

export const ANEXOS_KEY = (docId: string) => `conteudo:anexos:${docId}`

export function EstudioHome() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const { docs, salvar, excluir } = useDocumentos()
  const { meus, salvar: salvarMeuTemplate } = useMeusTemplates()
  const { kits } = useBrandKits()
  const posts = usePostsPublicados()
  const [novo, setNovo] = useState<{ caminho?: Caminho | null; perfil?: PerfilEditavel; modoTemplate?: boolean } | null>(null)

  useEffect(() => {
    const n = params.get("novo")
    const p = params.get("perfil")
    if (params.get("criar-template")) setNovo({ modoTemplate: true })
    else if (n) setNovo({ caminho: CAMINHOS.includes(n as Caminho) ? (n as Caminho) : null, perfil: p === "bruno" || p === "convertfy" ? p : undefined })
  }, [params])

  const fecharNovo = useCallback(() => {
    setNovo(null)
    if (params.get("novo") || params.get("criar-template")) router.replace(ROUTES.ADMIN.CONTEUDO.ESTUDIO)
  }, [params, router])

  const abrir = (id: string, modal?: string) => router.push(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(id)}${modal ? `?modal=${modal}` : ""}`)

  const onCriado = async (r: CriacaoResultado) => {
    try {
      await salvar(r.doc)
      if (r.salvarTemplate) {
        await salvarMeuTemplate({
          id: novoId("meu-"),
          nome: r.salvarTemplate.nome,
          origem: "inspiração",
          frames: r.salvarTemplate.frames,
          usos: r.caminho === "template-review" ? 0 : 1,
          seed: `meutpl${Date.now()}`,
          templateId: r.salvarTemplate.templateId,
          criadoEm: new Date().toISOString(),
        })
      }
      if (r.anexos?.length) {
        try {
          sessionStorage.setItem(ANEXOS_KEY(r.doc.id), JSON.stringify(r.anexos))
        } catch {
          /* sem sessionStorage: as referências ficam de fora do chat */
        }
      }
      if (r.modoLocal) toast({ title: "ConvertIA indisponível", description: "O carrossel foi montado pelo modo local. Regenere no editor quando a IA voltar." })
      setNovo(null)
      const q = r.caminho === "template-review" ? "?modo=template" : r.caminho === "ia" ? "?aba=ia" : ""
      router.push(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(r.doc.id)}${q}`)
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: e instanceof QuotaExcedidaError ? e.message : "Tente de novo.", variant: "destructive" })
    }
  }

  const duplicar = async (id: string) => {
    const d = docs?.find((x) => x.id === id)
    if (!d) return
    const copia = comHistorico(
      { ...d, id: novoId("d"), nome: `${d.nome} (cópia)`, status: "rascunho", data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), agenda: undefined, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() },
      `Duplicado de "${d.nome}"`,
    )
    await salvar(copia)
    toast({ title: "Carrossel duplicado" })
  }

  const renomear = async (id: string, nome: string) => {
    const d = docs?.find((x) => x.id === id)
    if (!d || d.nome === nome) return
    await salvar(comHistorico({ ...d, nome }, `Renomeado para "${nome}"`))
  }

  const excluirDoc = async (id: string) => {
    await excluir(id)
    toast({ title: "Carrossel excluído" })
  }

  return (
    <>
      <Biblioteca
        docs={docs}
        meusTemplates={meus}
        promptsProntos={getPromptsProntos().length}
        onAbrir={abrir}
        onNovo={(caminho, perfil) => setNovo({ caminho: caminho ?? null, perfil })}
        onCriarTemplate={() => setNovo({ modoTemplate: true })}
        onExcluir={excluirDoc}
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
          modoTemplate={novo.modoTemplate}
          posts={posts}
          brandKits={kits}
          onClose={fecharNovo}
          onCriado={onCriado}
        />
      )}
    </>
  )
}
