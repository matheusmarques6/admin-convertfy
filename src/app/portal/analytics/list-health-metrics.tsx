import { Shield, Users, MailOpen, MousePointerClick, UserMinus, Send } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatNumber } from "@/lib/utils/format"
import type { KlaviyoData } from "../dashboard/types"

interface ListHealthMetricsProps {
  klaviyo?: KlaviyoData
}

function getStatusColor(value: number, thresholds: { good: number; warn: number; inverse?: boolean }) {
  const { good, warn, inverse } = thresholds
  if (inverse) {
    if (value <= good) return "text-success"
    if (value <= warn) return "text-warning"
    return "text-destructive"
  }
  if (value >= good) return "text-success"
  if (value >= warn) return "text-warning"
  return "text-destructive"
}

function MetricRow({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  colorClass: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-bold ${colorClass}`}>{value}</span>
    </div>
  )
}

export function ListHealthMetrics({ klaviyo }: ListHealthMetricsProps) {
  const totalLeads = klaviyo?.totalLeads || 0
  const engagementRate = klaviyo?.engagementRate || 0
  const openRate = klaviyo?.openRate || 0
  const clickRate = klaviyo?.clickRate || 0
  const unsubscribeRate = klaviyo?.unsubscribeRate || 0
  const deliverability = klaviyo?.emailsSent
    ? ((klaviyo.delivered || 0) / klaviyo.emailsSent) * 100
    : 0

  // Overall health score (weighted average)
  const openScore = Math.min(100, (openRate / 30) * 100) // 30%+ = perfect
  const clickScore = Math.min(100, (clickRate / 5) * 100) // 5%+ = perfect
  const unsubPenalty = Math.min(100, unsubscribeRate * 200) // 0.5%+ = full penalty
  const delivScore = Math.min(100, (deliverability / 98) * 100) // 98%+ = perfect
  const engageScore = Math.min(100, (engagementRate / 40) * 100) // 40%+ = perfect

  const overallScore = Math.round(
    (openScore * 0.25 + clickScore * 0.15 + (100 - unsubPenalty) * 0.15 + delivScore * 0.25 + engageScore * 0.2)
  )

  const status = overallScore > 80
    ? { label: "Saudável", color: "text-success", ringColor: "stroke-success", bgColor: "bg-success/10", glowColor: "success" as const }
    : overallScore > 50
      ? { label: "Requer atenção", color: "text-warning", ringColor: "stroke-warning", bgColor: "bg-warning/10", glowColor: "warning" as const }
      : { label: "Ação necessária", color: "text-destructive", ringColor: "stroke-destructive", bgColor: "bg-destructive/10", glowColor: "destructive" as const }

  const radius = 40
  const circumference = 2 * Math.PI * radius
  const progress = (overallScore / 100) * circumference

  return (
    <GlowCard color={status.glowColor} intensity="subtle" surfaceClassName="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Saúde da Lista</h3>
      </div>

      <div className="flex gap-6">
        {/* Score circle */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
              <circle
                cx="44" cy="44" r={radius}
                fill="none"
                className="stroke-muted"
                strokeWidth="6"
              />
              <circle
                cx="44" cy="44" r={radius}
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
              <span className={`text-xl font-bold ${status.color}`}>{overallScore}%</span>
            </div>
          </div>
          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
            {status.label}
          </div>
        </div>

        {/* Metrics list */}
        <div className="flex-1 min-w-0">
          <MetricRow
            icon={Users}
            label="Tamanho da Lista"
            value={formatNumber(totalLeads)}
            colorClass="text-foreground"
          />
          <MetricRow
            icon={MailOpen}
            label="Taxa de Opt-in"
            value={`${engagementRate.toFixed(1)}%`}
            colorClass={getStatusColor(engagementRate, { good: 30, warn: 15 })}
          />
          <MetricRow
            icon={MailOpen}
            label="Open Rate Médio"
            value={`${openRate.toFixed(1)}%`}
            colorClass={getStatusColor(openRate, { good: 20, warn: 10 })}
          />
          <MetricRow
            icon={MousePointerClick}
            label="Click Rate"
            value={`${clickRate.toFixed(1)}%`}
            colorClass={getStatusColor(clickRate, { good: 3, warn: 1.5 })}
          />
          <MetricRow
            icon={UserMinus}
            label="Unsubscribe Rate"
            value={`${unsubscribeRate.toFixed(2)}%`}
            colorClass={getStatusColor(unsubscribeRate, { good: 0.3, warn: 0.5, inverse: true })}
          />
          <MetricRow
            icon={Send}
            label="Deliverability Score"
            value={`${deliverability.toFixed(1)}%`}
            colorClass={getStatusColor(deliverability, { good: 97, warn: 95 })}
          />
        </div>
      </div>
    </GlowCard>
  )
}
