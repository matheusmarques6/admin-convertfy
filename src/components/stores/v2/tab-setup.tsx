"use client"

/**
 * Aba Setup — Integrações em cards, progresso do onboarding em timeline,
 * resumo do formulário do cliente, dados de loja e contrato.
 *
 * Reaproveita logica do IntegrationsPanel existente quando possivel.
 */

import { useEffect, useState } from "react"
import { CheckCircle2, Circle, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

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
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  client_cpf_cnpj?: string | null
  shopify_validated_at?: string | null
  klaviyo_validated_at?: string | null
  omnisend_validated_at?: string | null
  ga4_property_id?: string | null
  meta_ad_account_id?: string | null
  niche?: string | null
  target_audience?: string | null
}

const INTEGRATIONS = [
  { key: "shopify", label: "Shopify", validatedKey: "shopify_validated_at" },
  { key: "klaviyo", label: "Klaviyo", validatedKey: "klaviyo_validated_at" },
  { key: "omnisend", label: "Omnisend", validatedKey: "omnisend_validated_at" },
  { key: "ga4", label: "Google Analytics 4", validatedKey: "ga4_property_id" },
  { key: "meta", label: "Meta Ads", validatedKey: "meta_ad_account_id" },
] as const

const ONBOARDING_STEPS = [
  { key: "kickoff", label: "Kickoff e contrato", description: "Documentação e início" },
  { key: "credentials", label: "Credenciais coletadas", description: "Shopify, Klaviyo, GA4, Meta" },
  { key: "audit", label: "Auditoria inicial", description: "Análise do estado atual" },
  { key: "design", label: "Design dos fluxos", description: "Welcome, Cart, Win-back" },
  { key: "live", label: "Fluxos ao vivo", description: "Publicados no Klaviyo/Omnisend" },
  { key: "feedback", label: "Primeiro feedback 30d", description: "Apresentação de resultados" },
] as const

export function TabSetup({ storeId }: { storeId: string }) {
  const [data, setData] = useState<SetupData>({})

  useEffect(() => {
    fetch(`/api/client-stores/${storeId}`)
      .then((r) => r.json())
      .then((j) => setData((j.data?.store ?? j.store ?? j) as SetupData))
      .catch(() => setData({}))
  }, [storeId])

  const integrationsConnected = INTEGRATIONS.filter((i) => data[i.validatedKey as keyof SetupData]).length

  // Progresso baseado em integracoes + onboarding tarefas (placeholder)
  const onboardingDone = 4 // mock — deveria vir da pipeline
  const totalSteps = ONBOARDING_STEPS.length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* MAIN */}
      <div className="flex flex-col gap-4">
        {/* Integrações */}
        <Card title="Integrações" subtitle={`${integrationsConnected} de ${INTEGRATIONS.length} configuradas`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INTEGRATIONS.map((i) => {
              const validated = data[i.validatedKey as keyof SetupData]
              return (
                <div
                  key={i.key}
                  className="flex items-center justify-between gap-3 p-3 border rounded-md"
                  style={{ borderColor: "rgba(0,0,0,0.06)" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center font-bold text-white shrink-0"
                      style={{ background: validated ? "#10B981" : "#9CA3AF" }}
                    >
                      {i.label[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-slate-900 leading-tight">{i.label}</div>
                      <div className={cn(
                        "text-[10.5px] font-medium uppercase tracking-wider",
                        validated ? "text-emerald-600" : "text-slate-400",
                      )}>
                        {validated ? "● Conectado" : "Não configurado"}
                      </div>
                    </div>
                  </div>
                  <button className="text-[11px] font-semibold text-brand-600 hover:underline shrink-0 inline-flex items-center gap-0.5">
                    {validated ? "Configurar" : "Conectar"} <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Progresso do onboarding */}
        <Card title="Progresso do onboarding" subtitle={`${onboardingDone} de ${totalSteps} etapas concluídas`}>
          <div className="flex flex-col gap-1">
            {ONBOARDING_STEPS.map((s, idx) => {
              const done = idx < onboardingDone
              const active = idx === onboardingDone
              return (
                <div key={s.key} className="flex items-start gap-3 py-2">
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center",
                        done && "bg-emerald-500",
                        active && "bg-brand-50 border-2 border-brand-500",
                        !done && !active && "bg-slate-100 border border-slate-200",
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      ) : active ? (
                        <span className="text-[11px] font-bold text-brand-600">{idx + 1}</span>
                      ) : (
                        <Circle className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                    {idx < ONBOARDING_STEPS.length - 1 && (
                      <div
                        className="absolute left-1/2 top-6 -translate-x-1/2 w-0.5 h-6"
                        style={{ background: done ? "#10B981" : "#E5E7EB" }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-3">
                    <div className={cn(
                      "text-[13px] font-semibold leading-tight",
                      done ? "text-slate-900" : active ? "text-brand-700" : "text-slate-500",
                    )}>
                      {s.label}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Resumo do formulário */}
        <Card title="Respostas do formulário de onboarding">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormSummaryCard label="Nicho" value={data.niche ?? "—"} />
            <FormSummaryCard label="País" value={data.country ?? "—"} />
            <FormSummaryCard label="Idioma" value={data.language ?? "—"} />
            <FormSummaryCard label="Moeda" value={data.currency ?? "—"} />
          </div>
        </Card>
      </div>

      {/* SIDEBAR */}
      <div className="flex flex-col gap-4">
        {/* Link de acesso do cliente */}
        <Card title="Link do cliente">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`https://app.convertfy.me/cliente/${storeId}`}
              className="flex-1 h-8 px-2 text-[11px] rounded-md border bg-slate-50 font-mono outline-none"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            />
            <button
              onClick={() => navigator.clipboard.writeText(`https://app.convertfy.me/cliente/${storeId}`)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200"
              title="Copiar"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>
        </Card>

        {/* Cliente */}
        <Card title="Cliente">
          <DataRow label="Nome" value={data.client_name} />
          <DataRow label="Email" value={data.client_email} />
          <DataRow label="Telefone" value={data.client_phone} />
          <DataRow label="CPF/CNPJ" value={data.client_cpf_cnpj} />
        </Card>

        {/* Dados da loja */}
        <Card title="Loja">
          <DataRow label="URL" value={data.store_url} link />
          <DataRow label="Plataforma" value={data.platform} />
          <DataRow label="País" value={data.country} />
          <DataRow label="Idioma" value={data.language} />
          <DataRow label="Moeda" value={data.currency} />
        </Card>

        {/* Contrato */}
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

function FormSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 border px-3 py-2.5" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[12.5px] font-semibold text-slate-900 truncate">{value}</div>
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
