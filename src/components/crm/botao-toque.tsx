"use client"

/**
 * Botão "Enviar T1/T2/T3" da prospecção ativa.
 *
 * A janela do WhatsApp é aberta VAZIA no próprio clique e só recebe a
 * URL depois da resposta do servidor: `window.open` chamado após um
 * `await` é bloqueado pelo navegador como popup. O caminho inverso —
 * abrir já com o link e registrar depois — mandaria mensagem pra quem
 * pediu pra não ser contatado quando a recusa viesse do servidor.
 *
 * Recusado, a janela em branco é FECHADA: deixá-la aberta faz parecer
 * que a mensagem saiu.
 */

import { useState } from "react"
import { MessageSquare, Loader2 } from "lucide-react"
import { proximoToque, rotuloDoBotao, type Toque } from "@/lib/crm/cadencia"
import {
  EXPLICACAO_DO_BLOQUEIO,
  motivoDeBloqueio,
  sinaisDoNegocio,
} from "@/lib/crm/prospeccao"

export interface RespostaDoToque {
  url: string
  texto: string
  toque: Toque
  tentativas: number
  etapa: string | null
  moveu: boolean
  tarefa_em: string | null
  avisos: string[]
}

interface BotaoToqueProps {
  dealId: string
  custom_fields?: Record<string, unknown> | null
  tags?: string[] | null
  stageName?: string | null
  telefone?: string | null
  /** `deals.status`: ganho/perdido saíram da cadência. */
  status?: string | null
  /** Variante compacta pro card; a cheia vive no drawer. */
  compacto?: boolean
  onFeito?: (r: RespostaDoToque) => void
  onErro?: (msg: string) => void
}

export function BotaoToque({
  dealId,
  custom_fields,
  tags,
  stageName,
  telefone,
  status,
  compacto = false,
  onFeito,
  onErro,
}: BotaoToqueProps) {
  const [enviando, setEnviando] = useState(false)

  const sinais = sinaisDoNegocio(custom_fields)
  const toque = proximoToque(sinais.tentativas)
  const bloqueio = motivoDeBloqueio({ etapa: stageName, tags, telefone, status })

  // Cadência concluída não é erro: é o fim do roteiro. O botão fica
  // desabilitado dizendo isso, em vez de sumir — sumir esconderia que
  // os três toques já saíram.
  const motivo = bloqueio
    ? EXPLICACAO_DO_BLOQUEIO[bloqueio]
    : toque == null
      ? "Os três toques já saíram. O job de SLA decide o próximo passo."
      : null

  const desabilitado = motivo != null || enviando

  async function enviar(e: React.MouseEvent) {
    e.stopPropagation()
    if (desabilitado || !toque) return

    // Precisa ser AQUI, dentro do gesto do usuário.
    const janela = window.open("", "_blank", "noopener,noreferrer")
    setEnviando(true)
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/toque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toque }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        janela?.close()
        const msg =
          typeof json?.error === "string"
            ? json.error
            : (json?.error?.message as string) ||
              "Não foi possível montar o toque."
        onErro?.(msg)
        return
      }
      // `successResponse` espalha no topo — não existe `json.data`.
      const dados = json as RespostaDoToque
      if (janela) janela.location.href = dados.url
      else window.open(dados.url, "_blank", "noopener,noreferrer")
      onFeito?.(dados)
    } catch {
      janela?.close()
      onErro?.("A rede falhou. Nada foi enviado nem registrado.")
    } finally {
      setEnviando(false)
    }
  }

  if (compacto) {
    return (
      <button
        type="button"
        disabled={desabilitado}
        onClick={enviar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation()
        }}
        title={motivo ?? `${rotuloDoBotao(toque)} no WhatsApp`}
        aria-label={motivo ?? `${rotuloDoBotao(toque)} no WhatsApp`}
        className={`flex h-[26px] items-center gap-1 rounded-[6px] px-1.5 ${desabilitado ? "cursor-not-allowed" : "cursor-pointer"}`}
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-gray-200)",
          color: desabilitado ? "var(--crm-gray-300)" : "#25D366",
          fontSize: 10.5,
          fontWeight: 600,
        }}
      >
        {enviando ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <MessageSquare className="h-3 w-3" />
        )}
        {toque ?? "—"}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={enviar}
      title={motivo ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 ${desabilitado ? "cursor-not-allowed" : "cursor-pointer"}`}
      style={{
        background: desabilitado ? "var(--crm-gray-50)" : "#25D366",
        border: `1px solid ${desabilitado ? "var(--crm-gray-200)" : "#1DA851"}`,
        color: desabilitado ? "var(--crm-gray-400)" : "#FFFFFF",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {enviando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MessageSquare className="h-3.5 w-3.5" />
      )}
      {rotuloDoBotao(toque)}
    </button>
  )
}
