import type { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { TutorialPageEditor } from "@/components/onboarding-v2/tutorial-page-editor"

export const metadata: Metadata = {
  title: "Editar tutorial | Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default async function TutorialEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control"]}>
      <TutorialPageEditor id={id} />
    </PagePermissionWrapper>
  )
}
