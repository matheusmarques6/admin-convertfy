"use client"

/**
 * Tab: Atividade — NOVA TELA. Mirror exato do prototype tab-atividade.jsx.
 *
 * Layout grid 2-col: minmax(0,1fr) 320px.
 *
 * Left:
 *  - 4 StatCard (Otimizações brand · Testes A/B purple · Entregas pos · Reuniões neut)
 *  - Filter row: FilterChips (Tudo · Feedbacks · Testes A/B · Otimizações ·
 *    Entregas · Setup) + Btn "Filtros" + Btn primary "+ Registrar"
 *  - Section "Linha do tempo" com ActivityList expanded (timeline vertical
 *    com 36px marker + linha conectora + badge + título + summary + tags)
 *  - Section "Testes A/B" com ABTestTable (6 colunas: teste · data ·
 *    vencedor badge · métrica · delta colorido · chev)
 *
 * Right:
 *  - Section "Materiais e arquivos" com MaterialItem rows
 *    (icon purple/info/neut + título + sub + extLink/download)
 *  - Section "Entregas do onboarding" com checklist done/review
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  Zap, Target, Package, Mail, Link2, Phone, Bell, Plus, Filter, X,
  ChevronRight, Check, Download, ExternalLink, Image as ImageIcon,
} from "lucide-react"
import { Section, Badge, Btn, C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

interface StoreMaterials {
  figma_onboarding_url?: string | null
  figma_emails_url?: string | null
  drive_folder_url?: string | null
}

interface TaskItem {
  id: string
  title: string
  status: string
  completed_at?: string | null
  due_date?: string | null
  created_at: string
}

const KIND_META = {
  feedback: { color: C.brand, label: "Feedback", Icon: Mail },
  teste: { color: C.purple, label: "Teste A/B", Icon: Target },
  otim: { color: C.amber, label: "Otimização", Icon: Zap },
  entrega: { color: C.pos, label: "Entrega", Icon: Package },
  integracao: { color: C.g600, label: "Integração", Icon: Link2 },
  call: { color: C.brand, label: "Call", Icon: Phone },
  outro: { color: C.g500, label: "Outro", Icon: Bell },
} as const

type FilterKey = "all" | "feedback" | "teste" | "otim" | "entrega" | "integracao"

export function TabAtividade({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState<FilterKey>("all")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: storeData } = useSWR(`/api/client-stores/${storeId}`, fetcher, { revalidateOnFocus: false })
  const materials = (storeData?.data?.store ?? storeData?.store ?? storeData ?? {}) as StoreMaterials

  const { data: tasksData } = useSWR(`/api/tasks?store_id=${storeId}&source_type=auto_onboarding_step&limit=50`, fetcher, { revalidateOnFocus: false })
  const deliveries = useMemo(() => ((tasksData?.tasks ?? tasksData?.data?.tasks ?? []) as TaskItem[]).slice(0, 12), [tasksData])

  const reload = () => {
    setLoading(true)
    fetch(`/api/admin/stores/${storeId}/activity?limit=200`)
      .then((r) => r.json())
      .then((j) => setItems((j.data?.items ?? j.items ?? []) as Activity[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [storeId])

  const counts = useMemo(() => {
    const c: Record<string, number> = { otim: 0, teste: 0, entrega: 0, call: 0, feedback: 0, integracao: 0 }
    items.forEach((i) => {
      if (i.kind in c) c[i.kind]++
    })
    return c
  }, [items])

  const testesGanhos = useMemo(
    () => items.filter((i) => i.kind === "teste" && (i.metadata?.delta as number) > 0).length,
    [items],
  )
  const testesPerdas = useMemo(
    () => items.filter((i) => i.kind === "teste" && (i.metadata?.delta as number) < 0).length,
    [items],
  )

  const filters: Array<{ key: FilterKey; label: string; n: number }> = [
    { key: "all", label: "Tudo", n: items.length },
    { key: "feedback", label: "Feedbacks", n: counts.feedback },
    { key: "teste", label: "Testes A/B", n: counts.teste },
    { key: "otim", label: "Otimizações", n: counts.otim },
    { key: "entrega", label: "Entregas", n: counts.entrega },
    { key: "integracao", label: "Setup", n: counts.integracao },
  ]

  const filtered = useMemo(
    () => filterKind === "all" ? items : items.filter((i) => i.kind === filterKind),
    [items, filterKind],
  )

  const abTests = useMemo(() => items.filter((i) => i.kind === "teste"), [items])

  const materialsList: Array<{
    Icon: typeof ImageIcon
    tone: "purple" | "info" | "neut"
    title: string
    sub: string
    url: string
    dl?: boolean
  }> = []
  if (materials.figma_onboarding_url) {
    materialsList.push({
      Icon: Link2, tone: "purple",
      title: "Figma · Onboarding completo",
      sub: "Pacote inicial",
      url: materials.figma_onboarding_url,
    })
  }
  if (materials.figma_emails_url) {
    materialsList.push({
      Icon: Link2, tone: "purple",
      title: "Figma · Pacote de e-mails",
      sub: "Templates da loja",
      url: materials.figma_emails_url,
    })
  }
  if (materials.drive_folder_url) {
    materialsList.push({
      Icon: Link2, tone: "info",
      title: "Google Drive · Pasta da loja",
      sub: "Briefings, exports, gravações",
      url: materials.drive_folder_url,
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      {/* LEFT */}
      <div>
        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard tone="brand" label="Otimizações" value={counts.otim} sub="aplicadas" Icon={Zap} />
          <StatCard tone="purple" label="Testes A/B" value={counts.teste} sub={`${testesGanhos} wins · ${testesPerdas} perdas`} Icon={Target} />
          <StatCard tone="pos" label="Entregas" value={counts.entrega} sub="materiais finalizados" Icon={Package} />
          <StatCard tone="neut" label="Reuniões" value={counts.feedback + counts.call} sub="últimos 90d" Icon={Mail} />
        </div>

        {/* Filter row */}
        <div className="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {filters.map((f) => (
              <FilterChip key={f.key} label={f.label} n={f.n} active={filterKind === f.key} onClick={() => setFilterKind(f.key)} />
            ))}
          </div>
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" icon={<Filter className="h-3.5 w-3.5" />}>Filtros</Btn>
            <Btn variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDrawerOpen(true)}>Registrar</Btn>
          </div>
        </div>

        {/* Timeline */}
        <Section title="Linha do tempo" subtitle={`${filtered.length} eventos · ordenado por mais recente`}>
          {loading ? (
            <div className="py-8 text-center text-[12px] italic" style={{ color: C.g400 }}>Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] mb-2" style={{ color: C.g500 }}>Nenhuma atividade registrada ainda</p>
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-[12px] font-medium hover:underline"
                style={{ color: C.brand }}
              >
                + Registrar primeira atividade
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map((a, i) => (
                <ActivityRow key={a.id} a={a} last={i === filtered.length - 1} />
              ))}
            </div>
          )}
        </Section>

        {/* A/B Test table */}
        {abTests.length > 0 && (
          <Section
            title="Testes A/B"
            subtitle="Histórico de experimentos · resultado consolidado"
            right={<Btn variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDrawerOpen(true)}>Novo teste</Btn>}
          >
            <ABTestTable tests={abTests} />
          </Section>
        )}
      </div>

      {/* RIGHT */}
      <div>
        <Section title="Materiais e arquivos">
          {materialsList.length === 0 ? (
            <div className="py-3 text-center text-[11.5px] italic" style={{ color: C.g400 }}>
              Sem materiais cadastrados.<br />Adicione links em <strong>Contexto</strong>.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {materialsList.map((m, i) => <MaterialItem key={i} {...m} />)}
            </div>
          )}
        </Section>

        <Section
          title="Entregas do onboarding"
          subtitle={deliveries.length ? `${deliveries.filter((t) => t.status === "completed").length} de ${deliveries.length} concluídas` : "Pacote inicial"}
        >
          {deliveries.length === 0 ? (
            <div className="py-3 text-center text-[11.5px] italic" style={{ color: C.g400 }}>
              Sem entregas do onboarding ainda.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {deliveries.map((d) => {
                const done = d.status === "completed"
                const review = d.status === "review"
                const dateLabel = done && d.completed_at
                  ? new Date(d.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                  : d.due_date
                    ? new Date(d.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                    : "—"
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-[6px]"
                    style={{
                      background: review ? C.warnBg : "transparent",
                      border: `1px solid ${review ? C.warnBorder : "transparent"}`,
                    }}
                  >
                    <div
                      className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center shrink-0 text-white"
                      style={{ background: done ? C.pos : C.amber }}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="flex-1 text-[12.5px] font-medium text-slate-900 truncate">{d.title}</span>
                    <span className="text-[11px] shrink-0" style={{ color: C.g400, ...TNUM }}>{dateLabel}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {drawerOpen && (
        <RegisterDrawer storeId={storeId} onClose={() => setDrawerOpen(false)} onSaved={reload} />
      )}
    </div>
  )
}

// ─── Atoms ──────────────────────────────────────────

function StatCard({ tone, label, value, sub, Icon }: {
  tone: "brand" | "purple" | "pos" | "neut"
  label: string
  value: number
  sub: string
  Icon: typeof Zap
}) {
  const map = {
    brand: { bg: C.blue50, c: C.brand },
    purple: { bg: C.purpleBg, c: C.purple },
    pos: { bg: C.posBg, c: C.pos },
    neut: { bg: C.g50, c: C.g700 },
  }
  const m = map[tone]
  return (
    <div
      className="p-4 rounded-[12px] flex items-start gap-3"
      style={{ background: C.white, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}
    >
      <div className="w-9 h-9 rounded-[8px] inline-flex items-center justify-center shrink-0" style={{ background: m.bg, color: m.c }}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: C.g500 }}>{label}</div>
        <div className="text-[22px] font-semibold mt-0.5" style={{ color: C.g900, ...TNUM }}>{value}</div>
        <div className="text-[11.5px] mt-0.5" style={{ color: C.g500 }}>{sub}</div>
      </div>
    </div>
  )
}

function FilterChip({ label, n, active, onClick }: { label: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
      style={{
        background: active ? C.g900 : C.white,
        color: active ? "#fff" : C.g700,
        border: `1px solid ${active ? C.g900 : C.border}`,
      }}
    >
      {label}
      <span className="font-semibold" style={{ opacity: 0.7, ...TNUM }}>{n}</span>
    </button>
  )
}

function ActivityRow({ a, last }: { a: Activity; last: boolean }) {
  const m = KIND_META[a.kind] ?? KIND_META.outro
  const Icon = m.Icon
  const dateStr = new Date(a.occurred_at).toLocaleDateString("pt-BR")
  const tone = a.kind === "teste" ? "purple" : a.kind === "otim" ? "warn" : a.kind === "entrega" ? "pos" : "info"
  return (
    <div className="flex gap-3.5 relative">
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-9 h-9 rounded-full inline-flex items-center justify-center z-10"
          style={{
            background: m.color + "15",
            color: m.color,
            border: `2px solid ${C.white}`,
          }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {!last && <div className="w-0.5 flex-1" style={{ background: C.border, marginTop: -2 }} />}
      </div>
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge tone={tone}>{m.label}</Badge>
          <span className="text-[11.5px]" style={{ color: C.g400, ...TNUM }}>{dateStr}</span>
          {a.author?.name && <span className="text-[11.5px]" style={{ color: C.g500 }}>· {a.author.name}</span>}
        </div>
        <div className="text-[14px] font-semibold text-slate-900">{a.title}</div>
        {a.summary && <div className="text-[13px] mt-1" style={{ color: C.g600 }}>{a.summary}</div>}
        {a.tags && a.tags.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {a.tags.map((t, i) => (
              <span
                key={i}
                className="text-[10.5px] font-medium px-1.5 py-[2px] rounded-[4px]"
                style={{ background: C.g50, border: `1px solid ${C.border}`, color: C.g600, ...TNUM }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ABTestTable({ tests }: { tests: Activity[] }) {
  return (
    <div className="overflow-x-auto -mx-[18px]">
      <table className="w-full" style={{ borderCollapse: "collapse" as const }}>
        <thead>
          <tr style={{ background: C.g50 }}>
            {["Teste", "Data", "Vencedor", "Métrica", "Delta", ""].map((h) => (
              <th
                key={h}
                className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-left"
                style={{ padding: "8px 10px", color: C.g500, borderBottom: `1px solid ${C.border}` }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => {
            const m = (t.metadata ?? {}) as { winner?: string; metric?: string; delta?: number }
            const deltaNum = typeof m.delta === "number" ? m.delta : null
            const tone = deltaNum == null ? "neut" : deltaNum > 0 ? "pos" : "neg"
            const deltaStr = deltaNum == null ? "inconcl." : `${deltaNum >= 0 ? "+" : ""}${(deltaNum * 100).toFixed(1)}%`
            return (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="text-[13px] font-medium" style={{ padding: "10px", color: C.g900 }}>{t.title}</td>
                <td className="text-[12]" style={{ padding: "10px", color: C.g500, ...TNUM }}>{new Date(t.occurred_at).toLocaleDateString("pt-BR")}</td>
                <td style={{ padding: "10px" }}><Badge tone={m.winner === "A" ? "neut" : "info"}>Variante {m.winner ?? "?"}</Badge></td>
                <td className="text-[12]" style={{ padding: "10px", color: C.g600 }}>{m.metric ?? "—"}</td>
                <td
                  className="text-[13px] font-semibold"
                  style={{ padding: "10px", color: tone === "pos" ? C.pos : tone === "neg" ? C.neg : C.g500, ...TNUM }}
                >
                  {deltaStr}
                </td>
                <td className="text-right" style={{ padding: "10px" }}>
                  <ChevronRight className="h-3.5 w-3.5 inline" style={{ color: C.g400 }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MaterialItem({ Icon, tone, title, sub, url, dl }: {
  Icon: typeof ImageIcon
  tone: "purple" | "info" | "neut"
  title: string
  sub: string
  url: string
  dl?: boolean
}) {
  const colors: Record<string, string> = { purple: C.purple, info: C.brand, neut: C.g600 }
  const c = colors[tone] ?? C.g600
  return (
    <a
      href={url}
      target={url.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] transition-colors hover:bg-slate-50"
      style={{ border: `1px solid ${C.border}`, background: C.white }}
    >
      <div
        className="w-[30px] h-[30px] rounded-[6px] inline-flex items-center justify-center shrink-0"
        style={{ background: c + "15", color: c }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold truncate" style={{ color: C.g900 }}>{title}</div>
        <div className="text-[11px]" style={{ color: C.g500 }}>{sub}</div>
      </div>
      <span style={{ color: C.g400 }}>
        {dl ? <Download className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
      </span>
    </a>
  )
}

// ─── Register Drawer ──────────────────────────────────

function RegisterDrawer({ storeId, onClose, onSaved }: { storeId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<keyof typeof KIND_META>("feedback")
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
      <div className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[92vw] z-[81] overflow-y-auto flex flex-col shadow-2xl"
        style={{ background: C.white }}
      >
        <header className="px-5 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h2 className="text-[15px] font-bold text-slate-900 m-0">Registrar atividade</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" style={{ color: C.g500 }}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 px-5 py-4 space-y-4">
          <Field label="Tipo">
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className="px-2 py-1.5 rounded-[6px] text-[11.5px] font-medium border transition-colors"
                  style={{
                    background: kind === k ? C.g900 : C.white,
                    color: kind === k ? "#fff" : C.g700,
                    borderColor: kind === k ? C.g900 : C.border,
                  }}
                >
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Título *">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Feedback semanal · Bruna"
              className="w-full h-9 px-3 rounded-[6px] text-[13px] outline-none"
              style={{ border: `1px solid ${C.border}` }}
            />
          </Field>
          <Field label="Resumo">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Detalhes do que aconteceu…"
              className="w-full px-3 py-2 rounded-[6px] text-[13px] outline-none resize-y"
              style={{ border: `1px solid ${C.border}` }}
            />
          </Field>
          <Field label="Tags (vírgulas)">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex: open rate, ctr, mobile"
              className="w-full h-9 px-3 rounded-[6px] text-[13px] outline-none"
              style={{ border: `1px solid ${C.border}` }}
            />
          </Field>
          {kind === "teste" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Vencedor">
                <input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="A / B"
                  className="w-full h-9 px-3 rounded-[6px] text-[13px] outline-none"
                  style={{ border: `1px solid ${C.border}` }} />
              </Field>
              <Field label="Métrica">
                <input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="open_rate"
                  className="w-full h-9 px-3 rounded-[6px] text-[13px] outline-none"
                  style={{ border: `1px solid ${C.border}` }} />
              </Field>
              <Field label="Δ %">
                <input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" placeholder="18.2"
                  className="w-full h-9 px-3 rounded-[6px] text-[13px] outline-none"
                  style={{ border: `1px solid ${C.border}` }} />
              </Field>
            </div>
          )}
        </div>
        <footer className="px-5 py-3 flex items-center justify-end gap-2 shrink-0"
          style={{ borderTop: `1px solid ${C.border}`, background: "#FAFAFA" }}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={!title.trim() || saving} onClick={handleSave}>
            {saving ? "Salvando…" : "Registrar"}
          </Btn>
        </footer>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-[0.04em] mb-1.5" style={{ color: C.g600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
