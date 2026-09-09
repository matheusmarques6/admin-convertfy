"use client"

/**
 * Motor editorial — a sequência que separa "gerou um carrossel" de "gerou
 * um bom": pauta → triagem → 10 headlines (você escolhe) → espinha dorsal
 * (você aprova) → copy derivada da espinha → revisão em 7 parâmetros.
 *
 * UM componente para dois lugares: o fluxo "100% com IA" (layout largo) e o
 * painel Editorial do editor (compacto). O estado é o `Editorial` do
 * documento; quem persiste é o pai (NovoFlow em memória até criar; o editor
 * via `api.set`, que entra no autosave).
 *
 * Nada aqui inventa: cada passo é uma ação da ConvertIA validada por schema,
 * e o veredito de cada headline passa TAMBÉM pelo checklist de código
 * (`avaliarHeadline`) — a IA pode se enganar sobre o próprio texto.
 */

import { useMemo, useState } from "react"
import { Check, ChevronDown, RefreshCw, Sparkles, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ETAPAS, GATILHOS, PADROES_HEADLINE, PARAMETROS, avaliarHeadline, etapaAtual, headlineEscolhida, indiceDaEtapa, papeisDosFrames, validarContratoCapa, type PapelFrame } from "@/lib/conteudo/editorial"
import { chamarIA, chamarTriagem } from "@/lib/conteudo/ia/client"
import { ST_LIMITES } from "@/lib/conteudo/limites"
import type { Editorial, Espinha, EtapaFunil, HeadlineOpcao, RevisaoEditorial, Triagem, ViolacaoEditorial } from "@/lib/conteudo/types"
import { CtBadge, CtLabel, TNUM, inputCls, selectCls, textareaCls } from "../ui"

export interface MotorContexto {
  perfil: { handle: string | null; nome: string; voz: "marca" | "pessoal" }
  templateNome: string
  frames: Array<{ frameId: string; tipo: string; label: string; campos: string[] }>
  pilar?: string
  etapaFunil?: EtapaFunil
  /** Headline que está na capa hoje (editor) — habilita o diagnóstico. */
  capaAtual?: { titulo?: string; subtitulo?: string }
}

interface Props {
  editorial: Editorial
  onChange: (e: Editorial) => void
  contexto: MotorContexto
  compacto?: boolean
  /** Editor: aplicar a headline escolhida na capa. */
  onAplicarHeadline?: (h: HeadlineOpcao) => void
  /** Editor: gerar a copy dos frames pela espinha. Ausente no fluxo de criação (o Criar faz isso). */
  onGerarCopy?: () => Promise<void>
  /** Editor: revisar a copy atual. */
  onRevisar?: () => Promise<void>
  onAplicarReescrita?: (frameId: string, reescrita: NonNullable<RevisaoEditorial["slides"][number]["reescrita"]>) => void
  onIrParaFrame?: (frameId: string) => void
  /** Fluxo de criação: a pauta e a voz já têm campos próprios na tela. */
  ocultarPauta?: boolean
}

const LIMITES_CAPA = { titulo: ST_LIMITES.capa?.titulo, subtitulo: ST_LIMITES.capa?.subtitulo }

const COR_VEREDITO: Record<HeadlineOpcao["veredito"], string> = { aprovada: "#047857", ressalva: "#B45309", reprovada: "#B91C1C" }
const NOME_VEREDITO: Record<HeadlineOpcao["veredito"], string> = { aprovada: "Aprovada", ressalva: "Ressalva", reprovada: "Reprovada" }

function Btn({ children, onClick, loading, disabled, prominent, icon: Ic, small }: { children: React.ReactNode; onClick?: () => void; loading?: boolean; disabled?: boolean; prominent?: boolean; icon?: typeof Sparkles; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        small ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[11.5px]",
        prominent ? "bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]",
      )}
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : Ic ? <Icon icon={Ic} customSize={12} /> : null}
      {children}
    </button>
  )
}

function Erro({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--ops-neg)]/30 bg-[var(--ops-card)] px-2.5 py-2 text-[11px] text-[var(--ops-neg)]">
      <span>{msg}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="self-start font-semibold hover:underline">
          Tentar de novo
        </button>
      )}
    </div>
  )
}

function Secao({ n, titulo, aberta, onToggle, feita, children, compacto }: { n: number; titulo: string; aberta: boolean; onToggle: () => void; feita: boolean; children: React.ReactNode; compacto?: boolean }) {
  return (
    <div className={cn("rounded-[10px] border", aberta ? "border-[var(--ops-border)] bg-[var(--ops-card)]" : "border-[var(--ops-border)]/70")}>
      <button type="button" onClick={onToggle} aria-expanded={aberta} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", feita ? "bg-[var(--ops-pos)] text-white" : aberta ? "bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "bg-[var(--ops-track)] text-[var(--ops-mut)]")}>{feita ? <Icon icon={Check} customSize={10} /> : n}</span>
        <span className={cn("flex-1 font-semibold text-[var(--ops-title)]", compacto ? "text-[12px]" : "text-[13px]")}>{titulo}</span>
        <span className={cn("text-[var(--ops-mut)] transition-transform", aberta && "rotate-180")}>
          <Icon icon={ChevronDown} customSize={12} />
        </span>
      </button>
      {aberta && <div className={cn("flex flex-col gap-2.5 border-t border-[var(--ops-border)] px-3 pb-3 pt-2.5")}>{children}</div>}
    </div>
  )
}

const nomePadrao = (id: string) => PADROES_HEADLINE.find((p) => p.id === id)?.nome ?? id
const nomeGatilho = (id: string) => GATILHOS.find((g) => g.id === id)?.nome ?? id

/** Veredito final = o mais severo entre o da IA e o do checklist de código. */
function vereditoFinal(h: HeadlineOpcao): { veredito: HeadlineOpcao["veredito"]; motivos: string[] } {
  const a = avaliarHeadline(h)
  const motivos: string[] = []
  if (h.motivo) motivos.push(h.motivo)
  if (a.antiPadroes.length) motivos.push(`Checklist: ${a.antiPadroes.join(", ")}`)
  if (!a.padraoDeclarado) motivos.push("Padrão fora da tabela da casa.")
  if (!a.gatilhosSuficientes) motivos.push("Menos de 2 gatilhos.")
  const ordem: HeadlineOpcao["veredito"][] = ["aprovada", "ressalva", "reprovada"]
  const veredito = ordem[Math.max(ordem.indexOf(h.veredito), ordem.indexOf(a.veredito))]
  return { veredito, motivos }
}

export function EditorialMotor({ editorial, onChange, contexto, compacto, onAplicarHeadline, onGerarCopy, onRevisar, onAplicarReescrita, onIrParaFrame, ocultarPauta }: Props) {
  const etapa = etapaAtual(editorial)
  const [aberta, setAberta] = useState<string>(etapa)
  const [ocupado, setOcupado] = useState<null | "triagem" | "headlines" | "ajustar" | "espinha" | "copy" | "revisar">(null)
  const [erro, setErro] = useState<{ onde: string; msg: string } | null>(null)
  const [ajuste, setAjuste] = useState<{ indice: number; instrucao: string; misturarCom: number | null } | null>(null)
  const [instrucaoEspinha, setInstrucaoEspinha] = useState("")
  // Buscar fatos na internet é ESCOLHA por triagem: custa uma chamada
  // externa e nem toda pauta precisa (a que veio de um relatório já tem o
  // dado). Fica ligado por padrão porque a triagem sem fato externo é a
  // que produz `[confirmar]` no slide.
  const [buscar, setBuscar] = useState(true)
  const [busca, setBusca] = useState<{ fontes: Array<{ titulo: string; url: string }>; indisponivel: string | null; descartadas: number } | null>(null)
  const escolhida = headlineEscolhida(editorial)
  const papeis = useMemo(() => papeisDosFrames(contexto.frames), [contexto.frames])
  const papeisDoMeio = useMemo(() => papeis.map((p) => p.papel).filter((p) => p !== "headline" && p !== "cta") as PapelFrame[], [papeis])

  const falha = (onde: string, e: unknown) => setErro({ onde, msg: e instanceof Error ? e.message : "A ConvertIA não respondeu." })
  const set = (patch: Partial<Editorial>) => onChange({ ...editorial, ...patch })

  // ── Ações ──
  const fazerTriagem = async () => {
    if (!editorial.insumo.trim()) return
    setOcupado("triagem")
    setErro(null)
    try {
      const r = await chamarTriagem({ acao: "triagem", insumo: editorial.insumo, perfil: { ...contexto.perfil, voz: editorial.voz }, pilar: contexto.pilar, etapaFunil: contexto.etapaFunil, templateNome: contexto.templateNome, buscarNaWeb: buscar })
      setBusca({ fontes: r.fontes, indisponivel: r.buscaIndisponivel, descartadas: r.fontesDescartadas })
      // Triagem nova invalida headlines e espinha (foram derivadas da anterior).
      onChange({ ...editorial, triagem: r.triagem, headlines: undefined, headlineEscolhida: null, espinha: undefined, revisao: undefined })
      setAberta("headline")
    } catch (e) {
      falha("triagem", e)
    } finally {
      setOcupado(null)
    }
  }

  const gerarHeadlines = async (modo: "criar" | "diagnosticar") => {
    setOcupado("headlines")
    setErro(null)
    try {
      const r = await chamarIA({
        acao: "headlines",
        triagem: editorial.triagem,
        atual: modo === "diagnosticar" ? contexto.capaAtual?.titulo : undefined,
        modo,
        quantidade: 10,
        limites: LIMITES_CAPA,
        segundaPessoa: editorial.segundaPessoa,
        perfil: { ...contexto.perfil, voz: editorial.voz },
      })
      set({ headlines: r.opcoes, headlineEscolhida: null })
      setAjuste(null)
    } catch (e) {
      falha("headlines", e)
    } finally {
      setOcupado(null)
    }
  }

  const ajustar = async () => {
    if (!ajuste || !editorial.headlines) return
    setOcupado("ajustar")
    setErro(null)
    try {
      const r = await chamarIA({ acao: "ajustar_headline", opcoes: editorial.headlines, indice: ajuste.indice, instrucao: ajuste.instrucao || undefined, misturarCom: ajuste.misturarCom ?? undefined, triagem: editorial.triagem, limites: LIMITES_CAPA, segundaPessoa: editorial.segundaPessoa })
      const novas = editorial.headlines.map((h, i) => (i === ajuste.indice ? r.opcao : h))
      set({ headlines: novas, headlineEscolhida: editorial.headlineEscolhida === ajuste.indice ? null : editorial.headlineEscolhida })
      setAjuste(null)
    } catch (e) {
      falha("ajustar", e)
    } finally {
      setOcupado(null)
    }
  }

  const escolher = (i: number) => {
    const h = editorial.headlines?.[i]
    if (!h) return
    // Escolher outra headline invalida a espinha (ela é derivada da headline).
    onChange({ ...editorial, headlineEscolhida: i, espinha: editorial.espinha && editorial.espinha.headline === h.texto ? editorial.espinha : undefined, revisao: undefined })
    onAplicarHeadline?.(h)
    setAberta("espinha")
  }

  const montarEspinha = async (refazer = false) => {
    if (!editorial.triagem || !escolhida) return
    setOcupado("espinha")
    setErro(null)
    try {
      const r = await chamarIA({
        acao: "espinha",
        triagem: editorial.triagem,
        headline: escolhida,
        perfil: { ...contexto.perfil, voz: editorial.voz },
        templateNome: contexto.templateNome,
        papeis: papeisDoMeio,
        pilar: contexto.pilar,
        segundaPessoa: editorial.segundaPessoa,
        atual: refazer ? editorial.espinha : undefined,
        instrucao: refazer && instrucaoEspinha.trim() ? instrucaoEspinha.trim() : undefined,
      })
      set({ espinha: r, revisao: undefined })
      setInstrucaoEspinha("")
      setAberta("copy")
    } catch (e) {
      falha("espinha", e)
    } finally {
      setOcupado(null)
    }
  }

  const setTriagem = (patch: Partial<Triagem>) => editorial.triagem && set({ triagem: { ...editorial.triagem, ...patch } })
  const setEspinha = (patch: Partial<Espinha>) => editorial.espinha && set({ espinha: { ...editorial.espinha, ...patch } })

  const idx = indiceDaEtapa(etapa)
  const feita = (e: string) => indiceDaEtapa(e as typeof etapa) < idx

  return (
    <div className={cn("flex flex-col gap-2", !compacto && "gap-3")}>
      {/* trilha */}
      <div className="flex flex-wrap items-center gap-1 text-[10.5px]" style={TNUM}>
        {ETAPAS.map((e, i) => (
          <span key={e.id} className={cn("inline-flex items-center gap-1", i < idx ? "text-[var(--ops-pos)]" : i === idx ? "font-semibold text-[var(--ops-title)]" : "text-[var(--ops-mut)]")}>
            {i > 0 && <span className="mx-0.5 text-[var(--ops-border)]">›</span>}
            {e.nome}
          </span>
        ))}
      </div>

      {/* 1. Pauta */}
      {!ocultarPauta && (
      <Secao n={1} titulo="Pauta e voz" aberta={aberta === "insumo"} onToggle={() => setAberta(aberta === "insumo" ? "" : "insumo")} feita={feita("insumo")} compacto={compacto}>
        <textarea value={editorial.insumo} onChange={(e) => set({ insumo: e.target.value })} rows={compacto ? 4 : 6} placeholder="Ideia, texto bruto, dado com fonte, transcrição. A IA não inventa número: o que não estiver aqui sai como [confirmar]." className={cn(textareaCls, "text-[12px]")} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <CtLabel>Voz</CtLabel>
            <select value={editorial.voz} onChange={(e) => set({ voz: e.target.value as Editorial["voz"] })} className={cn(selectCls, "mt-1")}>
              <option value="marca">Marca (nós, cases e dados)</option>
              <option value="pessoal">Pessoal (eu, bastidor)</option>
            </select>
          </div>
          <div>
            <CtLabel>Segunda pessoa</CtLabel>
            <select value={editorial.segundaPessoa ? "sim" : "nao"} onChange={(e) => set({ segundaPessoa: e.target.value === "sim" })} className={cn(selectCls, "mt-1")} title="Regra por perfil: o carrossel da casa fala com 'você'; um perfil jornalístico não.">
              <option value="sim">“Você” liberado (voz da casa)</option>
              <option value="nao">Sem “você” (reportagem)</option>
            </select>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[11px] text-[var(--ops-title)]">
          <input type="checkbox" checked={buscar} onChange={(e) => setBuscar(e.target.checked)} className="mt-0.5 accent-[var(--ops-accent)]" />
          <span>
            Buscar fatos na internet
            <span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--ops-mut)]">
              As evidências ganham fonte com link. Só entra fonte que a busca devolveu — link que a IA inventar é removido antes de chegar aqui.
            </span>
          </span>
        </label>
        {erro?.onde === "triagem" && <Erro msg={erro.msg} onRetry={fazerTriagem} />}
        <Btn prominent icon={Sparkles} loading={ocupado === "triagem"} disabled={editorial.insumo.trim().length < 10} onClick={fazerTriagem}>
          {editorial.triagem ? "Refazer triagem" : "Fazer triagem"}
        </Btn>
      </Secao>
      )}

      {/* 2. Triagem */}
      <Secao n={2} titulo="Triagem" aberta={aberta === "triagem" || Boolean(ocultarPauta && aberta === "insumo")} onToggle={() => setAberta(aberta === "triagem" ? "" : "triagem")} feita={feita("triagem")} compacto={compacto}>
        {erro?.onde === "triagem" && ocultarPauta && <Erro msg={erro.msg} onRetry={fazerTriagem} />}
        {!editorial.triagem ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-[var(--ops-mut)]">A triagem lê o insumo em três camadas (transformação, fricção, ângulo) e lista as evidências com fonte. Tudo é editável depois.</div>
            <Btn prominent icon={Sparkles} loading={ocupado === "triagem"} disabled={editorial.insumo.trim().length < 10} onClick={fazerTriagem}>
              Fazer triagem
            </Btn>
            {editorial.insumo.trim().length < 10 && <div className="text-[10.5px] text-[var(--ops-warn)]">Escreva a pauta primeiro (pelo menos uma frase).</div>}
          </div>
        ) : (
          <>
            {(
              [
                ["transformacao", "Transformação"],
                ["friccaoCentral", "Fricção central"],
                ["anguloDominante", "Ângulo dominante"],
                ["promessa", "Promessa do hook"],
              ] as Array<[keyof Triagem, string]>
            ).map(([k, l]) => (
              <div key={k}>
                <CtLabel>{l}</CtLabel>
                <textarea value={String(editorial.triagem?.[k] ?? "")} onChange={(e) => setTriagem({ [k]: e.target.value } as Partial<Triagem>)} rows={2} className={cn(textareaCls, "mt-1 text-[11.5px]")} />
              </div>
            ))}
            {busca && (
              <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2">
                {busca.indisponivel ? (
                  <div className="text-[10.5px] leading-relaxed text-[var(--ops-warn)]">
                    Sem fato externo nesta triagem: {busca.indisponivel}
                  </div>
                ) : busca.fontes.length === 0 ? (
                  <div className="text-[10.5px] leading-relaxed text-[var(--ops-mut)]">A busca não devolveu resultado para esta pauta.</div>
                ) : (
                  <>
                    <CtLabel className="mb-1">Fontes consultadas ({busca.fontes.length})</CtLabel>
                    <div className="flex flex-col gap-1">
                      {busca.fontes.map((f) => (
                        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-[10.5px] text-[var(--ops-accent)] hover:underline" title={f.url}>
                          {f.titulo}
                        </a>
                      ))}
                    </div>
                  </>
                )}
                {busca.descartadas > 0 && (
                  <div className="mt-1.5 text-[10px] leading-relaxed text-[var(--ops-warn)]">
                    {busca.descartadas === 1 ? "1 link citado" : `${busca.descartadas} links citados`} não estava{busca.descartadas === 1 ? "" : "m"} entre as fontes consultadas e foi{busca.descartadas === 1 ? "" : "ram"} removido{busca.descartadas === 1 ? "" : "s"}. O dado ficou, sem fonte — confirme antes de publicar.
                  </div>
                )}
              </div>
            )}
            <div>
              <CtLabel>Evidências</CtLabel>
              <div className="mt-1 flex flex-col gap-1.5">
                {editorial.triagem.evidencias.map((ev, i) => (
                  <div key={i} className="flex gap-1.5">
                    <span className="w-4 pt-1.5 text-[10px] font-bold text-[var(--ops-mut)]">{ev.rotulo}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <input value={ev.texto} onChange={(e) => setTriagem({ evidencias: editorial.triagem!.evidencias.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })} className={cn(inputCls, "h-7 text-[11.5px]")} />
                      <input value={ev.fonte ?? ""} onChange={(e) => setTriagem({ evidencias: editorial.triagem!.evidencias.map((x, j) => (j === i ? { ...x, fonte: e.target.value || undefined } : x)) })} placeholder="Fonte + ano (sem fonte, sai como [confirmar])" className={cn(inputCls, "h-6 text-[10.5px]", !ev.fonte && "border-[var(--ops-warn-br)]")} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <CtLabel>Eixo</CtLabel>
                <select value={editorial.triagem.eixo} onChange={(e) => setTriagem({ eixo: e.target.value as Triagem["eixo"] })} className={cn(selectCls, "mt-1")}>
                  {["mercado", "cases", "noticias", "cultura", "produto"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <CtLabel>Funil</CtLabel>
                <select value={editorial.triagem.funil} onChange={(e) => setTriagem({ funil: e.target.value as EtapaFunil })} className={cn(selectCls, "mt-1")}>
                  <option value="topo">Topo · alcançar gente nova</option>
                  <option value="meio">Meio · aquecer quem segue</option>
                  <option value="fundo">Fundo · converter</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn prominent icon={Sparkles} loading={ocupado === "headlines"} onClick={() => gerarHeadlines("criar")}>
                {editorial.headlines?.length ? "Gerar 10 headlines de novo" : "Gerar 10 headlines"}
              </Btn>
              {ocultarPauta && (
                <Btn icon={RefreshCw} loading={ocupado === "triagem"} onClick={fazerTriagem}>
                  Refazer triagem
                </Btn>
              )}
            </div>
          </>
        )}
      </Secao>

      {/* 3. Headlines */}
      <Secao n={3} titulo={escolhida ? `Headline · ${NOME_VEREDITO[vereditoFinal(escolhida).veredito].toLowerCase()}` : "Headline"} aberta={aberta === "headline"} onToggle={() => setAberta(aberta === "headline" ? "" : "headline")} feita={feita("headline")} compacto={compacto}>
        {erro?.onde === "headlines" && <Erro msg={erro.msg} onRetry={() => gerarHeadlines("criar")} />}
        {!editorial.headlines?.length ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-[var(--ops-mut)]">10 opções, cada uma com padrão da casa, 2 gatilhos e veredito. O checklist de rejeição roda também por código: a IA pode se enganar sobre o próprio texto.</div>
            <div className="flex flex-wrap gap-1.5">
              <Btn prominent icon={Sparkles} loading={ocupado === "headlines"} disabled={!editorial.triagem} onClick={() => gerarHeadlines("criar")}>
                Gerar 10 headlines
              </Btn>
              {contexto.capaAtual?.titulo && (
                <Btn icon={Wand2} loading={ocupado === "headlines"} onClick={() => gerarHeadlines("diagnosticar")}>
                  Diagnosticar a atual
                </Btn>
              )}
            </div>
            {!editorial.triagem && <div className="text-[10.5px] text-[var(--ops-warn)]">Faça a triagem primeiro: headline sem triagem é chute.</div>}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {editorial.headlines.map((h, i) => {
                const v = vereditoFinal(h)
                const on = editorial.headlineEscolhida === i
                const problemasCapa = validarContratoCapa(h.texto, h.subtitulo, LIMITES_CAPA)
                return (
                  <div key={i} className={cn("rounded-lg border px-2.5 py-2", on ? "border-[var(--ops-accent)] bg-[var(--ops-tile)]" : "border-[var(--ops-border)]")}>
                    <div className="flex items-start gap-2">
                      <span className="w-4 pt-0.5 text-[10px] font-bold text-[var(--ops-mut)]" style={TNUM}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold leading-[1.35] text-[var(--ops-title)]">{h.texto}</div>
                        {h.subtitulo && <div className="mt-0.5 text-[11px] leading-[1.4] text-[var(--ops-sec)]">{h.subtitulo}</div>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <CtBadge txt={NOME_VEREDITO[v.veredito]} cor={COR_VEREDITO[v.veredito]} />
                          <span className="rounded-md bg-[var(--ops-track)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--ops-sec)]">{nomePadrao(h.padrao)}</span>
                          {h.gatilhos.map((g, gi) => (
                            <span key={`${g}-${gi}`} className="rounded-md border border-[var(--ops-border)] px-1.5 py-0.5 text-[9.5px] text-[var(--ops-mut)]">
                              {nomeGatilho(g)}
                            </span>
                          ))}
                        </div>
                        {(v.motivos.length > 0 || problemasCapa.length > 0) && <div className="mt-1 text-[10px] leading-[1.4] text-[var(--ops-mut)]">{[...v.motivos, ...problemasCapa].join(" · ")}</div>}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                      <Btn small prominent={!on} onClick={() => escolher(i)} disabled={v.veredito === "reprovada"}>
                        {on ? "Escolhida" : "Escolher"}
                      </Btn>
                      <Btn small onClick={() => setAjuste(ajuste?.indice === i ? null : { indice: i, instrucao: "", misturarCom: null })}>
                        Ajustar
                      </Btn>
                    </div>
                    {ajuste?.indice === i && (
                      <div className="mt-2 flex flex-col gap-1.5 pl-6">
                        <input value={ajuste.instrucao} onChange={(e) => setAjuste({ ...ajuste, instrucao: e.target.value })} placeholder='Ex.: "mais provocativa", "troca o número pelo da loja", "tira a pergunta"' className={cn(inputCls, "h-7 text-[11px]")} />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select value={ajuste.misturarCom ?? ""} onChange={(e) => setAjuste({ ...ajuste, misturarCom: e.target.value === "" ? null : Number(e.target.value) })} className={cn(selectCls, "h-7 w-auto text-[10.5px]")} aria-label="Misturar com">
                            <option value="">Sem mistura</option>
                            {editorial.headlines!.map((_, j) => j !== i && <option key={j} value={j}>{`Misturar com a ${j + 1}`}</option>)}
                          </select>
                          <Btn small prominent loading={ocupado === "ajustar"} onClick={ajustar}>
                            Reescrever esta
                          </Btn>
                          {erro?.onde === "ajustar" && <span className="text-[10.5px] text-[var(--ops-neg)]">{erro.msg}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn icon={RefreshCw} loading={ocupado === "headlines"} onClick={() => gerarHeadlines("criar")}>
                Refazer as 10
              </Btn>
              {contexto.capaAtual?.titulo && (
                <Btn icon={Wand2} loading={ocupado === "headlines"} onClick={() => gerarHeadlines("diagnosticar")}>
                  Diagnosticar a atual
                </Btn>
              )}
            </div>
          </>
        )}
      </Secao>

      {/* 4. Espinha */}
      <Secao n={4} titulo="Espinha dorsal" aberta={aberta === "espinha"} onToggle={() => setAberta(aberta === "espinha" ? "" : "espinha")} feita={feita("espinha")} compacto={compacto}>
        {erro?.onde === "espinha" && <Erro msg={erro.msg} onRetry={() => montarEspinha(Boolean(editorial.espinha))} />}
        {!editorial.espinha ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-[var(--ops-mut)]">Hook, mecanismo, prova, aplicação, direção e fechamento — aprovados ANTES da copy. Os {papeisDoMeio.length} frames do meio recebem: {papeisDoMeio.join(" → ")}.</div>
            <Btn prominent icon={Sparkles} loading={ocupado === "espinha"} disabled={!escolhida || !editorial.triagem} onClick={() => montarEspinha(false)}>
              Montar espinha
            </Btn>
            {!escolhida && <div className="text-[10.5px] text-[var(--ops-warn)]">Escolha uma headline primeiro.</div>}
          </div>
        ) : (
          <>
            {(
              [
                ["hook", "Hook"],
                ["mecanismo", "Mecanismo"],
                ["aplicacao", "Aplicação"],
                ["direcao", "Direção"],
                ["fechamento", "Fechamento"],
              ] as Array<[keyof Espinha, string]>
            ).map(([k, l]) => (
              <div key={k}>
                <CtLabel>{l}</CtLabel>
                <textarea value={String(editorial.espinha?.[k] ?? "")} onChange={(e) => setEspinha({ [k]: e.target.value } as Partial<Espinha>)} rows={3} className={cn(textareaCls, "mt-1 text-[11.5px]")} />
              </div>
            ))}
            <div>
              <CtLabel>Prova (uma por linha)</CtLabel>
              <textarea value={editorial.espinha.prova.join("\n")} onChange={(e) => setEspinha({ prova: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={3} className={cn(textareaCls, "mt-1 text-[11.5px]")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <input value={instrucaoEspinha} onChange={(e) => setInstrucaoEspinha(e.target.value)} placeholder='Refazer com direção, ex.: "prova mais concreta", "aplicação com a conta da loja"' className={cn(inputCls, "h-7 text-[11px]")} />
              <div className="flex flex-wrap gap-1.5">
                <Btn icon={RefreshCw} loading={ocupado === "espinha"} onClick={() => montarEspinha(true)}>
                  Refazer espinha
                </Btn>
                {onGerarCopy && (
                  <Btn
                    prominent
                    icon={Sparkles}
                    loading={ocupado === "copy"}
                    onClick={async () => {
                      setOcupado("copy")
                      setErro(null)
                      try {
                        await onGerarCopy()
                        setAberta("revisao")
                      } catch (e) {
                        falha("copy", e)
                      } finally {
                        setOcupado(null)
                      }
                    }}
                  >
                    Gerar copy pela espinha
                  </Btn>
                )}
              </div>
              {erro?.onde === "copy" && <Erro msg={erro.msg} />}
            </div>
          </>
        )}
      </Secao>

      {/* 5/6. Copy + Revisão (só no editor) */}
      {onRevisar && (
        <Secao n={5} titulo={editorial.revisao ? `Revisão · ${editorial.revisao.aprovado ? "aprovada" : "reprovada"}` : "Revisão"} aberta={aberta === "revisao" || aberta === "copy"} onToggle={() => setAberta(aberta === "revisao" || aberta === "copy" ? "" : "revisao")} feita={Boolean(editorial.revisao?.aprovado)} compacto={compacto}>
          {erro?.onde === "revisar" && <Erro msg={erro.msg} />}
          <div className="text-[11px] text-[var(--ops-mut)]">7 parâmetros com nota (mínimo 8) e o filtro editorial por código, com o trecho que reprovou. A reescrita só entra com o seu clique.</div>
          <Btn
            prominent
            icon={Sparkles}
            loading={ocupado === "revisar"}
            onClick={async () => {
              setOcupado("revisar")
              setErro(null)
              try {
                await onRevisar()
              } catch (e) {
                falha("revisar", e)
              } finally {
                setOcupado(null)
              }
            }}
          >
            {editorial.revisao ? "Revisar de novo" : "Revisar copy"}
          </Btn>
          {editorial.revisao && <RevisaoView key={editorial.revisao.em} revisao={editorial.revisao} frames={contexto.frames} onAplicarReescrita={onAplicarReescrita} onIrParaFrame={onIrParaFrame} />}
        </Secao>
      )}
    </div>
  )
}

function RevisaoView({ revisao, frames, onAplicarReescrita, onIrParaFrame }: { revisao: RevisaoEditorial; frames: MotorContexto["frames"]; onAplicarReescrita?: Props["onAplicarReescrita"]; onIrParaFrame?: Props["onIrParaFrame"] }) {
  const [aplicadas, setAplicadas] = useState<Set<string>>(new Set())
  const labelDe = (id?: string) => frames.find((f) => f.frameId === id)?.label ?? id ?? "legenda"
  const porFrame = new Map<string, ViolacaoEditorial[]>()
  for (const v of revisao.violacoes) {
    const k = v.frameId ?? "legenda"
    porFrame.set(k, [...(porFrame.get(k) ?? []), v])
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn("rounded-lg px-2.5 py-2 text-[11.5px] font-medium", revisao.aprovado ? "bg-[var(--ops-pos)]/10 text-[var(--ops-pos)]" : "bg-[var(--ops-warn-bg)] text-[var(--ops-warn)]")}>{revisao.resumo}</div>
      <div className="grid grid-cols-1 gap-1">
        {revisao.parametros.map((p) => {
          const meta = PARAMETROS.find((x) => x.id === p.id)
          const ok = p.nota >= 8
          return (
            <div key={p.id} className="rounded-md border border-[var(--ops-border)] px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className={cn("w-6 text-center text-[11px] font-bold", ok ? "text-[var(--ops-pos)]" : "text-[var(--ops-neg)]")} style={TNUM}>
                  {p.nota}
                </span>
                <span className="text-[11.5px] font-medium text-[var(--ops-title)]">{meta?.nome ?? p.id}</span>
              </div>
              {p.problemas.length > 0 && (
                <ul className="m-0 mt-1 list-disc pl-8 text-[10.5px] leading-[1.45] text-[var(--ops-sec)]">
                  {p.problemas.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {revisao.slides.filter((s) => s.nota < 8 || s.problemas.length || s.reescrita).length > 0 && (
        <div>
          <CtLabel>Por slide</CtLabel>
          <div className="mt-1 flex flex-col gap-1.5">
            {revisao.slides
              .filter((s) => s.nota < 8 || s.problemas.length || s.reescrita)
              .map((s) => (
                <div key={s.frameId} className="rounded-md border border-[var(--ops-border)] px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-6 text-center text-[11px] font-bold", s.nota >= 8 ? "text-[var(--ops-pos)]" : "text-[var(--ops-neg)]")} style={TNUM}>
                      {s.nota}
                    </span>
                    <button type="button" onClick={() => onIrParaFrame?.(s.frameId)} className="text-[11.5px] font-medium text-[var(--ops-title)] hover:underline">
                      {labelDe(s.frameId)}
                    </button>
                    <span className="flex-1" />
                    {s.reescrita && onAplicarReescrita && (
                      <Btn
                        small
                        prominent={!aplicadas.has(s.frameId)}
                        disabled={aplicadas.has(s.frameId)}
                        onClick={() => {
                          onAplicarReescrita(s.frameId, s.reescrita!)
                          setAplicadas((a) => new Set(a).add(s.frameId))
                        }}
                      >
                        {aplicadas.has(s.frameId) ? "Aplicada" : "Aplicar reescrita"}
                      </Btn>
                    )}
                  </div>
                  {s.problemas.length > 0 && <div className="mt-1 pl-8 text-[10.5px] leading-[1.45] text-[var(--ops-sec)]">{s.problemas.join(" · ")}</div>}
                  {(porFrame.get(s.frameId) ?? []).map((v, i) => (
                    <div key={i} className="mt-1 pl-8 text-[10.5px] leading-[1.45] text-[var(--ops-sec)]">
                      <span className={cn("font-semibold", v.severidade === "erro" ? "text-[var(--ops-neg)]" : "text-[var(--ops-warn)]")}>{v.nome}</span>: “{v.trecho}” → {v.sugestao}
                    </div>
                  ))}
                  {s.reescrita && (
                    <div className="mt-1.5 rounded bg-[var(--ops-tile)] px-2 py-1.5 text-[10.5px] leading-[1.45] text-[var(--ops-text)]">
                      {Object.entries(s.reescrita)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}>
                            <span className="font-semibold">{k}:</span> {v}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
      {(porFrame.get("legenda") ?? []).length > 0 && (
        <div>
          <CtLabel>Legenda</CtLabel>
          {(porFrame.get("legenda") ?? []).map((v, i) => (
            <div key={i} className="mt-1 text-[10.5px] leading-[1.45] text-[var(--ops-sec)]">
              <span className={cn("font-semibold", v.severidade === "erro" ? "text-[var(--ops-neg)]" : "text-[var(--ops-warn)]")}>{v.nome}</span>: “{v.trecho}” → {v.sugestao}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
