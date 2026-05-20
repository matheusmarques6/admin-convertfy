"use client"

/**
 * Aba Contexto — consolida marca, briefing, operação, lista & engajamento,
 * concorrência. Persiste em client_stores (+ client_competitors +
 * store_brand_identity para assets de logo/cores/fontes).
 */

import { useEffect, useState } from "react"
import { Edit2, Plus, ExternalLink, FileText, Upload, Download, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
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
  brand_manual_url?: string | null
  research_doc_url?: string | null
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

interface TopProduct {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  external_id: string | null
  source: string
  captured_at: string | null
}

interface StoreLite {
  client_id?: string | null
}

interface BrandIdentity {
  id: string
  version: number
  logo_main_svg: string | null
  logo_main_png: string | null
  logo_alt_svg: string | null
  logo_alt_png: string | null
  logo_monogram_svg: string | null
  logo_monogram_png: string | null
  logo_reverse_svg: string | null
  logo_reverse_png: string | null
}

const TOM_OPTS = ["formal", "casual", "afetivo", "divertido"] as const
const PRECO_OPTS = ["popular", "medio", "premium"] as const

export function TabContexto({ storeId }: { storeId: string }) {
  const [ctx, setCtx] = useState<StoreContext>({})
  const [, setStoreLite] = useState<StoreLite>({})
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [brandIdentity, setBrandIdentity] = useState<BrandIdentity | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const reload = async () => {
    try {
      const [cs, comps, tp, bi] = await Promise.all([
        fetch(`/api/client-stores/${storeId}`).then((r) => r.json()),
        fetch(`/api/admin/stores/${storeId}/competitors`).then((r) => r.json()),
        fetch(`/api/admin/stores/${storeId}/top-products?limit=5`).then((r) => r.json()),
        fetch(`/api/admin/stores/${storeId}/brand-identity`).then((r) => r.json()).catch(() => ({})),
      ])
      const storeObj = (cs.data?.store ?? cs.store ?? cs) as Record<string, unknown>
      setCtx(storeObj as StoreContext)
      setStoreLite({ client_id: (storeObj.client_id as string | null) ?? null })
      setCompetitors((comps.data?.competitors ?? comps.competitors ?? []) as Competitor[])
      setTopProducts((tp.products ?? tp.data?.products ?? []) as TopProduct[])
      setBrandIdentity((bi.data?.identity ?? bi.identity ?? null) as BrandIdentity | null)
    } catch {
      // noop
    }
  }

  const reloadBrandIdentity = async () => {
    try {
      const bi = await fetch(`/api/admin/stores/${storeId}/brand-identity`).then((r) => r.json())
      setBrandIdentity((bi.data?.identity ?? bi.identity ?? null) as BrandIdentity | null)
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

  const syncFromOnboarding = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/sync-from-onboarding`, {
        method: "POST",
      })
      const j = await res.json()
      const r = j.data ?? j
      if (r?.ok === false) {
        setSyncMsg(r.reason ?? "Não foi possível sincronizar.")
      } else {
        const filled = Array.isArray(r.mirrored) ? r.mirrored.length : 0
        const updated = Array.isArray(r.overwritten) ? r.overwritten.length : 0
        if (filled === 0 && updated === 0) {
          setSyncMsg("Nenhuma diferença em relação ao formulário.")
        } else {
          const parts: string[] = []
          if (filled > 0) parts.push(`${filled} preenchido(s)`)
          if (updated > 0) parts.push(`${updated} atualizado(s)`)
          setSyncMsg(parts.join(" · "))
        }
      }
      await reload()
    } catch {
      setSyncMsg("Falha ao sincronizar.")
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Anchors */}
      <div className="flex gap-1 overflow-x-auto pb-2 text-[12px] font-medium text-slate-500">
        {["Marca", "Pesquisa & Diagnóstico", "Operação", "Lista & Engajamento", "Concorrência"].map((a) => (
          <a key={a} href={`#${a.toLowerCase().replace(/\s+&\s+/g, "-").replace(/\s+/g, "-")}`} className="px-2.5 py-1 rounded-md hover:bg-slate-100 whitespace-nowrap">
            {a}
          </a>
        ))}
      </div>

      {/* MARCA */}
      <Section
        id="marca"
        title="Marca & Identidade visual"
        actions={
          <div className="flex items-center gap-3">
            {syncMsg && <span className="text-[11px] text-slate-500">{syncMsg}</span>}
            <button
              onClick={syncFromOnboarding}
              disabled={syncing}
              title="Importa respostas do formulário do cliente — só preenche campos vazios"
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-600 hover:text-brand-600 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
              {syncing ? "Sincronizando…" : "Sincronizar do formulário"}
            </button>
            <button
              onClick={() => setEditing(editing === "marca" ? null : "marca")}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-600 hover:underline"
            >
              <Edit2 className="h-3 w-3" /> Editar
            </button>
          </div>
        }
      >
        {editing === "marca" ? (
          <EditMarca ctx={ctx} onSave={patch} saving={saving} onCancel={() => setEditing(null)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Coluna esquerda — Posicionamento & voz */}
            <div>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Posicionamento &amp; voz
              </div>
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
            </div>

            {/* Coluna direita — Logo & arquivos */}
            <LogoArquivos
              storeId={storeId}
              identity={brandIdentity}
              brandManualUrl={ctx.brand_manual_url ?? null}
              onChanged={reloadBrandIdentity}
              onManualSaved={(url) => patch({ brand_manual_url: url })}
            />
          </div>
        )}

        {editing !== "marca" && (
          <>
            {/* Paleta de cores — linhas com nome + hex + uso */}
            <div className="mt-6 pt-5 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">
                  Paleta de cores
                </div>
                <div className="text-[10.5px] text-slate-400">Como aplicada no site da loja</div>
              </div>
              {ctx.cores && ctx.cores.length > 0 ? (
                <div className="space-y-1.5">
                  {ctx.cores.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 py-1">
                      <div
                        className="w-7 h-7 rounded-md border shrink-0"
                        style={{ background: c.hex, borderColor: "rgba(0,0,0,0.08)" }}
                      />
                      <div className="min-w-0 flex-1 grid grid-cols-[1fr_auto_2fr] gap-3 items-baseline">
                        <span className="text-[12.5px] font-medium text-slate-900 truncate">
                          {c.name || "—"}
                        </span>
                        <span className="text-[11.5px] font-mono text-slate-500 tabular-nums">
                          {c.hex}
                        </span>
                        <span className="text-[11.5px] text-slate-500 truncate">
                          {c.use || ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11.5px] text-slate-400 italic">Sem paleta cadastrada</div>
              )}
            </div>

            {/* Tipografia — preview ao vivo nas fontes reais */}
            <div className="mt-5 pt-5 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Tipografia
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="text-[10.5px] text-slate-400 mb-1.5">Títulos / hero</div>
                  <div className="text-[11.5px] font-medium text-slate-700 mb-1">
                    {ctx.fontes?.titulo || <span className="italic text-slate-400">Não definido</span>}
                  </div>
                  {ctx.fontes?.titulo && (
                    <div
                      className="text-slate-900 leading-tight"
                      style={{ fontFamily: `'${ctx.fontes.titulo}', serif`, fontSize: 22, fontWeight: 600 }}
                    >
                      {ctx.slogan || "Vista o que você acredita"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10.5px] text-slate-400 mb-1.5">Corpo de texto</div>
                  <div className="text-[11.5px] font-medium text-slate-700 mb-1">
                    {ctx.fontes?.corpo || <span className="italic text-slate-400">Não definido</span>}
                  </div>
                  {ctx.fontes?.corpo && (
                    <div
                      className="text-slate-700 leading-relaxed"
                      style={{ fontFamily: `'${ctx.fontes.corpo}', sans-serif`, fontSize: 13 }}
                    >
                      {ctx.diferencial || "Camisetas com design clean e acessível."}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA — Documento de pesquisa */}
            {(ctx.research_doc_url || ctx.brand_manual_url) && (
              <div className="mt-5 pt-5 border-t flex flex-wrap gap-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                {ctx.research_doc_url && (
                  <a
                    href={ctx.research_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                    style={{ borderColor: "rgba(0,0,0,0.10)" }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Documento de pesquisa
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </Section>

      {/* PESQUISA & DIAGNÓSTICO — 5 pilares editoriais (substitui o antigo "Briefing estratégico") */}
      <PesquisaSection storeId={storeId} initialData={ctx as PesquisaData} />

      {/* OPERAÇÃO — h2 macro Playfair (estilo Pesquisa & Diagnóstico) */}
      <section
        id="operacao"
        className="bg-white border rounded-[10px] p-5"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <header className="mb-5 pb-4 border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="text-[10.5px] font-bold uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "#4E62D8" }}
              >
                DADOS DA OPERAÇÃO
              </div>
              <h2
                className="m-0 text-slate-900 mb-1"
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em",
                }}
              >
                Operação &amp; catálogo
              </h2>
              <p className="text-[12.5px] text-slate-500 m-0 max-w-[640px] leading-snug">
                Indicadores comerciais, ticket médio e produtos mais vendidos
                que sustentam a operação da loja.
              </p>
            </div>
            <button
              onClick={() => setEditing(editing === "operacao" ? null : "operacao")}
              className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-slate-100 border"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
            >
              <Edit2 className="h-3 w-3" /> Editar
            </button>
          </div>
        </header>

        {editing === "operacao" ? (
          <EditOperacao ctx={ctx} onSave={patch} saving={saving} onCancel={() => setEditing(null)} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <OpKpi
              label="Ticket médio"
              value={ctx.ticket_medio_cents ? `R$ ${(ctx.ticket_medio_cents / 100).toFixed(2).replace(".", ",")}` : "—"}
              sub="média 30d"
            />
            <OpKpi
              label="Taxa de conversão"
              value={ctx.taxa_conversao ? `${(ctx.taxa_conversao * 100).toFixed(2).replace(".", ",")}%` : "—"}
              sub="benchmark 1,8%"
            />
            <OpKpi
              label="Faturamento médio"
              value={ctx.faturamento_medio_cents ? `R$ ${((ctx.faturamento_medio_cents / 100) / 1_000_000).toFixed(1).replace(".", ",")} mi` : "—"}
              sub="médio últimos 3m"
            />
            <OpKpi
              label="Margem média"
              value={ctx.margem_media ? `${(ctx.margem_media * 100).toFixed(0)}%` : "—"}
              sub="declarada"
            />
          </div>
        )}
      </section>

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

      {/* TOP 5 PRODUTOS — grid de cards (populado via webhook n8n) */}
      <TopProdutosGrid products={topProducts} />

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

/**
 * KPI editorial usado na seção Operação & catálogo — alinhado com a
 * tipografia da Pesquisa (label uppercase 9.5px + valor serif Playfair +
 * sub-rótulo cinza). Sem fundo cinza para combinar com o cartão branco.
 */
function OpKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <span
        className="text-slate-900 leading-tight"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      {sub && <span className="text-[10.5px] text-slate-400 leading-tight">{sub}</span>}
    </div>
  )
}

function formatCaptadoAgo(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diffMin = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (diffMin < 1) return "captado agora"
  if (diffMin < 60) return `captado há ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `captado há ${diffH} h`
  const diffD = Math.round(diffH / 24)
  return `captado há ${diffD} d`
}

const RANK_BG = ["#4E62D8", "rgba(78,98,216,0.85)", "rgba(78,98,216,0.7)", "rgba(78,98,216,0.55)", "rgba(78,98,216,0.4)"] as const

function TopProdutosGrid({ products }: { products: TopProduct[] }) {
  const captured = products[0]?.captured_at ?? null
  const captadoLabel = formatCaptadoAgo(captured)

  return (
    <section className="bg-white border rounded-[10px] p-6" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: "#4E62D8" }}>
            Dados da operação
          </div>
          <h3 className="text-[16px] font-bold text-slate-900 mb-1">Top 5 produtos</h3>
          <p className="text-[12.5px] text-slate-500 max-w-[460px] leading-snug">
            Catálogo capturado da loja. Atualizado periodicamente pela TrendTrack.
          </p>
        </div>
        {captadoLabel && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
            {captadoLabel}
          </span>
        )}
      </header>

      {products.length === 0 ? (
        <div className="px-4 py-10 text-[12.5px] text-slate-400 italic text-center border border-dashed rounded-md" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
          Nenhum produto capturado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 min-[490px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {products.slice(0, 5).map((p) => {
            const rankBg = RANK_BG[Math.min(Math.max(p.rank, 1), 5) - 1]
            const priceLabel = p.price != null
              ? `${p.currency ? p.currency + " " : "R$ "}${Number(p.price).toFixed(2).replace(".", ",")}`
              : "—"
            return (
              <div
                key={`${p.rank}-${p.external_id ?? p.title}`}
                className="bg-white border rounded-lg p-2.5 flex flex-col gap-2.5 transition-colors hover:border-slate-300"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
              >
                <div className="relative aspect-square bg-slate-100 rounded-md overflow-hidden">
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  <span
                    className="absolute top-1.5 left-1.5 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums tracking-wide"
                    style={{ background: rankBg }}
                  >
                    #{p.rank}
                  </span>
                </div>
                <div
                  className="text-[12px] font-medium leading-[1.35] text-slate-900 min-h-[48px] overflow-hidden"
                  style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
                  title={p.title}
                >
                  {p.title}
                </div>
                <div className="text-[14px] font-semibold text-slate-900 tabular-nums">
                  {priceLabel}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function LogoArquivos({
  storeId,
  identity,
  brandManualUrl,
  onChanged,
  onManualSaved,
}: {
  storeId: string
  identity: BrandIdentity | null
  brandManualUrl: string | null
  onChanged: () => void
  onManualSaved: (url: string) => void
}) {
  const [uploading, setUploading] = useState<string | null>(null)

  const mainPreview = identity?.logo_main_svg || identity?.logo_main_png || null
  const monogramPreview =
    identity?.logo_monogram_svg || identity?.logo_monogram_png || null

  const upload = async (slot: string, file: File) => {
    setUploading(slot)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("slot", slot)
      const res = await fetch(`/api/admin/stores/${storeId}/brand-identity/upload`, {
        method: "POST",
        body: fd,
      })
      const j = await res.json()
      const url = j.data?.url ?? j.url
      if (!url) throw new Error("Upload sem URL")

      if (slot === "brand_manual") {
        onManualSaved(url)
        return
      }
      // Persistir o campo no store_brand_identity via PATCH
      await fetch(`/api/admin/stores/${storeId}/brand-identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [slot]: url }),
      })
      onChanged()
    } catch (err) {
      console.error("Upload falhou", err)
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">
        Logo &amp; arquivos
      </div>

      {/* Previews — logo principal + monograma */}
      <div className="grid grid-cols-2 gap-2">
        <LogoSlot
          label="Principal"
          preview={mainPreview}
          uploading={uploading?.startsWith("logo_main")}
          onUpload={(file) => {
            const slot = file.type === "image/svg+xml" ? "logo_main_svg" : "logo_main_png"
            upload(slot, file)
          }}
          accept="image/png,image/svg+xml"
        />
        <LogoSlot
          label="Monograma"
          preview={monogramPreview}
          uploading={uploading?.startsWith("logo_monogram")}
          onUpload={(file) => {
            const slot = file.type === "image/svg+xml" ? "logo_monogram_svg" : "logo_monogram_png"
            upload(slot, file)
          }}
          accept="image/png,image/svg+xml"
        />
      </div>

      {/* Downloads — PNG, SVG, Manual */}
      <div className="grid grid-cols-3 gap-2">
        <DownloadCard
          label="PNG"
          url={identity?.logo_main_png ?? null}
          uploading={uploading === "logo_main_png"}
          onUpload={(file) => upload("logo_main_png", file)}
          accept="image/png"
        />
        <DownloadCard
          label="SVG"
          url={identity?.logo_main_svg ?? null}
          uploading={uploading === "logo_main_svg"}
          onUpload={(file) => upload("logo_main_svg", file)}
          accept="image/svg+xml"
        />
        <DownloadCard
          label="Manual"
          url={brandManualUrl}
          uploading={uploading === "brand_manual"}
          onUpload={(file) => upload("brand_manual", file)}
          accept="application/pdf"
        />
      </div>
    </div>
  )
}

function LogoSlot({
  label,
  preview,
  uploading,
  onUpload,
  accept,
}: {
  label: string
  preview: string | null
  uploading?: boolean
  onUpload: (file: File) => void
  accept: string
}) {
  return (
    <label
      className="relative aspect-square rounded-md border-2 border-dashed bg-slate-50 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden"
      style={{ borderColor: "rgba(0,0,0,0.10)" }}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="max-w-[70%] max-h-[70%] object-contain" />
      ) : (
        <div className="text-center px-2">
          <Upload className="h-4 w-4 text-slate-400 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500">{label}</div>
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-[10.5px] text-slate-600">
          Enviando…
        </div>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ""
        }}
      />
    </label>
  )
}

function DownloadCard({
  label,
  url,
  uploading,
  onUpload,
  accept,
}: {
  label: string
  url: string | null
  uploading?: boolean
  onUpload: (file: File) => void
  accept: string
}) {
  if (url) {
    return (
      <a
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center gap-1 h-16 rounded-md border bg-white hover:bg-slate-50 transition-colors"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
      >
        <Download className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-[10.5px] font-medium text-slate-700">{label}</span>
      </a>
    )
  }
  return (
    <label
      className="flex flex-col items-center justify-center gap-1 h-16 rounded-md border-2 border-dashed bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
      style={{ borderColor: "rgba(0,0,0,0.10)" }}
    >
      {uploading ? (
        <span className="text-[10px] text-slate-500">Enviando…</span>
      ) : (
        <>
          <Upload className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10.5px] font-medium text-slate-500">{label}</span>
        </>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ""
        }}
      />
    </label>
  )
}

const FONT_OPTS = [
  "Playfair Display",
  "Montserrat",
  "Inter",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Raleway",
  "DM Sans",
  "Cormorant Garamond",
  "Libre Baskerville",
] as const

function EditMarca({ ctx, onSave, saving, onCancel }: { ctx: StoreContext; onSave: (u: Partial<StoreContext>) => void; saving: boolean; onCancel: () => void }) {
  const [niche, setNiche] = useState(ctx.niche ?? "")
  const [slogan, setSlogan] = useState(ctx.slogan ?? "")
  const [diferencial, setDiferencial] = useState(ctx.diferencial ?? "")
  const [persona, setPersona] = useState(ctx.persona ?? "")
  const [tom, setTom] = useState(ctx.tom_de_voz ?? "")
  const [preco, setPreco] = useState(ctx.posicionamento_preco ?? "")
  const [hashtagsStr, setHashtagsStr] = useState((ctx.hashtags ?? []).join(", "))
  const [cores, setCores] = useState<Array<{ name: string; hex: string; use?: string }>>(
    ctx.cores ?? [],
  )
  const [fonteTitulo, setFonteTitulo] = useState(ctx.fontes?.titulo ?? "")
  const [fonteCorpo, setFonteCorpo] = useState(ctx.fontes?.corpo ?? "")
  const [researchDocUrl, setResearchDocUrl] = useState(ctx.research_doc_url ?? "")

  const addCor = () => setCores([...cores, { name: "", hex: "#000000", use: "" }])
  const removeCor = (i: number) => setCores(cores.filter((_, j) => j !== i))
  const updateCor = (i: number, patch: Partial<{ name: string; hex: string; use: string }>) => {
    setCores(cores.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

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

      {/* Paleta de cores editável */}
      <div className="md:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <FieldLabel label="Paleta de cores" />
          <button
            onClick={addCor}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
          >
            <Plus className="h-3 w-3" /> Adicionar cor
          </button>
        </div>
        <div className="space-y-2">
          {cores.length === 0 && (
            <div className="text-[11.5px] text-slate-400 italic">Nenhuma cor cadastrada.</div>
          )}
          {cores.map((c, i) => (
            <div key={i} className="grid grid-cols-[40px_1fr_120px_1fr_28px] gap-2 items-center">
              <input
                type="color"
                value={c.hex}
                onChange={(e) => updateCor(i, { hex: e.target.value })}
                className="h-9 w-10 rounded-md border cursor-pointer p-0.5"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              />
              <input
                value={c.name}
                onChange={(e) => updateCor(i, { name: e.target.value })}
                placeholder="Nome (ex: Pure Black)"
                className="h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              />
              <input
                value={c.hex}
                onChange={(e) => updateCor(i, { hex: e.target.value })}
                placeholder="#000000"
                className="h-9 px-3 rounded-md border text-[12px] font-mono outline-none focus:border-brand-500"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              />
              <input
                value={c.use ?? ""}
                onChange={(e) => updateCor(i, { use: e.target.value })}
                placeholder="Uso (ex: logo, hero overlay)"
                className="h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              />
              <button
                onClick={() => removeCor(i)}
                className="h-9 w-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 text-[16px] leading-none"
                aria-label="Remover cor"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tipografia */}
      <div>
        <FieldLabel label="Fonte de títulos" />
        <input
          list="font-titulo-opts"
          value={fonteTitulo}
          onChange={(e) => setFonteTitulo(e.target.value)}
          placeholder="ex: Playfair Display"
          className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.10)" }}
        />
        <datalist id="font-titulo-opts">
          {FONT_OPTS.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>
      <div>
        <FieldLabel label="Fonte de corpo" />
        <input
          list="font-corpo-opts"
          value={fonteCorpo}
          onChange={(e) => setFonteCorpo(e.target.value)}
          placeholder="ex: Montserrat"
          className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.10)" }}
        />
        <datalist id="font-corpo-opts">
          {FONT_OPTS.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>

      <div className="md:col-span-2">
        <Input
          label="URL do documento de pesquisa"
          value={researchDocUrl}
          onChange={setResearchDocUrl}
        />
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
            cores: cores.filter((c) => c.hex),
            fontes: (fonteTitulo || fonteCorpo) ? { titulo: fonteTitulo || undefined, corpo: fonteCorpo || undefined } : null,
            research_doc_url: researchDocUrl || null,
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
