import { Metadata } from "next"
import { Rocket, Clock, CheckCircle2 } from "lucide-react"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { OnboardingTabs } from "@/components/onboarding/onboarding-tabs"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Acompanhe o processo de onboarding dos clientes",
}

export default function OnboardingPage() {
  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
    <div className="flex-1 space-y-6">
      <PageHeader
        icon={Rocket}
        title="Onboarding"
        description="Gerencie o processo de implementação dos clientes"
        actions={
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground">Arraste para mover entre etapas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-muted-foreground">Conclusão agenda feedback em 30 dias</span>
            </div>
          </div>
        }
      />

      {/* Onboarding Tabs */}
      <OnboardingTabs />
    </div>
    </PagePermissionWrapper>
  )
}
