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
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-convertfy-purple to-convertfy-blue flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <p className="text-muted-foreground text-sm">Acompanhe resultados e gerencie calls de feedback</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-muted-foreground">Resultado = Receita Klaviyo / Faturamento Total</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-violet-400" />
            <span className="text-muted-foreground">Calls de alinhamento mensais</span>
          </div>
        </div>
      </div>

      {/* Stores Tabs: Lojas + Alertas */}
      <StoresPageTabs />
    </div>
    </PagePermissionWrapper>
  )
}
