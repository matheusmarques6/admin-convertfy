"use client"

/**
 * Aba Performance — KPIs internos, receita atribuida, top campanhas/flows.
 * Reusa a logica do Reports atual (StoreReportsTab) mas com layout refinado.
 *
 * Por enquanto: shell funcional com 4 KPI tiles + placeholder de cards
 * de tabelas. A integracao com dados reais ja existe via /api/reports
 * que e consumida internamente pelo componente legado.
 */

import { useEffect, useState } from "react"
import { TrendingUp, MousePointerClick, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiData {
  receita_total?: number
  pedidos?: number
  ticket_medio?: number
  novos_clientes?: number
  email_sms_enviados?: number
  open_rate?: number
  ctor?: number
  attributed_total?: number
  attributed_pct?: number
  campanhas?: Array<{ name: string; envios: number; abertura: number; cliques: number; receita: number }>
  flows?: Array<{ name: string; envios: number; abertura: number; cliques: number; receita: number }>
}

export function TabPerformance({ storeId }: { storeId: string }) {
  const [data, setData] = useState<KpiData>({})
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1A">("30d")

  useEffect(() => {
    setLoading(true)
    // Tenta endpoint existente. Se nao houver, mostra empty state.
    fetch(`/api/reports?store_id=${storeId}&range=${range}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data ?? j
        setData(d)
      })
      .catch(() => setData({}))
      .finally(() => setLoading(false))
  }, [storeId, range])

  return (
    <div className="flex flex-col gap-4">
      {/* Range selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[16px] font-bold text-slate-900 m-0">Performance · uso interno</h2>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
          {(["7d", "30d", "90d", "1A"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors",
                range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Faturamento total" value={data.receita_total ? `R$ ${(data.receita_total / 1000).toFixed(1)}k` : "—"} icon={TrendingUp} />
        <Kpi label="Pedidos" value={data.pedidos?.toLocaleString("pt-BR") ?? "—"} icon={MousePointerClick} />
        <Kpi label="Ticket médio" value={data.ticket_medio ? `R$ ${data.ticket_medio.toFixed(0)}` : "—"} icon={TrendingUp} />
        <Kpi label="Novos clientes" value={data.novos_clientes?.toLocaleString("pt-BR") ?? "—"} icon={Users} />
      </div>

      {/* Receita atribuida — hero card escuro */}
      <div
        className="rounded-[10px] p-5 md:p-6 text-white overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, #0B0E18, #2137B6)" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-6 items-center">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/60 mb-2">Receita atribuída Convertfy</div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-[40px] md:text-[56px] font-bold tabular-nums leading-none">
                {data.attributed_total ? `R$ ${((data.attributed_total) / 1000).toFixed(1).replace(".", ",")}k` : "—"}
              </span>
              <span className="text-[14px] text-white/70">
                {data.attributed_pct ? `${(data.attributed_pct * 100).toFixed(1)}% do faturamento total` : ""}
              </span>
            </div>
            <div className="flex gap-3 text-[12px] text-white/80">
              <span>Email · <span className="font-mono">R$ —</span></span>
              <span>SMS · <span className="font-mono">R$ —</span></span>
              <span>Push · <span className="font-mono">R$ —</span></span>
            </div>
          </div>
          {/* Gauge donut */}
          <div className="flex justify-center md:justify-end">
            <div className="relative" style={{ width: 180, height: 180 }}>
              <svg width={180} height={180} viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={90} cy={90} r={75} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={14} />
                <circle
                  cx={90}
                  cy={90}
                  r={75}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={14}
                  strokeDasharray={`${(data.attributed_pct || 0) * 2 * Math.PI * 75} ${2 * Math.PI * 75}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[36px] font-bold leading-none">
                  {data.attributed_pct ? `${(data.attributed_pct * 100).toFixed(1)}%` : "—"}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/60 mt-1">Participação</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance de email — strip */}
      <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <h3 className="text-[13px] font-bold text-slate-900 m-0 mb-3">Performance de e-mail</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Entregues" value={data.email_sms_enviados?.toLocaleString("pt-BR") ?? "—"} />
          <Kpi label="Open rate" value={data.open_rate ? `${(data.open_rate * 100).toFixed(2)}%` : "—"} sub="benchmark 17,3%" />
          <Kpi label="CTR" value="—" />
          <Kpi label="CTOR" value={data.ctor ? `${(data.ctor * 100).toFixed(2)}%` : "—"} sub="benchmark 4,1%" />
          <Kpi label="Bounces" value="—" />
        </div>
      </div>

      {/* Tabelas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <h3 className="text-[13px] font-bold text-slate-900 m-0 mb-3">Top campanhas por receita</h3>
          {data.campanhas && data.campanhas.length > 0 ? (
            <TopTable items={data.campanhas} />
          ) : (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">Sem campanhas no período</div>
          )}
        </div>
        <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <h3 className="text-[13px] font-bold text-slate-900 m-0 mb-3">Top flows por receita</h3>
          {data.flows && data.flows.length > 0 ? (
            <TopTable items={data.flows} />
          ) : (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">Sem flows no período</div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center text-[11.5px] text-slate-400 italic py-2">Carregando dados…</div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md bg-slate-50 border p-3" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3 w-3 text-slate-400" />}
        <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[18px] font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function TopTable({ items }: { items: Array<{ name: string; envios: number; abertura: number; cliques: number; receita: number }> }) {
  return (
    <table className="w-full text-[11.5px]">
      <thead>
        <tr className="text-left text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <th className="pb-2">Nome</th>
          <th className="pb-2 text-right">Envios</th>
          <th className="pb-2 text-right">Open</th>
          <th className="pb-2 text-right">Receita</th>
        </tr>
      </thead>
      <tbody>
        {items.slice(0, 5).map((c, i) => (
          <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
            <td className="py-2 text-slate-800 font-medium truncate max-w-[200px]">{c.name}</td>
            <td className="py-2 text-right text-slate-600 tabular-nums">{c.envios.toLocaleString("pt-BR")}</td>
            <td className="py-2 text-right text-slate-600 tabular-nums">{(c.abertura * 100).toFixed(1)}%</td>
            <td className="py-2 text-right font-semibold tabular-nums text-emerald-700">R$ {(c.receita / 1000).toFixed(1)}k</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
