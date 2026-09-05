"use client"

/**
 * Biblioteca de transcrições.
 *
 * O que este arquivo garante:
 *  - Banco vazio mostra o estado vazio REAL com o campo de link no centro.
 *    Não existe card de exemplo em lugar nenhum.
 *  - Os contadores vêm da query (`count` do PostgREST), não do tamanho do
 *    array: com paginação, contar o array mentiria.
 *  - Realtime só das linhas em processamento; nada de recarregar a lista
 *    inteira de tempos em tempos.
 *  - Colunas medidas pelo CONTAINER (ResizeObserver + leitura síncrona no
 *    mount), não pela viewport — o rail de coleções muda a largura útil.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { FileText, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/client"
import { fmtDuracao, fmtDuracaoLonga } from "@/lib/transcricoes/pipeline"
import type { Plataforma, TranscricaoResumo } from "@/lib/transcricoes/types"
import {
  acaoEmLote,
  atualizarColecao,
  criarColecao,
  excluirColecao,
  getBiblioteca,
  queryString,
  semearEstrutura,
  type RespostaBiblioteca,
} from "@/lib/transcricoes/data"
import { ArvoreColecoes } from "./arvore-colecoes"
import { CardTranscricao } from "./card-transcricao"
import { ModalNova } from "./modal-nova"
import { IconePlataforma, TNUM, TrAviso, TrBtn, TrEmpty, TrSkel, TrThumb, selectCls } from "./ui"

const PLATAFORMAS: Array<[string, string]> = [
  ["", "Todas as plataformas"],
  ["youtube", "YouTube"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["upload", "Upload"],
]
const STATUS: Array<[string, string]> = [
  ["", "Todos os status"],
  ["pronta", "Prontas"],
  ["processando", "Processando"],
  ["aguardando", "Na fila"],
  ["erro", "Com erro"],
]
const ORDENS: Array<[string, string]> = [
  ["recentes", "Mais recentes"],
  ["antigas", "Mais antigas"],
  ["duracao", "Mais longas"],
  ["titulo", "Título"],
]

type Aba = "transcricoes" | "trechos"

export function Biblioteca({ inicial, orgId }: { inicial: RespostaBiblioteca; orgId: string }) {
  const router = useRouter()
  const params = useSearchParams()

  const [colecao, setColecao] = useState<string | null>(params.get("colecao") ?? null)
  const [termo, setTermo] = useState(params.get("q") ?? "")
  const [termoAtivo, setTermoAtivo] = useState(params.get("q") ?? "")
  const [plataforma, setPlataforma] = useState(params.get("plataforma") ?? "")
  const [status, setStatus] = useState(params.get("status") ?? "")
  const [ordem, setOrdem] = useState(params.get("ordem") ?? "recentes")
  const [pagina, setPagina] = useState(0)
  const [acumulado, setAcumulado] = useState<TranscricaoResumo[]>(inicial.pagina.itens)
  const [aba, setAba] = useState<Aba>(params.get("q") ? "trechos" : "transcricoes")
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [ultimoClicado, setUltimoClicado] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  /** Card sob o cursor de teclado (j/k). -1 = nenhum. */
  const [focado, setFocado] = useState(-1)
  const buscaRef = useRef<HTMLInputElement>(null)

  const q = useMemo(
    () => ({
      colecao,
      plataforma: (plataforma || null) as Plataforma | null,
      status: status || null,
      ordem,
      q: termoAtivo,
      pagina,
    }),
    [colecao, plataforma, status, ordem, termoAtivo, pagina],
  )

  const { data, error, isLoading, isValidating, mutate } = useSWR<RespostaBiblioteca>(
    ["transcricoes", q],
    () => getBiblioteca(q),
    {
      // A primeira página vem do servidor: a tela não pisca esqueleto no
      // primeiro paint (e não há waterfall de fetch no mount).
      fallbackData: pagina === 0 && !termoAtivo && !colecao && !plataforma && !status ? inicial : undefined,
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  )

  // Paginação acumulada: página > 0 acrescenta em vez de trocar.
  useEffect(() => {
    if (!data) return
    setAcumulado((ant) => (pagina === 0 ? data.pagina.itens : [...ant, ...data.pagina.itens.filter((n) => !ant.some((a) => a.id === n.id))]))
  }, [data, pagina])

  // Filtro mudou: volta para a primeira página. Sem isso, trocar de coleção
  // com a página 3 aberta mostraria "nada aqui" numa pasta cheia.
  useEffect(() => {
    setPagina(0)
    setSel(new Set())
  }, [colecao, plataforma, status, ordem, termoAtivo])

  // A URL carrega o recorte: recarregar a página não perde o filtro e o
  // link é compartilhável.
  useEffect(() => {
    const qs = queryString({ colecao, plataforma: (plataforma || null) as Plataforma | null, status: status || null, ordem: ordem === "recentes" ? undefined : ordem, q: termoAtivo })
    router.replace(qs ? `${ROUTES.ADMIN.TRANSCRICOES.LIST}?${qs}` : ROUTES.ADMIN.TRANSCRICOES.LIST, { scroll: false })
  }, [colecao, plataforma, status, ordem, termoAtivo, router])

  const itens = pagina === 0 ? data?.pagina.itens ?? acumulado : acumulado
  const arvore = data?.arvore ?? inicial.arvore
  const colecoes = data?.colecoes ?? inicial.colecoes
  const fila = data?.fila ?? inicial.fila
  const busca = data?.busca ?? inicial.busca
  const total = data?.pagina.total ?? inicial.pagina.total
  const duracaoTotal = data?.pagina.duracaoTotalSeg ?? inicial.pagina.duracaoTotalSeg
  const vazioDeVerdade = !isLoading && total === 0 && !termoAtivo && !plataforma && !status && !colecao

  // ── Realtime: só o que está em processamento ────────────────────────
  const emProcessamento = useMemo(() => itens.filter((t) => t.status === "processando" || t.status === "aguardando"), [itens])
  const temProcessando = emProcessamento.length > 0

  useEffect(() => {
    if (!temProcessando) return
    const sb = createClient()
    const canal = sb
      .channel(`transcricoes-biblioteca-${orgId}`)
      .on(
        "postgres_changes",
        // O filtro por org é obrigatório: sem ele o canal acorda com o
        // progresso de QUALQUER organização e a tela revalida à toa (foi o
        // incidente do inbox, documentado no CLAUDE.md).
        { event: "UPDATE", schema: "public", table: "transcricoes", filter: `org_id=eq.${orgId}` },
        () => {
          void mutate()
        },
      )
      .subscribe()
    return () => {
      void sb.removeChannel(canal)
    }
  }, [temProcessando, mutate, orgId])

  // ── Colunas pela largura do CONTAINER ───────────────────────────────
  const grade = useRef<HTMLDivElement>(null)
  const [colunas, setColunas] = useState(3)
  useLayoutEffect(() => {
    const el = grade.current
    if (!el) return
    const medir = (largura: number) => setColunas(largura < 560 ? 1 : largura < 900 ? 2 : largura < 1280 ? 3 : 4)
    // Leitura síncrona no mount: sem ela o primeiro frame sai com o número
    // errado de colunas e o layout pisca.
    medir(el.getBoundingClientRect().width)
    const obs = new ResizeObserver((entradas) => medir(entradas[0].contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Seleção ─────────────────────────────────────────────────────────
  const selecionar = useCallback(
    (id: string, comShift: boolean) => {
      setSel((s) => {
        const n = new Set(s)
        if (comShift && ultimoClicado) {
          const a = itens.findIndex((t) => t.id === ultimoClicado)
          const b = itens.findIndex((t) => t.id === id)
          if (a >= 0 && b >= 0) {
            // Shift só ADICIONA o intervalo: tirar o que já estava marcado
            // surpreende quem está montando a seleção aos poucos.
            for (const t of itens.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(t.id)
            return n
          }
        }
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
      setUltimoClicado(id)
    },
    [itens, ultimoClicado],
  )

  // Item que saiu do filtro não pode continuar na seleção: a ação em massa
  // acertaria transcrição fora da tela.
  const visiveis = useMemo(() => new Set(itens.map((t) => t.id)), [itens])
  const selecionados = useMemo(() => [...sel].filter((id) => visiveis.has(id)), [sel, visiveis])

  // ── Atalhos ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      // Nunca sequestrar tecla enquanto alguém digita.
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) {
        if (e.key === "Escape") alvo.blur()
        return
      }
      if (modalAberto) return
      if (e.key === "/") {
        e.preventDefault()
        buscaRef.current?.focus()
      } else if (e.key === "n") {
        e.preventDefault()
        setModalAberto(true)
      } else if (e.key === "j" || e.key === "k") {
        // Cursor de teclado pela lista: j desce, k sobe (padrão vim, o
        // mesmo do resto do admin).
        if (!itens.length) return
        e.preventDefault()
        setFocado((f) => {
          const proximo = e.key === "j" ? Math.min(itens.length - 1, f + 1) : Math.max(0, f <= 0 ? 0 : f - 1)
          document
            .querySelector<HTMLElement>(`[data-card="${itens[proximo]?.id}"]`)
            ?.scrollIntoView({ block: "nearest" })
          return proximo
        })
      } else if (e.key === "x") {
        if (focado < 0 || !itens[focado]) return
        e.preventDefault()
        selecionar(itens[focado].id, false)
      } else if (e.key === "Enter") {
        if (focado < 0 || !itens[focado]) return
        e.preventDefault()
        router.push(ROUTES.ADMIN.TRANSCRICOES.DETAIL(itens[focado].id))
      } else if (e.key === "Escape") {
        setSel(new Set())
        setFocado(-1)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault()
        setSel(new Set(itens.map((t) => t.id)))
      }
    }
    window.addEventListener("keydown", onTecla)
    return () => window.removeEventListener("keydown", onTecla)
  }, [itens, modalAberto, focado, selecionar, router])

  const comOcupado = async (fn: () => Promise<void>) => {
    setOcupado(true)
    setAviso(null)
    try {
      await fn()
      await mutate()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível concluir.")
    } finally {
      setOcupado(false)
    }
  }

  const moverPara = (colecaoId: string | null) => {
    // Arrastar um card que não está na seleção move só ele.
    const ids = arrastando && !selecionados.includes(arrastando) ? [arrastando] : selecionados
    if (!ids.length) return
    void comOcupado(async () => {
      const r = await acaoEmLote({ ids, acao: "mover", colecaoId })
      setSel(new Set())
      setAviso(`${r.afetados} ${r.afetados === 1 ? "transcrição movida" : "transcrições movidas"}.`)
    })
  }

  return (
    <div className="-m-4 flex min-h-[100dvh] md:-m-6 lg:-m-8">
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-[var(--ops-border)] bg-[var(--ops-card)] p-3 lg:flex">
        <ArvoreColecoes
          raizes={arvore.raizes}
          totalGeral={arvore.totalGeral}
          semColecao={arvore.semColecao}
          selecionada={colecao}
          onSelecionar={setColecao}
          arrastando={Boolean(arrastando)}
          onSoltar={moverPara}
          podeSemear={arvore.raizes.filter((r) => !r.reservada).length === 0}
          onSemear={() =>
            comOcupado(async () => {
              const r = await semearEstrutura()
              setAviso(`${r.criadas} coleções criadas.`)
            })
          }
          onCriar={(nome, paiId) => comOcupado(async () => void (await criarColecao({ nome, paiId })))}
          onFaisca={(id, ligar) =>
            comOcupado(async () => {
              const r = await atualizarColecao(id, { naBaseDeConhecimento: ligar })
              setAviso(
                ligar
                  ? r.enfileirados > 0
                    ? `Na base da ConvertIA. ${r.enfileirados} ${r.enfileirados === 1 ? "trecho entra" : "trechos entram"} na fila de indexação.`
                    : "Na base da ConvertIA."
                  : "Fora da base da ConvertIA. Os embeddings ficam guardados, religar é instantâneo.",
              )
            })
          }
          onExcluir={(id) =>
            comOcupado(async () => {
              await excluirColecao(id)
              if (colecao === id) setColecao(null)
              setAviso("Coleção excluída. O conteúdo foi para Não organizadas.")
            })
          }
        />
      </aside>

      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-6 pb-14 pt-7 md:px-8">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">
                Transcrições
              </h1>
              <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]" style={TNUM}>
                {total} {total === 1 ? "transcrição" : "transcrições"}
                {duracaoTotal != null && ` · ${fmtDuracaoLonga(duracaoTotal)} de conteúdo indexado`}
              </div>
            </div>
            <div className="flex-1" />
            <TrBtn kind="primary" icon={Plus} onClick={() => setModalAberto(true)}>
              Nova transcrição
            </TrBtn>
          </div>

          {aviso && <TrAviso>{aviso}</TrAviso>}

          {/* Busca */}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-[var(--ops-mut)]">
              <Icon icon={Search} customSize={14} />
            </span>
            <input
              ref={buscaRef}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setTermoAtivo(termo)
                  setAba(termo.trim() ? "trechos" : "transcricoes")
                }
                if (e.key === "Escape") {
                  setTermo("")
                  setTermoAtivo("")
                  setAba("transcricoes")
                  e.currentTarget.blur()
                }
              }}
              placeholder="Buscar em títulos e transcrições"
              aria-label="Buscar em títulos e transcrições"
              className="h-10 w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] pl-9 pr-12 text-[13px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--ops-border)] px-1.5 py-0.5 text-[10px] text-[var(--ops-mut)]">
              /
            </kbd>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} aria-label="Filtrar por plataforma" className={cn(selectCls, "w-auto")}>
              {PLATAFORMAS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status" className={cn(selectCls, "w-auto")}>
              {STATUS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar" className={cn(selectCls, "w-auto")}>
              {ORDENS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            {termoAtivo ? (
              <div className="flex items-center gap-1 rounded-lg border border-[var(--ops-border)] p-0.5">
                {(["trechos", "transcricoes"] as Aba[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAba(a)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      aba === a ? "bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "text-[var(--ops-sec)] hover:text-[var(--ops-title)]",
                    )}
                  >
                    {a === "trechos" ? `${busca.totalTrechos} trechos` : `${total} transcrições`}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[11.5px] text-[var(--ops-mut)]" style={TNUM}>
                {total} {total === 1 ? "transcrição" : "transcrições"}
              </span>
            )}
          </div>

          {termoAtivo && busca.semanticaIndisponivel && (
            <TrAviso>
              A busca por significado está indisponível (sem chave do OpenRouter). Os resultados abaixo são só os que
              batem com o termo exato.
            </TrAviso>
          )}

          {/* Conteúdo */}
          {error ? (
            <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
              <TrEmpty
                icon={XCircle}
                title="Não foi possível carregar a biblioteca"
                desc={error instanceof Error ? error.message : "A API não respondeu."}
                action={
                  <div className="mt-3">
                    <TrBtn kind="primary" icon={RefreshCw} onClick={() => void mutate()}>
                      Tentar de novo
                    </TrBtn>
                  </div>
                }
              />
            </div>
          ) : vazioDeVerdade ? (
            <VazioInicial onAbrir={() => setModalAberto(true)} />
          ) : termoAtivo && aba === "trechos" ? (
            <ListaTrechos busca={busca} />
          ) : (
            <>
              <div ref={grade} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
                {isLoading && itens.length === 0
                  ? Array.from({ length: colunas * 2 }, (_, i) => (
                      <div key={i} className="overflow-hidden rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
                        <TrSkel h={0} w="100%" r={0} className="aspect-video w-full" />
                        <div className="flex flex-col gap-2 p-3.5">
                          <TrSkel h={13} w="85%" />
                          <TrSkel h={11} w="55%" />
                        </div>
                      </div>
                    ))
                  : itens.map((t) => (
                      <CardTranscricao
                        key={t.id}
                        t={t}
                        focado={itens[focado]?.id === t.id}
                        selecionado={sel.has(t.id)}
                        emSelecao={selecionados.length > 0}
                        onSelecionar={selecionar}
                        onArrastar={setArrastando}
                        onFimArrasto={() => setArrastando(null)}
                      />
                    ))}
              </div>

              {itens.length === 0 && !isLoading && (
                <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
                  <TrEmpty
                    icon={FileText}
                    title="Nada com esses filtros"
                    desc="Ajuste a busca, a plataforma, o status ou a coleção."
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setTermo("")
                          setTermoAtivo("")
                          setPlataforma("")
                          setStatus("")
                          setColecao(null)
                        }}
                        className="mt-3 text-[12px] font-semibold text-[var(--ops-accent)] hover:underline"
                      >
                        Limpar filtros
                      </button>
                    }
                  />
                </div>
              )}

              {data?.pagina.temMais && (
                <div className="flex justify-center pt-1">
                  <TrBtn onClick={() => setPagina((p) => p + 1)} disabled={isValidating}>
                    {isValidating ? "Carregando…" : "Carregar mais"}
                  </TrBtn>
                </div>
              )}
            </>
          )}

          <Rodape fila={fila} atualizando={isValidating} />
        </div>
      </div>

      {selecionados.length > 0 && (
        <BarraLote
          quantidade={selecionados.length}
          colecoes={colecoes}
          ocupado={ocupado}
          onMover={(id) => moverPara(id)}
          onExcluir={() =>
            comOcupado(async () => {
              const r = await acaoEmLote({ ids: selecionados, acao: "excluir" })
              setSel(new Set())
              setAviso(`${r.afetados} ${r.afetados === 1 ? "transcrição excluída" : "transcrições excluídas"}.`)
            })
          }
          onLimpar={() => setSel(new Set())}
        />
      )}

      {modalAberto && (
        <ModalNova
          colecoes={colecoes}
          colecaoPadrao={colecao && colecao !== "sem-colecao" ? colecao : null}
          onFechar={() => setModalAberto(false)}
          onConcluir={() => {
            setModalAberto(false)
            setPagina(0)
            void mutate()
          }}
          onEnfileirouParcial={() => {
            setPagina(0)
            void mutate()
          }}
        />
      )}
    </div>
  )
}

// ── Estado vazio real ───────────────────────────────────────────────────

function VazioInicial({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-6 py-16">
      <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ops-tile)] text-[var(--ops-sec)]">
          <Icon icon={FileText} customSize={20} />
        </span>
        <h2 className="text-[16px] font-semibold text-[var(--ops-title)]">Nenhuma transcrição ainda</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ops-sec)]">
          Cole o link de uma aula, de um reel ou de uma call gravada. O texto fica pesquisável por timestamp, com os
          locutores separados, e as coleções marcadas com a faísca entram na base da ConvertIA.
        </p>
        <div className="mt-5">
          <TrBtn kind="primary" icon={Plus} onClick={onAbrir}>
            Nova transcrição
          </TrBtn>
        </div>
      </div>
    </div>
  )
}

// ── Trechos ─────────────────────────────────────────────────────────────

function ListaTrechos({ busca }: { busca: RespostaBiblioteca["busca"] }) {
  if (!busca.trechos.length) {
    return (
      <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
        <TrEmpty
          icon={Search}
          title="Nenhum trecho com esse termo"
          desc="A busca procura dentro das falas. Tente outra palavra, ou veja a aba de transcrições para buscar por título."
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {busca.trechos.map((t) => (
        <Link
          key={`${t.transcricaoId}-${t.s}-${t.origem}`}
          href={ROUTES.ADMIN.TRANSCRICOES.DETAIL_EM(t.transcricaoId, fmtDuracao(t.s))}
          className="flex gap-3 rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-3 transition-colors hover:border-[var(--ops-accent)]/40"
        >
          <TrThumb src={t.thumbUrl} className="h-[54px] w-24 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <IconePlataforma p={t.plataforma} size={12} />
              <span className="truncate text-[12.5px] font-semibold text-[var(--ops-title)]">{t.titulo}</span>
              <span className="shrink-0 rounded bg-[var(--ops-track)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--ops-text)]" style={TNUM}>
                {fmtDuracao(t.s)}
              </span>
              {t.origem === "semantica" && (
                <span title="Encontrado por significado, não pelo termo exato" className="shrink-0 text-[var(--ops-accent)]">
                  <Icon icon={Sparkles} customSize={11} />
                </span>
              )}
            </div>
            <p
              className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--ops-text)] [&_mark]:rounded [&_mark]:bg-[var(--ops-warn-bg)] [&_mark]:px-0.5 [&_mark]:text-[var(--ops-warn)]"
              // O destaque vem do ts_headline do Postgres, que só emite
              // <mark> — o texto ao redor já sai escapado dele.
              dangerouslySetInnerHTML={{ __html: t.trecho }}
            />
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Ações em massa ──────────────────────────────────────────────────────

function BarraLote({
  quantidade,
  colecoes,
  ocupado,
  onMover,
  onExcluir,
  onLimpar,
}: {
  quantidade: number
  colecoes: RespostaBiblioteca["colecoes"]
  ocupado: boolean
  onMover: (colecaoId: string | null) => void
  onExcluir: () => void
  onLimpar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
        <span className="text-[12px] font-semibold text-[var(--ops-title)]" style={TNUM}>
          {quantidade} {quantidade === 1 ? "selecionada" : "selecionadas"}
        </span>
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            e.currentTarget.value = ""
            onMover(v === "sem-colecao" ? null : v)
          }}
          disabled={ocupado}
          aria-label="Mover para coleção"
          className={cn(selectCls, "h-[30px] w-auto text-[11.5px]")}
        >
          <option value="" disabled>
            Mover para…
          </option>
          <option value="sem-colecao">Não organizadas</option>
          {colecoes
            .filter((c) => !c.reservada)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.paiId ? "— " : ""}
                {c.nome}
              </option>
            ))}
        </select>
        {confirmando ? (
          <>
            <span className="text-[11.5px] text-[var(--ops-neg)]">Excluir de vez, com a mídia?</span>
            <TrBtn kind="destrutivo" onClick={onExcluir} disabled={ocupado}>
              Excluir
            </TrBtn>
            <TrBtn onClick={() => setConfirmando(false)}>Cancelar</TrBtn>
          </>
        ) : (
          <TrBtn kind="destrutivo" icon={Trash2} onClick={() => setConfirmando(true)} disabled={ocupado}>
            Excluir
          </TrBtn>
        )}
        {ocupado && <Icon icon={Loader2} customSize={13} className="animate-spin text-[var(--ops-sec)]" />}
        <button type="button" onClick={onLimpar} className="text-[11.5px] font-semibold text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
          Limpar seleção
        </button>
      </div>
    </div>
  )
}

// ── Rodapé de sincronização ─────────────────────────────────────────────

function Rodape({ fila, atualizando }: { fila: RespostaBiblioteca["fila"]; atualizando: boolean }) {
  const hora = fila.sincronizadoEm
    ? new Date(fila.sincronizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ops-mut)]">
      {fila.workerOffline ? (
        // Heartbeat velho: dizer que o serviço pode estar fora é mais útil
        // que exibir um horário que não significa nada.
        <span className="text-[var(--ops-warn)]">
          O serviço de transcrição não responde
          {hora ? ` desde as ${hora}` : " (nunca reportou)"}. Novos itens ficam na fila até ele voltar.
        </span>
      ) : (
        <span style={TNUM}>
          Fila sincronizada às {hora}
          {fila.emProcessamento > 0 && ` · ${fila.emProcessamento} em processamento`}
        </span>
      )}
      {atualizando && <Icon icon={Loader2} customSize={11} className="animate-spin" />}
    </div>
  )
}
