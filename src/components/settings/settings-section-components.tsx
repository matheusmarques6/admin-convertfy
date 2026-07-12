"use client"

/**
 * Mapa key → componente de cada seção "component" do registry
 * (settings-sections.ts). Separado do registry porque next/dynamic com
 * ssr:false não pode ser avaliado em módulo importado por RSC (o hub
 * importa só os metadados). Cada seção é lazy: o modal baixa apenas o
 * chunk da seção aberta.
 */

import dynamic from "next/dynamic"
import type { ComponentType } from "react"
import { PageSkeleton } from "@/components/ui/page-skeleton"

const loading = () => (
  <PageSkeleton variant="list" showHeader={false} className="px-0 py-0" />
)

export const SETTINGS_SECTION_COMPONENTS: Record<string, ComponentType> = {
  account: dynamic(
    () => import("./sections/account").then((m) => ({ default: m.AccountSection })),
    { ssr: false, loading },
  ),
  preferences: dynamic(
    () => import("./sections/preferences").then((m) => ({ default: m.PreferencesSection })),
    { ssr: false, loading },
  ),
  team: dynamic(
    () => import("./sections/team").then((m) => ({ default: m.TeamSection })),
    { ssr: false, loading },
  ),
  customize: dynamic(
    () => import("./sections/customize").then((m) => ({ default: m.CustomizeSection })),
    { ssr: false, loading },
  ),
  integrations: dynamic(
    () => import("./sections/integrations").then((m) => ({ default: m.IntegrationsSection })),
    { ssr: false, loading },
  ),
  briefings: dynamic(
    () => import("./sections/briefings").then((m) => ({ default: m.BriefingsSection })),
    { ssr: false, loading },
  ),
  "ai-templates": dynamic(
    () => import("./sections/ai-templates").then((m) => ({ default: m.AiTemplatesSection })),
    { ssr: false, loading },
  ),
  "campaign-central": dynamic(
    () =>
      import("@/components/campaign-central-settings/settings-form").then((m) => ({
        default: m.CampaignCentralSettingsForm,
      })),
    { ssr: false, loading },
  ),
  implementation: dynamic(
    () => import("./sections/implementation").then((m) => ({ default: m.ImplementationSection })),
    { ssr: false, loading },
  ),
  "whatsapp-qr": dynamic(
    () => import("./sections/whatsapp-qr").then((m) => ({ default: m.WhatsAppQrSection })),
    { ssr: false, loading },
  ),
  "custom-fields": dynamic(
    () => import("./sections/custom-fields").then((m) => ({ default: m.CustomFieldsSection })),
    { ssr: false, loading },
  ),
  manutencao: dynamic(
    () =>
      import("@/app/admin/settings/manutencao/manutencao-client").then((m) => ({
        default: m.ManutencaoClient,
      })),
    { ssr: false, loading },
  ),
}
