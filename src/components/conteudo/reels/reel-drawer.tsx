"use client"

/**
 * Ficha do card do pipeline de Reels: título, funil, formato, duração,
 * roteiro por bloco, responsável, agendamento e — quando publicado — as
 * métricas do post REAL.
 *
 * As métricas nunca são digitadas: elas vêm do post do Instagram vinculado
 * (`ig_media_id`). Card publicado sem vínculo mostra o traço com o motivo,
 * porque "0 visualizações" e "não sabemos" são coisas diferentes.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { deleteReel, patchReel, type PatchReel } from "@/lib/conteudo/data"
import { ETAPAS, ETAPA_LABEL, FUNIL_LABEL, FUNIL_META, FUNIS, duracaoLabel } from "@/lib/conteudo/reels/pipeline"
import type { Reel, ReelRoteiroBloco } from "@/lib/conteudo/types"
import { CtBtn, CtLabel, TNUM, alpha, fmtNum, inputCls, selectCls, textareaCls } from "../ui"

const PAPEIS = ["gancho", "contexto", "virada", "prova", "cta"]

/** `datetime-local` quer "AAAA-MM-DDTHH:MM" no fuso LOCAL; ISO cru volta em UTC. */
const paraInputLocal = (iso: string | null): string => {
  if (!iso) return ""
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const doInputLocal = (v: string): string | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function Body({ reel, onClose, onMudou }: { reel: Reel; onClose: () => void; onMudou: () => void }) {
  const [titulo, setTitulo] = useState(reel.titulo)
  const [tema, setTema] = useState(reel.tema ?? "")
  const [formato, setFormato] = useState(reel.formato ?? "")
  const [duracao, setDuracao] = useState(reel.duracaoS == null ? "" : String(reel.duracaoS))
  const [agendado, setAgendado] = useState(paraInputLocal(reel.agendadoPara))
  const [roteiro, setRoteiro] = useState<ReelRoteiroBloco[]>(reel.roteiro)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    setTitulo(reel.titulo)
    setTema(reel.tema ?? "")
    setFormato(reel.formato ?? "")
    setDuracao(reel.duracaoS == null ? "" : String(reel.duracaoS))
    setAgendado(paraInputLocal(reel.agendadoPara))
    setRoteiro(reel.roteiro)
    setErro(null)
    setConfirmando(false)
  }, [reel])

  const salvar = async (campos: PatchReel) => {
    setSalvando(true)
    setErro(null)
    try {
      await patchReel(reel.id, campos)
      onMudou()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setSalvando(false)
    }
  }

  const duracaoNum = duracao.trim() === "" ? null : Number(duracao)
  const mudouCabecalho =
    titulo.trim() !== reel.titulo ||
    (tema.trim() || null) !== reel.tema ||
    (formato.trim() || null) !== reel.formato ||
    duracaoNum !== reel.duracaoS ||
    doInputLocal(agendado) !== reel.agendadoPara

  const salvarCabecalho = () =>
    salvar({
      titulo: titulo.trim(),
      tema: tema.trim() || null,
      formato: formato.trim() || null,
      duracaoS: duracaoNum != null && Number.isFinite(duracaoNum) && duracaoNum > 0 ? Math.round(duracaoNum) : null,
      agendadoPara: doInputLocal(agendado),
    })

  const cor = FUNIL_META[reel.funil].cor
  const roteiroMudou = JSON.stringify(roteiro) !== JSON.stringify(reel.roteiro)

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-start gap-2 border-b border-[var(--ops-border)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: cor, background: alpha(cor, 0.12) }}>
              {FUNIL_LABEL[reel.funil]}
            </span>
            <span className="inline-flex h-[19px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-sec)]">{ETAPA_LABEL[reel.etapa]}</span>
            {reel.duracaoS != null && (
              <span className="text-[10.5px] font-semibold text-[var(--ops-mut)]" style={TNUM}>
                {duracaoLabel(reel.duracaoS)}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-[var(--ops-title)]">{reel.titulo}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ops-mut)] hover:bg-[var(--ops-hover)] hover:text-[var(--ops-title)]">
          <Icon icon={X} customSize={14} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        {erro && (
          <div className="flex gap-2 rounded-lg border border-[var(--ops-neg)]/40 bg-[var(--ops-hover)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ops-neg)]">
            <Icon icon={AlertTriangle} customSize={12} className="mt-px shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Etapa e funil — os dois que o kanban mexe por arrasto */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <CtLabel>Etapa</CtLabel>
            <select className={selectCls} value={reel.etapa} onChange={(e) => salvar({ etapa: e.target.value as Reel["etapa"] })} disabled={salvando}>
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {ETAPA_LABEL[et]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <CtLabel>Funil</CtLabel>
            <select className={selectCls} value={reel.funil} onChange={(e) => salvar({ funil: e.target.value as Reel["funil"] })} disabled={salvando}>
              {FUNIS.map((f) => (
                <option key={f} value={f}>
                  {FUNIL_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <CtLabel>Título</CtLabel>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <CtLabel>Tema</CtLabel>
            <input className={inputCls} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Segmentação" />
          </div>
          <div>
            <CtLabel>Formato de gravação</CtLabel>
            <input className={inputCls} value={formato} onChange={(e) => setFormato(e.target.value)} placeholder="Talking head" />
          </div>
          <div>
            <CtLabel>Duração (segundos)</CtLabel>
            <input className={inputCls} value={duracao} onChange={(e) => setDuracao(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="45" />
          </div>
          <div>
            <CtLabel>Agendado para</CtLabel>
            <input type="datetime-local" className={inputCls} value={agendado} onChange={(e) => setAgendado(e.target.value)} />
          </div>
        </div>

        {mudouCabecalho && (
          <CtBtn kind="primary" size="sm" onClick={salvarCabecalho} disabled={salvando || titulo.trim().length < 3} className="self-start">
            {salvando ? "Salvando…" : "Salvar alterações"}
          </CtBtn>
        )}

        {/* Roteiro */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <CtLabel className="mb-0">Roteiro</CtLabel>
            <button
              type="button"
              onClick={() => setRoteiro([...roteiro, { papel: PAPEIS[Math.min(roteiro.length, PAPEIS.length - 1)], texto: "", segundos: null }])}
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--ops-accent)] hover:underline"
            >
              <Icon icon={Plus} customSize={10} />
              bloco
            </button>
          </div>
          {roteiro.length === 0 ? (
            <div className="rounded-[9px] border border-dashed border-[var(--ops-border)] px-3 py-3 text-[11px] leading-relaxed text-[var(--ops-mut)]">
              Sem roteiro. Gancho, contexto, virada, prova e CTA — é o que a pessoa lê na hora de gravar.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {roteiro.map((b, i) => (
                <div key={i} className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-page)] p-2">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <select
                      className="h-6 rounded-md border border-[var(--ops-border)] bg-[var(--ops-card)] px-1.5 text-[10.5px] font-semibold text-[var(--ops-title)] outline-none"
                      value={b.papel}
                      onChange={(e) => setRoteiro(roteiro.map((x, j) => (j === i ? { ...x, papel: e.target.value } : x)))}
                    >
                      {[...new Set([...PAPEIS, b.papel])].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      className="h-6 w-[62px] rounded-md border border-[var(--ops-border)] bg-[var(--ops-card)] px-1.5 text-[10.5px] text-[var(--ops-title)] outline-none"
                      value={b.segundos == null ? "" : String(b.segundos)}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "")
                        setRoteiro(roteiro.map((x, j) => (j === i ? { ...x, segundos: v === "" ? null : Number(v) } : x)))
                      }}
                      placeholder="seg"
                      inputMode="numeric"
                    />
                    <span className="flex-1" />
                    <button type="button" onClick={() => setRoteiro(roteiro.filter((_, j) => j !== i))} aria-label="Remover bloco" className="text-[var(--ops-mut)] hover:text-[var(--ops-neg)]">
                      <Icon icon={X} customSize={11} />
                    </button>
                  </div>
                  <textarea
                    className={cn(textareaCls, "min-h-[52px] resize-y")}
                    value={b.texto}
                    onChange={(e) => setRoteiro(roteiro.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                    placeholder="O que é falado neste bloco"
                  />
                </div>
              ))}
            </div>
          )}
          {roteiroMudou && (
            <CtBtn kind="primary" size="sm" onClick={() => salvar({ roteiro })} disabled={salvando} className="mt-2">
              {salvando ? "Salvando…" : "Salvar roteiro"}
            </CtBtn>
          )}
        </div>

        {/* Métricas do post real */}
        {reel.etapa === "publicado" && (
          <div>
            <CtLabel>Resultado</CtLabel>
            {reel.metricas ? (
              <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Visualizações</div>
                    <div className="text-[15px] font-semibold text-[var(--ops-title)]" style={TNUM}>
                      {reel.metricas.views == null ? "—" : fmtNum(reel.metricas.views)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Alcance</div>
                    <div className="text-[15px] font-semibold text-[var(--ops-title)]" style={TNUM}>
                      {reel.metricas.alcance == null ? "—" : fmtNum(reel.metricas.alcance)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] leading-relaxed text-[var(--ops-mut)]">Lidas da conta conectada. Os leads deste post ficam no Dashboard, onde a atribuição por comentário é calculada.</div>
                {reel.metricas.permalink && (
                  <a href={reel.metricas.permalink} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ops-accent)] hover:underline">
                    <Icon icon={ExternalLink} customSize={11} />
                    Ver no Instagram
                  </a>
                )}
              </div>
            ) : (
              <div className="rounded-[9px] border border-dashed border-[var(--ops-border)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--ops-mut)]">
                Este card não está ligado a um post do Instagram, então não há número para mostrar. O vínculo acontece quando a publicação é identificada na conta conectada.
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        <div className="border-t border-[var(--ops-border)] pt-3">
          {confirmando ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--ops-sec)]">Excluir este card?</span>
              <span className="flex-1" />
              <CtBtn kind="ghost" size="sm" onClick={() => setConfirmando(false)}>
                Cancelar
              </CtBtn>
              <CtBtn
                kind="danger"
                size="sm"
                icon={salvando ? Loader2 : Trash2}
                disabled={salvando}
                onClick={async () => {
                  setSalvando(true)
                  try {
                    await deleteReel(reel.id)
                    onClose()
                    onMudou()
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : "Falha ao excluir")
                    setSalvando(false)
                  }
                }}
              >
                Excluir
              </CtBtn>
            </div>
          ) : (
            <CtBtn kind="ghost" size="sm" icon={Trash2} onClick={() => setConfirmando(true)}>
              Excluir card
            </CtBtn>
          )}
        </div>
      </div>
    </div>
  )
}

export function ReelDrawer({ reel, onClose, onMudou }: { reel: Reel | null; onClose: () => void; onMudou: () => void }) {
  const desktop = useMediaQuery("(min-width: 1024px)")
  if (!reel) return null
  if (desktop) {
    return (
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[var(--ops-border)] bg-[var(--ops-card)]" aria-label="Ficha do reel">
        <Body reel={reel} onClose={onClose} onMudou={onMudou} />
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[360px] max-w-full overflow-y-auto border-[var(--ops-border)] bg-[var(--ops-card)] p-0">
        <SheetTitle className="sr-only">Ficha do reel</SheetTitle>
        <Body reel={reel} onClose={onClose} onMudou={onMudou} />
      </SheetContent>
    </Sheet>
  )
}
