"use client"

/**
 * As mensagens que cada etapa manda ao cliente, editáveis.
 *
 * Até 16/09/2026 esses textos só existiam no `SEED_COLUMNS` e o re-sync do
 * bootstrap os reescrevia a cada 5 minutos: ajustar uma vírgula exigia deploy.
 * Fica no kanban, ao lado de "Novo onboarding", porque é onde está quem avança
 * as etapas — e é ele quem descobre que a frase está errada.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2, MessageSquare, RotateCcw, X, AlertTriangle } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { render } from "@/lib/onboarding/preview-do-avanco"

interface ColunaTemplate {
  id: string
  nome: string
  slug: string
  posicao: number
  pipeline: string | null
  texto: string | null
  padrao: string | null
  tem_padrao: boolean
  fora_do_padrao: boolean
  editado_em: string | null
  editado_por: string | null
}

interface Resposta {
  pode_editar: boolean
  guarda_ativa: boolean
  variaveis: Array<{ chave: string; label: string }>
  colunas: ColunaTemplate[]
}

const fetcher = async (url: string): Promise<Resposta> => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? j.error ?? `HTTP ${r.status}`)
  return j as Resposta
}

/**
 * Valores de EXEMPLO para a prévia.
 *
 * São rotulados como exemplo de propósito: o editor confere a REDAÇÃO, e casar
 * o texto com um onboarding real exigiria escolher um — e o texto vale para
 * todos. O que a prévia garante é que a substituição é a mesma do envio,
 * porque usa a mesma função `render`.
 */
const EXEMPLO: Record<string, string> = {
  client_name: "João Silva",
  store_name: "Loja Exemplo",
  platform_name: "Omnisend",
  form_url: "https://admin.convertfy.com/f/exemplo",
  tutorial_link: "https://admin.convertfy.com/onboarding-help/exemplo",
  briefing_url: "https://admin.convertfy.com/b/exemplo",
  figma_link: "https://figma.com/file/exemplo",
  figma_full_link: "https://figma.com/file/exemplo-completo",
}

export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { data, error, isLoading, mutate } = useSWR(
    "/api/onboardings/columns",
    fetcher,
    { revalidateOnFocus: false },
  )
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState("")
  const [salvando, setSalvando] = useState(false)

  const aberta = data?.colunas.find((c) => c.id === abertaId) ?? null

  // Trocar de etapa descarta o rascunho da anterior de propósito: manter dois
  // textos em edição ao mesmo tempo é como se salva o da etapa errada.
  useEffect(() => {
    setRascunho(aberta?.texto ?? "")
  }, [abertaId, aberta?.texto])

  async function salvar(payload: {
    id: string
    texto?: string
    restaurar?: boolean
  }) {
    setSalvando(true)
    try {
      const res = await fetch("/api/onboardings/columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Não foi possível salvar",
          description: j.error?.message ?? j.error ?? "Tente novamente.",
        })
        return
      }
      toast.toast({
        title: payload.restaurar ? "Texto voltou ao padrão" : "Mensagem salva",
        description: j.aviso ?? undefined,
        variant: j.aviso ? "destructive" : undefined,
      })
      await mutate()
    } finally {
      setSalvando(false)
    }
  }

  const previa = aberta ? render(rascunho, EXEMPLO).texto : ""

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[860px] max-h-[88vh] flex flex-col rounded-[8px] bg-white dark:bg-[#12141C] border border-black/[0.08] dark:border-white/[0.08] shadow-xl">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Mensagens ao cliente
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
              O texto que cada etapa envia quando alguém liga o interruptor no
              avanço.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {data && !data.guarda_ativa && (
          <p className="px-4 py-2 text-[11.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/[0.08] border-b border-amber-200/60 dark:border-amber-500/20 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              A migration <code>20261159</code> ainda não foi aplicada. Dá para
              editar, mas o texto volta ao padrão em até 5 minutos.
            </span>
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500 py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando as etapas…
            </div>
          )}
          {error && (
            <p className="text-[12.5px] text-red-600 dark:text-red-400 py-3">
              Não deu para carregar: {(error as Error).message}
            </p>
          )}

          {data && (
            <ul className="space-y-1.5">
              {data.colunas.map((c) => {
                const estaAberta = c.id === abertaId
                return (
                  <li
                    key={c.id}
                    className="rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setAbertaId(estaAberta ? null : c.id)}
                      className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">
                          {c.posicao}. {c.nome}
                        </p>
                        {/* Com a etapa aberta o resumo repetiria o texto que
                            está no editor logo abaixo. */}
                        {!estaAberta && (
                          <p className="text-[11.5px] text-slate-500 dark:text-white/55 mt-0.5 line-clamp-1">
                            {c.texto
                              ? c.texto.replace(/\s+/g, " ")
                              : "Sem mensagem — avançar para esta etapa não avisa ninguém."}
                          </p>
                        )}
                      </div>
                      {c.fora_do_padrao && (
                        <span className="shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/[0.12] text-amber-700 dark:text-amber-300">
                          editada
                        </span>
                      )}
                    </button>

                    {estaAberta && (
                      <div className="px-3 pb-3 pt-1 border-t border-black/[0.06] dark:border-white/[0.06] space-y-2.5">
                        {c.fora_do_padrao && (
                          <p className="text-[11px] text-slate-500 dark:text-white/55">
                            Fora do padrão
                            {c.editado_por ? ` · ${c.editado_por}` : ""}
                            {c.editado_em
                              ? ` · ${new Date(c.editado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                          </p>
                        )}

                        <textarea
                          value={rascunho}
                          onChange={(e) => setRascunho(e.target.value)}
                          disabled={!data.pode_editar || salvando}
                          rows={7}
                          className="w-full px-3 py-2 text-[12.5px] leading-[1.5] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono disabled:opacity-60"
                        />

                        <div className="flex flex-wrap gap-1">
                          {data.variaveis.map((v) => (
                            <button
                              key={v.chave}
                              type="button"
                              disabled={!data.pode_editar}
                              onClick={() =>
                                setRascunho((t) => `${t}{{${v.chave}}}`)
                              }
                              title={v.label}
                              className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/65 hover:bg-slate-200 dark:hover:bg-white/[0.1] disabled:opacity-50"
                            >
                              {`{{${v.chave}}}`}
                            </button>
                          ))}
                        </div>

                        <div className="rounded-[6px] border border-black/[0.06] dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02]">
                          <p className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 border-b border-black/[0.04] dark:border-white/[0.06]">
                            Prévia com dados de exemplo
                          </p>
                          <pre className="px-2.5 py-2 text-[12px] leading-[1.5] whitespace-pre-wrap font-sans text-slate-700 dark:text-white/75 max-h-40 overflow-y-auto">
                            {previa || "—"}
                          </pre>
                        </div>

                        {data.pode_editar ? (
                          <div className="flex justify-between gap-2">
                            {c.tem_padrao && c.fora_do_padrao ? (
                              <button
                                type="button"
                                disabled={salvando}
                                onClick={() =>
                                  salvar({ id: c.id, restaurar: true })
                                }
                                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-[12px] font-medium text-slate-600 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Voltar ao padrão
                              </button>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              disabled={salvando || rascunho === (c.texto ?? "")}
                              onClick={() =>
                                salvar({ id: c.id, texto: rascunho })
                              }
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black disabled:opacity-50 hover:opacity-90"
                            >
                              {salvando && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              Salvar
                            </button>
                          </div>
                        ) : (
                          <p className="text-[11.5px] text-slate-500 dark:text-white/55">
                            Suas funções não permitem editar estes textos.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
