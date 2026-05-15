"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  GitBranch,
  HeartHandshake,
  MoreHorizontal,
  Trash2,
  Star as StarOff,
  ChevronRight,
  Star,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NewPipelineDialog } from "./new-pipeline-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  scope: string
  color: string | null
  layout: string | null
  is_archived: boolean
  is_default?: boolean
  stages: Array<{ id: string; name: string; position: number; stage_type: string | null }>
  deals_count: number
}

interface PipelinesNavSidebarProps {
  scope: "sales" | "cs"
}

/**
 * Sidebar de navegação entre pipelines do CRM (estilo DataCrazy).
 *
 * Lista todos os pipelines do scope (sales/cs) com badge de contagem
 * de deals abertos. Item ativo destacado pelo pathname atual.
 *
 * Inclui:
 *   - Header com titulo + botão "Novo pipeline" primário
 *   - Busca local com debounce visual (filtra na hora)
 *   - Lista com dot colorido (cor do pipeline) + nome + descrição
 *   - Active state: bg accent muito sutil + border-left forte
 *   - Skeleton enquanto carrega
 *   - Empty state quando não há pipelines
 */
export function PipelinesNavSidebar({
  scope,
}: PipelinesNavSidebarProps) {
  const pathname = usePathname()
  const [search, setSearch] = useState("")
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  const { data, isLoading, mutate } = useSWR<{ pipelines: PipelineSummary[] }>(
    `/api/crm/pipelines?scope=${scope}`,
    fetcher,
  )

  const pipelines = useMemo(() => data?.pipelines ?? [], [data?.pipelines])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pipelines
    return pipelines.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q),
    )
  }, [pipelines, search])

  // Identifica o pipeline ativo pelo pathname (.../pipelines/[id])
  const activeId = useMemo(() => {
    const m = pathname.match(/\/pipelines\/([^/?#]+)/)
    return m?.[1] ?? null
  }, [pathname])

  const Icon = scope === "cs" ? HeartHandshake : GitBranch
  const sectionLabel = scope === "cs" ? "Pipelines CS" : "Pipelines comerciais"

  return (
    <aside
      className={cn(
        "flex h-full flex-col shrink-0 overflow-hidden",
        "w-[280px] border-r border-black/[0.06] dark:border-white/[0.08]",
        "bg-white dark:bg-[#0F1117]",
      )}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-black/[0.04] dark:border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-slate-500 dark:text-white/55 shrink-0" />
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white/95 truncate flex-1">
            {sectionLabel}
          </h2>
          {pipelines.length > 0 && (
            <span className="text-[10px] font-medium text-slate-400 dark:text-white/40 tabular-nums">
              {pipelines.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setNewDialogOpen(true)}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 h-8 px-3 rounded-[6px]",
            "text-[12px] font-semibold text-white",
            scope === "cs"
              ? "bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] shadow-[0_1px_2px_rgba(5,150,105,0.25)]"
              : "bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] shadow-[0_1px_2px_rgba(37,99,235,0.25)]",
            "transition-colors",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo pipeline
        </button>
      </div>

      {/* ── Busca ── */}
      {pipelines.length > 3 && (
        <div className="relative px-4 pt-3 pb-2">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-white/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar pipeline..."
            aria-label="Buscar pipeline"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full h-8 rounded-[6px] pl-8 pr-7 text-[12px]",
              "bg-slate-50 dark:bg-white/[0.04]",
              "border border-black/[0.06] dark:border-white/[0.06]",
              "text-slate-900 dark:text-white/90",
              "placeholder:text-slate-400 dark:placeholder:text-white/30",
              "focus:outline-none focus:border-slate-300 dark:focus:border-white/20",
            )}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <PipelinesSkeleton />
        ) : filtered.length === 0 && pipelines.length === 0 ? (
          <PipelinesEmpty scope={scope} />
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-slate-400 dark:text-white/40">
            Nenhum pipeline corresponde a &ldquo;{search}&rdquo;.
          </div>
        ) : (
          <ul className="space-y-0.5" role="list">
            {filtered.map((p) => (
              <PipelineItem
                key={p.id}
                pipeline={p}
                href={pipelineHref(scope, p.id)}
                active={p.id === activeId}
                onChanged={() => mutate()}
              />
            ))}
          </ul>
        )}
      </div>

      <NewPipelineDialog
        open={newDialogOpen}
        scope={scope}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => {
          // Revalida lista pra mostrar o novo pipeline imediatamente.
          // O proprio dialog ja faz router.push pra abrir o board do
          // pipeline recem-criado.
          mutate()
        }}
      />
    </aside>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────

function PipelineItem({
  pipeline,
  href,
  active,
  onChanged,
}: {
  pipeline: PipelineSummary
  href: string
  active: boolean
  onChanged: () => void
}) {
  const dotColor = pipeline.color ?? "#475569"
  const router = useRouter()

  const handleDelete = async (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    const dealsCount = pipeline.deals_count ?? 0
    const aviso = dealsCount > 0
      ? `O pipeline "${pipeline.name}" tem ${dealsCount} deal(s). Excluir vai mover esses deals pra archived. Continuar?`
      : `Excluir o pipeline "${pipeline.name}"? Esta ação não pode ser desfeita.`
    if (!window.confirm(aviso)) return
    try {
      const res = await fetch(`/api/crm/pipelines/${pipeline.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        window.alert(`Falha ao excluir: ${body.error?.message ?? body.error ?? res.statusText}`)
        return
      }
      // Se estava ativo, redireciona pra home do scope
      if (active) router.push(href.replace(/\/[^/]+$/, ""))
      onChanged()
    } catch (err) {
      window.alert(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSetDefault = async (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await fetch(`/api/crm/pipelines/${pipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: !pipeline.is_default }),
      })
      if (res.ok) onChanged()
    } catch {
      /* noop */
    }
  }

  return (
    <li className="relative group">
      <Link
        href={href}
        className={cn(
          "relative flex items-start gap-2.5 rounded-[6px] px-2.5 py-2 transition-colors",
          active
            ? "bg-slate-100 dark:bg-white/[0.06]"
            : "hover:bg-slate-50 dark:hover:bg-white/[0.03]",
        )}
        aria-current={active ? "page" : undefined}
      >
        {/* Indicador lateral colorido quando ativo */}
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
            style={{ background: dotColor }}
          />
        )}

        {/* Dot colorido (cor do pipeline) */}
        <span
          aria-hidden
          className="mt-1 shrink-0 h-2 w-2 rounded-full"
          style={{ background: dotColor }}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[13px] leading-tight",
                active
                  ? "font-semibold text-slate-900 dark:text-white"
                  : "font-medium text-slate-800 dark:text-white/85",
              )}
            >
              {pipeline.name}
            </span>
            {pipeline.is_default && (
              <Star
                className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400"
                aria-label="Pipeline padrao"
              />
            )}
          </span>
          {pipeline.description && (
            <span
              className={cn(
                "block truncate text-[11px] leading-tight mt-0.5",
                active
                  ? "text-slate-600 dark:text-white/60"
                  : "text-slate-500 dark:text-white/45",
              )}
            >
              {pipeline.description}
            </span>
          )}
          {/* Stats compactas: deals_count + stages */}
          <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/40 tabular-nums">
            <span>
              {pipeline.deals_count} {pipeline.deals_count === 1 ? "deal" : "deals"}
            </span>
            {pipeline.stages.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{pipeline.stages.length} etapas</span>
              </>
            )}
          </span>
        </span>

        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 mt-1 transition-opacity",
            active
              ? "opacity-100 text-slate-700 dark:text-white/70"
              : "opacity-0 group-hover:opacity-60 text-slate-400 dark:text-white/40",
          )}
          aria-hidden
        />
      </Link>

      {/* Menu de ações (... aparece no hover) — posicionado absoluto sobre o Link */}
      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 data-[open=true]:opacity-100">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              aria-label="Opções do pipeline"
              title="Ações do pipeline"
              className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white transition-colors"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[180px] rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
            >
              <DropdownMenu.Item
                onSelect={handleSetDefault}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 dark:text-white/85 cursor-pointer outline-none hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              >
                <StarOff className={cn("h-3.5 w-3.5", pipeline.is_default ? "text-amber-400 fill-amber-400" : "text-slate-400")} />
                {pipeline.is_default ? "Remover padrão" : "Definir como padrão"}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
              <DropdownMenu.Item
                onSelect={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-red-600 cursor-pointer outline-none hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir pipeline
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </li>
  )
}

function PipelinesSkeleton() {
  return (
    <ul className="space-y-1 px-1" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="rounded-[6px] px-2.5 py-2 animate-pulse flex items-start gap-2.5"
        >
          <span className="mt-1 h-2 w-2 rounded-full bg-slate-200 dark:bg-white/[0.10]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded bg-slate-200 dark:bg-white/[0.08]" style={{ width: `${60 + i * 8}%` }} />
            <div className="h-2 rounded bg-slate-100 dark:bg-white/[0.05] w-full" />
            <div className="h-2 rounded bg-slate-100 dark:bg-white/[0.05]" style={{ width: "40%" }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function PipelinesEmpty({ scope }: { scope: "sales" | "cs" }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/40 mb-3">
        {scope === "cs" ? (
          <HeartHandshake className="h-4 w-4" />
        ) : (
          <GitBranch className="h-4 w-4" />
        )}
      </div>
      <p className="text-[12px] font-medium text-slate-700 dark:text-white/70">
        Nenhum pipeline ainda
      </p>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        Pipelines organizam o fluxo de{" "}
        {scope === "cs" ? "pós-venda e CS" : "aquisição e prospecção"}{" "}
        em estagios.
      </p>
    </div>
  )
}

function pipelineHref(scope: "sales" | "cs", id: string): string {
  return scope === "cs"
    ? `/admin/operacional/pipelines/${id}`
    : `/admin/comercial/pipelines/${id}`
}
