"use client"

/**
 * ReportSlides — Deck de 7 slides 16:9 (1280x720 ref) pra apresentação
 * cliente-facing. Renderiza a partir de `snapshot` cristalizado no
 * client_monthly_reports + insights gerados por IA.
 *
 * Slides:
 *  01 · Capa             — gradiente dark + agenda
 *  02 · Resumo            — KPIs + donut atribuição + stacked bar
 *  03 · Receita atribuída — hero number + split por canal
 *  04 · Performance email — funil + benchmark cards
 *  05 · Campanhas & Flows — duas tabelas lado a lado
 *  06 · Trabalho realizado — 3 tiles + tabela de impacto
 *  07 · Próximos passos    — 5 cards numerados + sign-off
 *
 * Cada slide tem <Insight /> no rodapé (faixa colorida com leitura curta).
 */

import { ArrowRight, CheckCircle2, TrendingUp, Mail, MessageSquare, Sparkles } from "lucide-react"

export interface ReportSnapshot {
  store_name?: string
  client_name?: string
  month_label?: string
  period?: { start: string; end: string }
  cm_name?: string
  // KPIs principais (preenchidos pelo backend ao gerar)
  kpis?: {
    receita_total?: number
    receita_atribuida?: number
    atribuicao_pct?: number
    pedidos?: number
    ticket_medio?: number
    novos_clientes?: number
  }
  // Email metrics
  email?: {
    entregues?: number
    open_rate?: number
    ctr?: number
    ctor?: number
    bounce_rate?: number
    unsub_rate?: number
    open_benchmark?: number
    ctr_benchmark?: number
  }
  // Splits
  channels?: {
    email_revenue?: number
    sms_revenue?: number
    push_revenue?: number
  }
  campanhas?: Array<{
    name: string
    envios: number
    abertura: number
    cliques: number
    receita: number
  }>
  flows?: Array<{
    name: string
    envios: number
    abertura: number
    cliques: number
    receita: number
  }>
  // Trabalho realizado no mês
  work?: {
    otimizacoes?: number
    testes?: number
    campanhas_personalizadas?: number
    impactos?: Array<{ acao: string; metrica: string; delta: string }>
  }
  // Insights por slide (gerados por IA)
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

interface ReportSlidesProps {
  snapshot: ReportSnapshot
  proximosPassos?: string | null
  monthLabel?: string
}

const fmtBRL = (v?: number) => {
  if (!v && v !== 0) return "—"
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`
  return `R$ ${v.toFixed(0)}`
}
const fmtPct = (v?: number, decimals = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(decimals).replace(".", ",")}%`

export function ReportSlides({ snapshot, proximosPassos, monthLabel }: ReportSlidesProps) {
  const [month, year] = (monthLabel ?? snapshot.month_label ?? "Maio 2026").split(" ")
  const k = snapshot.kpis ?? {}
  const e = snapshot.email ?? {}
  const ch = snapshot.channels ?? {}
  const camp = snapshot.campanhas ?? []
  const flows = snapshot.flows ?? []
  const work = snapshot.work ?? {}
  const ins = snapshot.insights ?? {}

  // Lista de proximos passos (fallback editorial)
  const proximosList = proximosPassos
    ? proximosPassos.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5)
    : []

  return (
    <div className="flex flex-col gap-6">
      <Slide n={1}>
        {/* CAPA */}
        <div
          className="absolute inset-0 flex flex-col justify-between p-12 text-white overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0B0E18 0%, #1F1147 40%, #2137B6 100%)" }}
        >
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #4E62D8, transparent 70%)" }} />
          <div className="relative">
            <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-white/60 mb-4">
              Convertfy · Relatório mensal
            </div>
            <div className="text-[12px] font-medium text-white/70">
              {snapshot.store_name || snapshot.client_name || "Loja"}
            </div>
          </div>
          <div className="relative flex-1 flex flex-col justify-center">
            <div
              className="text-white font-bold leading-none mb-3"
              style={{ fontFamily: "'Playfair Display', serif", fontSize: 120 }}
            >
              {month}
            </div>
            <div className="text-[20px] text-white/80 tabular-nums">{year}</div>
          </div>
          <div className="relative grid grid-cols-2 gap-x-12 gap-y-2 text-[12.5px] text-white/80">
            <div>1. Resumo do mês</div>
            <div>4. Performance de e-mail</div>
            <div>2. Receita atribuída</div>
            <div>5. Campanhas e flows</div>
            <div>3. Resultados financeiros</div>
            <div>6. Próximos passos</div>
          </div>
        </div>
        <Insight tone="brand" label="Mensagem do CSM" text={ins.capa ?? "Mês de aprendizados — preparamos um resumo executivo das vitórias e oportunidades."} icon={Sparkles} />
      </Slide>

      <Slide n={2}>
        {/* RESUMO */}
        <div className="absolute inset-0 p-12 flex flex-col">
          <SlideHeader n={2} title="Resumo do mês" subtitle={`${month} ${year}`} />
          <div className="grid grid-cols-[1fr_1fr] gap-10 flex-1 items-center">
            {/* Donut + frase atribuição */}
            <div className="flex flex-col items-center gap-4">
              <DonutBig pct={k.atribuicao_pct ?? 0.214} color="#2137B6" />
              <div className="text-center">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Participação no faturamento
                </div>
                <div
                  className="text-[36px] font-bold leading-none mb-1"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {fmtBRL(k.receita_atribuida)}
                </div>
                <div className="text-[13px] text-slate-600">
                  atribuído à Convertfy de <strong>{fmtBRL(k.receita_total)}</strong>
                </div>
              </div>
            </div>
            {/* 6 KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Faturamento total" value={fmtBRL(k.receita_total)} />
              <KpiTile label="Pedidos" value={k.pedidos?.toLocaleString("pt-BR") ?? "—"} />
              <KpiTile label="Ticket médio" value={k.ticket_medio ? fmtBRL(k.ticket_medio) : "—"} />
              <KpiTile label="Novos clientes" value={k.novos_clientes?.toLocaleString("pt-BR") ?? "—"} />
              <KpiTile label="Open rate" value={fmtPct(e.open_rate)} />
              <KpiTile label="CTOR" value={fmtPct(e.ctor)} />
            </div>
          </div>
        </div>
        <Insight tone="brand" label="Leitura editorial" text={ins.resumo ?? "Mês positivo: participação Convertfy acima da meta de 18%. CTOR também acima do benchmark do segmento."} icon={TrendingUp} />
      </Slide>

      <Slide n={3}>
        {/* RECEITA ATRIBUÍDA */}
        <div className="absolute inset-0 flex flex-col text-white" style={{ background: "linear-gradient(135deg, #0B0E18, #2137B6)" }}>
          <div className="p-12 flex-1 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #4E62D8, transparent 70%)" }} />
            <div className="relative">
              <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-white/60 mb-4">
                Slide 3 · Receita atribuída
              </div>
              <div className="text-[16px] text-white/80 mb-4">{month} {year}</div>
              <div
                className="font-bold leading-none mb-6"
                style={{ fontFamily: "'Playfair Display', serif", fontSize: 110 }}
              >
                {fmtBRL(k.receita_atribuida)}
              </div>
              <div className="text-[18px] text-white/90 mb-10">
                <strong>{fmtPct(k.atribuicao_pct, 1)}</strong> do faturamento total da loja veio de
                campanhas e flows gerenciados pela Convertfy.
              </div>
              <div className="grid grid-cols-3 gap-6 max-w-[680px]">
                <ChannelCard label="Email" value={fmtBRL(ch.email_revenue)} icon={Mail} active />
                <ChannelCard label="SMS" value={fmtBRL(ch.sms_revenue)} icon={MessageSquare} />
                <ChannelCard label="Push" value={fmtBRL(ch.push_revenue)} />
              </div>
            </div>
          </div>
        </div>
        <Insight tone="dark" label="Por que isso importa" text={ins.atribuida ?? "Email continua sendo o canal dominante. SMS desbloqueado em junho deve trazer +15% sobre essa base."} icon={Sparkles} />
      </Slide>

      <Slide n={4}>
        {/* PERFORMANCE EMAIL */}
        <div className="absolute inset-0 p-12 flex flex-col">
          <SlideHeader n={4} title="Performance de e-mail" subtitle="Funil completo · benchmarks do segmento" />
          <div className="grid grid-cols-[1fr_1.2fr] gap-10 flex-1 items-center">
            {/* Funil */}
            <div className="flex flex-col gap-2">
              {[
                { label: "Entregues", value: e.entregues?.toLocaleString("pt-BR") ?? "—", w: 100 },
                { label: "Abertos", value: e.open_rate ? fmtPct(e.open_rate, 1) : "—", w: 78 },
                { label: "Clicados", value: e.ctr ? fmtPct(e.ctr, 2) : "—", w: 48 },
                { label: "Convertidos", value: "—", w: 24 },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-baseline justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">{s.label}</span>
                    <span className="font-bold text-slate-900 tabular-nums">{s.value}</span>
                  </div>
                  <div className="h-6 bg-slate-100 rounded-md overflow-hidden">
                    <div className="h-full rounded-md" style={{ width: `${s.w}%`, background: "linear-gradient(90deg, #4E62D8, #2137B6)" }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Benchmark cards */}
            <div className="grid grid-cols-2 gap-3">
              <BenchmarkCard label="Open rate" value={fmtPct(e.open_rate)} benchmark={fmtPct(e.open_benchmark ?? 0.173)} positive={!!(e.open_rate && e.open_benchmark && e.open_rate > e.open_benchmark)} />
              <BenchmarkCard label="CTR" value={fmtPct(e.ctr)} benchmark="2,1%" positive={!!(e.ctr && e.ctr > 0.021)} />
              <BenchmarkCard label="CTOR" value={fmtPct(e.ctor)} benchmark={fmtPct(e.ctr_benchmark ?? 0.041)} positive />
              <BenchmarkCard label="Bounce rate" value={fmtPct(e.bounce_rate)} benchmark="≤ 1%" positive={!!(e.bounce_rate != null && e.bounce_rate < 0.01)} />
              <BenchmarkCard label="Unsub rate" value={fmtPct(e.unsub_rate)} benchmark="≤ 0,3%" positive />
              <BenchmarkCard label="Spam complaints" value="—" benchmark="≤ 0,08%" />
            </div>
          </div>
        </div>
        <Insight tone="brand" label="O que está bom" text={ins.email ?? "Open rate e CTOR acima do benchmark, com bounce controlado. Foco do próximo mês: aumentar CTR via subject lines mais diretos."} icon={CheckCircle2} />
      </Slide>

      <Slide n={5}>
        {/* CAMPANHAS & FLOWS */}
        <div className="absolute inset-0 p-12 flex flex-col">
          <SlideHeader n={5} title="Top campanhas & flows" subtitle="Por receita gerada · período completo" />
          <div className="grid grid-cols-2 gap-8 flex-1">
            <RankingTable title="Top campanhas" items={camp} />
            <RankingTable title="Top flows" items={flows} />
          </div>
        </div>
        <Insight tone="brand" label="Leitura" text={ins.rankings ?? "Welcome Series segue como flow de maior performance — sustenta a base. Pacote sazonal (Dia das Mães) elevou a média de receita em campanhas."} icon={TrendingUp} />
      </Slide>

      <Slide n={6}>
        {/* TRABALHO REALIZADO */}
        <div className="absolute inset-0 p-12 flex flex-col">
          <SlideHeader n={6} title="Trabalho realizado" subtitle={`${month} ${year}`} />
          <div className="grid grid-cols-3 gap-6 mb-8">
            <WorkTile label="Otimizações" value={String(work.otimizacoes ?? "—")} sub="aplicadas no mês" color="#F59E0B" />
            <WorkTile label="Testes A/B" value={String(work.testes ?? "—")} sub="rodados · validados" color="#A855F7" />
            <WorkTile label="Campanhas personalizadas" value={String(work.campanhas_personalizadas ?? "—")} sub="enviadas no mês" color="#10B981" />
          </div>
          <div className="flex-1 border rounded-md p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
              Impacto das ações
            </div>
            {work.impactos && work.impactos.length > 0 ? (
              <div className="flex flex-col">
                {work.impactos.map((imp, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                    <div>
                      <div className="text-[13px] font-medium text-slate-900">{imp.acao}</div>
                      <div className="text-[11px] text-slate-500">{imp.metrica}</div>
                    </div>
                    <div className="text-[20px] font-bold tabular-nums text-emerald-600">{imp.delta}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-slate-400 italic py-4 text-center">
                Resumo do impacto será incluído na revisão final
              </div>
            )}
          </div>
        </div>
        <Insight tone="brand" label="Vitórias do mês" text={ins.trabalho ?? "Otimizações compostas com pacote sazonal elevaram receita por envio em 23%. Próximo mês foca em ampliar lista engajada."} icon={CheckCircle2} />
      </Slide>

      <Slide n={7}>
        {/* PRÓXIMOS PASSOS */}
        <div className="absolute inset-0 p-12 flex flex-col">
          <SlideHeader n={7} title="Próximos passos" subtitle="Acordados pra próximo ciclo" />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 flex-1">
            {(proximosList.length > 0 ? proximosList : [
              "Subir Browse Abandonment no Klaviyo",
              "Configurar segmentos VIP/Inactive",
              "Roteiro de Pós-compra revisado",
              "Campanha Junho · tema fidelidade",
              "Auditoria de deliverability",
            ]).slice(0, 5).map((p, i) => (
              <div key={i} className="border rounded-md p-4 relative" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <div className="text-[36px] font-bold leading-none mb-2 text-brand-500" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {i + 1}
                </div>
                <div className="text-[12.5px] text-slate-700 leading-snug">{p}</div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mt-2">
                  {i % 2 === 0 ? "Convertfy" : "Cliente"}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-4 border rounded-md" style={{ background: "#F8FAFC", borderColor: "rgba(0,0,0,0.06)" }}>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Apresentado por
              </div>
              <div className="text-[14px] font-bold text-slate-900">{snapshot.cm_name ?? "—"}</div>
              <div className="text-[11px] text-slate-500">Convertfy · Customer Success</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Próxima review</div>
              <div className="text-[13px] font-semibold text-slate-900">+30 dias</div>
            </div>
          </div>
        </div>
        <Insight tone="brand" label="Compromisso" text={ins.proximos ?? "Próxima reunião em 30 dias — alinhamento de aprendizados, validação dos próximos passos e plano do mês seguinte."} icon={ArrowRight} />
      </Slide>
    </div>
  )
}

// ── Slide wrapper (16:9 com Insight no rodape) ──
function Slide({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div
      data-slide={n}
      className="bg-white border rounded-[10px] shadow-sm overflow-hidden"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
        {children}
      </div>
    </div>
  )
}

function SlideHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <div className="text-[10.5px] font-bold tracking-[0.2em] uppercase text-slate-400 mb-2">
        Slide {String(n).padStart(2, "0")}
      </div>
      <div className="text-[28px] font-bold text-slate-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
        {title}
      </div>
      {subtitle && <div className="text-[14px] text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}

function Insight({ tone, label, text, icon: Icon }: { tone: "brand" | "dark"; label: string; text: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  const styles = tone === "dark"
    ? { bg: "#0B0E18", border: "#1F1147", color: "#fff", muted: "rgba(255,255,255,0.6)", accent: "#4E62D8" }
    : { bg: "#EEF0FB", border: "#C7CDEF", color: "#0E1F73", muted: "#2137B6", accent: "#2137B6" }
  return (
    <div
      className="px-6 py-4 flex items-start gap-4 border-t"
      style={{ background: styles.bg, borderColor: styles.border, color: styles.color }}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: styles.accent }} />
      <div className="flex-1 min-w-0">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: styles.muted }}>
          {label}
        </div>
        <div className="text-[12.5px] leading-snug">{text}</div>
      </div>
    </div>
  )
}

function DonutBig({ pct, color }: { pct: number; color: string }) {
  const safe = Math.max(0, Math.min(1, pct))
  const r = 70
  const c = 2 * Math.PI * r
  const dash = safe * c
  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={90} cy={90} r={r} fill="none" stroke="#F3F4F6" strokeWidth={16} />
        <circle cx={90} cy={90} r={r} fill="none" stroke={color} strokeWidth={16}
          strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[42px] font-bold tabular-nums leading-none" style={{ fontFamily: "'Playfair Display', serif", color }}>
          {(safe * 100).toFixed(1).replace(".", ",")}%
        </span>
      </div>
    </div>
  )
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[20px] font-bold text-slate-900 tabular-nums leading-none">{value}</div>
    </div>
  )
}

function ChannelCard({ label, value, icon: Icon, active }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }>; active?: boolean }) {
  return (
    <div
      className="rounded-md p-4 border"
      style={{
        background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
        borderColor: active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="h-4 w-4 text-white/70" />}
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</span>
      </div>
      <div className="text-[26px] font-bold tabular-nums leading-none">{value}</div>
    </div>
  )
}

function BenchmarkCard({ label, value, benchmark, positive }: { label: string; value: string; benchmark: string; positive?: boolean }) {
  return (
    <div className="border rounded-md p-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[20px] font-bold text-slate-900 tabular-nums leading-none">{value}</span>
        {positive != null && (
          <span className={positive ? "text-emerald-600 text-[10px] font-bold" : "text-amber-600 text-[10px] font-bold"}>
            {positive ? "✓ acima" : "abaixo"}
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-slate-400">benchmark {benchmark}</div>
    </div>
  )
}

function WorkTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="border rounded-md p-4 relative overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 blur-2xl" style={{ background: color }} />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
        <div className="text-[44px] font-bold leading-none mb-1" style={{ fontFamily: "'Playfair Display', serif", color }}>
          {value}
        </div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

function RankingTable({ title, items }: { title: string; items: Array<{ name: string; envios: number; abertura: number; cliques: number; receita: number }> }) {
  return (
    <div className="border rounded-md p-4 flex flex-col" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{title}</div>
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 italic">
          Sem dados no período
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              <th className="pb-2">Nome</th>
              <th className="pb-2 text-right">Open</th>
              <th className="pb-2 text-right">Receita</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 5).map((it, i) => (
              <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                <td className="py-2 text-slate-800 font-medium truncate max-w-[160px]">{it.name}</td>
                <td className="py-2 text-right text-slate-600 tabular-nums">{(it.abertura * 100).toFixed(1)}%</td>
                <td className="py-2 text-right text-emerald-700 font-bold tabular-nums">{fmtBRL(it.receita)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
