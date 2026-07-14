"use client"

import useSWR from "swr"
import { BarChart3, Flag, Heart, Phone, Store } from "lucide-react"

/**
 * Painel de Customer Success — aba 1 do modulo CS.
 * Porta do prototipo Figma Make usando tokens --crm-*.
 *
 * Blocos e fontes de dados:
 *   - KPIs (carteira, saude, risco) .... GET /api/crm/cs-painel/kpis
 *   - KPI calls no mes ................. GET /api/crm/cs-painel/calls-mes
 *   - KPI NRR (placeholder) ............ GET /api/crm/cs-painel/nrr
 *   - Distribuicao por cadencia ........ GET /api/crm/cs-painel/cadencia
 *   - Saude da carteira + em risco ..... GET /api/crm/dashboard/cs
 *   - Proximas calls ................... GET /api/crm/cs-painel/proximas-calls
 *   - Carga por CSM .................... GET /api/crm/cs-painel/carga-csm
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

const fmtBRL = (cents: number | null | undefined) =>
  "R$ " +
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    (cents ?? 0) / 100,
  )

const fmtSignedInt = (n: number | null | undefined) =>
  n == null ? "—" : n > 0 ? `+${n}` : `${n}`

const CADENCE_COLOR: Record<string, string> = {
  weekly: "var(--crm-brand)",
  biweekly: "var(--crm-purple)",
  monthly: "var(--crm-pos)",
  paused: "var(--crm-gray-400)",
}

// Iniciais coloridas por nome (glyph quadrado da loja) — deterministico.
function glyphColor(name: string) {
  const palette = [
    ["#EEF0FB", "#2137B6"],
    ["#F3E8FF", "#7C3AED"],
    ["#ECFDF5", "#065F46"],
    ["#FFFBEB", "#92400E"],
    ["#FEF2F2", "#991B1B"],
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
function Glyph({ name, size = 26 }: { name: string; size?: number }) {
  const [bg, c] = glyphColor(name)
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        flexShrink: 0,
        background: bg,
        color: c,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </span>
  )
}

function fmtNextCall(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getUTCDay()]
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${wd} ${dd}/${mm}`
}

// ── Tipos de resposta ────────────────────────────────────────────────
interface KpisResp {
  carteira_ativa: { value: number; delta: number | null }
  saude_media: { value: number | null; delta: number | null }
  lojas_risco: { value: number; delta: number | null }
}
interface CallsMesResp {
  feitas: number
  meta: number
  pct: number
}
interface NrrResp {
  status: string
  value: number | null
  delta: number | null
}
interface CadenciaResp {
  total: number
  distribution: Array<{ key: string; label: string; n: number }>
}
interface DashboardCsResp {
  health_distribution: { healthy: number; warning: number; critical: number; no_score: number }
  at_risk: Array<{
    store_id: string
    store_name: string
    client_name: string
    health_score: number | null
    mrr_cents: number | null
  }>
}
interface ProximasCallsResp {
  calls: Array<{
    store_id: string
    store_name: string
    next_call_date: string | null
    csm_name: string | null
    cadence: string
    cadence_label: string
  }>
}
interface CargaCsmResp {
  csms: Array<{ owner_id: string; name: string; n: number; risk: number }>
}

// ── Painel ───────────────────────────────────────────────────────────
export function Painel() {
  const { data: kpis } = useSWR<KpisResp>("/api/crm/cs-painel/kpis", fetcher, {
    refreshInterval: 60_000,
  })
  const { data: callsMes } = useSWR<CallsMesResp>(
    "/api/crm/cs-painel/calls-mes",
    fetcher,
  )
  const { data: nrr } = useSWR<NrrResp>("/api/crm/cs-painel/nrr", fetcher)
  const { data: cadencia } = useSWR<CadenciaResp>(
    "/api/crm/cs-painel/cadencia",
    fetcher,
  )
  const { data: dash } = useSWR<DashboardCsResp>(
    "/api/crm/dashboard/cs",
    fetcher,
  )
  const { data: proximas } = useSWR<ProximasCallsResp>(
    "/api/crm/cs-painel/proximas-calls",
    fetcher,
  )
  const { data: cargaCsm } = useSWR<CargaCsmResp>(
    "/api/crm/cs-painel/carga-csm",
    fetcher,
  )

  const health = dash?.health_distribution
  const healthTotal = health
    ? health.healthy + health.warning + health.critical
    : 0
  const healthBands = health
    ? [
        { k: "healthy", label: "Saudável", n: health.healthy, c: "var(--crm-pos)" },
        { k: "warning", label: "Atenção", n: health.warning, c: "var(--crm-amber)" },
        { k: "critical", label: "Risco", n: health.critical, c: "var(--crm-neg)" },
      ]
    : []

  const cadTotal = cadencia?.total ?? 0
  const maxCsm = Math.max(1, ...(cargaCsm?.csms.map((c) => c.n) ?? [1]))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0,1fr))",
          gap: 14,
        }}
      >
        <KpiCard
          icon={<Store className="h-4 w-4" />}
          label="Carteira ativa"
          value={kpis ? String(kpis.carteira_ativa.value) : "—"}
          unit="lojas"
          delta={kpis ? fmtSignedInt(kpis.carteira_ativa.delta) : ""}
          deltaTone="pos"
          sub="no mês"
        />
        <KpiCard
          icon={<Heart className="h-4 w-4" />}
          label="Saúde média"
          value={kpis?.saude_media.value != null ? String(kpis.saude_media.value) : "—"}
          unit="/100"
          delta={kpis ? fmtSignedInt(kpis.saude_media.delta) : ""}
          deltaTone="pos"
          sub="vs início do mês"
        />
        <KpiCard
          icon={<Flag className="h-4 w-4" />}
          label="Lojas em risco"
          value={kpis ? String(kpis.lojas_risco.value) : "—"}
          unit="lojas"
          delta={kpis ? fmtSignedInt(kpis.lojas_risco.delta) : ""}
          // Queda no nº de lojas em risco é positiva.
          deltaTone={
            kpis?.lojas_risco.delta != null && kpis.lojas_risco.delta > 0
              ? "neg"
              : "pos"
          }
          sub="health < 50"
        />
        <KpiCard
          icon={<Phone className="h-4 w-4" />}
          label="Calls no mês"
          value={callsMes ? String(callsMes.feitas) : "—"}
          unit={callsMes ? `/ ${callsMes.meta}` : ""}
          delta={callsMes ? `${callsMes.pct}%` : ""}
          deltaTone="neut"
          sub="realizadas"
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="NRR"
          value={nrr?.value != null ? `${nrr.value}` : "—"}
          unit={nrr?.value != null ? "%" : ""}
          delta=""
          deltaTone="neut"
          sub={nrr?.status === "pending" ? "em breve" : "net revenue retention"}
        />
      </div>

      {/* Linha 1: distribuição por cadência + saúde */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <Panel title="Distribuição por cadência">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(cadencia?.distribution ?? []).map((c) => (
              <div
                key={c.key}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: 110,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 3,
                      background: CADENCE_COLOR[c.key],
                    }}
                  />
                  <span style={{ fontSize: 12.5, color: "var(--crm-gray-700)", fontWeight: 500 }}>
                    {c.label}
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: "var(--crm-gray-100)",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: cadTotal > 0 ? `${(c.n / cadTotal) * 100}%` : "0%",
                      height: "100%",
                      background: CADENCE_COLOR[c.key],
                      borderRadius: 6,
                    }}
                  />
                </div>
                <span
                  className="crm-tnum"
                  style={{
                    width: 34,
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--crm-gray-900)",
                  }}
                >
                  {c.n}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Saúde da carteira">
          <div
            style={{
              display: "flex",
              height: 40,
              borderRadius: 9,
              overflow: "hidden",
              border: "1px solid var(--crm-gray-200)",
              marginBottom: 16,
            }}
          >
            {healthBands.map((h) => (
              <div
                key={h.k}
                title={`${h.label}: ${h.n}`}
                style={{
                  flex: h.n || 0.0001,
                  background: h.c,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {h.n > 0 && (
                  <span className="crm-tnum" style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                    {h.n}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {healthBands.map((h) => (
              <div key={h.k} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: h.c }} />
                <span style={{ fontSize: 12.5, color: "var(--crm-gray-700)", flex: 1 }}>
                  {h.label}
                </span>
                <span
                  className="crm-tnum"
                  style={{ fontSize: 13, fontWeight: 700, color: "var(--crm-gray-900)" }}
                >
                  {h.n}
                </span>
                <span
                  className="crm-tnum"
                  style={{ fontSize: 11, color: "var(--crm-gray-400)", width: 40, textAlign: "right" }}
                >
                  {healthTotal > 0 ? Math.round((h.n / healthTotal) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Linha 2: próximas calls + em risco + carga por CSM */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <Panel title="Próximas calls">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(proximas?.calls ?? []).length === 0 && <Empty label="Sem calls agendadas" />}
            {(proximas?.calls ?? []).map((s, i) => (
              <div
                key={s.store_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 4px",
                  borderTop: i ? "1px solid var(--crm-gray-100)" : "none",
                }}
              >
                <Glyph name={s.store_name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="truncate"
                    style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-gray-900)" }}
                  >
                    {s.store_name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}>
                    {s.csm_name?.split(" ")[0] ?? "—"} · {s.cadence_label}
                  </div>
                </div>
                <span
                  className="crm-tnum"
                  style={{ fontSize: 11.5, fontWeight: 600, color: "var(--crm-gray-600)", whiteSpace: "nowrap" }}
                >
                  {fmtNextCall(s.next_call_date)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Lojas em risco"
          action={
            <span
              className="crm-tnum"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--crm-neg)",
                background: "var(--crm-neg-bg)",
                padding: "1px 8px",
                borderRadius: 999,
              }}
            >
              {dash?.at_risk.length ?? 0}
            </span>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(dash?.at_risk ?? []).length === 0 && <Empty label="Nenhuma loja em risco" />}
            {(dash?.at_risk ?? []).map((s, i) => (
              <div
                key={s.store_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 4px",
                  borderTop: i ? "1px solid var(--crm-gray-100)" : "none",
                }}
              >
                <Glyph name={s.store_name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="truncate"
                    style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-gray-900)" }}
                  >
                    {s.store_name}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}
                  >
                    {s.client_name}
                    {s.mrr_cents ? ` · ${fmtBRL(s.mrr_cents)}/mês` : ""}
                  </div>
                </div>
                <span
                  className="crm-tnum"
                  style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-neg)" }}
                >
                  {s.health_score ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Carga por CSM">
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {(cargaCsm?.csms ?? []).length === 0 && <Empty label="Sem CSMs com carteira" />}
            {(cargaCsm?.csms ?? []).map((c) => (
              <div key={c.owner_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Glyph name={c.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--crm-gray-700)" }}>
                      {c.name.split(" ")[0]}
                    </span>
                    <span className="crm-tnum" style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}>
                      {c.n} lojas{c.risk ? ` · ${c.risk} risco` : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      background: "var(--crm-gray-100)",
                      borderRadius: 5,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(c.n / maxCsm) * 100}%`,
                        height: "100%",
                        background: c.risk ? "var(--crm-amber)" : "var(--crm-brand)",
                        borderRadius: 5,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────
function KpiCard({
  icon,
  label,
  value,
  unit,
  delta,
  deltaTone,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  delta: string
  deltaTone: "pos" | "neg" | "neut"
  sub: string
}) {
  const toneColor =
    deltaTone === "pos"
      ? "var(--crm-pos)"
      : deltaTone === "neg"
        ? "var(--crm-neg)"
        : "var(--crm-gray-500)"
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-gray-200)",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--crm-blue-50)",
            color: "var(--crm-brand)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--crm-gray-500)" }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span
          className="crm-tnum"
          style={{ fontSize: 28, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.03em" }}
        >
          {value}
        </span>
        {unit && (
          <span className="crm-tnum" style={{ fontSize: 13, fontWeight: 500, color: "var(--crm-gray-400)" }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6 }}>
        {delta && (
          <span className="crm-tnum" style={{ fontSize: 11, fontWeight: 700, color: toneColor }}>
            {delta}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--crm-gray-400)" }}>{sub}</span>
      </div>
    </div>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-gray-200)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "15px 18px",
          borderBottom: "1px solid var(--crm-gray-100)",
        }}
      >
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "16px 8px",
        textAlign: "center",
        fontSize: 11.5,
        color: "var(--crm-gray-400)",
      }}
    >
      {label}
    </div>
  )
}
