"use client"

/**
 * O seletor de tipos — o popover de 560px do handoff.
 *
 * Substitui o "+ Pergunta" que criava um campo de texto e deixava a
 * troca de tipo para um `<select>` no inspetor: quem quer uma escala
 * 0–10 pensava "escala" antes de pensar "pergunta", e o caminho antigo
 * exigia criar a coisa errada para depois corrigi-la.
 *
 * A lista vem de `tiposDisponiveis(modo)`: o formato decide o que se
 * oferece, e a busca é sem acento. Também serve para MUDAR o tipo de
 * uma pergunta existente (cabeçalho do inspetor) — o mesmo componente
 * com outro título, para a pessoa não aprender dois seletores.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { tiposDisponiveis } from "@/lib/forms/tipos-de-pergunta"
import type { FormBlockType } from "@/types/forms-conversational"
import { TipoIcone } from "./tipo-icone"

export function SeletorDeTipos({
  modo,
  onEscolher,
  titulo = "Adicionar pergunta",
  children,
  align = "start",
}: {
  modo: "classic" | "conversational"
  onEscolher: (tipo: FormBlockType) => void
  titulo?: string
  /** O gatilho. */
  children: ReactNode
  align?: "start" | "end" | "center"
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const grupos = tiposDisponiveis(modo, busca)

  useEffect(() => {
    if (aberto) {
      setBusca("")
      // O foco no `open` do Radix chega antes de o input existir.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
  }, [aberto])

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-[560px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[12px] border-black/[0.08] bg-white p-0 shadow-[0_18px_48px_rgba(0,0,0,0.22)] dark:border-white/[0.10] dark:bg-[#1A1D27]"
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false)
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-black/[0.08] px-3 py-2.5 dark:border-white/[0.08]">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" aria-hidden />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`${titulo} — buscar tipo…`}
            aria-label={`${titulo}: buscar tipo`}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-white/40"
            onKeyDown={(e) => {
              // Enter escolhe o primeiro resultado — quem digitou "esc"
              // e apertou Enter quer a Escala, não fechar o popover.
              if (e.key === "Enter") {
                const primeiro = grupos[0]?.tipos[0]
                if (primeiro) {
                  e.preventDefault()
                  onEscolher(primeiro.tipo)
                  setAberto(false)
                }
              }
            }}
          />
          <kbd className="rounded-[4px] border border-black/[0.10] px-1.5 py-px text-[10px] text-slate-400 dark:border-white/[0.14] dark:text-white/40">
            esc
          </kbd>
        </div>
        <div className="grid max-h-[380px] grid-cols-1 gap-x-[18px] gap-y-3 overflow-y-auto px-3 pb-3 pt-2.5 sm:grid-cols-2">
          {grupos.length === 0 && (
            <p className="col-span-full px-1.5 py-6 text-center text-[12px] text-slate-500 dark:text-white/50">
              Nenhum tipo com &ldquo;{busca}&rdquo;.
            </p>
          )}
          {grupos.map(({ grupo, tipos }) => (
            <div key={grupo.id}>
              <div className="mb-1 px-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-slate-400 dark:text-white/40">
                {grupo.nome}
              </div>
              {tipos.map((t) => (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => {
                    onEscolher(t.tipo)
                    setAberto(false)
                  }}
                  className="flex h-[34px] w-full items-center gap-2.5 rounded-[7px] px-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                >
                  <TipoIcone tipo={t.tipo} tamanho={24} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-900 dark:text-white">
                    {t.nome}
                  </span>
                  {t.crm && (
                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-white/40">→ CRM</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
