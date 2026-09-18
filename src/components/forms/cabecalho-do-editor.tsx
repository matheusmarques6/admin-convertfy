"use client"

/**
 * O topo do editor, no desenho do handoff (§3): volta · nome e endereço ·
 * abas ao centro · ✓ do autosave · selo de versão · Prévia · o
 * split-button "Publicar vN".
 *
 * Existe como componente próprio para o `page.tsx` (3,9 mil linhas)
 * não crescer, e porque a régua do que cada peça mostra é pura
 * (`lib/forms/autosave`): o selo "rascunho pendente" acende no primeiro
 * caractere digitado, não no save — o save agora é automático, e o
 * operador precisa de um sinal que distinga "salvo" de "no ar".
 */

import { useEffect, useState, type ComponentType } from "react"
import Link from "next/link"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  History,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { seloDeVersao, textoDoSave, type EstadoDoSave } from "@/lib/forms/autosave"

export interface AbaDoEditor<K extends string> {
  key: K
  label: string
  icon: ComponentType<{ className?: string }>
  /** Ponto vermelho: problemas nesta aba. */
  alerta?: number
}

export function CabecalhoDoEditor<K extends string>({
  voltarHref,
  name,
  onName,
  slug,
  modoRotulo,
  abas,
  abaAtiva,
  onAba,
  save,
  status,
  versao,
  rascunhoPendente,
  publicando,
  onPrevia,
  onPublicar,
  onAbrirNoAr,
  onCopiarLink,
  onHistorico,
  onDuplicar,
  onTirarDoAr,
  onSalvarAgora,
  publicUrl,
}: {
  voltarHref: string
  name: string
  onName: (v: string) => void
  slug: string
  modoRotulo: string
  abas: Array<AbaDoEditor<K>>
  abaAtiva: K
  onAba: (k: K) => void
  save: EstadoDoSave
  status: "draft" | "published" | "archived"
  versao: number
  rascunhoPendente: boolean
  publicando: boolean
  onPrevia: () => void
  onPublicar: () => void
  onAbrirNoAr: () => void
  onCopiarLink: () => void
  onHistorico: () => void
  onDuplicar: () => void
  onTirarDoAr: () => void
  onSalvarAgora: () => void
  publicUrl: string
}) {
  const selo = seloDeVersao({ status, versao, rascunhoPendente })
  // "Salvo há 40 s" precisa andar sem ninguém digitar.
  const [, tick] = useState(0)
  useEffect(() => {
    if (save.tipo !== "salvo") return
    const t = window.setInterval(() => tick((n) => n + 1), 10_000)
    return () => window.clearInterval(t)
  }, [save])
  const textoSave = textoDoSave(save)
  const noAr = status === "published"
  const pendente = rascunhoPendente || !noAr

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white px-3 dark:border-white/[0.08] dark:bg-[#0F1117]">
      <Link
        href={voltarHref}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Formulários</span>
      </Link>
      <div className="hidden h-5 w-px bg-black/[0.08] dark:bg-white/[0.10] sm:block" />

      <div className="w-[190px] min-w-0 shrink">
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Nome do formulário"
          aria-label="Nome do formulário"
          className="w-full truncate rounded-[6px] border-0 bg-transparent px-1.5 py-0.5 text-[14px] font-semibold leading-tight text-slate-900 outline-none hover:bg-slate-100 focus:bg-slate-100 focus:ring-0 dark:text-white dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
        />
        <p className="truncate px-1.5 font-mono text-[10.5px] text-slate-500 dark:text-white/45">
          /forms/{slug || "…"} · {modoRotulo}
        </p>
      </div>

      <nav
        className="mx-auto hidden items-center gap-0.5 rounded-[8px] bg-slate-100 p-0.5 md:flex dark:bg-white/[0.05]"
        aria-label="Seções do editor"
      >
        {abas.map((t) => {
          const ativa = abaAtiva === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onAba(t.key)}
              aria-current={ativa ? "page" : undefined}
              className={
                "relative inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors " +
                (ativa
                  ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.07)] dark:bg-[#1A1D27] dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.alerta ? (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500"
                  aria-label={`${t.alerta} problemas`}
                />
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
        <span
          title={textoSave}
          aria-live="polite"
          className={
            "inline-flex h-7 w-7 items-center justify-center rounded-full " +
            (save.tipo === "erro"
              ? "text-red-600 dark:text-red-400"
              : save.tipo === "salvando"
                ? "text-slate-400 dark:text-white/40"
                : save.tipo === "pendente"
                  ? "text-amber-500"
                  : "text-emerald-600 dark:text-emerald-400")
          }
        >
          {save.tipo === "salvando" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : save.tipo === "erro" ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          )}
          <span className="sr-only">{textoSave}</span>
        </span>

        <span
          className={
            "hidden h-6 items-center rounded-full border px-2 text-[11px] font-medium sm:inline-flex " +
            (selo.tom === "ar"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
              : selo.tom === "pendente"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                : "border-black/[0.08] bg-slate-50 text-slate-600 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/60")
          }
        >
          {selo.texto}
        </span>

        <button
          type="button"
          onClick={onPrevia}
          title="Ver como o lead vê"
          className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-black/[0.10] px-2 text-[11.5px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prévia</span>
        </button>

        <div className="inline-flex">
          <button
            type="button"
            onClick={pendente ? onPublicar : onAbrirNoAr}
            disabled={publicando}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded-l-[7px] px-2.5 text-[11.5px] font-semibold transition-colors disabled:opacity-60 " +
              (pendente
                ? "bg-[#4E62D8] text-white hover:bg-[#2137B6]"
                : "border border-r-0 border-black/[0.10] text-slate-700 hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]")
            }
          >
            {publicando && <Loader2 className="h-3 w-3 animate-spin" />}
            {pendente ? `Publicar v${versao + 1}` : "No ar"}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Mais ações"
                className={
                  "inline-flex h-7 w-6 items-center justify-center rounded-r-[7px] transition-colors " +
                  (pendente
                    ? "border-l border-white/20 bg-[#4E62D8] text-white hover:bg-[#2137B6]"
                    : "border border-black/[0.10] text-slate-600 hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/70 dark:hover:bg-white/[0.06]")
                }
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[220px] rounded-[8px] border border-black/[0.08] bg-white p-1 shadow-[0_14px_36px_rgba(0,0,0,0.18)] dark:border-white/[0.10] dark:bg-[#1A1D27]"
              >
                <Item icone={ExternalLink} onSelect={onAbrirNoAr} disabled={!noAr}>
                  Abrir no ar ↗
                </Item>
                <Item icone={Copy} onSelect={onCopiarLink}>
                  Copiar link
                </Item>
                <Item icone={History} onSelect={onHistorico}>
                  Histórico de versões
                </Item>
                <Item icone={Copy} onSelect={onDuplicar}>
                  Duplicar formulário
                </Item>
                <Item icone={Check} onSelect={onSalvarAgora}>
                  Salvar agora <kbd className="ml-auto text-[10px] text-slate-400">⌘S</kbd>
                </Item>
                {noAr && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
                    <Item icone={AlertTriangle} onSelect={onTirarDoAr} perigo>
                      Tirar do ar
                    </Item>
                  </>
                )}
                <p className="truncate px-2.5 pb-1 pt-1.5 font-mono text-[10px] text-slate-400 dark:text-white/35">
                  {publicUrl}
                </p>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}

function Item({
  icone: Icone,
  children,
  onSelect,
  disabled,
  perigo,
}: {
  icone: ComponentType<{ className?: string }>
  children: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  perigo?: boolean
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={
        "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-[6px] px-2.5 text-[12.5px] outline-none data-[disabled]:cursor-default data-[disabled]:opacity-40 " +
        (perigo
          ? "text-red-600 data-[highlighted]:bg-red-50 dark:text-red-400 dark:data-[highlighted]:bg-red-400/10"
          : "text-slate-800 data-[highlighted]:bg-slate-100 dark:text-white/85 dark:data-[highlighted]:bg-white/[0.06]")
      }
    >
      <Icone className="h-3.5 w-3.5 shrink-0 opacity-60" />
      {children}
    </DropdownMenu.Item>
  )
}
