import type { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { OnboardingDetailClient } from "@/components/onboarding-v2/onboarding-detail-client"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
      <OnboardingDetailClient id={id} />
    </PagePermissionWrapper>
  )
}
