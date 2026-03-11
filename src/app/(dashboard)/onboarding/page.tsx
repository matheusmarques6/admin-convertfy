import { Metadata } from "next"
import { Rocket, Clock, CheckCircle2 } from "lucide-react"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { OnboardingTabs } from "@/components/onboarding/onboarding-tabs"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Acompanhe o processo de onboarding dos clientes",
}

export default function OnboardingPage() {
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
            <p className="text-sm text-muted-foreground">Gerencie o processo de implementação dos clientes</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-muted-foreground">Arraste para mover entre etapas</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-muted-foreground">Conclusão agenda feedback em 30 dias</span>
          </div>
        </div>
      </div>

      {/* Onboarding Tabs */}
      <OnboardingTabs />
    </div>
    </PagePermissionWrapper>
  )
}
