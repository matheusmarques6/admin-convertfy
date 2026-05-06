"use client"

import Link from "next/link"
import useSWR from "swr"
import { Plus, HeartHandshake } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { ROUTES } from "@/lib/routes"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  scope: string
  layout: string | null
  stages: Array<{ id: string; name: string; position: number; stage_type: string | null }>
  deals_count: number
}

export default function CsPipelinesPage() {
  const { data, isLoading } = useSWR<{ pipelines: PipelineSummary[] }>(
    "/api/crm/pipelines?scope=cs",
    fetcher,
  )

  const pipelines = data?.pipelines || []

  return (
    <CrmPageShell
      title="Customer Success"
      subtitle="Onboarding 30d, Gestao de Carteira, Feedback Mensal e Tickets"
      actions={
        <button
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo pipeline CS
        </button>
      }
    >
      <div className="p-6">
        {isLoading ? (
          <div style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
            Carregando...
          </div>
        ) : pipelines.length === 0 ? (
          <CrmEmptyState
            icon={<HeartHandshake className="h-5 w-5" />}
            title="Nenhum pipeline de CS configurado"
            description="Os pipelines pre-configurados sao criados automaticamente pela migration de seed."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pipelines.map((p) => (
              <Link
                key={p.id}
                href={ROUTES.ADMIN.CRM.CS.PIPELINE_DETAIL(p.id)}
                className="crm-card"
                style={{ display: "flex", flexDirection: "column", gap: "var(--crm-space-2)" }}
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: "var(--crm-text-md)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-900)",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-gray-500)",
                    }}
                  >
                    {p.deals_count} cards
                  </span>
                </div>
                {p.description && (
                  <p
                    style={{
                      fontSize: "var(--crm-text-sm)",
                      color: "var(--crm-gray-500)",
                      lineHeight: "var(--crm-leading-normal)",
                    }}
                  >
                    {p.description}
                  </p>
                )}
                <div
                  className="mt-auto flex items-center justify-between pt-2"
                  style={{ borderTop: "1px solid var(--crm-gray-200)" }}
                >
                  <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                    {p.stages.length} estagios
                  </span>
                  {p.layout === "state" && (
                    <span
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: "var(--crm-info-fg)",
                        background: "var(--crm-info-bg)",
                        padding: "2px 6px",
                        borderRadius: "var(--crm-radius-sm)",
                        fontWeight: "var(--crm-weight-medium)",
                      }}
                    >
                      State board
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}
