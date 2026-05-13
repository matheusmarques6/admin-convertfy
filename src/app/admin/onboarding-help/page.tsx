import type { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { TutorialPagesList } from "@/components/onboarding-v2/tutorial-pages-list"

export const metadata: Metadata = {
  title: "Tutorial do cliente | Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default function TutorialListPage() {
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control"]}>
      <TutorialPagesList />
    </PagePermissionWrapper>
  )
}
