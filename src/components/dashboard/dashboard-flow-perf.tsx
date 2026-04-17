"use client"

import { Info } from "lucide-react"
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

// Empty-state templates: design identico aos cards com dados, porem
// todos os valores sao '—'. Renderizados enquanto o endpoint agregado de
// flows (cross-loja) nao esta disponivel.
const EMPTY_FLOW_CARDS: FlowCardData[] = [
  {
    title: "Recuperação de Carrinho",
    rate: 0,
    revenue: "—",
    delta: 0,
    benchmark: 10,
    sparklinePoints: "",
    tooltip: {
      emailsEnviados: "—",
      conversoes: "—",
      ticketMedio: "—",
      unsubRate: "—",
      flowsAtivos: "—",
    },
    worstClients: [],
  },
  {
    title: "Abandono de Navegação",
    rate: 0,
    revenue: "—",
    delta: 0,
    benchmark: 4,
    sparklinePoints: "",
    tooltip: {
      emailsEnviados: "—",
      conversoes: "—",
      ticketMedio: "—",
      unsubRate: "—",
      flowsAtivos: "—",
    },
    worstClients: [],
  },
  {
    title: "Win-back",
    rate: 0,
    revenue: "—",
    delta: 0,
    benchmark: 2.5,
    sparklinePoints: "",
    tooltip: {
      emailsEnviados: "—",
      conversoes: "—",
      ticketMedio: "—",
      unsubRate: "—",
      flowsAtivos: "—",
    },
    worstClients: [],
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
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-4",
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
  const hasData = data.rate > 0 || (data.revenue && data.revenue !== "—")
  const isPositive = data.delta > 0
  const sparklineColor = isPositive ? "#10B981" : "#EF4444"
  const deltaColor = isPositive ? "text-green-500" : "text-red-500"
  const deltaPrefix = isPositive ? "+" : ""

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "cursor-default rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-4",
              "transition-shadow hover:shadow-sm",
              "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
            )}
          >
            {/* Title */}
            <p className="mb-1 text-[13px] font-medium leading-tight text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50">
              {data.title}
            </p>

            {/* Rate + Sparkline */}
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[24px] font-semibold tabular-nums text-gray-900 dark:text-white dark:text-gray-100">
                {hasData ? `${data.rate}%` : "—"}
              </span>
              {hasData && data.sparklinePoints && (
                <Sparkline points={data.sparklinePoints} color={sparklineColor} />
              )}
            </div>

            {/* Revenue + Delta */}
            <div className="mb-0.5 flex items-center gap-2">
              <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-white/90 dark:text-gray-300">
                {data.revenue}
              </span>
              {hasData && (
                <span className={cn("font-mono text-[13px] tabular-nums", deltaColor)}>
                  {deltaPrefix}{data.delta}%
                </span>
              )}
            </div>

            {/* Benchmark */}
            <p className="mb-1 text-[11px] text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
              Benchmark: {data.benchmark}%
            </p>

            {/* Worst Clients */}
            <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-[rgba(255,255,255,0.06)]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
                Piores clientes
              </p>
              {data.worstClients.length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-white/40 py-0.5">
                  —
                </p>
              ) : (
                data.worstClients.map((client) => (
                  <div
                    key={client.name}
                    className="flex items-center justify-between py-0.5"
                  >
                    <span className="text-[12px] text-gray-700 dark:text-white/90 dark:text-gray-300">
                      {client.name}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-red-500">
                      {client.value}%
                    </span>
                  </div>
                ))
              )}
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
  /** Dados agregados de flows (opcional). Quando nao fornecido, renderiza empty-state. */
  flows?: FlowCardData[]
}

export function DashboardFlowPerf({ loading = false, flows }: DashboardFlowPerfProps) {
  const cards = flows && flows.length > 0 ? flows : EMPTY_FLOW_CARDS
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
          Performance dos Flows
        </h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
              Taxa de conversão e receita dos principais flows automáticos. Passe o mouse em cada card para ver detalhes como emails enviados, conversões e ticket médio.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <FlowCardSkeleton key={i} />
            ))
          : cards.map((card) => (
              <FlowCard key={card.title} data={card} />
            ))}
      </div>
    </div>
  )
}
