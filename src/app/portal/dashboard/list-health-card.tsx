import { Shield } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"

interface ListHealthCardProps {
  bounceRate: number
  unsubscribeRate: number
}

export function ListHealthCard({ bounceRate, unsubscribeRate }: ListHealthCardProps) {
  // Score calculation: lower bounce + unsub = healthier
  // Healthy: bounce < 2% and unsub < 0.5% → score > 80%
  // Attention: bounce 2-5% or unsub 0.5-1% → score 50-80%
  // Critical: bounce > 5% or unsub > 1% → score < 50%
  const bounceScore = Math.max(0, 100 - (bounceRate * 20)) // 5% bounce = 0 score
  const unsubScore = Math.max(0, 100 - (unsubscribeRate * 100)) // 1% unsub = 0 score
  const score = Math.round((bounceScore * 0.5 + unsubScore * 0.5))

  const status = score > 80
    ? { label: "Tudo certo", color: "text-success", ringColor: "stroke-success", bgColor: "bg-success/10", glowColor: "success" as const }
    : score > 50
      ? { label: "Requer atenção", color: "text-warning", ringColor: "stroke-warning", bgColor: "bg-warning/10", glowColor: "warning" as const }
      : { label: "Ação necessária", color: "text-destructive", ringColor: "stroke-destructive", bgColor: "bg-destructive/10", glowColor: "destructive" as const }

  // SVG circle progress
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <GlowCard color={status.glowColor} intensity="subtle" surfaceClassName="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Saúde da Lista</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Circle Progress */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              className="stroke-muted"
              strokeWidth="6"
            />
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              className={status.ringColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${status.color}`}>{score}%</span>
          </div>
        </div>

        <div className="flex-1">
          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color} mb-2`}>
            {status.label}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bounce rate</span>
              <span className="text-foreground">{bounceRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Unsub rate</span>
              <span className="text-foreground">{unsubscribeRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </GlowCard>
  )
}
