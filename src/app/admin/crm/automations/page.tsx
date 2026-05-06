"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Plus, Workflow, Power, PowerOff } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { ROUTES } from "@/lib/routes"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AutomationSummary {
  id: string
  name: string
  description: string | null
  scope: string | null
  is_active: boolean
  version: number
  trigger: { type?: string }
  updated_at: string
}

export default function CrmAutomationsListPage() {
  const { data, mutate } = useSWR<{ automations: AutomationSummary[] }>(
    "/api/crm/automations",
    fetcher,
  )

  const automations = data?.automations || []
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"sales" | "cs" | "internal" | "general">("general")
  const [submitting, setSubmitting] = useState(false)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/crm/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scope,
          is_active: false,
          trigger: { type: "deal_stage_change" },
          dag: {
            nodes: [
              {
                id: "trigger-1",
                type: "trigger",
                position: { x: 250, y: 50 },
                config: { trigger_type: "deal_stage_change" },
              },
            ],
            edges: [],
          },
        }),
      })
      const json = await res.json()
      if (json.id) {
        await mutate()
        setCreating(false)
        setName("")
        window.location.href = `/admin/crm/automations/${json.id}`
      }
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`/api/crm/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    })
    mutate()
  }

  return (
    <CrmPageShell
      title="Automacoes CRM"
      subtitle="DAGs versionadas com triggers, condicoes, acoes e AI Actions"
      actions={
        <button
          className="crm-button-primary"
          onClick={() => setCreating(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova automacao
        </button>
      }
    >
      <div className="p-6">
        {creating && (
          <form
            onSubmit={create}
            className="crm-card mb-4"
            style={{ maxWidth: 480 }}
          >
            <h3
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
                marginBottom: "var(--crm-space-3)",
              }}
            >
              Criar nova automacao
            </h3>
            <div className="space-y-3">
              <input
                className="crm-input w-full"
                placeholder="Nome da automacao"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
              <select
                className="crm-input w-full"
                value={scope}
                onChange={(e) => setScope(e.target.value as "sales" | "cs" | "internal" | "general")}
              >
                <option value="sales">Sales</option>
                <option value="cs">Customer Success</option>
                <option value="internal">Interno</option>
                <option value="general">Geral</option>
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" className="crm-button-ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="crm-button-primary"
                  disabled={submitting || !name.trim()}
                >
                  {submitting ? "Criando..." : "Criar e abrir builder"}
                </button>
              </div>
            </div>
          </form>
        )}

        {automations.length === 0 ? (
          <CrmEmptyState
            icon={<Workflow className="h-5 w-5" />}
            title="Nenhuma automacao criada"
            description="Crie automacoes para reagir a eventos como mudanca de etapa, criacao de lead ou nova mensagem."
          />
        ) : (
          <div className="space-y-2">
            {automations.map((a) => (
              <div key={a.id} className="crm-card flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <Link
                    href={ROUTES.ADMIN.CRM.AUTOMATIONS.DETAIL(a.id)}
                    style={{
                      fontSize: "var(--crm-text-md)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-900)",
                    }}
                    className="hover:underline"
                  >
                    {a.name}
                  </Link>
                  {a.description && (
                    <p
                      className="mt-0.5"
                      style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
                    >
                      {a.description}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-1"
                    style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
                  >
                    <span>{a.scope || "general"}</span>
                    <span>·</span>
                    <span>v{a.version}</span>
                    <span>·</span>
                    <span style={{ fontFamily: "var(--crm-font-mono)" }}>
                      {a.trigger?.type || "—"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(a.id, a.is_active)}
                  className="crm-button-ghost"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--crm-space-2)",
                    color: a.is_active ? "var(--crm-success-fg)" : "var(--crm-gray-500)",
                  }}
                >
                  {a.is_active ? (
                    <>
                      <Power className="h-3.5 w-3.5" />
                      Ativa
                    </>
                  ) : (
                    <>
                      <PowerOff className="h-3.5 w-3.5" />
                      Inativa
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}
