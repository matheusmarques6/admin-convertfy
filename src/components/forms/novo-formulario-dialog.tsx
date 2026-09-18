"use client"

/**
 * "Novo formulário" — nome com o endereço ao vivo, o FORMATO (uma
 * pergunta por tela × página única) com um mini-preview de cada, os
 * modelos de partida e onde os leads entram.
 *
 * O modal cria o formulário JÁ com os campos e o rascunho do modelo
 * (`montarModelo`) e abre o editor na primeira tela. O antigo pedia nome,
 * slug e pipeline e criava três campos fixos; quem queria um diagnóstico
 * montava as sete telas à mão.
 */

import { useEffect, useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import useSWR from "swr"
import { Check, X } from "lucide-react"
import { MODELOS, montarModelo, type ModeloId } from "@/lib/forms/modelos"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
  stages: Array<{ id: string; name: string; stage_type: string | null; order?: number; position?: number }>
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (formId: string) => void
  scope?: "sales" | "cs" | "either"
}

export function slugDoNome(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

type Modo = "conversational" | "classic"

const MODOS: Array<{ v: Modo; titulo: string; descricao: string }> = [
  {
    v: "conversational",
    titulo: "Conversacional",
    descricao: "Uma pergunta por tela, com progresso e lógica. Converte mais em tráfego pago.",
  },
  {
    v: "classic",
    titulo: "Página única",
    descricao: "Todos os campos de uma vez. Melhor para embed em landing page ou site.",
  },
]

export function NovoFormularioDialog({ open, onClose, onCreated, scope = "sales" }: Props) {
  const pipelineScope = scope === "either" ? "cs" : scope
  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    open ? `/api/crm/pipelines?scope=${pipelineScope}` : null,
    fetcher,
  )
  const pipelines = useMemo(() => pipelinesData?.pipelines ?? [], [pipelinesData])

  const [nome, setNome] = useState("")
  const [modo, setModo] = useState<Modo>("conversational")
  const [modelo, setModelo] = useState<ModeloId>("diag")
  const [pipelineId, setPipelineId] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setNome("")
      setModo("conversational")
      setModelo("diag")
      setPipelineId("")
      setErro(null)
    }
  }, [open])

  // Primeira pipeline vem marcada: "sem destino" é o estado que a lista
  // avisa em âmbar, e chegar nele por omissão é o erro mais comum.
  useEffect(() => {
    if (!pipelineId && pipelines[0]) setPipelineId(pipelines[0].id)
  }, [pipelines, pipelineId])

  const slug = slugDoNome(nome) || "novo-formulario"
  const primeiraEtapa = (p: PipelineLite | undefined) =>
    p?.stages
      .filter((s) => (s.stage_type || "open") === "open")
      .sort((a, b) => (a.order ?? a.position ?? 0) - (b.order ?? b.position ?? 0))[0]

  const criar = async () => {
    if (!nome.trim()) return
    setEnviando(true)
    setErro(null)
    try {
      const montado = montarModelo(modelo, modo)
      const pipe = pipelines.find((p) => p.id === pipelineId)
      const res = await fetch("/api/crm/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome.trim(),
          slug,
          scope,
          display_mode: modo,
          pipeline_id: pipelineId || null,
          stage_id: primeiraEtapa(pipe)?.id ?? null,
          fields: montado.campos.map((c, i) => ({ ...c, position: i })),
          draft_schema: montado.draft_schema,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErro(json.error?.message || "Não deu para criar o formulário.")
        return
      }
      onCreated(json.id)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(9,10,14,0.5)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95"
          style={{
            background: "var(--crm-gray-0)",
            borderColor: "var(--crm-border)",
            boxShadow: "0 28px 70px rgba(0,0,0,0.35)",
            fontFamily: "var(--crm-font-sans)",
            maxHeight: "calc(100dvh - 32px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-5">
            <div>
              <DialogPrimitive.Title
                className="m-0 text-[17px] font-semibold tracking-[-0.01em]"
                style={{ color: "var(--crm-gray-900)" }}
              >
                Novo formulário
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-[3px] text-[12px]" style={{ color: "var(--crm-gray-500)" }}>
                Você pode mudar tudo isso depois.
              </DialogPrimitive.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="cf-focusable rounded-[6px] p-1"
              style={{ color: "var(--crm-gray-400)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto">
            <div className="px-6 pt-[18px]">
              <Rotulo>Nome</Rotulo>
              <input
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nome.trim() && !enviando) void criar()
                }}
                placeholder="Ex.: Diagnóstico gratuito"
                className="crm-input w-full"
                style={{ height: 34, borderRadius: 8, fontSize: 12.5 }}
              />
              <div className="mt-[6px] text-[11px]" style={{ color: "var(--crm-gray-400)", fontFamily: "var(--crm-font-mono)" }}>
                app.convertfy.me/forms/<span style={{ color: "var(--crm-gray-700)" }}>{slug}</span>
              </div>
            </div>

            <div className="px-6 pt-[14px]">
              <Rotulo>Formato</Rotulo>
              <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                {MODOS.map((m) => {
                  const on = modo === m.v
                  return (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setModo(m.v)}
                      aria-pressed={on}
                      className="cf-focusable overflow-hidden rounded-[10px] p-0 text-left"
                      style={{
                        border: `1.5px solid ${on ? "var(--crm-brand)" : "var(--crm-border)"}`,
                        background: on ? "var(--crm-blue-50)" : "transparent",
                      }}
                    >
                      <div className="h-[78px] border-b" style={{ background: "#0B0F1A", borderColor: "var(--crm-border)" }}>
                        <MiniPreview modo={m.v} />
                      </div>
                      <div className="px-3 pb-3 pt-[10px]">
                        <div className="flex items-center gap-[6px] text-[12.5px] font-semibold" style={{ color: "var(--crm-gray-900)" }}>
                          {m.titulo}
                          {on && <Check className="h-[13px] w-[13px]" style={{ color: "var(--crm-brand)" }} />}
                        </div>
                        <div className="mt-[3px] text-[11px] leading-[1.45]" style={{ color: "var(--crm-gray-500)" }}>
                          {m.descricao}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-6 pt-[14px]">
              <Rotulo>
                Começar de <span className="font-normal" style={{ color: "var(--crm-gray-400)" }}>modelos prontos</span>
              </Rotulo>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODELOS.map((t) => {
                  const on = modelo === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setModelo(t.id)}
                      aria-pressed={on}
                      className="cf-focusable flex flex-col gap-[5px] rounded-[10px] px-[11px] py-[10px] text-left"
                      style={{
                        border: `1.5px solid ${on ? "var(--crm-brand)" : "var(--crm-border)"}`,
                        background: on ? "var(--crm-blue-50)" : "transparent",
                      }}
                    >
                      <div className="flex items-center gap-[6px]">
                        <span className="h-2 w-2 rounded-[2px]" style={{ background: t.cor }} aria-hidden />
                        <span className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--crm-gray-400)" }}>
                          {t.tag}
                        </span>
                        {on && <Check className="ml-auto h-3 w-3" style={{ color: "var(--crm-brand)" }} />}
                      </div>
                      <div className="text-[12.5px] font-semibold" style={{ color: "var(--crm-gray-900)" }}>
                        {t.titulo}
                      </div>
                      <div className="text-[11px] leading-[1.4]" style={{ color: "var(--crm-gray-500)" }}>
                        {t.descricao}
                      </div>
                      <div className="crm-tnum text-[10.5px]" style={{ color: "var(--crm-gray-400)" }}>
                        {t.telas} {t.telas === 1 ? "tela" : "telas"}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-6 pt-[14px]">
              <Rotulo>Leads entram em</Rotulo>
              <select
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                className="crm-input w-full"
                style={{ height: 34, borderRadius: 8, fontSize: 12.5 }}
              >
                <option value="">Sem destino — só cria o lead</option>
                {pipelines.map((p) => {
                  const etapa = primeiraEtapa(p)
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {etapa ? ` → ${etapa.name}` : ""}
                    </option>
                  )
                })}
              </select>
              {!pipelineId && (
                <div className="mt-[6px] text-[11.5px]" style={{ color: "var(--crm-warn)" }}>
                  Sem pipeline, os envios viram leads soltos — ninguém é avisado.
                </div>
              )}
              {erro && (
                <div className="mt-2 text-[12px]" style={{ color: "var(--crm-neg)" }}>
                  {erro}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-5">
            <button type="button" onClick={onClose} className="crm-button-ghost" style={{ height: 32, padding: "0 13px", borderRadius: 8 }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={criar}
              disabled={enviando || !nome.trim()}
              className="crm-button-primary"
              style={{ height: 32, padding: "0 13px", borderRadius: 8 }}
            >
              {enviando ? "Criando…" : "Criar e abrir editor"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[11.5px] font-semibold" style={{ color: "var(--crm-gray-700)" }}>
      {children}
    </div>
  )
}

/** O esboço escuro de cada formato — barras, não texto. */
function MiniPreview({ modo }: { modo: Modo }) {
  if (modo === "conversational") {
    return (
      <div className="flex h-full flex-col justify-center gap-[6px] p-[10px]" aria-hidden>
        <div className="h-[6px] w-[70%] rounded-[3px]" style={{ background: "rgba(255,255,255,0.85)" }} />
        <div className="h-1 w-[45%] rounded-[3px]" style={{ background: "rgba(255,255,255,0.4)" }} />
        <div className="mt-[6px] h-[9px] w-[80%] rounded-[3px]" style={{ border: "1px solid rgba(255,255,255,0.35)" }} />
        <div className="mt-[2px] h-[9px] w-[26px] rounded-[3px]" style={{ background: "var(--crm-brand)" }} />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col gap-[5px] p-[10px]" aria-hidden>
      {[70, 90, 90, 90].map((w, i) => (
        <div
          key={i}
          className="rounded-[3px]"
          style={{
            height: i === 0 ? 6 : 8,
            width: `${w}%`,
            background: i === 0 ? "rgba(255,255,255,0.85)" : "transparent",
            border: i === 0 ? "none" : "1px solid rgba(255,255,255,0.35)",
          }}
        />
      ))}
      <div className="h-[9px] w-[90%] rounded-[3px]" style={{ background: "var(--crm-brand)" }} />
    </div>
  )
}
