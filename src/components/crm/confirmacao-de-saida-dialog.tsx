"use client"

/**
 * Pergunta que a coluna faz antes de deixar o card sair.
 *
 * Hoje só "O Luan liberou este lead?". A resposta é TEXTO e vira nota
 * na timeline: um sim/não perderia justamente o que interessa depois
 * ("liberou por áudio em 20/09, disse que já tinha desistido").
 */

import { useEffect, useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"

export interface ConfirmacaoPendente {
  dealId: string
  stageId: string
  position: number
  codigo: string
  pergunta: string
}

export function ConfirmacaoDeSaidaDialog({
  pendente,
  onConfirm,
  onCancel,
}: {
  pendente: ConfirmacaoPendente | null
  onConfirm: (resposta: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [resposta, setResposta] = useState("")
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Abrir com o texto da vez anterior faria o operador confirmar a
  // resposta de outro lead sem ler.
  useEffect(() => {
    if (pendente) {
      setResposta("")
      setSalvando(false)
    }
  }, [pendente])

  if (!pendente) return null

  const podeConfirmar = resposta.trim().length > 0 && !salvando

  async function confirmar() {
    if (!podeConfirmar) return
    setSalvando(true)
    await onConfirm(resposta.trim())
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[6px] p-5"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-gray-200)",
          }}
        >
          <Dialog.Title
            className="mb-1"
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--crm-gray-900)",
            }}
          >
            {pendente.pergunta}
          </Dialog.Title>
          <Dialog.Description
            className="mb-3"
            style={{ fontSize: 12.5, color: "var(--crm-gray-500)" }}
          >
            A resposta fica registrada na timeline do negócio.
          </Dialog.Description>

          <input
            ref={inputRef}
            autoFocus
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void confirmar()
              }
            }}
            placeholder="Ex.: sim, liberou por áudio em 20/09"
            className="w-full rounded-[6px] px-3 py-2"
            style={{
              border: "1px solid var(--crm-gray-200)",
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              fontSize: 13,
            }}
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-[6px] px-3 py-1.5"
              style={{
                border: "1px solid var(--crm-gray-200)",
                background: "var(--crm-gray-0)",
                color: "var(--crm-gray-600)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!podeConfirmar}
              onClick={() => void confirmar()}
              className={`rounded-[6px] px-3 py-1.5 ${podeConfirmar ? "cursor-pointer" : "cursor-not-allowed"}`}
              style={{
                border: "1px solid var(--crm-gray-900)",
                background: podeConfirmar ? "var(--crm-gray-900)" : "var(--crm-gray-200)",
                color: podeConfirmar ? "var(--crm-gray-0)" : "var(--crm-gray-400)",
                borderColor: podeConfirmar ? "var(--crm-gray-900)" : "var(--crm-gray-200)",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {salvando ? "Movendo…" : "Confirmar e mover"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
