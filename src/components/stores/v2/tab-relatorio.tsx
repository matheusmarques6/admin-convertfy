"use client"

/**
 * Aba Relatório — Lista de relatórios mensais cliente-facing + modal
 * "Gerar novo relatório" que persiste em client_monthly_reports.
 */

import { useEffect, useState } from "react"
import { Plus, X, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

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

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: "Rascunho", bg: "#F3F4F6", color: "#4B5563" },
  sent: { label: "Enviado", bg: "#DBEAFE", color: "#1D4ED8" },
  presented: { label: "Apresentado", bg: "#D1FAE5", color: "#065F46" },
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
  const currentMonth = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-bold text-slate-900 m-0">Relatórios apresentados ao cliente</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Histórico de apresentações mensais geradas pela Convertfy
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[12.5px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" /> Gerar novo relatório
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total de relatórios" value={String(total)} />
        <Tile label="Apresentados ao cliente" value={String(presented)} />
        <Tile label="Enviados (não apresentados)" value={String(sent)} />
        <Tile label="Em rascunho" value={String(drafts)} accent="amber" />
      </div>

      {/* Grid de relatórios */}
      {loading ? (
        <div className="py-10 text-center text-[12px] text-slate-400 italic">Carregando…</div>
      ) : reports.length === 0 ? (
        <div className="bg-white border rounded-[10px] p-10 text-center" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <p className="text-[14px] font-semibold text-slate-700 mb-1">Nenhum relatório gerado ainda</p>
          <p className="text-[12px] text-slate-500 mb-4">
            Gere o primeiro relatório mensal pra apresentar resultados ao cliente
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[12.5px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Gerar primeiro relatório
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} isCurrent={r.month_label.toLowerCase().includes(currentMonth.split(" ")[0].toLowerCase())} />
          ))}
        </div>
      )}

      {/* Como funciona hint */}
      <div className="bg-slate-50 border rounded-md p-3 flex items-start gap-2.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <Sparkles className="h-4 w-4 mt-0.5 text-brand-500 shrink-0" />
        <div className="text-[11.5px] text-slate-600 leading-snug">
          <span className="font-semibold text-slate-800">Como funciona:</span> os dados de receita, e-mail e flows
          são puxados automaticamente do sistema. Campos editoriais como
          &quot;Próximos passos&quot; e leituras dos insights são preenchidos com IA — você revisa antes de enviar.
          <a href="#" className="text-brand-600 hover:underline ml-1">Saiba mais →</a>
        </div>
      </div>

      {modalOpen && (
        <GenerateModal storeId={storeId} onClose={() => setModalOpen(false)} onCreated={reload} />
      )}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return (
    <div className="bg-white border rounded-[8px] p-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={cn(
        "text-[22px] font-bold tabular-nums leading-none",
        accent === "amber" ? "text-amber-600" : "text-slate-900",
      )}>
        {value}
      </div>
    </div>
  )
}

function ReportCard({ report, isCurrent }: { report: Report; isCurrent: boolean }) {
  const status = STATUS_CFG[report.status]
  const periodStart = new Date(report.period_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const periodEnd = new Date(report.period_end).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  const [month, year] = report.month_label.split(" ")
  return (
    <a
      href={`/admin/stores/relatorios/${report.id}`}
      className={cn(
        "bg-white border rounded-[10px] overflow-hidden hover:border-brand-300 hover:shadow-md transition-all group",
        isCurrent && "border-brand-300",
      )}
      style={{ borderColor: isCurrent ? "#A8B2EE" : "rgba(0,0,0,0.06)" }}
    >
      {/* Cover gradient */}
      <div
        className="aspect-[4/3] relative flex items-end p-4"
        style={{
          background: isCurrent
            ? "linear-gradient(135deg, #0B0E18, #2137B6 70%, #4E62D8)"
            : "linear-gradient(135deg, #0B0E18, #2137B6)",
        }}
      >
        <div>
          <div
            className="text-white font-bold leading-none mb-0.5"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 44 }}
          >
            {month}
          </div>
          <div className="text-white/70 text-[12px] tabular-nums">{year}</div>
        </div>
        {isCurrent && (
          <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-widest text-white/90 bg-white/15 backdrop-blur px-1.5 py-0.5 rounded">
            ATUAL
          </span>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-white/80">
            Apresentação · {(report.snapshot?.slides_count as number) || 7} slides
          </span>
        </div>
      </div>
      {/* Footer */}
      <div className="p-3 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold mb-2"
          style={{ background: status.bg, color: status.color }}
        >
          {report.status === "draft" && <span className="h-1 w-1 rounded-full bg-current" />}
          {status.label}
        </span>
        <div className="text-[10px] text-slate-400 font-mono">{periodStart} → {periodEnd}</div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            {report.generator?.name && (
              <>
                <span
                  className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#4E62D8,#2137B6)" }}
                >
                  {report.generator.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                </span>
                <span>Gerado por {report.generator.name.split(/\s+/)[0]}</span>
              </>
            )}
          </div>
          <span className="text-[11px] font-medium text-brand-600 group-hover:underline inline-flex items-center gap-0.5">
            Abrir →
          </span>
        </div>
      </div>
    </a>
  )
}

function GenerateModal({ storeId, onClose, onCreated }: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const now = new Date()
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  const [periodStart, setPeriodStart] = useState(firstDayLastMonth.toISOString().split("T")[0])
  const [periodEnd, setPeriodEnd] = useState(lastDayLastMonth.toISOString().split("T")[0])
  const [tone, setTone] = useState<"editorial" | "corporate" | "casual">("editorial")
  const [aiFilled, setAiFilled] = useState(true)
  const [proximos, setProximos] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sections, setSections] = useState({
    resumo: true,
    financeiro: true,
    email_perf: true,
    top_campanhas: true,
    top_flows: true,
    trabalho: true,
    proximos: true,
  })

  const sectionsList = [
    { key: "resumo" as const, label: "Resumo executivo", tag: "auto" },
    { key: "financeiro" as const, label: "Resultados financeiros", tag: "auto" },
    { key: "email_perf" as const, label: "Performance de e-mail", tag: "auto" },
    { key: "top_campanhas" as const, label: "Top campanhas", tag: "auto" },
    { key: "top_flows" as const, label: "Top flows", tag: "auto" },
    { key: "trabalho" as const, label: "Trabalho realizado", tag: "auto" },
    { key: "proximos" as const, label: "Próximos passos", tag: "manual + ia" },
  ]

  const sectionsCount = Object.values(sections).filter(Boolean).length

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          tone,
          sections,
          ai_filled: aiFilled,
          proximos_passos: proximos || null,
        }),
      })
      if (res.ok) {
        onCreated()
        onClose()
      } else {
        const j = await res.json().catch(() => ({}))
        alert(`Falha: ${j.error?.message ?? res.statusText}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[90] bg-slate-900/40" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[92vw] max-h-[88vh] bg-white rounded-2xl shadow-2xl z-[91] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <div>
            <h2 className="text-[16px] font-bold text-slate-900 m-0">Gerar novo relatório</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Dados são puxados automaticamente · gaps preenchidos com IA</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel label="Início do período" />
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
            </div>
            <div>
              <FieldLabel label="Fim do período" />
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
            </div>
          </div>

          <div>
            <FieldLabel label="Seções a incluir" />
            <div className="border rounded-md divide-y" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              {sectionsList.map((s) => (
                <label key={s.key} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={sections[s.key]}
                    onChange={(e) => setSections({ ...sections, [s.key]: e.target.checked })}
                    className="h-4 w-4 accent-brand-500"
                  />
                  <span className="flex-1 text-[12.5px] text-slate-800">{s.label}</span>
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                    s.tag === "auto" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                  )}>
                    {s.tag}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {sections.proximos && (
            <div>
              <FieldLabel label="Próximos passos (opcional · IA completa se vazio)" />
              <textarea
                value={proximos}
                onChange={(e) => setProximos(e.target.value)}
                rows={3}
                placeholder="Ex: Subir Browse Abandonment, configurar segmentos VIP, agendar campanha de Junho…"
                className="w-full px-3 py-2 rounded-md border text-[13px] outline-none focus:border-brand-500 resize-y"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              />
            </div>
          )}

          <div>
            <FieldLabel label="Tom de apresentação" />
            <div className="grid grid-cols-3 gap-2">
              {(["editorial", "corporate", "casual"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "px-3 py-2 rounded-md text-[12px] font-medium border transition-colors",
                    tone === t ? "bg-brand-50 text-brand-700 border-brand-300" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-[12.5px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={aiFilled}
              onChange={(e) => setAiFilled(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            Preencher gaps editoriais (insights, leituras) com IA
          </label>
        </div>
        <div className="px-5 py-3 border-t bg-slate-50/40 flex items-center justify-between gap-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <span className="text-[11.5px] text-slate-500">
            {sectionsCount} seções selecionadas · ~30s pra gerar
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
            <button onClick={handleSubmit} disabled={submitting} className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {submitting ? "Gerando…" : "Gerar relatório"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
}
