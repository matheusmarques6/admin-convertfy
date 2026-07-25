import type { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import {
  OnboardingKanban,
  type OnboardingKanbanProps,
} from "@/components/onboarding-v2/onboarding-kanban"
import { invokeRouteJson } from "@/lib/api/invoke-route"
import { GET as getOnboardings } from "@/app/api/onboardings/route"
import { GET as getOrgMembers } from "@/app/api/admin/org-members/route"
import { GET as getMePermissions } from "@/app/api/me/permissions/route"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Pipeline operacional de onboarding (7 colunas)",
}

export const dynamic = "force-dynamic"

/**
 * RSC casca: pré-carrega os 3 payloads que o kanban busca no mount
 * (invocando os próprios handlers in-process — byte-idênticos) e entrega
 * como initialData. Falha em qualquer um → null → o kanban busca via SWR
 * como antes. Mutations/refreshes continuam batendo nas rotas.
 */
export default async function OnboardingPage() {
  const [initialOnboardings, initialMembers, initialMe] = await Promise.all([
    invokeRouteJson(getOnboardings, "/api/onboardings"),
    invokeRouteJson(getOrgMembers, "/api/admin/org-members"),
    invokeRouteJson(getMePermissions, "/api/me/permissions"),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
      <div className="h-[calc(100dvh-3.5rem)]">
        <OnboardingKanban
          initialOnboardings={
            initialOnboardings as OnboardingKanbanProps["initialOnboardings"]
          }
          initialMembers={initialMembers as OnboardingKanbanProps["initialMembers"]}
          initialMe={initialMe as OnboardingKanbanProps["initialMe"]}
        />
      </div>
    </PagePermissionWrapper>
  )
}
