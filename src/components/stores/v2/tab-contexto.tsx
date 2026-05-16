"use client"

/**
 * Aba Contexto — consolida marca, briefing, operação, lista & engajamento,
 * concorrência. Persiste em client_stores (+ client_competitors).
 */

import { useEffect, useState } from "react"
import { Edit2, Plus, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { PesquisaSection, type PesquisaData } from "./pesquisa/pesquisa-section"

interface StoreContext {
  niche?: string | null
  slogan?: string | null
  diferencial?: string | null
  persona?: string | null
  tom_de_voz?: string | null
  posicionamento_preco?: string | null
  hashtags?: string[] | null
  cores?: Array<{ name: string; hex: string; use?: string }> | null
  fontes?: { titulo?: string; corpo?: string } | null
  ticket_medio_cents?: number | null
  taxa_conversao?: number | null
  faturamento_medio_cents?: number | null
  margem_media?: number | null
  recorrencia?: string | null
  sazonalidade?: string[] | null
  frete_medio_cents?: number | null
  frete_prazo?: string | null
  frete_cobertura?: string | null
  frete_gratis_acima_cents?: number | null
  pagamento_split?: Record<string, number> | null
  devolucao_politica?: string | null
  marketplaces?: string[] | null
  lista_total?: number | null
  lista_engajados_30?: number | null
  lista_engajados_60?: number | null
  lista_engajados_90?: number | null
  lista_crescimento_mensal?: number | null
  sms_consent_pct?: number | null
  target_audience?: string | null
  additional_notes?: string | null
}

interface Competitor {
  id: string
  name: string
  url: string | null
  posicionamento: string | null
  notas: string | null
}

interface StoreLite {
  client_id?: string | null
}

const TOM_OPTS = ["formal", "casual", "afetivo", "divertido"] as const
const PRECO_OPTS = ["popular", "medio", "premium"] as const

export function TabContexto({ storeId }: { storeId: string }) {
  const [ctx, setCtx] = useState<StoreContext>({})
  const [storeLite, setStoreLite] = useState<StoreLite>({})
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    try {
      const [cs, comps] = await Promise.all([
        fetch(`/api/client-stores/${storeId}`).then((r) => r.json()),
        fetch(`/api/admin/stores/${storeId}/competitors`).then((r) => r.json()),
      ])
      const storeObj = (cs.data?.store ?? cs.store ?? cs) as Record<string, unknown>
      setCtx(storeObj as StoreContext)
      setStoreLite({ client_id: (storeObj.client_id as string | null) ?? null })
      setCompetitors((comps.data?.competitors ?? comps.competitors ?? []) as Competitor[])
    } catch {
      // noop
    }
  }
  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [storeId])

  const patch = async (update: Partial<StoreContext>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      })
      if (res.ok) {
        setCtx({ ...ctx, ...update })
        setEditing(null)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Anchors */}
      <div className="flex gap-1 overflow-x-auto pb-2 text-[12px] font-medium text-slate-500">
        {["Marca", "Pesquisa & Diagnóstico", "Briefing completo", "Operação", "Lista & Engajamento", "Concorrência"].map((a) => (
          <a key={a} href={`#${a.toLowerCase().replace(/\s+&\s+/g, "-").replace(/\s+/g, "-")}`} className="px-2.5 py-1 rounded-md hover:bg-slate-100 whitespace-nowrap">
            {a}
          </a>
        ))}
      </div>

      {/* MARCA */}
      <Section id="marca" title="Marca & Identidade visual" onEdit={() => setEditing(editing === "marca" ? null : "marca")}>
        {editing === "marca" ? (
          <EditMarca ctx={ctx} onSave={patch} saving={saving} onCancel={() => setEditing(null)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Nicho" value={ctx.niche} />
              <Field label="Slogan" value={ctx.slogan} fallback="—" />
              <Field label="Diferencial declarado" value={ctx.diferencial} fallback="—" />
              <Field label="Persona-alvo" value={ctx.persona} fallback="—" />
              <div className="col-span-1 md:col-span-2">
                <FieldLabel label="Tom de voz" />
                <div className="flex flex-wrap gap-1.5">
                  {TOM_OPTS.map((o) => (
                    <span key={o} className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium",
                      ctx.tom_de_voz === o ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-slate-100 text-slate-400 border border-transparent",
                    )}>
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="col-span-1 md:col-span-2">
                <FieldLabel label="Posicionamento de preço" />
                <div className="flex flex-wrap gap-1.5">
                  {PRECO_OPTS.map((o) => (
                    <span key={o} className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium",
                      ctx.posicionamento_preco === o ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-slate-100 text-slate-400 border border-transparent",
                    )}>
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="col-span-1 md:col-span-2">
                <FieldLabel label="Hashtags" />
                <div className="flex flex-wrap gap-1.5">
                  {ctx.hashtags && ctx.hashtags.length > 0 ? (
                    ctx.hashtags.map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono">
                        {h.startsWith("#") ? h : `#${h}`}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11.5px] text-slate-400 italic">Sem hashtags</span>
                  )}
                </div>
              </div>
            </div>

            {/* Paleta + Tipografia mini */}
            <div className="flex flex-col gap-3">
              <div>
                <FieldLabel label="Paleta de cores" />
                {ctx.cores && ctx.cores.length > 0 ? (
                  <div className="grid grid-cols-5 gap-1.5">
                    {ctx.cores.slice(0, 5).map((c, i) => (
                      <div key={i} className="text-center">
                        <div className="w-full aspect-square rounded-md mb-1 border" style={{ background: c.hex, borderColor: "rgba(0,0,0,0.06)" }} />
                        <div className="text-[9px] font-mono text-slate-500 truncate">{c.hex}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-slate-400 italic">Sem paleta cadastrada</div>
                )}
              </div>
              <div>
                <FieldLabel label="Tipografia" />
                {ctx.fontes && (ctx.fontes.titulo || ctx.fontes.corpo) ? (
                  <div className="space-y-1">
                    {ctx.fontes.titulo && <div className="text-[12px] text-slate-700"><span className="text-slate-400">Títulos:</span> {ctx.fontes.titulo}</div>}
                    {ctx.fontes.corpo && <div className="text-[12px] text-slate-700"><span className="text-slate-400">Corpo:</span> {ctx.fontes.corpo}</div>}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-slate-400 italic">Sem tipografia cadastrada</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* PESQUISA & DIAGNÓSTICO — 5 pilares editoriais (substitui o antigo "Briefing estratégico") */}
      <PesquisaSection storeId={storeId} initialData={ctx as PesquisaData} />

      {/* BRIEFING COMPLETO (IA + formulario de onboarding) */}
      <Section id="briefing-completo" title="Briefing completo (gerado por IA)">
        <StoreBriefingTab storeId={storeId} clientId={storeLite.client_id ?? null} />
      </Section>

      {/* OPERAÇÃO */}
      <Section id="operacao" title="Operação & catálogo" onEdit={() => setEditing(editing === "operacao" ? null : "operacao")}>
        {editing === "operacao" ? (
          <EditOperacao ctx={ctx} onSave={patch} saving={saving} onCancel={() => setEditing(null)} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Ticket médio" value={ctx.ticket_medio_cents ? `R$ ${(ctx.ticket_medio_cents / 100).toFixed(0)}` : "—"} />
            <Kpi label="Taxa de conversão" value={ctx.taxa_conversao ? `${(ctx.taxa_conversao * 100).toFixed(2)}%` : "—"} />
            <Kpi label="Faturamento médio (3m)" value={ctx.faturamento_medio_cents ? `R$ ${((ctx.faturamento_medio_cents / 100) / 1000).toFixed(0)}k` : "—"} />
            <Kpi label="Margem média" value={ctx.margem_media ? `${(ctx.margem_media * 100).toFixed(0)}%` : "—"} />
            <Kpi label="Recorrência" value={ctx.recorrencia ?? "—"} />
            <Kpi label="Frete médio" value={ctx.frete_medio_cents ? `R$ ${(ctx.frete_medio_cents / 100).toFixed(0)}` : "—"} />
            <Kpi label="Prazo entrega" value={ctx.frete_prazo ?? "—"} />
            <Kpi label="Cobertura" value={ctx.frete_cobertura ?? "—"} />
          </div>
        )}
      </Section>

      {/* LISTA & ENGAJAMENTO */}
      <Section id="lista-engajamento" title="Lista & engajamento" onEdit={() => setEditing(editing === "lista" ? null : "lista")}>
        {editing === "lista" ? (
          <EditLista ctx={ctx} onSave={patch} saving={saving} onCancel={() => setEditing(null)} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total lista" value={ctx.lista_total?.toLocaleString("pt-BR") ?? "—"} />
            <Kpi label="Engajados 30d" value={ctx.lista_engajados_30?.toLocaleString("pt-BR") ?? "—"} />
            <Kpi label="Engajados 90d" value={ctx.lista_engajados_90?.toLocaleString("pt-BR") ?? "—"} />
            <Kpi label="Crescimento /mês" value={ctx.lista_crescimento_mensal ? `${(ctx.lista_crescimento_mensal * 100).toFixed(1)}%` : "—"} />
            <Kpi label="Consent SMS" value={ctx.sms_consent_pct ? `${(ctx.sms_consent_pct * 100).toFixed(0)}%` : "—"} />
          </div>
        )}
      </Section>

      {/* CONCORRÊNCIA */}
      <Section id="concorrencia" title="Concorrência" actions={
        <button onClick={() => setEditing(editing === "concorrentes" ? null : "concorrentes")} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-600 hover:underline">
          <Plus className="h-3 w-3" /> Concorrente
        </button>
      }>
        {competitors.length === 0 && editing !== "concorrentes" ? (
          <div className="text-[12px] text-slate-400 italic py-2">Nenhum concorrente cadastrado.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {competitors.map((c) => (
              <div key={c.id} className="border rounded-md p-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-[13px] font-semibold text-slate-900 leading-tight">{c.name}</div>
                  {c.posicionamento && (
                    <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {c.posicionamento}
                    </span>
                  )}
                </div>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-1 mb-1">
                    {c.url.replace(/^https?:\/\//, "")} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {c.notas && <p className="text-[11.5px] text-slate-500 mt-1 leading-snug">{c.notas}</p>}
                <button
                  onClick={async () => {
                    if (!window.confirm("Excluir concorrente?")) return
                    await fetch(`/api/admin/stores/${storeId}/competitors/${c.id}`, { method: "DELETE" })
                    setCompetitors(competitors.filter((x) => x.id !== c.id))
                  }}
                  className="text-[10.5px] text-red-600 hover:underline mt-2"
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
        {editing === "concorrentes" && (
          <CompetitorForm storeId={storeId} onAdded={(c) => { setCompetitors([...competitors, c]); }} onClose={() => setEditing(null)} />
        )}
      </Section>
    </div>
  )
}

// ── Helpers ──

function Section({
  id, title, onEdit, actions, children,
}: {
  id?: string
  title: string
  onEdit?: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[14px] font-bold text-slate-900 m-0">{title}</h3>
        {actions || (onEdit && (
          <button onClick={onEdit} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-600 hover:underline">
            <Edit2 className="h-3 w-3" /> Editar
          </button>
        ))}
      </div>
      {children}
    </section>
  )
}

function Field({ label, value, fallback, multiline }: { label: string; value?: string | null; fallback?: string; multiline?: boolean }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className={cn("text-[12.5px] text-slate-900", multiline && "whitespace-pre-line")}>
        {value || <span className="text-slate-400 italic">{fallback || "—"}</span>}
      </div>
    </div>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 border px-3 py-2.5" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[16px] font-bold text-slate-900 tabular-nums leading-none">{value}</div>
    </div>
  )
}

function EditMarca({ ctx, onSave, saving, onCancel }: { ctx: StoreContext; onSave: (u: Partial<StoreContext>) => void; saving: boolean; onCancel: () => void }) {
  const [niche, setNiche] = useState(ctx.niche ?? "")
  const [slogan, setSlogan] = useState(ctx.slogan ?? "")
  const [diferencial, setDiferencial] = useState(ctx.diferencial ?? "")
  const [persona, setPersona] = useState(ctx.persona ?? "")
  const [tom, setTom] = useState(ctx.tom_de_voz ?? "")
  const [preco, setPreco] = useState(ctx.posicionamento_preco ?? "")
  const [hashtagsStr, setHashtagsStr] = useState((ctx.hashtags ?? []).join(", "))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Input label="Nicho" value={niche} onChange={setNiche} />
      <Input label="Slogan" value={slogan} onChange={setSlogan} />
      <Input label="Diferencial" value={diferencial} onChange={setDiferencial} />
      <Input label="Persona-alvo" value={persona} onChange={setPersona} />
      <div className="md:col-span-2">
        <FieldLabel label="Tom de voz" />
        <div className="flex flex-wrap gap-1.5">
          {TOM_OPTS.map((o) => (
            <button key={o} onClick={() => setTom(tom === o ? "" : o)} className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border", tom === o ? "bg-brand-50 text-brand-700 border-brand-300" : "bg-white text-slate-700 border-slate-200")}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-2">
        <FieldLabel label="Posicionamento de preço" />
        <div className="flex flex-wrap gap-1.5">
          {PRECO_OPTS.map((o) => (
            <button key={o} onClick={() => setPreco(preco === o ? "" : o)} className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border", preco === o ? "bg-brand-50 text-brand-700 border-brand-300" : "bg-white text-slate-700 border-slate-200")}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-2">
        <Input label="Hashtags (vírgulas)" value={hashtagsStr} onChange={setHashtagsStr} />
      </div>
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
        <button
          onClick={() => onSave({
            niche: niche || null,
            slogan: slogan || null,
            diferencial: diferencial || null,
            persona: persona || null,
            tom_de_voz: (tom as "formal" | "casual" | "afetivo" | "divertido") || null,
            posicionamento_preco: (preco as "popular" | "medio" | "premium") || null,
            hashtags: hashtagsStr.split(",").map((t) => t.trim()).filter(Boolean),
          })}
          disabled={saving}
          className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  )
}

function EditOperacao({ ctx, onSave, saving, onCancel }: { ctx: StoreContext; onSave: (u: Partial<StoreContext>) => void; saving: boolean; onCancel: () => void }) {
  const [tk, setTk] = useState(ctx.ticket_medio_cents ? String(ctx.ticket_medio_cents / 100) : "")
  const [conv, setConv] = useState(ctx.taxa_conversao ? String(ctx.taxa_conversao * 100) : "")
  const [fat, setFat] = useState(ctx.faturamento_medio_cents ? String(ctx.faturamento_medio_cents / 100) : "")
  const [marg, setMarg] = useState(ctx.margem_media ? String(ctx.margem_media * 100) : "")
  const [rec, setRec] = useState(ctx.recorrencia ?? "")
  const [frP, setFrP] = useState(ctx.frete_medio_cents ? String(ctx.frete_medio_cents / 100) : "")
  const [frPrazo, setFrPrazo] = useState(ctx.frete_prazo ?? "")
  const [frCob, setFrCob] = useState(ctx.frete_cobertura ?? "")

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Input label="Ticket médio (R$)" type="number" value={tk} onChange={setTk} />
      <Input label="Taxa conversão (%)" type="number" value={conv} onChange={setConv} />
      <Input label="Faturamento médio 3m (R$)" type="number" value={fat} onChange={setFat} />
      <Input label="Margem (%)" type="number" value={marg} onChange={setMarg} />
      <Select label="Recorrência" value={rec} onChange={setRec} options={[
        { value: "", label: "—" },
        { value: "compra-unica", label: "Compra única" },
        { value: "assinatura", label: "Assinatura" },
        { value: "mista", label: "Mista" },
      ]} />
      <Input label="Frete médio (R$)" type="number" value={frP} onChange={setFrP} />
      <Input label="Prazo entrega" value={frPrazo} onChange={setFrPrazo} />
      <Input label="Cobertura" value={frCob} onChange={setFrCob} />
      <div className="col-span-2 md:col-span-4 flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
        <button
          onClick={() => onSave({
            ticket_medio_cents: tk ? Math.round(Number(tk) * 100) : null,
            taxa_conversao: conv ? Number(conv) / 100 : null,
            faturamento_medio_cents: fat ? Math.round(Number(fat) * 100) : null,
            margem_media: marg ? Number(marg) / 100 : null,
            recorrencia: (rec as "compra-unica" | "assinatura" | "mista") || null,
            frete_medio_cents: frP ? Math.round(Number(frP) * 100) : null,
            frete_prazo: frPrazo || null,
            frete_cobertura: frCob || null,
          })}
          disabled={saving}
          className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  )
}

function EditLista({ ctx, onSave, saving, onCancel }: { ctx: StoreContext; onSave: (u: Partial<StoreContext>) => void; saving: boolean; onCancel: () => void }) {
  const [total, setTotal] = useState(ctx.lista_total?.toString() ?? "")
  const [eng30, setEng30] = useState(ctx.lista_engajados_30?.toString() ?? "")
  const [eng90, setEng90] = useState(ctx.lista_engajados_90?.toString() ?? "")
  const [cresc, setCresc] = useState(ctx.lista_crescimento_mensal ? String(ctx.lista_crescimento_mensal * 100) : "")
  const [sms, setSms] = useState(ctx.sms_consent_pct ? String(ctx.sms_consent_pct * 100) : "")

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Input label="Total lista" type="number" value={total} onChange={setTotal} />
      <Input label="Engajados 30d" type="number" value={eng30} onChange={setEng30} />
      <Input label="Engajados 90d" type="number" value={eng90} onChange={setEng90} />
      <Input label="Crescimento /mês (%)" type="number" value={cresc} onChange={setCresc} />
      <Input label="Consent SMS (%)" type="number" value={sms} onChange={setSms} />
      <div className="col-span-2 md:col-span-4 flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
        <button
          onClick={() => onSave({
            lista_total: total ? Number(total) : null,
            lista_engajados_30: eng30 ? Number(eng30) : null,
            lista_engajados_90: eng90 ? Number(eng90) : null,
            lista_crescimento_mensal: cresc ? Number(cresc) / 100 : null,
            sms_consent_pct: sms ? Number(sms) / 100 : null,
          })}
          disabled={saving}
          className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  )
}

function CompetitorForm({ storeId, onAdded, onClose }: { storeId: string; onAdded: (c: Competitor) => void; onClose: () => void }) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [pos, setPos] = useState("")
  const [notas, setNotas] = useState("")
  const [saving, setSaving] = useState(false)
  return (
    <div className="mt-3 p-3 border-2 border-dashed rounded-md" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Nome *" value={name} onChange={setName} />
        <Input label="URL" value={url} onChange={setUrl} />
        <Select label="Posicionamento" value={pos} onChange={setPos} options={[
          { value: "", label: "—" },
          { value: "popular", label: "Popular" },
          { value: "similar", label: "Similar" },
          { value: "premium", label: "Premium" },
        ]} />
        <Input label="Notas" value={notas} onChange={setNotas} />
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="h-8 px-3 rounded-md text-[12px] font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
        <button
          onClick={async () => {
            if (!name.trim()) return
            setSaving(true)
            try {
              const res = await fetch(`/api/admin/stores/${storeId}/competitors`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), url: url || null, posicionamento: pos || null, notas: notas || null }),
              })
              const j = await res.json()
              const c = j.data?.competitor ?? j.competitor
              if (c) onAdded(c)
              onClose()
            } finally {
              setSaving(false)
            }
          }}
          disabled={!name.trim() || saving}
          className="h-8 px-3 rounded-md text-[12px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500" style={{ borderColor: "rgba(0,0,0,0.10)" }} />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <FieldLabel label={label} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-9 px-2 rounded-md border text-[13px] outline-none focus:border-brand-500 bg-white" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
