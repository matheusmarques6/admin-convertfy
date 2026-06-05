"use client"

/**
 * StoreHero — hero card de duas faixas (Convertfy DS v3).
 *
 * Faixa superior (padding 18×22, gap 18):
 *  - StoreLogo (56px) com monograma Playfair italic
 *  - Coluna info: nome (18px/600), badges (status · plano · MRR mute)
 *    + URL clicável + avatar+nome cliente + "Cliente desde X"
 *  - Coluna direita: card CSM (avatar + role + nome) + HealthRing
 *
 * Faixa inferior (bg gray-50, borda top, 4 colunas com border-left):
 *  KPIs com label uppercase 10.5px + valor 22px tnum + delta colorido
 */

import { ExternalLink, Calendar } from "lucide-react"
import { Avatar, Badge, C, ChannelIcon, HealthRing, StoreLogo, TNUM } from "./_primitives"
import { StoreLanguagePopover } from "./store-language-popover"

interface KpiDelta {
  label: string
  value: string
  delta?: string
  tone?: "pos" | "neg" | "info" | "neut"
}

interface StoreHeroProps {
  storeId: string
  storeName: string
  storeUrl: string | null
  language: string | null
  clientName: string | null
  clientId?: string | null
  clientSince: string | null
  status: "active" | "paused"
  plan?: string | null
  planMonths?: number | null
  mrrCents?: number | null
  cmName?: string | null
  healthScore?: number | null
  kpis?: KpiDelta[]
  channelChips?: Array<{ key: string; name: string }>
}

function formatMRR(cents?: number | null): string {
  if (!cents || cents <= 0) return "—"
  return `R$ ${Math.round(cents / 100).toLocaleString("pt-BR")}`
}

export function StoreHero({
  storeId,
  storeName,
  storeUrl,
  language,
  clientName,
  clientId,
  clientSince,
  status,
  plan,
  planMonths,
  mrrCents,
  cmName,
  healthScore,
  kpis = [],
}: StoreHeroProps) {
  const planLabel = plan ? (planMonths ? `${plan} · ${planMonths}m` : plan) : null
  const hostname = storeUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null

  return (
    <div
      className="bg-white border rounded-[12px] overflow-hidden"
      style={{ borderColor: C.border, boxShadow: C.shadowSm }}
    >
      {/* TOP BAND */}
      <div className="flex items-start gap-[18px] p-[18px_22px]">
        <StoreLogo name={storeName} size={56} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[18px] font-semibold text-slate-900" style={{ letterSpacing: "-0.01em" }}>
              {storeName}
            </span>
            <Badge tone={status === "active" ? "pos" : "neut"} dot>
              {status === "active" ? "Ativo" : "Pausado"}
            </Badge>
            {planLabel && <Badge tone="info">{planLabel}</Badge>}
            <StoreLanguagePopover storeId={storeId} language={language} />
            {mrrCents != null && (
              <span className="text-[11px] text-slate-400 ml-1" style={TNUM}>
                MRR {formatMRR(mrrCents)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-slate-600">
            {hostname && (
              <a
                href={storeUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
                style={{ color: C.brand, textDecoration: "none" }}
              >
                {hostname}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {clientName && (
              clientId ? (
                <a
                  href={`/admin/clients/${clientId}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: "inherit", textDecoration: "none" }}
                  title={`Abrir perfil de ${clientName}`}
                >
                  <Avatar name={clientName} size={18} />
                  {clientName}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={clientName} size={18} />
                  {clientName}
                </span>
              )
            )}
            {clientSince && (
              <span className="inline-flex items-center gap-1" style={{ color: C.g500 }}>
                <Calendar className="h-3 w-3" />
                Cliente desde {clientSince}
              </span>
            )}
          </div>
        </div>

        {/* CSM + Health */}
        <div className="flex items-stretch gap-3 shrink-0">
          {cmName && (
            <div
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-[8px]"
              style={{ background: C.g50, border: `1px solid ${C.border}` }}
            >
              <Avatar name={cmName} size={28} />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.g400 }}>
                  CSM
                </div>
                <div className="text-[12.5px] font-semibold text-slate-900">{cmName.split(" ")[0]} {cmName.split(" ").slice(-1)[0]?.[0]}.</div>
              </div>
            </div>
          )}
          {healthScore != null && <HealthRing score={healthScore} />}
        </div>
      </div>

      {/* KPI BAND */}
      {kpis.length > 0 && (
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ background: C.g50, borderTop: `1px solid ${C.border}` }}
        >
          {kpis.map((k, i) => (
            <div
              key={i}
              className="px-[22px] py-[14px]"
              style={{ borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}
            >
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: C.g500 }}
              >
                {k.label}
              </div>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span
                  className="text-[22px] font-semibold text-slate-900"
                  style={{ letterSpacing: "-0.02em", ...TNUM }}
                >
                  {k.value}
                </span>
                {k.delta && (
                  <span
                    className="text-[11px] font-semibold"
                    style={{
                      ...TNUM,
                      color:
                        k.tone === "pos"
                          ? C.pos
                          : k.tone === "neg"
                            ? C.neg
                            : k.tone === "info"
                              ? C.brand
                              : C.g500,
                    }}
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

// Re-export channel chip if needed
export { ChannelIcon }
