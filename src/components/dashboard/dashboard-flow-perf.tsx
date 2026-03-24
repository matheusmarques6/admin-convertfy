"use client"

import { cn } from "@/lib/utils"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface FlowCardData {
  title: string
  rate: number
  revenue: string
  delta: number
  benchmark: number
  sparklinePoints: string
  tooltip: {
    emailsEnviados: string
    conversoes: string
    ticketMedio: string
    unsubRate: string
    flowsAtivos: string
  }
  worstClients: Array<{ name: string; value: number }>
}

const FLOW_CARDS: FlowCardData[] = [
  {
    title: "Recuperação de Carrinho",
    rate: 12.4,
    revenue: "R$ 98K",
    delta: 3.2,
    benchmark: 10,
    sparklinePoints: "0,20 12,18 24,15 36,16 48,12 60,10 72,6 80,4",
    tooltip: {
      emailsEnviados: "14.320",
      conversoes: "1.776",
      ticketMedio: "R$ 55",
      unsubRate: "0.3%",
      flowsAtivos: "4",
    },
    worstClients: [
      { name: "EPORTH Energia", value: 3.2 },
      { name: "Based 3.0", value: 4.1 },
    ],
  },
  {
    title: "Abandono de Navegação",
    rate: 4.8,
    revenue: "R$ 54K",
    delta: -1.1,
    benchmark: 4,
    sparklinePoints: "0,8 12,6 24,8 36,10 48,12 60,14 72,18 80,20",
    tooltip: {
      emailsEnviados: "22.540",
      conversoes: "1.082",
      ticketMedio: "R$ 50",
      unsubRate: "0.5%",
      flowsAtivos: "3",
    },
    worstClients: [
      { name: "NUZE", value: 1.8 },
      { name: "Donaris Joias", value: 2.4 },
    ],
  },
  {
    title: "Win-back",
    rate: 2.3,
    revenue: "R$ 28K",
    delta: -0.8,
    benchmark: 2.5,
    sparklinePoints: "0,6 12,8 24,7 36,10 48,14 60,16 72,18 80,20",
    tooltip: {
      emailsEnviados: "8.900",
      conversoes: "205",
      ticketMedio: "R$ 137",
      unsubRate: "0.8%",
      flowsAtivos: "2",
    },
    worstClients: [
      { name: "Based 3.0", value: 0.4 },
      { name: "EPORTH Energia", value: 0.9 },
    ],
  },
]

function Sparkline({ points, color }: { points: string; color: string }) {
  return (
    <svg
      width="80"
      height="24"
      viewBox="0 0 80 24"
      fill="none"
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FlowCardSkeleton() {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-4",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      <div className="mb-2 h-3 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-2 flex items-center justify-between">
        <div className="h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mb-3 h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-[rgba(255,255,255,0.06)]">
        <div className="mb-2 h-2.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-1.5 flex items-center justify-between">
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  )
}

function FlowCard({ data }: { data: FlowCardData }) {
  const isPositive = data.delta > 0
  const sparklineColor = isPositive ? "#10B981" : "#EF4444"
  const deltaColor = isPositive
    ? "text-green-500"
    : "text-red-500"
  const deltaPrefix = isPositive ? "+" : ""

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "cursor-default rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-4",
              "transition-shadow hover:shadow-sm",
              "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
            )}
          >
            {/* Title */}
            <p className="mb-1 text-[13px] font-medium leading-tight text-gray-500 dark:text-gray-400">
              {data.title}
            </p>

            {/* Rate + Sparkline */}
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[24px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {data.rate}%
              </span>
              <Sparkline points={data.sparklinePoints} color={sparklineColor} />
            </div>

            {/* Revenue + Delta */}
            <div className="mb-0.5 flex items-center gap-2">
              <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-gray-300">
                {data.revenue}
              </span>
              <span
                className={cn(
                  "font-mono text-[13px] tabular-nums",
                  deltaColor
                )}
              >
                {deltaPrefix}{data.delta}%
              </span>
            </div>

            {/* Benchmark */}
            <p className="mb-1 text-[11px] text-gray-400 dark:text-gray-500">
              Benchmark: {data.benchmark}%
            </p>

            {/* Worst Clients */}
            <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-[rgba(255,255,255,0.06)]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Piores clientes
              </p>
              {data.worstClients.map((client) => (
                <div
                  key={client.name}
                  className="flex items-center justify-between py-0.5"
                >
                  <span className="text-[12px] text-gray-700 dark:text-gray-300">
                    {client.name}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-red-500">
                    {client.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs text-[12px] leading-relaxed"
        >
          <p>
            Emails enviados: {data.tooltip.emailsEnviados}
            <br />
            Conversões: {data.tooltip.conversoes}
            <br />
            Ticket médio: {data.tooltip.ticketMedio}
            <br />
            Unsub rate: {data.tooltip.unsubRate}
            <br />
            Qtd flows ativos: {data.tooltip.flowsAtivos}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface DashboardFlowPerfProps {
  loading?: boolean
}

export function DashboardFlowPerf({ loading = false }: DashboardFlowPerfProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {loading
        ? Array.from({ length: 3 }).map((_, i) => (
            <FlowCardSkeleton key={i} />
          ))
        : FLOW_CARDS.map((card) => (
            <FlowCard key={card.title} data={card} />
          ))}
    </div>
  )
}
