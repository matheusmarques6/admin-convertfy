"use client"

/**
 * Detalhe da transcrição: player com marcadores de tópico, falas editáveis
 * e o painel de informações.
 *
 * O que este arquivo garante:
 *  - `?t=MM:SS` posiciona o player no segundo certo já na abertura, e o
 *    clique num timestamp move o player em vez de recarregar a rota.
 *  - Editar uma fala marca os chunks que a cobrem para reindexação; a tela
 *    diz quantos, porque a divergência com a base seria silenciosa.
 *  - O campo "Modelo" lê do banco. Nunca constante.
 *  - Nada de indicador de confiança: o provedor não devolve confiança por
 *    bloco, e um número inventado ali levaria a decidir com base nele.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/client"
import { fmtDuracao, rotuloDaEtapa, segmentosDaEtapa } from "@/lib/transcricoes/pipeline"
import { citacaoComTimestamp } from "@/lib/transcricoes/export"
import { comandoSeek, montarEmbed } from "@/lib/transcricoes/embed"
import { PLATAFORMA_LABEL, type Bloco, type TranscricaoDetalhe } from "@/lib/transcricoes/types"
import {
  atualizarTranscricao,
  excluirTranscricao,
  getTranscricao,
  renomearLocutor,
  reprocessar,
  salvarBloco,
  urlExport,
} from "@/lib/transcricoes/data"
import { BarraEtapas } from "./card-transcricao"
import {
  corLocutor,
  IconePlataforma,
  TNUM,
  TrAviso,
  TrBtn,
  TrChip,
  TrEmpty,
  TrLabel,
  inputCls,
  selectCls,
  textareaCls,
} from "./ui"

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2]

interface Props {
  inicial: TranscricaoDetalhe
  colecoes: Array<{ id: string; nome: string; paiId: string | null; reservada: "inbox" | null }>
  /** Posição inicial vinda do `?t=`. */
  inicioSeg: number | null
}

export function DetalheTranscricao({ inicial, colecoes, inicioSeg }: Props) {
  const router = useRouter()
  const [t, setT] = useState(inicial)
  const [tempo, setTempo] = useState(inicioSeg ?? 0)
  const [tocando, setTocando] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [filtro, setFiltro] = useState("")
  const [editando, setEditando] = useState<number | null>(null)
  const [rascunho, setRascunho] = useState("")
  const [salvandoBloco, setSalvandoBloco] = useState(false)
  const [renomeando, setRenomeando] = useState<number | null>(null)
  const [nomeNovo, setNomeNovo] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [tagNova, setTagNova] = useState("")
  const player = useRef<HTMLVideoElement>(null)
  const quadroEmbed = useRef<HTMLIFrameElement>(null)
  const listaFalas = useRef<HTMLDivElement>(null)

  const processando = t.status === "processando" || t.status === "aguardando"

  /**
   * O player da PLATAFORMA. A mídia é descartada quando a transcrição fica
   * pronta, então o embed é o que sobra para assistir — e é melhor assim:
   * o vídeo vem do CDN deles, não do nosso egress.
   */
  const embed = useMemo(
    () => montarEmbed(t.urlOriginal, t.plataforma, inicioSeg),
    [t.urlOriginal, t.plataforma, inicioSeg],
  )

  // Polling só enquanto processa — quando termina, para sozinho.
  useEffect(() => {
    if (!processando) return
    const sb = createClient()
    const canal = sb
      .channel(`transcricao-${t.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "transcricoes", filter: `id=eq.${t.id}` },
        () => {
          void getTranscricao(t.id).then(setT).catch(() => {})
        },
      )
      .subscribe()
    return () => {
      void sb.removeChannel(canal)
    }
  }, [processando, t.id])

  // Posição inicial do `?t=`: aplicada quando o player já tem metadados,
  // senão o navegador ignora o seek.
  useEffect(() => {
    const el = player.current
    if (!el || inicioSeg == null) return
    const aplicar = () => {
      el.currentTime = inicioSeg
    }
    if (el.readyState >= 1) aplicar()
    else el.addEventListener("loadedmetadata", aplicar, { once: true })
  }, [inicioSeg])

  /** Um só caminho para play/pause: o botão da barra e o clique no vídeo. */
  const alternarPlay = useCallback(() => {
    const el = player.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }, [])

  const irPara = useCallback(
    (seg: number) => {
      setTempo(seg)
      const el = player.current
      if (el) {
        el.currentTime = seg
        void el.play().then(() => setTocando(true)).catch(() => {})
      }

      // Embed que aceita tempo (só o YouTube): move o player que já está
      // tocando. Recarregar o src com `?start=` também pularia, mas custaria
      // um reload inteiro — anúncio e buffer — a cada clique num trecho.
      if (embed?.aceitaTempo) {
        try {
          quadroEmbed.current?.contentWindow?.postMessage(comandoSeek(seg), new URL(embed.url).origin)
        } catch {
          // Player ainda não carregou: o texto rola do mesmo jeito.
        }
      }

      // Sem player nenhum o clique ainda serve: rola a lista até a fala.
      const alvo = listaFalas.current?.querySelector<HTMLElement>(`[data-s="${Math.round(seg)}"]`)
      alvo?.scrollIntoView({ block: "center", behavior: "smooth" })
    },
    [embed],
  )

  const nomePorRotulo = useMemo(
    () => new Map(t.locutores.map((l) => [l.rotuloOriginal, l])),
    [t.locutores],
  )
  const corPorRotulo = useMemo(() => {
    const m = new Map<string, string>()
    t.locutores.forEach((l, i) => m.set(l.rotuloOriginal, corLocutor(l.cor ?? i)))
    return m
  }, [t.locutores])

  const blocosVisiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase()
    if (!termo) return t.blocos
    return t.blocos.filter((b) => b.texto.toLowerCase().includes(termo))
  }, [t.blocos, filtro])

  const topicoAtual = useMemo(() => {
    let atual = -1
    t.topicos.forEach((tp, i) => {
      if (tempo >= tp.s) atual = i
    })
    return atual
  }, [t.topicos, tempo])

  const duracao = t.duracaoSeg ?? (t.blocos.length ? t.blocos[t.blocos.length - 1].fim : 0)

  const comOcupado = async (fn: () => Promise<void>) => {
    setOcupado(true)
    setAviso(null)
    try {
      await fn()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível concluir.")
    } finally {
      setOcupado(false)
    }
  }

  const confirmarEdicao = async (b: Bloco) => {
    const texto = rascunho.trim()
    if (!texto || texto === b.texto) {
      setEditando(null)
      return
    }
    setSalvandoBloco(true)
    try {
      const r = await salvarBloco(t.id, b.id, texto)
      setT((ant) => ({
        ...ant,
        blocos: ant.blocos.map((x) => (x.id === b.id ? { ...x, texto: r.bloco.texto, editado: true } : x)),
        chunksDesatualizados: ant.chunksDesatualizados + r.chunksParaReindexar,
      }))
      setAviso(
        r.chunksParaReindexar > 0
          ? `Fala salva. ${r.chunksParaReindexar} ${r.chunksParaReindexar === 1 ? "trecho vai" : "trechos vão"} ser reindexado para a ConvertIA.`
          : "Fala salva.",
      )
      setEditando(null)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar a fala.")
    } finally {
      setSalvandoBloco(false)
    }
  }

  /**
   * A área de transferência pode ser NEGADA (contexto não seguro, permissão
   * bloqueada) e aí `writeText` rejeita. Anunciar "copiado" sem checar
   * mandaria o usuário colar um texto que não está lá.
   */
  const copiar = async (texto: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setAviso(ok)
    } catch {
      setAviso("O navegador bloqueou a cópia. Selecione o texto e copie à mão.")
    }
  }

  const copiarTrecho = (b: Bloco) => {
    const url = `${window.location.origin}${ROUTES.ADMIN.TRANSCRICOES.DETAIL_EM(t.id, fmtDuracao(b.s))}`
    return copiar(
      citacaoComTimestamp({ texto: b.texto, s: b.s, titulo: t.titulo, url }),
      "Trecho copiado com o timestamp e o link.",
    )
  }

  return (
    <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-6 pb-14 pt-6 md:px-8">
        {/* Cabeçalho */}
        <nav className="flex items-center gap-1.5 text-[11.5px] text-[var(--ops-sec)]">
          <Link href={ROUTES.ADMIN.TRANSCRICOES.LIST} className="hover:text-[var(--ops-title)]">
            Transcrições
          </Link>
          {t.colecaoNome && (
            <>
              <span className="text-[var(--ops-mut)]">/</span>
              <Link
                href={`${ROUTES.ADMIN.TRANSCRICOES.LIST}?colecao=${t.colecaoId}`}
                className="hover:text-[var(--ops-title)]"
              >
                {t.colecaoNome}
              </Link>
            </>
          )}
        </nav>

        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[21px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">
              {t.titulo}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ops-border)] px-2 py-[3px] text-[11px] font-medium text-[var(--ops-text)]">
                <IconePlataforma p={t.plataforma} size={11} />
                {PLATAFORMA_LABEL[t.plataforma]}
              </span>
              {t.naBaseDeConhecimento && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ops-accent)]/30 bg-[var(--ops-accent)]/10 px-2 py-[3px] text-[11px] font-medium text-[var(--ops-accent)]">
                  <Icon icon={Sparkles} customSize={11} />
                  na base da ConvertIA
                </span>
              )}
              <span className="text-[12px] text-[var(--ops-sec)]" style={TNUM}>
                {[
                  t.canal,
                  t.publicadoEm ? new Date(t.publicadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : null,
                  t.duracaoSeg != null ? fmtDuracao(t.duracaoSeg) : null,
                  t.locutores.length ? `${t.locutores.length} ${t.locutores.length === 1 ? "locutor" : "locutores"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`${ROUTES.ADMIN.OPERACIONAL.IA}?pergunta=${encodeURIComponent(`Sobre a transcrição "${t.titulo}": `)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)]"
            >
              <Icon icon={Sparkles} customSize={13} />
              ConvertIA
            </Link>
            {t.urlOriginal && (
              <a
                href={t.urlOriginal}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)]"
              >
                <Icon icon={ExternalLink} customSize={13} />
                Abrir original
              </a>
            )}
          </div>
        </div>

        {aviso && <TrAviso>{aviso}</TrAviso>}
        {t.status === "erro" && t.erroMsg && <TrAviso tone="erro">{t.erroMsg}</TrAviso>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Coluna principal */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* Quem toca o vídeo é a PLATAFORMA. A mídia é descartada quando a
                transcrição fica pronta — guardar é barato, servir a cada play
                não é. O <video> local só aparece enquanto o worker ainda tem o
                arquivo (durante o processamento). */}
            <div className="relative overflow-hidden rounded-[10px] border border-[var(--ops-border)] bg-black">
              {t.mediaUrl ? (
                <>
                  <video
                    ref={player}
                    src={t.mediaUrl}
                    controls={false}
                    playsInline
                    onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
                    onPlay={() => setTocando(true)}
                    onPause={() => setTocando(false)}
                    onClick={alternarPlay}
                    className="aspect-video w-full cursor-pointer bg-black"
                  />
                  {/* Clicar no vídeo é o gesto que todo mundo tenta primeiro.
                      Sem o alvo em cima dele, o único play é o botãozinho da
                      barra de baixo e o vídeo parece quebrado. */}
                  {!tocando && (
                    <button
                      type="button"
                      aria-label="Reproduzir"
                      onClick={alternarPlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-sm">
                        <Icon icon={Play} customSize={20} />
                      </span>
                    </button>
                  )}
                </>
              ) : embed ? (
                <iframe
                  ref={quadroEmbed}
                  src={embed.url}
                  title={t.titulo}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className={cn(
                    "w-full border-0 bg-black",
                    embed.proporcao === "9/16" ? "mx-auto aspect-[9/16] max-w-[420px]" : "aspect-video",
                  )}
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-[12px] text-white/60">
                    {processando
                      ? "O vídeo aparece assim que o download terminar."
                      : t.plataforma === "upload"
                        ? "O arquivo enviado não fica guardado depois da transcrição — o texto abaixo é o que permanece."
                        : "Não foi possível embutir o player desta plataforma."}
                  </span>
                  {!processando && t.urlOriginal && (
                    <a
                      href={t.urlOriginal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-semibold text-white/85 underline underline-offset-2 hover:text-white"
                    >
                      Abrir na plataforma
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Índice de tópicos: no embed ele substitui os marcadores da
                barra. No YouTube o clique PULA o player; no Instagram e no
                TikTok o player não aceita tempo, então rola só o texto — e a
                legenda diz isso em vez de fingir que pulou. */}
            {embed && t.topicos.length > 0 && (
              <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">
                    Tópicos
                  </span>
                  {!embed.aceitaTempo && (
                    <span className="text-[11px] text-[var(--ops-mut)]">
                      O player do {PLATAFORMA_LABEL[t.plataforma]} não pula para o tempo — o texto rola até o trecho.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.topicos.map((tp) => (
                    <button
                      key={tp.s}
                      type="button"
                      onClick={() => irPara(tp.s)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ops-border)] px-2 py-1 text-[11.5px] text-[var(--ops-text)] transition-colors hover:bg-[var(--ops-hover)]"
                    >
                      <span className="text-[var(--ops-mut)]" style={TNUM}>
                        {fmtDuracao(tp.s)}
                      </span>
                      {tp.titulo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Barra do player com marcadores de tópico. Só com o <video>
                local: o embed tem os controles da própria plataforma, e uma
                segunda barra que não consegue ler o tempo dele mostraria
                00:00 parado enquanto o vídeo anda. */}
            {t.mediaUrl && (
            <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3 py-2.5">
              <div className="relative mb-2 h-1.5 rounded-full bg-[var(--ops-track)]">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(duracao))}
                  value={Math.round(tempo)}
                  onChange={(e) => irPara(Number(e.target.value))}
                  aria-label="Posição no vídeo"
                  className="absolute inset-0 h-1.5 w-full cursor-pointer opacity-0"
                />
                <span
                  className="pointer-events-none block h-full rounded-full bg-[var(--ops-accent)]"
                  style={{ width: `${duracao > 0 ? Math.min(100, (tempo / duracao) * 100) : 0}%` }}
                />
                {duracao > 0 &&
                  t.topicos.map((tp) => (
                    <button
                      key={tp.s}
                      type="button"
                      title={`${fmtDuracao(tp.s)} · ${tp.titulo}`}
                      aria-label={`Ir para ${tp.titulo}`}
                      onClick={() => irPara(tp.s)}
                      className="absolute -top-[3px] h-3 w-[2px] rounded-[1px] bg-[var(--ops-title)] opacity-50 transition-opacity hover:opacity-100"
                      style={{ left: `${Math.min(99.6, (tp.s / duracao) * 100)}%` }}
                    />
                  ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={tocando ? "Pausar" : "Reproduzir"}
                  disabled={!t.mediaUrl}
                  onClick={alternarPlay}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ops-border)] text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)] disabled:opacity-40"
                >
                  <Icon icon={tocando ? Pause : Play} customSize={12} />
                </button>
                <span className="text-[12px] text-[var(--ops-sec)]" style={TNUM}>
                  {fmtDuracao(tempo)} / {fmtDuracao(duracao)}
                </span>
                <div className="flex-1" />
                <select
                  value={velocidade}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setVelocidade(v)
                    if (player.current) player.current.playbackRate = v
                  }}
                  aria-label="Velocidade"
                  className={cn(selectCls, "h-7 w-auto text-[11.5px]")}
                >
                  {VELOCIDADES.map((v) => (
                    <option key={v} value={v}>
                      {v}×
                    </option>
                  ))}
                </select>
              </div>
            </div>
            )}

            {processando && (
              <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3.5 py-3">
                <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-[var(--ops-sec)]">
                  <span>{rotuloDaEtapa(t.status, t.etapa, t.progresso)}</span>
                  <span className="text-[var(--ops-mut)]">o processamento continua com a aba fechada</span>
                </div>
                <BarraEtapas segmentos={segmentosDaEtapa(t.status, t.etapa, t.progresso)} />
              </div>
            )}

            {/* Busca dentro da transcrição */}
            {t.blocos.length > 0 && (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-[var(--ops-mut)]">
                  <Icon icon={Search} customSize={13} />
                </span>
                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Buscar nesta transcrição"
                  aria-label="Buscar nesta transcrição"
                  className="h-9 w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] pl-9 pr-3 text-[12.5px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"
                />
              </div>
            )}

            {/* Falas */}
            <div ref={listaFalas} className="flex flex-col gap-3 rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
              {t.blocos.length === 0 ? (
                <TrEmpty
                  title={processando ? "O texto aparece quando a transcrição terminar" : "Esta transcrição não tem texto"}
                  desc={
                    processando
                      ? "Você pode fechar a aba: o processamento roda no servidor."
                      : "Reprocessar do início pode resolver se a mídia ainda estiver guardada."
                  }
                />
              ) : blocosVisiveis.length === 0 ? (
                <TrEmpty title="Nenhuma fala com esse termo" desc="Tente outra palavra." />
              ) : (
                blocosVisiveis.map((b, i) => {
                  const anterior = blocosVisiveis[i - 1]
                  const mudouAutor = !anterior || anterior.locutor !== b.locutor
                  const locutor = b.locutor ? nomePorRotulo.get(b.locutor) : undefined
                  const cor = b.locutor ? corPorRotulo.get(b.locutor) : undefined
                  const ativo = tempo >= b.s && tempo < b.fim
                  return (
                    <div
                      key={b.id}
                      data-s={Math.round(b.s)}
                      className={cn(
                        "group border-l-2 pl-3 transition-colors",
                        ativo ? "border-[var(--ops-accent)]" : "border-transparent",
                      )}
                      style={!ativo && cor ? { borderColor: `${cor}40` } : undefined}
                    >
                      <div className="mb-0.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => irPara(b.s)}
                          className="text-[11px] font-semibold text-[var(--ops-mut)] transition-colors hover:text-[var(--ops-accent)]"
                          style={TNUM}
                        >
                          {fmtDuracao(b.s)}
                        </button>
                        {mudouAutor && locutor && (
                          <span className="text-[11.5px] font-semibold" style={{ color: cor }}>
                            {locutor.nome}
                          </span>
                        )}
                        {b.editado && <span className="text-[10px] text-[var(--ops-mut)]">editada</span>}
                        <span className="flex-1" />
                        <span className="hidden gap-2 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => void copiarTrecho(b)}
                            title="Copiar com timestamp e link"
                            aria-label="Copiar com timestamp e link"
                            className="text-[var(--ops-mut)] hover:text-[var(--ops-title)]"
                          >
                            <Icon icon={Copy} customSize={11} />
                          </button>
                        </span>
                      </div>

                      {editando === b.id ? (
                        <div>
                          <textarea
                            autoFocus
                            value={rascunho}
                            onChange={(e) => setRascunho(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void confirmarEdicao(b)
                              if (e.key === "Escape") setEditando(null)
                            }}
                            rows={3}
                            aria-label="Editar fala"
                            className={cn(textareaCls, "resize-y")}
                          />
                          <div className="mt-1.5 flex items-center gap-2">
                            <TrBtn kind="primary" onClick={() => void confirmarEdicao(b)} disabled={salvandoBloco}>
                              {salvandoBloco ? "Salvando…" : "Salvar"}
                            </TrBtn>
                            <TrBtn onClick={() => setEditando(null)}>Cancelar</TrBtn>
                            <span className="text-[10.5px] text-[var(--ops-mut)]">⌘↵ salva · Esc cancela</span>
                          </div>
                        </div>
                      ) : (
                        <p
                          onDoubleClick={() => {
                            setEditando(b.id)
                            setRascunho(b.texto)
                          }}
                          title="Duplo clique para editar"
                          className="cursor-text text-[13px] leading-relaxed text-[var(--ops-text)]"
                        >
                          {b.texto}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Painel direito */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
              <TrLabel className="mb-2.5">Informações</TrLabel>
              <dl className="flex flex-col gap-1.5 text-[11.5px]">
                <Info rotulo="Fonte" valor={PLATAFORMA_LABEL[t.plataforma]} />
                <Info rotulo="Canal" valor={t.canal} />
                <Info
                  rotulo="Publicado"
                  valor={t.publicadoEm ? new Date(t.publicadoEm).toLocaleDateString("pt-BR") : null}
                />
                <Info rotulo="Duração" valor={t.duracaoSeg != null ? fmtDuracao(t.duracaoSeg) : null} />
                <Info rotulo="Coleção" valor={t.colecaoNome} />
                <Info rotulo="Idioma" valor={t.idioma} />
                {/* Lê do banco: o modelo pode mudar por coleção e o histórico
                    tem de mostrar o que foi REALMENTE usado. */}
                <Info rotulo="Modelo" valor={t.modelo} mono />
                {t.custoUsd != null && <Info rotulo="Custo" valor={`US$ ${t.custoUsd.toFixed(4)}`} mono />}
                {t.tempoProcessamentoSeg != null && (
                  <Info rotulo="Processamento" valor={fmtDuracao(t.tempoProcessamentoSeg)} mono />
                )}
              </dl>
            </div>

            <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
              <TrLabel className="mb-2.5">Tags</TrLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.tags.map((tag) => (
                  <TrChip
                    key={tag}
                    onRemove={() =>
                      comOcupado(async () => {
                        const novas = t.tags.filter((x) => x !== tag)
                        await atualizarTranscricao(t.id, { tags: novas })
                        setT((a) => ({ ...a, tags: novas }))
                      })
                    }
                  >
                    {tag}
                  </TrChip>
                ))}
                <input
                  value={tagNova}
                  onChange={(e) => setTagNova(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    const v = tagNova.trim()
                    if (!v || t.tags.includes(v)) return
                    void comOcupado(async () => {
                      const novas = [...t.tags, v]
                      await atualizarTranscricao(t.id, { tags: novas })
                      setT((a) => ({ ...a, tags: novas }))
                      setTagNova("")
                    })
                  }}
                  placeholder="+ tag"
                  aria-label="Nova tag"
                  className={cn(inputCls, "h-[26px] w-[70px] px-2 text-[11px]")}
                />
              </div>
            </div>

            {t.topicos.length > 0 && (
              <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <TrLabel>Tópicos detectados</TrLabel>
                  <span className="text-[10.5px] text-[var(--ops-mut)]">índice navegável</span>
                </div>
                <div className="flex flex-col">
                  {t.topicos.map((tp, i) => (
                    <button
                      key={tp.s}
                      type="button"
                      onClick={() => irPara(tp.s)}
                      className={cn(
                        "flex items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-[var(--ops-hover)]",
                        i === topicoAtual ? "bg-[var(--ops-hover)] font-semibold text-[var(--ops-title)]" : "text-[var(--ops-text)]",
                      )}
                    >
                      <span className="w-9 shrink-0 text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                        {fmtDuracao(tp.s)}
                      </span>
                      <span className="min-w-0">{tp.titulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {t.locutores.length > 0 && (
              <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
                <TrLabel className="mb-2.5">Locutores</TrLabel>
                <div className="flex flex-col gap-1.5">
                  {t.locutores.map((l, i) => {
                    const cor = corLocutor(l.cor ?? i)
                    return (
                      <div key={l.id} className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9.5px] font-bold"
                          style={{ backgroundColor: `${cor}1F`, color: cor }}
                        >
                          {l.nome.slice(0, 2).toUpperCase()}
                        </span>
                        {renomeando === l.id ? (
                          <input
                            autoFocus
                            value={nomeNovo}
                            onChange={(e) => setNomeNovo(e.target.value)}
                            onBlur={() => setRenomeando(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setRenomeando(null)
                              if (e.key !== "Enter") return
                              const v = nomeNovo.trim()
                              if (!v) return
                              void comOcupado(async () => {
                                const r = await renomearLocutor(t.id, l.id, v)
                                setT((a) => ({
                                  ...a,
                                  locutores: a.locutores.map((x) => (x.id === l.id ? { ...x, nome: r.locutor.nome } : x)),
                                }))
                                setRenomeando(null)
                                setAviso(
                                  `${r.falasAtualizadas} ${r.falasAtualizadas === 1 ? "fala passa" : "falas passam"} a mostrar "${r.locutor.nome}".`,
                                )
                              })
                            }}
                            aria-label="Nome do locutor"
                            className={cn(inputCls, "h-6 flex-1 text-[12px]")}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRenomeando(l.id)
                              setNomeNovo(l.nome)
                            }}
                            className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[var(--ops-title)] hover:underline"
                          >
                            {l.nome}
                          </button>
                        )}
                        <span className="shrink-0 text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                          {l.falas} {l.falas === 1 ? "fala" : "falas"}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2.5 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">
                  Clique no nome para corrigir a diarização. A troca vale para toda a transcrição.
                </p>
              </div>
            )}

            {t.chunksDesatualizados > 0 && (
              <TrAviso>
                {t.chunksDesatualizados} {t.chunksDesatualizados === 1 ? "trecho está" : "trechos estão"} desatualizado
                {t.chunksDesatualizados === 1 ? "" : "s"} na base da ConvertIA. A reindexação roda sozinha em alguns
                minutos.
              </TrAviso>
            )}

            {/* Ações */}
            <div className="flex flex-col gap-2">
              <TrBtn
                kind="primary"
                icon={Sparkles}
                className="w-full"
                onClick={() =>
                  router.push(
                    `${ROUTES.ADMIN.OPERACIONAL.IA}?pergunta=${encodeURIComponent(`Sobre a transcrição "${t.titulo}": `)}`,
                  )
                }
              >
                Perguntar sobre esta transcrição
              </TrBtn>
              <TrBtn
                icon={Copy}
                className="w-full"
                disabled={!t.blocos.length}
                onClick={() => void copiar(t.blocos.map((b) => b.texto).join("\n\n"), "Texto completo copiado.")}
              >
                Copiar texto completo
              </TrBtn>
              <MenuExportar id={t.id} desabilitado={!t.blocos.length} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <TrBtn
                icon={RefreshCw}
                disabled={ocupado}
                onClick={() =>
                  comOcupado(async () => {
                    await reprocessar(t.id, "indexacao")
                    setAviso("Reindexação enfileirada. O texto não muda; só os trechos da ConvertIA são refeitos.")
                    setT(await getTranscricao(t.id))
                  })
                }
              >
                Reprocessar
              </TrBtn>
              <SeletorColecao
                colecoes={colecoes}
                atual={t.colecaoId}
                onMover={(id) =>
                  comOcupado(async () => {
                    await atualizarTranscricao(t.id, { colecaoId: id })
                    setT(await getTranscricao(t.id))
                    setAviso("Transcrição movida.")
                  })
                }
              />
            </div>

            {confirmandoExclusao ? (
              <div className="flex flex-col gap-2 rounded-lg border border-[var(--ops-neg)]/30 bg-[var(--ops-neg)]/5 p-3">
                <p className="text-[11.5px] leading-relaxed text-[var(--ops-neg)]">
                  Excluir apaga o texto, os trechos da ConvertIA e a mídia guardada. Não dá para desfazer.
                </p>
                <div className="flex gap-2">
                  <TrBtn
                    kind="destrutivo"
                    disabled={ocupado}
                    onClick={() =>
                      comOcupado(async () => {
                        await excluirTranscricao(t.id)
                        router.push(ROUTES.ADMIN.TRANSCRICOES.LIST)
                      })
                    }
                  >
                    Excluir mesmo
                  </TrBtn>
                  <TrBtn onClick={() => setConfirmandoExclusao(false)}>Cancelar</TrBtn>
                </div>
              </div>
            ) : (
              <TrBtn kind="destrutivo" icon={Trash2} className="w-full" onClick={() => setConfirmandoExclusao(true)}>
                Excluir transcrição
              </TrBtn>
            )}

            {ocupado && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--ops-sec)]">
                <Icon icon={Loader2} customSize={12} className="animate-spin" />
                Aplicando…
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function Info({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[86px] shrink-0 text-[var(--ops-sec)]">{rotulo}</dt>
      <dd
        className={cn("min-w-0 flex-1 break-words text-[var(--ops-title)]", mono && "font-mono text-[10.5px]")}
        style={mono ? TNUM : undefined}
      >
        {/* Campo sem dado mostra o traço; nunca um valor de exemplo. */}
        {valor ?? <span className="text-[var(--ops-mut)]">—</span>}
      </dd>
    </div>
  )
}

function MenuExportar({ id, desabilitado }: { id: string; desabilitado: boolean }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  // Menu que só fecha ao escolher uma opção fica aberto por cima do painel
  // enquanto a pessoa clica em qualquer outra coisa.
  useEffect(() => {
    if (!aberto) return
    const foraDaqui = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false)
    }
    document.addEventListener("mousedown", foraDaqui)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", foraDaqui)
      document.removeEventListener("keydown", escape)
    }
  }, [aberto])

  return (
    <div className="relative" ref={caixa}>
      <TrBtn icon={Download} className="w-full" disabled={desabilitado} onClick={() => setAberto((a) => !a)}>
        Exportar
        <Icon icon={ChevronDown} customSize={12} />
      </TrBtn>
      {aberto && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] shadow-lg">
          {(
            [
              ["txt", "Texto (.txt)"],
              ["srt", "Legenda (.srt)"],
              ["md", "Markdown (.md)"],
            ] as const
          ).map(([f, l]) => (
            <a
              key={f}
              href={urlExport(id, f)}
              onClick={() => setAberto(false)}
              className="block px-3 py-2 text-[12px] text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)]"
            >
              {l}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function SeletorColecao({
  colecoes,
  atual,
  onMover,
}: {
  colecoes: Array<{ id: string; nome: string; paiId: string | null; reservada: "inbox" | null }>
  atual: string | null
  onMover: (id: string | null) => void
}) {
  return (
    <div className="relative">
      <select
        value={atual ?? ""}
        onChange={(e) => onMover(e.target.value || null)}
        aria-label="Mover para coleção"
        className={cn(selectCls, "h-8 pl-8 text-[12px] font-semibold")}
      >
        <option value="">Não organizadas</option>
        {colecoes
          .filter((c) => !c.reservada)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.paiId ? "— " : ""}
              {c.nome}
            </option>
          ))}
      </select>
      <span className="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2 text-[var(--ops-sec)]">
        <Icon icon={FolderInput} customSize={13} />
      </span>
    </div>
  )
}
