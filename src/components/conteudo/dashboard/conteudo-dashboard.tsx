"use client"

/**
 * Dashboard Social (módulo Conteúdo) — design set/2026 (Claude Design).
 * Cabeçalho (saudação + perfil + período) → KPIs de negócio → Audiência
 * (seguidores + mix por pilar) → Funil Conteúdo → Comercial → Publicações
 * (tabela ordenável) → Recortes (top 5, por molde, cadência) → rodapé.
 *
 * Toda leitura passa por `lib/conteudo/data.ts` → `/api/conteudo/dashboard`
 * (mídias e insights da Graph API sincronizados no banco, CRM, agenda).
 * Métrica sem fonte aparece como "—" com nota; nunca número inventado.
 */

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, BarChart3, Briefcase, DollarSign, Filter, Image as ImageIcon, Inbox, Instagram, Plus, RefreshCw, Search, Sparkles, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { DateControl, defaultOpsPeriod, periodQuery, type OpsPeriodValue } from "@/components/dashboard/ops/date-control"
import { OpsCard, SectionTitle, Td, Th } from "@/components/dashboard/ops/primitives"
import { CT_MOLDE_COR, CT_PILAR_COR } from "@/lib/conteudo/brand"
import { PILARES } from "@/lib/conteudo/config"
import { classificarPosts, getDashboard, sincronizarInstagram } from "@/lib/conteudo/data"
import { PERFIL_CONSOLIDADO, type DashboardData, type Kpi, type MoldeKey, type PerfilFiltro, type Pilar, type Post } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtAvatarComCanal, CtBadge, CtBtn, CtEmpty, CtFmt, CtSeg, CtSkel, CtThumbPost, CtTile, TNUM, fmtDec, fmtNum, inputCls, selectCls } from "../ui"
import { FunilConteudo } from "./funil-conteudo"
import { PerfilPicker } from "./perfil-picker"
import { PostDrawer } from "./post-drawer"
import { SeguidoresChart } from "./seguidores-chart"

type SortKey = "alc" | "sav" | "sh" | "seg" | "com" | "leads"
type FmtFiltro = "Todos" | "Carrossel" | "Reels" | "Imagem"

const MOLDES: MoldeKey[] = ["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]
/** "" = todos; "-" = só os SEM classificação (é onde o trabalho está). */
const SEM = "-"

function toneDelta(d: string | null): "pos" | "neg" | "neut" {
  if (!d) return "neut"
  if (d.startsWith("-") || d.startsWith("−")) return "neg"
  if (/^\+0[,.]0/.test(d)) return "neut"
  return "pos"
}

const num = (v: number | null) => (v == null ? "—" : fmtNum(v))

// ── KPI de negócio ─────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: Kpi }) {
  const tone = toneDelta(kpi.delta)
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[17px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{kpi.label}</div>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className={cn("text-[22px] font-semibold leading-none tracking-[-0.01em]", kpi.money && kpi.valor !== "—" ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
          {kpi.valor}
        </span>
        {kpi.delta && (
          <span className={cn("text-[11px] font-semibold", tone === "pos" ? "text-[var(--ops-pos)]" : tone === "neg" ? "text-[var(--ops-neg)]" : "text-[var(--ops-mut)]")} style={TNUM}>
            {kpi.delta}
          </span>
        )}
      </div>
      <div className="mt-1.5 truncate text-[11px] text-[var(--ops-mut)]" title={kpi.nota}>
        {kpi.nota ?? (kpi.delta ? "vs. período anterior" : "sem base de comparação")}
      </div>
    </div>
  )
}

const fmtSync = (iso: string | null) => {
  if (!iso) return "ainda não sincronizado"
  const d = new Date(iso)
  return `Sincronizado ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
}

const fmtDiaCurto = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
}

/** dd/mm/aaaa de um ISO completo (publicação da mídia). */
const fmtDataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

/**
 * Período que vai do dia do post mais recente até hoje — é o atalho do
 * estado vazio: "tem 47 posts, o último é de julho" só ajuda se der para
 * ver os 47 com um clique.
 */
const periodoAte = (iso: string): OpsPeriodValue => {
  const d = new Date(iso)
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const hoje = new Date()
  return { period: "custom", start: inicio, end: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), compare: false, presetLabel: null }
}

// ── Dashboard ──────────────────────────────────────────────────────────

/** `saudacao` vem do servidor (hora do request): calcular no client causava divergência de hidratação. */
export function ConteudoDashboard({ userName, saudacao = "Olá" }: { userName: string; saudacao?: string }) {
  const [perfil, setPerfil] = useState<PerfilFiltro>(PERFIL_CONSOLIDADO)
  const [period, setPeriod] = useState<OpsPeriodValue>(() => defaultOpsPeriod())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [fFmt, setFFmt] = useState<FmtFiltro>("Todos")
  const [fPilar, setFPilar] = useState<string>("")
  const [fMolde, setFMolde] = useState<string>("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "leads", dir: "desc" })
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [lote, setLote] = useState<{ pilar: string; molde: string; kw: string }>({ pilar: "", molde: "", kw: "" })
  const [aplicando, setAplicando] = useState(false)
  const [erroLote, setErroLote] = useState<string | null>(null)

  const pq = periodQuery(period)
  const { data, error, isLoading, isValidating, mutate } = useSWR<DashboardData>(
    ["conteudo-dashboard", perfil, pq],
    () => {
      const params = new URLSearchParams(pq)
      return getDashboard(perfil, { start: params.get("start") ?? "", end: params.get("end") ?? "" })
    },
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const carregando = isLoading || (!data && !error)
  const perfis = data?.perfis ?? null
  const perfilDe = useCallback((id: string) => perfis?.find((p) => p.id === id), [perfis])

  const posts = useMemo(() => {
    if (!data) return []
    const lista = data.posts
      .filter((p) => fFmt === "Todos" || p.fmt === fFmt)
      .filter((p) => (fPilar === "" ? true : fPilar === SEM ? p.pilar == null : p.pilar === fPilar))
      .filter((p) => (fMolde === "" ? true : fMolde === SEM ? p.molde == null : p.molde === fMolde))
      .filter((p) => !q || p.head.toLowerCase().includes(q.toLowerCase()))
    const v = (p: Post) => p[sort.key] ?? -1
    return [...lista].sort((a, b) => (sort.dir === "desc" ? v(b) - v(a) : v(a) - v(b)))
  }, [data, fFmt, fPilar, fMolde, q, sort])

  // Seleção só pode conter o que está na tela: filtrar e depois classificar
  // "todos" não pode alcançar post que saiu do filtro.
  const idsVisiveis = useMemo(() => new Set(posts.map((p) => p.id)), [posts])
  const selecionados = useMemo(() => [...sel].filter((id) => idsVisiveis.has(id)), [sel, idsVisiveis])
  const todosMarcados = posts.length > 0 && selecionados.length === posts.length

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const alternarTodos = () => setSel(todosMarcados ? new Set() : new Set(posts.map((p) => p.id)))

  const aplicarLote = async () => {
    if (!selecionados.length) return
    const patch: { pilar?: string | null; molde?: string | null; palavraChave?: string | null } = {}
    if (lote.pilar) patch.pilar = lote.pilar === SEM ? null : lote.pilar
    if (lote.molde) patch.molde = lote.molde === SEM ? null : lote.molde
    if (lote.kw.trim()) patch.palavraChave = lote.kw.trim()
    if (!Object.keys(patch).length) {
      setErroLote("Escolha pilar, molde ou palavra-chave para aplicar.")
      return
    }
    setAplicando(true)
    setErroLote(null)
    try {
      await classificarPosts(selecionados, patch)
      setSel(new Set())
      setLote({ pilar: "", molde: "", kw: "" })
      await mutate()
    } catch (e) {
      setErroLote(e instanceof Error ? e.message : "Não foi possível classificar")
    } finally {
      setAplicando(false)
    }
  }

  const maxLeads = useMemo(() => Math.max(1, ...(data?.posts.map((p) => p.leads) ?? [1])), [data])
  const top5 = useMemo(() => [...(data?.posts ?? [])].sort((a, b) => b.leads - a.leads || (b.alc ?? 0) - (a.alc ?? 0)).slice(0, 5), [data])
  const dp: Post | null = useMemo(() => (drawer && data ? data.posts.find((p) => p.id === drawer) ?? null : null), [drawer, data])
  const abrir = useCallback((id: string) => setDrawer(id), [])

  const clicarSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }))

  const ThSort = ({ k, children }: { k: SortKey; children: string }) => {
    const on = sort.key === k
    return (
      <th
        aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
        onClick={() => clicarSort(k)}
        className={cn("cursor-pointer select-none whitespace-nowrap border-b border-[var(--ops-border)] px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.05em] hover:text-[var(--ops-title)]", on ? "text-[var(--ops-title)]" : "text-[var(--ops-sec)]")}
      >
        {children}
        {on && <span className="ml-1">{sort.dir === "desc" ? "↓" : "↑"}</span>}
      </th>
    )
  }

  const atualizar = async () => {
    setSincronizando(true)
    setErroSync(null)
    try {
      const r = await sincronizarInstagram()
      const falhas = r.resultados.filter((x) => !x.ok)
      if (falhas.length) setErroSync(falhas.map((f) => f.erro).filter(Boolean).join(" · ") || "Um canal não sincronizou.")
      await mutate()
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : "Falha ao sincronizar")
    } finally {
      setSincronizando(false)
    }
  }

  const mix = data?.pilarMix
  const mixKeys = (mix ? Object.keys(mix.real) : []) as Pilar[]
  const desvios = mix && mix.classificados > 0 ? mixKeys.filter((k) => Math.abs((mix.real[k] ?? 0) - (mix.alvo[k] ?? 0)) > 10) : []
  const kpisTopo = data?.kpis.length ? [data.kpis[4], data.kpis[5], data.kpis[0], data.kpis[1]] : []
  const seg = data?.serieSeguidores.valores ?? []
  const segValidos = seg.filter((v): v is number => v != null)
  const novos = segValidos.length >= 2 ? segValidos[segValidos.length - 1] - segValidos[0] : null
  const estudioNovo = `${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=template`
  const semCanal = data && data.perfis.length === 0

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
            <PerfilPicker val={perfil} onChange={setPerfil} perfis={perfis} />
            <DateControl value={period} onChange={setPeriod} />
          </div>

          {(data?.avisos.length || erroSync) && (
            <div className="flex flex-col gap-1 rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-warn)]">
              {erroSync && (
                <div className="flex gap-2">
                  <Icon icon={AlertTriangle} customSize={13} className="mt-0.5 shrink-0" />
                  <span>{erroSync}</span>
                </div>
              )}
              {data?.avisos.map((a) => (
                <div key={a} className="flex gap-2">
                  <Icon icon={AlertTriangle} customSize={13} className="mt-0.5 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {error ? (
            <OpsCard>
              <CtEmpty
                icon={XCircle}
                title="Não foi possível carregar o dashboard"
                desc={error instanceof Error && error.message ? error.message : "A API não respondeu."}
                action={
                  <div className="mt-2">
                    <CtBtn kind="primary" icon={RefreshCw} onClick={() => mutate()}>
                      Tentar novamente
                    </CtBtn>
                  </div>
                }
              />
            </OpsCard>
          ) : semCanal ? (
            <OpsCard>
              <CtEmpty
                icon={Instagram}
                title="Nenhum canal Instagram conectado"
                desc="O dashboard lê os posts e insights da conta conectada em Comercial → Canais. Conecte um canal para ver os números aqui."
                action={
                  <Link href={ROUTES.ADMIN.COMERCIAL.CANAIS} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ops-accent)] px-[13px] text-[12px] font-semibold text-[var(--ops-on-accent)]">
                    <Icon icon={Plus} customSize={13} />
                    Conectar canal
                  </Link>
                }
              />
            </OpsCard>
          ) : (
            <>
              {/* 1 · KPIs de negócio */}
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {carregando || !kpisTopo.length
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
              <SectionTitle title="Audiência" hint="seguidores por dia (snapshots) · marcadores nos dias com publicação" />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[7fr_5fr]">
                <OpsCard
                  title="Crescimento de seguidores"
                  hint={carregando ? undefined : novos == null ? "coletando snapshots" : `${novos >= 0 ? "+" : ""}${fmtNum(novos)} no período`}
                  right={
                    data && data.kpis.length > 0 && (
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
                  {carregando || !data ? <CtSkel h={220} r={8} /> : <SeguidoresChart serie={data.serieSeguidores} posts={data.posts} perfis={data.perfis} onAbrirPost={abrir} />}
                </OpsCard>
                <OpsCard title="Mix por pilar" hint={mix && mix.classificados ? `${mix.classificados} posts classificados · alvo do mês` : "classifique os posts no detalhe"}>
                  {carregando || !mix ? (
                    <CtSkel h={220} r={8} />
                  ) : mix.classificados === 0 ? (
                    <CtEmpty title="Nenhum post classificado" desc="Abra um post e escolha pilar e molde. O mix compara o realizado com o alvo (Case 50 · Educacional 30 · Bastidor 20)." className="py-8" />
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
                      {mix.semClassificacao > 0 && (
                        <div className="text-[11px] text-[var(--ops-mut)]">
                          {mix.semClassificacao} {mix.semClassificacao === 1 ? "post sem classificação" : "posts sem classificação"} fora da conta.
                        </div>
                      )}
                      {desvios.length > 0 && (
                        <div className="mt-auto flex gap-2 rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-warn)]">
                          <span className="mt-px flex shrink-0">
                            <Icon icon={Sparkles} customSize={13} />
                          </span>
                          <span>{desvios.map((k) => `${k} ${(mix.real[k] ?? 0) > (mix.alvo[k] ?? 0) ? "acima" : "abaixo"} do alvo em ${Math.abs((mix.real[k] ?? 0) - (mix.alvo[k] ?? 0))} pontos`).join(" e ")}.</span>
                        </div>
                      )}
                    </div>
                  )}
                </OpsCard>
              </div>

              {/* 3 · Funil */}
              <SectionTitle title="Funil Conteúdo → Comercial" hint="do alcance ao cliente fechado · no período" />
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
                      <CtTile label="Comentários" valor={fmtNum(data.derivados.comentarios)} cor="#2563EB" icon={Inbox} />
                      <CtTile label="Alcance → lead" valor={data.derivados.alcanceParaLead == null ? "—" : `${fmtDec(data.derivados.alcanceParaLead, 2)}%`} cor="#D97706" icon={Filter} />
                    </div>
                    <div className="overflow-x-auto">
                      <FunilConteudo etapas={data.funil} />
                    </div>
                    <div className="flex flex-col gap-[9px]">
                      <CtTile label="Negócios criados" valor={String(data.derivados.negocios)} cor="#7C3AED" icon={Briefcase} />
                      <CtTile label="Ticket médio fechados" valor={data.derivados.ticketMedio == null ? "—" : `R$ ${fmtNum(Math.round(data.derivados.ticketMedio))}`} cor="#047857" icon={BarChart3} />
                      <CtTile label="Receita atribuída" valor={`R$ ${fmtNum(Math.round(data.derivados.receita))}`} cor="#0EA5E9" icon={DollarSign} />
                    </div>
                  </div>
                )}
              </OpsCard>

              {/* 4 · Publicações */}
              <SectionTitle title="Publicações" hint="o que cada post gerou · clique para abrir e classificar" />
              <OpsCard
                title="Posts publicados"
                hint={data ? `${posts.length} de ${data.posts.length} no período · ${data.pilarMix.semClassificacao} sem classificação` : undefined}
                noPad
                right={
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-[9px] top-1/2 flex -translate-y-1/2 text-[var(--ops-mut)]">
                        <Icon icon={Search} customSize={12} />
                      </span>
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar post" className="h-[30px] w-[170px] rounded-lg border border-[var(--ops-border)] bg-[var(--ops-page)] pl-7 pr-2 text-[12px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]" />
                    </div>
                    <CtSeg<FmtFiltro>
                      val={fFmt}
                      onChange={setFFmt}
                      opts={[
                        ["Todos", "Todos"],
                        ["Carrossel", "Carrosséis"],
                        ["Reels", "Reels"],
                        ["Imagem", "Imagens"],
                      ]}
                    />
                    <select value={fPilar} onChange={(e) => setFPilar(e.target.value)} aria-label="Filtrar por pilar" className={cn(selectCls, "h-[30px] w-auto bg-[var(--ops-page)] text-[11.5px]")}>
                      <option value="">Pilar: todos</option>
                      {PILARES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      <option value={SEM}>Sem pilar</option>
                    </select>
                    <select value={fMolde} onChange={(e) => setFMolde(e.target.value)} aria-label="Filtrar por molde" className={cn(selectCls, "h-[30px] w-auto bg-[var(--ops-page)] text-[11.5px]")}>
                      <option value="">Molde: todos</option>
                      {MOLDES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value={SEM}>Sem molde</option>
                    </select>
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
                  ) : data && data.posts.length === 0 ? (
                    <CtEmpty
                      icon={ImageIcon}
                      title="Nenhum post neste período"
                      desc={
                        data.cobertura.totalPosts > 0 && data.cobertura.ultimoPostEm
                          ? `Este perfil tem ${data.cobertura.totalPosts} ${data.cobertura.totalPosts === 1 ? "post sincronizado" : "posts sincronizados"}, mas o mais recente é de ${fmtDataCurta(data.cobertura.ultimoPostEm)}. Amplie o período para vê-los.`
                          : data.sincronizadoEm
                            ? "Nada publicado aqui e nada sincronizado deste perfil. Publique um carrossel ou troque de perfil."
                            : "A primeira sincronização com o Instagram ainda não rodou. Clique em Atualizar dados."
                      }
                      action={
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                          {data.cobertura.ultimoPostEm && (
                            <CtBtn kind="primary" onClick={() => setPeriod(periodoAte(data.cobertura.ultimoPostEm!))}>
                              Ver desde {fmtDataCurta(data.cobertura.ultimoPostEm)}
                            </CtBtn>
                          )}
                          <CtBtn icon={RefreshCw} onClick={() => void atualizar()} disabled={sincronizando}>
                            {sincronizando ? "Sincronizando…" : "Atualizar dados"}
                          </CtBtn>
                          <Link href={estudioNovo} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)]">
                            <Icon icon={Plus} customSize={13} />
                            Criar carrossel
                          </Link>
                        </div>
                      }
                    />
                  ) : posts.length === 0 ? (
                    <CtEmpty
                      title="Nenhum post com esse filtro"
                      desc="Ajuste a busca, o formato ou a classificação."
                      action={
                        <button
                          type="button"
                          onClick={() => {
                            setQ("")
                            setFFmt("Todos")
                            setFPilar("")
                            setFMolde("")
                          }}
                          className="mt-2 text-[12px] font-semibold text-[var(--ops-accent)] hover:underline"
                        >
                          Limpar filtros
                        </button>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="w-8 border-b border-[var(--ops-border)] px-3 py-2.5 text-left">
                              <input
                                type="checkbox"
                                aria-label="Selecionar todos os posts do filtro"
                                checked={todosMarcados}
                                onChange={alternarTodos}
                                className="m-0 accent-[var(--ops-accent)]"
                              />
                            </th>
                            <Th>Post</Th>
                            <Th>Perfil</Th>
                            <Th>Formato</Th>
                            <Th>Pilar · molde</Th>
                            <ThSort k="alc">Alcance</ThSort>
                            <ThSort k="sav">Salvam.</ThSort>
                            <ThSort k="sh">Compart.</ThSort>
                            <ThSort k="seg">Seguidores</ThSort>
                            <ThSort k="com">Coment.</ThSort>
                            <ThSort k="leads">Leads</ThSort>
                          </tr>
                        </thead>
                        <tbody>
                          {posts.map((p, ri) => {
                            const last = ri === posts.length - 1
                            const on = drawer === p.id
                            const pf = perfilDe(p.perfil)
                            return (
                              <tr key={p.id} onClick={() => abrir(p.id)} className={cn("cursor-pointer transition-colors hover:bg-[var(--ops-hover)]", (on || sel.has(p.id)) && "bg-[var(--ops-hover)]")}>
                                <Td last={last} className="w-8">
                                  <input
                                    type="checkbox"
                                    aria-label={`Selecionar ${p.head}`}
                                    checked={sel.has(p.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => alternar(p.id)}
                                    className="m-0 accent-[var(--ops-accent)]"
                                  />
                                </Td>
                                <Td last={last} className="max-w-[340px]">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <CtThumbPost src={p.thumb} className="h-[45px] w-9 shrink-0 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.15)]" />
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
                                    <CtAvatarComCanal perfil={pf} size={24} />
                                    <span className="font-medium text-[var(--ops-title)]">{pf?.nome ?? "—"}</span>
                                  </span>
                                </Td>
                                <Td last={last}>
                                  <CtFmt fmt={p.fmt} />
                                </Td>
                                <Td last={last}>
                                  {p.pilar || p.molde ? (
                                    <span className="inline-flex gap-[5px]">
                                      {p.pilar && <CtBadge txt={p.pilar} cor={CT_PILAR_COR[p.pilar]} />}
                                      {p.molde && <CtBadge txt={p.molde} cor={CT_MOLDE_COR[p.molde]} />}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-[var(--ops-mut)]">classificar</span>
                                  )}
                                </Td>
                                <Td right last={last}>
                                  {num(p.alc)}
                                </Td>
                                <Td right last={last}>
                                  {num(p.sav)}
                                </Td>
                                <Td right last={last}>
                                  {num(p.sh)}
                                </Td>
                                <Td right last={last} className={cn("font-semibold", p.seg != null && p.seg > 0 ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")}>
                                  {p.seg == null ? "—" : `+${fmtNum(p.seg)}`}
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
                  ) : top5.length === 0 ? (
                    <CtEmpty title="Sem posts no período" className="py-6" />
                  ) : (
                    top5.map((p, i) => (
                      <button key={p.id} type="button" onClick={() => abrir(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-[9px] text-left transition-colors hover:bg-[var(--ops-hover)]">
                        <span className="w-3 text-[11px] font-semibold text-[var(--ops-mut)]" style={TNUM}>
                          {i + 1}
                        </span>
                        <CtThumbPost src={p.thumb} className="h-[38px] w-[30px] shrink-0 rounded-[5px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{p.head}</span>
                          <span className="mt-0.5 block text-[10.5px] text-[var(--ops-mut)]">
                            {perfilDe(p.perfil)?.nome ?? "—"} · {p.molde ?? p.fmt}
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
                        {carregando || !data
                          ? [1, 2, 3, 4, 5].map((i) => (
                              <tr key={i}>
                                <td colSpan={4} className="px-4 py-2">
                                  <CtSkel h={20} />
                                </td>
                              </tr>
                            ))
                          : data.moldes.map((m, i) => {
                              const last = i === data.moldes.length - 1
                              return (
                                <tr key={m.k}>
                                  <Td last={last}>
                                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                      <span className="h-2 w-2 rounded-[2px]" style={{ background: CT_MOLDE_COR[m.k] }} />
                                      <span className="font-medium text-[var(--ops-title)]">{m.nome}</span>
                                    </span>
                                  </Td>
                                  <Td right last={last}>
                                    {m.posts}
                                  </Td>
                                  <Td right last={last}>
                                    {m.alcanceMedio == null ? "—" : fmtNum(m.alcanceMedio)}
                                  </Td>
                                  <Td right last={last} className="font-bold text-[var(--ops-title)]">
                                    {m.leads == null ? "—" : fmtDec(m.leads)}
                                  </Td>
                                </tr>
                              )
                            })}
                      </tbody>
                    </table>
                  </div>
                  {data && data.moldes.every((m) => m.posts === 0) && <div className="px-4 pb-3 pt-1 text-[10.5px] text-[var(--ops-mut)]">Nenhum post classificado por molde no período — classifique no detalhe do post.</div>}
                </OpsCard>
                <OpsCard title="Cadência" hint="semana atual vs. meta">
                  {carregando || !data ? (
                    <CtSkel h={180} r={8} />
                  ) : (
                    <>
                      <div className="flex flex-col gap-3.5">
                        {data.cadencia.map((c) => {
                          const pf = perfilDe(c.perfil)
                          const cor = c.meta > 0 && c.feitos >= c.meta ? "var(--ops-pos)" : c.feitos === 0 ? "var(--ops-neg)" : "var(--ops-warn)"
                          return (
                            <div key={c.perfil} className="flex items-center gap-2.5">
                              <CtAvatar perfil={pf} size={26} />
                              <div className="min-w-0 flex-1">
                                <div className="mb-[5px] flex justify-between text-[12px]">
                                  <span className="truncate font-medium text-[var(--ops-title)]">{pf?.nome ?? "Perfil"}</span>
                                  <span className="font-semibold" style={{ color: cor, ...TNUM }}>
                                    {c.feitos}/{c.meta}
                                  </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--ops-track)]">
                                  <div className="h-full rounded-[3px]" style={{ width: `${c.meta > 0 ? Math.min(100, (c.feitos / c.meta) * 100) : 0}%`, background: cor }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-[18px] border-t border-[var(--ops-border)] pt-3.5">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Próximos agendados</div>
                        {data.agendados.length === 0 ? (
                          <div className="flex items-center justify-between py-1.5 text-[12px]">
                            <span className="text-[var(--ops-mut)]">Nada agendado no Estúdio.</span>
                            <Link href={estudioNovo} className="text-[11.5px] font-semibold text-[var(--ops-accent)] hover:underline">
                              Criar
                            </Link>
                          </div>
                        ) : (
                          data.agendados.slice(0, 3).map((s) => (
                            <div key={s.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                              <span className="w-[76px] font-medium text-[var(--ops-title)]" style={TNUM}>
                                {fmtDiaCurto(s.data)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[var(--ops-mut)]" title={s.nome}>
                                {s.nome}
                              </span>
                              <Link href={ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(s.documentoId)} className="text-[11.5px] font-semibold text-[var(--ops-accent)] hover:underline">
                                Abrir
                              </Link>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </OpsCard>
              </div>

              <div className="flex items-center gap-3 text-[10.5px] text-[var(--ops-mut)]">
                <span style={TNUM}>{data ? fmtSync(data.sincronizadoEm) : "Carregando…"}</span>
                <button type="button" onClick={() => void atualizar()} disabled={isValidating || sincronizando} className="font-semibold text-[var(--ops-sec)] hover:text-[var(--ops-title)] disabled:opacity-50">
                  {sincronizando ? "Sincronizando com o Instagram…" : isValidating ? "Atualizando…" : "Atualizar dados"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <PostDrawer post={dp} perfil={dp ? perfilDe(dp.perfil) : undefined} onClose={() => setDrawer(null)} onClassificado={() => void mutate()} />

      {/* Classificação em lote — FLUTUA (não empurra a tabela). */}
      {selecionados.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2.5 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
            <span className="text-[12px] font-semibold text-[var(--ops-title)]" style={TNUM}>
              {selecionados.length} {selecionados.length === 1 ? "post" : "posts"}
            </span>
            <select value={lote.pilar} onChange={(e) => setLote((l) => ({ ...l, pilar: e.target.value }))} aria-label="Pilar a aplicar" className={cn(selectCls, "h-[30px] w-auto bg-[var(--ops-page)] text-[11.5px]")}>
              <option value="">Pilar…</option>
              {PILARES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={SEM}>Limpar pilar</option>
            </select>
            <select value={lote.molde} onChange={(e) => setLote((l) => ({ ...l, molde: e.target.value }))} aria-label="Molde a aplicar" className={cn(selectCls, "h-[30px] w-auto bg-[var(--ops-page)] text-[11.5px]")}>
              <option value="">Molde…</option>
              {MOLDES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={SEM}>Limpar molde</option>
            </select>
            <input
              value={lote.kw}
              onChange={(e) => setLote((l) => ({ ...l, kw: e.target.value }))}
              placeholder="Palavra-chave"
              aria-label="Palavra-chave do comment gate"
              maxLength={80}
              className={cn(inputCls, "h-[30px] w-[150px] bg-[var(--ops-page)] text-[11.5px]")}
            />
            <CtBtn kind="primary" onClick={() => void aplicarLote()} disabled={aplicando}>
              {aplicando ? "Aplicando…" : "Aplicar"}
            </CtBtn>
            <button type="button" onClick={() => setSel(new Set())} className="text-[11.5px] font-semibold text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
              Limpar seleção
            </button>
            {erroLote && <span className="w-full text-[11px] font-medium text-[var(--ops-neg)]">{erroLote}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
