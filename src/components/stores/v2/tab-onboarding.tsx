"use client"

/**
 * Tab: Onboarding (nova versao) — espelha o briefing do cliente + a lista
 * densa de e-mails por flow, conforme mockup aprovado.
 *
 * Estrutura:
 *  1. Resumo do briefing (slogan, nicho, persona, tom)
 *  2. Politicas (frete, devolucao, parcelamento, pagamento)
 *  3. "Nao fazer" (chips vermelhos)
 *  4. Score de anuncios
 *  5. E-mails dos flows (com chips de status e blocos)
 *
 * Le tudo de uma chamada: GET /api/admin/stores/[id]/producao
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Heart,
  ShoppingCart,
  Eye,
  TrendingUp,
  PackageCheck,
  RotateCcw,
  Mail,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Truck,
  Undo2,
  CreditCard,
  Wallet,
  Code2,
  Image as ImageIcon,
  ArrowRight,
} from "lucide-react"
import type {
  StoreBriefing,
  EmailFlow,
  EmailFlowEmail,
  EmailBlock,
  EmailStatus,
  FlowType,
} from "@/types/email-workspace"
import { C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

// ─── Tipos locais ─────────────────────────────────────────

interface StoreProducaoPayload {
  store: {
    id: string
    store_name: string
    slogan: string | null
    niche: string | null
    diferencial: string | null
    persona: string | null
    tone_use_words: string[] | null
    tone_dont: string[] | null
    tone_avoid_words: string[] | null
    devolucao_politica: string | null
    frete_cobertura: string | null
    frete_prazo: string | null
    frete_gratis_acima_cents: number | null
    ads_score: number | null
    ads_summary: string | null
    ads_sub_scores: Record<string, number> | null
  }
  briefing: StoreBriefing | null
  flows: EmailFlow[]
}

// ─── Status bucket mapping (decisao do plano) ─────────────

type StatusBucket = "rascunho" | "em_revisao" | "aprovado" | "publicado"

function mapStatusToBucket(status: EmailStatus): StatusBucket {
  switch (status) {
    case "draft":
    case "in_progress":
      return "rascunho"
    case "copy_ready":
    case "ready":
      return "em_revisao"
    case "approved":
      return "aprovado"
    case "live":
      return "publicado"
  }
}

const BUCKET_LABEL: Record<StatusBucket, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado",
}

const BUCKET_COLOR: Record<StatusBucket, { bg: string; fg: string; border: string; dot: string }> = {
  rascunho: { bg: C.g100, fg: C.g700, border: C.g200, dot: C.g400 },
  em_revisao: { bg: C.warnBg, fg: C.warn, border: C.warnBorder, dot: "#D97706" },
  aprovado: { bg: C.infoBg, fg: C.info, border: C.infoBorder, dot: C.brand },
  publicado: { bg: C.posBg, fg: C.pos, border: C.posBorder, dot: "#10B981" },
}

// ─── Flow type → icone ────────────────────────────────────

function flowTypeIcon(type: FlowType) {
  switch (type) {
    case "welcome":
      return Heart
    case "abandoned_cart":
      return ShoppingCart
    case "site_abandoned":
    case "browse_abandonment":
      return Eye
    case "upsell":
    case "win_back":
      return TrendingUp
    case "shipping_stages":
      return PackageCheck
    case "post_purchase":
      return RotateCcw
    default:
      return Mail
  }
}

// ─── Formatadores ─────────────────────────────────────────

function formatDelay(hours: number | null): string {
  if (hours == null || hours === 0) return "Imediato"
  if (hours < 24) return `+${hours} ${hours === 1 ? "hora" : "horas"}`
  const days = Math.round(hours / 24)
  return `+${days} ${days === 1 ? "dia" : "dias"}`
}

function adsScoreLabel(score0to100: number): "BOA" | "RAZOÁVEL" | "BAIXA" {
  if (score0to100 >= 80) return "BOA"
  if (score0to100 >= 60) return "RAZOÁVEL"
  return "BAIXA"
}

function adsScoreColor(score0to100: number) {
  if (score0to100 >= 80) return { bg: C.posBg, fg: C.pos, border: C.posBorder }
  if (score0to100 >= 60) return { bg: C.warnBg, fg: C.warn, border: C.warnBorder }
  return { bg: C.negBg, fg: C.neg, border: C.negBorder }
}

// ─── Resolve briefing politica ────────────────────────────

function findPolitica(briefing: StoreBriefing | null, tipo: string): string | null {
  const list = briefing?.briefing?.politicas
  if (!Array.isArray(list)) return null
  return list.find((p) => p.tipo === tipo)?.valor ?? null
}

function freteText(store: StoreProducaoPayload["store"], briefing: StoreBriefing | null): string | null {
  if (store.frete_cobertura) {
    const minimo = store.frete_gratis_acima_cents
    if (minimo && minimo > 0) {
      return `${store.frete_cobertura} · grátis acima de R$ ${(minimo / 100).toFixed(0)}`
    }
    return store.frete_cobertura
  }
  return findPolitica(briefing, "frete")
}

// ─── Componente principal ────────────────────────────────

export default function TabOnboarding({ storeId }: { storeId: string }) {
  const { data, isLoading, error } = useSWR<{ data?: StoreProducaoPayload } & StoreProducaoPayload>(
    `/api/admin/stores/${storeId}/producao`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  )
  const payload = (data?.data ?? data) as StoreProducaoPayload | undefined

  if (isLoading) {
    return (
      <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: C.g500 }}>
        Carregando onboarding...
      </div>
    )
  }

  if (error || !payload?.store) {
    return (
      <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: C.g500 }}>
        Erro ao carregar onboarding.
      </div>
    )
  }

  const { store, briefing, flows } = payload
  const hasBriefingData = !!(
    store.slogan ||
    store.niche ||
    store.diferencial ||
    store.persona ||
    (store.tone_use_words?.length ?? 0) > 0 ||
    briefing
  )
  const hasFlows = flows.length > 0

  // Empty state global
  if (!hasBriefingData && !hasFlows) {
    return <EmptyStateOnboarding storeId={storeId} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Grid superior: Briefing summary (esquerda) + Politicas/Nao fazer/Ads (direita) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <BriefingSummaryCard store={store} briefing={briefing} storeId={storeId} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PoliticasCard store={store} briefing={briefing} />
          <NaoFazerCard store={store} />
          <ScoreAnunciosCard store={store} />
        </div>
      </div>

      {/* Lista densa de emails por flow */}
      <EmailFlowsSection flows={flows} storeId={storeId} />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────

function EmptyStateOnboarding({ storeId }: { storeId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: 40,
          textAlign: "center",
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g700, marginBottom: 4 }}>
          Loja ainda sem onboarding
        </div>
        <div style={{ fontSize: 12, color: C.g500 }}>
          Preencha o briefing e inicie os flows para acompanhar a produção aqui.
        </div>
      </div>
      <WorkspaceCta storeId={storeId} />
    </div>
  )
}

function WorkspaceCta({ storeId }: { storeId: string }) {
  return (
    <Link
      href={`/admin/stores/${storeId}/producao`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "linear-gradient(135deg, var(--crm-blue-50, #eff6ff), #ffffff 80%)",
        border: `1px solid ${C.brand}`,
        borderRadius: 8,
        textDecoration: "none",
        color: "inherit",
      }}
      className="hover:shadow-sm"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: C.brand,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Mail size={18} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g900 }}>
            Workspace de Produção de E-mails
          </div>
          <div style={{ fontSize: 11.5, color: C.g500, marginTop: 1 }}>
            Acesse os flows, marca e briefing dessa loja
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: C.brand,
        }}
      >
        Abrir workspace
        <ArrowRight size={14} />
      </div>
    </Link>
  )
}

// ─── Card: Briefing summary ────────────────────────────────

function BriefingSummaryCard({
  store,
  briefing,
  storeId,
}: {
  store: StoreProducaoPayload["store"]
  briefing: StoreBriefing | null
  storeId: string
}) {
  const slogan = store.slogan ?? briefing?.marca?.slogan ?? null
  const nicho = store.niche ?? briefing?.marca?.nicho ?? null
  const diferencial = store.diferencial ?? briefing?.marca?.diferencial ?? null
  const persona = store.persona ?? briefing?.marca?.persona ?? null
  const tomChips = useMemo(() => {
    const fromArr = store.tone_use_words?.filter(Boolean) ?? []
    if (fromArr.length > 0) return fromArr
    const tom = briefing?.marca?.tom_voz
    if (typeof tom === "string" && tom.length > 0) {
      return tom.split(/[,;]\s*/).filter(Boolean)
    }
    return []
  }, [store.tone_use_words, briefing?.marca?.tom_voz])

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
          O que o cliente respondeu
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href={`/admin/stores/${storeId}/producao?resource=brand`}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: C.g600,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "4px 8px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ImageIcon size={11} />
            Identidade visual
          </Link>
          <Link
            href={`/admin/stores/${storeId}/producao?resource=briefing`}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: C.g600,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "4px 8px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ExternalLink size={11} />
            Briefing completo
          </Link>
        </div>
      </header>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Slogan destacado */}
        {slogan && (
          <div
            style={{
              background: C.infoBg,
              border: `1px solid ${C.infoBorder}`,
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.brand,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 4,
              }}
            >
              Slogan
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.brandDark, lineHeight: 1.3 }}>
              &ldquo;{slogan}&rdquo;
            </div>
          </div>
        )}

        {/* KV table */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <BriefingRow label="Nicho" value={nicho} />
          <BriefingRow label="Diferencial" value={diferencial} />
          <BriefingRow label="Persona-alvo" value={persona} />
          <BriefingRow
            label="Tom de voz"
            value={
              tomChips.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                  {tomChips.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        background: C.g100,
                        color: C.g700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 500,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null
            }
          />
        </div>
      </div>
    </section>
  )
}

function BriefingRow({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === ""
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px dashed ${C.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: C.g500, fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 12.5,
          color: empty ? C.g400 : C.g900,
          fontWeight: 500,
          textAlign: "right",
          minWidth: 0,
        }}
      >
        {empty ? "—" : value}
      </span>
    </div>
  )
}

// ─── Card: Politicas ──────────────────────────────────────

function PoliticasCard({
  store,
  briefing,
}: {
  store: StoreProducaoPayload["store"]
  briefing: StoreBriefing | null
}) {
  const frete = freteText(store, briefing)
  const devolucao = store.devolucao_politica ?? findPolitica(briefing, "devolucao")
  const parcelamento = findPolitica(briefing, "parcelamento")
  const pagamento = findPolitica(briefing, "pagamento")

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>Políticas</div>
        <div style={{ fontSize: 11, color: C.g500, marginTop: 2 }}>verdade nos e-mails</div>
      </header>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PoliticaItem icon={<Truck size={14} />} label="Frete grátis" value={frete} />
        <PoliticaItem icon={<Undo2 size={14} />} label="Devolução" value={devolucao} />
        <PoliticaItem icon={<CreditCard size={14} />} label="Parcelamento" value={parcelamento} />
        <PoliticaItem icon={<Wallet size={14} />} label="Pagamento" value={pagamento} />
      </div>
    </section>
  )
}

function PoliticaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div
      style={{
        background: C.g50,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.g600 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: value ? C.g900 : C.g400, lineHeight: 1.35 }}>
        {value || "—"}
      </div>
    </div>
  )
}

// ─── Card: Nao fazer ──────────────────────────────────────

function NaoFazerCard({ store }: { store: StoreProducaoPayload["store"] }) {
  const items = useMemo(() => {
    const a = store.tone_dont?.filter(Boolean) ?? []
    if (a.length > 0) return a
    return store.tone_avoid_words?.filter(Boolean) ?? []
  }, [store.tone_dont, store.tone_avoid_words])

  if (items.length === 0) return null

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>Não fazer</div>
      </header>
      <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((it) => (
          <span
            key={it}
            style={{
              fontSize: 11.5,
              background: C.negBg,
              color: C.neg,
              border: `1px solid ${C.negBorder}`,
              borderRadius: 4,
              padding: "3px 8px",
              fontWeight: 500,
            }}
          >
            {it}
          </span>
        ))}
      </div>
    </section>
  )
}

// ─── Card: Score de anuncios ──────────────────────────────

function ScoreAnunciosCard({ store }: { store: StoreProducaoPayload["store"] }) {
  // ads_score em DB e 0-10 (numeric 3,1). Escala pra 0-100 visual.
  const rawScore = store.ads_score
  if (rawScore == null) return null
  const score100 = Math.round(rawScore * 10)
  const label = adsScoreLabel(score100)
  const palette = adsScoreColor(score100)

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>Score de anúncios</div>
      </header>
      <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: 70,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: palette.fg, ...TNUM, lineHeight: 1 }}>
            {score100}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: palette.fg,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginTop: 3,
            }}
          >
            {label}
          </div>
        </div>
        {store.ads_summary && (
          <div style={{ fontSize: 11.5, color: C.g600, lineHeight: 1.4, flex: 1 }}>
            {store.ads_summary}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Secao: Emails dos flows ──────────────────────────────

function EmailFlowsSection({ flows, storeId }: { flows: EmailFlow[]; storeId: string }) {
  // Contadores globais por bucket
  const totals = useMemo(() => {
    const buckets = { rascunho: 0, em_revisao: 0, aprovado: 0, publicado: 0 }
    let total = 0
    for (const f of flows) {
      for (const e of f.emails ?? []) {
        buckets[mapStatusToBucket(e.status)]++
        total++
      }
    }
    return { ...buckets, total, flowsCount: flows.length }
  }, [flows])

  if (flows.length === 0) {
    return (
      <section
        style={{
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.g700, marginBottom: 4 }}>
          Nenhum flow criado ainda
        </div>
        <div style={{ fontSize: 12, color: C.g500 }}>
          Os flows aparecerão aqui após a criação no Workspace de Produção.
        </div>
        <div style={{ marginTop: 16 }}>
          <Link
            href={`/admin/stores/${storeId}/producao`}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.brand,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Abrir workspace <ArrowRight size={12} />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g900 }}>E-mails dos flows</div>
          <div style={{ fontSize: 11.5, color: C.g500, marginTop: 2, ...TNUM }}>
            {totals.total} e-mails · {totals.flowsCount} flows
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <BucketChip bucket="rascunho" count={totals.rascunho} />
          <BucketChip bucket="em_revisao" count={totals.em_revisao} />
          <BucketChip bucket="aprovado" count={totals.aprovado} />
          <BucketChip bucket="publicado" count={totals.publicado} />
          <span
            style={{
              fontSize: 11.5,
              color: C.g500,
              borderLeft: `1px solid ${C.g200}`,
              paddingLeft: 8,
              marginLeft: 4,
              fontWeight: 600,
              ...TNUM,
            }}
          >
            {totals.publicado}/{totals.total} no ar
          </span>
        </div>
      </header>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {flows.map((flow, i) => (
          <EmailFlowCard
            key={flow.id}
            flow={flow}
            storeId={storeId}
            isLast={i === flows.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

function BucketChip({ bucket, count }: { bucket: StatusBucket; count: number }) {
  const c = BUCKET_COLOR[bucket]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 500,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: "3px 8px",
      }}
    >
      <span
        style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, display: "inline-block" }}
      />
      {BUCKET_LABEL[bucket]} <span style={{ ...TNUM, fontWeight: 600 }}>{count}</span>
    </span>
  )
}

// ─── Card: Flow ───────────────────────────────────────────

function EmailFlowCard({
  flow,
  storeId,
  isLast,
}: {
  flow: EmailFlow
  storeId: string
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = flowTypeIcon(flow.flow_type)
  const emails = useMemo(() => flow.emails ?? [], [flow.emails])

  const counts = useMemo(() => {
    const b = { rascunho: 0, em_revisao: 0, aprovado: 0, publicado: 0 }
    for (const e of emails) b[mapStatusToBucket(e.status)]++
    return b
  }, [emails])

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : `1px solid ${C.g100}`,
        background: expanded ? C.g25 : "#fff",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: C.g100,
            color: C.g700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>{flow.name}</span>
            <span style={{ fontSize: 11.5, color: C.g500, ...TNUM }}>
              {emails.length} {emails.length === 1 ? "e-mail" : "e-mails"}
            </span>
          </div>
          {flow.description && (
            <div
              style={{
                fontSize: 11.5,
                color: C.g500,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {flow.description}
            </div>
          )}
        </div>

        {/* Dots por status */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <StatusDot bucket="rascunho" count={counts.rascunho} />
          <StatusDot bucket="em_revisao" count={counts.em_revisao} />
          <StatusDot bucket="aprovado" count={counts.aprovado} />
          <StatusDot bucket="publicado" count={counts.publicado} />
        </div>

        {/* Progress bar */}
        <div style={{ width: 96, display: "flex", flexDirection: "column", gap: 3 }}>
          <div
            style={{
              fontSize: 10.5,
              color: C.g500,
              fontWeight: 600,
              textAlign: "right",
              ...TNUM,
            }}
          >
            {flow.progress_percent}%
          </div>
          <div
            style={{
              height: 4,
              background: C.g100,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${flow.progress_percent}%`,
                height: "100%",
                background: C.brand,
              }}
            />
          </div>
        </div>

        <div style={{ color: C.g400, flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded &&
        (emails.length > 0 ? (
          <EmailRowsTable emails={emails} flowId={flow.id} storeId={storeId} />
        ) : (
          <div
            style={{
              borderTop: `1px solid ${C.g100}`,
              padding: "16px 18px",
              fontSize: 12,
              color: C.g500,
              textAlign: "center",
              background: "#fff",
            }}
          >
            Nenhum e-mail criado neste flow ainda.
          </div>
        ))}
    </div>
  )
}

function StatusDot({ bucket, count }: { bucket: StatusBucket; count: number }) {
  if (count === 0) return null
  const c = BUCKET_COLOR[bucket]
  return (
    <span
      title={`${BUCKET_LABEL[bucket]}: ${count}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10.5,
        color: c.fg,
        fontWeight: 600,
        ...TNUM,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.dot,
          display: "inline-block",
        }}
      />
      {count}
    </span>
  )
}

// ─── Tabela de emails por flow ────────────────────────────

function EmailRowsTable({
  emails,
  flowId,
  storeId,
}: {
  emails: EmailFlowEmail[]
  flowId: string
  storeId: string
}) {
  return (
    <div style={{ borderTop: `1px solid ${C.g100}`, background: "#fff" }}>
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "36px minmax(0, 1.6fr) 100px minmax(0, 1.4fr) 120px 80px",
          gap: 12,
          padding: "8px 18px",
          fontSize: 10,
          fontWeight: 700,
          color: C.g500,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          background: C.g50,
          borderBottom: `1px solid ${C.g100}`,
        }}
      >
        <span>#</span>
        <span>E-mail</span>
        <span>Delay</span>
        <span>Blocos</span>
        <span>Status</span>
        <span style={{ textAlign: "right" }}>Ações</span>
      </div>

      {emails.map((email) => (
        <EmailRow key={email.id} email={email} flowId={flowId} storeId={storeId} />
      ))}
    </div>
  )
}

function EmailRow({
  email,
  flowId,
  storeId,
}: {
  email: EmailFlowEmail
  flowId: string
  storeId: string
}) {
  const bucket = mapStatusToBucket(email.status)
  const bColor = BUCKET_COLOR[bucket]
  const blocks: EmailBlock[] = (email.blocks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1.6fr) 100px minmax(0, 1.4fr) 120px 80px",
        gap: 12,
        padding: "10px 18px",
        alignItems: "center",
        fontSize: 12,
        borderBottom: `1px solid ${C.g50}`,
      }}
    >
      {/* # */}
      <span style={{ fontSize: 11, fontWeight: 600, color: C.g500, ...TNUM }}>
        {String(email.number).padStart(2, "0")}
      </span>

      {/* Nome + subject */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: C.g900,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {email.name}
        </div>
        {email.subject && (
          <div
            style={{
              fontSize: 11,
              color: C.g500,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email.subject}
          </div>
        )}
      </div>

      {/* Delay */}
      <span style={{ fontSize: 11.5, color: C.g600, ...TNUM }}>
        {formatDelay(email.delay_hours)}
      </span>

      {/* Blocos chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {blocks.length === 0 ? (
          <span style={{ fontSize: 11, color: C.g400 }}>—</span>
        ) : (
          blocks.map((b) => (
            <span
              key={b.id}
              style={{
                fontSize: 10.5,
                background: C.g100,
                color: C.g700,
                padding: "2px 7px",
                borderRadius: 3,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {b.label}
            </span>
          ))
        )}
      </div>

      {/* Status pill */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          background: bColor.bg,
          color: bColor.fg,
          border: `1px solid ${bColor.border}`,
          borderRadius: 4,
          padding: "3px 8px",
          width: "fit-content",
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: bColor.dot,
            display: "inline-block",
          }}
        />
        {BUCKET_LABEL[bucket]}
      </span>

      {/* Botoes */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <Link
          href={`/admin/stores/${storeId}/producao?flow=${flowId}&email=${email.id}`}
          title="Abrir render"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10.5,
            fontWeight: 600,
            color: C.g700,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: "3px 8px",
            textDecoration: "none",
          }}
        >
          Render
        </Link>
        <Link
          href={`/admin/stores/${storeId}/producao?flow=${flowId}&email=${email.id}`}
          title="Abrir HTML"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 22,
            color: C.g700,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          <Code2 size={12} />
        </Link>
      </div>
    </div>
  )
}
