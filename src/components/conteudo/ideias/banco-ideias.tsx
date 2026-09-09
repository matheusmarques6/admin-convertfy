"use client"

/**
 * Banco de Ideias — design set/2026 (Claude Design).
 *
 * Cabeçalho com o contador por funil → anotação rápida (uma linha, Enter) →
 * busca e filtros → grade de cards → ficha lateral.
 *
 * A anotação rápida é o coração da tela: quem tem a ideia está no meio de
 * outra coisa. Escreve, aperta Enter, a linha entra no banco e a ConvertIA
 * classifica DEPOIS (funil, formato, tags, molde, score). Se a classificação
 * falhar, a ideia entra crua — perder o que a pessoa acabou de escrever é o
 * único erro caro aqui, e a tela avisa que ficou sem score.
 *
 * Filtros, busca e ordenação vivem em `lib/conteudo/ideias/banco.ts` (puro,
 * testado): score da IA e voto do time são julgamentos diferentes e a tela
 * ordena por UM ou por outro; ideia não avaliada vai para o fim, nunca some.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowUpRight, Lightbulb, Loader2, Plus, RefreshCw, Search, Sparkles, TriangleAlert, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { OpsCard } from "@/components/dashboard/ops/primitives"
import { criarIdeia, gerarIdeias, getIdeias, votarIdeia } from "@/lib/conteudo/data"
import { contarPorFunil, filtrarIdeias, fonteLabel, type Ideia, type OrdemIdeias } from "@/lib/conteudo/ideias/banco"
import { FUNIL_LABEL, FUNIL_META, FUNIS } from "@/lib/conteudo/reels/pipeline"
import type { EtapaFunil, Formato } from "@/lib/conteudo/types"
import { CtBtn, CtEmpty, CtFmt, CtSeg, CtSkel, TNUM, alpha, inputCls, selectCls } from "../ui"
import { IdeiaDrawer } from "./ideia-drawer"

const FORMATOS: Formato[] = ["Carrossel", "Reels", "Vídeo", "Imagem"]

function ContadorFunil({ funil, n }: { funil: EtapaFunil; n: number }) {
  const meta = FUNIL_META[funil]
  return (
    <div className="flex items-center gap-2 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3 py-2">
      <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: meta.cor }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">{FUNIL_LABEL[funil]}</span>
      <span className="text-[14px] font-semibold text-[var(--ops-title)]" style={TNUM}>
        {n}
      </span>
    </div>
  )
}

function IdeiaCard({ i, onAbrir, onVotar, votando }: { i: Ideia; onAbrir: () => void; onVotar: () => void; votando: boolean }) {
  const cor = i.funil ? FUNIL_META[i.funil].cor : "var(--ops-mut)"
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
      className="flex cursor-pointer flex-col rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[15px] py-[13px] transition-colors hover:border-[var(--ops-accent)]/50"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {i.funil ? (
          <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: cor, background: alpha(FUNIL_META[i.funil].cor, 0.12) }}>
            {FUNIL_LABEL[i.funil]}
          </span>
        ) : (
          <span className="inline-flex h-[19px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-mut)]">Sem funil</span>
        )}
        {i.formato && <CtFmt fmt={i.formato} />}
        {i.pilar && <span className="inline-flex h-[19px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-sec)]">{i.pilar}</span>}
      </div>

      <div className="mt-2 text-[13px] font-semibold leading-snug text-[var(--ops-title)]">{i.titulo}</div>

      {i.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {i.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10.5px] font-medium text-[var(--ops-mut)]">
              {t.startsWith("#") ? t : `#${t}`}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--ops-border)] pt-2.5">
        <span className="truncate text-[10px] text-[var(--ops-mut)]">{fonteLabel(i)}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onVotar()
          }}
          disabled={votando}
          title={i.votei ? "Tirar meu voto" : "Quero gravar esta"}
          className={cn(
            "inline-flex h-[22px] items-center gap-1 rounded-md border px-1.5 text-[10.5px] font-semibold transition-colors",
            i.votei ? "border-transparent bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]",
          )}
          style={TNUM}
        >
          {votando ? <Icon icon={Loader2} customSize={10} className="animate-spin" /> : <Icon icon={ArrowUpRight} customSize={10} />}
          {i.votos}
        </button>
        <span className="inline-flex h-[22px] min-w-[30px] items-center justify-center rounded-md bg-[var(--ops-hover)] px-1.5 text-[11px] font-semibold text-[var(--ops-title)]" style={TNUM} title="Score da IA">
          {i.score == null ? "—" : i.score}
        </span>
      </div>
    </div>
  )
}

export function BancoIdeias() {
  const [busca, setBusca] = useState("")
  const [funil, setFunil] = useState<EtapaFunil | "">("")
  const [formato, setFormato] = useState<Formato | "">("")
  const [ordem, setOrdem] = useState<OrdemIdeias>("score")
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [nova, setNova] = useState("")
  const [anotando, setAnotando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [votando, setVotando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR<Ideia[]>("conteudo-ideias", () => getIdeias(), { revalidateOnFocus: false })
  const todas = useMemo(() => data ?? [], [data])

  const doBanco = useMemo(() => todas.filter((i) => (mostrarArquivadas ? i.status === "arquivada" : i.status !== "arquivada")), [todas, mostrarArquivadas])
  const contagem = useMemo(() => contarPorFunil(doBanco), [doBanco])
  const lista = useMemo(() => filtrarIdeias(doBanco, { busca, funil: funil || null, formato: formato || null, ordem }), [doBanco, busca, funil, formato, ordem])

  const anotar = async () => {
    const t = nova.trim()
    if (t.length < 3) return
    setAnotando(true)
    setErroAcao(null)
    setAviso(null)
    try {
      const r = await criarIdeia({ titulo: t })
      setNova("")
      if (!r.classificada) setAviso("A ideia entrou, mas a ConvertIA não conseguiu classificar agora — ela fica sem score até alguém preencher ou tentar de novo.")
      mutate()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao anotar")
    } finally {
      setAnotando(false)
    }
  }

  const gerar = async () => {
    setGerando(true)
    setErroAcao(null)
    setAviso(null)
    try {
      const novas = await gerarIdeias({ quantidade: 5 })
      setAviso(`${novas.length} pauta${novas.length > 1 ? "s" : ""} da ConvertIA ${novas.length > 1 ? "entraram" : "entrou"} no banco.`)
      mutate()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao gerar")
    } finally {
      setGerando(false)
    }
  }

  const votar = async (i: Ideia) => {
    setVotando(i.id)
    setErroAcao(null)
    try {
      const r = await votarIdeia(i.id)
      // A contagem é COUNT do servidor; escrever `votos + 1` aqui diverge
      // assim que duas pessoas votam ao mesmo tempo.
      mutate(
        todas.map((x) => (x.id === i.id ? { ...x, votos: r.votos, votei: r.votei } : x)),
        { revalidate: false },
      )
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao votar")
    } finally {
      setVotando(null)
    }
  }

  const carregando = isLoading && !data
  const filtrando = busca.trim() !== "" || funil !== "" || formato !== ""

  return (
    <div className="-m-4 flex min-h-[100dvh] min-w-0 md:-m-6 lg:-m-8">
      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pb-14 pt-8 md:px-10">
          {/* cabeçalho */}
          <div className="flex flex-wrap items-end gap-3.5">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ops-title)]">Banco de Ideias</h1>
              <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">Toda pauta em um lugar: o que a IA acha e o que o time quer gravar</div>
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2">
              {FUNIS.map((f) => (
                <ContadorFunil key={f} funil={f} n={contagem[f]} />
              ))}
            </div>
            <CtBtn kind="primary" icon={gerando ? Loader2 : Sparkles} onClick={gerar} disabled={gerando} className={cn(gerando && "[&_svg]:animate-spin")}>
              {gerando ? "Escrevendo…" : "Gerar ideias com IA"}
            </CtBtn>
          </div>

          {/* anotação rápida */}
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3 py-2.5">
            <Icon icon={Lightbulb} customSize={15} className="shrink-0 text-[var(--ops-mut)]" />
            <input
              className="h-8 min-w-[220px] flex-1 border-0 bg-transparent text-[13px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)]"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !anotando) anotar()
              }}
              placeholder="Anote uma ideia e aperte Enter — a ConvertIA classifica depois"
            />
            <CtBtn kind="secondary" size="sm" icon={anotando ? Loader2 : Plus} onClick={anotar} disabled={anotando || nova.trim().length < 3} className={cn(anotando && "[&_svg]:animate-spin")}>
              {anotando ? "Anotando…" : "Anotar"}
            </CtBtn>
          </div>

          {(aviso || erroAcao) && (
            <div
              className={cn(
                "flex gap-2 rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed",
                erroAcao ? "border-[var(--ops-neg)]/40 bg-[var(--ops-hover)] text-[var(--ops-neg)]" : "border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] text-[var(--ops-warn)]",
              )}
            >
              <Icon icon={TriangleAlert} customSize={13} className="mt-0.5 shrink-0" />
              <span>{erroAcao ?? aviso}</span>
            </div>
          )}

          {/* filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 md:max-w-[320px]">
              <Icon icon={Search} customSize={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ops-mut)]" />
              <input className={cn(inputCls, "pl-[30px]")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou hashtag" />
            </div>
            <select className={cn(selectCls, "w-auto")} value={funil} onChange={(e) => setFunil(e.target.value as EtapaFunil | "")}>
              <option value="">Todo o funil</option>
              {FUNIS.map((f) => (
                <option key={f} value={f}>
                  {FUNIL_LABEL[f]}
                </option>
              ))}
            </select>
            <select className={cn(selectCls, "w-auto")} value={formato} onChange={(e) => setFormato(e.target.value as Formato | "")}>
              <option value="">Todos os formatos</option>
              {FORMATOS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <CtSeg<OrdemIdeias>
              val={ordem}
              onChange={setOrdem}
              size="sm"
              opts={[
                ["score", "Por score"],
                ["votos", "Por votos"],
              ]}
            />
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setMostrarArquivadas((v) => !v)}
              className={cn("h-7 rounded-lg px-2.5 text-[11.5px] font-semibold transition-colors", mostrarArquivadas ? "bg-[var(--ops-hover)] text-[var(--ops-title)]" : "text-[var(--ops-sec)] hover:text-[var(--ops-title)]")}
            >
              {mostrarArquivadas ? "Ver o banco" : "Ver arquivadas"}
            </button>
            <span className="text-[11px] text-[var(--ops-mut)]" style={TNUM}>
              {filtrando ? `${lista.length} de ${doBanco.length}` : `${doBanco.length} ideia${doBanco.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {/* grade */}
          {error ? (
            <OpsCard>
              <CtEmpty
                icon={XCircle}
                title="Não foi possível carregar o banco"
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
          ) : carregando ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[15px] py-[13px]">
                  <CtSkel h={19} w="40%" r={5} />
                  <div className="h-3" />
                  <CtSkel h={13} w="90%" />
                  <div className="h-2" />
                  <CtSkel h={13} w="60%" />
                </div>
              ))}
            </div>
          ) : lista.length === 0 ? (
            <OpsCard>
              <CtEmpty
                icon={Lightbulb}
                title={filtrando ? "Nenhuma ideia com esse recorte" : mostrarArquivadas ? "Nada arquivado" : "O banco está vazio"}
                desc={
                  filtrando
                    ? "Tire um filtro ou busque por outra palavra — a busca casa título e hashtag."
                    : "Anote a primeira na linha acima, ou peça pautas para a ConvertIA a partir do que a casa publica."
                }
                action={
                  !filtrando && !mostrarArquivadas ? (
                    <div className="mt-2">
                      <CtBtn kind="primary" icon={Sparkles} onClick={gerar} disabled={gerando}>
                        Gerar ideias com IA
                      </CtBtn>
                    </div>
                  ) : undefined
                }
              />
            </OpsCard>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {lista.map((i) => (
                <IdeiaCard key={i.id} i={i} votando={votando === i.id} onAbrir={() => setAberta(i.id)} onVotar={() => votar(i)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <IdeiaDrawer ideia={todas.find((i) => i.id === aberta) ?? null} onClose={() => setAberta(null)} onMudou={() => mutate()} />
    </div>
  )
}
