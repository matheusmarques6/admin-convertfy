import { Metadata } from "next"
import { Store, TrendingUp, Phone } from "lucide-react"
import { StoresPageTabs } from "@/components/stores/stores-page-tabs"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const metadata: Metadata = {
  title: "Controle de Lojas | Convertfy Admin",
  description: "Acompanhe os resultados e calls de feedback das lojas dos clientes",
}

export default function StoresControlPage() {
  return (
    <PagePermissionWrapper requiresStoreAccess>
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Store className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Controle de Lojas</h1>
            <p className="text-muted-foreground text-sm">Acompanhe resultados e gerencie calls de feedback</p>
          </div>
        </div>

        {/* Stores Tabs: Lojas + Alertas */}
        <StoresPageTabs />
      </div>
    </PagePermissionWrapper>
  )
}
