"use client"

/**
 * Painel flutuante da imagem selecionada: largura/altura do slot (frames em
 * fluxo), deslocamento, zoom, trocar e remover. Sliders fazem prévia
 * contínua e gravam no histórico ao soltar.
 */

import { useRef } from "react"
import { CtLabel, TNUM } from "../ui"
import type { EditorApi } from "./editor-types"
import type { ImagemSlot } from "@/lib/conteudo/types"
import { arquivoParaDataUrl } from "@/lib/conteudo/imagens"

const CAMPOS: Array<[keyof ImagemSlot, string, number, number, string]> = [
  ["larguraSlot", "Largura slot", 400, 1080, "px"],
  ["alturaSlot", "Altura slot", 400, 1920, "px"],
  ["x", "Horizontal", -400, 400, "px"],
  ["y", "Vertical", -400, 400, "px"],
  ["zoom", "Zoom", 100, 250, "%"],
]

export function ImageFloat({ api }: { api: EditorApi }) {
  const { doc, imgSel } = api
  const fileRef = useRef<HTMLInputElement>(null)
  const i = imgSel ? doc.frames.findIndex((x) => x.frameId === imgSel.frameId) : -1
  const frame = i >= 0 ? doc.frames[i] : null
  const img = frame?.imagens.slot1
  if (!frame || !img) return null
  const fluxo = frame.tipo === "texto" || frame.tipo === "lista" || frame.tipo === "mec"

  const patch = (p: Partial<ImagemSlot>, final: boolean) => {
    const fn = (d: typeof doc) => ({ ...d, frames: d.frames.map((x, j) => (j === i ? { ...x, imagens: { slot1: { ...(x.imagens.slot1 ?? img), ...p } } } : x)) })
    if (final) api.set(fn, null)
    else api.preview(fn)
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute bottom-[60px] left-1/2 flex w-[min(640px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2.5 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-3.5 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.25)]">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {CAMPOS.filter(([k]) => fluxo || (k !== "larguraSlot" && k !== "alturaSlot")).map(([k, l, mn, mx, u]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between">
              <CtLabel className="mb-0 text-[9.5px]">{l}</CtLabel>
              <span className="text-[9.5px] font-semibold text-[var(--ops-title)]" style={TNUM}>
                {img[k]}
                {u}
              </span>
            </div>
            <input type="range" min={mn} max={mx} value={img[k]} onChange={(e) => patch({ [k]: +e.target.value }, false)} onPointerUp={(e) => patch({ [k]: +(e.target as HTMLInputElement).value }, true)} onKeyUp={(e) => patch({ [k]: +(e.target as HTMLInputElement).value }, true)} className="w-full accent-[var(--ops-accent)]" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => fileRef.current?.click()} className="h-[30px] rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
          Trocar imagem
        </button>
        <button type="button" onClick={() => patch({ zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 }, true)} className="h-[30px] rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
          Resetar enquadramento
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            api.set((d) => ({ ...d, frames: d.frames.map((x, j) => (j === i ? { ...x, imagens: {} } : x)) }), `Imagem removida · ${frame.label}`)
            api.setImgSel(null)
          }}
          className="h-[30px] rounded-lg border border-[var(--ops-neg)]/40 px-[11px] text-[11.5px] font-medium text-[var(--ops-neg)] hover:bg-[var(--ops-hover)]"
        >
          Remover
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) {
            const url = await arquivoParaDataUrl(f)
            api.set((d) => ({ ...d, frames: d.frames.map((x, j) => (j === i ? { ...x, imagens: { slot1: { ...img, url, zoom: 100, x: 0, y: 0 } } } : x)) }), `Imagem trocada · ${frame.label}`)
          }
          e.target.value = ""
        }}
      />
    </div>
  )
}
