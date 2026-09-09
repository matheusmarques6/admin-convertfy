"use client"

/**
 * Ficha da ideia: os dois julgamentos lado a lado (score da IA e voto do
 * time), o porquê, o molde sugerido e as três saídas — pipeline de Reels,
 * carrossel no Estúdio, arquivo.
 *
 * Score e voto ficam SEPARADOS de propósito: somá-los num "score final"
 * apagaria a informação mais útil da tela, que é onde a máquina e o time
 * discordam. Ideia não avaliada mostra o traço, não zero.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Archive, Film, Loader2, Sparkles, Trash2, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { deleteIdeia, enviarIdeiaParaReels, patchIdeia, patchReel, votarIdeia } from "@/lib/conteudo/data"
import { fonteLabel, type Ideia } from "@/lib/conteudo/ideias/banco"
import { FUNIL_LABEL, FUNIL_META, FUNIS } from "@/lib/conteudo/reels/pipeline"
import type { EtapaFunil, Formato } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtBtn, CtFmt, CtLabel, TNUM, alpha, inputCls, selectCls } from "../ui"

const FORMATOS: Formato[] = ["Carrossel", "Reels", "Vídeo", "Imagem"]

/** `datetime-local` no fuso local (ISO cru volta em UTC e a hora muda). */
const agoraMais = (horas: number): string => {
  const d = new Date(Date.now() + horas * 3600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Body({ ideia, onClose, onMudou }: { ideia: Ideia; onClose: () => void; onMudou: () => void }) {
  const [titulo, setTitulo] = useState(ideia.titulo)
  const [funil, setFunil] = useState<EtapaFunil | "">(ideia.funil ?? "")
  const [formato, setFormato] = useState<Formato | "">(ideia.formato ?? "")
  const [votos, setVotos] = useState(ideia.votos)
  const [votei, setVotei] = useState(ideia.votei)
  const [ocupado, setOcupado] = useState<null | "salvar" | "voto" | "reels" | "agendar" | "arquivar" | "excluir">(null)
  const [erro, setErro] = useState<string | null>(null)
  const [quando, setQuando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    setTitulo(ideia.titulo)
    setFunil(ideia.funil ?? "")
    setFormato(ideia.formato ?? "")
    setVotos(ideia.votos)
    setVotei(ideia.votei)
    setErro(null)
    setQuando(null)
    setConfirmando(false)
  }, [ideia])

  const mudou = titulo.trim() !== ideia.titulo || (funil || null) !== ideia.funil || (formato || null) !== ideia.formato

  const rodar = async (chave: NonNullable<typeof ocupado>, fn: () => Promise<void>) => {
    setOcupado(chave)
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo")
    } finally {
      setOcupado(null)
    }
  }

  const votar = () =>
    rodar("voto", async () => {
      const r = await votarIdeia(ideia.id)
      setVotos(r.votos)
      setVotei(r.votei)
      onMudou()
    })

  const paraReels = () =>
    rodar("reels", async () => {
      await enviarIdeiaParaReels(ideia.id)
      onMudou()
    })

  const agendar = () =>
    rodar("agendar", async () => {
      const iso = quando ? new Date(quando).toISOString() : null
      if (!iso) throw new Error("Escolha a data e a hora.")
      const reelId = await enviarIdeiaParaReels(ideia.id)
      await patchReel(reelId, { etapa: "agendado", agendadoPara: iso })
      setQuando(null)
      onMudou()
    })

  const cor = ideia.funil ? FUNIL_META[ideia.funil].cor : "var(--ops-mut)"
  const criadoEm = new Date(ideia.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-start gap-2 border-b border-[var(--ops-border)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {ideia.funil && (
              <span className="inline-flex h-[19px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold" style={{ color: cor, background: alpha(FUNIL_META[ideia.funil].cor, 0.12) }}>
                {FUNIL_LABEL[ideia.funil]}
              </span>
            )}
            {ideia.formato && <CtFmt fmt={ideia.formato} />}
            {ideia.status === "arquivada" && <span className="inline-flex h-[19px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10px] font-semibold text-[var(--ops-mut)]">Arquivada</span>}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-[var(--ops-title)]">{ideia.titulo}</div>
          <div className="mt-1 text-[10.5px] text-[var(--ops-mut)]">
            {fonteLabel(ideia)} · {criadoEm}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ops-mut)] hover:bg-[var(--ops-hover)] hover:text-[var(--ops-title)]">
          <Icon icon={X} customSize={14} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        {erro && (
          <div className="flex gap-2 rounded-lg border border-[var(--ops-neg)]/40 bg-[var(--ops-hover)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ops-neg)]">
            <Icon icon={TriangleAlert} customSize={12} className="mt-px shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Os dois julgamentos, lado a lado e sem se misturarem */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Score da IA</div>
            <div className="mt-1 text-[19px] font-semibold leading-none text-[var(--ops-title)]" style={TNUM}>
              {ideia.score == null ? "—" : ideia.score}
            </div>
            <div className="mt-1 text-[10px] text-[var(--ops-mut)]">{ideia.score == null ? "não avaliada" : "0 a 100"}</div>
          </div>
          <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Votos do time</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[19px] font-semibold leading-none text-[var(--ops-title)]" style={TNUM}>
                {votos}
              </span>
              <button
                type="button"
                onClick={votar}
                disabled={ocupado === "voto"}
                className={cn(
                  "inline-flex h-[22px] items-center gap-1 rounded-md border px-2 text-[10.5px] font-semibold transition-colors",
                  votei ? "border-transparent bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]",
                )}
              >
                <Icon icon={ArrowUpRight} customSize={10} />
                {votei ? "votado" : "votar"}
              </button>
            </div>
            <div className="mt-1 text-[10px] text-[var(--ops-mut)]">quem quer gravar</div>
          </div>
        </div>

        {ideia.porQue && (
          <div>
            <CtLabel>Por que a IA gosta</CtLabel>
            <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-page)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-title)]">{ideia.porQue}</div>
          </div>
        )}

        {ideia.molde && (
          <div>
            <CtLabel>Molde sugerido</CtLabel>
            <div className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--ops-hover)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ops-title)]">
              <Icon icon={Sparkles} customSize={12} className="text-[var(--ops-mut)]" />
              {ideia.molde}
            </div>
          </div>
        )}

        {ideia.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ideia.tags.map((t) => (
              <span key={t} className="inline-flex h-[20px] items-center rounded-[5px] bg-[var(--ops-hover)] px-[7px] text-[10.5px] font-medium text-[var(--ops-sec)]">
                {t.startsWith("#") ? t : `#${t}`}
              </span>
            ))}
          </div>
        )}

        {/* Edição */}
        <div className="border-t border-[var(--ops-border)] pt-3">
          <CtLabel>Título</CtLabel>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div>
              <CtLabel>Funil</CtLabel>
              <select className={selectCls} value={funil} onChange={(e) => setFunil(e.target.value as EtapaFunil | "")}>
                <option value="">Sem funil</option>
                {FUNIS.map((f) => (
                  <option key={f} value={f}>
                    {FUNIL_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <CtLabel>Formato</CtLabel>
              <select className={selectCls} value={formato} onChange={(e) => setFormato(e.target.value as Formato | "")}>
                <option value="">Sem formato</option>
                {FORMATOS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {mudou && (
            <CtBtn
              kind="primary"
              size="sm"
              className="mt-2.5"
              disabled={ocupado === "salvar" || titulo.trim().length < 3}
              onClick={() =>
                rodar("salvar", async () => {
                  await patchIdeia(ideia.id, { titulo: titulo.trim(), funil: funil || null, formato: formato || null })
                  onMudou()
                })
              }
            >
              {ocupado === "salvar" ? "Salvando…" : "Salvar"}
            </CtBtn>
          )}
        </div>

        <div className="flex-1" />

        {/* Saídas */}
        <div className="flex flex-col gap-2 border-t border-[var(--ops-border)] pt-3">
          {ideia.reelId ? (
            <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">
              Já está no pipeline de Reels.{" "}
              <Link href={ROUTES.ADMIN.CONTEUDO.REELS} className="font-semibold text-[var(--ops-accent)] hover:underline">
                Abrir o pipeline
              </Link>
            </div>
          ) : (
            <CtBtn kind="primary" icon={ocupado === "reels" ? Loader2 : Film} onClick={paraReels} disabled={ocupado === "reels"} className={cn("justify-center", ocupado === "reels" && "[&_svg]:animate-spin")}>
              {ocupado === "reels" ? "Enviando…" : "Enviar para o pipeline de Reels"}
            </CtBtn>
          )}

          {quando === null ? (
            <CtBtn kind="secondary" onClick={() => setQuando(agoraMais(24))} className="justify-center">
              Agendar direto
            </CtBtn>
          ) : (
            <div className="rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-page)] p-2.5">
              <CtLabel>Quando publica</CtLabel>
              <input type="datetime-local" className={inputCls} value={quando} onChange={(e) => setQuando(e.target.value)} />
              <div className="mt-2 flex items-center gap-2">
                <CtBtn kind="ghost" size="sm" onClick={() => setQuando(null)}>
                  Cancelar
                </CtBtn>
                <span className="flex-1" />
                <CtBtn kind="primary" size="sm" onClick={agendar} disabled={ocupado === "agendar"}>
                  {ocupado === "agendar" ? "Agendando…" : "Agendar"}
                </CtBtn>
              </div>
              <div className="mt-2 text-[10px] leading-relaxed text-[var(--ops-mut)]">
                O card entra no pipeline já em &quot;agendado&quot; e aparece no calendário. A publicação continua sendo feita no app do Instagram.
              </div>
            </div>
          )}

          <Link
            href={`${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=ia&pauta=${encodeURIComponent(ideia.titulo)}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]"
          >
            <Icon icon={Sparkles} customSize={13} />
            Criar carrossel com esta pauta
          </Link>

          <div className="flex items-center gap-2 pt-1">
            {ideia.status !== "arquivada" ? (
              <CtBtn
                kind="ghost"
                size="sm"
                icon={Archive}
                disabled={ocupado === "arquivar"}
                onClick={() =>
                  rodar("arquivar", async () => {
                    await patchIdeia(ideia.id, { status: "arquivada" })
                    onClose()
                    onMudou()
                  })
                }
              >
                Arquivar
              </CtBtn>
            ) : (
              <CtBtn
                kind="ghost"
                size="sm"
                disabled={ocupado === "arquivar"}
                onClick={() =>
                  rodar("arquivar", async () => {
                    await patchIdeia(ideia.id, { status: "banco" })
                    onMudou()
                  })
                }
              >
                Devolver ao banco
              </CtBtn>
            )}
            <span className="flex-1" />
            {confirmando ? (
              <>
                <span className="text-[11px] text-[var(--ops-sec)]">Excluir?</span>
                <CtBtn kind="ghost" size="sm" onClick={() => setConfirmando(false)}>
                  Não
                </CtBtn>
                <CtBtn
                  kind="danger"
                  size="sm"
                  disabled={ocupado === "excluir"}
                  onClick={() =>
                    rodar("excluir", async () => {
                      await deleteIdeia(ideia.id)
                      onClose()
                      onMudou()
                    })
                  }
                >
                  Sim
                </CtBtn>
              </>
            ) : (
              <CtBtn kind="ghost" size="sm" icon={Trash2} onClick={() => setConfirmando(true)}>
                Excluir
              </CtBtn>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function IdeiaDrawer({ ideia, onClose, onMudou }: { ideia: Ideia | null; onClose: () => void; onMudou: () => void }) {
  const desktop = useMediaQuery("(min-width: 1024px)")
  if (!ideia) return null
  if (desktop) {
    return (
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[var(--ops-border)] bg-[var(--ops-card)]" aria-label="Ficha da ideia">
        <Body ideia={ideia} onClose={onClose} onMudou={onMudou} />
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[360px] max-w-full overflow-y-auto border-[var(--ops-border)] bg-[var(--ops-card)] p-0">
        <SheetTitle className="sr-only">Ficha da ideia</SheetTitle>
        <Body ideia={ideia} onClose={onClose} onMudou={onMudou} />
      </SheetContent>
    </Sheet>
  )
}
