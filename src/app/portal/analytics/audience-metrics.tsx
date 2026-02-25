import { Users, UserPlus, RefreshCw, Mail, UserCheck, Repeat } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatNumber, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData, ShopifyData } from "../dashboard/types"

interface AudienceMetricsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
}

function StatBlock({
  icon: Icon,
  label,
  value,
  subtitle,
  colorClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtitle?: string
  colorClass?: string
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="rounded-lg bg-muted/50 p-2 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${colorClass || "text-foreground"}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

export function AudienceMetrics({ klaviyo, shopify }: AudienceMetricsProps) {
  const totalLeads = klaviyo?.totalLeads || 0
  const engagedLeads = klaviyo?.engagedLeads || 0
  const engagementRate = klaviyo?.engagementRate || 0
  const newCustomers = shopify?.newCustomers || 0
  const recurringRate = shopify?.recurringCustomerRate || 0

  const engageColor = engagementRate >= 30
    ? "text-success"
    : engagementRate >= 15
      ? "text-warning"
      : "text-destructive"

  const recurringColor = recurringRate >= 30
    ? "text-success"
    : recurringRate >= 15
      ? "text-warning"
      : "text-foreground"

  return (
    <GlowCard color="primary" intensity="subtle" surfaceClassName="p-5">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Audiência & Clientes</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <StatBlock
          icon={Mail}
          label="Total de Leads"
          value={formatNumber(totalLeads)}
          subtitle="na lista"
        />
        <StatBlock
          icon={UserCheck}
          label="Leads Engajados (90d)"
          value={formatNumber(engagedLeads)}
          subtitle={`${formatPercent(engagementRate)} do total`}
          colorClass={engageColor}
        />
        <StatBlock
          icon={RefreshCw}
          label="Taxa de Engajamento"
          value={formatPercent(engagementRate)}
          subtitle="engajados / total"
          colorClass={engageColor}
        />
        <StatBlock
          icon={UserPlus}
          label="Novos Clientes"
          value={formatNumber(newCustomers)}
          subtitle="no período"
        />
        <StatBlock
          icon={Repeat}
          label="Taxa de Cliente Recorrente"
          value={formatPercent(recurringRate)}
          subtitle="compraram mais de 1x"
          colorClass={recurringColor}
        />
      </div>
    </GlowCard>
  )
}
