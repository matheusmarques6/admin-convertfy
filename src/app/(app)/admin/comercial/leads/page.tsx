"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Copy, Download, Plus, Search, UserPlus, Upload } from "lucide-react"
import { csvDate, downloadCsv, toCsv } from "@/lib/services/crm-csv"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { LeadDrawer } from "@/components/crm/lead-drawer"
import { NewLeadDialog } from "@/components/crm/new-lead-dialog"
import { LeadsImportWizard } from "@/components/crm/leads-import-wizard"
import { LeadsDuplicatesDialog } from "@/components/crm/leads-duplicates-dialog"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { useDebounce } from "@/hooks/use-debounce"

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
  return (
    <Suspense fallback={null}>
      <SalesLeadsPageInner />
    </Suspense>
  )
}

function SalesLeadsPageInner() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("")
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [drawerAction, setDrawerAction] = useState<"convert" | "edit" | null>(null)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)

  // Open drawer if ?lead=<id> in URL; action=convert/edit aciona modo
  useEffect(() => {
    const leadParam = searchParams.get("lead")
    if (leadParam) setActiveLeadId(leadParam)
    const actionParam = searchParams.get("action")
    if (actionParam === "convert" || actionParam === "edit") {
      setDrawerAction(actionParam)
    } else {
      setDrawerAction(null)
    }
  }, [searchParams])

  const params = new URLSearchParams()
  if (debouncedSearch) params.set("search", debouncedSearch)
  if (statusFilter) params.set("status", statusFilter)
  params.set("limit", "100")

  const { data, isLoading, mutate } = useSWR<{ leads: LeadRow[]; total: number }>(
    `/api/crm/leads?${params.toString()}`,
    fetcher,
  )

  const leads = data?.leads || []
  const total = data?.total || 0
  const [exporting, setExporting] = useState(false)

  // Exporta TODOS os leads do filtro atual (a lista pagina em 100 — o
  // export refaz a busca com limite alto pra não exportar só a página).
  const exportLeadsCsv = async () => {
    setExporting(true)
    try {
      const exportParams = new URLSearchParams(params)
      exportParams.set("limit", "5000")
      const res = await fetch(`/api/crm/leads?${exportParams.toString()}`)
      const json = (await res.json().catch(() => null)) as { leads?: LeadRow[] } | null
      const all = json?.leads ?? []
      const csv = toCsv(
        ["Nome", "Email", "Telefone", "Empresa", "Status", "Origem", "Responsável", "Criado em"],
        all.map((l) => [
          l.name,
          l.email ?? "",
          l.phone ?? "",
          l.company ?? "",
          STATUS_LABELS[l.status]?.label ?? l.status,
          l.source ?? "",
          l.assignee?.name ?? "",
          csvDate(l.created_at),
        ]),
      )
      downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } finally {
      setExporting(false)
    }
  }

  return (
    <CrmPageShell
      title="Leads"
      subtitle={`${total} ${total === 1 ? "lead" : "leads"} no total`}
      actions={
        <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}>
          <button
            onClick={exportLeadsCsv}
            disabled={exporting}
            className="crm-button-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              opacity: exporting ? 0.5 : 1,
            }}
            title="Exportar os leads do filtro atual para planilha (CSV)"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exportando..." : "Exportar"}
          </button>
          <button
            onClick={() => setDuplicatesOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.10)",
              color: "var(--crm-gray-700)",
              cursor: "pointer",
            }}
            title="Encontrar e mesclar leads duplicados"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicados
          </button>
          <button
            onClick={() => setImportOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.10)",
              color: "var(--crm-gray-700)",
              cursor: "pointer",
            }}
            title="Importar leads de CSV"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar
          </button>
          <button
            className="crm-button-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
            onClick={() => setNewLeadOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo lead
          </button>
        </div>
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
              aria-label="Buscar leads por nome, email ou empresa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="crm-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {(debouncedSearch || statusFilter) && (
            <span
              className="ml-auto"
              style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
              aria-live="polite"
            >
              {leads.length} {leads.length === 1 ? "resultado" : "resultados"}
            </span>
          )}
        </div>

        {isLoading ? (
          <PageSkeleton variant="list" showHeader={false} className="px-0 py-0" />
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
          <>
          {/* Mobile: lista de cards (a tabela de 7 colunas não cabe) */}
          <div className="flex flex-col gap-2 md:hidden">
            {leads.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveLeadId(l.id)}
                className="w-full text-left"
                style={{
                  border: "1px solid var(--crm-gray-200)",
                  borderRadius: "var(--crm-radius-md)",
                  background: "var(--crm-gray-0)",
                  padding: "12px 14px",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate" style={{ color: "var(--crm-gray-900)", fontWeight: "var(--crm-weight-medium)", fontSize: "var(--crm-text-md)" }}>
                    {l.name}
                  </span>
                  <span
                    className="shrink-0"
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: STATUS_LABELS[l.status]?.color || "var(--crm-gray-500)",
                      fontWeight: "var(--crm-weight-medium)",
                    }}
                  >
                    {STATUS_LABELS[l.status]?.label || l.status}
                  </span>
                </div>
                {(l.company || l.email) && (
                  <p className="mt-0.5 truncate" style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-600)" }}>
                    {[l.company, l.email].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                  <span>{l.source || "—"}</span>
                  <span>Score: {l.ai_qualification_score != null ? `${l.ai_qualification_score}` : "—"}</span>
                  {l.assignee?.name && <span>{l.assignee.name}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: tabela completa */}
          <div
            className="hidden overflow-x-auto scrollbar-thin md:block"
            style={{
              border: "1px solid var(--crm-gray-200)",
              borderRadius: "var(--crm-radius-md)",
              background: "var(--crm-gray-0)",
            }}
          >
            <table className="w-full" style={{ fontSize: "var(--crm-text-base)" }}>
              <thead>
                <tr style={{ background: "var(--crm-gray-50)", height: "var(--crm-table-header-height)" }}>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>NOME</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>EMPRESA</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>EMAIL</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>FONTE</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>STATUS</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>SCORE</th>
                  <th scope="col" className="text-left font-medium px-3" style={{ color: "var(--crm-gray-600)", fontSize: "var(--crm-text-xs)" }}>OWNER</th>
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
                    onClick={() => setActiveLeadId(l.id)}
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
          </>
        )}
      </div>

      <LeadDrawer
        leadId={activeLeadId}
        onClose={() => {
          setActiveLeadId(null)
          setDrawerAction(null)
        }}
        onUpdated={() => mutate()}
        initialAction={drawerAction}
      />

      <NewLeadDialog
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onCreated={(id) => {
          mutate()
          setActiveLeadId(id)
        }}
      />

      <LeadsImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          mutate()
        }}
      />

      <LeadsDuplicatesDialog
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        onMerged={() => mutate()}
      />
    </CrmPageShell>
  )
}
