import type { Metadata } from "next"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { MyTasksClient } from "@/components/onboarding-v2/my-tasks-client"

export const metadata: Metadata = {
  title: "Minhas tarefas | Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default function MyTasksPage() {
  return (
    <PagePermissionWrapper>
      <MyTasksClient />
    </PagePermissionWrapper>
  )
}
