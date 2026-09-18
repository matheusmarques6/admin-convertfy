"use client"

/**
 * O histórico de versões publicadas — o item do menu do split-button.
 *
 * Só LISTA. Restaurar uma versão antiga exigiria reescrever
 * `crm_form_fields` a partir do schema dela (a tabela viva é quem manda
 * na ordem e nos ids), e uma restauração que não fizesse isso deixaria
 * o editor e o ar discordando. Fica declarado: é leitura.
 */

import useSWR from "swr"
import { X } from "lucide-react"

interface Versao {
  id: string
  version: number
  published_at: string
  publicada: boolean
  perguntas: number
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`)
  return body as { versoes: Versao[] }
}

export function HistoricoDeVersoes({
  formId,
  aberto,
  onFechar,
}: {
  formId: string
  aberto: boolean
  onFechar: () => void
}) {
  const { data, error, isLoading } = useSWR(aberto ? `/api/crm/forms/${formId}/versions` : null, fetcher)
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Histórico de versões"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-[14px] border border-black/[0.08] bg-white shadow-[0_28px_70px_rgba(0,0,0,0.35)] dark:border-white/[0.10] dark:bg-[#1A1D27]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
          <div>
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Histórico de versões</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Cada publicação vira uma versão imutável — quem estava respondendo continua na dele.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:text-white/55 dark:hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {isLoading && <p className="px-2 py-4 text-[12px] text-slate-500">Carregando…</p>}
          {error && <p className="px-2 py-4 text-[12px] text-red-600">{(error as Error).message}</p>}
          {data && data.versoes.length === 0 && (
            <p className="px-2 py-4 text-[12px] text-slate-500 dark:text-white/50">
              Nenhuma versão publicada ainda.
            </p>
          )}
          {data?.versoes.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-[8px] px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <span className="w-10 shrink-0 font-mono text-[12px] font-semibold text-slate-900 dark:text-white">
                v{v.version}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-slate-600 dark:text-white/65">
                {new Date(v.published_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                <span className="mx-1.5 text-slate-300">·</span>
                {v.perguntas} {v.perguntas === 1 ? "pergunta" : "perguntas"}
              </span>
              {v.publicada && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-px text-[10px] font-medium text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                  no ar
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
