import { Metadata } from "next"
import { Store } from "lucide-react"
import { StoresPageTabs } from "@/components/stores/stores-page-tabs"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"

export const metadata: Metadata = {
  title: "Controle de Lojas | Convertfy Admin",
  description: "Acompanhe os resultados e calls de feedback das lojas dos clientes",
}

export default function StoresControlPage() {
  return (
    <PagePermissionWrapper requiresStoreAccess>
      <div className="flex-1 space-y-6">
        <PageHeader
          icon={Store}
          title="Controle de Lojas"
          description="Acompanhe resultados e gerencie calls de feedback"
        />

        {/* Stores Tabs: Lojas + Alertas */}
        <StoresPageTabs />
      </div>
    </PagePermissionWrapper>
  )
}
