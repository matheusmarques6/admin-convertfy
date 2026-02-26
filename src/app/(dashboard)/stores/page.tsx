import { Metadata } from "next"
import { StoresPageTabs } from "@/components/stores/stores-page-tabs"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const metadata: Metadata = {
  title: "Controle de Lojas | Convertfy Admin",
  description: "Acompanhe os resultados e calls de feedback das lojas dos clientes",
}

export default function StoresControlPage() {
  return (
    <PagePermissionWrapper requiresStoreAccess>
    <div className="flex-1 space-y-6 p-6">
      {/* Stores Tabs: Lojas + Alertas */}
      <StoresPageTabs />
    </div>
    </PagePermissionWrapper>
  )
}
