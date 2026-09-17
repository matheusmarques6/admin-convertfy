"use client"

/**
 * Dialogo de avanco de etapa.
 *
 * Existe por causa do incidente de 15/09/2026: avancar mandava WhatsApp ao
 * cliente e NADA na tela dizia isso — 16 mensagens sairam pra 5 clientes em
 * quatro minutos. Agora a mensagem aparece inteira antes de sair e so vai com
 * o interruptor ligado, que nasce DESLIGADO.
 *
 * O mesmo bloco serve ao avanco normal e ao forcado: sem isso, "forcar
 * avanco" viraria o caminho que nunca avisa o cliente e o time migraria pra
 * ele sem perceber.
 */

import { useState } from "react"
import useSWR from "swr"
import { Loader2, MessageSquare, Lock, ArrowRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"

export interface AdvancePreview {
  coluna_atual: string | null
  proxima_coluna: string | null
  conclui: boolean
  pode_avancar: boolean
  mensagem: {
    texto: string
    destinatario: string | null
    telefone: string | null
    pode_enviar: boolean
    bloqueio: string | null
    resolvem_no_avanco: Array<{ variavel: string; label: string }>
  } | null
}

const fetcher = async (url: string): Promise<AdvancePreview> => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? j.error ?? `HTTP ${r.status}`)
  // `successResponse` espalha o payload na raiz — nao ha envelope `data`.
  return j as AdvancePreview
}

/**
 * O bloco da mensagem, sozinho — reaproveitado pelo dialogo de forcar avanco.
 *
 * `onChange` so e chamado com `true` quando o envio e possivel: um switch
 * ligado que nao envia e pior que switch nenhum.
 */
export function MensagemAoCliente({
  preview,
  enviar,
  onChange,
  disabled,
}: {
  preview: AdvancePreview | undefined
  enviar: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  if (!preview) return null
  const msg = preview.mensagem
  if (!msg) {
    return (
      <div className="rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5">
        <p className="text-[12px] text-slate-600 dark:text-white/60">
          {preview.conclui
            ? "Avançar aqui conclui o onboarding. Nenhuma mensagem é enviada."
            : "Esta etapa não tem mensagem para o cliente."}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3 py-2.5 bg-slate-50 dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Enviar esta mensagem ao cliente
          </p>
          <p className="text-[11.5px] text-slate-500 dark:text-white/55 mt-0.5 truncate">
            {msg.destinatario ?? "Cliente"}
            {msg.telefone ? ` · ${msg.telefone}` : ""}
          </p>
        </div>
        <Switch
          checked={enviar && msg.pode_enviar}
          disabled={disabled || !msg.pode_enviar}
          onCheckedChange={(v) => onChange(v && msg.pode_enviar)}
          aria-label="Enviar esta mensagem ao cliente"
        />
      </div>

      <pre className="px-3 py-2.5 text-[12px] leading-[1.55] text-slate-700 dark:text-white/75 whitespace-pre-wrap font-sans max-h-52 overflow-y-auto">
        {msg.texto}
      </pre>

      {msg.bloqueio && (
        <p className="px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/[0.08] border-t border-amber-200/60 dark:border-amber-500/20 flex items-start gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{msg.bloqueio} O envio fica bloqueado até isso ser preenchido.</span>
        </p>
      )}

      {msg.resolvem_no_avanco.length > 0 && (
        <p className="px-3 py-2 text-[11.5px] text-slate-500 dark:text-white/55 border-t border-black/[0.06] dark:border-white/[0.06]">
          No lugar do marcador entra{" "}
          {msg.resolvem_no_avanco.map((r) => r.label).join(" e ")}, criado no
          próprio avanço — o cliente recebe a mensagem completa.
        </p>
      )}
    </div>
  )
}

export function AdvanceDialog({
  onboardingId,
  onClose,
  onConfirm,
  submitting,
}: {
  onboardingId: string
  onClose: () => void
  onConfirm: (sendWhatsApp: boolean) => void
  submitting?: boolean
}) {
  const [enviar, setEnviar] = useState(false)
  const { data, error, isLoading } = useSWR(
    `/api/onboardings/${onboardingId}/advance/preview`,
    fetcher,
    { revalidateOnFocus: false },
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[520px] rounded-[8px] bg-white dark:bg-[#12141C] border border-black/[0.08] dark:border-white/[0.08] shadow-xl">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            Avançar etapa
          </h3>
          {data && (
            <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5 flex items-center gap-1.5">
              {data.coluna_atual ?? "—"}
              <ArrowRight className="h-3 w-3" />
              {data.conclui
                ? "concluir onboarding"
                : (data.proxima_coluna ?? "—")}
            </p>
          )}
        </div>

        <div className="px-4 py-3.5 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-white/55 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando o que seria enviado…
            </div>
          )}

          {/* Falha no preview NAO libera o avanco calado: sem saber o que
              sairia, a unica escolha honesta e nao enviar. */}
          {error && (
            <p className="text-[12.5px] text-red-600 dark:text-red-400">
              Não deu para carregar a prévia da mensagem:{" "}
              {(error as Error).message}. Dá para avançar assim mesmo — nesse
              caso nada é enviado ao cliente.
            </p>
          )}

          {/* Onboarding cancelado/concluido: `advanceColumn` recusa com 409.
              Dizer isso antes vale mais que o erro depois do clique. */}
          {data && !data.pode_avancar && (
            <p className="text-[12.5px] text-amber-700 dark:text-amber-300">
              Este onboarding não está em progresso — o avanço vai ser
              recusado.
            </p>
          )}

          {data && (
            <MensagemAoCliente
              preview={data}
              enviar={enviar}
              onChange={setEnviar}
              disabled={submitting}
            />
          )}
        </div>

        <div className="px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 px-3 rounded-[6px] text-[12.5px] font-medium text-slate-600 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(enviar)}
            disabled={submitting || isLoading || data?.pode_avancar === false}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] text-[12.5px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black disabled:opacity-50 hover:opacity-90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {enviar ? "Avançar e enviar" : "Avançar sem avisar"}
          </button>
        </div>
      </div>
    </div>
  )
}
