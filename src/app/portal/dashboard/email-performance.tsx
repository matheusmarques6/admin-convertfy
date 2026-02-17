import {
  Mail,
  Eye,
  MousePointerClick,
  Target,
  AlertCircle,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlowCard } from "@/components/ui/glow-card"
import { formatNumber } from "@/lib/utils/format"
import { MiniBarChart } from "./components"
import type { KlaviyoData } from "./types"

interface EmailPerformanceProps {
  klaviyo?: KlaviyoData
}

export function EmailPerformance({ klaviyo }: EmailPerformanceProps) {
  return (
    <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-info" />
          Email Performance
        </h3>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 px-2">
          Email <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xl font-bold text-foreground">{formatNumber(klaviyo?.delivered || 0)}</p>
          <p className="text-xs text-muted-foreground">Entregues</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xl font-bold text-foreground">{formatNumber(klaviyo?.opened || 0)}</p>
          <p className="text-xs text-muted-foreground">Abertos</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xl font-bold text-foreground">{formatNumber(klaviyo?.clicked || 0)}</p>
          <p className="text-xs text-muted-foreground">Clicados</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" /> Open Rate
            </span>
          </div>
          <MiniBarChart value={klaviyo?.openRate || 0} max={100} color="bg-emerald-500" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> Click Rate
            </span>
          </div>
          <MiniBarChart value={klaviyo?.clickRate || 0} max={20} color="bg-blue-500" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> CTOR
            </span>
          </div>
          <MiniBarChart value={klaviyo?.clickToOpenRate || 0} max={30} color="bg-amber-500" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Bounce
            </span>
          </div>
          <MiniBarChart value={klaviyo?.bounceRate || 0} max={5} color="bg-red-500" />
        </div>
      </div>
    </GlowCard>
  )
}
