"use client"

/**
 * Modais do editor: Prévia do Instagram, Exportar (PNG/JPG, ZIP, legenda,
 * compliance com trecho destacado e correção), Enviar para o calendário e
 * Brand Kit. Todos theme-aware (tokens --ops-*); só o conteúdo dos slides
 * carrega a identidade própria.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Bookmark, Calendar, Check, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { FONTE_APOIO, FONTE_TITULO, brandKitPadrao, gradienteCss } from "@/lib/conteudo/brand"
import { avaliarCompliance, corrigirLegendaLocal, LIMITE_LEGENDA, localizarTrecho } from "@/lib/conteudo/compliance"
import { uploadImagem } from "@/lib/conteudo/data"
import { contarPalavras, dataCurta, MAX_FRAMES_API } from "@/lib/conteudo/documento"
import { baixarBlob, renderFrameParaBlob, slug, zipar, type FormatoExport } from "@/lib/conteudo/export/render"
import { chamarIA } from "@/lib/conteudo/ia/client"
import type { BrandKit, Documento, Perfil, PerfilEditavel } from "@/lib/conteudo/types"
import { CtAvatar, CtBtn, CtLabel, CtSeg, TNUM, inputCls, selectCls, textareaCls } from "../ui"
import type { EditorApi } from "./editor-types"
import { Frame, FRAME_W, alturaFrame } from "./frame"
import { Thumb, ThumbFit } from "./thumb"

function Overlay({ children, onClose, escuro }: { children: React.ReactNode; onClose: () => void; escuro?: boolean }) {
  return (
    <div onClick={onClose} className={cn("fixed inset-0 z-[95] flex items-center justify-center p-4", escuro ? "bg-[rgba(9,10,14,0.82)]" : "bg-[rgba(9,10,14,0.5)]")} role="dialog" aria-modal="true">
      {children}
    </div>
  )
}

// ── Prévia ──────────────────────────────────────────────────────────────

export function PreviewModal({ doc, perfil, onClose, onExportar, onAgendar }: { doc: Documento; perfil?: Perfil; onClose: () => void; onExportar: () => void; onAgendar: () => void }) {
  const visiveis = doc.frames.map((f, i) => ({ f, i })).filter((x) => !x.f.oculto)
  const [k, setK] = useState(0)
  const n = visiveis.length
  const W = 380
  const H = (W * alturaFrame(doc)) / FRAME_W
  const bk = doc.brandKit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setK((x) => Math.min(n - 1, x + 1))
      if (e.key === "ArrowLeft") setK((x) => Math.max(0, x - 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [n])
  const ix = visiveis[k]?.i ?? 0
  return (
    <Overlay onClose={onClose} escuro>
      <div className="flex flex-col items-center gap-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10.5px] font-bold tracking-[0.16em] text-white/60">PRÉVIA · COMO FICA NO INSTAGRAM</div>
        <div className="overflow-hidden rounded-xl bg-white text-[#111] shadow-[0_30px_80px_rgba(0,0,0,0.5)]" style={{ width: W }}>
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <CtAvatar perfil={perfil} size={32} src={bk.avatar} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{(bk.brandName || perfil?.handle || "perfil").replace("@", "")}</span>
              <span className="block text-[11px] text-[#737373]">{bk.brandName2}</span>
            </span>
            <span className="text-[16px]">⋯</span>
          </div>
          <div className="relative overflow-hidden bg-black" style={{ width: W, height: H }}>
            <Frame doc={doc} ix={ix} scale={W / FRAME_W} />
            <span className="absolute right-2.5 top-2.5 rounded-xl bg-black/60 px-[9px] py-[3px] text-[11px] font-semibold text-white" style={TNUM}>
              {k + 1}/{n}
            </span>
            {k > 0 && (
              <button type="button" aria-label="Anterior" onClick={() => setK(k - 1)} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#111]">
                <Icon icon={ChevronLeft} customSize={14} />
              </button>
            )}
            {k < n - 1 && (
              <button type="button" aria-label="Próximo" onClick={() => setK(k + 1)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#111]">
                <Icon icon={ChevronRight} customSize={14} />
              </button>
            )}
          </div>
          <div className="px-3 pb-3 pt-2.5">
            <div className="flex items-center gap-3.5 text-[#111]">
              <Icon icon={Heart} customSize={22} />
              <Icon icon={MessageCircle} customSize={22} />
              <Icon icon={Send} customSize={22} />
              <span className="flex flex-1 justify-center gap-1">
                {visiveis.map((_, i) => (
                  <span key={i} className="rounded-full" style={{ width: i === k ? 6 : 5, height: i === k ? 6 : 5, background: i === k ? "#3797F0" : "#C7C7C7" }} />
                ))}
              </span>
              <Icon icon={Bookmark} customSize={22} />
            </div>
            <div className="mt-2.5 text-[11px] text-[#737373]" style={TNUM}>
              {n} slides · {doc.proporcaoExport}
            </div>
            <div className="mt-1 text-[13px] leading-[1.45]">
              <strong className="font-semibold">{(bk.brandName || perfil?.handle || "perfil").replace("@", "")}</strong> {(doc.legenda || "Sem legenda ainda. Escreva na tela Exportar.").slice(0, 120)}
              <span className="text-[#737373]">… mais</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onAgendar} className="h-9 rounded-[9px] bg-white px-4 text-[12.5px] font-semibold text-[#111]">
            Enviar para o calendário
          </button>
          <button type="button" onClick={onExportar} className="h-9 rounded-[9px] border border-white/30 px-4 text-[12.5px] font-semibold text-white">
            Exportar PNGs
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/30 text-white">
            <Icon icon={X} customSize={14} />
          </button>
        </div>
        <div className="text-[10.5px] text-white/50">A publicação é feita pelo app do Instagram. Carrosséis acima de {MAX_FRAMES_API} slides não podem ser publicados por API.</div>
      </div>
    </Overlay>
  )
}

// ── Exportar ────────────────────────────────────────────────────────────

/** Renderiza os frames a 1080 fora da tela; a exportação serializa este DOM. */
function FramesOcultos({ doc, prefixo }: { doc: Documento; prefixo: string }) {
  return (
    <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: FRAME_W, pointerEvents: "none", opacity: 0 }}>
      {doc.frames.map((f, i) => (!f.oculto ? <Frame key={f.frameId} doc={doc} ix={i} scale={1} domId={`${prefixo}-${f.frameId}`} /> : null))}
    </div>
  )
}

export function ExportModal({ api, onClose, onAgendar }: { api: EditorApi; onClose: () => void; onAgendar: () => void }) {
  const { doc } = api
  const [fmt, setFmt] = useState<FormatoExport>("png")
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [corrigindo, setCorrigindo] = useState(false)
  // useId é estável entre servidor e cliente (Date.now() divergia na
  // hidratação e o getElementById não achava o frame oculto).
  const prefixo = `exp${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const visiveis = doc.frames.map((f, i) => ({ f, i })).filter((x) => !x.f.oculto)
  const largura = FRAME_W
  const altura = alturaFrame(doc)
  const legenda = doc.legenda
  const palavras = contarPalavras(legenda)
  const compliance = useMemo(() => avaliarCompliance(legenda), [legenda])
  const ext = fmt

  const nomeArquivo = (i: number, tipo: string) => `${String(i + 1).padStart(2, "0")}-${tipo}.${ext}`

  const renderIdx = async (idx: number): Promise<Blob> => {
    const el = document.getElementById(`${prefixo}-${doc.frames[idx].frameId}`)
    if (!el) throw new Error("Frame não renderizado")
    return renderFrameParaBlob(el, largura, altura, fmt)
  }

  const baixarUm = async (idx: number, pos: number) => {
    setErro(null)
    setProgresso(`Gerando ${pos + 1}…`)
    try {
      baixarBlob(await renderIdx(idx), `${slug(doc.nome)}-${nomeArquivo(pos, doc.frames[idx].tipo)}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao exportar")
    } finally {
      setProgresso(null)
    }
  }

  const baixarTodos = async () => {
    setErro(null)
    try {
      const arquivos: Array<{ nome: string; blob: Blob }> = []
      for (let k = 0; k < visiveis.length; k++) {
        setProgresso(`Gerando ${k + 1} de ${visiveis.length}…`)
        arquivos.push({ nome: nomeArquivo(k, visiveis[k].f.tipo), blob: await renderIdx(visiveis[k].i) })
      }
      setProgresso("Compactando…")
      baixarBlob(await zipar(arquivos, legenda), `${slug(doc.nome)}-${doc.proporcaoExport.replace(":", "x")}.zip`)
      api.avisar(`${visiveis.length} frames exportados em ${ext.toUpperCase()}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao exportar")
    } finally {
      setProgresso(null)
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(legenda)
      api.avisar("Legenda copiada")
    } catch {
      setErro("Não foi possível copiar a legenda")
    }
  }

  const corrigir = async () => {
    const problemas = compliance.filter((r) => !r.ok)
    if (!problemas.length) return
    const soLocal = problemas.every((r) => r.corrigivel)
    if (soLocal) {
      api.set({ legenda: corrigirLegendaLocal(legenda) }, "Legenda corrigida (compliance)")
      api.avisar("Legenda corrigida")
      return
    }
    setCorrigindo(true)
    try {
      const r = await chamarIA({ acao: "corrigir_legenda", legenda, problemas: problemas.map((p) => p.label) })
      api.set({ legenda: r.legenda }, "Legenda corrigida pela ConvertIA")
      api.avisar("Legenda corrigida")
    } catch (e) {
      api.set({ legenda: corrigirLegendaLocal(legenda) }, "Legenda corrigida (modo local)")
      api.avisar(e instanceof Error ? `${e.message} Corrigi o que dava localmente.` : "Corrigi o que dava localmente.")
    } finally {
      setCorrigindo(false)
    }
  }

  const destacar = (trecho: string | null) => {
    const pos = localizarTrecho(legenda, trecho)
    if (!pos) return
    const ta = document.getElementById(`${prefixo}-legenda`) as HTMLTextAreaElement | null
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(pos[0], pos[1])
  }

  return (
    <Overlay onClose={onClose}>
      <FramesOcultos doc={doc} prefixo={prefixo} />
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-[1040px] max-w-full flex-col overflow-hidden rounded-[14px] border border-[var(--ops-border)] bg-[var(--ops-card)] shadow-[0_24px_64px_rgba(0,0,0,0.35)] lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2.5 px-[22px] pb-3 pt-[18px]">
            <div>
              <div className="text-[16px] font-semibold text-[var(--ops-title)]">Exportar</div>
              <div className="mt-0.5 text-[11.5px] text-[var(--ops-sec)]">
                {visiveis.length} frames em {doc.proporcaoExport === "9:16" ? "1080 × 1920" : "1080 × 1350"}. Passe o mouse para baixar um frame.
              </div>
            </div>
            <span className="flex-1" />
            <CtSeg<FormatoExport>
              val={fmt}
              onChange={setFmt}
              opts={[
                ["png", "PNG"],
                ["jpg", "JPG"],
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visiveis.map(({ f, i }, k) => (
                <div key={f.frameId} className="group relative overflow-hidden rounded-lg border border-[var(--ops-border)]">
                  <div className={cn("relative", doc.proporcaoExport === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]")}>
                    <div className="absolute inset-0">
                      <ThumbFit doc={doc} ix={i} />
                    </div>
                  </div>
                  <button type="button" onClick={() => void baixarUm(i, k)} disabled={Boolean(progresso)} className="absolute bottom-2 right-2 h-[26px] rounded-md bg-white/95 px-2.5 text-[10.5px] font-semibold text-[#041366] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 disabled:opacity-40">
                    Baixar {ext.toUpperCase()}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2.5 text-[10.5px] text-[var(--ops-mut)]">{fmt === "png" ? "O Instagram exige JPEG na publicação por API. Exporte em JPG se for agendar por integração." : "JPEG é o formato aceito pela API do Instagram."}</div>
            {erro && <div className="mt-2 text-[11.5px] text-[var(--ops-neg)]">{erro}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ops-border)] px-[22px] py-3">
            <button type="button" onClick={() => void baixarTodos()} disabled={Boolean(progresso)} className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[var(--ops-accent)] px-4 text-[12.5px] font-semibold text-[var(--ops-on-accent)] disabled:opacity-60">
              {progresso && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {progresso ?? "Baixar todos (ZIP)"}
            </button>
            <CtBtn onClick={() => void copiar()}>Copiar legenda</CtBtn>
            <CtBtn icon={Calendar} onClick={onAgendar}>
              Enviar para o calendário
            </CtBtn>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="text-[12.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
              Fechar
            </button>
          </div>
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-t border-[var(--ops-border)] bg-[var(--ops-page)] px-5 py-[18px] lg:w-[360px] lg:border-l lg:border-t-0">
          <div>
            <div className="flex items-baseline justify-between">
              <CtLabel>Legenda</CtLabel>
              <span className={cn("text-[10.5px] font-semibold", palavras >= 150 && palavras <= 180 ? "text-[var(--ops-pos)]" : "text-[var(--ops-warn)]")} style={TNUM}>
                {palavras} palavras · {legenda.length}/{LIMITE_LEGENDA.toLocaleString("pt-BR")}
              </span>
            </div>
            <textarea id={`${prefixo}-legenda`} value={legenda} onChange={(e) => api.set({ legenda: e.target.value })} rows={11} placeholder="Escreva ou gere a legenda. Alvo: 150 a 180 palavras." className={cn(textareaCls, "bg-[var(--ops-card)]")} />
          </div>
          <div>
            <CtLabel>Palavra-chave do comment gate</CtLabel>
            <input value={doc.palavraChave} onChange={(e) => api.set({ palavraChave: e.target.value.toUpperCase() })} placeholder="Ex.: 8%" className={cn(inputCls, "bg-[var(--ops-card)] font-semibold")} />
          </div>
          <div>
            <CtLabel>Compliance do Instagram</CtLabel>
            <div className="overflow-hidden rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
              {compliance.map((r, i) => (
                <div key={r.id} className={cn("px-2.5 py-2", i > 0 && "border-t border-[var(--ops-border)]", !r.ok && "bg-[var(--ops-neg)]/5")}>
                  <div className="flex items-center gap-2 text-[11.5px] text-[var(--ops-title)]">
                    <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full", r.ok ? "bg-[var(--ops-pos)]/15 text-[var(--ops-pos)]" : "bg-[var(--ops-neg)]/15 text-[var(--ops-neg)]")}>
                      <Icon icon={r.ok ? Check : X} customSize={9} />
                    </span>
                    {r.label}
                  </div>
                  {!r.ok && (
                    <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ops-sec)]">
                      Trecho:
                      <button type="button" onClick={() => destacar(r.trecho)} title="Destacar na legenda" className="rounded bg-[var(--ops-track)] px-[5px] py-px font-mono text-[var(--ops-neg)] hover:underline">
                        {r.trecho ?? "(ausente no texto)"}
                      </button>
                      <button type="button" onClick={() => void corrigir()} disabled={corrigindo} className="font-semibold text-[var(--ops-accent)] hover:underline disabled:opacity-60">
                        {corrigindo ? "Corrigindo…" : "Corrigir com IA"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </Overlay>
  )
}

// ── Agendar ─────────────────────────────────────────────────────────────

function isoAmanha(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export interface AgendarEntrada {
  perfil: PerfilEditavel
  /** YYYY-MM-DD */
  dataIso: string
  hora: string
}

export function AgendarModal({ doc, perfis, onClose, onConfirmar }: { doc: Documento; perfis: Perfil[]; onClose: () => void; onConfirmar: (q: AgendarEntrada) => Promise<void> }) {
  const [perfil, setPerfil] = useState<PerfilEditavel>(perfis.some((p) => p.id === doc.perfil) ? doc.perfil : perfis[0]?.id ?? "")
  const [data, setData] = useState(doc.agenda?.dataIso ?? isoAmanha())
  const [hora, setHora] = useState(doc.agenda?.hora ?? "11:30")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const n = doc.frames.filter((f) => !f.oculto).length
  const confirmar = async () => {
    if (!data || !hora) return
    setSalvando(true)
    setErro(null)
    try {
      await onConfirmar({ perfil, dataIso: data, hora })
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível agendar")
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-[420px] max-w-full flex-col gap-3 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-[22px] py-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
        <div>
          <div className="text-[15px] font-semibold text-[var(--ops-title)]">Enviar para o calendário</div>
          <div className="mt-0.5 text-[11.5px] text-[var(--ops-sec)]">Cria o item no Calendário e marca o carrossel como Agendado.</div>
        </div>
        <div className="flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
          <div className="h-[45px] w-9 shrink-0 overflow-hidden rounded-[5px]">
            <Thumb doc={doc} ix={0} w={36} />
          </div>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-[var(--ops-title)]">{doc.nome}</span>
            <span className="mt-0.5 block text-[10.5px] text-[var(--ops-mut)]">
              {n} slides · {doc.proporcaoExport}
              {n > MAX_FRAMES_API ? " · publicação manual (acima de 10)" : " · pode ir por API"}
            </span>
          </span>
        </div>
        <div>
          <CtLabel>Perfil</CtLabel>
          {perfis.length === 0 ? (
            <div className="text-[11.5px] text-[var(--ops-mut)]">Nenhum canal Instagram conectado — o item entra no calendário sem perfil.</div>
          ) : (
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className={cn(selectCls, "h-9")}>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.handle ? ` · ${p.handle}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <CtLabel>Data</CtLabel>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={cn(inputCls, "h-9")} />
          </div>
          <div>
            <CtLabel>Horário</CtLabel>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={cn(inputCls, "h-9")} />
          </div>
        </div>
        <div className="text-[10.5px] leading-relaxed text-[var(--ops-mut)]">A publicação em si é feita no app do Instagram; o calendário organiza a cadência e marca o status do carrossel.</div>
        {erro && <div className="text-[11.5px] text-[var(--ops-neg)]">{erro}</div>}
        <div className="mt-1 flex justify-end gap-2">
          <CtBtn onClick={onClose}>Cancelar</CtBtn>
          <CtBtn kind="primary" icon={Calendar} onClick={() => void confirmar()} disabled={salvando || !data || !hora}>
            {salvando ? "Agendando…" : "Agendar"}
          </CtBtn>
        </div>
      </div>
    </Overlay>
  )
}

// ── Brand Kit ───────────────────────────────────────────────────────────

export function BrandKitModal({ api, onSalvarBrandKit, onClose }: { api: EditorApi; onSalvarBrandKit: (perfil: PerfilEditavel, kit: BrandKit) => Promise<void>; onClose: () => void }) {
  const { doc } = api
  const perfis = api.perfis
  const temPerfil = perfis.some((p) => p.id === doc.perfil)
  const [perfil, setPerfil] = useState<PerfilEditavel>(temPerfil ? doc.perfil : perfis[0]?.id ?? doc.perfil)
  const [kits, setKits] = useState<Record<PerfilEditavel, BrandKit>>(() => {
    const base: Record<string, BrandKit> = {}
    for (const p of perfis) base[p.id] = api.brandKits?.[p.id] ?? brandKitPadrao(p)
    base[doc.perfil] = doc.brandKit
    return base
  })
  const [erro, setErro] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const perfilObj = perfis.find((p) => p.id === perfil)
  const bk = kits[perfil] ?? doc.brandKit
  const setBk = (p: Partial<BrandKit>) => {
    const novo = { ...bk, ...p }
    setKits((k) => ({ ...k, [perfil]: novo }))
    if (perfis.some((x) => x.id === perfil)) {
      onSalvarBrandKit(perfil, novo).catch((e: Error) => setErro(e.message))
    } else {
      // documento sem canal: o kit vive só no documento
      api.set({ brandKit: novo })
    }
  }
  const inp = (v: string, on: (s: string) => void, aria: string) => <input value={v} aria-label={aria} onChange={(e) => on(e.target.value)} className={cn(inputCls, "h-[34px] text-[12.5px]")} />
  const sw = (c: string) => <span className="inline-block h-7 w-7 shrink-0 rounded-lg border border-[var(--ops-border)]" style={{ background: c }} />
  const previa = [0, 2, 6].map((i) => Math.min(i, doc.frames.length - 1))
  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[86vh] w-[860px] max-w-full flex-col overflow-hidden rounded-[14px] border border-[var(--ops-border)] bg-[var(--ops-card)] shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ops-border)] px-[22px] pb-3 pt-[18px]">
          <div>
            <div className="text-[16px] font-semibold text-[var(--ops-title)]">Brand Kit</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--ops-sec)]">Tudo que os templates consomem. Mudar aqui muda em todos os carrosséis do perfil.</div>
          </div>
          <span className="flex-1" />
          {perfis.length > 0 && perfis.length <= 3 ? (
            <CtSeg<PerfilEditavel> val={perfil} onChange={setPerfil} opts={perfis.map((p): [string, string] => [p.id, p.nome])} />
          ) : perfis.length > 3 ? (
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className={cn(selectCls, "h-8 w-auto")} aria-label="Perfil">
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-[var(--ops-mut)]">Sem canal conectado · kit deste documento</span>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)]">
            <Icon icon={X} customSize={14} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[22px] overflow-y-auto px-[22px] pb-[22px] pt-[18px] md:grid-cols-2">
          <div className="flex flex-col gap-3.5">
            <div>
              <CtLabel>Identidade</CtLabel>
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--ops-border)] p-3">
                <CtAvatar perfil={perfilObj} size={48} src={bk.avatar} />
                <div className="flex flex-1 flex-col gap-2">
                  {inp(bk.brandName, (v) => setBk({ brandName: v }), "Handle")}
                  {inp(bk.brandName2, (v) => setBk({ brandName2: v }), "Nome")}
                </div>
                <div className="flex flex-col gap-1.5">
                  <CtBtn size="sm" onClick={() => fileRef.current?.click()}>
                    Trocar foto
                  </CtBtn>
                  {bk.avatar && (
                    <CtBtn size="sm" kind="ghost" onClick={() => setBk({ avatar: null })}>
                      Remover
                    </CtBtn>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <CtLabel>Copyright</CtLabel>
                {inp(bk.copyright, (v) => setBk({ copyright: v }), "Copyright")}
              </div>
              <div>
                <CtLabel>Selo verificado</CtLabel>
                <label className="flex h-[34px] cursor-pointer items-center gap-2 text-[12.5px] text-[var(--ops-title)]">
                  <input type="checkbox" checked={bk.verificado} onChange={(e) => setBk({ verificado: e.target.checked })} className="m-0 accent-[var(--ops-accent)]" /> Mostrar nos slides
                </label>
              </div>
            </div>
            <div>
              <CtLabel>Tipografia dos slides</CtLabel>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    ["Títulos", "Barlow Condensed 800 · caixa alta", FONTE_TITULO, 800, true, false],
                    ["Apoios", "Georgia itálica", FONTE_APOIO, 400, false, true],
                    ["Metadados", "Inter 600", "'Inter Slides', Inter, sans-serif", 600, false, false],
                  ] as Array<[string, string, string, number, boolean, boolean]>
                ).map(([l, d, ff, fw, up, it]) => (
                  <div key={l} className="flex items-center gap-3 rounded-[9px] border border-[var(--ops-border)] px-3 py-[9px]">
                    <span className="w-[100px] text-[20px] text-[var(--ops-title)]" style={{ fontFamily: ff, fontWeight: fw, textTransform: up ? "uppercase" : "none", fontStyle: it ? "italic" : "normal" }}>
                      Aa Bb
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-[var(--ops-title)]">{l}</span>
                      <span className="block text-[10.5px] text-[var(--ops-mut)]">{d}</span>
                    </span>
                    <span className="text-[10.5px] text-[var(--ops-mut)]">fixo no template</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <CtLabel>Cores nomeadas</CtLabel>
              <div className="flex flex-col gap-1.5">
                {Object.entries(doc.cores).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2.5">
                    {sw(v)}
                    <span className="w-[90px] text-[12px] font-medium text-[var(--ops-title)]">{k}</span>
                    <input value={v} aria-label={`Cor ${k}`} onChange={(e) => api.set({ cores: { ...doc.cores, [k]: e.target.value } })} className={cn(inputCls, "h-[30px] flex-1 font-mono text-[11.5px]")} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <CtLabel>Gradiente da marca</CtLabel>
              <div className="h-11 rounded-[9px] border border-[var(--ops-border)]" style={{ background: gradienteCss(doc.gradiente) }} />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["de", "Início"],
                    ["meio", "Meio"],
                    ["ate", "Fim"],
                  ] as Array<["de" | "meio" | "ate", string]>
                ).map(([k, l]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    {sw(doc.gradiente[k])}
                    <input value={doc.gradiente[k]} aria-label={`Gradiente ${l}`} onChange={(e) => api.set({ gradiente: { ...doc.gradiente, [k]: e.target.value } })} className={cn(inputCls, "h-[30px] min-w-0 flex-1 font-mono text-[11.5px]")} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <CtLabel>Prévia</CtLabel>
              <div className="flex gap-2">
                {previa.map((i, k) => (
                  <div key={k} className="w-24 overflow-hidden rounded-[7px]">
                    <Thumb doc={{ ...doc, brandKit: perfil === doc.perfil ? bk : doc.brandKit }} ix={i} w={96} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--ops-border)] px-[22px] py-3">
          <span className="text-[10.5px] text-[var(--ops-mut)]">{erro ? <span className="text-[var(--ops-neg)]">{erro}</span> : "Alterações valem para novos carrosséis e para este documento."}</span>
          <span className="flex-1" />
          <CtBtn kind="primary" onClick={onClose}>
            Concluir
          </CtBtn>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (!f) return
            try {
              const { url } = await uploadImagem(f, "avatar")
              setBk({ avatar: url })
            } catch (err) {
              setErro(err instanceof Error ? err.message : "Falha no upload")
            }
          }}
        />
      </div>
    </Overlay>
  )
}

export { dataCurta }
