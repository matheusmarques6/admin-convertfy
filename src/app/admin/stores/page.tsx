import { Metadata } from "next"
import { Store } from "lucide-react"
import { StoresPageTabs } from "@/components/stores/stores-page-tabs"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"

export const metadata: Metadata = {
  title: "Lojas | Convertfy Admin",
  description: "Gerencie as lojas dos clientes, integrações e alertas",
}

export default function StoresControlPage() {
  return (
    <PagePermissionWrapper requiresStoreAccess>
      <div className="flex-1 space-y-6">
        <PageHeader
          icon={Store}
          title="Lojas"
          description="Gerencie lojas, integrações e acompanhe métricas"
        />

        <StoresPageTabs />
      </div>
    </PagePermissionWrapper>
  )
}
