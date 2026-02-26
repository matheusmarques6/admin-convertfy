import { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { OnboardingTabs } from "@/components/onboarding/onboarding-tabs"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Acompanhe o processo de onboarding dos clientes",
}

export default function OnboardingPage() {
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
    <div className="flex-1 space-y-6 p-6">
      {/* Onboarding Tabs */}
      <OnboardingTabs />
    </div>
    </PagePermissionWrapper>
  )
}
