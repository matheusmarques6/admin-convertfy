"use client"

/**
 * Calendário do módulo Conteúdo — design set/2026 (Claude Design).
 *
 * Mês ou semana, com três coisas na MESMA grade: o que foi publicado (mídias
 * da conta conectada), o que está agendado (carrossel do Estúdio e reel do
 * pipeline) e os SLOTS VAZIOS — os dias em que a cadência pede post e não há
 * nada.
 *
 * O slot é o único item da tela que não existe no banco, e por isso é o mais
 * fácil de estragar: ele é uma PROMESSA, e promessa inventada faz o operador
 * ignorar promessa e fato. Daí a regra em `lib/conteudo/calendario/slots.ts`
 * (puro, testado) — cadência definida por alguém vence; sem ela, a meta vira
 * sugestão espalhada pela semana, e o slot aparece TRACEJADO com o rótulo
 * dizendo qual dos dois casos é. Dia passado não gera slot, e dia que já tem
 * post daquele perfil também não.
 *
 * A publicação em si continua sendo feita no app do Instagram; o calendário
 * organiza a cadência e mostra o status.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Film, Plus, RefreshCw, Settings2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { OpsCard } from "@/components/dashboard/ops/primitives"
import { getAgenda, getDashboard, getReels, setCadencia } from "@/lib/conteudo/data"
import { cadenciaEfetiva, slotsNaJanela, slotsVazios, type DiaSemana, type OcupacaoDoDia, type SlotVazio } from "@/lib/conteudo/calendario/slots"
import { statusNoCalendario, type ProgressoFunil } from "@/lib/conteudo/reels/pipeline"
import { PERFIL_CONSOLIDADO, type Agendado, type DashboardData, type Perfil, type PerfilFiltro, type Reel } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtBtn, CtEmpty, CtSeg, CtSkel, CtThumbPost, TNUM, fmtNum } from "../ui"
import { PostDrawer } from "../dashboard/post-drawer"

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
const DIAS_LONGOS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
/** Índices 0..6 = seg..dom no dia da SEMANA do JS (0 = domingo). */
const SEG_A_DOM: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0]

/** Quantos dias à frente ainda vale desenhar slot vazio. */
const JANELA_DE_SLOTS = 14

type Modo = "mes" | "semana"

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const hojeIso = () => iso(new Date())

/** O dia em São Paulo de um timestamp — o post é da conta, não do navegador. */
function diaSp(isoTs: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoTs))
}

const horaDe = (isoTs: string): string =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(isoTs))

function gradeDoMes(ano: number, mes: number): string[] {
  const primeiro = new Date(ano, mes, 1)
  const offset = (primeiro.getDay() + 6) % 7
  const inicio = new Date(ano, mes, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => iso(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)))
}

function gradeDaSemana(base: string): string[] {
  const [a, m, d] = base.split("-").map(Number)
  const dt = new Date(a, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => iso(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + i)))
}

// ── Item do dia ────────────────────────────────────────────────────────

type StatusItem = "publicado" | "agendado" | "pronto" | "rascunho" | "ideia" | "producao"

const STATUS: Record<StatusItem, { label: string; cor: string }> = {
  publicado: { label: "Publicado", cor: "var(--ops-pos)" },
  agendado: { label: "Agendado", cor: "var(--ops-warn)" },
  pronto: { label: "Pronto", cor: "#2563EB" },
  producao: { label: "Em produção", cor: "#2563EB" },
  rascunho: { label: "Rascunho", cor: "var(--ops-mut)" },
  ideia: { label: "Ideia", cor: "#7C3AED" },
}

/** Legenda: `producao` e `pronto` compartilham a cor, então mostra-se um só. */
const LEGENDA: StatusItem[] = ["publicado", "agendado", "pronto", "rascunho", "ideia"]

interface Item {
  chave: string
  dia: string
  hora: string | null
  titulo: string
  status: StatusItem
  perfil: string | null
  thumb?: string | null
  /** Para onde o clique leva; sem link, abre o drawer do post. */
  href?: string
  externo?: boolean
  postId?: string
  origem: "post" | "documento" | "reel"
}

function Pilula({ item, cor, compacto }: { item: Item; cor: string | null; compacto?: boolean }) {
  const st = STATUS[item.status]
  return (
    <span className={cn("flex w-full items-center gap-1 overflow-hidden rounded-[5px] bg-[var(--ops-hover)] px-1 py-[3px] text-[9.5px]", compacto ? "" : "py-1 text-[10.5px]")}>
      {/* Barra da cor do PERFIL à esquerda e ponto do STATUS à direita: são
          duas perguntas diferentes (de quem é / em que pé está) e misturá-las
          numa cor só deixa o operador sem uma das duas. */}
      <span className="h-[11px] w-[2px] shrink-0 rounded-full" style={{ background: cor ?? "var(--ops-mut)" }} />
      {item.hora && (
        <span className="shrink-0 font-semibold text-[var(--ops-sec)]" style={TNUM}>
          {item.hora}
        </span>
      )}
      {item.thumb !== undefined && item.thumb !== null && <CtThumbPost src={item.thumb} className="h-[13px] w-[13px] shrink-0 rounded-[3px]" />}
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--ops-title)]">{item.titulo}</span>
      <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: st.cor }} title={st.label} />
    </span>
  )
}

// ── Cadência (o que gera os slots) ─────────────────────────────────────

function CadenciaEditor({ perfis, onSalvo }: { perfis: Perfil[]; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const alternarDia = async (p: Perfil, dia: DiaSemana) => {
    const atuais = p.cadenciaDias.length ? p.cadenciaDias : cadenciaEfetiva({ perfil: p.id, metaSemanal: p.metaSemanal, dias: [], hora: p.cadenciaHora }).dias
    const novos = atuais.includes(dia) ? atuais.filter((d) => d !== dia) : [...atuais, dia]
    setSalvando(p.id)
    setErro(null)
    try {
      await setCadencia(p.id, { dias: novos })
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a cadência")
    } finally {
      setSalvando(null)
    }
  }

  const mudarHora = async (p: Perfil, hora: string) => {
    setSalvando(p.id)
    setErro(null)
    try {
      await setCadencia(p.id, { hora: hora || null })
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o horário")
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {erro && <div className="text-[11px] text-[var(--ops-neg)]">{erro}</div>}
      {perfis.map((p) => {
        const c = cadenciaEfetiva({ perfil: p.id, metaSemanal: p.metaSemanal, dias: p.cadenciaDias, hora: p.cadenciaHora })
        return (
          <div key={p.id} className={cn("flex flex-col gap-2", salvando === p.id && "opacity-60")}>
            <div className="flex items-center gap-2">
              <CtAvatar perfil={p} size={22} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--ops-title)]">{p.nome}</span>
              <input
                type="time"
                value={c.hora}
                onChange={(e) => mudarHora(p, e.target.value)}
                className="h-[26px] rounded-md border border-[var(--ops-border)] bg-[var(--ops-page)] px-1.5 text-[11px] text-[var(--ops-title)] outline-none"
                aria-label={`Horário do slot de ${p.nome}`}
              />
            </div>
            <div className="flex items-center gap-1">
              {SEG_A_DOM.map((dow, i) => {
                const on = c.dias.includes(dow)
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => alternarDia(p, dow)}
                    disabled={salvando === p.id}
                    title={`${DIAS_LONGOS[i]} — ${on ? "publica" : "não publica"}`}
                    className={cn(
                      "h-[24px] flex-1 rounded-md border text-[10px] font-semibold transition-colors",
                      on
                        ? c.origem === "definida"
                          ? "border-transparent bg-[var(--ops-accent)] text-[var(--ops-on-accent)]"
                          : "border-dashed border-[var(--ops-accent)] text-[var(--ops-accent)]"
                        : "border-[var(--ops-border)] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)]",
                    )}
                  >
                    {DIAS[i].slice(0, 1).toUpperCase()}
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] leading-relaxed text-[var(--ops-mut)]">
              {c.origem === "definida"
                ? `Definida: ${c.dias.length} dia${c.dias.length === 1 ? "" : "s"} por semana às ${c.hora}.`
                : `Sugerida pela meta de ${p.metaSemanal}/semana — clique nos dias para fixar a cadência.`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────

export function CalendarioConteudo() {
  const hoje = hojeIso()
  const [modo, setModo] = useState<Modo>("mes")
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })
  const [selecionado, setSelecionado] = useState<string>(hoje)
  const [perfilFiltro, setPerfilFiltro] = useState<PerfilFiltro>(PERFIL_CONSOLIDADO)
  const [postAberto, setPostAberto] = useState<string | null>(null)
  const [ajustarCadencia, setAjustarCadencia] = useState(false)

  const dias = useMemo(() => (modo === "mes" ? gradeDoMes(cursor.ano, cursor.mes) : gradeDaSemana(selecionado)), [modo, cursor, selecionado])
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
  // Os reels vêm inteiros (são poucos) e são filtrados por data aqui: a rota
  // do pipeline não tem recorte de período, e criar um só para o calendário
  // seria um segundo dono da mesma leitura.
  const { data: reelsData, mutate: mutarReels } = useSWR<{ reels: Reel[]; progresso: ProgressoFunil[] }>("conteudo-reels", () => getReels(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const perfis = useMemo(() => dash?.perfis ?? [], [dash])
  const perfilDe = (id: string | null) => perfis.find((p) => p.id === id)
  const carregando = carregandoAgenda || carregandoDash

  /** Todos os itens com data, já filtrados pelo perfil escolhido. */
  const itens = useMemo<Item[]>(() => {
    const so = (perfil: string | null) => perfilFiltro === PERFIL_CONSOLIDADO || perfil === perfilFiltro
    const saida: Item[] = []

    for (const p of dash?.posts ?? []) {
      if (!so(p.perfil)) continue
      saida.push({
        chave: `post:${p.id}`,
        dia: diaSp(p.publicadoEm),
        hora: horaDe(p.publicadoEm),
        titulo: p.head,
        status: "publicado",
        perfil: p.perfil,
        thumb: p.thumb,
        postId: p.id,
        origem: "post",
      })
    }

    for (const a of agenda ?? []) {
      if (!so(a.perfil)) continue
      saida.push({
        chave: `doc:${a.id}`,
        dia: a.data,
        hora: a.hora,
        titulo: a.nome,
        status: a.status === "publicado" ? "publicado" : a.status === "agendado" ? "agendado" : a.status === "pronto" ? "pronto" : "rascunho",
        perfil: a.perfil,
        href: ROUTES.ADMIN.CONTEUDO.ESTUDIO_DOC(a.documentoId),
        origem: "documento",
      })
    }

    // O post da conta vence o card do pipeline quando são a MESMA
    // publicação: senão o dia 8 mostra "Quem compra 3x vale 8x" duas vezes
    // e o contador de publicados conta em dobro.
    const jaPublicados = new Set((dash?.posts ?? []).map((p) => p.id))
    for (const r of reelsData?.reels ?? []) {
      const quando = r.publicadoEm ?? r.agendadoPara
      if (!quando) continue
      if (r.igMediaId && jaPublicados.has(r.igMediaId)) continue
      if (!so(r.canalId)) continue
      saida.push({
        chave: `reel:${r.id}`,
        dia: diaSp(quando),
        hora: horaDe(quando),
        titulo: r.titulo,
        status: statusNoCalendario(r.etapa),
        perfil: r.canalId,
        href: ROUTES.ADMIN.CONTEUDO.REELS,
        origem: "reel",
      })
    }

    return saida.sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""))
  }, [dash, agenda, reelsData, perfilFiltro])

  const porDia = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of itens) {
      const l = m.get(i.dia) ?? []
      l.push(i)
      m.set(i.dia, l)
    }
    return m
  }, [itens])

  /** Ocupação = quem já tem QUALQUER coisa no dia; é o que apaga o slot. */
  const ocupacao = useMemo<OcupacaoDoDia>(() => {
    const o: OcupacaoDoDia = {}
    for (const i of itens) {
      if (!i.perfil) continue
      o[i.dia] = [...(o[i.dia] ?? []), i.perfil]
    }
    return o
  }, [itens])

  const cadencias = useMemo(
    () =>
      perfis
        .filter((p) => p.ativo && (perfilFiltro === PERFIL_CONSOLIDADO || p.id === perfilFiltro))
        .map((p) => cadenciaEfetiva({ perfil: p.id, metaSemanal: p.metaSemanal, dias: p.cadenciaDias, hora: p.cadenciaHora })),
    [perfis, perfilFiltro],
  )

  // Slot só nas próximas duas semanas: mais adiante que isso ele não é
  // convite, é ruído — o mês inteiro tracejado esconde os dias que têm algo.
  const limiteSlot = useMemo(() => {
    const d = new Date(`${hoje}T12:00:00`)
    d.setDate(d.getDate() + JANELA_DE_SLOTS)
    return iso(d)
  }, [hoje])
  const slots = useMemo(
    () => slotsVazios({ dias: dias.filter((d) => d <= limiteSlot), cadencias, ocupacao, hoje }),
    [dias, limiteSlot, cadencias, ocupacao, hoje],
  )
  const slotsPorDia = useMemo(() => {
    const m = new Map<string, SlotVazio[]>()
    for (const s of slots) m.set(s.dia, [...(m.get(s.dia) ?? []), s])
    return m
  }, [slots])

  // Os slots da grade cobrem só a janela desenhada; o KPI de 7 dias precisa
  // da janela DELE, senão vira em todo dia 25 do mês.
  const slots7d = useMemo(() => {
    const proximos = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(`${hoje}T12:00:00`)
      d.setDate(d.getDate() + i)
      return iso(d)
    })
    return slotsNaJanela(slotsVazios({ dias: proximos, cadencias, ocupacao, hoje }), hoje, 7)
  }, [cadencias, ocupacao, hoje])

  const noMes = (d: string) => Number(d.slice(5, 7)) - 1 === cursor.mes
  const mover = (delta: number) => {
    if (modo === "mes") {
      const d = new Date(cursor.ano, cursor.mes + delta, 1)
      setCursor({ ano: d.getFullYear(), mes: d.getMonth() })
      return
    }
    const [a, m, dd] = selecionado.split("-").map(Number)
    const base = new Date(a, (m ?? 1) - 1, dd ?? 1)
    base.setDate(base.getDate() + delta * 7)
    setSelecionado(iso(base))
    setCursor({ ano: base.getFullYear(), mes: base.getMonth() })
  }

  const doDia = porDia.get(selecionado) ?? []
  const slotsDoDia = slotsPorDia.get(selecionado) ?? []
  const erro = (erroAgenda ?? erroDash) as Error | undefined
  const publicadosNaJanela = itens.filter((i) => i.status === "publicado" && (modo === "semana" || noMes(i.dia))).length
  const agendadosNaJanela = itens.filter((i) => i.status === "agendado" && (modo === "semana" || noMes(i.dia))).length
  const recarregar = () => {
    void mutarAgenda()
    void mutarDash()
    void mutarReels()
  }

  return (
    <div className="-m-4 flex min-h-[100dvh] min-w-0 md:-m-6 lg:-m-8">
      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
          {/* cabeçalho */}
          <div className="flex flex-wrap items-end gap-3.5">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Calendário</h1>
              <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">Publicado, agendado e os buracos da cadência</div>
            </div>
            <div className="flex-1" />
            <CtSeg<PerfilFiltro>
              val={perfilFiltro}
              onChange={setPerfilFiltro}
              size="sm"
              opts={[[PERFIL_CONSOLIDADO, "Todos"] as [PerfilFiltro, string], ...perfis.filter((p) => p.ativo).map((p) => [p.id, p.nome] as [PerfilFiltro, string])]}
            />
            <CtSeg<Modo>
              val={modo}
              onChange={setModo}
              size="sm"
              opts={[
                ["mes", "Mês"],
                ["semana", "Semana"],
              ]}
            />
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
                <Icon icon={ChevronLeft} customSize={14} />
              </button>
              <span className="min-w-[150px] text-center text-[13px] font-semibold text-[var(--ops-title)] first-letter:uppercase">
                {modo === "mes" ? `${MESES[cursor.mes]} de ${cursor.ano}` : `${Number(dias[0].slice(8, 10))}–${Number(dias[6].slice(8, 10))} de ${MESES[Number(dias[6].slice(5, 7)) - 1]}`}
              </span>
              <button type="button" onClick={() => mover(1)} aria-label="Próximo" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
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

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: modo === "mes" ? "Publicados no mês" : "Publicados na semana", valor: publicadosNaJanela, nota: "lidos da conta conectada" },
              { label: "Agendados", valor: agendadosNaJanela, nota: "carrossel do Estúdio e reel do pipeline" },
              { label: "Slots vazios · 7d", valor: slots7d, nota: cadencias.some((c) => c.origem === "definida") ? "pela cadência definida" : "sugeridos pela meta semanal" },
            ].map((k) => (
              <div key={k.label} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[15px]">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{k.label}</div>
                <div className="mt-1.5 text-[22px] font-semibold leading-none text-[var(--ops-title)]" style={TNUM}>
                  {carregando ? "—" : k.valor}
                </div>
                <div className="mt-1.5 text-[11px] text-[var(--ops-mut)]">{k.nota}</div>
              </div>
            ))}
          </div>

          {erro ? (
            <OpsCard>
              <CtEmpty
                icon={XCircle}
                title="Não foi possível carregar o calendário"
                desc={erro.message}
                action={
                  <div className="mt-2">
                    <CtBtn kind="primary" icon={RefreshCw} onClick={recarregar}>
                      Tentar novamente
                    </CtBtn>
                  </div>
                }
              />
            </OpsCard>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
              <div className="flex flex-col gap-3">
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
                      const doDiaAqui = porDia.get(d) ?? []
                      const slotsAqui = slotsPorDia.get(d) ?? []
                      const on = selecionado === d
                      const eHoje = d === hoje
                      const teto = modo === "mes" ? 3 : 8
                      const sobra = doDiaAqui.length + slotsAqui.length - teto
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelecionado(d)}
                          className={cn(
                            "flex flex-col items-start gap-1 border-b border-r border-[var(--ops-border)] p-1.5 text-left transition-colors hover:bg-[var(--ops-hover)]",
                            modo === "mes" ? "min-h-[92px]" : "min-h-[260px]",
                            i % 7 === 6 && "border-r-0",
                            modo === "mes" && i >= 35 && "border-b-0",
                            modo === "semana" && "border-b-0",
                            modo === "mes" && !noMes(d) && "opacity-40",
                            on && "bg-[var(--ops-hover)] ring-1 ring-inset ring-[var(--ops-accent)]",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[11px]",
                              eHoje ? "bg-[var(--ops-accent)] font-bold text-[var(--ops-on-accent)]" : "font-semibold text-[var(--ops-title)]",
                            )}
                            style={TNUM}
                          >
                            {Number(d.slice(8, 10))}
                          </span>
                          {carregando && doDiaAqui.length === 0 ? null : (
                            <span className="flex w-full flex-col gap-1">
                              {doDiaAqui.slice(0, teto).map((it) => (
                                <Pilula key={it.chave} item={it} cor={perfilDe(it.perfil)?.cor ?? null} compacto={modo === "mes"} />
                              ))}
                              {slotsAqui.slice(0, Math.max(0, teto - doDiaAqui.length)).map((s, j) => (
                                <span
                                  key={`${s.dia}:${s.perfil}:${j}`}
                                  className="flex w-full items-center gap-1 overflow-hidden rounded-[5px] border border-dashed border-[var(--ops-border)] px-1 py-[3px] text-[9.5px] text-[var(--ops-mut)]"
                                  title={s.origem === "definida" ? "A cadência deste perfil pede post neste dia" : "Sugerido pela meta semanal — a cadência ainda não foi definida"}
                                >
                                  <span className="shrink-0 font-semibold" style={TNUM}>
                                    {s.hora}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">slot {s.origem === "sugerida" ? "sugerido" : "livre"} · criar</span>
                                </span>
                              ))}
                              {sobra > 0 && <span className="px-1 text-[9.5px] text-[var(--ops-mut)]">+{sobra}</span>}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </OpsCard>

                {/* legenda */}
                <div className="flex flex-wrap items-center gap-3 px-1">
                  {LEGENDA.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--ops-sec)]">
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS[s].cor }} />
                      {STATUS[s].label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--ops-sec)]">
                    <span className="h-[9px] w-[14px] rounded-[3px] border border-dashed border-[var(--ops-border)]" />
                    Slot vazio
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <OpsCard
                  title={new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                  hint={doDia.length + slotsDoDia.length === 0 ? "nada neste dia" : `${doDia.length} ${doDia.length === 1 ? "item" : "itens"}${slotsDoDia.length ? ` · ${slotsDoDia.length} slot${slotsDoDia.length === 1 ? "" : "s"}` : ""}`}
                >
                  {carregando ? (
                    <div className="flex flex-col gap-2">
                      {[1, 2, 3].map((i) => (
                        <CtSkel key={i} h={40} />
                      ))}
                    </div>
                  ) : doDia.length === 0 && slotsDoDia.length === 0 ? (
                    <CtEmpty icon={CalendarDays} title="Nada neste dia" desc="Agende um carrossel pelo Estúdio (Exportar → Enviar para o calendário) ou marque a data de um reel no pipeline." className="py-6" />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {doDia.map((it) => {
                        const st = STATUS[it.status]
                        const corpo = (
                          <>
                            {it.origem === "post" ? (
                              <CtThumbPost src={it.thumb} className="h-[38px] w-[30px] shrink-0 rounded-[5px]" />
                            ) : (
                              <span className="flex h-[38px] w-[30px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--ops-track)] text-[var(--ops-mut)]">
                                <Icon icon={it.origem === "reel" ? Film : CalendarDays} customSize={13} />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{it.titulo}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--ops-mut)]">
                                <span className="inline-flex items-center gap-1">
                                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: st.cor }} />
                                  {st.label}
                                </span>
                                {it.hora && <span style={TNUM}>{it.hora}</span>}
                                <span className="truncate">{perfilDe(it.perfil)?.nome ?? "sem perfil"}</span>
                              </span>
                            </span>
                            {it.origem === "documento" && (
                              <span className="flex shrink-0 text-[var(--ops-mut)]">
                                <Icon icon={ExternalLink} customSize={12} />
                              </span>
                            )}
                          </>
                        )
                        const cls = "flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2 text-left hover:bg-[var(--ops-hover)]"
                        if (it.postId) {
                          return (
                            <button key={it.chave} type="button" className={cls} onClick={() => setPostAberto(it.postId ?? null)}>
                              {corpo}
                            </button>
                          )
                        }
                        return (
                          <Link key={it.chave} href={it.href ?? "#"} className={cls}>
                            {corpo}
                          </Link>
                        )
                      })}

                      {slotsDoDia.map((s, j) => (
                        <Link
                          key={`slot:${s.dia}:${s.perfil}:${j}`}
                          href={`${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=template&perfil=${s.perfil}`}
                          className="flex items-center gap-2.5 rounded-[9px] border border-dashed border-[var(--ops-border)] px-2.5 py-2 hover:bg-[var(--ops-hover)]"
                        >
                          <span className="flex h-[38px] w-[30px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[var(--ops-border)] text-[var(--ops-mut)]">
                            <Icon icon={Plus} customSize={13} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">Slot livre às {s.hora}</span>
                            <span className="block text-[10.5px] text-[var(--ops-mut)]">
                              {perfilDe(s.perfil)?.nome ?? "perfil"} · {s.origem === "definida" ? "cadência definida" : "sugerido pela meta"}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </OpsCard>

                <OpsCard
                  title="Cadência"
                  hint="o que gera os slots"
                  right={
                    <button
                      type="button"
                      onClick={() => setAjustarCadencia((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ops-accent)] hover:underline"
                    >
                      <Icon icon={ajustarCadencia ? Check : Settings2} customSize={11} />
                      {ajustarCadencia ? "Pronto" : "Ajustar"}
                    </button>
                  }
                >
                  {carregando || !dash ? (
                    <CtSkel h={120} r={8} />
                  ) : perfis.length === 0 ? (
                    <CtEmpty title="Nenhum perfil conectado" desc="Conecte um canal Instagram para acompanhar a cadência." className="py-6" />
                  ) : ajustarCadencia ? (
                    <CadenciaEditor perfis={perfis.filter((p) => p.ativo)} onSalvo={recarregar} />
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {dash.cadencia.map((c) => {
                        const pf = perfilDe(c.perfil)
                        const cor = c.meta > 0 && c.feitos >= c.meta ? "var(--ops-pos)" : c.feitos === 0 ? "var(--ops-neg)" : "var(--ops-warn)"
                        const ef = pf ? cadenciaEfetiva({ perfil: pf.id, metaSemanal: pf.metaSemanal, dias: pf.cadenciaDias, hora: pf.cadenciaHora }) : null
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
                              {ef && (
                                <div className="mt-1 text-[10px] text-[var(--ops-mut)]">
                                  {ef.dias.length === 0
                                    ? "sem dias de publicação"
                                    : `${ef.dias.map((d) => DIAS[SEG_A_DOM.indexOf(d)]).join(", ")} às ${ef.hora}${ef.origem === "sugerida" ? " (sugerido)" : ""}`}
                                </div>
                              )}
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

          <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-4 py-3 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">
            O ponto colorido é o STATUS e a barrinha à esquerda é o PERFIL. Slot tracejado é dia em que a cadência pede post e não há nada — quando ninguém definiu os dias, ele é derivado da meta semanal e aparece como &quot;sugerido&quot;. A publicação continua sendo feita no app do Instagram; aqui fica a cadência e o estado de cada peça.
          </div>

          {(dash?.posts.length ?? 0) === 0 && !carregando && (
            <div className="flex items-center gap-1.5 px-1 text-[10.5px] text-[var(--ops-mut)]">
              <Icon icon={RefreshCw} customSize={11} />
              Nenhum post publicado nesta janela. {fmtNum(itens.length)} item{itens.length === 1 ? "" : "s"} no total.
            </div>
          )}
        </div>
      </div>

      <PostDrawer
        post={dash?.posts.find((p) => p.id === postAberto) ?? null}
        perfil={perfilDe(dash?.posts.find((p) => p.id === postAberto)?.perfil ?? null)}
        onClose={() => setPostAberto(null)}
        onClassificado={() => void mutarDash()}
      />
    </div>
  )
}
