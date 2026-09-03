"use client"

/**
 * Tab: Relatório (cliente-facing) — mirror exato do prototype.
 *
 * Header: title + subtitle "X de Y já apresentadas" + actions (Filtrar /
 * Year / Gerar novo relatório primary)
 *
 * 4 SummaryStat cards (Total brand · Apresentados pos · Enviados info ·
 * Em rascunho neut com sub)
 *
 * Grid 3-col de ReportCard:
 *  - Cover gradient #0B0E18 → #2137B6 com radial glow + "Apresentação · N
 *    slides" eyebrow + Playfair month/year split
 *  - Status badge + período no body
 *  - 2-col KvSmall (Receita Convertfy / Participação brand Playfair)
 *  - Footer: avatar + "Gerado por X" + "Abrir →"
 *  - Atual card tem destaque (border blue100, gradient sutil top, tag
 *    "ATUAL" no canto)
 *
 * Hint footer: card brand-bg com Zap icon + texto explicativo
 *
 * GenerateModal: 760px wide com header + body grid + section checks +
 * tone radio + toggle AI + footer com contador e CTA
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, X, Zap, Filter, Calendar, Check, Edit3, Send, Layers, Trash2, Loader2,
} from "lucide-react"
import { Section, Badge, Btn, Avatar, C, TNUM, StoreLogo } from "./_primitives"

interface Report {
  id: string
  month_label: string
  period_start: string
  period_end: string
  status: "draft" | "sent" | "presented"
  generated_at: string
  presented_at: string | null
  tone: string
  ai_filled: boolean
  pdf_url: string | null
  snapshot: Record<string, unknown>
  generator?: { name: string; avatar_url: string | null } | null
}

const STATUS_META: Record<string, { label: string; tone: "neut" | "info" | "pos"; dot?: boolean }> = {
  draft: { label: "Rascunho", tone: "neut" },
  sent: { label: "Enviado ao cliente", tone: "info", dot: true },
  presented: { label: "Apresentado", tone: "pos", dot: true },
}

export function TabRelatorio({ storeId }: { storeId: string }) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const reload = () => {
    setLoading(true)
    fetch(`/api/admin/stores/${storeId}/reports`)
      .then((r) => r.json())
      .then((j) => setReports((j.data?.reports ?? j.reports ?? []) as Report[]))
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [storeId])

  const total = reports.length
  const presented = reports.filter((r) => r.status === "presented").length
  const sent = reports.filter((r) => r.status === "sent").length
  const drafts = reports.filter((r) => r.status === "draft").length

  const now = new Date()
  const currentMonthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  const draftMonth = reports.find((r) => r.status === "draft")?.month_label

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="m-0 text-[22px] font-semibold text-slate-900" style={{ letterSpacing: "-0.015em" }}>
            Relatórios apresentados ao cliente
          </h2>
          <p className="mt-1 mb-0 text-[13px]" style={{ color: C.g500 }}>
            Histórico de apresentações mensais geradas para a loja · <strong style={{ color: C.g900 }}>{presented}</strong> de <strong style={{ color: C.g900 }}>{total}</strong> já apresentadas.
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" size="md" icon={<Filter className="h-3.5 w-3.5" />}>Filtrar</Btn>
          <Btn variant="secondary" size="md" icon={<Calendar className="h-3.5 w-3.5" />}>{now.getFullYear()}</Btn>
          <Btn variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModalOpen(true)}>
            Gerar novo relatório
          </Btn>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryStat Icon={Layers} tone="brand" label="Total de relatórios" value={String(total)} />
        <SummaryStat Icon={Check} tone="pos" label="Apresentados ao cliente" value={String(presented)} />
        <SummaryStat Icon={Send} tone="info" label="Enviados (não apresent.)" value={String(sent)} />
        <SummaryStat Icon={Edit3} tone="neut" label="Em rascunho" value={String(drafts)} sub={draftMonth} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-10 text-center text-[12px] italic" style={{ color: C.g400 }}>Carregando…</div>
      ) : reports.length === 0 ? (
        <Section title="Nenhum relatório gerado ainda">
          <div className="py-6 text-center">
            <p className="text-[13px] mb-3" style={{ color: C.g500 }}>
              Gere o primeiro relatório mensal para apresentar resultados ao cliente.
            </p>
            <Btn variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModalOpen(true)}>
              Gerar primeiro relatório
            </Btn>
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-5">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              isCurrent={r.month_label.toLowerCase().startsWith(currentMonthLabel.split(" ")[0].toLowerCase())}
              onDeleted={reload}
            />
          ))}
        </div>
      )}

      {/* Hint */}
      <div
        className="px-[18px] py-[14px] rounded-[10px] flex items-center gap-3"
        style={{ background: C.blue50, border: `1px solid ${C.blue100}` }}
      >
        <Zap className="h-4 w-4 shrink-0" style={{ color: C.brand }} />
        <div className="flex-1 text-[12.5px] leading-[1.5]" style={{ color: C.g700 }}>
          <strong style={{ color: C.g900 }}>Como funciona:</strong> os dados de receita, e-mail e flows são puxados automaticamente do sistema. Campos como &ldquo;Próximos passos&rdquo; e leituras editoriais são preenchidos com IA · você revisa antes de enviar.
        </div>
        <Btn variant="ghost" size="sm" className="!text-brand-500" onClick={() => window.open("https://convertfy.me/docs/relatorios", "_blank")}>
          Saiba mais →
        </Btn>
      </div>

      {modalOpen && <GenerateModal storeId={storeId} onClose={() => setModalOpen(false)} onCreated={reload} />}
    </div>
  )
}

// ─── SummaryStat ──────────────────────────────────────

function SummaryStat({ Icon, tone, label, value, sub }: {
  Icon: typeof Layers
  tone: "brand" | "pos" | "info" | "neut"
  label: string
  value: string
  sub?: string
}) {
  const map = {
    brand: { bg: C.blue50, c: C.brand, bd: C.blue100 },
    pos: { bg: C.posBg, c: C.pos, bd: C.posBorder },
    info: { bg: C.infoBg, c: C.info, bd: C.infoBorder },
    neut: { bg: C.g50, c: C.g600, bd: C.border },
  }
  const m = map[tone]
  return (
    <div
      className="p-[14px_16px] rounded-[10px] flex items-center gap-3"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <div
        className="w-[38px] h-[38px] rounded-[8px] inline-flex items-center justify-center shrink-0"
        style={{ background: m.bg, color: m.c, border: `1px solid ${m.bd}` }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: C.g500 }}>{label}</div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-[22px] leading-none"
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              color: C.g900,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              ...TNUM,
            }}
          >
            {value}
          </span>
          {sub && <span className="text-[11px]" style={{ color: C.g500 }}>{sub}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── ReportCard ───────────────────────────────────────

function ReportCard({ report, isCurrent, onDeleted }: { report: Report; isCurrent: boolean; onDeleted: () => void }) {
  const s = STATUS_META[report.status] ?? STATUS_META.draft
  const [deleting, setDeleting] = useState(false)
  // Parse manual evita TZ shift (new Date("2026-04-01") em fuso BR mostra 31/03)
  const fmtShort = (ymd: string, withYear = false) => {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return ymd
    return withYear ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : `${m[3]}/${m[2]}`
  }
  const periodStart = fmtShort(report.period_start)
  const periodEnd = fmtShort(report.period_end, true)
  const parts = report.month_label.split(" ")
  const month = parts[0]
  const year = parts.slice(1).join(" ")

  const snap = report.snapshot ?? {}
  const kpis = (snap.kpis ?? {}) as Record<string, number>
  const revenue = kpis.receita_atribuida ?? kpis.receita_total ?? 0
  const sharePct = kpis.atribuicao_pct ?? 0
  const slides = (snap.slides_count as number) ?? 7

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const confirmed = window.confirm(
      `Excluir o relatório de ${report.month_label}? Esta ação não pode ser desfeita.`,
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/stores/reports/${report.id}`, { method: "DELETE" })
      if (res.ok) {
        onDeleted()
      } else {
        const j = await res.json().catch(() => ({}))
        alert(`Falha ao excluir: ${j?.error?.message ?? res.statusText}`)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <a
      href={`/admin/stores/relatorios/${report.id}`}
      className="rounded-[12px] p-[18px] block transition-all group"
      style={{
        background: isCurrent
          ? "linear-gradient(180deg, rgba(78,98,216,0.04) 0%, rgba(255,255,255,1) 60%)"
          : C.white,
        border: `1px solid ${isCurrent ? C.blue100 : C.border}`,
        textDecoration: "none",
        position: "relative",
        boxShadow: C.shadowSm,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isCurrent ? C.brand : C.borderHv
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isCurrent ? C.blue100 : C.border
        e.currentTarget.style.boxShadow = C.shadowSm
      }}
    >
      {/* Top-right actions: Atual badge + Delete button */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        {isCurrent && (
          <span
            className="text-[9.5px] font-bold uppercase tracking-[0.1em] px-1.5 py-[3px] rounded-[4px]"
            style={{ color: C.brand, background: C.blue50, border: `1px solid ${C.blue100}` }}
          >
            Atual
          </span>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Excluir relatório"
          title="Excluir relatório"
          className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors hover:bg-red-50"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: `1px solid ${C.border}`,
            color: deleting ? C.g400 : C.neg,
            opacity: deleting ? 0.5 : 1,
            backdropFilter: "blur(4px)",
          }}
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Mini cover */}
      <div
        className="h-[120px] rounded-[8px] mb-3.5 px-3.5 py-3 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B0E18 0%, #2137B6 100%)",
          color: "#fff",
        }}
      >
        <div
          className="absolute"
          style={{
            right: -40,
            top: -40,
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle at center, rgba(78,98,216,0.6) 0%, rgba(78,98,216,0) 70%)",
          }}
        />
        <div
          className="relative text-[9px] font-semibold tracking-[0.12em] uppercase"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Apresentação · {slides} slides
        </div>
        <div
          className="relative mt-3.5"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 32,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {month}
          <br />
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{year}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex items-center justify-between mb-2.5">
        <Badge tone={s.tone} dot={s.dot}>{s.label}</Badge>
        <span className="text-[11px]" style={{ color: C.g400, ...TNUM }}>{periodStart} → {periodEnd}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <KvSmall label="Receita Convertfy" value={revenue > 0 ? formatCompact(revenue) : "—"} />
        <KvSmall label="Participação" value={sharePct > 0 ? `${(sharePct * 100).toFixed(2).replace(".", ",")}%` : "—"} brand />
      </div>

      <div className="pt-2.5 flex items-center justify-between" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 text-[11.5px]" style={{ color: C.g500 }}>
          {report.generator?.name && (
            <>
              <Avatar name={report.generator.name} size={20} />
              <span>Gerado por {report.generator.name.split(" ")[0]}</span>
            </>
          )}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: C.brand }}>Abrir →</span>
      </div>
    </a>
  )
}

function KvSmall({ label, value, brand }: { label: string; value: string; brand?: boolean }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.g500 }}>
        {label}
      </div>
      <div
        className="mt-0.5"
        style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 14,
          fontWeight: 700,
          color: brand ? C.brand : C.g900,
          letterSpacing: "-0.02em",
          ...TNUM,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2).replace(".", ",")} mi`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")} mil`
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
}

// ─── GenerateModal (refinado, matching prototype) ─────

interface DuplicateConflict {
  existing_report_id: string
  existing_status: string
  existing_generated_at: string
  month_label: string
}

function GenerateModal({ storeId, onClose, onCreated }: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const router = useRouter()
  const now = new Date()
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  const [periodStart, setPeriodStart] = useState(firstDayLastMonth.toISOString().split("T")[0])
  const [periodEnd, setPeriodEnd] = useState(lastDayLastMonth.toISOString().split("T")[0])
  const [tone, setTone] = useState<"editorial" | "corporate" | "casual">("editorial")
  const [aiFilled, setAiFilled] = useState(true)
  const [proximos, setProximos] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [duplicateConflict, setDuplicateConflict] = useState<DuplicateConflict | null>(null)
  const [sections, setSections] = useState({
    resumo: true, financeiro: true, email_perf: true, top_campanhas: true,
    top_flows: true, trabalho: true, proximos: true,
  })

  const sectionsList: Array<{
    key: keyof typeof sections
    label: string
    sub: string
    source: "auto" | "manual"
    full?: boolean
  }> = [
    { key: "resumo", label: "Resumo executivo", sub: "participação Convertfy + KPIs", source: "auto" },
    { key: "financeiro", label: "Resultados financeiros", sub: "faturamento, ticket, atribuição", source: "auto" },
    { key: "email_perf", label: "Performance de e-mail", sub: "abertura, clique, CTOR · benchmark", source: "auto" },
    { key: "top_campanhas", label: "Top campanhas", sub: "ranking + leitura editorial", source: "auto" },
    { key: "top_flows", label: "Top flows", sub: "ranking + análise", source: "auto" },
    { key: "trabalho", label: "Trabalho realizado", sub: "otimizações + testes A/B", source: "auto" },
    { key: "proximos", label: "Próximos passos", sub: "plano para o ciclo", source: "manual", full: true },
  ]

  const sectionsCount = Object.values(sections).filter(Boolean).length

  const doSubmit = async (replace = false) => {
    if (!periodStart || !periodEnd) {
      alert("Selecione o período (início e fim) antes de gerar o relatório.")
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        period_start: periodStart,
        period_end: periodEnd,
        tone,
        sections,
        ai_filled: aiFilled,
      }
      const trimmed = proximos.trim()
      if (trimmed) payload.proximos_passos = trimmed
      if (replace) payload.replace = true

      const res = await fetch(`/api/admin/stores/${storeId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))

      if (res.ok) {
        setDuplicateConflict(null)
        onCreated()
        onClose()
        return
      }

      // 409 com payload rico -> oferece dialog "Abrir" / "Sobrescrever" / "Cancelar"
      if (res.status === 409 && j?.existing_report_id) {
        setDuplicateConflict({
          existing_report_id: j.existing_report_id,
          existing_status: j.existing_status,
          existing_generated_at: j.existing_generated_at,
          month_label: j.month_label,
        })
        return
      }

      const msg = j?.error?.message ?? j?.error ?? j?.message ?? `Falha ao gerar (HTTP ${res.status})`
      alert(typeof msg === "string" ? msg : "Falha ao gerar relatório")
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = () => doSubmit(false)
  const handleOverwrite = () => doSubmit(true)
  const handleOpenExisting = () => {
    if (!duplicateConflict) return
    router.push(`/admin/report-jobs/${duplicateConflict.existing_report_id}`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
      style={{ background: "rgba(11, 14, 24, 0.5)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      {duplicateConflict && (
        <DuplicateReportDialog
          conflict={duplicateConflict}
          submitting={submitting}
          onOpenExisting={handleOpenExisting}
          onOverwrite={handleOverwrite}
          onCancel={() => setDuplicateConflict(null)}
        />
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[14px] flex flex-col overflow-hidden"
        style={{
          width: 760,
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: C.white,
          boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between shrink-0"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div>
            <div
              className="text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: C.brand }}
            >
              Novo relatório
            </div>
            <h3
              className="m-0 mt-0.5 text-[18px] font-semibold text-slate-900"
              style={{ letterSpacing: "-0.01em" }}
            >
              Gerar relatório mensal
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[6px] inline-flex items-center justify-center hover:bg-slate-50"
            style={{ background: C.white, color: C.g500, border: `1px solid ${C.border}` }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-[18px]">
          {/* Loja + período */}
          <div className="grid grid-cols-2 gap-3.5">
            <FormField label="Loja" sub="travada">
              <FormBox>
                <StoreLogo name="Loja" size={26} />
                <span className="text-[13px] font-semibold text-slate-900">Esta loja</span>
              </FormBox>
            </FormField>
            <FormField label="Período" sub="auto · puxado do sistema">
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="h-9 px-2.5 rounded-[8px] text-[12.5px] outline-none"
                  style={{ border: `1px solid ${C.border}`, background: C.white, color: C.g700, ...TNUM }}
                />
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="h-9 px-2.5 rounded-[8px] text-[12.5px] outline-none"
                  style={{ border: `1px solid ${C.border}`, background: C.white, color: C.g700, ...TNUM }}
                />
              </div>
            </FormField>
          </div>

          {/* Sections to include */}
          <FormField label="Seções a incluir" sub="todas são puxadas automaticamente · você pode desligar o que não for relevante">
            <div className="grid grid-cols-2 gap-2">
              {sectionsList.map((s) => (
                <SectionCheck
                  key={s.key}
                  label={s.label}
                  sub={s.sub}
                  on={sections[s.key]}
                  onToggle={() => setSections({ ...sections, [s.key]: !sections[s.key] })}
                  source={s.source}
                  full={s.full}
                />
              ))}
            </div>
          </FormField>

          {/* Próximos passos */}
          {sections.proximos && (
            <FormField label="Próximos passos · plano para o próximo ciclo" sub="o que você quer incluir · a IA completa o resto">
              <textarea
                value={proximos}
                onChange={(e) => setProximos(e.target.value)}
                placeholder="Ex: ativar SMS, lançar pacote Dia dos Namorados, conectar Shopify, otimizar Winback Flow..."
                className="w-full min-h-[80px] p-3 rounded-[8px] text-[13px] outline-none resize-y"
                style={{ border: `1px solid ${C.border}`, background: C.g50, color: C.g900 }}
              />
              {/* O que ficou combinado nas calls já é o plano do ciclo —
                  puxar evita redigitar (e evita esquecer). */}
              <PendenciasDasCalls
                storeId={storeId}
                onUse={(texto) =>
                  setProximos((prev) => (prev.trim() ? `${prev.trim()}\n${texto}` : texto))
                }
              />
            </FormField>
          )}

          {/* Tom */}
          <FormField label="Tom de apresentação">
            <div className="flex gap-2">
              {[
                { k: "editorial" as const, label: "Editorial", sub: "serif + grande" },
                { k: "corporate" as const, label: "Corporate", sub: "limpo + neutro" },
                { k: "casual" as const, label: "Casual", sub: "conversacional" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setTone(o.k)}
                  className="flex-1 px-3.5 py-2.5 rounded-[8px] text-left"
                  style={{
                    border: `1px solid ${tone === o.k ? C.brand : C.border}`,
                    background: tone === o.k ? C.blue50 : C.white,
                    color: tone === o.k ? C.brand : C.g700,
                  }}
                >
                  <div className="text-[12.5px] font-semibold">{o.label}</div>
                  <div
                    className="text-[10.5px] mt-0.5"
                    style={{ color: tone === o.k ? C.brand : C.g500 }}
                  >
                    {o.sub}
                  </div>
                </button>
              ))}
            </div>
          </FormField>

          {/* AI assist toggle */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[10px]"
            style={{ background: C.blue50, border: `1px solid ${C.blue100}` }}
          >
            <Zap className="h-[18px] w-[18px] shrink-0" style={{ color: C.brand }} />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-slate-900">Preencher gaps com IA</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: C.g600 }}>
                Leituras editoriais, destaques e próximos passos faltantes são gerados com base nos números e no briefing.
              </div>
            </div>
            <Toggle on={aiFilled} onChange={() => setAiFilled(!aiFilled)} />
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3.5 flex items-center justify-between shrink-0"
          style={{
            background: C.g50,
            borderTop: `1px solid ${C.border}`,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
          }}
        >
          <div className="text-[11.5px]" style={{ color: C.g500 }}>
            <strong style={{ color: C.g900 }}>{sectionsCount}</strong> seções selecionadas · estimativa de geração: ~30s
          </div>
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" icon={<Zap className="h-3.5 w-3.5" />} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Gerando…" : "Gerar relatório"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11.5px] font-semibold tracking-[0.02em]" style={{ color: C.g700 }}>{label}</span>
        {sub && <span className="text-[10.5px]" style={{ color: C.g400 }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function FormBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
      style={{ border: `1px solid ${C.border}`, background: C.white }}
    >
      {children}
    </div>
  )
}

function SectionCheck({ label, sub, on, onToggle, source, full }: {
  label: string
  sub: string
  on: boolean
  onToggle: () => void
  source: "auto" | "manual"
  full?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-left"
      style={{
        gridColumn: full ? "1 / -1" : "auto",
        border: `1px solid ${on ? C.blue100 : C.border}`,
        background: on ? C.blue50 : C.white,
      }}
    >
      <div
        className="w-[18px] h-[18px] rounded-[4px] inline-flex items-center justify-center shrink-0 text-white"
        style={{
          background: on ? C.brand : C.white,
          border: `1px solid ${on ? C.brand : C.border}`,
        }}
      >
        {on && <Check className="h-3 w-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-900">{label}</div>
        <div className="text-[10.5px] mt-px" style={{ color: C.g500 }}>{sub}</div>
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[4px]"
        style={{
          color: source === "auto" ? C.pos : C.amber,
          background: source === "auto" ? C.posBg : C.warnBg,
          border: `1px solid ${source === "auto" ? C.posBorder : C.warnBorder}`,
        }}
      >
        {source === "auto" ? "auto" : "manual + ia"}
      </span>
    </button>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-9 h-5 rounded-full relative cursor-pointer transition-colors"
      style={{ background: on ? C.brand : C.g300, border: "none" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{
          left: on ? 18 : 2,
          background: C.white,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  )
}

// ─── DuplicateReportDialog ────────────────────────────────────
// Aparece quando POST /reports retorna 409 (mes ja tem relatorio).
// Oferece 3 acoes em vez de bloquear o user com alert tecnico.

function DuplicateReportDialog({
  conflict,
  submitting,
  onOpenExisting,
  onOverwrite,
  onCancel,
}: {
  conflict: {
    existing_report_id: string
    existing_status: string
    existing_generated_at: string
    month_label: string
  }
  submitting: boolean
  onOpenExisting: () => void
  onOverwrite: () => void
  onCancel: () => void
}) {
  const statusLabel = {
    draft: "Em rascunho",
    ready: "Pronto",
    sent: "Enviado",
    archived: "Arquivado",
  }[conflict.existing_status] ?? conflict.existing_status

  const generatedAt = conflict.existing_generated_at
    ? new Date(conflict.existing_generated_at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-6"
      style={{ background: "rgba(11, 14, 24, 0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="rounded-[12px] overflow-hidden"
        style={{
          width: 480,
          maxWidth: "92vw",
          background: C.white,
          boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ padding: "20px 24px 16px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 8px",
              borderRadius: 4,
              background: "rgba(245, 158, 11, 0.12)",
              color: "#92400E",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Relatório duplicado
          </div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: C.g900,
              margin: 0,
              marginBottom: 6,
            }}
          >
            Já existe um relatório de {conflict.month_label}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: C.g500,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Status: <b>{statusLabel}</b> · Gerado em {generatedAt}
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: C.g500,
              margin: "12px 0 0",
              lineHeight: 1.5,
            }}
          >
            Você pode <b>abrir o existente</b> pra continuar editando, ou{" "}
            <b>sobrescrever</b> com um relatório novo (o atual será apagado).
          </p>
        </div>
        <div
          style={{
            padding: "12px 24px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 500,
              color: C.g500,
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            disabled={submitting}
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#92400E",
              background: "rgba(245, 158, 11, 0.12)",
              border: `1px solid rgba(245, 158, 11, 0.4)`,
              borderRadius: 6,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Sobrescrevendo..." : "Sobrescrever"}
          </button>
          <button
            type="button"
            onClick={onOpenExisting}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.white,
              background: C.brand,
              border: "none",
              borderRadius: 6,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            Abrir existente →
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Pendências das calls de alinhamento → próximos passos do relatório.
 *
 * O que foi combinado com o cliente na call É o plano do ciclo; sem
 * essa ponte o CSM redigitava (ou esquecia). Só aparece quando há
 * pendência aberta — bloco vazio no formulário é ruído.
 */
function PendenciasDasCalls({
  storeId,
  onUse,
}: {
  storeId: string
  onUse: (texto: string) => void
}) {
  const [pend, setPend] = useState<Array<{ description: string; days_open: number }>>([])
  const [usado, setUsado] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`/api/stores/${storeId}/calls`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!vivo || !body) return
        const lista = body?.next_meeting_agenda?.pending
        if (Array.isArray(lista)) setPend(lista.slice(0, 6))
      })
      .catch(() => {
        /* sem pendências não é erro de tela */
      })
    return () => {
      vivo = false
    }
  }, [storeId])

  if (pend.length === 0) return null

  return (
    <div className="mt-2 rounded-[8px] p-2.5" style={{ background: C.g50, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold" style={{ color: C.g700 }}>
          {pend.length} pendência{pend.length > 1 ? "s" : ""} das calls de alinhamento
        </span>
        <button
          type="button"
          disabled={usado}
          onClick={() => {
            onUse(pend.map((p) => `- ${p.description}`).join("\n"))
            setUsado(true)
          }}
          className="h-[26px] rounded-[6px] px-2.5 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: C.brand, color: "#fff" }}
        >
          {usado ? "Adicionado" : "Usar no relatório"}
        </button>
      </div>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {pend.map((p, i) => (
          <li key={i} className="text-[11.5px]" style={{ color: C.g600 }}>
            • {p.description}{" "}
            <span style={{ color: C.g400, ...TNUM }}>({p.days_open}d)</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
