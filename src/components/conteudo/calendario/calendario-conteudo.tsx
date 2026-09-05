"use client"

/**
 * Calendário do módulo Conteúdo: mês a mês com o que foi PUBLICADO (mídias
 * do Instagram sincronizadas) e o que está AGENDADO no Estúdio, mais a
 * cadência da semana por perfil. Clique no dia abre a lista lateral; clique
 * no item abre o carrossel no Estúdio ou o post no Instagram.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, RefreshCw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { OpsCard, SectionTitle } from "@/components/dashboard/ops/primitives"
import { getAgenda, getDashboard } from "@/lib/conteudo/data"
import { PERFIL_CONSOLIDADO, type Agendado, type DashboardData, type Post } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtBtn, CtEmpty, CtFmt, CtSkel, CtThumbPost, TNUM, fmtNum } from "../ui"

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const hojeIso = () => iso(new Date())

function diaSp(isoTs: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoTs))
}

/** Grade do mês começando na segunda-feira. */
function gradeDoMes(ano: number, mes: number): string[] {
  const primeiro = new Date(ano, mes, 1)
  const offset = (primeiro.getDay() + 6) % 7
  const inicio = new Date(ano, mes, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => iso(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)))
}

export function CalendarioConteudo() {
  const hoje = hojeIso()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })
  const [selecionado, setSelecionado] = useState<string>(hoje)

  const dias = useMemo(() => gradeDoMes(cursor.ano, cursor.mes), [cursor])
  const inicio = dias[0]
  const fim = dias[dias.length - 1]

  const { data: agenda, error: erroAgenda, isLoading: carregandoAgenda, mutate: mutarAgenda } = useSWR<Agendado[]>(
    ["conteudo-agenda", inicio, fim],
    () => getAgenda({ start: inicio, end: fim }),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: dash, error: erroDash, isLoading: carregandoDash, mutate: mutarDash } = useSWR<DashboardData>(
    ["conteudo-calendario-posts", inicio, fim],
    () => getDashboard(PERFIL_CONSOLIDADO, { start: inicio, end: fim }, { sync: false }),
    { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true },
  )

  const perfilDe = (id: string | null) => dash?.perfis.find((p) => p.id === id)
  const carregando = carregandoAgenda || carregandoDash

  const porDia = useMemo(() => {
    const m = new Map<string, { posts: Post[]; agendados: Agendado[] }>()
    const bucket = (d: string) => {
      const b = m.get(d) ?? { posts: [], agendados: [] }
      m.set(d, b)
      return b
    }
    for (const p of dash?.posts ?? []) bucket(diaSp(p.publicadoEm)).posts.push(p)
    for (const a of agenda ?? []) bucket(a.data).agendados.push(a)
    return m
  }, [dash, agenda])

  const sel = porDia.get(selecionado)
  const noMes = (d: string) => Number(d.slice(5, 7)) - 1 === cursor.mes
  const mover = (delta: number) => {
    const d = new Date(cursor.ano, cursor.mes + delta, 1)
    setCursor({ ano: d.getFullYear(), mes: d.getMonth() })
  }
  const erro = (erroAgenda ?? erroDash) as Error | undefined

  return (
    <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
        <div className="flex flex-wrap items-end gap-3.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Conteúdo</div>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Calendário</h1>
            <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">Publicado no Instagram e agendado no Estúdio, mês a mês</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
              <Icon icon={ChevronLeft} customSize={14} />
            </button>
            <span className="min-w-[150px] text-center text-[13px] font-semibold capitalize text-[var(--ops-title)]">
              {MESES[cursor.mes]} de {cursor.ano}
            </span>
            <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
              <Icon icon={ChevronRight} customSize={14} />
            </button>
            <CtBtn
              onClick={() => {
                const d = new Date()
                setCursor({ ano: d.getFullYear(), mes: d.getMonth() })
                setSelecionado(hojeIso())
              }}
            >
              Hoje
            </CtBtn>
          </div>
          <Link href={`${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=template`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--ops-accent)] px-4 text-[12.5px] font-semibold text-[var(--ops-on-accent)]">
            <Icon icon={Plus} customSize={13} />
            Novo carrossel
          </Link>
        </div>

        {erro ? (
          <OpsCard>
            <CtEmpty
              icon={XCircle}
              title="Não foi possível carregar o calendário"
              desc={erro.message}
              action={
                <div className="mt-2">
                  <CtBtn
                    kind="primary"
                    icon={RefreshCw}
                    onClick={() => {
                      void mutarAgenda()
                      void mutarDash()
                    }}
                  >
                    Tentar novamente
                  </CtBtn>
                </div>
              }
            />
          </OpsCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
            <OpsCard noPad>
              <div className="grid grid-cols-7 border-b border-[var(--ops-border)]">
                {DIAS.map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {dias.map((d, i) => {
                  const b = porDia.get(d)
                  const on = selecionado === d
                  const eHoje = d === hoje
                  const total = (b?.posts.length ?? 0) + (b?.agendados.length ?? 0)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelecionado(d)}
                      className={cn(
                        "flex min-h-[86px] flex-col items-start gap-1 border-b border-r border-[var(--ops-border)] p-1.5 text-left transition-colors hover:bg-[var(--ops-hover)]",
                        i % 7 === 6 && "border-r-0",
                        i >= 35 && "border-b-0",
                        !noMes(d) && "opacity-40",
                        on && "bg-[var(--ops-hover)] ring-1 ring-inset ring-[var(--ops-accent)]",
                      )}
                    >
                      <span className={cn("inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[11px]", eHoje ? "bg-[var(--ops-accent)] font-bold text-[var(--ops-on-accent)]" : "font-semibold text-[var(--ops-title)]")} style={TNUM}>
                        {Number(d.slice(8, 10))}
                      </span>
                      {carregando && total === 0 ? null : (
                        <span className="flex w-full flex-col gap-1">
                          {(b?.posts ?? []).slice(0, 2).map((p) => (
                            <span key={p.id} className="flex items-center gap-1 rounded-[5px] bg-[var(--ops-pos)]/12 px-1 py-0.5 text-[9.5px] font-medium text-[var(--ops-pos)]">
                              <CtThumbPost src={p.thumb} className="h-[13px] w-[13px] shrink-0 rounded-[3px]" />
                              <span className="truncate">{p.head}</span>
                            </span>
                          ))}
                          {(b?.agendados ?? []).slice(0, 2).map((a) => (
                            <span key={a.id} className="flex items-center gap-1 rounded-[5px] bg-[var(--ops-warn)]/14 px-1 py-0.5 text-[9.5px] font-medium text-[var(--ops-warn)]">
                              <span className="shrink-0" style={TNUM}>
                                {a.hora}
                              </span>
                              <span className="truncate">{a.nome}</span>
                            </span>
                          ))}
                          {total > 4 && <span className="px-1 text-[9.5px] text-[var(--ops-mut)]">+{total - 4}</span>}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </OpsCard>

            <div className="flex flex-col gap-4">
              <OpsCard title={new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} hint={sel ? `${(sel.posts.length ?? 0) + (sel.agendados.length ?? 0)} itens` : "nada neste dia"}>
                {carregando ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                      <CtSkel key={i} h={40} />
                    ))}
                  </div>
                ) : !sel || (sel.posts.length === 0 && sel.agendados.length === 0) ? (
                  <CtEmpty icon={CalendarDays} title="Nada neste dia" desc="Agende um carrossel pelo Estúdio (Exportar → Enviar para o calendário)." className="py-6" />
                ) : (
                  <div className="flex flex-col gap-2">
                    {sel.agendados.map((a) => (
                      <Link key={a.id} href={ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(a.documentoId)} className="flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2 hover:bg-[var(--ops-hover)]">
                        <span className="w-[38px] shrink-0 text-[11.5px] font-semibold text-[var(--ops-warn)]" style={TNUM}>
                          {a.hora}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{a.nome}</span>
                          <span className="block text-[10.5px] text-[var(--ops-mut)]">Agendado · {perfilDe(a.perfil)?.nome ?? "sem perfil"}</span>
                        </span>
                        <CtAvatar perfil={perfilDe(a.perfil)} size={22} />
                      </Link>
                    ))}
                    {sel.posts.map((p) => (
                      <a key={p.id} href={p.permalink ?? "#"} target={p.permalink ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2 hover:bg-[var(--ops-hover)]">
                        <CtThumbPost src={p.thumb} className="h-[38px] w-[30px] shrink-0 rounded-[5px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{p.head}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--ops-mut)]">
                            <CtFmt fmt={p.fmt} />
                            {p.alc != null && <span style={TNUM}>{fmtNum(p.alc)} de alcance</span>}
                          </span>
                        </span>
                        {p.permalink && (
                          <span className="flex shrink-0 text-[var(--ops-mut)]">
                            <Icon icon={ExternalLink} customSize={12} />
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </OpsCard>

              <OpsCard title="Cadência da semana" hint="publicado vs. meta por perfil">
                {carregando || !dash ? (
                  <CtSkel h={120} r={8} />
                ) : dash.cadencia.length === 0 ? (
                  <CtEmpty title="Nenhum perfil conectado" desc="Conecte um canal Instagram para acompanhar a cadência." className="py-6" />
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {dash.cadencia.map((c) => {
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
                )}
              </OpsCard>
            </div>
          </div>
        )}

        <SectionTitle title="Como funciona" hint="publicação é feita no app do Instagram" />
        <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-4 py-3 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">
          Verde é o que já foi publicado (lido da conta conectada). Âmbar é o que está agendado no Estúdio: o calendário organiza a cadência e marca o status do carrossel, mas a publicação em si continua no app do Instagram.
        </div>
      </div>
    </div>
  )
}
