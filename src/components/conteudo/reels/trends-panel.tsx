"use client"

/**
 * Painel direito do pipeline de Reels: "Em alta" e "Planejar com IA".
 *
 * Honestidade que o painel carrega na cara: **não existe integração com API
 * de trends do TikTok aqui**. O que alimenta a lista é a ConvertIA com busca
 * na internet, e cada link foi conferido contra o que a busca serviu. O
 * rodapé diz quando a rodada foi feita e, quando a busca não está
 * configurada, diz isso em vez de deixar a lista parecer conferida.
 *
 * "Planejar com IA" é o mesmo motor com um pedido diferente: as lacunas da
 * semana (do progresso por funil) entram no prompt, então ele propõe o que
 * FALTA fechar, não ideia solta.
 */

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowUpRight, Check, Globe, Loader2, Plus, ShieldAlert, Sparkles, TrendingUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { arquivarTrend, criarIdeia, gerarIdeias, gerarTrends } from "@/lib/conteudo/data"
import type { Ideia } from "@/lib/conteudo/ideias/banco"
import { FUNIL_LABEL, FUNIL_META, type ProgressoFunil } from "@/lib/conteudo/reels/pipeline"
import { daRodadaMaisRecente, idadeCurta } from "@/lib/conteudo/trends/validade"
import type { Trend, TrendsStatus } from "@/lib/conteudo/types"
import { CtBtn, CtEmpty, CtSeg, CtSkel, TNUM, alpha } from "../ui"

type Aba = "alta" | "planejar"

const DIFICULDADE: Record<Trend["dificuldade"], { label: string; cor: string }> = {
  facil: { label: "Fácil", cor: "#10B981" },
  medio: { label: "Médio", cor: "#D97706" },
  dificil: { label: "Difícil", cor: "#DC2626" },
}

const CATEGORIA: Record<Trend["categoria"], { label: string; cor: string }> = {
  viral: { label: "Viral", cor: "#DB2777" },
  venda: { label: "Venda", cor: "#047857" },
  educativo: { label: "Educativo", cor: "#4E62D8" },
}

/**
 * Por que a fonte não está no card — e a resposta NÃO é a mesma para os dois
 * casos, apesar de os dois chegarem com `fonteUrl` nulo.
 *
 * A referência marca "TEMA SENSÍVEL · CONFIRA AS FONTES" em bloco. Aqui dá
 * para ser mais preciso, porque a linha guarda a procedência: ou a rodada
 * inteira aconteceu sem busca (`interno`), ou ela teve busca e o link que o
 * modelo citou foi REMOVIDO por não estar entre os resultados servidos.
 */
function semFonte(t: Trend): { rotulo: string; titulo: string } | null {
  if (t.fonteUrl) return null
  if (t.fonte === "interno") {
    return { rotulo: "sem fato externo", titulo: "Esta rodada aconteceu sem busca na internet: o assunto saiu do contexto da casa. Confira antes de publicar." }
  }
  if (t.fonte === "manual") return null
  return { rotulo: "fonte não conferida", titulo: "A busca rodou, mas o link citado não estava entre os resultados servidos e foi removido. Confira o assunto antes de publicar." }
}

function TrendCard({ t, recente, onVirarIdeia, onArquivar, virando }: { t: Trend; recente: boolean; onVirarIdeia: () => void; onArquivar: () => void; virando: boolean }) {
  const dif = DIFICULDADE[t.dificuldade]
  const cat = CATEGORIA[t.categoria]
  const alerta = semFonte(t)
  // Idade só nos que NÃO são da rodada de hoje: "há 2 min" em todo card seria
  // ruído, e "há 6 dias" é justamente o que muda a leitura de "em alta".
  const idade = recente ? null : idadeCurta(t.geradoEm)
  return (
    <div className="group rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug text-[var(--ops-title)]">{t.titulo}</div>
        </div>
        <div className="flex shrink-0 items-center gap-[3px] text-[var(--ops-pos)]" style={TNUM} title="Score para este perfil">
          <Icon icon={ArrowUpRight} customSize={12} />
          <span className="text-[13px] font-semibold">{t.score}</span>
        </div>
      </div>

      <div className="mt-2 text-[11px] leading-relaxed text-[var(--ops-sec)]">{t.comoUsar}</div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: cat.cor, background: alpha(cat.cor, 0.12) }}>
          {cat.label}
        </span>
        <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: dif.cor, background: alpha(dif.cor, 0.12) }}>
          {dif.label}
        </span>
        {t.fonteUrl ? (
          <a
            href={t.fonteUrl}
            target="_blank"
            rel="noreferrer"
            title={t.fonteTitulo ?? t.fonteUrl}
            className="inline-flex h-[19px] items-center gap-1 rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-sec)] hover:text-[var(--ops-title)]"
          >
            <Icon icon={Globe} customSize={9} />
            fonte
          </a>
        ) : (
          alerta && (
            <span
              title={alerta.titulo}
              className="inline-flex h-[19px] items-center gap-1 rounded-[5px] border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-[7px] text-[10px] font-semibold text-[var(--ops-warn)]"
            >
              <Icon icon={ShieldAlert} customSize={9} />
              {alerta.rotulo}
            </span>
          )
        )}
        {idade && (
          <span className="text-[10px] text-[var(--ops-mut)]" style={TNUM} title="Este assunto é de uma rodada anterior">
            {idade}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onArquivar}
          title="Tirar do painel"
          className="inline-flex h-[19px] w-[19px] items-center justify-center rounded-[5px] text-[var(--ops-mut)] opacity-0 transition-opacity hover:bg-[var(--ops-hover)] hover:text-[var(--ops-title)] group-hover:opacity-100"
        >
          <Icon icon={X} customSize={11} />
        </button>
      </div>

      <button
        type="button"
        onClick={onVirarIdeia}
        disabled={virando}
        className="mt-2.5 inline-flex h-[26px] w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-page)] text-[11px] font-semibold text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)] disabled:opacity-50"
      >
        {virando ? <Icon icon={Loader2} customSize={11} className="animate-spin" /> : <Icon icon={Plus} customSize={11} />}
        Virar ideia
      </button>
    </div>
  )
}

export function TrendsPanel({
  trends,
  status,
  carregando,
  progresso,
  onMudou,
}: {
  trends: Trend[]
  status: TrendsStatus | null
  carregando: boolean
  progresso: ProgressoFunil[]
  /** Recarrega trends e o banco de ideias — o card criado tem de aparecer. */
  onMudou: () => void
}) {
  const [aba, setAba] = useState<Aba>("alta")
  const [lista, setLista] = useState<Trend[] | null>(null)
  const [st, setSt] = useState<TrendsStatus | null>(null)
  const [gerando, setGerando] = useState(false)
  const [virando, setVirando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pautas, setPautas] = useState<Ideia[] | null>(null)
  const [planejando, setPlanejando] = useState(false)

  const vigentes = lista ?? trends
  const stVigente = st ?? status
  // A faixa "em alta" é a rodada mais recente, não uma janela de horas — os
  // cards de rodadas anteriores continuam no painel, com a idade na cara.
  const recentes = useMemo(() => daRodadaMaisRecente(vigentes), [vigentes])

  const lacunas = progresso.filter((p) => p.feitos < p.meta)
  const lacunaTexto = lacunas.map((p) => `${FUNIL_LABEL[p.funil]}: ${p.meta - p.feitos === 1 ? "falta 1" : `faltam ${p.meta - p.feitos}`}`)

  const atualizar = async () => {
    setGerando(true)
    setErro(null)
    setAviso(null)
    try {
      const r = await gerarTrends()
      setLista(r.trends)
      setSt(r.status)
      const partes: string[] = []
      if (r.busca_indisponivel) partes.push(`Rodou sem fato externo: ${r.busca_indisponivel}`)
      if (r.fontes_descartadas > 0) partes.push(`${r.fontes_descartadas} link${r.fontes_descartadas > 1 ? "s" : ""} citado${r.fontes_descartadas > 1 ? "s" : ""} fora da busca — removido${r.fontes_descartadas > 1 ? "s" : ""}.`)
      if (r.expirados > 0) partes.push(`${r.expirados} assunto${r.expirados > 1 ? "s saíram" : " saiu"} do painel por validade.`)
      setAviso(partes.join(" ") || null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar")
    } finally {
      setGerando(false)
    }
  }

  const virarIdeia = async (t: Trend) => {
    setVirando(t.id)
    setErro(null)
    try {
      await criarIdeia({
        titulo: t.titulo,
        fonte: "trend",
        fonteDetalhe: null,
        trendId: t.id,
      })
      onMudou()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar a ideia")
    } finally {
      setVirando(null)
    }
  }

  const arquivar = async (t: Trend) => {
    setLista(vigentes.filter((x) => x.id !== t.id))
    try {
      await arquivarTrend(t.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao arquivar")
      setLista(null)
    }
  }

  const planejar = async () => {
    setPlanejando(true)
    setErro(null)
    try {
      const novas = await gerarIdeias({ lacunas: lacunaTexto, quantidade: Math.max(3, lacunas.reduce((n, p) => n + (p.meta - p.feitos), 0)) })
      setPautas(novas)
      onMudou()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao planejar")
    } finally {
      setPlanejando(false)
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[320px]">
      <div className="flex items-center gap-2">
        <CtSeg<Aba>
          val={aba}
          onChange={setAba}
          size="sm"
          opts={[
            ["alta", "Em alta"],
            ["planejar", "Planejar com IA"],
          ]}
        />
      </div>

      {erro && (
        <div className="flex gap-2 rounded-lg border border-[var(--ops-neg)]/40 bg-[var(--ops-hover)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ops-neg)]">
          <Icon icon={AlertTriangle} customSize={12} className="mt-px shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {aba === "alta" ? (
        <>
          <div className="flex items-center gap-2">
            <CtBtn kind="secondary" size="sm" icon={gerando ? Loader2 : TrendingUp} onClick={atualizar} disabled={gerando} className={cn("flex-1 justify-center", gerando && "[&_svg]:animate-spin")}>
              {gerando ? "Buscando…" : vigentes.length ? "Atualizar assuntos" : "Buscar assuntos"}
            </CtBtn>
          </div>

          {aviso && (
            <div className="rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--ops-warn)]">{aviso}</div>
          )}

          <div className="flex flex-col gap-2">
            {carregando && !vigentes.length ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] py-3">
                  <CtSkel h={12} w="70%" />
                  <div className="h-2" />
                  <CtSkel h={10} w="100%" />
                </div>
              ))
            ) : vigentes.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[var(--ops-border)] bg-[var(--ops-card)]">
                {/* Painel vazio DEPOIS de uma rodada não é "nunca gerado": os
                    dois estados pedem ações opostas. */}
                <CtEmpty
                  icon={TrendingUp}
                  title={stVigente?.geradoEm ? "Tudo que o radar trouxe já venceu" : "Nenhum assunto no painel"}
                  desc={
                    stVigente?.geradoEm
                      ? `A última rodada foi ${idadeCurta(stVigente.geradoEm) ?? "há algum tempo"} e nenhum assunto dela continua dentro da validade de ${stVigente.validadeDias} dias.`
                      : "A ConvertIA busca na internet e propõe assuntos ligados ao que a casa publica. Cada link é conferido contra o resultado da busca."
                  }
                />
              </div>
            ) : (
              vigentes.map((t) => (
                <TrendCard key={t.id} t={t} recente={recentes.has(t.id)} virando={virando === t.id} onVirarIdeia={() => virarIdeia(t)} onArquivar={() => arquivar(t)} />
              ))
            )}
          </div>

          <div className="px-1 text-[10px] leading-relaxed text-[var(--ops-mut)]">
            {stVigente?.buscaConfigurada === false
              ? "Sem provedor de busca configurado: os assuntos saem do contexto da casa, sem fato externo."
              : `O radar roda todo dia de manhã · ${idadeCurta(stVigente?.geradoEm ?? null) ? `última rodada ${idadeCurta(stVigente?.geradoEm ?? null)}` : "ainda não rodou aqui"}. Assunto sai do painel depois de ${stVigente?.validadeDias ?? 14} dias.`}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-mut)]">Falta para fechar a semana</div>
            {lacunas.length === 0 ? (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ops-pos)]">
                <Icon icon={Check} customSize={13} />
                Semana fechada nos três funis
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {lacunas.map((p) => (
                  <div key={p.funil} className="flex items-center gap-2 text-[11.5px] text-[var(--ops-title)]">
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: FUNIL_META[p.funil].cor }} />
                    <span className="font-semibold">{FUNIL_LABEL[p.funil]}</span>
                    <span className="text-[var(--ops-sec)]">
                      {p.meta - p.feitos === 1 ? "falta 1" : `faltam ${p.meta - p.feitos}`} · {p.emProducao} em produção
                    </span>
                  </div>
                ))}
              </div>
            )}
            <CtBtn
              kind="primary"
              size="sm"
              icon={planejando ? Loader2 : Sparkles}
              onClick={planejar}
              disabled={planejando}
              className={cn("mt-3 w-full justify-center", planejando && "[&_svg]:animate-spin")}
            >
              {planejando ? "Escrevendo pautas…" : lacunas.length ? "Gerar o que falta" : "Gerar pautas novas"}
            </CtBtn>
            <div className="mt-2 text-[10px] leading-relaxed text-[var(--ops-mut)]">
              As pautas entram no Banco de Ideias com funil, formato e score. De lá você manda para o pipeline.
            </div>
          </div>

          {pautas && (
            <div className="flex flex-col gap-2">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-mut)]">
                {pautas.length} pauta{pautas.length > 1 ? "s" : ""} no banco
              </div>
              {pautas.map((p) => (
                <div key={p.id} className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-[var(--ops-title)]">{p.titulo}</div>
                    {p.score != null && (
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--ops-pos)]" style={TNUM}>
                        {p.score}
                      </span>
                    )}
                  </div>
                  {p.porQue && <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--ops-sec)]">{p.porQue}</div>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.funil && (
                      <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: FUNIL_META[p.funil].cor, background: alpha(FUNIL_META[p.funil].cor, 0.12) }}>
                        {FUNIL_LABEL[p.funil]}
                      </span>
                    )}
                    {p.formato && <span className="inline-flex h-[19px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-sec)]">{p.formato}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
