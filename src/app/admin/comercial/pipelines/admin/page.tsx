"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Layers,
  Plus,
  Settings,
  Star,
} from "lucide-react"
import { NewPipelineDialog } from "@/components/crm/new-pipeline-dialog"
import { PipelineSettingsDialog } from "@/components/crm/pipeline-settings-dialog"
import type { Pipeline } from "@/types/crm"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface PipelineSummary extends Omit<Pipeline, "stages"> {
  stages: Array<{
    id: string
    name: string
    color?: string | null
    order?: number
    position?: number
    stage_type: string | null
    sla_hours: number | null
    description?: string | null
    exit_criteria?: string | null
  }>
  deal_count: number
  total_value?: number
}

/**
 * Pagina de administracao de pipelines comerciais.
 *
 * Lista todos os pipelines do scope sales agrupados por categoria,
 * com metricas (deals abertos, valor em pipe, etapas) e CTAs pra:
 *   - Abrir o board (`Abrir pipeline`)
 *   - Editar estagios e configuracoes (`Configurar`)
 *   - Duplicar / arquivar via menu de acoes
 *   - Criar novo pipeline
 *
 * Esta rota e linkada pelo footer "Configurar pipelines" da sidebar V2.
 */
export default function PipelinesAdminPage() {
  const { data, mutate } = useSWR<{
    pipelines: PipelineSummary[]
    data?: { pipelines: PipelineSummary[] }
  }>("/api/crm/pipelines?scope=sales", fetcher)

  const pipelines = useMemo<PipelineSummary[]>(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [settingsPipeline, setSettingsPipeline] = useState<PipelineSummary | null>(null)

  const grouped = useMemo(() => {
    const byCat = new Map<string, PipelineSummary[]>()
    for (const p of pipelines) {
      const k = (p.category as string | null) ?? "Sem categoria"
      const arr = byCat.get(k) || []
      arr.push(p)
      byCat.set(k, arr)
    }
    return Array.from(byCat.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => {
          if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
          return a.name.localeCompare(b.name)
        }),
      }))
      .sort((a, b) => {
        const order = ["Comerciais", "Operacoes", "Producao"]
        const ai = order.indexOf(a.label)
        const bi = order.indexOf(b.label)
        if (ai >= 0 && bi >= 0) return ai - bi
        if (ai >= 0) return -1
        if (bi >= 0) return 1
        if (a.label === "Sem categoria") return 1
        if (b.label === "Sem categoria") return -1
        return a.label.localeCompare(b.label)
      })
  }, [pipelines])

  const totals = useMemo(() => {
    return {
      pipelines: pipelines.length,
      deals: pipelines.reduce((s, p) => s + (p.deal_count || 0), 0),
      stages: pipelines.reduce((s, p) => s + (p.stages?.length || 0), 0),
    }
  }, [pipelines])

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* Topbar com crumb */}
      <div
        className="flex items-center justify-between px-4 md:px-8"
        style={{
          paddingTop: 12,
          paddingBottom: 12,
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--crm-gray-500)" }}
        >
          <Link href="/admin/comercial" style={{ color: "var(--crm-gray-500)" }}>
            Comercial
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}>
            Configurar pipelines
          </span>
        </div>
        <button
          onClick={() => setNewDialogOpen(true)}
          className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 32,
            padding: "0 12px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 12,
            fontWeight: 600,
            border: 0,
            cursor: "pointer",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo pipeline
        </button>
      </div>

      {/* Header com titulo + KPIs */}
      <div
        className="px-4 md:px-8"
        style={{
          paddingTop: 20,
          paddingBottom: 20,
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            letterSpacing: "-0.015em",
          }}
        >
          Pipelines comerciais
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--crm-gray-500)",
            marginTop: 4,
          }}
        >
          Gerencie etapas, SLA, regras de automação e visibilidade dos seus pipelines.
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-4">
          <Stat label="Pipelines" value={totals.pipelines} />
          <div className="w-px h-8" style={{ background: "var(--crm-gray-200)" }} />
          <Stat label="Deals abertos" value={totals.deals} />
          <div className="w-px h-8" style={{ background: "var(--crm-gray-200)" }} />
          <Stat label="Total de etapas" value={totals.stages} />
        </div>
      </div>

      {/* Body com lista agrupada */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
        {pipelines.length === 0 ? (
          <div
            className="text-center mx-auto"
            style={{
              maxWidth: 480,
              padding: "40px 20px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              borderRadius: "var(--crm-radius-2xl)",
            }}
          >
            <div
              className="mx-auto flex items-center justify-center"
              style={{
                width: 64,
                height: 64,
                marginBottom: 20,
                borderRadius: 16,
                background: "var(--crm-blue-50)",
                color: "var(--crm-brand)",
              }}
            >
              <Layers className="h-7 w-7" />
            </div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              Nenhum pipeline ainda
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 13,
                color: "var(--crm-gray-500)",
              }}
            >
              Crie seu primeiro pipeline comercial para organizar a aquisição.
            </p>
            <button
              onClick={() => setNewDialogOpen(true)}
              className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
              style={{
                height: 34,
                padding: "0 14px",
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                fontSize: 13,
                fontWeight: 500,
                border: 0,
                cursor: "pointer",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Criar pipeline
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-[1200px] mx-auto">
            {grouped.map((g) => (
              <section key={g.label}>
                <div
                  className="flex items-center gap-2 mb-3"
                  style={{
                    fontSize: 12,
                    color: "var(--crm-gray-700)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {g.label}
                  <span
                    className="crm-tnum"
                    style={{
                      fontSize: 10,
                      color: "var(--crm-gray-400)",
                    }}
                  >
                    {g.items.length}
                  </span>
                </div>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((p) => (
                    <PipelineCard
                      key={p.id}
                      pipeline={p}
                      onConfigure={() => setSettingsPipeline(p)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <NewPipelineDialog
        open={newDialogOpen}
        scope="sales"
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => mutate()}
      />

      {settingsPipeline && (
        <PipelineSettingsDialog
          open={!!settingsPipeline}
          onClose={() => setSettingsPipeline(null)}
          pipeline={{
            id: settingsPipeline.id,
            name: settingsPipeline.name,
            description: settingsPipeline.description,
            scope: settingsPipeline.scope,
            color: settingsPipeline.color,
            is_default: settingsPipeline.is_default,
            stages: settingsPipeline.stages.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color ?? null,
              order: s.order ?? s.position ?? 0,
              stage_type:
                s.stage_type === "open" ||
                s.stage_type === "won" ||
                s.stage_type === "lost" ||
                s.stage_type === "archived"
                  ? s.stage_type
                  : null,
              sla_hours: s.sla_hours ?? null,
              description: s.description ?? null,
            })),
          }}
          onChanged={() => mutate()}
          onDeleted={() => {
            setSettingsPipeline(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className="crm-tnum"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PipelineCard({
  pipeline,
  onConfigure,
}: {
  pipeline: PipelineSummary
  onConfigure: () => void
}) {
  const dotColor = pipeline.color ?? "var(--crm-brand)"
  const stagesCount = pipeline.stages?.length ?? 0
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: "var(--crm-radius-xl)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span
          className="shrink-0 mt-1.5 h-2 w-2 rounded-full"
          style={{ background: dotColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3
              className="truncate"
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              {pipeline.name}
            </h3>
            {pipeline.is_favorite && (
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
            )}
            {pipeline.is_default && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "var(--crm-gray-100)",
                  color: "var(--crm-gray-600)",
                }}
              >
                Default
              </span>
            )}
          </div>
          {pipeline.description && (
            <p
              className="line-clamp-2"
              style={{
                margin: 0,
                fontSize: 11.5,
                color: "var(--crm-gray-500)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {pipeline.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-2 gap-2"
        style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "6px 10px",
            background: "var(--crm-gray-50)",
            borderRadius: 6,
          }}
        >
          <Layers className="h-3 w-3" style={{ color: "var(--crm-gray-400)" }} />
          <span className="crm-tnum">{stagesCount} etapas</span>
        </div>
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "6px 10px",
            background: "var(--crm-gray-50)",
            borderRadius: 6,
          }}
        >
          <GitBranch className="h-3 w-3" style={{ color: "var(--crm-gray-400)" }} />
          <span className="crm-tnum">{pipeline.deal_count} deals</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/admin/comercial/pipelines/${pipeline.id}`}
          className="cf-focusable flex-1 inline-flex items-center justify-center gap-1.5"
          style={{
            height: 30,
            padding: "0 10px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 6,
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            border: 0,
            textDecoration: "none",
          }}
        >
          Abrir
          <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          onClick={onConfigure}
          className="cf-focusable inline-flex items-center justify-center gap-1.5"
          style={{
            height: 30,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 6,
            background: "var(--crm-gray-0)",
            color: "var(--crm-gray-700)",
            border: "1px solid var(--crm-border)",
            cursor: "pointer",
          }}
        >
          <Settings className="h-3 w-3" />
          Configurar
        </button>
      </div>
    </div>
  )
}
