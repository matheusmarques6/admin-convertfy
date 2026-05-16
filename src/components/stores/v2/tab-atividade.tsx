"use client"

/**
 * Aba Atividade — Timeline filtravel de tudo que aconteceu na conta.
 * 4 stats no topo, filtros multi-categoria, timeline vertical + sidebar
 * com materiais e entregaveis do onboarding.
 */

import { useEffect, useMemo, useState } from "react"
import { Plus, X, ExternalLink, FileText, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface Activity {
  id: string
  kind: "feedback" | "teste" | "otim" | "entrega" | "integracao" | "call" | "outro"
  title: string
  summary: string | null
  tags: string[] | null
  occurred_at: string
  metadata?: Record<string, unknown>
  author?: { name: string; avatar_url: string | null } | null
}

const KIND_CFG = {
  feedback: { label: "Feedback", color: "#4E62D8" },
  teste: { label: "Teste A/B", color: "#A855F7" },
  otim: { label: "Otimização", color: "#F59E0B" },
  entrega: { label: "Entrega", color: "#10B981" },
  integracao: { label: "Integração", color: "#6B7280" },
  call: { label: "Call", color: "#3B82F6" },
  outro: { label: "Outro", color: "#9CA3AF" },
} as const

export function TabAtividade({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState<string>("tudo")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const reload = () => {
    setLoading(true)
    fetch(`/api/admin/stores/${storeId}/activity?limit=200`)
      .then((r) => r.json())
      .then((j) => setItems((j.data?.items ?? j.items ?? []) as Activity[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [storeId])

  const filtered = useMemo(
    () => filterKind === "tudo" ? items : items.filter((i) => i.kind === filterKind),
    [items, filterKind],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { otim: 0, teste: 0, entrega: 0, call: 0 }
    items.forEach((i) => {
      if (i.kind in c) c[i.kind]++
    })
    return c
  }, [items])

  const abTests = items.filter((i) => i.kind === "teste")

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="flex flex-col gap-4">
        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Otimizações" value={String(counts.otim)} sub="aplicadas" color="#F59E0B" />
          <StatTile label="Testes A/B" value={String(counts.teste)} sub="rodados" color="#A855F7" />
          <StatTile label="Entregas" value={String(counts.entrega)} sub="materiais finalizados" color="#10B981" />
          <StatTile label="Reuniões" value={String(counts.call)} sub="últimos 90d" color="#3B82F6" />
        </div>

        {/* Filtros + botao registrar */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip label="Tudo" count={items.length} active={filterKind === "tudo"} onClick={() => setFilterKind("tudo")} />
            {(Object.keys(KIND_CFG) as Array<keyof typeof KIND_CFG>).map((k) => (
              <FilterChip
                key={k}
                label={KIND_CFG[k].label}
                count={items.filter((i) => i.kind === k).length}
                active={filterKind === k}
                color={KIND_CFG[k].color}
                onClick={() => setFilterKind(k)}
              />
            ))}
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-brand-500 hover:bg-brand-600 text-white text-[12px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Registrar
          </button>
        </div>

        {/* Timeline */}
        <Card title="Linha do tempo" subtitle={`${filtered.length} eventos · ordenados por mais recente`}>
          {loading && (
            <div className="py-8 text-center text-[12px] text-slate-400 italic">Carregando…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[13px] text-slate-500 mb-2">Nenhuma atividade registrada ainda</p>
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-[12px] font-medium text-brand-600 hover:underline"
              >
                + Registrar primeira atividade
              </button>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="flex flex-col">
              {filtered.map((a) => (
                <ActivityItem key={a.id} a={a} />
              ))}
            </div>
          )}
        </Card>

        {/* Tabela de testes A/B */}
        {abTests.length > 0 && (
          <Card title="Testes A/B realizados" subtitle={`${abTests.length} testes · histórico`}>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[12px] min-w-[500px]">
                <thead>
                  <tr className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    <th className="py-2">Teste</th>
                    <th className="py-2">Data</th>
                    <th className="py-2">Vencedor</th>
                    <th className="py-2">Métrica</th>
                    <th className="py-2 text-right">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {abTests.map((t) => {
                    const m = (t.metadata ?? {}) as { winner?: string; metric?: string; delta?: number }
                    return (
                      <tr key={t.id} className="border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                        <td className="py-2 font-medium text-slate-900">{t.title}</td>
                        <td className="py-2 text-slate-500 font-mono">{new Date(t.occurred_at).toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 text-slate-700">{m.winner || "—"}</td>
                        <td className="py-2 text-slate-700">{m.metric || "—"}</td>
                        <td className="py-2 text-right">
                          {m.delta != null ? (
                            <span className={cn("font-bold tabular-nums", m.delta > 0 ? "text-emerald-600" : "text-red-600")}>
                              {m.delta > 0 ? "+" : ""}{(m.delta * 100).toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Sidebar: Materiais + Entregas do onboarding */}
      <div className="flex flex-col gap-4">
        <Card title="Materiais & arquivos">
          <div className="flex flex-col gap-1.5">
            {[
              { icon: ImageIcon, label: "Figma · Onboarding completo", sub: "20 e-mails · 6 popups · 4 fluxos" },
              { icon: ImageIcon, label: "Figma · Pacote de e-mails", sub: "Atualizado 08/05/2026" },
              { icon: FileText, label: "Google Drive · Pasta da loja", sub: "briefings, exports, gravações" },
            ].map((m) => {
              const Icon = m.icon
              return (
                <button
                  key={m.label}
                  className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-slate-50 transition-colors text-left w-full"
                >
                  <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-slate-900 leading-tight">{m.label}</div>
                    <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">{m.sub}</div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-300" />
                </button>
              )
            })}
          </div>
        </Card>

        <Card title="Entregas do onboarding" subtitle="Pacote inicial">
          <div className="flex flex-col gap-1">
            {[
              { label: "Welcome Flow", date: "15/03", done: true },
              { label: "Abandoned Cart", date: "15/03", done: true },
              { label: "Abandoned Checkout", date: "15/03", done: true },
              { label: "Viewed Product", date: "15/03", done: true },
              { label: "Rastreio Criado", date: "15/03", done: true },
              { label: "Upsell", date: "20/03", done: true },
              { label: "Winback", date: "02/04", done: true },
              { label: "Site Abandonado", date: "02/04", done: true },
              { label: "Pacote Dia das Mães", date: "02/05", done: true },
            ].map((d) => (
              <div key={d.label} className="flex items-center justify-between text-[12px] py-1">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: d.done ? "#10B981" : "#9CA3AF" }}
                  />
                  <span className={d.done ? "text-slate-700" : "text-slate-400"}>{d.label}</span>
                </span>
                <span className="text-[10.5px] text-slate-400 font-mono">{d.date}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {drawerOpen && (
        <RegisterDrawer storeId={storeId} onClose={() => setDrawerOpen(false)} onSaved={reload} />
      )}
    </div>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white border rounded-[8px] p-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[22px] font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      <div className="text-[10.5px] text-slate-500 mt-1">{sub}</div>
    </div>
  )
}

function FilterChip({
  label, count, active, onClick, color,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
      )}
    >
      {color && active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#fff" }} />}
      {color && !active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {label}
      <span className={cn("text-[10px] font-bold tabular-nums", active ? "text-white/70" : "text-slate-400")}>{count}</span>
    </button>
  )
}

function ActivityItem({ a }: { a: Activity }) {
  const cfg = KIND_CFG[a.kind]
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: cfg.color, minHeight: 32 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${cfg.color}1A`, color: cfg.color }}
          >
            {cfg.label}
          </span>
          <span className="text-[10.5px] text-slate-400 font-mono">
            {new Date(a.occurred_at).toLocaleDateString("pt-BR")}
          </span>
          {a.author?.name && (
            <span className="text-[10.5px] text-slate-500">· {a.author.name}</span>
          )}
        </div>
        <div className="text-[13px] font-medium text-slate-900 leading-tight">{a.title}</div>
        {a.summary && (
          <div className="text-[12px] text-slate-500 mt-1 leading-snug">{a.summary}</div>
        )}
        {a.tags && a.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {a.tags.map((t) => (
              <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({
  title, subtitle, children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="mb-3">
        <h3 className="text-[13px] font-bold text-slate-900 m-0 leading-tight">{title}</h3>
        {subtitle && <p className="text-[11.5px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function RegisterDrawer({ storeId, onClose, onSaved }: { storeId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<keyof typeof KIND_CFG>("feedback")
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [tags, setTags] = useState("")
  const [winner, setWinner] = useState("")
  const [metric, setMetric] = useState("")
  const [delta, setDelta] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const metadata: Record<string, unknown> = {}
    if (kind === "teste") {
      if (winner) metadata.winner = winner
      if (metric) metadata.metric = metric
      if (delta) metadata.delta = Number(delta) / 100
    }
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          summary: summary.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          metadata,
        }),
      })
      if (res.ok) {
        onSaved()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-slate-900/30" />
      <div className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[92vw] bg-white shadow-2xl z-[81] overflow-y-auto flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <h2 className="text-[15px] font-bold text-slate-900 m-0">Registrar atividade</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-2 uppercase tracking-wider">Tipo</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(KIND_CFG) as Array<keyof typeof KIND_CFG>).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "px-2 py-1.5 rounded-md text-[11.5px] font-medium border transition-colors",
                    kind === k
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {KIND_CFG[k].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Título *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Feedback semanal · Bruna"
              className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Resumo</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Detalhes do que aconteceu…"
              className="w-full px-3 py-2 rounded-md border text-[13px] outline-none focus:border-brand-500 resize-y"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Tags (vírgulas)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex: open rate, ctr, mobile"
              className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
            />
          </div>
          {kind === "teste" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Vencedor</label>
                <input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="A / B" className="w-full h-9 px-3 rounded-md border text-[13px] outline-none" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Métrica</label>
                <input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="open_rate" className="w-full h-9 px-3 rounded-md border text-[13px] outline-none" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Δ %</label>
                <input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" placeholder="18.2" className="w-full h-9 px-3 rounded-md border text-[13px] outline-none" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-slate-50/40" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <button onClick={onClose} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Registrar"}
          </button>
        </div>
      </div>
    </>
  )
}
