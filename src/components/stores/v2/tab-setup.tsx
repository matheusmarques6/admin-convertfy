"use client"

/**
 * Aba Setup — Integrações, onboarding e formulário do cliente.
 *
 * Reusa os componentes legados ja validados:
 *  - IntegrationsPanel: cards de integracoes com revalidacao real
 *  - OnboardingStepper: fases do onboarding com estados pending/in-progress/done
 *  - StoreFormTab: respostas do formulario de onboarding da loja
 *
 * Sidebar leve com link do cliente, dados da loja e contrato.
 */

import { useEffect, useState } from "react"
import { Copy } from "lucide-react"
import { IntegrationsPanel } from "@/components/stores/integrations-panel"
import { OnboardingStepper } from "@/components/stores/onboarding-stepper"
import { StoreFormTab } from "@/components/stores/store-form-tab"

interface SetupData {
  store_name?: string
  store_url?: string | null
  platform?: string | null
  country?: string | null
  language?: string | null
  currency?: string | null
  mrr_cents?: number | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  alert_revenue_threshold?: number | null
  client_id?: string | null
  clients?: { name?: string; email?: string; phone?: string; cpf_cnpj?: string } | null
}

export function TabSetup({ storeId }: { storeId: string }) {
  const [data, setData] = useState<SetupData>({})

  useEffect(() => {
    fetch(`/api/client-stores/${storeId}`)
      .then((r) => r.json())
      .then((j) => setData((j.data?.store ?? j.store ?? j) as SetupData))
      .catch(() => setData({}))
  }, [storeId])

  const clientName = data.clients?.name ?? null
  const clientEmail = data.clients?.email ?? null
  const clientPhone = data.clients?.phone ?? null
  const clientDoc = data.clients?.cpf_cnpj ?? null
  const clientLink = `${typeof window !== "undefined" ? window.location.origin : "https://app.convertfy.me"}/cliente/${storeId}`

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* MAIN */}
      <div className="flex flex-col gap-4">
        {/* Integrações reais */}
        <Card title="Integrações" subtitle="Conexões com plataformas externas">
          <IntegrationsPanel storeId={storeId} storeUrl={data.store_url} />
        </Card>

        {/* Onboarding real */}
        <Card title="Progresso do onboarding" subtitle="Fases do projeto">
          <OnboardingStepper storeId={storeId} />
        </Card>

        {/* Formulário real */}
        <Card title="Formulário do cliente" subtitle="Respostas do briefing inicial">
          <StoreFormTab storeId={storeId} clientId={data.client_id ?? null} />
        </Card>
      </div>

      {/* SIDEBAR */}
      <div className="flex flex-col gap-4">
        <Card title="Link do cliente">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={clientLink}
              className="flex-1 h-8 px-2 text-[11px] rounded-md border bg-slate-50 font-mono outline-none"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            />
            <button
              onClick={() => navigator.clipboard.writeText(clientLink)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200"
              title="Copiar"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>
        </Card>

        <Card title="Cliente">
          <DataRow label="Nome" value={clientName} />
          <DataRow label="Email" value={clientEmail} />
          <DataRow label="Telefone" value={clientPhone} />
          <DataRow label="CPF/CNPJ" value={clientDoc} />
        </Card>

        <Card title="Loja">
          <DataRow label="URL" value={data.store_url} link />
          <DataRow label="Plataforma" value={data.platform} />
          <DataRow label="País" value={data.country} />
          <DataRow label="Idioma" value={data.language} />
          <DataRow label="Moeda" value={data.currency} />
        </Card>

        <Card title="Contrato">
          <DataRow label="MRR" value={data.mrr_cents ? `R$ ${(data.mrr_cents / 100).toFixed(0)}` : null} />
          <DataRow label="Início" value={data.contract_start_date ? new Date(data.contract_start_date).toLocaleDateString("pt-BR") : null} />
          <DataRow label="Fim" value={data.contract_end_date ? new Date(data.contract_end_date).toLocaleDateString("pt-BR") : null} />
          <DataRow label="Alerta receita" value={data.alert_revenue_threshold ? `R$ ${data.alert_revenue_threshold.toLocaleString("pt-BR")}` : null} />
        </Card>
      </div>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="mb-3">
        <h3 className="text-[13px] font-bold text-slate-900 m-0">{title}</h3>
        {subtitle && <p className="text-[11.5px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-[11.5px]">
      <span className="text-slate-500 shrink-0">{label}</span>
      {value ? (
        link ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-right truncate max-w-[60%]">
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-slate-800 font-medium text-right truncate max-w-[60%]">{value}</span>
        )
      ) : (
        <span className="text-slate-400 italic">—</span>
      )}
    </div>
  )
}
