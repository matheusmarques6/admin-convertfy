"use client"

/**
 * Input ou textarea com o menu de recall do handoff §4: digitar `@` abre
 * a lista das perguntas anteriores (e dos campos ocultos) e escolher uma
 * insere `{{chave}} `.
 *
 * A régua (o que entra na lista, como o gatilho é detectado, o que é
 * inserido) mora em `lib/forms/recall-menu.ts`; aqui é só teclado,
 * cursor e desenho.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Variable } from "lucide-react"
import { TipoIcone } from "@/components/forms/tipo-icone"
import type { FormBlockType } from "@/types/forms-conversational"
import { filtrarRecall, gatilhoDeRecall, inserirRecall, type OpcaoDeRecall } from "@/lib/forms/recall-menu"

export function CampoComRecall({
  value,
  onChange,
  opcoes,
  multiline,
  rows = 2,
  placeholder,
  className,
  ariaLabel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  opcoes: OpcaoDeRecall[]
  multiline?: boolean
  rows?: number
  placeholder?: string
  className?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [gatilho, setGatilho] = useState<{ inicio: number; busca: string } | null>(null)
  const [ativo, setAtivo] = useState(0)
  const [cursorPendente, setCursorPendente] = useState<number | null>(null)

  const lista = useMemo(() => (gatilho ? filtrarRecall(opcoes, gatilho.busca) : []), [gatilho, opcoes])
  const aberto = gatilho !== null && lista.length > 0

  useEffect(() => {
    setAtivo(0)
  }, [gatilho?.busca])

  // O cursor só pode ser posto DEPOIS que o React escreveu o valor novo.
  useEffect(() => {
    if (cursorPendente === null || !ref.current) return
    ref.current.setSelectionRange(cursorPendente, cursorPendente)
    setCursorPendente(null)
  }, [cursorPendente, value])

  const atualizarGatilho = (el: HTMLInputElement | HTMLTextAreaElement) => {
    setGatilho(gatilhoDeRecall(el.value, el.selectionStart ?? el.value.length))
  }

  const escolher = (o: OpcaoDeRecall) => {
    const el = ref.current
    const cursor = el?.selectionStart ?? value.length
    const r = inserirRecall(value, cursor, o.chave)
    onChange(r.texto)
    setCursorPendente(r.cursor)
    setGatilho(null)
    el?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!aberto) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setAtivo((a) => (a + 1) % lista.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setAtivo((a) => (a - 1 + lista.length) % lista.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      escolher(lista[ativo] ?? lista[0])
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      setGatilho(null)
    }
  }

  const comum = {
    value,
    placeholder,
    disabled,
    "aria-label": ariaLabel,
    className,
    onKeyDown,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value)
      atualizarGatilho(e.target)
    },
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => atualizarGatilho(e.currentTarget),
    onBlur: () => window.setTimeout(() => setGatilho(null), 120),
  }

  return (
    <div className="relative">
      {multiline ? (
        <textarea ref={(el) => void (ref.current = el)} rows={rows} {...comum} />
      ) : (
        <input ref={(el) => void (ref.current = el)} type="text" {...comum} />
      )}
      {aberto && (
        <div
          role="listbox"
          aria-label="Puxar resposta anterior"
          className="absolute left-0 top-full z-30 mt-1 w-[280px] max-h-[240px] overflow-y-auto rounded-[8px] border border-black/[0.10] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:border-white/[0.12] dark:bg-[#1A1D27]"
        >
          {lista.map((o, i) => (
            <button
              key={`${o.origem}:${o.chave}`}
              type="button"
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(o)}
              className={
                "flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left " +
                (i === ativo ? "bg-slate-100 dark:bg-white/[0.08]" : "")
              }
            >
              {o.origem === "pergunta" && o.tipo ? (
                <TipoIcone tipo={o.tipo as FormBlockType} tamanho={20} />
              ) : (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-white/60">
                  <Variable className="h-3 w-3" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-800 dark:text-white/85">{o.rotulo}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-white/40">{`{{${o.chave}}}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
