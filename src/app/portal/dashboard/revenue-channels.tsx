"use client"

import { useState } from "react"
import { Zap, Send, MessageSquare, BarChart3 } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrency } from "@/lib/utils/format"
import type { KlaviyoData } from "./types"

interface RevenueChannelsProps {
  klaviyo?: KlaviyoData
}

type Channel = "all" | "flows" | "campaigns" | "sms"

export function RevenueChannels({ klaviyo }: RevenueChannelsProps) {
  const [activeChannel, setActiveChannel] = useState<Channel>("all")

  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0

  const flowPercent = totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0
  const campaignPercent = totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0
  const smsPercent = totalKlaviyoRevenue > 0 ? (smsRevenue / totalKlaviyoRevenue) * 100 : 0

  // Determine which revenue to show based on active channel
  const displayRevenue =
    activeChannel === "flows" ? flowRevenue :
    activeChannel === "campaigns" ? campaignRevenue :
    activeChannel === "sms" ? smsRevenue :
    totalKlaviyoRevenue

  const displayLabel =
    activeChannel === "flows" ? "Receita de Flows" :
    activeChannel === "campaigns" ? "Receita de Campanhas" :
    activeChannel === "sms" ? "Receita de SMS" :
    "Receita Total Atribuída"

  return (
    <GlowCard color="primary" intensity="moderate" surfaceClassName="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Canais de Receita
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <ChannelCardLocal
          title="Flows"
          percent={flowPercent}
          value={flowRevenue}
          icon={Zap}
          color="bg-primary/10 text-primary"
          active={activeChannel === "flows"}
          onClick={() => setActiveChannel(activeChannel === "flows" ? "all" : "flows")}
        />
        <ChannelCardLocal
          title="Campanhas"
          percent={campaignPercent}
          value={campaignRevenue}
          icon={Send}
          color="bg-blue-500/10 text-blue-400"
          active={activeChannel === "campaigns"}
          onClick={() => setActiveChannel(activeChannel === "campaigns" ? "all" : "campaigns")}
        />
        <ChannelCardLocal
          title="SMS"
          percent={smsPercent}
          value={smsRevenue}
          icon={MessageSquare}
          color="bg-amber-500/10 text-amber-400"
          active={activeChannel === "sms"}
          onClick={() => setActiveChannel(activeChannel === "sms" ? "all" : "sms")}
        />
      </div>

      <div className="p-3 rounded-lg bg-muted/50 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{displayLabel}</span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(displayRevenue)}</span>
        </div>
        {/* Visual bar breakdown */}
        <div className="h-3 rounded-full bg-muted overflow-hidden flex">
          {flowPercent > 0 && (
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${flowPercent}%`, opacity: activeChannel === "all" || activeChannel === "flows" ? 1 : 0.2 }}
              title={`Flows: ${flowPercent.toFixed(1)}%`}
            />
          )}
          {campaignPercent > 0 && (
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${campaignPercent}%`, opacity: activeChannel === "all" || activeChannel === "campaigns" ? 1 : 0.2 }}
              title={`Campanhas: ${campaignPercent.toFixed(1)}%`}
            />
          )}
          {smsPercent > 0 && (
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${smsPercent}%`, opacity: activeChannel === "all" || activeChannel === "sms" ? 1 : 0.2 }}
              title={`SMS: ${smsPercent.toFixed(1)}%`}
            />
          )}
        </div>
      </div>

      {/* Channel breakdown details */}
      <div className="space-y-2">
        <BreakdownRow label="Flows" value={flowRevenue} percent={flowPercent} color="bg-primary" />
        <BreakdownRow label="Campanhas" value={campaignRevenue} percent={campaignPercent} color="bg-blue-500" />
        <BreakdownRow label="SMS" value={smsRevenue} percent={smsPercent} color="bg-amber-500" />
      </div>
    </GlowCard>
  )
}

function ChannelCardLocal({
  title,
  percent,
  value,
  icon: Icon,
  color,
  active = false,
  onClick,
}: {
  title: string
  percent: number
  value: number
  icon: React.ElementType
  color: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`rounded-xl p-4 border transition-all cursor-pointer ${
        active
          ? `${color} border-current`
          : "bg-card/50 border-border hover:border-primary/30"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${active ? "text-current" : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <p className={`text-lg font-bold ${active ? "text-foreground" : "text-foreground/80"}`}>
        {percent.toFixed(1)}%
      </p>
      <p className="text-xs text-muted-foreground">{formatCurrency(value)}</p>
    </div>
  )
}

function BreakdownRow({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <span className="text-xs font-medium text-foreground">{formatCurrency(value)}</span>
      <span className="text-xs text-muted-foreground w-12 text-right">{percent.toFixed(1)}%</span>
    </div>
  )
}
