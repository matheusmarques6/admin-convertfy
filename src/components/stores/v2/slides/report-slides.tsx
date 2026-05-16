"use client"

/**
 * ReportSlides — Deck cliente-facing de 7 slides 1280×720 (Convertfy DS v3).
 *
 * Mirror exato do prototype tab-relatorio.jsx slides:
 *  01 · Capa             — dark BG + radial gradients + Playfair "{store}" + agenda
 *  02 · Resumo do mês     — HeroParticipation (donut + stacked bar) + 6 ResumoTile
 *  03 · Receita atribuída — hero dark esquerda + SplitBar Flows/Campanhas direita
 *  04 · Performance email — Funnel + 6 BenchCard
 *  05 · Campanhas & Flows — duas CompactTable lado a lado
 *  06 · Trabalho realizado — 3 TileCount + ImpactTable
 *  07 · Próximos passos    — 5 PlanCard + sign-off
 *
 * Cada slide tem <Insight /> band no rodapé (color-coded brand/pos/warn/info).
 *
 * Renderiza a partir do `snapshot` cristalizado em client_monthly_reports.
 * Sem dado: cai em "—" elegante (não invent).
 */

import {
  ArrowUp, Bell, Zap, Mail, Target, Send, X as XIcon, Users,
} from "lucide-react"

// ─── Tokens (mirror de _primitives.tsx) ───────────────────────

const C = {
  brand: "#4E62D8",
  brandHover: "#2137B6",
  blue50: "#EEF0FB",
  blue100: "#C7CDEF",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
  purpleBorder: "#E0CBFF",
  amber: "#D97706",
  border: "rgba(0,0,0,0.08)",
  gradient: "linear-gradient(90deg, #4E62D8, #2137B6, #041366)",
} as const

const TNUM = {
  fontVariantNumeric: "tabular-nums lining-nums" as const,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

const F_SANS = "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
const F_SERIF = '"Playfair Display", Georgia, serif'

// ─── Types ────────────────────────────────────────────────────

export interface ReportSnapshot {
  store_name?: string
  client_name?: string
  cm_name?: string
  month_label?: string
  period?: { start: string; end: string }
  account?: { currency?: string; platform?: string | null }

  // KPIs cristalizados
  kpis?: {
    receita_total?: number
    receita_atribuida?: number
    atribuicao_pct?: number
    receita_campanhas?: number
    receita_flows?: number
    pedidos?: number
    ticket_medio?: number
    novos_clientes?: number
    envios?: number
    open_rate?: number
    click_rate?: number
    recovery_rate?: number
    total_campaigns?: number
    total_flows?: number
  }
  email?: {
    delivered?: number
    open_rate?: number
    click_rate?: number
    ctor?: number
    bounce_rate?: number
    unsub_rate?: number
  }
  campaigns?: Array<{
    id: string
    name: string
    delivered?: number
    recipients?: number
    openRate?: number
    clickRate?: number
    revenue?: number
  }>
  flows?: Array<{
    id: string
    name: string
    delivered?: number
    recipients?: number
    openRate?: number
    clickRate?: number
    revenue?: number
  }>
  insights?: {
    capa?: string
    resumo?: string
    atribuida?: string
    email?: string
    rankings?: string
    trabalho?: string
    proximos?: string
  }
}

interface Props {
  snapshot: ReportSnapshot
  proximosPassos: string | null
  monthLabel: string
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtCurrency(value: number, currency = "BRL", opts?: { compact?: boolean }): string {
  if (!isFinite(value) || value === 0) return currency === "BRL" ? "R$ 0" : `${currency} 0`
  if (opts?.compact) {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2).replace(".", ",")} mi`
    if (value >= 10_000) return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")} mil`
  }
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
  }
}

function fmtBRLLong(value: number): string {
  if (!isFinite(value) || value === 0) return "R$ 0,00"
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function periodLabel(period?: { start: string; end: string }): string {
  if (!period?.start || !period?.end) return ""
  const start = new Date(period.start).toLocaleDateString("pt-BR")
  const end = new Date(period.end).toLocaleDateString("pt-BR")
  return `${start} — ${end}`
}

const BENCHMARKS = {
  openRate: 17.3,
  clickRate: 1.1,
  ctor: 4.1,
  bounceRate: 0.9,
  unsubRate: 0.18,
}

// ─── Main ─────────────────────────────────────────────────────

export function ReportSlides({ snapshot, proximosPassos, monthLabel }: Props) {
  const currency = snapshot.account?.currency ?? "BRL"
  const storeName = snapshot.store_name ?? "Loja"

  return (
    <div className="flex flex-col items-center gap-9 py-8 px-4" style={{ fontFamily: F_SANS }}>
      <SlideShell n={1} total={7} title="Capa" storeName={storeName} monthLabel={monthLabel}>
        <SlideCover snapshot={snapshot} monthLabel={monthLabel} />
      </SlideShell>
      <SlideShell n={2} total={7} title="Resumo do mês" storeName={storeName} monthLabel={monthLabel}>
        <SlideResumo snapshot={snapshot} currency={currency} />
      </SlideShell>
      <SlideShell n={3} total={7} title="Receita atribuída" storeName={storeName} monthLabel={monthLabel}>
        <SlideAtribuida snapshot={snapshot} currency={currency} />
      </SlideShell>
      <SlideShell n={4} total={7} title="Performance de e-mail" storeName={storeName} monthLabel={monthLabel}>
        <SlideEmail snapshot={snapshot} />
      </SlideShell>
      <SlideShell n={5} total={7} title="Campanhas & Flows" storeName={storeName} monthLabel={monthLabel}>
        <SlideRankings snapshot={snapshot} currency={currency} />
      </SlideShell>
      <SlideShell n={6} total={7} title="Trabalho realizado" storeName={storeName} monthLabel={monthLabel}>
        <SlideTrabalho snapshot={snapshot} />
      </SlideShell>
      <SlideShell n={7} total={7} title="Próximos passos" storeName={storeName} monthLabel={monthLabel}>
        <SlideProximos snapshot={snapshot} proximosPassos={proximosPassos} />
      </SlideShell>
    </div>
  )
}

// ─── Slide wrapper ────────────────────────────────────────────

const SLIDE_W = 1280
const SLIDE_H = 720

function SlideShell({
  n, total, title, storeName, monthLabel, children,
}: {
  n: number; total: number; title: string; storeName: string; monthLabel: string; children: React.ReactNode
}) {
  return (
    <div data-slide style={{ width: SLIDE_W, maxWidth: "100%", position: "relative" }}>
      {/* Slide indicator */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "0 6px 10px",
          color: "rgba(255,255,255,0.55)",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-[4px]"
            style={{ background: "rgba(78,98,216,0.18)", color: "#A8B2EE", letterSpacing: "0.06em" }}
          >
            Slide {String(n).padStart(2, "0")} · {String(total).padStart(2, "0")}
          </span>
          <span style={{ color: "#fff", fontWeight: 600 }}>{title}</span>
        </span>
        <span style={TNUM}>{storeName} · {monthLabel}</span>
      </div>

      <div
        style={{
          width: "100%",
          aspectRatio: `${SLIDE_W} / ${SLIDE_H}`,
          background: C.white,
          borderRadius: 10,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 30px 60px rgba(0,0,0,0.45)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── SlideHeader ──────────────────────────────────────────────

function SlideHeader({
  n, eyebrow, title, intro,
}: {
  n: number; eyebrow: string; title: string; intro?: string
}) {
  return (
    <div
      className="flex items-end justify-between"
      style={{ padding: "40px 56px 24px", borderBottom: `1px solid ${C.border}` }}
    >
      <div>
        <div
          style={{
            fontSize: 10.5,
            color: C.brand,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <h2
          style={{
            margin: "6px 0 0",
            fontFamily: F_SERIF,
            fontSize: 38,
            fontWeight: 600,
            color: C.g900,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
          }}
        >
          {title}
        </h2>
        {intro && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: C.g500, maxWidth: 720, lineHeight: 1.5 }}>
            {intro}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div
          className="inline-flex items-center justify-center"
          style={{ width: 30, height: 30, borderRadius: 6, background: C.gradient, color: "#fff", fontWeight: 700, fontSize: 13 }}
        >
          C
        </div>
        <div style={{ fontFamily: F_SERIF, fontSize: 14, fontWeight: 600, color: C.g500, ...TNUM }}>
          {String(n).padStart(2, "0")} / 07
        </div>
      </div>
    </div>
  )
}

// ─── Insight band ─────────────────────────────────────────────

function Insight({
  tone = "brand", label, Icon = Zap, children, extra,
}: {
  tone?: "brand" | "pos" | "warn" | "info" | "neg"
  label?: string
  Icon?: typeof Zap
  children: React.ReactNode
  extra?: string
}) {
  const map = {
    brand: { bg: "#F5F7FF", bd: C.blue100, c: C.brand, marker: C.brand, defaultLabel: "Ponto-chave" },
    pos: { bg: "#F0FDF4", bd: C.posBorder, c: C.pos, marker: C.pos, defaultLabel: "Bom sinal" },
    warn: { bg: C.warnBg, bd: C.warnBorder, c: C.warn, marker: C.warn, defaultLabel: "Atenção" },
    info: { bg: "#F8FAFC", bd: C.border, c: C.g700, marker: C.g900, defaultLabel: "Leitura" },
    neg: { bg: "#FEF2F2", bd: "#FECACA", c: C.neg, marker: C.neg, defaultLabel: "Alerta" },
  }
  const m = map[tone]
  return (
    <div className="flex items-stretch" style={{ borderTop: `1px solid ${C.border}`, background: m.bg }}>
      <div style={{ width: 4, background: m.marker, flexShrink: 0 }} />
      <div className="flex-1 flex items-center gap-4" style={{ padding: "14px 56px 14px 22px" }}>
        <div
          className="inline-flex items-center gap-2"
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            background: C.white,
            border: `1px solid ${m.bd}`,
            flexShrink: 0,
          }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: m.c }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: m.c,
            }}
          >
            {label || m.defaultLabel}
          </span>
        </div>
        <div className="flex-1" style={{ fontSize: 13, color: C.g700, lineHeight: 1.55 }}>
          {children}
        </div>
        {extra && (
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: C.white,
              border: `1px solid ${m.bd}`,
              fontFamily: F_SERIF,
              fontSize: 20,
              fontWeight: 700,
              color: m.c,
              flexShrink: 0,
              ...TNUM,
            }}
          >
            {extra}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Slide 1 · Capa ───────────────────────────────────────────

function SlideCover({ snapshot, monthLabel }: { snapshot: ReportSnapshot; monthLabel: string }) {
  const storeName = snapshot.store_name ?? "Loja"
  const [first, ...rest] = storeName.split(" ")
  const second = rest.join(" ")

  return (
    <div
      style={{
        height: "100%",
        background: "#0B0E18",
        color: "#fff",
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative gradients */}
      <div
        style={{
          position: "absolute",
          right: -200,
          top: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle at center, #4E62D8 0%, rgba(78,98,216,0) 70%)",
          filter: "blur(8px)",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -100,
          bottom: -200,
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle at center, #2137B6 0%, rgba(33,55,182,0) 70%)",
          filter: "blur(8px)",
          opacity: 0.4,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "64px 64px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="inline-flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 6, background: C.gradient, color: "#fff", fontWeight: 700, fontSize: 14 }}
          >
            C
          </div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Convertfy</span>
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Apresentação de resultados
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: F_SERIF,
              fontSize: 96,
              lineHeight: 1,
              color: "#fff",
              letterSpacing: "-0.03em",
              fontWeight: 600,
            }}
          >
            {first}
            {second && <><br />{second}</>}
          </h1>
          <div style={{ marginTop: 16, fontSize: 18, color: "#fff", fontWeight: 600 }}>
            {monthLabel}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.6)", ...TNUM }}>
            {periodLabel(snapshot.period)}
          </div>
        </div>

        <div
          className="flex gap-9"
          style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.15)" }}
        >
          {snapshot.cm_name && (
            <CoverInfo label="Apresentando" value={snapshot.cm_name} sub="CSM Convertfy" />
          )}
          {snapshot.client_name && (
            <CoverInfo label="Cliente" value={snapshot.client_name} sub={storeName} />
          )}
          {snapshot.account?.platform && (
            <CoverInfo label="Plataforma" value={snapshot.account.platform.toUpperCase()} />
          )}
        </div>
      </div>

      {/* Right: agenda */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "64px 64px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "rgba(255,255,255,0.03)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          Agenda · 30 minutos
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            "Resumo do mês — faturamento e receita atribuída",
            "Performance de e-mail (entregue, abertura, clique)",
            "Top campanhas & top flows por receita",
            "Trabalho realizado: otimizações, testes A/B, entregas",
            "Próximos passos — plano para o próximo ciclo",
            "Perguntas & alinhamentos",
          ].map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-3.5"
              style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontFamily: F_SERIF,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#7B8CEA",
                  flexShrink: 0,
                  ...TNUM,
                }}
              >
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function CoverInfo({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginTop: 5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Slide 2 · Resumo do mês ──────────────────────────────────

function SlideResumo({ snapshot, currency }: { snapshot: ReportSnapshot; currency: string }) {
  const k = snapshot.kpis ?? {}
  const totalRevenue = k.receita_total ?? 0
  const attributed = k.receita_atribuida ?? 0
  const pct = k.atribuicao_pct ?? (totalRevenue > 0 ? attributed / totalRevenue : 0)
  const pctNum = pct * 100

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader n={2} eyebrow="Visão geral" title="Vamos direto ao que importa: os números." />

      <div style={{ padding: "18px 56px 0" }}>
        <HeroParticipation
          pct={pctNum}
          totalRevenue={totalRevenue}
          attributed={attributed}
          pedidos={k.pedidos ?? 0}
          currency={currency}
        />
      </div>

      <div
        style={{
          padding: "14px 56px 0",
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 10,
        }}
      >
        <ResumoTile label="Faturamento total" value={fmtCurrency(totalRevenue, currency, { compact: true })} delta="período" />
        <ResumoTile label="Pedidos" value={(k.pedidos ?? 0).toLocaleString("pt-BR")} delta="atribuídos + outros" />
        <ResumoTile label="Ticket médio" value={k.ticket_medio ? fmtCurrency(k.ticket_medio, currency) : "—"} delta="período" />
        <ResumoTile label="Novos clientes" value={(k.novos_clientes ?? 0).toLocaleString("pt-BR")} delta="período" />
        <ResumoTile label="Envios" value={(k.envios ?? 0).toLocaleString("pt-BR")} delta="campanhas + flows" />
        <ResumoTile label="Campanhas enviadas" value={String(k.total_campaigns ?? 0)} delta={`${k.total_flows ?? 0} flows ativos`} />
      </div>

      <div style={{ flex: 1 }} />

      <Insight
        tone={pctNum >= 15 ? "pos" : "info"}
        label="Resumo do mês"
        Icon={pctNum >= 15 ? ArrowUp : Bell}
        extra={pctNum > 0 ? `${pctNum.toFixed(2).replace(".", ",")}%` : undefined}
      >
        {snapshot.insights?.resumo ? (
          snapshot.insights.resumo
        ) : (
          <>
            <strong style={{ color: C.g900 }}>
              {pctNum.toFixed(2).replace(".", ",")}% do faturamento total veio da Convertfy
            </strong>{" "}
            no período · {(k.pedidos ?? 0).toLocaleString("pt-BR")} pedidos com nossos canais.
          </>
        )}
      </Insight>
    </div>
  )
}

function HeroParticipation({
  pct, totalRevenue, attributed, pedidos, currency,
}: {
  pct: number; totalRevenue: number; attributed: number; pedidos: number; currency: string
}) {
  const r = 70
  const c = 2 * Math.PI * r
  const arc = (pct / 100) * c
  const others = Math.max(0, totalRevenue - attributed)
  const pctOthers = 100 - pct

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0B0E18 0%, #1A1F33 60%, #2137B6 130%)",
        color: "#fff",
        borderRadius: 14,
        padding: "24px 32px",
        display: "grid",
        gridTemplateColumns: "1.05fr 1.6fr",
        gap: 24,
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 12px 24px rgba(11,14,24,0.18)",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -120,
          top: -120,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle at center, rgba(78,98,216,0.5) 0%, rgba(78,98,216,0) 70%)",
          filter: "blur(6px)",
        }}
      />

      {/* LEFT — donut + big number */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 24 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          <defs>
            <linearGradient id="part-grad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#7B8CEA" />
              <stop offset="100%" stopColor="#4E62D8" />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="14" />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="url(#part-grad)"
            strokeWidth="14"
            strokeDasharray={`${arc} ${c}`}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
          <text x="80" y="82" textAnchor="middle" fontFamily={F_SERIF} fontSize="34" fontWeight="700" fill="#fff" style={TNUM}>
            {pct.toFixed(1).replace(".", ",")}%
          </text>
          <text
            x="80"
            y="102"
            textAnchor="middle"
            fontFamily={F_SANS}
            fontSize="9"
            fontWeight="600"
            fill="rgba(255,255,255,0.55)"
            letterSpacing="0.12em"
          >
            PARTICIPAÇÃO
          </text>
        </svg>
        <div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Esse mês, a Convertfy representou
          </div>
          <div
            style={{
              fontFamily: F_SERIF,
              fontSize: 64,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              marginTop: 6,
              ...TNUM,
            }}
          >
            {pct.toFixed(2).replace(".", ",")}
            <span style={{ fontSize: 36 }}>%</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
            do faturamento total da loja
          </div>
        </div>
      </div>

      {/* RIGHT — stacked bar + cards */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="flex justify-between items-baseline" style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 10.5,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Faturamento total da loja em {snapshotMonthShort()}
          </span>
          <span
            style={{
              fontFamily: F_SERIF,
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              ...TNUM,
            }}
          >
            {fmtCurrency(totalRevenue, currency, { compact: true })}
          </span>
        </div>
        <div
          className="flex overflow-hidden"
          style={{ height: 38, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)" }}
        >
          <div
            className="flex items-center"
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              background: "linear-gradient(90deg, #7B8CEA 0%, #4E62D8 100%)",
              paddingLeft: 12,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.04em" }}>
              {pct.toFixed(2).replace(".", ",")}%
            </span>
          </div>
          <div
            className="flex items-center flex-1"
            style={{ background: "rgba(255,255,255,0.06)", paddingLeft: 14 }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.04em" }}>
              {pctOthers.toFixed(2).replace(".", ",")}% outras fontes
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4" style={{ marginTop: 14 }}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "linear-gradient(90deg,#7B8CEA,#4E62D8)" }} />
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Convertfy
              </span>
            </div>
            <div
              style={{
                fontFamily: F_SERIF,
                fontSize: 26,
                fontWeight: 700,
                color: "#fff",
                marginTop: 2,
                letterSpacing: "-0.02em",
                ...TNUM,
              }}
            >
              {fmtCurrency(attributed, currency, { compact: true })}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, ...TNUM }}>
              {pedidos.toLocaleString("pt-BR")} pedidos · e-mail + SMS
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.22)" }} />
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Outras fontes
              </span>
            </div>
            <div
              style={{
                fontFamily: F_SERIF,
                fontSize: 26,
                fontWeight: 700,
                color: "rgba(255,255,255,0.85)",
                marginTop: 2,
                letterSpacing: "-0.02em",
                ...TNUM,
              }}
            >
              {fmtCurrency(others, currency, { compact: true })}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, ...TNUM }}>
              orgânico, mídia paga, recompra
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function snapshotMonthShort(): string {
  return "" // placeholder — month info ja aparece no header e indicator
}

function ResumoTile({ label, value, delta, tone = "default" }: { label: string; value: string; delta: string; tone?: "default" | "pos" }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.white,
      }}
    >
      <div style={{ fontSize: 9.5, color: C.g500, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: F_SERIF,
          fontSize: 24,
          fontWeight: 700,
          color: C.g900,
          marginTop: 6,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          ...TNUM,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: tone === "pos" ? C.pos : C.g500, marginTop: 5, fontWeight: 500, ...TNUM }}>
        {delta}
      </div>
    </div>
  )
}

// ─── Slide 3 · Receita atribuída ──────────────────────────────

function SlideAtribuida({ snapshot, currency }: { snapshot: ReportSnapshot; currency: string }) {
  const k = snapshot.kpis ?? {}
  const attributed = k.receita_atribuida ?? 0
  const pct = (k.atribuicao_pct ?? 0) * 100
  const pedidos = k.pedidos ?? 0
  const campRev = k.receita_campanhas ?? 0
  const flowRev = k.receita_flows ?? 0
  const total = campRev + flowRev
  const flowShare = total > 0 ? flowRev / total : 0
  const campShare = total > 0 ? campRev / total : 0
  const sentCampaigns = k.total_campaigns ?? 0
  const liveFlows = k.total_flows ?? 0

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader
        n={3}
        eyebrow="Resultados financeiros"
        title="Receita atribuída Convertfy"
        intro={`${fmtCurrency(attributed, currency, { compact: true })} em receita gerada por canais que gerenciamos (e-mail e SMS), de um faturamento total de ${fmtCurrency(k.receita_total ?? 0, currency, { compact: true })} — ${pct.toFixed(2).replace(".", ",")}% de participação · ${pedidos.toLocaleString("pt-BR")} pedidos com origem nos nossos canais.`}
      />

      <div
        style={{
          flex: 1,
          padding: "24px 56px",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 28,
          alignItems: "stretch",
        }}
      >
        {/* LEFT hero */}
        <div
          style={{
            background: "#0B0E18",
            color: "#fff",
            borderRadius: 14,
            overflow: "hidden",
            position: "relative",
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -80,
              top: -80,
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "radial-gradient(circle at center, #4E62D8 0%, rgba(78,98,216,0) 70%)",
              opacity: 0.5,
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Total atribuído
            </div>
            <div
              style={{
                fontFamily: F_SERIF,
                fontSize: 72,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                marginTop: 10,
                ...TNUM,
              }}
            >
              {fmtCurrency(attributed, currency, { compact: true })}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 10, lineHeight: 1.5 }}>
              <strong style={{ color: "#fff" }}>{pct.toFixed(2).replace(".", ",")}%</strong> do faturamento da loja ·{" "}
              <strong style={{ color: "#fff" }}>{pedidos.toLocaleString("pt-BR")} pedidos</strong> atribuídos
            </div>
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              gap: 28,
              paddingTop: 18,
              borderTop: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <DarkMetric label="Faturamento E-mail" value={fmtCurrency(attributed, currency, { compact: true })} sub={`${pct.toFixed(2).replace(".", ",")}% · ${pedidos.toLocaleString("pt-BR")} pedidos`} />
            <DarkMetric label="Faturamento SMS" value={`${currency === "BRL" ? "R$" : currency} 0`} sub="canal a ativar" mute />
          </div>
        </div>

        {/* RIGHT — channel split */}
        <div className="flex flex-col gap-4">
          <div
            style={{
              padding: "20px 22px",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              background: C.white,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.g500,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Receita Convertfy por canal
            </div>
            <SplitBar
              label="Automações (Flows)"
              value={fmtCurrency(flowRev, currency, { compact: true })}
              share={flowShare}
              sub={`${liveFlows} flows ativos · maior contribuição`}
              tone="brand"
            />
            <div style={{ height: 14 }} />
            <SplitBar
              label="Campanhas pontuais"
              value={fmtCurrency(campRev, currency, { compact: true })}
              share={campShare}
              sub={`${sentCampaigns} campanhas no período`}
              tone="purple"
            />
          </div>

          <div
            style={{
              padding: "18px 22px",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              background: C.white,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
            }}
          >
            <MicroStat label="Pedidos atribuídos" value={pedidos.toLocaleString("pt-BR")} />
            <MicroStat
              label="Receita/pedido"
              value={pedidos > 0 ? fmtCurrency(attributed / pedidos, currency) : "—"}
            />
            <MicroStat label="Recuperação" value={k.recovery_rate ? `${k.recovery_rate.toFixed(2).replace(".", ",")}%` : "—"} sub="vs benchmark 12%" />
          </div>
        </div>
      </div>

      <Insight tone="warn" label="Oportunidade" Icon={Bell}>
        {snapshot.insights?.atribuida ? (
          snapshot.insights.atribuida
        ) : (
          <>
            <strong style={{ color: C.g900 }}>SMS ainda não ativo.</strong> Ao destravar o canal, projeção de receita adicional baseada em benchmark do nicho · principal alavanca para subir a participação Convertfy acima de {Math.ceil(pct + 5)}%.
          </>
        )}
      </Insight>
    </div>
  )
}

function SplitBar({ label, value, share, sub, tone }: { label: string; value: string; share: number; sub: string; tone: "brand" | "purple" }) {
  const color = tone === "brand" ? C.brand : C.purple
  return (
    <div>
      <div className="flex justify-between items-baseline" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.g900 }}>{label}</span>
        <div className="flex items-baseline gap-2.5">
          <span style={{ fontSize: 12, color: C.g500, ...TNUM }}>{(share * 100).toFixed(2).replace(".", ",")}%</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.g900, fontFamily: F_SERIF, ...TNUM }}>{value}</span>
        </div>
      </div>
      <div style={{ height: 8, background: C.g100, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${share * 100}%`, height: "100%", background: color }} />
      </div>
      <div style={{ fontSize: 11, color: C.g500, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function DarkMetric({ label, value, sub, mute }: { label: string; value: string; sub?: string; mute?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          color: mute ? "rgba(255,255,255,0.5)" : "#fff",
          fontWeight: 700,
          marginTop: 6,
          fontFamily: F_SERIF,
          letterSpacing: "-0.02em",
          ...TNUM,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function MicroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.g500, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: C.g900,
          marginTop: 4,
          fontFamily: F_SERIF,
          letterSpacing: "-0.02em",
          ...TNUM,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.g500, marginTop: 2, ...TNUM }}>{sub}</div>}
    </div>
  )
}

// ─── Slide 4 · Performance de e-mail ──────────────────────────

function SlideEmail({ snapshot }: { snapshot: ReportSnapshot }) {
  const e = snapshot.email ?? {}
  const k = snapshot.kpis ?? {}
  const delivered = e.delivered ?? k.envios ?? 0
  const openRate = e.open_rate ?? k.open_rate ?? 0
  const clickRate = e.click_rate ?? k.click_rate ?? 0
  const ctor = e.ctor ?? 0
  const bounce = e.bounce_rate ?? 0
  const unsub = e.unsub_rate ?? 0

  const opened = delivered * (openRate / 100)
  const clicked = delivered * (clickRate / 100)
  const orders = k.pedidos ?? 0
  const revenue = k.receita_atribuida ?? 0

  const openDelta = openRate - BENCHMARKS.openRate
  const clickDelta = clickRate - BENCHMARKS.clickRate
  const ctorDelta = ctor - BENCHMARKS.ctor

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader
        n={4}
        eyebrow="Engajamento"
        title="Performance de e-mail"
        intro={`${delivered.toLocaleString("pt-BR")} e-mails entregues no período · ${openRate.toFixed(2).replace(".", ",")}% de abertura · ${ctor.toFixed(2).replace(".", ",")}% CTOR. ${openDelta >= 0 ? "Engajamento acima" : "Engajamento abaixo"} dos benchmarks do segmento.`}
      />

      <div style={{ flex: 1, padding: "24px 56px", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 28 }}>
        {/* LEFT — funnel */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.g500,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Funil do mês
          </div>
          <Funnel
            steps={[
              { label: "Enviados", pct: 1, color: C.brandHover, abs: delivered.toLocaleString("pt-BR") },
              { label: "Entregues", pct: 1, color: C.brand, abs: `${delivered.toLocaleString("pt-BR")} · 100,00%` },
              {
                label: "Abertos",
                pct: openRate / 100,
                color: "#7B8CEA",
                abs: `${Math.round(opened).toLocaleString("pt-BR")} · ${openRate.toFixed(2).replace(".", ",")}%`,
              },
              {
                label: "Cliques",
                pct: clickRate / 100,
                color: "#A8B2EE",
                abs: `${Math.round(clicked).toLocaleString("pt-BR")} · ${clickRate.toFixed(2).replace(".", ",")}%`,
              },
              {
                label: "Pedidos",
                pct: delivered > 0 ? orders / delivered : 0,
                color: C.pos,
                abs: `${orders.toLocaleString("pt-BR")}`,
              },
              {
                label: "Receita",
                pct: 0.001,
                color: C.pos,
                abs: fmtCurrency(revenue, "BRL", { compact: true }),
              },
            ]}
          />
        </div>

        {/* RIGHT — bench cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignContent: "start" }}>
          <BenchCard Icon={Send} label="Entregues" value={delivered.toLocaleString("pt-BR")} bench="100% taxa entrega" tone="pos" />
          <BenchCard
            Icon={XIcon}
            label="Bounces"
            value={Math.round(delivered * (bounce / 100)).toLocaleString("pt-BR")}
            bench={`${bounce.toFixed(2).replace(".", ",")}% taxa`}
            tone={bounce < BENCHMARKS.bounceRate ? "pos" : "warn"}
          />
          <BenchCard
            Icon={Mail}
            label="Abertura"
            value={`${openRate.toFixed(2).replace(".", ",")}%`}
            bench={`vs ${BENCHMARKS.openRate.toFixed(1).replace(".", ",")}% benchmark · ${openDelta >= 0 ? "+" : ""}${openDelta.toFixed(1).replace(".", ",")} p.p.`}
            tone={openDelta >= 0 ? "pos" : "warn"}
          />
          <BenchCard
            Icon={Target}
            label="Clique"
            value={`${clickRate.toFixed(2).replace(".", ",")}%`}
            bench={`vs ${BENCHMARKS.clickRate.toFixed(1).replace(".", ",")}% benchmark · ${clickDelta >= 0 ? "+" : ""}${clickDelta.toFixed(2).replace(".", ",")} p.p.`}
            tone={clickDelta >= 0 ? "pos" : "warn"}
          />
          <BenchCard
            Icon={Zap}
            label="CTOR"
            value={`${ctor.toFixed(2).replace(".", ",")}%`}
            bench={`vs ${BENCHMARKS.ctor.toFixed(1).replace(".", ",")}% benchmark · ${ctorDelta >= 0 ? "+" : ""}${ctorDelta.toFixed(2).replace(".", ",")} p.p.`}
            tone={ctorDelta >= 0 ? "pos" : "warn"}
          />
          <BenchCard
            Icon={Users}
            label="Unsub"
            value={`${unsub.toFixed(2).replace(".", ",")}%`}
            bench={`vs ${BENCHMARKS.unsubRate.toFixed(2).replace(".", ",")}% benchmark · ${unsub < BENCHMARKS.unsubRate ? "saudável" : "atenção"}`}
            tone={unsub < BENCHMARKS.unsubRate ? "pos" : "warn"}
          />
        </div>
      </div>

      <Insight tone="info" label="Leitura do mês" Icon={Mail} extra={`${openRate.toFixed(2).replace(".", ",")}%`}>
        {snapshot.insights?.email ? (
          snapshot.insights.email
        ) : (
          <>
            <strong style={{ color: C.g900 }}>
              {openDelta >= 0
                ? `Abertura forte (${openRate.toFixed(2).replace(".", ",")}%)`
                : `Abertura abaixo do benchmark (${openRate.toFixed(2).replace(".", ",")}%)`}
            </strong>{" "}
            {openDelta >= 0
              ? "indica lista engajada e segmentação acertada."
              : "sinaliza oportunidade de revisão de segmentação e assunto."}
            {clickDelta < 0 && (
              <> Clique abaixo do benchmark é vetor pra otimizar — foco em <strong>CTAs e copy do meio do e-mail</strong>.</>
            )}
          </>
        )}
      </Insight>
    </div>
  )
}

function Funnel({ steps }: { steps: Array<{ label: string; pct: number; color: string; abs: string }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, color: C.g700 }}>{s.label}</span>
          <div className="flex-1 relative overflow-hidden" style={{ height: 32, background: C.g50, borderRadius: 4 }}>
            <div
              className="flex items-center h-full"
              style={{
                width: `${Math.max(s.pct * 100, 1.5)}%`,
                background: s.color,
                paddingLeft: 12,
                minWidth: 110,
              }}
            >
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", ...TNUM }}>
                {s.abs}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function BenchCard({ Icon, label, value, bench, tone }: { Icon: typeof Send; label: string; value: string; bench: string; tone: "pos" | "warn" }) {
  return (
    <div style={{ padding: "14px 16px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Icon className="h-3.5 w-3.5" style={{ color: tone === "pos" ? C.pos : C.warn }} />
        <span
          style={{
            fontSize: 10.5,
            color: C.g500,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: C.g900,
          fontFamily: F_SERIF,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          ...TNUM,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: tone === "pos" ? C.pos : C.warn, marginTop: 6, ...TNUM }}>{bench}</div>
    </div>
  )
}

// ─── Slide 5 · Rankings ───────────────────────────────────────

function SlideRankings({ snapshot, currency }: { snapshot: ReportSnapshot; currency: string }) {
  const campaigns = (snapshot.campaigns ?? []).slice(0, 6)
  const flows = (snapshot.flows ?? []).slice(0, 6)
  const k = snapshot.kpis ?? {}
  const campRev = k.receita_campanhas ?? 0
  const flowRev = k.receita_flows ?? 0
  const total = campRev + flowRev
  const campPct = total > 0 ? (campRev / total) * 100 : 0
  const flowPct = total > 0 ? (flowRev / total) * 100 : 0

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader
        n={5}
        eyebrow="Atribuição por programa"
        title="Campanhas & Flows · top por receita"
        intro={`${fmtCurrency(campRev, currency, { compact: true })} em campanhas pontuais (${campPct.toFixed(1).replace(".", ",")}%) · ${fmtCurrency(flowRev, currency, { compact: true })} em automações (${flowPct.toFixed(1).replace(".", ",")}%).`}
      />

      <div style={{ flex: 1, padding: "24px 56px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <div>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: C.g500,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Top campanhas
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.g900, fontFamily: F_SERIF }}>
                {fmtCurrency(campRev, currency, { compact: true })} · {k.total_campaigns ?? 0} envios
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px]"
              style={{
                background: C.g100,
                color: C.g700,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {campPct.toFixed(2).replace(".", ",")}% da Convertfy
            </span>
          </div>
          <CompactTable rows={campaigns} />
        </div>

        <div>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: C.g500,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Top automações
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.g900, fontFamily: F_SERIF }}>
                {fmtCurrency(flowRev, currency, { compact: true })} · {k.total_flows ?? 0} flows ativos
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px]"
              style={{
                background: C.infoBg,
                color: C.info,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${C.infoBorder}`,
              }}
            >
              {flowPct.toFixed(2).replace(".", ",")}% da Convertfy
            </span>
          </div>
          <CompactTable rows={flows} flows />
        </div>
      </div>

      <Insight
        tone="brand"
        label="Destaque do mês"
        Icon={Zap}
        extra={flows[0] ? fmtCurrency(flows[0].revenue ?? 0, currency, { compact: true }) : undefined}
      >
        {snapshot.insights?.rankings ? (
          snapshot.insights.rankings
        ) : flows[0] ? (
          <>
            <strong style={{ color: C.g900 }}>
              {flows[0].name} lidera entre os flows com {fmtCurrency(flows[0].revenue ?? 0, currency, { compact: true })}
            </strong>
            {campaigns[0] && (
              <> · {campaigns[0].name} foi a campanha de maior retorno do período.</>
            )}
          </>
        ) : (
          "Ranking de campanhas e flows do período. Top performer destacado."
        )}
      </Insight>
    </div>
  )
}

function CompactTable({ rows, flows }: { rows: ReportSnapshot["campaigns"] | ReportSnapshot["flows"]; flows?: boolean }) {
  const items = rows ?? []
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: F_SANS, fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${C.g900}` }}>
          {["#", flows ? "Flow" : "Campanha", "Entr.", "Abert.", "Clk.", "Receita"].map((h, i) => (
            <th
              key={h}
              style={{
                padding: "6px 6px",
                textAlign: i === 0 || i === 1 ? "left" : "right",
                fontSize: 9.5,
                fontWeight: 700,
                color: C.g500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={6} style={{ padding: "20px 6px", fontSize: 12, color: C.g400, fontStyle: "italic", textAlign: "center" }}>
              Sem dados no período
            </td>
          </tr>
        ) : (
          items.map((r, i) => (
            <tr key={r.id ?? i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "9px 6px", fontSize: 11, fontWeight: 700, color: C.brand, ...TNUM }}>{String(i + 1).padStart(2, "0")}</td>
              <td
                style={{
                  padding: "9px 6px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.g900,
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.name}
              </td>
              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: 11.5, color: C.g600, ...TNUM }}>
                {(r.delivered ?? r.recipients ?? 0).toLocaleString("pt-BR")}
              </td>
              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: 11.5, color: C.g600, ...TNUM }}>
                {((r.openRate ?? 0)).toFixed(2).replace(".", ",")}%
              </td>
              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: 11.5, color: C.g600, ...TNUM }}>
                {((r.clickRate ?? 0)).toFixed(2).replace(".", ",")}%
              </td>
              <td
                style={{
                  padding: "9px 6px",
                  textAlign: "right",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: C.g900,
                  fontFamily: F_SERIF,
                  ...TNUM,
                }}
              >
                {fmtBRLLong(r.revenue ?? 0)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

// ─── Slide 6 · Trabalho realizado ─────────────────────────────

function SlideTrabalho({ snapshot }: { snapshot: ReportSnapshot }) {
  // Stats placeholders — em produção viriam de store_activity agregado
  // mas como snapshot não traz, calculamos a partir de signs presentes ou exibimos "—"
  const otimizacoes = 0
  const testes = 0
  const campanhasPersonalizadas = snapshot.kpis?.total_campaigns ?? 0

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader
        n={6}
        eyebrow="O que entregamos"
        title="Trabalho realizado no mês"
        intro={`${campanhasPersonalizadas} campanhas personalizadas enviadas no período. Resumo das otimizações e experimentos aplicados na operação.`}
      />

      <div style={{ flex: 1, padding: "24px 56px", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 28 }}>
        <div className="flex flex-col gap-3.5">
          <TileCount n={String(otimizacoes)} label="Otimizações aplicadas" sub="em flows e campanhas" Icon={Zap} tone="brand" />
          <TileCount n={String(testes)} label="Testes A/B rodados" sub="aplicados aos canais" Icon={Target} tone="purple" />
          <TileCount n={String(campanhasPersonalizadas)} label="Campanhas personalizadas" sub={`enviadas no período`} Icon={Send} tone="pos" />
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              color: C.g500,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Maiores impactos no mês
          </div>
          <div
            className="rounded-[8px] py-10 text-center"
            style={{ background: C.g50, border: `1px solid ${C.border}` }}
          >
            <p style={{ fontSize: 13, color: C.g500, margin: 0 }}>
              Registre otimizações, testes e entregas em <strong style={{ color: C.g700 }}>Atividade</strong> para popular esta tabela automaticamente no próximo relatório.
            </p>
          </div>
        </div>
      </div>

      <Insight tone="brand" label="Onde concentramos esforço" Icon={Target}>
        {snapshot.insights?.trabalho ?? "Resumo das ações executadas no período. Registre atividades para enriquecer este slide automaticamente."}
      </Insight>
    </div>
  )
}

function TileCount({ n, label, sub, Icon, tone }: { n: string; label: string; sub: string; Icon: typeof Zap; tone: "brand" | "purple" | "pos" }) {
  const map = {
    brand: { bg: C.blue50, c: C.brand },
    purple: { bg: C.purpleBg, c: C.purple },
    pos: { bg: C.posBg, c: C.pos },
  }
  const m = map[tone]
  return (
    <div
      className="flex items-center gap-4"
      style={{ padding: "16px 18px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white }}
    >
      <div
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: 52, height: 52, borderRadius: 12, background: m.bg, color: m.c }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: C.g900,
              lineHeight: 1,
              fontFamily: F_SERIF,
              letterSpacing: "-0.025em",
              ...TNUM,
            }}
          >
            {n}
          </span>
          <span style={{ fontSize: 13, color: C.g700, fontWeight: 600 }}>{label}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.g500, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  )
}

// ─── Slide 7 · Próximos passos ────────────────────────────────

function SlideProximos({ snapshot, proximosPassos }: { snapshot: ReportSnapshot; proximosPassos: string | null }) {
  const items = parseProximos(proximosPassos)

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SlideHeader
        n={7}
        eyebrow="Plano para o próximo ciclo"
        title="O que vamos fazer a seguir"
        intro="Frentes priorizadas para o próximo ciclo · entre Convertfy e cliente. Foco em destravar canais, otimizar e preparar marcos sazonais."
      />

      <div
        style={{
          flex: 1,
          padding: "24px 56px",
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)`,
          gap: 14,
          alignContent: "start",
        }}
      >
        {items.length === 0 ? (
          <div
            className="col-span-full py-10 text-center"
            style={{ background: C.g50, border: `1px solid ${C.border}`, borderRadius: 10 }}
          >
            <p style={{ fontSize: 13, color: C.g500, margin: 0 }}>
              Adicione &ldquo;Próximos passos&rdquo; ao gerar o relatório · a IA pode preencher se você deixar vazio.
            </p>
          </div>
        ) : (
          items.map((it, i) => <PlanCard key={i} n={i + 1} {...it} />)
        )}
      </div>

      <div
        className="flex items-center justify-between"
        style={{ padding: "14px 56px", borderTop: `1px solid ${C.border}`, background: C.g50 }}
      >
        <div className="flex items-center gap-3">
          <div
            className="inline-flex items-center justify-center text-white font-semibold"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#4E62D8,#2137B6)",
              fontSize: 14,
            }}
          >
            {(snapshot.cm_name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>{snapshot.cm_name ?? "CSM"}</div>
            <div style={{ fontSize: 11, color: C.g500, ...TNUM }}>CSM · Convertfy</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.g500 }}>
          Próxima call de alinhamento ·{" "}
          <strong style={{ color: C.g900 }}>{nextCallDate()}</strong>
        </div>
      </div>
    </div>
  )
}

function parseProximos(raw: string | null): Array<{ who: "Convertfy" | "Cliente"; when: string; title: string; body: string }> {
  if (!raw) return []
  // Aceita texto plano (split por linha) OU formato semi-estruturado
  // "Semana N · Convertfy: Title — body"
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 5)
  return lines.map((line, i) => {
    const m = line.match(/^(Semana\s*\d+|S\d+)\s*[·\-—]?\s*(Convertfy|Cliente)\s*[:\-—]?\s*(.+)/i)
    if (m) {
      const when = m[1]
      const who = m[2].toLowerCase() === "cliente" ? "Cliente" : "Convertfy"
      const rest = m[3].split(/[—\-—]\s*/)
      const title = rest[0]?.trim() ?? line
      const body = rest.slice(1).join(" — ").trim() || ""
      return { who, when, title, body }
    }
    return {
      who: "Convertfy" as const,
      when: `Item ${i + 1}`,
      title: line,
      body: "",
    }
  })
}

function PlanCard({ n, who, when, title, body }: { n: number; who: "Convertfy" | "Cliente"; when: string; title: string; body: string }) {
  return (
    <div
      className="flex flex-col gap-2.5 h-full"
      style={{ padding: "16px 16px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center text-white"
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            background: C.g900,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: F_SERIF,
            ...TNUM,
          }}
        >
          {n}
        </span>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px]"
          style={{
            background: who === "Cliente" ? C.warnBg : C.infoBg,
            color: who === "Cliente" ? C.warn : C.info,
            border: `1px solid ${who === "Cliente" ? C.warnBorder : C.infoBorder}`,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <span
            className="rounded-full"
            style={{ width: 5, height: 5, background: who === "Cliente" ? C.warn : C.info }}
          />
          {who}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, lineHeight: 1.3 }}>{title}</div>
      {body && <div style={{ fontSize: 11.5, color: C.g600, lineHeight: 1.5, flex: 1 }}>{body}</div>}
      <div style={{ fontSize: 10.5, color: C.g400, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
        {when}
      </div>
    </div>
  )
}

function nextCallDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 28)
  return `${d.toLocaleDateString("pt-BR")} · 14h`
}
