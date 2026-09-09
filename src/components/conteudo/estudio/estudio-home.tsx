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
import { comHistorico, documentoDaReferencia, novoUuid } from "@/lib/conteudo/documento"
import { estruturaDaReferencia } from "@/lib/conteudo/referencia-para-documento"
import type { PerfilEditavel, Referencia } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { Biblioteca, type Caminho } from "./biblioteca"
import { NovoFlow, type CriacaoResultado } from "./novo-flow"
import { ReferenciasSecao } from "./referencias"
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
  const [novo, setNovo] = useState<{ caminho?: Caminho | null; perfil?: PerfilEditavel; meuTemplateId?: string; modoTemplate?: boolean; pauta?: string } | null>(null)

  useEffect(() => {
    const n = params.get("novo")
    const p = params.get("perfil")
    if (params.get("criar-template")) setNovo({ modoTemplate: true })
    // `pauta` vem do Banco de Ideias ("Criar carrossel"): a ideia já entra
    // escrita no caminho IA, em vez de o operador copiar e colar o título.
    else if (n) setNovo({ caminho: CAMINHOS.includes(n as Caminho) ? (n as Caminho) : null, perfil: p ?? undefined, pauta: params.get("pauta") ?? undefined })
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
      // Gerado pela espinha: abre nos Ajustes com o Motor editorial (o passo seguinte é revisar).
      const q = r.caminho === "template-review" ? "?modo=template" : r.caminho === "ia" ? (r.doc.editorial?.espinha ? "?aba=ajustes" : "?aba=ia") : ""
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

  /**
   * Referência → carrossel editável. A peça nasce com a sequência, a copy e
   * as imagens da referência, na identidade visual da casa — é o "template
   * com base no que enviei": abre no editor e cada palavra é editável.
   *
   * O que não coube é DITO no toast (imagem em slide que não desenha foto,
   * copy acima do limite confortável): sumir em silêncio faria o operador
   * procurar na tela o que a referência mostrava.
   */
  const usarReferencia = async (ref: Referencia) => {
    const perfil = perfis?.[0]?.id ?? ""
    const { doc, imagemSemLugar, camposLongos } = documentoDaReferencia(ref, perfil, {
      brandKit: perfil ? kits?.[perfil] : undefined,
    })
    await criar(doc)

    // A FORMA também fica guardada: o mesmo clique deixa a sequência em
    // "Meus templates" para as próximas peças. Deduplicado por nome —
    // clicar duas vezes na mesma referência não enche a prateleira.
    if (!meus.some((m) => m.nome === ref.nome)) {
      try {
        await criarMeuTemplate({ nome: ref.nome, templateId: doc.templateId, estrutura: estruturaDaReferencia(ref.slides), usos: 1 })
      } catch {
        /* o carrossel já existe; falhar o atalho não pode derrubar o fluxo */
      }
    }

    const notas: string[] = []
    if (imagemSemLugar.length) notas.push(`${imagemSemLugar.length} imagem${imagemSemLugar.length > 1 ? "ns" : ""} de slide sem lugar para foto (dado/CTA)`)
    if (camposLongos.length) notas.push(`${camposLongos.length} texto${camposLongos.length > 1 ? "s" : ""} acima do limite — o canvas encolhe, revise`)
    toast({ title: "Carrossel criado a partir da referência", description: notas.join(" · ") || doc.nome })
    router.push(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(doc.id)}?aba=ajustes`)
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
        referencias={<ReferenciasSecao perfis={perfis} onUsarComoModelo={usarReferencia} />}
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
          promptInicial={novo.pauta}
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
