import { Metadata } from "next"
import { Rocket, Clock, CheckCircle2 } from "lucide-react"
import { OnboardingKanban } from "@/components/onboarding/onboarding-kanban"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Acompanhe o processo de onboarding dos clientes",
}

export default function OnboardingPage() {
  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Onboarding</h1>
              <p className="text-zinc-400 text-sm">Gerencie o processo de implementação dos clientes</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-zinc-400">Arraste para mover entre etapas</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400">Conclusão agenda feedback em 30 dias</span>
          </div>
        </div>
      </div>

      {/* Onboarding Kanban */}
      <OnboardingKanban />
    </div>
  )
}
