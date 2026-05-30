"use client"

/**
 * PesquisaSection — documento "Pesquisa & Diagnóstico" da aba Contexto.
 *
 * 5 pilares editoriais com layout distinto:
 *  1. Perfil da Marca    — narrativa + 3 tiles conceituais
 *  2. Sobre a loja       — história + marcos da operação
 *  3. Cliente Ideal      — strip demográfica + dia na vida + motivações
 *  4. Tom de Comunicação — descrição + do/dont + glossário
 *  5. Review dos Anúncios — score gauge + sub-scores + strengths/opps/risks
 *
 * Edição: cada card aceita patch via /api/admin/stores/[id]/context
 * Review IA: POST /api/admin/stores/[id]/ads-review/regenerate
 */

import { useEffect, useState, useCallback } from "react"
import { Sparkles, Edit2, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { PesquisaCard } from "./pesquisa-card"
import {
  Pull,
  Prose,
  PillarTile,
  FactRow,
  DemoFact,
  MotivCard,
  DoDontCard,
  DoDontItem,
  WordList,
  ScoreGauge,
  SubScore,
  ReviewBlock,
} from "./primitives"
import { EditMarcaModal } from "./editors/edit-marca"
import { EditLojaModal } from "./editors/edit-loja"
import { EditIcpModal } from "./editors/edit-icp"
import { EditTomModal } from "./editors/edit-tom"

interface Pillar {
  number: string
  label: string
  text: string
}

interface Milestone {
  year: string
  event: string
  highlight?: boolean
  muted?: boolean
}

interface ReviewItem {
  what: string
  body: string
}

export interface PesquisaData {
  // 1. Marca
  brand_thesis?: string | null
  brand_about?: string | null
  brand_pillars?: Pillar[] | null
  brand_presence?: string | null
  // 2. Loja
  store_story?: string | null
  store_milestones?: Milestone[] | null
  // 3. ICP
  icp_persona?: { name: string; age: string; city: string; monogram: string } | null
  icp_demographics?: {
    age_range: string
    income: string
    education: string
    occupation: string
    religion: string
  } | null
  icp_day_in_life?: string | null
  icp_motivations?: string[] | null
  icp_frictions?: string[] | null
  // 4. Tom
  tone_description?: string | null
  tone_do?: string[] | null
  tone_dont?: string[] | null
  tone_use_words?: string[] | null
  tone_avoid_words?: string[] | null
  // 5. Anúncios
  ads_score?: number | null
  ads_summary?: string | null
  ads_sub_scores?: {
    strategy: number
    creatives: number
    targeting: number
    diversification: number
    tracking: number
  } | null
  ads_strengths?: ReviewItem[] | null
  ads_opportunities?: ReviewItem[] | null
  ads_risks?: ReviewItem[] | null
  ads_reviewed_at?: string | null
}

interface EditorMeta {
  name?: string | null
  avatar_url?: string | null
  updated_at?: string | null
}

interface PesquisaSectionProps {
  storeId: string
  initialData?: PesquisaData
  editor?: EditorMeta
}

const PILLARS = [
  { id: "perfil-marca", label: "Perfil da Marca" },
  { id: "sobre-loja", label: "Sobre a loja" },
  { id: "cliente-ideal", label: "Cliente Ideal" },
  { id: "tom-comunicacao", label: "Tom de Comunicação" },
  { id: "review-anuncios", label: "Review dos Anúncios" },
] as const

// Score geral = média das 5 sub-notas (0-10 cada). ads_score do banco vem
// em escala incompatível do webhook n8n — usa só como fallback se não tiver
// sub_scores. Resultado fica clampado em 0-10.
function computeAdsScore(
  subScores: PesquisaData["ads_sub_scores"],
  fallback: number,
): number {
  if (!subScores) return Math.max(0, Math.min(10, Number(fallback) || 0))
  const values = [
    subScores.strategy,
    subScores.creatives,
    subScores.targeting,
    subScores.diversification,
    subScores.tracking,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (values.length === 0) {
    return Math.max(0, Math.min(10, Number(fallback) || 0))
  }
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  return Math.max(0, Math.min(10, avg))
}

export function PesquisaSection({ storeId, initialData, editor }: PesquisaSectionProps) {
  const [data, setData] = useState<PesquisaData>(initialData ?? {})
  const [openEditor, setOpenEditor] = useState<null | "marca" | "loja" | "icp" | "tom">(null)
  const [regenerating, setRegenerating] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [regeneratingAll, setRegeneratingAll] = useState(false)

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/client-stores/${storeId}`)
      const j = await r.json()
      const s = (j.data?.store ?? j.store ?? j) as PesquisaData
      setData(s)
    } catch {
      // noop
    }
  }, [storeId])

  // Sincroniza com initialData quando o pai carrega o ctx async.
  // O pai (tab-contexto) passa `{}` no mount e popula depois do fetch —
  // sem este effect o useState fica preso no `{}` inicial.
  useEffect(() => {
    const hasData = initialData && Object.keys(initialData).length > 0
    if (hasData) {
      setData(initialData)
    } else {
      reload()
    }
  }, [initialData, reload])

  const patch = async (update: Partial<PesquisaData>) => {
    setData((prev) => ({ ...prev, ...update }))
    await fetch(`/api/admin/stores/${storeId}/context`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
  }

  const regenerateAll = async () => {
    setRegeneratingAll(true)
    try {
      const res = await fetch("/api/onboarding/store-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, mode: "regenerate" }),
      })
      if (res.ok) {
        toast({ title: "Briefing sendo regerado", description: "O webhook foi disparado. Os dados serão atualizados em alguns segundos." })
        setTimeout(() => reload(), 15_000)
        setTimeout(() => reload(), 30_000)
        setTimeout(() => reload(), 60_000)
      } else {
        const err = await res.json().catch(() => ({}))
        const msg = (err as Record<string, unknown>).error ?? (err as Record<string, unknown>).message ?? `HTTP ${res.status}`
        toast({ variant: "destructive", title: "Erro ao regerar briefing", description: String(msg) })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro de rede", description: (e as Error).message })
    } finally {
      setRegeneratingAll(false)
    }
  }

  const regenerateAds = async () => {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/ads-review/regenerate`, {
        method: "POST",
      })
      if (res.ok) {
        await reload()
      }
    } finally {
      setRegenerating(false)
    }
  }

  // Dispara o webhook n8n "Analisador de ADS" (mesmo body/variáveis do
  // /api/admin/stores/[id]/trigger-ads-analyzer). Fire-and-forget: o n8n
  // responde via callbacks em ~1-2 min, por isso recarregamos em intervalos.
  const reanalyzeAds = async () => {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/trigger-ads-analyzer`, {
        method: "POST",
      })
      if (res.ok) {
        toast({
          title: "Análise de anúncios disparada",
          description: "O webhook foi enviado. Os dados serão atualizados em 1-2 minutos.",
        })
        setTimeout(() => reload(), 30_000)
        setTimeout(() => reload(), 60_000)
        setTimeout(() => reload(), 120_000)
      } else {
        const err = await res.json().catch(() => ({}))
        const msg = (err as Record<string, unknown>).error ?? (err as Record<string, unknown>).message ?? `HTTP ${res.status}`
        toast({ variant: "destructive", title: "Erro ao disparar análise", description: String(msg) })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro de rede", description: (e as Error).message })
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <section id="pesquisa-diagnóstico" className="bg-white border rounded-[10px] p-5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <header className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: "#4E62D8" }}>
            DOCUMENTO DE PESQUISA
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
            Pesquisa &amp; Diagnóstico
          </h2>
          <p className="text-[12.5px] text-slate-500 m-0 max-w-[640px] leading-snug">
            O entendimento profundo da loja, do cliente final e da forma como a marca se comunica. É a base que guia briefings, copywriting e estratégia.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={regenerateAll}
            disabled={regeneratingAll}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            style={{ borderColor: "rgba(0,0,0,0.10)" }}
          >
            {regeneratingAll ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Regerando…
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" /> Regerar briefing
              </>
            )}
          </button>
          {editor?.name && (
            <div className="flex items-center gap-2 text-right">
              {editor.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editor.avatar_url} alt={editor.name} className="h-7 w-7 rounded-full border" style={{ borderColor: "rgba(0,0,0,0.06)" }} />
              ) : (
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, #4E62D8, #2137B6)" }}>
                  {editor.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-right leading-tight">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {editor.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-[10.5px] text-slate-500">
                  Atualizado por {editor.name}
                  {editor.updated_at && ` em ${new Date(editor.updated_at).toLocaleDateString("pt-BR")}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Sub-nav âncoras */}
      <div className="flex flex-wrap gap-1.5 pb-4 border-b mb-4" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {PILLARS.map((p, idx) => (
          <a
            key={p.id}
            href={`#${p.id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-medium transition-colors"
          >
            <span className="text-brand-600 font-bold tabular-nums">{idx + 1}.</span>
            {p.label}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {/* ━━━ 1. PERFIL DA MARCA ━━━ */}
        <PesquisaCard
          id="perfil-marca"
          number="01"
          title="Perfil da Marca"
          meta={
            <EditButton label="Editar" onClick={() => setOpenEditor("marca")} />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_320px] gap-5">
            <div className="flex flex-col gap-3 min-w-0">
              {data.brand_thesis ? (
                <Pull>&ldquo;{data.brand_thesis}&rdquo;</Pull>
              ) : (
                <EmptyHint label="Tese da marca" onAction={() => setOpenEditor("marca")} actionLabel="Preencher" />
              )}
              <Prose>
                {data.brand_about ? (
                  data.brand_about.split(/\n\n+/).map((p, i) => <p key={i} className="m-0">{p}</p>)
                ) : (
                  <p className="m-0 text-slate-400 italic">Conte a origem, propósito e diferencial da marca. Mínimo 2-3 parágrafos.</p>
                )}
                {data.brand_presence && (
                  <p className="m-0">{data.brand_presence}</p>
                )}
              </Prose>
            </div>
            <aside className="flex flex-col gap-3">
              {(data.brand_pillars && data.brand_pillars.length > 0) ? (
                data.brand_pillars.slice(0, 3).map((p, i) => (
                  <PillarTile key={i} number={p.number} label={p.label} text={p.text} />
                ))
              ) : (
                <EmptyHint label="3 pilares-conceito" onAction={() => setOpenEditor("marca")} actionLabel="Definir pilares" />
              )}
            </aside>
          </div>
        </PesquisaCard>

        {/* ━━━ 2. SOBRE A LOJA ━━━ */}
        <PesquisaCard
          id="sobre-loja"
          number="02"
          title="Sobre a loja"
          meta={
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-slate-400">Fonte: briefing inicial + reuniões mensais</span>
              <EditButton label="Editar" onClick={() => setOpenEditor("loja")} />
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_280px] gap-5">
            <div className="min-w-0">
              <Prose>
                {data.store_story ? (
                  data.store_story.split(/\n\n+/).map((p, i) => <p key={i} className="m-0">{p}</p>)
                ) : (
                  <p className="m-0 text-slate-400 italic">Conte a história: fundação, fundador, operação, entrada na Convertfy. 3 parágrafos.</p>
                )}
              </Prose>
            </div>
            <aside
              className="rounded-md border p-4"
              style={{ background: "#F9FAFB", borderColor: "rgba(0,0,0,0.05)" }}
            >
              <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-2.5 m-0">
                Marcos da operação
              </h4>
              {(data.store_milestones && data.store_milestones.length > 0) ? (
                <div className="flex flex-col">
                  {data.store_milestones.map((m, i) => (
                    <FactRow key={i} year={m.year} event={m.event} highlight={m.highlight} muted={m.muted} />
                  ))}
                </div>
              ) : (
                <EmptyHint label="Marcos da operação" onAction={() => setOpenEditor("loja")} actionLabel="Adicionar marco" />
              )}
            </aside>
          </div>
        </PesquisaCard>

        {/* ━━━ 3. CLIENTE IDEAL ━━━ */}
        <PesquisaCard
          id="cliente-ideal"
          number="03"
          title="Cliente Ideal"
          meta={
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                Persona principal
              </span>
              <EditButton label="Editar" onClick={() => setOpenEditor("icp")} />
            </div>
          }
        >
          {/* Strip demográfica */}
          {data.icp_persona ? (
            <div
              className="grid grid-cols-1 md:grid-cols-[1.4fr_repeat(5,1fr)] gap-4 items-center pb-4 mb-4 border-b"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #A855F7, #6D28D9)",
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {data.icp_persona.monogram || data.icp_persona.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-900 leading-tight truncate">
                    {data.icp_persona.name}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    {data.icp_persona.age} · {data.icp_persona.city}
                  </div>
                </div>
              </div>
              {data.icp_demographics && (
                <>
                  <DemoFactCell label="Faixa etária" value={data.icp_demographics.age_range} />
                  <DemoFactCell label="Renda familiar" value={data.icp_demographics.income} />
                  <DemoFactCell label="Educação" value={data.icp_demographics.education} />
                  <DemoFactCell label="Profissão típica" value={data.icp_demographics.occupation} />
                  <DemoFactCell label="Religião" value={data.icp_demographics.religion} />
                </>
              )}
            </div>
          ) : (
            <EmptyHint label="Persona principal" onAction={() => setOpenEditor("icp")} actionLabel="Definir persona" />
          )}

          {/* Dia na vida + motivações */}
          {(data.icp_day_in_life || (data.icp_motivations?.length ?? 0) > 0 || (data.icp_frictions?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
              <div className="min-w-0">
                <h4 className="text-[14px] font-bold text-slate-900 mb-2 m-0" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Um dia na vida de {data.icp_persona?.name?.split(" ")[0] ?? "ela"}
                </h4>
                <Prose>
                  {data.icp_day_in_life ? (
                    data.icp_day_in_life.split(/\n\n+/).map((p, i) => <p key={i} className="m-0">{p}</p>)
                  ) : (
                    <p className="m-0 text-slate-400 italic">Descreva rotina, consumo digital e comportamento de compra. 3 parágrafos.</p>
                  )}
                </Prose>
              </div>
              <div className="flex flex-col gap-3">
                <MotivCard tone="pos" title="O que ela quer" items={data.icp_motivations ?? []} />
                <MotivCard tone="warn" title="O que a faz hesitar" items={data.icp_frictions ?? []} />
              </div>
            </div>
          )}
        </PesquisaCard>

        {/* ━━━ 4. TOM DE COMUNICAÇÃO ━━━ */}
        <PesquisaCard
          id="tom-comunicacao"
          number="04"
          title="Tom de Comunicação"
          meta={<EditButton label="Editar" onClick={() => setOpenEditor("tom")} />}
        >
          <Prose className="mb-5">
            {data.tone_description ? (
              data.tone_description.split(/\n\n+/).map((p, i) => <p key={i} className="m-0">{p}</p>)
            ) : (
              <p className="m-0 text-slate-400 italic">Descreva como a marca fala: tom, vocabulário, uso de referências, emojis. 2 parágrafos.</p>
            )}
          </Prose>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <DoDontCard tone="pos" title="Como falamos">
              {(data.tone_do && data.tone_do.length > 0) ? (
                data.tone_do.slice(0, 4).map((t, i) => <DoDontItem key={i} text={t} />)
              ) : (
                <div className="text-[11.5px] italic text-slate-500">Adicione 4 frases-exemplo.</div>
              )}
            </DoDontCard>
            <DoDontCard tone="neg" title="Como nunca falamos">
              {(data.tone_dont && data.tone_dont.length > 0) ? (
                data.tone_dont.slice(0, 4).map((t, i) => <DoDontItem key={i} text={t} bad />)
              ) : (
                <div className="text-[11.5px] italic text-slate-500">Adicione 4 frases que NÃO devem aparecer.</div>
              )}
            </DoDontCard>
          </div>

          {/* Glossário */}
          <div className="rounded-md border p-4" style={{ background: "#F9FAFB", borderColor: "rgba(0,0,0,0.05)" }}>
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-3 m-0">
              VOCABULÁRIO · palavras que aparecem · palavras a evitar
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WordList tone="pos" title="Usar" words={data.tone_use_words ?? []} />
              <WordList tone="neg" title="Evitar" words={data.tone_avoid_words ?? []} />
            </div>
          </div>
        </PesquisaCard>

        {/* ━━━ 5. REVIEW DOS ANÚNCIOS ━━━ */}
        <PesquisaCard
          id="review-anuncios"
          number="05"
          title="Review dos Anúncios"
          meta={
            <button
              onClick={reanalyzeAds}
              disabled={reanalyzing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[11.5px] font-semibold disabled:opacity-60"
            >
              {reanalyzing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Reanalisando…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" /> Re-analisar com IA
                </>
              )}
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
            {/* Score card */}
            <aside
              className="rounded-md border p-4"
              style={{
                background: "linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 100%)",
                borderColor: "#FDE68A",
              }}
            >
              {data.ads_score != null ? (
                <>
                  <div className="flex flex-col items-center mb-3">
                    <ScoreGauge score={computeAdsScore(data.ads_sub_scores, data.ads_score)} />
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mt-1">
                      Score geral
                    </div>
                    {data.ads_summary && (
                      <div className="text-[11.5px] text-slate-700 text-center mt-1.5 leading-snug">
                        {data.ads_summary}
                      </div>
                    )}
                  </div>
                  {data.ads_sub_scores && (
                    <div className="flex flex-col gap-2.5">
                      <SubScore label="Estratégia" value={data.ads_sub_scores.strategy} />
                      <SubScore label="Criativos" value={data.ads_sub_scores.creatives} />
                      <SubScore label="Segmentação" value={data.ads_sub_scores.targeting} />
                      <SubScore label="Diversificação" value={data.ads_sub_scores.diversification} />
                      <SubScore label="Tracking & dados" value={data.ads_sub_scores.tracking} />
                    </div>
                  )}
                  {data.ads_reviewed_at && (
                    <div className="text-[10px] text-slate-400 mt-3 text-center">
                      Última análise: {new Date(data.ads_reviewed_at).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="text-[12px] text-slate-500 mb-3">Sem análise ainda</div>
                  <button
                    onClick={regenerateAds}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[11.5px] font-semibold disabled:opacity-60"
                  >
                    {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Analisar com IA
                  </button>
                </div>
              )}
            </aside>

            {/* Blocks */}
            <div className="flex flex-col gap-3">
              <ReviewBlock tone="pos" title="Pontos fortes" items={data.ads_strengths ?? []} />
              <ReviewBlock tone="warn" title="Oportunidades" items={data.ads_opportunities ?? []} />
              <ReviewBlock tone="neg" title="Riscos a monitorar" items={data.ads_risks ?? []} />
            </div>
          </div>
        </PesquisaCard>
      </div>

      {/* Editores modais */}
      {openEditor === "marca" && (
        <EditMarcaModal
          data={data}
          onSave={async (u) => { await patch(u); setOpenEditor(null) }}
          onClose={() => setOpenEditor(null)}
        />
      )}
      {openEditor === "loja" && (
        <EditLojaModal
          data={data}
          onSave={async (u) => { await patch(u); setOpenEditor(null) }}
          onClose={() => setOpenEditor(null)}
        />
      )}
      {openEditor === "icp" && (
        <EditIcpModal
          data={data}
          onSave={async (u) => { await patch(u); setOpenEditor(null) }}
          onClose={() => setOpenEditor(null)}
        />
      )}
      {openEditor === "tom" && (
        <EditTomModal
          data={data}
          onSave={async (u) => { await patch(u); setOpenEditor(null) }}
          onClose={() => setOpenEditor(null)}
        />
      )}
    </section>
  )
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-slate-100 border"
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      <Edit2 className="h-3 w-3" /> {label}
    </button>
  )
}

function EmptyHint({ label, onAction, actionLabel }: { label: string; onAction: () => void; actionLabel: string }) {
  return (
    <div
      className="border-2 border-dashed rounded-md p-3 text-center"
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div className="text-[11.5px] text-slate-500 mb-1.5">Sem {label.toLowerCase()} ainda</div>
      <button
        onClick={onAction}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold",
          "bg-brand-50 text-brand-700 hover:bg-brand-100",
        )}
      >
        <Edit2 className="h-3 w-3" /> {actionLabel}
      </button>
    </div>
  )
}

function DemoFactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l pl-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <DemoFact label={label} value={value} />
    </div>
  )
}
