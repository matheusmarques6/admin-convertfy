"use client"

/**
 * StoreHero — card de cabecalho da pagina /admin/stores/[id].
 * Duas faixas: superior (identidade + responsavel + ring saude) e
 * inferior (4 KPIs com delta). Mantem responsivo.
 */

import { ExternalLink, User as UserIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiDelta {
  label: string
  value: string
  delta?: string
  positive?: boolean
}

interface StoreHeroProps {
  storeName: string
  storeUrl: string | null
  clientName: string | null
  clientSince: string | null
  status: "active" | "paused"
  plan?: string | null
  planMonths?: number | null
  mrrCents?: number | null
  cmName?: string | null
  healthScore?: number | null
  healthLabel?: string | null
  kpis?: KpiDelta[]
  logoUrl?: string | null
}

function HealthDonut({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, score))
  const radius = 22
  const circ = 2 * Math.PI * radius
  const dash = (safe / 100) * circ
  const color = safe >= 80 ? "#10B981" : safe >= 60 ? "#F59E0B" : "#DC2626"
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 56, height: 56 }}>
      <svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={28} cy={28} r={radius} fill="none" stroke="#F3F4F6" strokeWidth={6} />
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
          {Math.round(safe)}
        </span>
      </span>
    </div>
  )
}

function fmtBRL(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return "—"
  const v = cents / 100
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`
  return `R$ ${v.toFixed(0)}`
}

export function StoreHero({
  storeName,
  storeUrl,
  clientName,
  clientSince,
  status,
  plan,
  planMonths,
  mrrCents,
  cmName,
  healthScore,
  healthLabel,
  kpis = [],
  logoUrl,
}: StoreHeroProps) {
  const initials = storeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "??"

  return (
    <div
      className="bg-white border rounded-[10px] overflow-hidden"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      {/* Faixa superior — identidade + responsavel + ring saude */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 md:p-[18px]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Logo / monograma */}
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={storeName}
              className="w-14 h-14 rounded-[8px] shrink-0 object-cover bg-slate-100"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-[8px] shrink-0 flex items-center justify-center text-white font-bold text-[20px] tracking-tight"
              style={{ background: "#1F2937" }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-[18px] font-bold text-slate-900 m-0 leading-tight truncate">
                {storeName}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider",
                  status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: status === "active" ? "#10B981" : "#9CA3AF" }}
                />
                {status === "active" ? "Ativo" : "Pausado"}
              </span>
              {plan && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10.5px] font-semibold uppercase tracking-wider">
                  {plan}{planMonths ? ` · ${planMonths}m` : ""}
                </span>
              )}
              {mrrCents != null && (
                <span className="text-[11.5px] text-slate-500 font-mono tabular-nums">
                  MRR {fmtBRL(mrrCents)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-slate-600 flex-wrap">
              {storeUrl && (
                <a
                  href={storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                >
                  {storeUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {clientName && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {clientName}
                  </span>
                </>
              )}
              {clientSince && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">Cliente desde {clientSince}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Lado direito: CSM + ring de saude */}
        <div className="flex items-center gap-4 shrink-0">
          {cmName && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-slate-50 border border-slate-100">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold uppercase"
                style={{ background: "linear-gradient(135deg,#4E62D8,#2137B6)" }}
              >
                {cmName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
              </div>
              <div>
                <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">CSM</div>
                <div className="text-[12px] font-semibold text-slate-900 leading-tight">{cmName}</div>
              </div>
            </div>
          )}
          {healthScore != null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-slate-50 border border-slate-100">
              <HealthDonut score={healthScore} />
              <div>
                <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">Saúde</div>
                <div className="text-[12px] font-semibold text-slate-900 leading-tight">
                  {healthLabel ||
                    (healthScore >= 80 ? "Boa" : healthScore >= 60 ? "Atenção" : "Crítica")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Faixa inferior — KPIs */}
      {kpis.length > 0 && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 border-t"
          style={{ borderColor: "rgba(0,0,0,0.06)", background: "#F8FAFC" }}
        >
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={cn(
                "py-3 md:py-4 px-3 md:px-5",
                i < kpis.length - 1 && "border-r",
                "[&:nth-child(2)]:border-r-0 md:[&:nth-child(2)]:border-r",
                "[&:nth-child(-n+2)]:border-b md:[&:nth-child(-n+2)]:border-b-0",
              )}
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {k.label}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[18px] md:text-[20px] font-bold text-slate-900 tabular-nums leading-none">
                  {k.value}
                </span>
                {k.delta && (
                  <span
                    className={cn(
                      "text-[10.5px] font-bold tabular-nums",
                      k.positive ? "text-emerald-600" : "text-red-600",
                    )}
                  >
                    {k.delta}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
