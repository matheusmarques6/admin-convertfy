"use client"

/**
 * Pipeline de Reels — design set/2026 (Claude Design).
 *
 * Cabeçalho → metas por funil (o que a SEMANA pede) → kanban de 6 etapas →
 * painel "Em alta" / "Planejar com IA".
 *
 * Duas coisas que o kanban não decide sozinho, e por isso moram em
 * `lib/conteudo/reels/pipeline.ts` (puro, testado):
 *
 * - **O progresso conta o que SAIU** (publicado ou agendado dentro da
 *   semana), nunca o backlog: card parado em "gravar" há três semanas não é
 *   publicação feita, e contá-lo faria a meta mentir na cara de quem cobra.
 * - **A posição é fracionária**: soltar entre dois cards grava o ponto
 *   médio, então mover um card não reescreve a coluna inteira.
 *
 * O arrasto é otimista com REVERT de verdade: em caso de falha a lista volta
 * ao que o servidor devolveu e o erro aparece — reverter em silêncio vira
 * "bug de drag".
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd"
import { AlertTriangle, Clock, Film, Instagram, Lightbulb, Plus, RefreshCw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { OpsCard } from "@/components/dashboard/ops/primitives"
import { criarReel, getReels, getTrends, patchReel } from "@/lib/conteudo/data"
import {
  ETAPAS,
  ETAPA_LABEL,
  FUNIL_LABEL,
  FUNIL_META,
  FUNIS,
  duracaoLabel,
  posicaoEntre,
  progressoDaSemana,
  type EtapaReel,
  type ProgressoFunil,
} from "@/lib/conteudo/reels/pipeline"
import type { EtapaFunil, Reel, Trend, TrendsStatus } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtBtn, CtEmpty, CtSkel, TNUM, alpha, inputCls, selectCls } from "../ui"
import { ReelDrawer } from "./reel-drawer"
import { TrendsPanel } from "./trends-panel"

// ── Card de meta por funil ─────────────────────────────────────────────

function MetaCard({ p }: { p: ProgressoFunil }) {
  const meta = FUNIL_META[p.funil]
  const pct = meta.meta > 0 ? Math.min(100, (p.feitos / meta.meta) * 100) : 0
  const fechado = p.feitos >= meta.meta
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[15px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: meta.cor }} />
            <span className="text-[12.5px] font-semibold text-[var(--ops-title)]">{meta.titulo}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ops-sec)]">{meta.descricao}</div>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn("text-[17px] font-semibold leading-none", fechado ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
            {p.feitos}/{meta.meta}
          </span>
          <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-mut)]">na semana</div>
        </div>
      </div>
      <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[var(--ops-track)]">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: fechado ? "var(--ops-pos)" : meta.cor }} />
      </div>
      <div className="mt-1.5 text-[10.5px] text-[var(--ops-mut)]">
        {p.emProducao === 0 ? "nada em produção" : `${p.emProducao} em produção`}
        {!fechado && p.emProducao > 0 && " · ainda não conta"}
      </div>
    </div>
  )
}

// ── Card do kanban ─────────────────────────────────────────────────────

function ReelCard({ r, onAbrir, arrastando }: { r: Reel; onAbrir: () => void; arrastando: boolean }) {
  const cor = FUNIL_META[r.funil].cor
  const dur = duracaoLabel(r.duracaoS)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onAbrir()
        }
      }}
      className={cn(
        "cursor-pointer rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-2.5 py-2.5 transition-shadow",
        arrastando ? "shadow-[0_8px_24px_rgba(0,0,0,0.16)]" : "hover:border-[var(--ops-accent)]/50",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[17px] items-center rounded-[4px] px-[6px] text-[9.5px] font-semibold" style={{ color: cor, background: alpha(cor, 0.12) }}>
          {FUNIL_LABEL[r.funil]}
        </span>
        {r.formato && <span className="truncate text-[9.5px] font-semibold text-[var(--ops-mut)]">{r.formato}</span>}
        <span className="flex-1" />
        {r.score != null && (
          <span className="text-[10.5px] font-semibold text-[var(--ops-pos)]" style={TNUM}>
            {r.score}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold leading-snug text-[var(--ops-title)]">{r.titulo}</div>
      {r.tema && <div className="mt-1 truncate text-[10.5px] text-[var(--ops-sec)]">{r.tema}</div>}
      <div className="mt-2 flex items-center gap-2">
        {dur && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ops-mut)]" style={TNUM}>
            <Icon icon={Clock} customSize={9} />
            {dur}
          </span>
        )}
        {r.agendadoPara && (
          <span className="text-[10px] text-[var(--ops-mut)]" style={TNUM}>
            {new Date(r.agendadoPara).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
            {new Date(r.agendadoPara).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span className="flex-1" />
        {r.responsavelNome && (
          <span title={r.responsavelNome}>
            <CtAvatar perfil={{ nome: r.responsavelNome, handle: null, cor, avatar: null }} size={18} />
          </span>
        )}
      </div>
    </div>
  )
}

// ── Modal "Nova ideia" (card direto no pipeline) ───────────────────────

function NovoCardModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [titulo, setTitulo] = useState("")
  const [funil, setFunil] = useState<EtapaFunil>("topo")
  const [etapa, setEtapa] = useState<EtapaReel>("ideias")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await criarReel({ titulo: titulo.trim(), funil, etapa })
      onCriado()
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar")
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal onClick={onFechar}>
      <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-[var(--ops-title)]">Novo card no pipeline</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">
          Para pautas com score e voto do time, use o{" "}
          <Link href={ROUTES.ADMIN.CONTEUDO.IDEIAS} className="font-semibold text-[var(--ops-accent)] hover:underline">
            Banco de Ideias
          </Link>
          . Aqui é o card direto, para o que já está decidido.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ops-mut)]">Título</div>
            <input
              className={inputCls}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="O cliente que compra 3x vale 8x"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && titulo.trim().length >= 3 && !salvando && salvar()}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ops-mut)]">Funil</div>
              <select className={selectCls} value={funil} onChange={(e) => setFunil(e.target.value as EtapaFunil)}>
                {FUNIS.map((f) => (
                  <option key={f} value={f}>
                    {FUNIL_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ops-mut)]">Etapa</div>
              <select className={selectCls} value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaReel)}>
                {ETAPAS.map((et) => (
                  <option key={et} value={et}>
                    {ETAPA_LABEL[et]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {erro && <div className="text-[11px] text-[var(--ops-neg)]">{erro}</div>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <CtBtn kind="ghost" onClick={onFechar}>
            Cancelar
          </CtBtn>
          <CtBtn kind="primary" onClick={salvar} disabled={salvando || titulo.trim().length < 3}>
            {salvando ? "Criando…" : "Criar card"}
          </CtBtn>
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────

export function ReelsPipeline() {
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [otimista, setOtimista] = useState<Reel[] | null>(null)
  const [erroMove, setErroMove] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ reels: Reel[]; progresso: ProgressoFunil[] }>("conteudo-reels", () => getReels(), {
    revalidateOnFocus: false,
  })
  const trendsSwr = useSWR<{ trends: Trend[]; status: TrendsStatus }>("conteudo-trends", () => getTrends(), { revalidateOnFocus: false })

  // useMemo porque `porEtapa` depende dela: sem isso o array nasce novo a
  // cada render e o kanban inteiro reagrupa a cada tecla em qualquer campo.
  const reels = useMemo(() => otimista ?? data?.reels ?? [], [otimista, data])
  // O progresso acompanha o arrasto: soltar em "agendado" tem de mexer a
  // barra na hora, senão parece que a meta ignorou o que acabou de mudar.
  const progresso = otimista ? progressoDaSemana(otimista) : (data?.progresso ?? [])

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaReel, Reel[]>()
    for (const et of ETAPAS) m.set(et, [])
    for (const r of reels) m.get(r.etapa)?.push(r)
    for (const et of ETAPAS) m.get(et)?.sort((a, b) => a.posicao - b.posicao || (a.criadoEm < b.criadoEm ? 1 : -1))
    return m
  }, [reels])

  const onDragEnd = async (res: DropResult) => {
    const { destination, source, draggableId } = res
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const destino = destination.droppableId as EtapaReel
    const atual = reels.find((r) => r.id === draggableId)
    if (!atual) return

    // A coluna de destino SEM o card movido — é entre esses vizinhos que a
    // posição fracionária é calculada.
    const coluna = (porEtapa.get(destino) ?? []).filter((r) => r.id !== draggableId)
    const antes = destination.index > 0 ? (coluna[destination.index - 1]?.posicao ?? null) : null
    const depois = coluna[destination.index]?.posicao ?? null
    const posicao = posicaoEntre(antes, depois)

    const antesDoMove = data?.reels ?? reels
    // Cópia — nunca mutar o objeto do SWR: o revert devolveria o objeto já
    // alterado e o card ficaria preso na coluna errada.
    setOtimista(
      reels.map((r) =>
        r.id === draggableId
          ? { ...r, etapa: destino, posicao, publicadoEm: destino === "publicado" ? (r.publicadoEm ?? new Date().toISOString()) : r.etapa === "publicado" ? null : r.publicadoEm }
          : r,
      ),
    )
    setErroMove(null)
    try {
      await patchReel(draggableId, { etapa: destino, posicao })
      const novoDado = await getReels()
      await mutate(novoDado, { revalidate: false })
      setOtimista(null)
    } catch (e) {
      setErroMove(e instanceof Error ? e.message : "Falha ao mover o card")
      // Volta ao estado anterior NA HORA e só então solta o otimista: sem o
      // `await`, limpar antes da revalidação faria o card piscar de volta na
      // coluna errada até o dado novo chegar.
      setOtimista(antesDoMove)
      await mutate()
      setOtimista(null)
    }
  }

  const recarregar = () => {
    setOtimista(null)
    mutate()
    trendsSwr.mutate()
  }

  const carregando = isLoading && !data

  return (
    <div className="-m-4 flex min-h-[100dvh] min-w-0 md:-m-6 lg:-m-8">
      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1520px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
          {/* cabeçalho */}
          <div className="flex flex-wrap items-end gap-3.5">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Reels</h1>
              <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">Da ideia ao publicado, com a meta da semana por funil</div>
            </div>
            <div className="flex-1" />
            <CtBtn kind="secondary" icon={RefreshCw} onClick={recarregar}>
              Atualizar
            </CtBtn>
            <CtBtn kind="primary" icon={Plus} onClick={() => setNovo(true)}>
              Novo card
            </CtBtn>
          </div>

          {erroMove && (
            <div className="flex gap-2 rounded-lg border border-[var(--ops-neg)]/40 bg-[var(--ops-hover)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-neg)]">
              <Icon icon={AlertTriangle} customSize={13} className="mt-0.5 shrink-0" />
              <span>{erroMove}</span>
            </div>
          )}

          {error ? (
            <OpsCard>
              <CtEmpty
                icon={XCircle}
                title="Não foi possível carregar o pipeline"
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
          ) : (
            <>
              {/* metas por funil */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {carregando
                  ? FUNIS.map((f) => (
                      <div key={f} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[18px] py-[15px]">
                        <CtSkel h={12} w="55%" />
                        <div className="h-3" />
                        <CtSkel h={5} w="100%" />
                      </div>
                    ))
                  : (progresso.length ? progresso : FUNIS.map((f) => ({ funil: f, feitos: 0, meta: FUNIL_META[f].meta, emProducao: 0 }))).map((p) => <MetaCard key={p.funil} p={p} />)}
              </div>

              <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                {/* kanban */}
                <div className="min-w-0 flex-1">
                  {carregando ? (
                    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
                      {ETAPAS.map((et) => (
                        <div key={et} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-2.5">
                          <CtSkel h={10} w="60%" />
                          <div className="h-3" />
                          <CtSkel h={56} w="100%" r={9} />
                        </div>
                      ))}
                    </div>
                  ) : reels.length === 0 ? (
                    <OpsCard>
                      <CtEmpty
                        icon={Film}
                        title="Nenhum reel no pipeline"
                        desc="Cada card percorre ideia → roteiro → gravar → editar → agendado → publicado. Mande uma pauta do Banco de Ideias ou crie o card direto."
                        action={
                          <div className="mt-2 flex gap-2">
                            <Link
                              href={ROUTES.ADMIN.CONTEUDO.IDEIAS}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]"
                            >
                              <Icon icon={Lightbulb} customSize={13} />
                              Banco de Ideias
                            </Link>
                            <CtBtn kind="primary" icon={Plus} onClick={() => setNovo(true)}>
                              Novo card
                            </CtBtn>
                          </div>
                        }
                      />
                    </OpsCard>
                  ) : (
                    <DragDropContext onDragEnd={onDragEnd}>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {ETAPAS.map((et) => {
                          const cards = porEtapa.get(et) ?? []
                          return (
                            <Droppable droppableId={et} key={et}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.droppableProps}
                                  className={cn(
                                    "flex w-[196px] shrink-0 flex-col rounded-[10px] border border-[var(--ops-border)] p-2.5 transition-colors",
                                    snap.isDraggingOver ? "bg-[var(--ops-hover)]" : "bg-[var(--ops-card)]",
                                  )}
                                >
                                  <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{ETAPA_LABEL[et]}</span>
                                    <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--ops-track)] px-1 text-[9.5px] font-semibold text-[var(--ops-sec)]" style={TNUM}>
                                      {cards.length}
                                    </span>
                                  </div>
                                  <div className="flex min-h-[60px] flex-col gap-2">
                                    {cards.map((r, i) => (
                                      <Draggable draggableId={r.id} index={i} key={r.id}>
                                        {(dp, ds) => (
                                          <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                                            <ReelCard r={r} arrastando={ds.isDragging} onAbrir={() => setAberto(r.id)} />
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {prov.placeholder}
                                    {cards.length === 0 && !snap.isDraggingOver && (
                                      <div className="rounded-[9px] border border-dashed border-[var(--ops-border)] px-2 py-3 text-center text-[10px] text-[var(--ops-mut)]">vazio</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Droppable>
                          )
                        })}
                      </div>
                    </DragDropContext>
                  )}
                </div>

                <TrendsPanel
                  trends={trendsSwr.data?.trends ?? []}
                  status={trendsSwr.data?.status ?? null}
                  carregando={trendsSwr.isLoading && !trendsSwr.data}
                  progresso={progresso}
                  onMudou={recarregar}
                />
              </div>

              <div className="flex items-center gap-1.5 px-1 text-[10.5px] text-[var(--ops-mut)]">
                <Icon icon={Instagram} customSize={11} />
                A publicação acontece no app do Instagram; o pipeline organiza a produção e marca o que já saiu.
              </div>
            </>
          )}
        </div>
      </div>

      <ReelDrawer reel={reels.find((r) => r.id === aberto) ?? null} onClose={() => setAberto(null)} onMudou={recarregar} />
      {novo && <NovoCardModal onFechar={() => setNovo(false)} onCriado={recarregar} />}
    </div>
  )
}
