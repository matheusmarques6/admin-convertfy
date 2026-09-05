"use client"

/**
 * Chat da ConvertIA dentro do editor: conversa com o carrossel aberto,
 * cola conteúdo, anexa inspirações e aplica propostas com um clique. A rota
 * `/api/conteudo/ia` responde com uma AÇÃO tipada; se a IA cair, o modo
 * local responde (e a bolha avisa).
 */

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Check, Image as ImageIcon, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { SLIDE } from "@/lib/conteudo/brand"
import { getSugestoesImagem, slotDeUrl } from "@/lib/conteudo/data"
import { aplicarPropostas, setTexto } from "@/lib/conteudo/documento"
import { chamarIA } from "@/lib/conteudo/ia/client"
import { chatLocal, estruturaLocal } from "@/lib/conteudo/ia/fallback"
import { resumoDocumento } from "@/lib/conteudo/ia/prompt"
import type { SaidaChat } from "@/lib/conteudo/ia/schemas"
import { arquivosParaDataUrls } from "@/lib/conteudo/imagens"
import { getTemplate } from "@/lib/conteudo/templates"
import type { PropostaSlide } from "@/lib/conteudo/types"
import { TNUM } from "../ui"
import type { EditorApi } from "./editor-types"

interface Msg {
  de: "eu" | "ia"
  t: string
  anexos?: string[]
  acao?: SaidaChat["acao"]
  props?: PropostaSlide[]
  opcoes?: string[]
  detalhes?: string[]
  legenda?: string
  palavraChave?: string
  estilo?: SaidaChat["estilo"]
  aplicado?: boolean
  local?: boolean
}

const INICIO: Msg = { de: "ia", t: "Estou com o carrossel aberto. Cole o conteúdo bruto, mande uma referência visual ou peça uma estrutura nova. Tudo que eu propor você aplica com um clique." }

const CHIPS: Array<[string, string]> = [
  ["Distribuir texto", "Distribui este texto nos slides:\n- "],
  ["Melhorar headline", "Melhora a headline da capa"],
  ["Gerar legenda", "Gera a legenda com comment gate"],
  ["Sugerir imagens", "Sugere imagens para os slots vazios"],
]

export function Chat({ api, anexosIniciais }: { api: EditorApi; anexosIniciais?: string[] }) {
  const { doc } = api
  const tpl = getTemplate(doc.templateId)
  const [msgs, setMsgs] = useState<Msg[]>([INICIO])
  const [txt, setTxt] = useState("")
  const [anexos, setAnexos] = useState<string[]>(anexosIniciais ?? [])
  const [pensando, setPensando] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight
  }, [msgs, pensando])

  // Referências do fluxo "100% com IA" chegam depois do primeiro render.
  useEffect(() => {
    if (anexosIniciais?.length) setAnexos((a) => (a.length ? a : anexosIniciais.slice(0, 4)))
  }, [anexosIniciais])

  const enviar = async (texto?: string) => {
    const t = (texto ?? txt).trim()
    if ((!t && !anexos.length) || pensando) return
    const ax = anexos
    const historico = msgs.slice(-8).map((m) => ({ de: m.de, t: m.t }))
    setMsgs((m) => [...m, { de: "eu", t, anexos: ax }])
    setTxt("")
    setAnexos([])
    setPensando(true)
    try {
      const r = await chamarIA({
        acao: "chat",
        resumo: resumoDocumento(doc),
        mensagem: t,
        anexos: ax.length ? ax : undefined,
        historico,
        frames: doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos })),
      })
      const validos = new Set(doc.frames.map((f) => f.frameId))
      const props = r.props?.filter((p) => validos.has(p.frameId)).map((p) => ({ ...p, label: doc.frames.find((f) => f.frameId === p.frameId)?.label ?? p.frameId }))
      setMsgs((m) => [...m, { de: "ia", t: r.texto, acao: r.acao?.tipo === "nenhuma" ? undefined : r.acao, props, opcoes: r.opcoes, detalhes: r.detalhes, legenda: r.legenda, palavraChave: r.palavraChave, estilo: r.estilo }])
    } catch (e) {
      const r = chatLocal(doc, t, ax.length)
      const props = r.props?.map((p) => ({ ...p, label: doc.frames.find((f) => f.frameId === p.frameId)?.label ?? p.frameId }))
      setMsgs((m) => [...m, { de: "ia", t: r.texto, acao: r.acao, props, opcoes: r.opcoes, detalhes: r.detalhes, legenda: r.legenda, palavraChave: r.palavraChave, estilo: r.estilo, local: true }])
      api.avisar(e instanceof Error ? e.message : "ConvertIA indisponível: modo local")
    } finally {
      setPensando(false)
    }
  }

  const aplicar = async (m: Msg, i: number) => {
    const a = m.acao
    if (!a) return
    const marcar = () => setMsgs((ms) => ms.map((x, j) => (j === i ? { ...x, aplicado: true } : x)))
    switch (a.tipo) {
      case "estrutura": {
        if (!m.props?.length) return
        api.set(() => aplicarPropostas(doc, m.props ?? [], `ConvertIA aplicou conteúdo em ${m.props?.length} slides`), null)
        api.setAtivo(doc.frames.findIndex((f) => f.frameId === m.props?.[0].frameId))
        break
      }
      case "estilo": {
        const tipos = new Set(m.estilo?.fundoEscuroTipos ?? ["texto"])
        api.set(
          (d) => ({
            ...d,
            fundoPorFrame: Object.fromEntries(d.frames.map((f) => [f.frameId, tipos.has(f.tipo) ? SLIDE.escuro : d.fundoPorFrame[f.frameId] ?? SLIDE.fundoClaro])),
            gradiente: { ...d.gradiente, angulo: m.estilo?.angulo ?? d.gradiente.angulo },
            estilos: m.estilo?.escalaTituloCapa
              ? { ...d.estilos, [d.frames[0].frameId]: { ...(d.estilos[d.frames[0].frameId] ?? {}), titulo: { ...(d.estilos[d.frames[0].frameId]?.titulo ?? {}), escala: m.estilo.escalaTituloCapa } } }
              : d.estilos,
          }),
          "ConvertIA aplicou direção visual da referência",
        )
        break
      }
      case "imagens":
        api.set((d) => ({ ...d, frames: d.frames.map((f) => (f.slotsImagem && !f.imagens.slot1 ? { ...f, imagens: { slot1: slotDeUrl(getSugestoesImagem(f.frameId)[0]) } } : f)) }), "ConvertIA preencheu os slots de imagem")
        break
      case "exportar":
        api.setModal("exportar")
        return
      case "legenda":
        if (!m.legenda) return
        api.set({ legenda: m.legenda, palavraChave: (m.palavraChave ?? doc.palavraChave).toUpperCase() }, "Legenda aplicada pela ConvertIA")
        break
      case "gerar": {
        setPensando(true)
        try {
          const r = await chamarIA({
            acao: "gerar_estrutura",
            nome: doc.nome,
            perfil: doc.perfil,
            pauta: msgs.filter((x) => x.de === "eu").map((x) => x.t).join("\n") || doc.nome,
            templateNome: tpl.nome,
            frames: doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos })),
            atuais: Object.fromEntries(doc.frames.map((f) => [f.frameId, f.textos])),
          })
          api.set((d) => ({ ...d, frames: d.frames.map((f) => ({ ...f, textos: { ...f.textos, ...(r.frames.find((y) => y.frameId === f.frameId)?.textos ?? {}) } })), legenda: r.legenda || d.legenda, palavraChave: r.palavraChave?.toUpperCase() || d.palavraChave }), "Estrutura gerada pela ConvertIA")
        } catch {
          const r = estruturaLocal(doc)
          api.set((d) => ({ ...d, frames: d.frames.map((f) => ({ ...f, textos: { ...f.textos, ...(r.frames.find((y) => y.frameId === f.frameId)?.textos ?? {}) } })) }), "Estrutura do modo local")
          api.avisar("ConvertIA indisponível: estrutura do modo local")
        } finally {
          setPensando(false)
        }
        break
      }
      case "headline":
        return // aplica-se clicando numa opção
      default:
        return
    }
    marcar()
  }

  const aplicarHeadline = (o: string) => {
    api.set((d) => ({ ...setTexto(d, d.frames[0].frameId, "titulo", o), nome: o }), "Headline aplicada pela ConvertIA")
    api.setAtivo(0)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={endRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3 pb-2 pt-3.5">
        {msgs.map((m, i) =>
          m.de === "eu" ? (
            <div key={i} className="flex max-w-[88%] flex-col items-end gap-1.5 self-end">
              {m.anexos && m.anexos.length > 0 && (
                <div className="flex gap-1.5">
                  {m.anexos.map((u, k) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={k} src={u} alt="" className="h-[55px] w-11 rounded-md object-cover" />
                  ))}
                </div>
              )}
              {m.t && <div className="whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-[var(--ops-accent)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ops-on-accent)]">{m.t}</div>}
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--ops-title)] text-[var(--ops-card)]">
                <Icon icon={Sparkles} customSize={11} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-[12px] leading-[1.55] text-[var(--ops-title)]">{m.t}</div>
                {m.local && <div className="text-[10px] text-[var(--ops-warn)]">Resposta do modo local (ConvertIA indisponível).</div>}
                {m.detalhes && (
                  <ul className="m-0 list-disc pl-4 text-[11.5px] leading-[1.6] text-[var(--ops-sec)]">
                    {m.detalhes.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
                {m.props && m.props.length > 0 && (
                  <div className="overflow-hidden rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
                    {m.props.map((p, k) => {
                      const ix = doc.frames.findIndex((f) => f.frameId === p.frameId)
                      return (
                        <button key={p.frameId} type="button" onClick={() => api.setAtivo(Math.max(0, ix))} className={cn("flex w-full gap-2 px-[9px] py-[7px] text-left hover:bg-[var(--ops-hover)]", k > 0 && "border-t border-[var(--ops-border)]")}>
                          <span className="w-4 pt-0.5 text-[10px] font-bold text-[var(--ops-mut)]" style={TNUM}>
                            {String(ix + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[11.5px] font-semibold leading-[1.35] text-[var(--ops-title)]">{p.titulo}</span>
                            {p.corpo && <span className="mt-px line-clamp-2 block text-[10.5px] leading-[1.4] text-[var(--ops-sec)]">{p.corpo}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {m.opcoes && (
                  <div className="flex flex-col gap-[5px]">
                    {m.opcoes.map((o) => (
                      <button key={o} type="button" onClick={() => aplicarHeadline(o)} className={cn("rounded-lg border px-2.5 py-[7px] text-left text-[11.5px] leading-[1.4] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]", doc.frames[0]?.textos.titulo === o ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")}>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {m.legenda && !m.aplicado && <div className="line-clamp-4 whitespace-pre-wrap rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ops-text)]">{m.legenda}</div>}
                {m.acao &&
                  m.acao.tipo !== "headline" &&
                  (m.aplicado ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ops-pos)]">
                      <Icon icon={Check} customSize={12} /> Aplicado nos slides
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => void aplicar(m, i)} className="h-[30px] rounded-lg bg-[var(--ops-accent)] px-3 text-[11.5px] font-semibold text-[var(--ops-on-accent)]">
                        {m.acao.label}
                      </button>
                      <button type="button" onClick={() => void enviar("Refaz com outro ângulo")} className="h-[30px] rounded-lg border border-[var(--ops-border)] px-2.5 text-[11.5px] font-medium text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
                        Refazer
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ),
        )}
        {pensando && (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--ops-title)] text-[var(--ops-card)]">
              <Icon icon={Sparkles} customSize={11} />
            </span>
            <span className="inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--ops-mut)]" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span className="text-[11px] text-[var(--ops-mut)]">lendo o carrossel</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-[var(--ops-border)] px-3 pb-3 pt-2">
        <div className="flex flex-wrap gap-[5px]">
          {CHIPS.map(([l, p]) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setTxt(p)
                areaRef.current?.focus()
              }}
              className="h-6 rounded-full border border-[var(--ops-border)] px-2 text-[10.5px] font-medium text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]"
            >
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-page)] px-2.5 pb-2 pt-2">
          {anexos.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5">
              {anexos.map((u, k) => (
                <span key={k} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="block h-[50px] w-10 rounded-md object-cover" />
                  <button type="button" aria-label="Remover anexo" onClick={() => setAnexos((a) => a.filter((_, j) => j !== k))} className="absolute -right-[5px] -top-[5px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ops-title)] text-[var(--ops-card)]">
                    <Icon icon={X} customSize={8} />
                  </button>
                </span>
              ))}
              <span className="self-center text-[10.5px] text-[var(--ops-mut)]">referência visual</span>
            </div>
          )}
          <textarea
            ref={areaRef}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void enviar()
              }
            }}
            rows={3}
            placeholder="Cole o conteúdo do carrossel, peça mudanças ou descreva a ideia. Shift+Enter quebra linha."
            className="w-full resize-none border-0 bg-transparent text-[12px] leading-relaxed text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)]"
          />
          <div className="mt-1 flex items-center gap-1">
            <button type="button" onClick={() => fileRef.current?.click()} title="Anexar imagem de inspiração" className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-[var(--ops-border)] px-2 text-[10.5px] font-medium text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
              <Icon icon={ImageIcon} customSize={12} /> Inspiração
            </button>
            <span className="ml-1 text-[10px] text-[var(--ops-mut)]">
              contexto: {tpl.nome} · {doc.frames.length} frames
            </span>
            <span className="flex-1" />
            <button type="button" onClick={() => void enviar()} disabled={(!txt.trim() && !anexos.length) || pensando} aria-label="Enviar" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ops-accent)] text-[var(--ops-on-accent)] disabled:opacity-40">
              <Icon icon={ArrowUp} customSize={12} />
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files
            if (files?.length) {
              const urls = await arquivosParaDataUrls(files, 800)
              setAnexos((a) => [...a, ...urls].slice(0, 4))
            }
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
