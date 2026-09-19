"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import dynamic from "next/dynamic"
import { ArrowLeft, Save, Power, PowerOff, Play } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { ROUTES } from "@/lib/routes"
import type { CrmAutomationDAG } from "@/types/crm-automation"

const AutomationBuilder = dynamic(
  () => import("@/components/crm/automation-builder").then((mod) => ({ default: mod.AutomationBuilder })),
  {
    loading: () => (
      <div
        className="p-6"
        style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
      >
        Carregando builder...
      </div>
    ),
    ssr: false,
  }
)

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AutomationDetail {
  automation: {
    id: string
    name: string
    description: string | null
    scope: string | null
    is_active: boolean
    version: number
    dag: CrmAutomationDAG
    trigger: { type?: string }
  }
  runs: Array<{
    id: string
    status: string
    trigger_type: string
    started_at: string | null
    completed_at: string | null
    error_message: string | null
  }>
}

export default function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data, mutate } = useSWR<AutomationDetail>(
    `/api/crm/automations/${id}`,
    fetcher,
  )

  const detail = data
  const [dag, setDag] = useState<CrmAutomationDAG | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (detail) {
      setDag(detail.automation.dag)
      setName(detail.automation.name)
    }
  }, [detail])

  const save = async () => {
    if (!dag) return
    setSaving(true)
    try {
      await fetch(`/api/crm/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dag }),
      })
      mutate()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    if (!detail) return
    await fetch(`/api/crm/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !detail.automation.is_active }),
    })
    mutate()
  }

  const triggerRun = async () => {
    setRunning(true)
    try {
      const res = await fetch(`/api/crm/automations/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_data: { source: "manual_test" } }),
      })
      const json = await res.json()
      if (json.run_id) {
        mutate()
        alert(`Run executado: status=${json.status}`)
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <CrmPageShell
      title={detail?.automation.name || "Carregando..."}
      subtitle={
        detail
          ? `v${detail.automation.version} · ${detail.automation.scope} · ${detail.automation.is_active ? "Ativa" : "Inativa"}`
          : undefined
      }
      actions={
        <>
          <Link
            href={ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST}
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <button
            onClick={triggerRun}
            disabled={!detail || running}
            className="crm-button-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              opacity: !detail || running ? 0.5 : 1,
            }}
          >
            <Play className="h-3.5 w-3.5" />
            {running ? "Executando..." : "Test run"}
          </button>
          <button
            onClick={toggleActive}
            disabled={!detail}
            className="crm-button-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              color: detail?.automation.is_active ? "var(--crm-success-fg)" : "var(--crm-gray-500)",
            }}
          >
            {detail?.automation.is_active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
            {detail?.automation.is_active ? "Ativa" : "Inativa"}
          </button>
          <button
            onClick={save}
            disabled={!detail || saving || !dag}
            className="crm-button-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              opacity: !detail || saving || !dag ? 0.5 : 1,
            }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      {/* Altura do canvas: no mobile reserva topbar (56px) + header do shell
          que pode quebrar em 2 linhas; no desktop mantém 100dvh - 2 topbars. */}
      <div className="h-[calc(100dvh-160px)] min-h-[420px] md:h-[calc(100dvh-88px)]">
        {detail && dag ? (
          <AutomationBuilder initialDag={dag} onChange={setDag} />
        ) : (
          <div
            className="p-6"
            style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
          >
            Carregando builder...
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}
