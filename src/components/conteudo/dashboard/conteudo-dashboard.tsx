"use client"

/**
 * Dashboard Social (módulo Conteúdo) — design set/2026 (Claude Design).
 * Cabeçalho (saudação + perfil + período) → KPIs de negócio → Audiência
 * (seguidores + mix por pilar) → Funil Conteúdo → Comercial → Publicações
 * (tabela ordenável) → Recortes (top 5, por molde, cadência) → rodapé.
 *
 * Toda leitura passa por `lib/conteudo/data.ts` (hoje mock; a Graph API e o
 * YouTube Analytics entram lá sem mexer aqui). Estados: carregando,
 * vazio (nenhum post no período), erro (com tentar novamente).
 */

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  BarChart3,
  Calendar,
  DollarSign,
  Filter,
  Image as ImageIcon,
  Inbox,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { DateControl, defaultOpsPeriod, periodQuery, type OpsPeriodValue } from "@/components/dashboard/ops/date-control"
import { OpsCard, SectionTitle, Td, Th } from "@/components/dashboard/ops/primitives"
import { CT_MOLDE_COR, CT_PERFIS, CT_PILAR_COR } from "@/lib/conteudo/brand"
import { getDashboard } from "@/lib/conteudo/data"
import type { DashboardData, Kpi, PerfilFiltro, Pilar, Post } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtAvatarComCanal, CtBadge, CtBtn, CtEmpty, CtFmt, CtSeg, CtSkel, CtTile, TNUM, ctThumb, fmtDec, fmtNum } from "../ui"
import { FunilConteudo } from "./funil-conteudo"
import { PerfilPicker } from "./perfil-picker"
import { PostDrawer } from "./post-drawer"
import { SeguidoresChart } from "./seguidores-chart"

type SortKey = "alc" | "sav" | "sh" | "seg" | "com" | "leads"
type FmtFiltro = "Todos" | "Carrossel" | "Reels" | "Vídeo YT"

const ROTULOS_X = ["05/08", "12/08", "19/08", "26/08", "03/09"]

function toneDelta(d: string): "pos" | "neg" | "neut" {
  if (d.startsWith("-") || d.startsWith("−")) return "neg"
  if (/^\+0[,.]0/.test(d)) return "neut"
  return "pos"
}

// ── KPI de negócio ─────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: Kpi }) {
  const tone = toneDelta(kpi.delta)
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[17px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{kpi.label}</div>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className={cn("text-[22px] font-semibold leading-none tracking-[-0.01em]", kpi.money ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
          {kpi.valor}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold",
            tone === "pos" ? "text-[var(--ops-pos)]" : tone === "neg" ? "text-[var(--ops-neg)]" : "text-[var(--ops-mut)]",
          )}
          style={TNUM}
        >
          {kpi.delta}
        </span>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--ops-mut)]">{kpi.money ? "atribuído por comment gate e link" : "vs. período anterior"}</div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────

/** `saudacao` vem do servidor (hora do request): calcular no client causava divergência de hidratação. */
export function ConteudoDashboard({ userName, saudacao = "Olá" }: { userName: string; saudacao?: string }) {
  const [perfil, setPerfil] = useState<PerfilFiltro>("consolidado")
  const [period, setPeriod] = useState<OpsPeriodValue>(() => defaultOpsPeriod())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [fFmt, setFFmt] = useState<FmtFiltro>("Todos")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "leads", dir: "desc" })

  const pq = periodQuery(period)
  const { data, error, isLoading, isValidating, mutate } = useSWR<DashboardData>(
    ["conteudo-dashboard", perfil, pq],
    () => {
      const params = new URLSearchParams(pq)
      return getDashboard(perfil, { start: params.get("start") ?? "", end: params.get("end") ?? "" })
    },
    { keepPreviousData: true, revalidateOnFocus: false },
  )
  const carregando = isLoading || (!data && !error)
  const isYT = perfil === "youtube"

  const posts = useMemo(() => {
    if (!data) return []
    const lista = data.posts
      .filter((p) => fFmt === "Todos" || p.fmt === fFmt)
      .filter((p) => !q || p.head.toLowerCase().includes(q.toLowerCase()))
    return [...lista].sort((a, b) => (sort.dir === "desc" ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key]))
  }, [data, fFmt, q, sort])

  const maxLeads = useMemo(() => Math.max(1, ...(data?.posts.map((p) => p.leads) ?? [1])), [data])
  const top5 = useMemo(() => [...(data?.posts ?? [])].sort((a, b) => b.leads - a.leads).slice(0, 5), [data])
  const moldePerf = useMemo(() => {
    if (!data) return []
    return data.moldes
      .map((m) => {
        const ps = data.posts.filter((p) => p.molde === m.k)
        const n = ps.length
        return {
          ...m,
          n,
          alc: n ? Math.round(ps.reduce((a, p) => a + p.alc, 0) / n) : 0,
          ld: n ? ps.reduce((a, p) => a + p.leads, 0) / n : m.leads,
        }
      })
      .sort((a, b) => b.ld - a.ld)
  }, [data])

  const dp: Post | null = useMemo(() => (drawer && data ? data.posts.find((p) => p.id === drawer) ?? null : null), [drawer, data])
  const abrir = useCallback((id: string) => setDrawer(id), [])

  const clicarSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }))

  const ThSort = ({ k, children }: { k: SortKey; children: string }) => {
    const on = sort.key === k
    return (
      <th
        aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
        onClick={() => clicarSort(k)}
        className={cn(
          "cursor-pointer select-none whitespace-nowrap border-b border-[var(--ops-border)] px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.05em] hover:text-[var(--ops-title)]",
          on ? "text-[var(--ops-title)]" : "text-[var(--ops-sec)]",
        )}
      >
        {children}
        {on && <span className="ml-1">{sort.dir === "desc" ? "↓" : "↑"}</span>}
      </th>
    )
  }

  const mix = data?.pilarMix
  const mixKeys = (mix ? Object.keys(mix.real) : []) as Pilar[]
  const desvios = mix ? mixKeys.filter((k) => Math.abs((mix.real[k] ?? 0) - (mix.alvo[k] ?? 0)) > 10) : []
  const kpisTopo = data ? [data.kpis[4], data.kpis[5], data.kpis[0], data.kpis[1]] : []
  const seg = data?.serieSeguidores ?? []
  const novos = seg.length ? seg[seg.length - 1] - seg[0] : 0
  const estudioNovo = `${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=template`

  return (
    <div className="-m-4 flex min-h-[100dvh] min-w-0 md:-m-6 lg:-m-8">
      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
          {/* cabeçalho */}
          <div className="flex flex-wrap items-end gap-3.5">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Conteúdo</h1>
              <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">
                {saudacao}, {userName}. Audiência, funil orgânico e o que cada post gerou
              </div>
            </div>
            <div className="flex-1" />
            <PerfilPicker val={perfil} onChange={setPerfil} />
            <DateControl value={period} onChange={setPeriod} />
          </div>

          {error ? (
            <OpsCard>
              <CtEmpty
                icon={XCircle}
                title="Não foi possível sincronizar com o Instagram"
                desc={error instanceof Error && error.message ? error.message : "A conexão com a API da Meta expirou ou o serviço está indisponível."}
                action={
                  <div className="mt-2">
                    <CtBtn kind="primary" icon={RefreshCw} onClick={() => mutate()}>
                      Tentar novamente
                    </CtBtn>
                  </div>
                }
              />
            </OpsCard>
          ) : !carregando && data && data.posts.length === 0 ? (
            <OpsCard>
              <CtEmpty
                icon={ImageIcon}
                title="Nenhum post no período"
                desc="Publique um carrossel ou amplie o período para ver números aqui."
                action={
                  <Link href={estudioNovo} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ops-accent)] px-[13px] text-[12px] font-semibold text-[var(--ops-on-accent)]">
                    <Icon icon={Plus} customSize={13} />
                    Criar carrossel
                  </Link>
                }
              />
            </OpsCard>
          ) : (
            <>
              {/* 1 · KPIs de negócio */}
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {carregando
                  ? [1, 2, 3, 4].map((i) => (
                      <div key={i} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[17px]">
                        <CtSkel h={10} w="55%" />
                        <div className="h-3" />
                        <CtSkel h={22} w="65%" />
                      </div>
                    ))
                  : kpisTopo.map((k) => <KpiCard key={k.label} kpi={k} />)}
              </div>

              {/* 2 · Audiência */}
              <SectionTitle title="Audiência" hint="crescimento por dia · marcadores nos dias com publicação" />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[7fr_5fr]">
                <OpsCard
                  title="Crescimento de seguidores"
                  hint={carregando ? undefined : `${fmtNum(novos)} novos no período`}
                  right={
                    data && (
                      <div className="hidden gap-3.5 text-[11px] text-[var(--ops-sec)] sm:flex" style={TNUM}>
                        {[data.kpis[2], data.kpis[3]].map((k) => (
                          <span key={k.label}>
                            {k.label} <strong className="font-semibold text-[var(--ops-title)]">{k.valor}</strong>
                          </span>
                        ))}
                      </div>
                    )
                  }
                >
                  {carregando || !data ? <CtSkel h={220} r={8} /> : <SeguidoresChart serie={data.serieSeguidores} posts={data.posts} rotulos={ROTULOS_X} onAbrirPost={abrir} />}
                </OpsCard>
                <OpsCard title="Mix por pilar" hint="realizado vs. alvo do mês">
                  {carregando || !mix ? (
                    <CtSkel h={220} r={8} />
                  ) : (
                    <div className="flex h-full flex-col gap-4">
                      {mixKeys.map((k) => {
                        const r = mix.real[k] ?? 0
                        const a = mix.alvo[k] ?? 0
                        const diff = r - a
                        const fora = Math.abs(diff) > 10
                        return (
                          <div key={k}>
                            <div className="mb-1.5 flex items-baseline gap-2">
                              <span className="text-[12.5px] font-semibold text-[var(--ops-title)]">{k}</span>
                              <span className="text-[11px] text-[var(--ops-mut)]">alvo {a}%</span>
                              <span className="ml-auto text-[14px] font-semibold text-[var(--ops-title)]" style={TNUM}>
                                {r}%
                              </span>
                              <span className={cn("w-[42px] text-right text-[11px] font-semibold", fora ? "text-[var(--ops-warn)]" : "text-[var(--ops-mut)]")} style={TNUM}>
                                {diff > 0 ? "+" : ""}
                                {diff} pp
                              </span>
                            </div>
                            <div className="relative h-2 rounded-full bg-[var(--ops-track)]">
                              <div className="h-full rounded-full" style={{ width: `${r}%`, background: fora ? "var(--ops-warn)" : CT_PILAR_COR[k] }} />
                              <span title={`alvo ${a}%`} className="absolute -top-1 h-4 w-[2px] rounded-[1px] bg-[var(--ops-title)] opacity-60" style={{ left: `${a}%` }} />
                            </div>
                          </div>
                        )
                      })}
                      {desvios.length > 0 && (
                        <div className="mt-auto flex gap-2 rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-warn)]">
                          <span className="mt-px flex shrink-0">
                            <Icon icon={Sparkles} customSize={13} />
                          </span>
                          <span>
                            {desvios
                              .map((k) => `${k} ${(mix.real[k] ?? 0) > (mix.alvo[k] ?? 0) ? "acima" : "abaixo"} do alvo em ${Math.abs((mix.real[k] ?? 0) - (mix.alvo[k] ?? 0))} pontos`)
                              .join(" e ")}
                            . Os próximos slots pedem <strong>Case</strong>.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </OpsCard>
              </div>

              {/* 3 · Funil */}
              <SectionTitle title="Funil Conteúdo → Comercial" hint="do alcance ao cliente fechado · 30 dias" />
              <OpsCard
                title="Funil orgânico"
                hint="comment gate como porta de entrada"
                right={
                  <Link href={ROUTES.ADMIN.COMERCIAL.LEADS} className="text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
                    Abrir no CRM
                  </Link>
                }
              >
                {carregando || !data ? (
                  <CtSkel h={260} r={8} />
                ) : (
                  <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-[1fr_460px_1fr]">
                    <div className="flex flex-col gap-[9px]">
                      <CtTile label="Posts publicados" valor={String(data.derivados.postsPublicados)} cor="#4E62D8" icon={ImageIcon} />
                      <CtTile label="Comentários-chave" valor={fmtNum(data.derivados.comentariosChave)} cor="#2563EB" icon={Inbox} />
                      <CtTile label="Alcance → lead" valor={`${fmtDec(data.derivados.alcanceParaLead, 2)}%`} cor="#D97706" icon={Filter} />
                    </div>
                    <div className="overflow-x-auto">
                      <FunilConteudo etapas={data.funil} />
                    </div>
                    <div className="flex flex-col gap-[9px]">
                      <CtTile label="CPL orgânico equiv." valor={`R$ ${fmtNum(data.derivados.cplOrganico)}`} cor="#7C3AED" icon={DollarSign} />
                      <CtTile label="Ticket médio fechados" valor={`R$ ${fmtNum(data.derivados.ticketMedio)}`} cor="#047857" icon={BarChart3} />
                      <CtTile label="Comentário → fechamento" valor={`${data.derivados.diasComentarioFechamento} dias`} cor="#0EA5E9" icon={Calendar} />
                    </div>
                  </div>
                )}
              </OpsCard>

              {/* 4 · Publicações */}
              <SectionTitle title="Publicações" hint="o que cada post gerou · clique para abrir" />
              <OpsCard
                title={isYT ? "Vídeos publicados" : "Posts publicados"}
                hint={data ? `${posts.length} no período` : undefined}
                noPad
                right={
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-[9px] top-1/2 flex -translate-y-1/2 text-[var(--ops-mut)]">
                        <Icon icon={Search} customSize={12} />
                      </span>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar"
                        aria-label="Buscar post"
                        className="h-[30px] w-[170px] rounded-lg border border-[var(--ops-border)] bg-[var(--ops-page)] pl-7 pr-2 text-[12px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"
                      />
                    </div>
                    <CtSeg<FmtFiltro>
                      val={fFmt}
                      onChange={setFFmt}
                      opts={[
                        ["Todos", "Todos"],
                        ["Carrossel", "Carrosséis"],
                        ["Reels", "Reels"],
                        ["Vídeo YT", "Vídeos"],
                      ]}
                    />
                  </div>
                }
              >
                <div className="pt-3.5">
                  {carregando ? (
                    <div className="flex flex-col gap-2.5 p-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <CtSkel key={i} h={34} />
                      ))}
                    </div>
                  ) : posts.length === 0 ? (
                    <CtEmpty title="Nenhum post com esse filtro" desc="Ajuste a busca ou o formato." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <Th>Post</Th>
                            <Th>Perfil</Th>
                            <Th>Formato</Th>
                            <Th>Pilar · molde</Th>
                            <ThSort k="alc">Alcance</ThSort>
                            {isYT ? (
                              <>
                                <Th right>CTR</Th>
                                <Th right>Retenção</Th>
                              </>
                            ) : (
                              <>
                                <ThSort k="sav">Salvam.</ThSort>
                                <ThSort k="sh">Compart.</ThSort>
                              </>
                            )}
                            <ThSort k="seg">Seguidores</ThSort>
                            <ThSort k="com">Coment.</ThSort>
                            <ThSort k="leads">Leads</ThSort>
                          </tr>
                        </thead>
                        <tbody>
                          {posts.map((p, ri) => {
                            const last = ri === posts.length - 1
                            const on = drawer === p.id
                            return (
                              <tr
                                key={p.id}
                                onClick={() => abrir(p.id)}
                                className={cn("cursor-pointer transition-colors hover:bg-[var(--ops-hover)]", on && "bg-[var(--ops-hover)]")}
                              >
                                <Td last={last} className="max-w-[340px]">
                                  <div className="flex min-w-0 items-center gap-3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={ctThumb(p.thumbSeed ?? p.id, 72, 90)} alt="" className="h-[45px] w-9 shrink-0 rounded-md object-cover shadow-[0_1px_2px_rgba(0,0,0,0.15)]" />
                                    <span className="min-w-0">
                                      <span className="block truncate font-medium text-[var(--ops-title)]" title={p.head}>
                                        {p.head}
                                      </span>
                                      <span className="mt-0.5 block text-[11px] text-[var(--ops-mut)]">{p.data}</span>
                                    </span>
                                  </div>
                                </Td>
                                <Td last={last}>
                                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                    <CtAvatarComCanal perfil={p.perfil} size={24} />
                                    <span className="font-medium text-[var(--ops-title)]">{CT_PERFIS[p.perfil].nome}</span>
                                  </span>
                                </Td>
                                <Td last={last}>
                                  <CtFmt fmt={p.fmt} />
                                </Td>
                                <Td last={last}>
                                  <span className="inline-flex gap-[5px]">
                                    <CtBadge txt={p.pilar} cor={CT_PILAR_COR[p.pilar]} />
                                    <CtBadge txt={p.molde} cor={CT_MOLDE_COR[p.molde]} />
                                  </span>
                                </Td>
                                <Td right last={last}>
                                  {fmtNum(p.alc)}
                                </Td>
                                {isYT ? (
                                  <>
                                    <Td right last={last}>
                                      {p.ctr != null ? `${fmtDec(p.ctr)}%` : "—"}
                                    </Td>
                                    <Td right last={last}>
                                      {p.ret != null ? `${fmtDec(p.ret)}%` : "—"}
                                    </Td>
                                  </>
                                ) : (
                                  <>
                                    <Td right last={last}>
                                      {fmtNum(p.sav)}
                                    </Td>
                                    <Td right last={last}>
                                      {fmtNum(p.sh)}
                                    </Td>
                                  </>
                                )}
                                <Td right last={last} className="font-semibold text-[var(--ops-pos)]">
                                  +{p.seg}
                                </Td>
                                <Td right last={last}>
                                  {p.com}
                                </Td>
                                <Td right last={last}>
                                  <span className="inline-flex items-center gap-2">
                                    <span className="h-[5px] w-12 overflow-hidden rounded-[3px] bg-[var(--ops-track)]">
                                      <span className="block h-full bg-[var(--ops-pos)]" style={{ width: `${(p.leads / maxLeads) * 100}%` }} />
                                    </span>
                                    <strong className="w-[18px] text-right font-bold text-[var(--ops-title)]">{p.leads}</strong>
                                  </span>
                                </Td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </OpsCard>

              {/* 5 · Recortes */}
              <SectionTitle title="Recortes" hint="o que converte · ritmo de publicação" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_4fr_3fr]">
                <OpsCard title="Top 5 por leads" className="[&>div:last-child]:p-3">
                  {carregando ? (
                    <div className="flex flex-col gap-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <CtSkel key={i} h={38} />
                      ))}
                    </div>
                  ) : (
                    top5.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => abrir(p.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-[9px] text-left transition-colors hover:bg-[var(--ops-hover)]"
                      >
                        <span className="w-3 text-[11px] font-semibold text-[var(--ops-mut)]" style={TNUM}>
                          {i + 1}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ctThumb(p.thumbSeed ?? p.id, 64, 80)} alt="" className="h-[38px] w-[30px] shrink-0 rounded-[5px] object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{p.head}</span>
                          <span className="mt-0.5 block text-[10.5px] text-[var(--ops-mut)]">
                            {CT_PERFIS[p.perfil].nome} · {p.molde}
                          </span>
                        </span>
                        <strong className="w-6 text-right text-[14px] text-[var(--ops-title)]" style={TNUM}>
                          {p.leads}
                        </strong>
                      </button>
                    ))
                  )}
                </OpsCard>
                <OpsCard title="Por molde" hint="qual estrutura converte" noPad>
                  <div className="overflow-x-auto pt-3.5">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Molde</Th>
                          <Th right>Posts</Th>
                          <Th right>Alcance méd.</Th>
                          <Th right>Leads méd.</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {carregando
                          ? [1, 2, 3, 4, 5].map((i) => (
                              <tr key={i}>
                                <td colSpan={4} className="px-4 py-2">
                                  <CtSkel h={20} />
                                </td>
                              </tr>
                            ))
                          : moldePerf.map((m, i) => {
                              const last = i === moldePerf.length - 1
                              return (
                                <tr key={m.k}>
                                  <Td last={last}>
                                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                      <span className="h-2 w-2 rounded-[2px]" style={{ background: CT_MOLDE_COR[m.k] }} />
                                      <span className="font-medium text-[var(--ops-title)]">{m.nome}</span>
                                    </span>
                                  </Td>
                                  <Td right last={last}>
                                    {m.n}
                                  </Td>
                                  <Td right last={last}>
                                    {m.n ? fmtNum(m.alc) : "—"}
                                  </Td>
                                  <Td right last={last} className="font-bold text-[var(--ops-title)]">
                                    {fmtDec(m.ld)}
                                  </Td>
                                </tr>
                              )
                            })}
                      </tbody>
                    </table>
                  </div>
                </OpsCard>
                <OpsCard title="Cadência" hint="semana vs. meta">
                  {carregando || !data ? (
                    <CtSkel h={180} r={8} />
                  ) : (
                    <>
                      <div className="flex flex-col gap-3.5">
                        {data.cadencia.map((c) => {
                          const cor = c.feitos >= c.meta ? "var(--ops-pos)" : c.feitos === 0 ? "var(--ops-neg)" : "var(--ops-warn)"
                          return (
                            <div key={c.perfil} className="flex items-center gap-2.5">
                              <CtAvatar perfil={c.perfil} size={26} />
                              <div className="min-w-0 flex-1">
                                <div className="mb-[5px] flex justify-between text-[12px]">
                                  <span className="font-medium text-[var(--ops-title)]">{CT_PERFIS[c.perfil].nome}</span>
                                  <span className="font-semibold" style={{ color: cor, ...TNUM }}>
                                    {c.feitos}/{c.meta}
                                  </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--ops-track)]">
                                  <div className="h-full rounded-[3px]" style={{ width: `${Math.min(100, (c.feitos / c.meta) * 100)}%`, background: cor }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-[18px] border-t border-[var(--ops-border)] pt-3.5">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Próximos slots vazios</div>
                        {data.slots.slice(0, 3).map((s) => (
                          <div key={s.quando} className="flex items-center gap-2 py-1.5 text-[12px]">
                            <span className="w-[76px] font-medium text-[var(--ops-title)]" style={TNUM}>
                              {s.quando}
                            </span>
                            <span className="flex-1 text-[var(--ops-mut)]">{CT_PERFIS[s.perfil].nome}</span>
                            {s.perfil === "youtube" ? (
                              <Link href={ROUTES.ADMIN.CONTEUDO.REELS} className="text-[11.5px] font-semibold text-[var(--ops-accent)] hover:underline">
                                Criar
                              </Link>
                            ) : (
                              <Link href={`${estudioNovo}&perfil=${s.perfil}`} className="text-[11.5px] font-semibold text-[var(--ops-accent)] hover:underline">
                                Criar
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </OpsCard>
              </div>

              <div className="flex items-center gap-3 text-[10.5px] text-[var(--ops-mut)]">
                <span style={TNUM}>{data ? `Sincronizado ${data.sincronizadoEm}` : "Sincronizando…"}</span>
                <button type="button" onClick={() => mutate()} disabled={isValidating} className="font-semibold text-[var(--ops-sec)] hover:text-[var(--ops-title)] disabled:opacity-50">
                  {isValidating ? "Atualizando…" : "Atualizar dados"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <PostDrawer post={dp} onClose={() => setDrawer(null)} />
    </div>
  )
}
