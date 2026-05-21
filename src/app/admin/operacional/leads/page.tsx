"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import {
  AlertTriangle,
  HeartHandshake,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { LeadDrawer } from "@/components/crm/lead-drawer"
import { NewLeadDialog } from "@/components/crm/new-lead-dialog"
import { LeadsImportWizard } from "@/components/crm/leads-import-wizard"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { useDebounce } from "@/hooks/use-debounce"

/**
 * Leads CS = entradas anteriores ao deal CS aberto.
 *
 * Categorias (tag):
 *  - health_alert        : loja com sinal de risco (NPS detrator, churn iminente, queda forte)
 *  - renewal_opportunity : oportunidade de upsell, cross-sell, upgrade
 *  - feedback_followup   : resposta de NPS/health/feedback que precisa triagem
 *  - churn_recovery      : cliente cancelando ou cancelado, tentativa de win-back
 *
 * Fonte de entrada:
 *  - Manual (CSM cria a partir do CRM CS)
 *  - Automatica (cron de health flagga loja -> cria health_alert lead)
 *  - Form submission (NPS/Health/Feedback responde -> cria feedback_followup lead)
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LeadRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  status: string
  scope: string
  category: string | null
  store_id: string | null
  ai_qualification_score: number | null
  created_at: string
  assignee?: { id: string; name: string; avatar_url: string | null } | null
  store?: {
    id: string
    store_name: string
    health_score: number | null
    mrr_cents: number | null
  } | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "var(--crm-info-fg)" },
  qualified: { label: "Qualificado", color: "var(--crm-success-fg)" },
  unqualified: { label: "Desqualificado", color: "var(--crm-gray-500)" },
  converted: { label: "Convertido", color: "var(--crm-success-fg)" },
  lost: { label: "Perdido", color: "var(--crm-danger-fg)" },
}

const CATEGORY_TABS = [
  {
    key: "" as const,
    label: "Todos",
    icon: UserPlus,
    color: "var(--crm-gray-600)",
  },
  {
    key: "health_alert" as const,
    label: "Alertas de saúde",
    icon: AlertTriangle,
    color: "#EF4444",
  },
  {
    key: "renewal_opportunity" as const,
    label: "Renovação / Upsell",
    icon: RefreshCw,
    color: "#8B5CF6",
  },
  {
    key: "feedback_followup" as const,
    label: "Feedback / NPS",
    icon: MessagesSquare,
    color: "#3B82F6",
  },
  {
    key: "churn_recovery" as const,
    label: "Win-back",
    icon: HeartHandshake,
    color: "#F59E0B",
  },
]

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100)

export default function CsLeadsPage() {
  return (
    <Suspense fallback={null}>
      <CsLeadsPageInner />
    </Suspense>
  )
}

function CsLeadsPageInner() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [drawerAction, setDrawerAction] = useState<"convert" | "edit" | null>(null)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Open drawer if ?lead=<id> in URL
  useEffect(() => {
    const leadParam = searchParams.get("lead")
    if (leadParam) setActiveLeadId(leadParam)
    const actionParam = searchParams.get("action")
    if (actionParam === "convert" || actionParam === "edit") {
      setDrawerAction(actionParam)
    } else {
      setDrawerAction(null)
    }
    const categoryParam = searchParams.get("category")
    if (categoryParam) setCategoryFilter(categoryParam)
  }, [searchParams])

  const params = new URLSearchParams()
  params.set("scope", "cs")
  if (categoryFilter) params.set("category", categoryFilter)
  if (debouncedSearch) params.set("search", debouncedSearch)
  if (statusFilter) params.set("status", statusFilter)
  params.set("limit", "100")

  const { data, isLoading, mutate } = useSWR<{
    leads: LeadRow[]
    total: number
    data?: { leads: LeadRow[]; total: number }
  }>(`/api/crm/leads?${params.toString()}`, fetcher)

  const leads = data?.data?.leads ?? data?.leads ?? []
  const total = data?.data?.total ?? data?.total ?? 0

  return (
    <CrmPageShell
      title="Leads de Customer Success"
      subtitle={`${total} ${total === 1 ? "entrada" : "entradas"} em triagem · alertas, oportunidades e feedback`}
      actions={
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--crm-space-2)",
          }}
        >
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
            }}
            onClick={() => setNewLeadOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo lead CS
          </button>
        </div>
      }
    >
      <div className="p-6">
        {/* Category tabs */}
        <div
          className="mb-4 flex flex-wrap items-center gap-1"
          style={{
            background: "var(--crm-gray-0)",
            padding: 4,
            border: "1px solid var(--crm-gray-200)",
            borderRadius: 6,
            width: "fit-content",
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon
            const active = categoryFilter === tab.key
            return (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => setCategoryFilter(tab.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  border: 0,
                  background: active ? "var(--crm-gray-100)" : "transparent",
                  color: active ? tab.color : "var(--crm-gray-600)",
                  cursor: "pointer",
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: tab.color }} />
                {tab.label}
              </button>
            )
          })}
        </div>

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
              placeholder="Buscar por loja, cliente, email..."
              aria-label="Buscar leads"
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
          {(debouncedSearch || statusFilter || categoryFilter) && (
            <span
              className="ml-auto"
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-500)",
              }}
              aria-live="polite"
            >
              {leads.length} {leads.length === 1 ? "resultado" : "resultados"}
            </span>
          )}
        </div>

        {isLoading ? (
          <PageSkeleton
            variant="list"
            showHeader={false}
            className="px-0 py-0"
          />
        ) : leads.length === 0 ? (
          <CrmEmptyState
            icon={<HeartHandshake className="h-5 w-5" />}
            title="Nenhum lead CS encontrado"
            description={
              search || statusFilter || categoryFilter
                ? "Ajuste os filtros para ver mais resultados."
                : "Quando o sistema flaggar uma loja em risco ou um cliente responder um NPS/health, ele aparece aqui."
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
            <table
              className="w-full"
              style={{ fontSize: "var(--crm-text-base)" }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--crm-gray-50)",
                    height: "var(--crm-table-header-height)",
                  }}
                >
                  <Th>LOJA / CLIENTE</Th>
                  <Th>CATEGORIA</Th>
                  <Th>HEALTH</Th>
                  <Th>MRR</Th>
                  <Th>STATUS</Th>
                  <Th>OWNER</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const cat = CATEGORY_TABS.find((c) => c.key === l.category)
                  const CatIcon = cat?.icon ?? UserPlus
                  return (
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
                      <td
                        className="px-3"
                        style={{
                          color: "var(--crm-gray-900)",
                          fontWeight: "var(--crm-weight-medium)",
                        }}
                      >
                        <div>{l.store?.store_name ?? l.name}</div>
                        {l.company && (
                          <div
                            style={{
                              fontSize: "var(--crm-text-xs)",
                              color: "var(--crm-gray-500)",
                              fontWeight: 400,
                            }}
                          >
                            {l.company}
                          </div>
                        )}
                      </td>
                      <td className="px-3">
                        <span
                          className="inline-flex items-center gap-1.5"
                          style={{
                            fontSize: "var(--crm-text-xs)",
                            color: cat?.color ?? "var(--crm-gray-500)",
                            fontWeight: 500,
                          }}
                        >
                          <CatIcon className="h-3 w-3" />
                          {cat?.label ?? "—"}
                        </span>
                      </td>
                      <td
                        className="px-3 tabular-nums"
                        style={{ color: "var(--crm-gray-700)" }}
                      >
                        {l.store?.health_score != null ? (
                          <span
                            style={{
                              fontWeight: 600,
                              color:
                                l.store.health_score < 50
                                  ? "#991B1B"
                                  : l.store.health_score < 70
                                    ? "#92400E"
                                    : "#065F46",
                            }}
                          >
                            {l.store.health_score}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="px-3 tabular-nums"
                        style={{
                          color: "var(--crm-gray-700)",
                          fontFamily: "var(--crm-font-mono)",
                        }}
                      >
                        {l.store?.mrr_cents != null && l.store.mrr_cents > 0
                          ? fmtBRL(l.store.mrr_cents)
                          : "—"}
                      </td>
                      <td className="px-3">
                        <span
                          style={{
                            fontSize: "var(--crm-text-xs)",
                            color:
                              STATUS_LABELS[l.status]?.color ||
                              "var(--crm-gray-500)",
                            fontWeight: "var(--crm-weight-medium)",
                          }}
                        >
                          {STATUS_LABELS[l.status]?.label || l.status}
                        </span>
                      </td>
                      <td
                        className="px-3"
                        style={{ color: "var(--crm-gray-700)" }}
                      >
                        {l.assignee?.name || "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
    </CrmPageShell>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left font-medium px-3"
      style={{
        color: "var(--crm-gray-600)",
        fontSize: "var(--crm-text-xs)",
      }}
    >
      {children}
    </th>
  )
}
