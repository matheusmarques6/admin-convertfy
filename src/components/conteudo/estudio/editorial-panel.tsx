"use client"

/**
 * Painel "Editorial" do editor: liga o motor editorial ao documento aberto.
 * Aqui moram as ações que precisam do documento — aplicar a headline na
 * capa, gerar a copy dos frames pela espinha e revisar a copy atual — e o
 * estado vai para `doc.editorial` pelo `api.set` (entra no autosave e no
 * histórico).
 */

import { useCallback } from "react"
import { consolidarRevisao, editorialVazio, papeisDosFrames, revisarDocumento } from "@/lib/conteudo/editorial"
import { setTexto as setTextoDoc } from "@/lib/conteudo/documento"
import { chamarIA } from "@/lib/conteudo/ia/client"
import { getTemplate } from "@/lib/conteudo/templates"
import type { Campo, Editorial, EtapaFunil, HeadlineOpcao } from "@/lib/conteudo/types"
import type { EditorApi } from "./editor-types"
import { EditorialMotor, type MotorContexto } from "./editorial-motor"

export function PainelEditorial({ api }: { api: EditorApi }) {
  const { doc } = api
  const tpl = getTemplate(doc.templateId)
  const editorial: Editorial = doc.editorial ?? editorialVazio(doc.nome, "marca", true)
  const perfil = { handle: api.perfil?.handle ?? (doc.brandKit.brandName || null), nome: api.perfil?.nome ?? doc.brandKit.brandName2, voz: editorial.voz }
  const frames = doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos as string[] }))
  const capa = doc.frames[0]

  const contexto: MotorContexto = {
    perfil,
    templateNome: tpl.nome,
    frames,
    etapaFunil: tpl.etapaFunil as EtapaFunil,
    capaAtual: capa ? { titulo: capa.textos.titulo, subtitulo: capa.textos.subtitulo } : undefined,
  }

  const onChange = useCallback((e: Editorial) => api.set((d) => ({ ...d, editorial: e }), null), [api])

  const onAplicarHeadline = (h: HeadlineOpcao) => {
    api.set((d) => {
      let n = setTextoDoc(d, d.frames[0].frameId, "titulo", h.texto)
      if (h.subtitulo && d.frames[0].campos.includes("subtitulo")) n = setTextoDoc(n, d.frames[0].frameId, "subtitulo", h.subtitulo)
      return { ...n, nome: h.texto }
    }, "Headline escolhida no motor editorial")
    api.setAtivo(0)
  }

  const onGerarCopy = async () => {
    const ed = doc.editorial
    if (!ed?.triagem || !ed.espinha) throw new Error("Triagem e espinha precisam estar prontas.")
    const papeis = new Map(papeisDosFrames(doc.frames).map((p) => [p.frameId, p.papel]))
    const r = await chamarIA({
      acao: "gerar_estrutura",
      nome: doc.nome,
      perfil,
      pauta: ed.insumo || doc.nome,
      pilar: contexto.pilar,
      etapaFunil: contexto.etapaFunil,
      objetivoCta: "Comment gate",
      templateNome: tpl.nome,
      frames: doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos, papel: papeis.get(f.frameId) })),
      triagem: ed.triagem,
      espinha: ed.espinha,
      segundaPessoa: ed.segundaPessoa,
    })
    api.set(
      (d) => ({
        ...d,
        nome: r.nome?.trim() || d.nome,
        frames: d.frames.map((f) => {
          const x = r.frames.find((y) => y.frameId === f.frameId)
          return x ? { ...f, textos: { ...f.textos, ...x.textos } } : f
        }),
        legenda: r.legenda || d.legenda,
        palavraChave: r.palavraChave ? r.palavraChave.toUpperCase() : d.palavraChave,
        cta: r.palavraChave ? { ...d.cta, texto: `Comente ${r.palavraChave.toUpperCase()}` } : d.cta,
        editorial: d.editorial ? { ...d.editorial, revisao: undefined } : d.editorial,
      }),
      "Copy gerada pela espinha dorsal",
    )
    api.setAtivo(0)
    api.avisar("Copy gerada pela espinha. Revise antes de exportar.")
  }

  const onRevisar = async () => {
    const ed = doc.editorial ?? editorial
    const violacoes = revisarDocumento(doc, { segundaPessoa: ed.segundaPessoa })
    const papeis = new Map(papeisDosFrames(doc.frames).map((p) => [p.frameId, p.papel]))
    const r = await chamarIA({
      acao: "revisar",
      frames: doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos, papel: papeis.get(f.frameId), textos: f.textos })),
      legenda: doc.legenda,
      perfil,
      segundaPessoa: ed.segundaPessoa,
      violacoes: violacoes.map((v) => ({ frameId: v.frameId, campo: v.campo, nome: v.nome, trecho: v.trecho, sugestao: v.sugestao })),
      espinha: ed.espinha,
      triagem: ed.triagem,
    })
    const revisao = consolidarRevisao(r, violacoes)
    api.set((d) => ({ ...d, editorial: { ...(d.editorial ?? ed), revisao } }), `Revisão editorial: ${revisao.aprovado ? "aprovada" : "reprovada"}`)
  }

  const onAplicarReescrita = (frameId: string, reescrita: Partial<Record<Campo, string>>) => {
    api.set((d) => {
      let n = d
      for (const [campo, valor] of Object.entries(reescrita)) if (valor) n = setTextoDoc(n, frameId, campo as Campo, valor)
      return n
    }, "Reescrita da revisão aplicada")
    api.setAtivo(Math.max(0, doc.frames.findIndex((f) => f.frameId === frameId)))
  }

  return (
    <EditorialMotor
      editorial={editorial}
      onChange={onChange}
      contexto={contexto}
      compacto
      onAplicarHeadline={onAplicarHeadline}
      onGerarCopy={onGerarCopy}
      onRevisar={onRevisar}
      onAplicarReescrita={onAplicarReescrita}
      onIrParaFrame={(id) => api.setAtivo(Math.max(0, doc.frames.findIndex((f) => f.frameId === id)))}
    />
  )
}
