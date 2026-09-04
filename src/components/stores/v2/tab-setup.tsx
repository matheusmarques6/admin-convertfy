"use client"

/**
 * Tab: Setup — mirror exato do prototype tab-setup.jsx.
 *
 * Grid 2-col: minmax(0,1fr) 380px.
 *
 * Left:
 *  - Section "Integrações" com 2 botões direita (Sincronizar agora, Revalidar)
 *    + grid 2-col de IntegCard (ChannelIcon 32px + nome/status + actions)
 *  - Section "Progresso do onboarding" com 6 OnbStep (timeline vertical
 *    com numero/check, ring brand ativo, conector verde quando done)
 *  - Section "Formulário de onboarding" com FormSummary (progress bar +
 *    4 mini-cards check verde + nome + N campos)
 *
 * Right:
 *  - Section "Link de acesso do cliente" com input mono + Btn ghost Copiar
 *  - Section "Dados pessoais do cliente" com KVs
 *  - Section "Dados da loja" com KVs
 *  - Section "Contrato" com KVs
 *
 * Reusa IntegrationsPanel/OnboardingStepper/StoreFormTab quando dados
 * complexos (modal config, persistência) — mas wrapped em Section.
 */

import { useState } from "react"
import Link from "next/link"
import { Check, Zap, Link2, Paperclip, Pencil } from "lucide-react"
import { IntegrationsPanel } from "@/components/stores/integrations-panel"
import { StoreMcpPanel } from "@/components/stores/store-mcp-panel"
import { OnboardingStepper } from "@/components/stores/onboarding-stepper"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { useStoreOverview } from "@/lib/hooks/use-store-overview"
import { PLATFORMS, COUNTRIES } from "@/lib/constants/onboarding"
import { currencySymbol } from "@/lib/constants/currencies"
import { languageCodeToLabel } from "@/lib/i18n/store-language"
import { Section, Badge, Btn, KV, C, TNUM, ChannelIcon } from "./_primitives"
import { StoreSetupEditDialog } from "./store-setup-edit-dialog"

interface SetupData {
  store_name?: string
  store_url?: string | null
  platform?: string | null
  country?: string | null
  language?: string | null
  currency?: string | null
  niche?: string | null
  mrr_cents?: number | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  alert_revenue_threshold?: number | null
  client_id?: string | null
  clients?: { id?: string; name?: string; email?: string; phone?: string; cpf_cnpj?: string; company?: string } | null
}

export function TabSetup({ storeId }: { storeId: string }) {
  const { data: overview, mutate } = useStoreOverview(storeId)
  const data = (overview?.store ?? {}) as SetupData
  const [edit, setEdit] = useState<"loja" | "contrato" | null>(null)
  const platformLabel = PLATFORMS.find((p) => p.value === data.platform)?.label ?? data.platform
  const countryLabel = COUNTRIES.find((c) => c.value === data.country)?.label ?? data.country
  const languageLabel = languageCodeToLabel(data.language) ?? data.language
  const editBtn = (section: "loja" | "contrato") => (
    <Btn variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(section)}>
      Editar
    </Btn>
  )

  // Credentials/integration status pra contar configuradas
  const status = (overview?.status ?? {}) as Record<string, { connected: boolean }>
  const integrationKeys = ["shopify", "klaviyo", "omnisend", "ga4", "meta", "google_ads"]
  const configured = integrationKeys.filter((k) => status[k]?.connected).length
  const completePct = Math.round((configured / integrationKeys.length) * 100)

  const client = data.clients ?? {}
  const clientLink = typeof window !== "undefined"
    ? `${window.location.origin}/cliente/onboarding`
    : "https://app.convertfy.me/cliente/onboarding"

  const formatMRR = (cents?: number | null) =>
    cents ? `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
      {/* LEFT */}
      <div>
        <Section
          title="Integrações"
          subtitle={`${configured} de ${integrationKeys.length} plataformas configuradas · credenciais criptografadas (AES-256-GCM)`}
          right={
            <div className="flex gap-2">
              <Btn variant="secondary" size="sm" icon={<Zap className="h-3.5 w-3.5" />}>Sincronizar agora</Btn>
              <Btn variant="secondary" size="sm" icon={<Check className="h-3.5 w-3.5" />}>Revalidar todas</Btn>
            </div>
          }
        >
          <IntegrationsPanel storeId={storeId} storeUrl={data.store_url} />
        </Section>

        <Section
          title="MCP da loja"
          subtitle="O que a ConvertIA consulta e executa nesta loja — conectores das credenciais acima + servidores MCP próprios"
        >
          <StoreMcpPanel storeId={storeId} status={status} />
        </Section>

        <Section
          title="Progresso do onboarding"
          subtitle="6 etapas · acompanhe cada fase"
          right={<Badge tone="info">{completePct}% completo</Badge>}
        >
          <OnboardingStepper storeId={storeId} />
        </Section>

        <Section
          title="Respostas do formulário de onboarding"
          subtitle="Preenchido pelo cliente"
        >
          <StoreFormTab storeId={storeId} clientId={data.client_id ?? null} />
        </Section>
      </div>

      {/* RIGHT */}
      <div>
        <Section title="Link de acesso do cliente">
          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-[6px]"
            style={{ background: C.g50, border: `1px solid ${C.border}` }}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: C.g400 }} />
            <input
              readOnly
              value={clientLink}
              className="flex-1 min-w-0 text-[12px] bg-transparent outline-none truncate"
              style={{ color: C.g700, ...TNUM }}
            />
            <Btn
              variant="ghost"
              size="sm"
              icon={<Paperclip className="h-3.5 w-3.5" />}
              onClick={() => navigator.clipboard.writeText(clientLink)}
            >
              Copiar
            </Btn>
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: C.g500 }}>
            O cliente acessa este link para preencher o briefing. Você pode editar qualquer campo abaixo.
          </div>
        </Section>

        <Section
          title="Dados pessoais do cliente"
          right={
            data.client_id ? (
              <Link
                href={`/admin/clients/${data.client_id}`}
                className="text-[12px] font-medium"
                style={{ color: C.g600 }}
              >
                Editar no cliente →
              </Link>
            ) : undefined
          }
        >
          <KV label="Nome" value={client.name ?? "—"} mute={!client.name} />
          <KV label="Empresa" value={client.company ?? "—"} mute={!client.company} />
          <KV label="Email" value={client.email ?? "—"} mono mute={!client.email} />
          <KV label="Telefone" value={client.phone ?? "—"} mono mute={!client.phone} />
          <KV label="CPF/CNPJ" value={client.cpf_cnpj ?? "—"} mono mute={!client.cpf_cnpj} />
        </Section>

        <Section title="Dados da loja" right={editBtn("loja")}>
          <KV label="Nome" value={data.store_name ?? "—"} mute={!data.store_name} />
          <KV label="URL" value={data.store_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "—"} mono mute={!data.store_url} />
          <KV label="Plataforma" value={platformLabel ?? "—"} mute={!data.platform} />
          <KV label="País" value={countryLabel ?? "—"} mute={!data.country} />
          <KV label="Idioma" value={languageLabel ?? "—"} mute={!data.language} />
          <KV
            label="Moeda"
            value={data.currency ? `${data.currency} · ${currencySymbol(data.currency)}` : "—"}
            mono
            mute={!data.currency}
          />
          <KV label="Nicho" value={data.niche ?? "—"} mute={!data.niche} />
        </Section>

        <Section title="Contrato" right={editBtn("contrato")}>
          <KV label="MRR" value={formatMRR(data.mrr_cents)} mono mute={!data.mrr_cents} />
          <KV
            label="Vigência"
            value={
              data.contract_start_date
                ? `${new Date(data.contract_start_date).toLocaleDateString("pt-BR")} → ${data.contract_end_date ? new Date(data.contract_end_date).toLocaleDateString("pt-BR") : "—"}`
                : "—"
            }
            mono
            mute={!data.contract_start_date}
          />
          <KV
            label="Alerta de receita"
            value={data.alert_revenue_threshold ? `R$ ${data.alert_revenue_threshold.toLocaleString("pt-BR")}` : "—"}
            mono
            mute={!data.alert_revenue_threshold}
          />
        </Section>
      </div>

      <StoreSetupEditDialog
        storeId={storeId}
        open={edit !== null}
        section={edit ?? "loja"}
        initial={data}
        onOpenChange={(open) => !open && setEdit(null)}
        onSaved={() => mutate()}
      />
    </div>
  )
}

// Re-export utility for old imports
export { ChannelIcon }
