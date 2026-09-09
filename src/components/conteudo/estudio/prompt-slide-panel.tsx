"use client"

/**
 * Painel "Prompt do slide" (via B): o prompt de imagem de cada frame,
 * sugerido pelo construtor puro (`lib/conteudo/prompt-slide`) e editável.
 * Dois destinos para o mesmo texto — copiar para o ChatGPT (como o
 * usuário faz hoje) ou gerar pela rota `gerar_imagem`, com as duas
 * variações lado a lado (GPT Image 2 × Gemini).
 *
 * O prompt editado vive em `frame.promptImagem` e o modo em
 * `frame.imagemModo` (JSONB do documento, entra no autosave e no
 * histórico). O híbrido é o padrão: a imagem é só o visual e o renderer
 * escreve a copy. "Slide inteiro" aplica a imagem full-bleed e cala o
 * texto do frame — quem escolhe isso vê o aviso.
 */

import { useEffect, useMemo, useState } from "react"
import { Copy, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { slotDeUrl } from "@/lib/conteudo/data"
import { papeisDosFrames } from "@/lib/conteudo/editorial"
import { gerarImagemIA } from "@/lib/conteudo/ia/client"
import { aceitaHibrido, construirPromptDeSlide, pedeImagem, preenchimento, promptEfetivo, sugerirModo, type ContextoPrompt } from "@/lib/conteudo/prompt-slide"
import { selecionarReferencias } from "@/lib/conteudo/referencias"
import { getTemplate, ST_MOLDE_KEY } from "@/lib/conteudo/templates"
import type { DocFrame, ModoImagem } from "@/lib/conteudo/types"
import { CtLabel, CtSeg, CtSkel, TNUM, textareaCls } from "../ui"
import type { EditorApi } from "./editor-types"
import { AiBtn } from "./paineis"
import { useReferencias } from "./use-estudio-data"

const MODOS: Array<[ModoImagem, string]> = [
  ["hibrido", "Híbrido"],
  ["completo", "Slide inteiro"],
]

/** Quantas variações por clique: uma de cada modelo, lado a lado. */
const VARIACOES = 2

export function PainelPromptSlide({ api }: { api: EditorApi }) {
  const { doc, ativo } = api
  const f: DocFrame | undefined = doc.frames[ativo]
  const tpl = getTemplate(doc.templateId)
  const { referencias } = useReferencias()

  const visiveis = useMemo(() => doc.frames.filter((x) => !x.oculto), [doc.frames])
  const papeis = useMemo(() => new Map(papeisDosFrames(doc.frames).map((p) => [p.frameId, p.papel])), [doc.frames])
  const porQueFunciona = useMemo(() => {
    const sel = selecionarReferencias(referencias ?? [], { molde: ST_MOLDE_KEY[tpl.nome] ?? null })
    return Array.from(new Set(sel.flatMap((r) => r.porQueFunciona)))
  }, [referencias, tpl.nome])

  const modo: ModoImagem = f ? sugerirModo(f) : "hibrido"
  const ctx: ContextoPrompt | null = f
    ? {
        frame: f,
        indice: Math.max(0, visiveis.indexOf(f)),
        total: Math.max(1, visiveis.length),
        papel: papeis.get(f.frameId) ?? null,
        doc,
        templateNome: tpl.nome,
        porQueFunciona,
        modo,
      }
    : null
  const efetivo = ctx ? promptEfetivo(ctx) : null

  const [texto, setTexto] = useState(efetivo?.prompt ?? "")
  const [gerando, setGerando] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  // Troca de slide, de modo ou de copy: o textarea segue o prompt que
  // vale. O que o humano digitou e ainda não salvou (blur) é raro de
  // perder aqui — o blur acontece ANTES de clicar em outro slide.
  const chave = `${f?.frameId ?? ""}|${modo}|${efetivo?.prompt ?? ""}`
  useEffect(() => {
    setTexto(efetivo?.prompt ?? "")
    setUrls([])
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  if (!f || !ctx) return null
  const i = ativo

  const setFrame = (patch: Partial<DocFrame>, label: string | null) =>
    api.set((d) => ({ ...d, frames: d.frames.map((x, j) => (j === i ? { ...x, ...patch } : x)) }), label)

  const salvarTexto = () => {
    const t = texto.trim()
    const atual = f.promptImagem?.trim() ?? ""
    if (t === atual) return
    // Vazio ou igual ao sugerido volta ao modo "sugerido" (sem gravar cópia).
    const sugerido = construirPromptDeSlide({ ...ctx, frame: { ...f, promptImagem: undefined } })
    setFrame({ promptImagem: !t || t === sugerido ? undefined : t }, "Prompt do slide")
  }

  const refazer = () => {
    const sugerido = construirPromptDeSlide({ ...ctx, frame: { ...f, promptImagem: undefined } })
    setTexto(sugerido)
    if (f.promptImagem) setFrame({ promptImagem: undefined }, "Prompt do slide refeito")
  }

  const trocarModo = (m: ModoImagem) => {
    if (m === modo) return
    setFrame({ imagemModo: m }, m === "completo" ? "Imagem: slide inteiro" : "Imagem: híbrido")
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto.trim())
      api.avisar("Prompt copiado — cole no ChatGPT")
    } catch {
      api.avisar("Não deu para copiar: selecione o texto e copie à mão")
    }
  }

  const gerar = async () => {
    setGerando(true)
    setErro(null)
    setUrls([])
    try {
      const r = await gerarImagemIA({ prompt: texto.trim(), aspecto: doc.proporcaoExport === "9:16" ? "9:16" : "4:5", quantidade: VARIACOES, modo })
      setUrls(r.urls)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar")
    } finally {
      setGerando(false)
    }
  }

  const aplicar = (url: string) => {
    const patch: Partial<DocFrame> = { imagens: { slot1: slotDeUrl(url) }, imagemModo: modo }
    // No híbrido, um frame do template sem slot ganha um: o renderer de
    // texto/lista/mec já desenha o slot quando ele existe.
    if (modo === "hibrido" && f.slotsImagem === 0 && aceitaHibrido(f.tipo)) patch.slotsImagem = 1
    setFrame(patch, `Imagem gerada · ${f.label}`)
    api.setImgSel({ frameId: f.frameId })
  }

  const pedem = doc.frames.map((x, j) => ({ j, x, p: preenchimento(x) })).filter(({ x }) => pedeImagem(x))
  const opcoesModo = aceitaHibrido(f.tipo) ? MODOS : MODOS.filter(([k]) => k === "completo")
  const slideInteiroAtivo = f.imagemModo === "completo" && Boolean(f.imagens.slot1)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11.5px] font-semibold text-[var(--ops-title)]">
          Slide {i + 1} · {f.label}
        </div>
        <span className="text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
          {Math.round(preenchimento(f) * 100)}% de texto
        </span>
      </div>

      <div>
        <CtLabel>Como a imagem entra</CtLabel>
        <CtSeg val={modo} onChange={trocarModo} opts={opcoesModo} size="sm" />
        <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">
          {modo === "hibrido"
            ? "A imagem é só o visual; o Estúdio escreve a copy por cima, com a tipografia da casa. Copy continua editável."
            : aceitaHibrido(f.tipo)
              ? "O modelo desenha o slide com o texto. A copy dos campos deixa de aparecer; o modelo pode errar acento e trocar a fonte entre slides."
              : "Este tipo de slide não tem lugar para imagem no híbrido — só o slide inteiro pelo modelo."}
        </div>
      </div>

      {slideInteiroAtivo && (
        <div className="rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-2.5 py-2 text-[10.5px] leading-relaxed text-[var(--ops-title)]">
          Este slide é a imagem inteira gerada: o texto dos campos não é desenhado. Para voltar a editar a copy, troque para Híbrido.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <CtLabel>Prompt</CtLabel>
          <span className="text-[10px] text-[var(--ops-mut)]">{f.promptImagem?.trim() ? "editado por você" : "sugerido pelo Estúdio"}</span>
        </div>
        <textarea rows={11} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvarTexto} className={cn(textareaCls, "resize-y text-[11px] leading-relaxed")} spellCheck={false} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button type="button" onClick={copiar} disabled={!texto.trim()} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)] disabled:opacity-50">
            <Icon icon={Copy} customSize={13} /> Copiar prompt
          </button>
          <button type="button" onClick={refazer} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
            <Icon icon={RefreshCw} customSize={13} /> Refazer sugestão
          </button>
        </div>
        <div className="mt-1 text-[10.5px] text-[var(--ops-mut)]">Copie para o ChatGPT Image, ou gere aqui pela API — mesmo prompt nos dois.</div>
      </div>

      <AiBtn prominent onClick={gerar} loading={gerando} disabled={!texto.trim()}>
        Gerar {VARIACOES} variações
      </AiBtn>
      <div className="-mt-1 text-[10.5px] text-[var(--ops-mut)]">Uma de cada modelo (GPT Image 2 e Gemini), lado a lado. Clique na que servir.</div>
      {erro && <div className="text-[11px] text-[var(--ops-neg)]">{erro}</div>}
      {gerando && (
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: VARIACOES }, (_, k) => (
            <div key={k} className={doc.proporcaoExport === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]"}>
              <CtSkel h={0} className="h-full" r={8} />
            </div>
          ))}
        </div>
      )}
      {urls.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {urls.map((u) => (
            <button key={u} type="button" aria-label="Usar esta variação" onClick={() => aplicar(u)} className={cn("rounded-lg border-2 bg-cover bg-center hover:border-[var(--ops-accent)]", doc.proporcaoExport === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]", f.imagens.slot1?.url === u ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")} style={{ backgroundImage: `url(${u})` }} />
          ))}
        </div>
      )}

      <div>
        <CtLabel>Slides que pedem imagem</CtLabel>
        {pedem.length === 0 ? (
          <div className="text-[10.5px] text-[var(--ops-mut)]">Nenhum: todo slide com lugar para imagem já tem uma ou está cheio de texto.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {pedem.map(({ j, x, p }) => (
              <button key={x.frameId} type="button" onClick={() => api.setAtivo(j)} title={`${x.label} · ${Math.round(p * 100)}% de texto, sem imagem`} className={cn("rounded-md border px-2 py-0.5 text-[10.5px] font-medium hover:bg-[var(--ops-hover)]", j === i ? "border-[var(--ops-accent)] text-[var(--ops-title)]" : "border-[var(--ops-border)] text-[var(--ops-mut)]")} style={TNUM}>
                {j + 1} · {Math.round(p * 100)}%
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">Menos de 60% de texto e sem imagem: o slide fica vazio sem ela.</div>
      </div>
    </div>
  )
}
