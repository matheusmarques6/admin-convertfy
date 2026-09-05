"use client"

/**
 * Painel direito do editor: abas Frames | Legenda. Frames em grade 2×N com
 * reordenação por drag (reflete canvas e numeração), "Trocar" (variações de
 * layout com miniaturas REAIS + tipo de frame), menu ⋮ (duplicar, dividir,
 * regenerar com IA, ocultar, excluir) e tile Adicionar. Modo template
 * expõe tipo e slot por frame.
 */

import { useState } from "react"
import { MoreVertical, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { adicionarFrame, contarPalavras, dividirFrame, duplicarFrame, excluirFrame, MIN_FRAMES, reordenarFrames, trocarTipoFrame } from "@/lib/conteudo/documento"
import { chamarIA } from "@/lib/conteudo/ia/client"
import { frameLocal, legendaLocal } from "@/lib/conteudo/ia/fallback"
import { resumoDocumento } from "@/lib/conteudo/ia/prompt"
import { ST_TIPOS_TROCA, ST_VARIANTES } from "@/lib/conteudo/templates"
import type { FrameTipo, VarianteLayout } from "@/lib/conteudo/types"
import { CtLabel, TNUM, inputCls, textareaCls } from "../ui"
import type { EditorApi } from "./editor-types"
import { AiBtn } from "./paineis"
import { Thumb } from "./thumb"

const TIPOS: FrameTipo[] = ["capa", "dado", "texto", "prova", "lista", "mec", "cta"]

export function FramesPanel({ api }: { api: EditorApi }) {
  const { doc, ativo, modoTemplate } = api
  const [aba, setAba] = useState<"frames" | "legenda">("frames")
  const [trocar, setTrocar] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [dragIx, setDragIx] = useState<number | null>(null)
  const [overIx, setOverIx] = useState<number | null>(null)
  const [gerandoLegenda, setGerandoLegenda] = useState(false)
  const [regenerando, setRegenerando] = useState<string | null>(null)
  const palavras = contarPalavras(doc.legenda)

  const gerarLegenda = async () => {
    setGerandoLegenda(true)
    try {
      const r = await chamarIA({ acao: "legenda", resumo: resumoDocumento(doc), palavraChave: doc.palavraChave || undefined })
      api.set({ legenda: r.legenda, palavraChave: r.palavraChave.toUpperCase() }, "Legenda gerada pela ConvertIA")
      api.avisar("Legenda pronta")
    } catch {
      const r = legendaLocal(doc.palavraChave)
      api.set({ legenda: r.legenda, palavraChave: r.palavraChave }, "Legenda do modo local")
      api.avisar("ConvertIA indisponível: legenda do modo local")
    } finally {
      setGerandoLegenda(false)
    }
  }

  const regenerar = async (i: number) => {
    const f = doc.frames[i]
    if (!f) return
    setRegenerando(f.frameId)
    try {
      const r = await chamarIA({ acao: "preencher_frame", resumo: resumoDocumento(doc), frame: { frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos }, atual: f.textos, regenerar: true })
      api.set((d) => ({ ...d, frames: d.frames.map((x) => (x.frameId === f.frameId ? { ...x, textos: { ...x.textos, ...r.textos } } : x)) }), `${f.label} regenerado pela ConvertIA`)
    } catch {
      const r = frameLocal(doc, f.frameId)
      api.set((d) => ({ ...d, frames: d.frames.map((x) => (x.frameId === f.frameId ? { ...x, textos: { ...x.textos, ...r.textos } } : x)) }), `${f.label} preenchido pelo modo local`)
      api.avisar("ConvertIA indisponível: texto do modo local")
    } finally {
      setRegenerando(null)
    }
  }

  return (
    <aside className="flex w-[212px] shrink-0 flex-col overflow-y-auto border-l border-[var(--ops-border)] bg-[var(--ops-card)] px-3 pb-5 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2.5 flex items-center gap-0.5 border-b border-[var(--ops-border)]">
        {(
          [
            ["frames", "Frames"],
            ["legenda", "Legenda"],
          ] as Array<["frames" | "legenda", string]>
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setAba(k)} className={cn("-mb-px border-b-2 px-2.5 py-1.5 text-[12px]", aba === k ? "border-[var(--ops-accent)] font-semibold text-[var(--ops-title)]" : "border-transparent font-medium text-[var(--ops-sec)]")}>
            {l}
          </button>
        ))}
        <span className="ml-auto text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
          {doc.frames.length} · {doc.proporcaoExport}
        </span>
      </div>

      {aba === "legenda" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <CtLabel className="mb-0">Legenda</CtLabel>
            <span className={cn("text-[10.5px] font-semibold", palavras >= 150 && palavras <= 180 ? "text-[var(--ops-pos)]" : "text-[var(--ops-warn)]")} style={TNUM}>
              {palavras} palavras
            </span>
          </div>
          <textarea value={doc.legenda} onChange={(e) => api.set({ legenda: e.target.value })} rows={14} placeholder="Gerada junto com a estrutura. Edite à vontade." className={cn(textareaCls, "text-[11.5px]")} />
          <div>
            <CtLabel>Comment gate</CtLabel>
            <input value={doc.palavraChave} onChange={(e) => api.set({ palavraChave: e.target.value.toUpperCase() })} placeholder="Ex.: 8%" className={inputCls} />
          </div>
          <AiBtn onClick={gerarLegenda} loading={gerandoLegenda}>
            {doc.legenda ? "Regenerar legenda" : "Gerar legenda"}
          </AiBtn>
          <div className="text-[10.5px] leading-relaxed text-[var(--ops-mut)]">Compliance e exportação ficam na tela Exportar.</div>
        </div>
      )}

      {aba === "frames" && modoTemplate && (
        <div className="mb-2.5 rounded-lg border border-[#0E7490]/40 bg-[#0E7490]/15 px-2.5 py-2 text-[10.5px] leading-relaxed text-[#0E7490] dark:text-[#67E8F9]">Modo template: revise tipo, slot de imagem e limites de cada frame antes de salvar.</div>
      )}

      <div className={cn("grid grid-cols-2 gap-2", aba !== "frames" && "hidden")}>
        {doc.frames.map((x, i) => {
          const on = i === ativo
          const variantes = ST_VARIANTES[x.tipo]
          return (
            <div
              key={x.frameId}
              draggable
              onDragStart={(e) => {
                setDragIx(i)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (overIx !== i) setOverIx(i)
              }}
              onDragLeave={() => setOverIx(null)}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIx != null && dragIx !== i) {
                  api.set(() => reordenarFrames(doc, dragIx, i), null)
                  api.setAtivo(i)
                }
                setDragIx(null)
                setOverIx(null)
              }}
              onDragEnd={() => {
                setDragIx(null)
                setOverIx(null)
              }}
              onClick={() => api.setAtivo(i)}
              className={cn("relative cursor-pointer", overIx === i && dragIx !== i && "ring-2 ring-[var(--ops-accent)] ring-offset-2 ring-offset-[var(--ops-card)] rounded-[7px]")}
            >
              <div className={cn("relative overflow-hidden rounded-[7px] border-2", on ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]", x.oculto && "opacity-40")}>
                <Thumb doc={doc} ix={i} w={82} />
                {regenerando === x.frameId && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[9px] font-semibold text-white">gerando</div>}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--ops-mut)]">
                <span className={cn("font-bold", on ? "text-[var(--ops-accent)]" : "text-[var(--ops-sec)]")} style={TNUM}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate">{x.label}</span>
                {on && x.tipo !== "cta" && (
                  <Popover open={trocar === x.frameId} onOpenChange={(o) => setTrocar(o ? x.frameId : null)}>
                    <PopoverTrigger asChild>
                      <button type="button" onClick={(e) => e.stopPropagation()} className="text-[10px] font-semibold text-[var(--ops-accent)] hover:underline">
                        Trocar
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" sideOffset={6} className="w-[236px] rounded-[10px] border-[var(--ops-border)] bg-[var(--ops-card)] p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
                      {variantes && (
                        <>
                          <div className="px-1 pb-1.5 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[var(--ops-mut)]">Variações de layout</div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {variantes.map(([v, l]) => {
                              const cur = (x.variante ?? "a") === v
                              const docV = { ...doc, frames: doc.frames.map((y, j) => (j === i ? { ...y, variante: v as VarianteLayout } : y)) }
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  title={l}
                                  onClick={() => {
                                    api.set(() => docV, `${x.label}: layout ${l.toLowerCase()}`)
                                    setTrocar(null)
                                  }}
                                  className={cn("rounded-[7px] border-2 p-1", cur ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")}
                                >
                                  <div className="overflow-hidden rounded">
                                    <Thumb doc={docV} ix={i} w={62} />
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                      {x.tipo !== "capa" && (
                        <>
                          <div className="px-1 pb-1.5 pt-2.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[var(--ops-mut)]">Tipo de frame</div>
                          <div className="flex flex-wrap gap-1">
                            {ST_TIPOS_TROCA.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  api.set(() => trocarTipoFrame(doc, i, t), null)
                                  setTrocar(null)
                                }}
                                className={cn("h-6 rounded-full border px-2.5 text-[11px] font-medium capitalize", x.tipo === t ? "border-[var(--ops-accent)] bg-[var(--ops-hover)] text-[var(--ops-title)]" : "border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]")}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
                <Popover open={menu === x.frameId} onOpenChange={(o) => setMenu(o ? x.frameId : null)}>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label="Ações do frame" onClick={(e) => e.stopPropagation()} className="flex text-[var(--ops-mut)] hover:text-[var(--ops-title)]">
                      <Icon icon={MoreVertical} customSize={12} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={4} className="w-[176px] rounded-[9px] border-[var(--ops-border)] bg-[var(--ops-card)] p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                    {(
                      [
                        ["Duplicar", () => api.set(() => duplicarFrame(doc, i), null), false],
                        ["Dividir em dois", () => api.set(() => dividirFrame(doc, i), null), x.tipo === "capa" || x.tipo === "cta"],
                        ["Regenerar texto com IA", () => void regenerar(i), false],
                        [x.oculto ? "Mostrar" : "Ocultar", () => api.setFrame(i, { oculto: !x.oculto }), false],
                        [
                          "Excluir",
                          () => {
                            api.set(() => excluirFrame(doc, i), null)
                            api.setAtivo(Math.max(0, i - 1))
                          },
                          doc.frames.length <= MIN_FRAMES,
                        ],
                      ] as Array<[string, () => void, boolean]>
                    ).map(([l, fn, off]) => (
                      <button
                        key={l}
                        type="button"
                        disabled={off}
                        onClick={() => {
                          setMenu(null)
                          fn()
                        }}
                        className={cn("block w-full rounded-md px-[9px] py-1.5 text-left text-[11.5px] hover:bg-[var(--ops-hover)] disabled:opacity-40", l === "Excluir" ? "text-[var(--ops-neg)]" : "text-[var(--ops-text)]")}
                      >
                        {l}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              {modoTemplate && (
                <div className="mt-1 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  <select value={x.tipo} onChange={(e) => api.set(() => trocarTipoFrame(doc, i, e.target.value as FrameTipo), null)} className="h-[22px] rounded-[5px] border border-[var(--ops-border)] bg-[var(--ops-page)] px-1 text-[10.5px] text-[var(--ops-title)] outline-none">
                    {TIPOS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px] text-[var(--ops-sec)]">
                    <input type="checkbox" checked={x.slotsImagem > 0} onChange={(e) => api.setFrame(i, { slotsImagem: e.target.checked ? 1 : 0, imagens: e.target.checked ? x.imagens : {} })} className="m-0 accent-[var(--ops-accent)]" /> slot de imagem
                  </label>
                </div>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => {
            api.set(() => adicionarFrame(doc), null)
            api.setAtivo(Math.max(0, doc.frames.length - 1))
          }}
          className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-[7px] border border-dashed border-[var(--ops-border)] text-[10.5px] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)]"
        >
          <Icon icon={Plus} customSize={14} />
          Adicionar
        </button>
      </div>
    </aside>
  )
}
