"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import useSWR from "swr"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  Plus,
  Search,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Star,
  StarOff,
  MoreHorizontal,
  Trash2,
  Settings,
  DollarSign,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NewPipelineDialog } from "./new-pipeline-dialog"
import type { Pipeline } from "@/types/crm"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineSummary extends Omit<Pipeline, "stages"> {
  stages: Array<{ id: string; name: string; position?: number; stage_type: string | null }>
  deal_count: number
  total_value?: number
}

interface PipelinesNavSidebarProps {
  scope: "sales" | "cs"
}

interface PipelineGroup {
  label: string
  count: number
  pipelines: PipelineSummary[]
}

const COLLAPSED_KEY = "crm-pipelines-sidebar-collapsed"
const COLLAPSED_GROUPS_KEY = "crm-pipelines-collapsed-groups"

/**
 * Sidebar V2 dos pipelines do CRM (Convertfy DS).
 *
 * Estrutura:
 *   - Header com icone Layers + titulo + contador total + botao toggle
 *   - "Novo pipeline" primario (gradient brand)
 *   - Search local
 *   - Lista AGRUPADA por categoria (colapsavel cada grupo)
 *   - Cada item: dot colorido + nome + star (favorito) + descricao + stats
 *   - Footer: botao "Configurar pipelines"
 *
 * Estados:
 *   - Expandido: 280px (padrao)
 *   - Colapsado: 44px (so dots + toggle), preferencia salva em localStorage
 */
export function PipelinesNavSidebar({ scope }: PipelinesNavSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Restaura preferencia de collapsed/grupos do localStorage
  useEffect(() => {
    try {
      const c = localStorage.getItem(COLLAPSED_KEY)
      if (c === "1") setCollapsed(true)
      const g = localStorage.getItem(COLLAPSED_GROUPS_KEY)
      if (g) setCollapsedGroups(new Set(JSON.parse(g)))
    } catch {
      /* noop */
    }
  }, [])

  // O board pode pedir o colapso (modo Compacto → "tela cheia" de
  // colunas). Evento com detail.collapsed; persiste igual ao toggle.
  useEffect(() => {
    const onSet = (e: Event) => {
      const want = Boolean((e as CustomEvent<{ collapsed?: boolean }>).detail?.collapsed)
      setCollapsed(want)
      try {
        localStorage.setItem(COLLAPSED_KEY, want ? "1" : "0")
      } catch {
        /* noop */
      }
    }
    window.addEventListener("crm:pipelines-sidebar-set", onSet)
    return () => window.removeEventListener("crm:pipelines-sidebar-set", onSet)
  }, [])

  const { data, isLoading, mutate } = useSWR<{ data?: { pipelines: PipelineSummary[] }; pipelines?: PipelineSummary[] }>(
    `/api/crm/pipelines?scope=${scope}`,
    fetcher,
  )

  // O endpoint retorna { success, data: { pipelines, scope } } via successResponse
  const pipelines = useMemo<PipelineSummary[]>(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pipelines
    return pipelines.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q),
    )
  }, [pipelines, search])

  // Agrupa por category (ordem: favoritos primeiro dentro de cada grupo)
  const groups = useMemo<PipelineGroup[]>(() => {
    const byCat = new Map<string, PipelineSummary[]>()
    for (const p of filtered) {
      const k = p.category || "Sem categoria"
      const arr = byCat.get(k) || []
      arr.push(p)
      byCat.set(k, arr)
    }
    // Ordena pipelines dentro de cada grupo: favoritos primeiro, depois alfabetico
    for (const [k, arr] of byCat.entries()) {
      arr.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      byCat.set(k, arr)
    }
    // Ordem dos grupos: lifecycle-based pra CS, scope=sales primeiro pra
    // comercial. "Configuracao" fica antes de "Sem categoria" no fim.
    const order = [
      // Comercial (scope=sales)
      "Comerciais",
      // CS lifecycle
      "Onboarding",
      "Saude",
      "Engajamento",
      "Atendimento",
      "Renovacao",
      // Legados
      "Operacoes",
      "Operações",
      "Producao",
      "Produção",
      "Calls",
      "Acompanhamento",
      // Settings por ultimo
      "Configuracao",
      "Configuração",
    ]
    const sorted = Array.from(byCat.entries()).sort(([a], [b]) => {
      if (a === "Sem categoria") return 1
      if (b === "Sem categoria") return -1
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return a.localeCompare(b)
    })
    return sorted.map(([label, pipes]) => ({
      label,
      count: pipes.length,
      pipelines: pipes,
    }))
  }, [filtered])

  const activeId = useMemo(() => {
    const m = pathname.match(/\/pipelines\/([^/?#]+)/)
    return m?.[1] ?? null
  }, [pathname])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      /* noop */
    }
  }

  const toggleGroup = (label: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    setCollapsedGroups(next)
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(next)))
    } catch {
      /* noop */
    }
  }

  // ── Versao colapsada ──────────────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className="flex h-full flex-col shrink-0 items-center gap-2 py-3"
        style={{
          width: "var(--crm-pipeline-sidebar-collapsed)",
          background: "var(--crm-gray-0)",
          borderRight: "1px solid var(--crm-border)",
        }}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Expandir"
          className="cf-focusable flex h-7 w-7 items-center justify-center rounded-[6px] border text-slate-600 hover:bg-slate-50 dark:text-white/70"
          style={{ borderColor: "var(--crm-border)" }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <div className="h-px w-6 my-1" style={{ background: "var(--crm-gray-100)" }} />
        {pipelines.slice(0, 12).map((p) => {
          const isActive = p.id === activeId
          return (
            <Link
              key={p.id}
              href={pipelineHref(scope, p.id)}
              title={p.name}
              className={cn(
                "cf-focusable flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors",
                isActive ? "" : "hover:bg-slate-50",
              )}
              style={{
                background: isActive ? "var(--crm-blue-50)" : "transparent",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: p.color ?? "var(--crm-gray-500)" }}
              />
            </Link>
          )
        })}
      </aside>
    )
  }

  // ── Versao expandida (padrao) ────────────────────────────────
  const sectionLabel = scope === "cs" ? "Pipelines CS" : "Pipelines"
  const dialogScope: "sales" | "cs" = scope

  return (
    <aside
      className="flex h-full flex-col shrink-0 overflow-hidden"
      style={{
        width: "var(--crm-pipeline-sidebar-width)",
        background: "var(--crm-gray-0)",
        borderRight: "1px solid var(--crm-border)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid var(--crm-gray-100)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--crm-gray-500)" }} />
          <h2
            className="text-[14px] truncate"
            style={{
              color: "var(--crm-gray-900)",
              fontWeight: "var(--crm-weight-semibold)",
            }}
          >
            {sectionLabel}
          </h2>
          {pipelines.length > 0 && (
            <span
              className="crm-tnum text-[11px]"
              style={{
                color: "var(--crm-gray-500)",
                fontWeight: "var(--crm-weight-medium)",
              }}
            >
              {pipelines.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Recolher"
          className="cf-focusable flex h-6 w-6 items-center justify-center rounded-[4px] hover:bg-slate-50"
          style={{ color: "var(--crm-gray-400)" }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Novo pipeline ── */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => setNewDialogOpen(true)}
          className="cf-focusable w-full flex h-[34px] items-center justify-center gap-1.5 rounded-[6px] text-[13px] transition-colors"
          style={{
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontWeight: "var(--crm-weight-semibold)",
            border: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-brand-hover)"))}
          onMouseLeave={(e) => ((e.currentTarget.style.background = "var(--crm-brand)"))}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo pipeline
        </button>
      </div>

      {/* ── Busca ── */}
      {pipelines.length > 4 && (
        <div className="relative px-3 pb-2">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none"
            style={{ color: "var(--crm-gray-400)" }}
          />
          <input
            type="text"
            placeholder="Buscar pipeline..."
            aria-label="Buscar pipeline"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-[30px] rounded-[6px] pl-7 pr-7 text-[12px] outline-none transition-colors"
            style={{
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              color: "var(--crm-gray-700)",
              fontFamily: "var(--crm-font-sans)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--crm-gray-400)" }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Lista agrupada ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <PipelinesSkeleton />
        ) : pipelines.length === 0 ? (
          <PipelinesEmpty scope={scope} />
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px]" style={{ color: "var(--crm-gray-400)" }}>
            Nenhum pipeline corresponde a &ldquo;{search}&rdquo;.
          </div>
        ) : (
          groups.map((g) => (
            <PipelineGroupBlock
              key={g.label}
              group={g}
              collapsed={collapsedGroups.has(g.label)}
              onToggle={() => toggleGroup(g.label)}
              activeId={activeId}
              scope={scope}
              onChanged={() => mutate()}
            />
          ))
        )}
      </div>

      {/* ── Footer: configurar ── */}
      <div
        className="px-3 py-2.5"
        style={{ borderTop: "1px solid var(--crm-gray-100)" }}
      >
        <button
          type="button"
          onClick={() => router.push(`/admin/comercial/pipelines/admin`)}
          className="cf-focusable w-full flex h-[30px] items-center justify-center gap-1.5 rounded-[6px] text-[12px] transition-colors"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            color: "var(--crm-gray-600)",
            fontWeight: "var(--crm-weight-medium)",
          }}
          onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-gray-100)"))}
          onMouseLeave={(e) => ((e.currentTarget.style.background = "var(--crm-gray-0)"))}
        >
          <Settings className="h-3 w-3" />
          Configurar pipelines
        </button>
      </div>

      <NewPipelineDialog
        open={newDialogOpen}
        scope={dialogScope}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => mutate()}
      />
    </aside>
  )
}

// ─── Grupo de pipelines (colapsavel) ─────────────────────────────

function PipelineGroupBlock({
  group,
  collapsed,
  onToggle,
  activeId,
  scope,
  onChanged,
}: {
  group: PipelineGroup
  collapsed: boolean
  onToggle: () => void
  activeId: string | null
  scope: "sales" | "cs"
  onChanged: () => void
}) {
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="cf-focusable w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-slate-50 group"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown
            className="h-3 w-3 transition-transform"
            style={{
              color: "var(--crm-gray-400)",
              transform: collapsed ? "rotate(-90deg)" : "none",
            }}
          />
          <span
            className="text-[12px] truncate"
            style={{
              color: "var(--crm-gray-700)",
              fontWeight: "var(--crm-weight-semibold)",
            }}
          >
            {group.label}
          </span>
        </div>
        <span
          className="crm-tnum text-[10px]"
          style={{
            color: "var(--crm-gray-400)",
            fontWeight: "var(--crm-weight-semibold)",
          }}
        >
          {group.count}
        </span>
      </button>
      {!collapsed && (
        <ul className="space-y-0.5 mt-0.5" role="list">
          {group.pipelines.map((p) => (
            <PipelineItem
              key={p.id}
              pipeline={p}
              href={pipelineHref(scope, p.id)}
              active={p.id === activeId}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Item individual ─────────────────────────────────────────────

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
  const dotColor = pipeline.color ?? "#4E62D8"
  const router = useRouter()
  const stageCount = pipeline.stages?.length ?? 0
  const dealCount = pipeline.deal_count ?? 0

  const handleDelete = async (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    const aviso =
      dealCount > 0
        ? `O pipeline "${pipeline.name}" tem ${dealCount} deal(s). Excluir vai arquivar esses deals. Continuar?`
        : `Excluir o pipeline "${pipeline.name}"? Esta ação não pode ser desfeita.`
    if (!window.confirm(aviso)) return
    try {
      const res = await fetch(`/api/crm/pipelines/${pipeline.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        window.alert(`Falha ao excluir: ${body.error?.message ?? body.error ?? res.statusText}`)
        return
      }
      if (active) router.push(href.replace(/\/[^/]+$/, ""))
      onChanged()
    } catch (err) {
      window.alert(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggleFavorite = async (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await fetch(`/api/crm/pipelines/${pipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !pipeline.is_favorite }),
      })
      if (res.ok) onChanged()
    } catch {
      /* noop */
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
        aria-current={active ? "page" : undefined}
        className="relative flex items-start gap-2 rounded-[6px] px-2.5 py-2 transition-colors"
        style={{
          background: active ? "var(--crm-blue-50)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget.style.background = "var(--crm-gray-50)")
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget.style.background = "transparent")
        }}
      >
        {/* Barra colorida lateral quando ativo */}
        {active && (
          <span
            aria-hidden
            className="absolute left-[-8px] top-1.5 bottom-1.5 w-[3px] rounded-r-[2px]"
            style={{ background: "var(--crm-brand)" }}
          />
        )}

        {/* Dot colorido (pipeline color) */}
        <span
          aria-hidden
          className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotColor }}
        />

        <span className="min-w-0 flex-1">
          {/* Nome + fav star */}
          <span className="flex items-center gap-1">
            <span
              className="truncate text-[13px] leading-tight"
              style={{
                color: active ? "var(--crm-brand)" : "var(--crm-gray-900)",
                fontWeight: active
                  ? "var(--crm-weight-semibold)"
                  : "var(--crm-weight-medium)",
              }}
            >
              {pipeline.name}
            </span>
            {pipeline.is_favorite && (
              <Star
                className="h-2.5 w-2.5 shrink-0 fill-amber-500 text-amber-500"
                aria-label="Pipeline favorito"
              />
            )}
            {pipeline.is_default && (
              <span
                className="text-[9px] uppercase tracking-wider px-1 rounded-[2px]"
                style={{
                  color: "var(--crm-gray-500)",
                  background: "var(--crm-gray-100)",
                  fontWeight: "var(--crm-weight-semibold)",
                }}
              >
                DEFAULT
              </span>
            )}
          </span>

          {/* Descricao */}
          {pipeline.description && (
            <span
              className="block truncate text-[11px] leading-tight mt-0.5"
              style={{ color: "var(--crm-gray-500)" }}
            >
              {pipeline.description}
            </span>
          )}

          {/* Stats: deals + etapas */}
          <span
            className="crm-tnum mt-1.5 flex items-center gap-1.5 text-[10px]"
            style={{ color: "var(--crm-gray-500)" }}
          >
            <span className="inline-flex items-center gap-0.5">
              <DollarSign className="h-2.5 w-2.5" />
              {dealCount} {dealCount === 1 ? "deal" : "deals"}
            </span>
            {stageCount > 0 && (
              <>
                <span aria-hidden style={{ color: "var(--crm-gray-300)" }}>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Layers className="h-2.5 w-2.5" />
                  {stageCount} etapas
                </span>
              </>
            )}
          </span>
        </span>

        {active && (
          <ChevronRight
            className="h-3 w-3 shrink-0 mt-1"
            style={{ color: "var(--crm-brand)" }}
            aria-hidden
          />
        )}
      </Link>

      {/* Menu de acoes (... no hover) */}
      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              aria-label="Opções do pipeline"
              title="Ações do pipeline"
              className="flex h-6 w-6 items-center justify-center rounded-[4px]"
              style={{
                background: "var(--crm-gray-100)",
                color: "var(--crm-gray-600)",
              }}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[200px] rounded-[6px] py-1"
              style={{
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-border)",
                boxShadow: "var(--crm-shadow-lg)",
              }}
            >
              <DropdownMenu.Item
                onSelect={handleToggleFavorite}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer outline-none data-[highlighted]:bg-slate-50"
                style={{ color: "var(--crm-gray-700)" }}
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    pipeline.is_favorite ? "fill-amber-500 text-amber-500" : "text-slate-400",
                  )}
                />
                {pipeline.is_favorite ? "Remover favorito" : "Marcar favorito"}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={handleSetDefault}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer outline-none data-[highlighted]:bg-slate-50"
                style={{ color: "var(--crm-gray-700)" }}
              >
                <StarOff className="h-3.5 w-3.5 text-slate-400" />
                {pipeline.is_default ? "Remover padrão" : "Definir como padrão"}
              </DropdownMenu.Item>
              <DropdownMenu.Separator
                className="h-px my-1"
                style={{ background: "var(--crm-gray-100)" }}
              />
              <DropdownMenu.Item
                onSelect={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer outline-none data-[highlighted]:bg-red-50"
                style={{ color: "var(--crm-neg)" }}
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

// ─── Skeleton ───────────────────────────────────────────────────

function PipelinesSkeleton() {
  return (
    <ul className="space-y-1 px-1 mt-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="rounded-[6px] px-2.5 py-2 animate-pulse flex items-start gap-2.5"
        >
          <span
            className="mt-1 h-2 w-2 rounded-full"
            style={{ background: "var(--crm-gray-200)" }}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 rounded"
              style={{
                background: "var(--crm-gray-200)",
                width: `${60 + i * 8}%`,
              }}
            />
            <div
              className="h-2 rounded w-full"
              style={{ background: "var(--crm-gray-100)" }}
            />
            <div
              className="h-2 rounded"
              style={{
                background: "var(--crm-gray-100)",
                width: "40%",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── Empty ──────────────────────────────────────────────────────

function PipelinesEmpty({ scope }: { scope: "sales" | "cs" }) {
  return (
    <div className="px-4 py-8 text-center">
      <div
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] mb-3"
        style={{
          background: "var(--crm-blue-50)",
          color: "var(--crm-brand)",
        }}
      >
        <Layers className="h-4 w-4" />
      </div>
      <p
        className="text-[12px]"
        style={{
          color: "var(--crm-gray-700)",
          fontWeight: "var(--crm-weight-medium)",
        }}
      >
        Nenhum pipeline ainda
      </p>
      <p
        className="mt-1 text-[11px] leading-relaxed"
        style={{ color: "var(--crm-gray-500)" }}
      >
        Pipelines organizam o fluxo de{" "}
        {scope === "cs" ? "pós-venda e CS" : "aquisição e prospecção"} em
        etapas.
      </p>
    </div>
  )
}

function pipelineHref(scope: "sales" | "cs", id: string): string {
  return scope === "cs"
    ? `/admin/operacional/pipelines/${id}`
    : `/admin/comercial/pipelines/${id}`
}
