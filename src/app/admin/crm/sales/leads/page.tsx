"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Search, UserPlus } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LeadRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  status: string
  ai_qualification_score: number | null
  created_at: string
  assignee?: { id: string; name: string; avatar_url: string | null } | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "var(--crm-info-fg)" },
  qualified: { label: "Qualificado", color: "var(--crm-success-fg)" },
  unqualified: { label: "Desqualificado", color: "var(--crm-gray-500)" },
  converted: { label: "Convertido", color: "var(--crm-success-fg)" },
  lost: { label: "Perdido", color: "var(--crm-danger-fg)" },
}

export default function SalesLeadsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (statusFilter) params.set("status", statusFilter)
  params.set("limit", "100")

  const { data, isLoading } = useSWR<{ data: { leads: LeadRow[]; total: number } }>(
    `/api/crm/leads?${params.toString()}`,
    fetcher,
  )

  const leads = data?.data?.leads || []
  const total = data?.data?.total || 0

  return (
    <CrmPageShell
      title="Leads"
      subtitle={`${total} ${total === 1 ? "lead" : "leads"} no total`}
      actions={
        <button
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo lead
        </button>
      }
    >
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: "var(--crm-gray-400)" }}
            />
            <input
              type="text"
              className="crm-input w-full"
              style={{ paddingLeft: "30px" }}
              placeholder="Buscar por nome, email, empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="crm-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
            Carregando...
          </div>
        ) : leads.length === 0 ? (
          <CrmEmptyState
            icon={<UserPlus className="h-5 w-5" />}
            title="Nenhum lead encontrado"
            description={
              search || statusFilter
                ? "Ajuste os filtros para ver mais resultados."
                : "Crie seu primeiro lead para comecar a qualificar oportunidades."
            }
          />
        ) : (
          <div
            className="overflow-hidden"
            style={{
              border: "1px solid var(--crm-gray-200)",
              borderRadius: "var(--crm-radius-md)",
              background: "var(--crm-gray-0)",
            }}
          >
            <table className="w-full" style={{ fontSize: "var(--crm-text-base)" }}>
              <thead>
                <tr style={{ background: "var(--crm-gray-50)", height: "var(--crm-table-header-height)" }}>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>NOME</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>EMPRESA</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>EMAIL</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>FONTE</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>STATUS</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>SCORE</th>
                  <th className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>OWNER</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    style={{
                      height: "var(--crm-table-row-height)",
                      borderTop: "1px solid var(--crm-gray-200)",
                      cursor: "pointer",
                    }}
                    className="hover:bg-[color:var(--crm-gray-50)]"
                  >
                    <td className="px-3" style={{ color: "var(--crm-gray-900)", fontWeight: "var(--crm-weight-medium)" }}>
                      {l.name}
                    </td>
                    <td className="px-3" style={{ color: "var(--crm-gray-700)" }}>{l.company || "—"}</td>
                    <td className="px-3" style={{ color: "var(--crm-gray-700)" }}>{l.email || "—"}</td>
                    <td className="px-3" style={{ color: "var(--crm-gray-500)" }}>{l.source || "—"}</td>
                    <td className="px-3">
                      <span
                        style={{
                          fontSize: "var(--crm-text-xs)",
                          color: STATUS_LABELS[l.status]?.color || "var(--crm-gray-500)",
                          fontWeight: "var(--crm-weight-medium)",
                        }}
                      >
                        {STATUS_LABELS[l.status]?.label || l.status}
                      </span>
                    </td>
                    <td className="px-3" style={{ color: "var(--crm-gray-700)" }}>
                      {l.ai_qualification_score != null ? `${l.ai_qualification_score}` : "—"}
                    </td>
                    <td className="px-3" style={{ color: "var(--crm-gray-700)" }}>
                      {l.assignee?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}
