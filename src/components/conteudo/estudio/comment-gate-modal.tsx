"use client"

/**
 * "Ligar o comment gate" — a palavra do carrossel vira automação de
 * verdade: quem comenta a palavra recebe o direct e entra na pipeline.
 *
 * Até aqui o "comente SEGMENTO" era só texto no slide. O carrossel saía,
 * as pessoas comentavam e ninguém do outro lado respondia — e o autor não
 * tinha como perceber, porque nada na tela dizia que faltava alguém.
 *
 * A automação criada é a mesma do painel Instagram (mesma rota, mesmo
 * módulo puro), então ela aparece e é editável em Automações. Idempotente
 * por conteúdo: clicar duas vezes devolve a que já existe.
 */

import { useEffect, useMemo, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  IMPEDIMENTO_TEXTO,
  impedimentosDoGate,
  palavraDoDocumento,
  respostaSugerida,
} from "@/lib/conteudo/comment-gate"
import { getPipelinesDeVendas, ligarCommentGate, type PipelineDeVendas } from "@/lib/conteudo/data"
import type { Documento, Perfil } from "@/lib/conteudo/types"
import { CtBtn, CtLabel, inputCls, selectCls, textareaCls } from "../ui"

export function CommentGateModal({
  doc,
  perfil,
  onClose,
  onFeito,
}: {
  doc: Documento
  perfil?: Perfil
  onClose: () => void
  onFeito: (msg: string) => void
}) {
  const faltas = impedimentosDoGate(doc, perfil)
  const [palavra, setPalavra] = useState(() => palavraDoDocumento(doc))
  const [resposta, setResposta] = useState(() => respostaSugerida(doc))
  const [pipelineId, setPipelineId] = useState("")
  const [etapaId, setEtapaId] = useState("")
  const [ativar, setAtivar] = useState(true)
  const [pipelines, setPipelines] = useState<PipelineDeVendas[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    getPipelinesDeVendas()
      .then((ps) => {
        if (!vivo) return
        setPipelines(ps)
        // Etapa padrão: a primeira ABERTA do funil — negócio novo não
        // pode nascer em Ganho nem em Perdido.
        const p = ps[0]
        if (!p) return
        setPipelineId(p.id)
        const ordenadas = [...p.stages].sort((a, b) => a.order - b.order)
        const aberta = ordenadas.find((s) => s.stage_type !== "won" && s.stage_type !== "lost")
        setEtapaId(aberta?.id ?? ordenadas[0]?.id ?? "")
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não consegui carregar as pipelines de vendas.")
      })
    return () => {
      vivo = false
    }
  }, [])

  const etapas = useMemo(() => {
    const p = pipelines?.find((x) => x.id === pipelineId)
    return [...(p?.stages ?? [])].sort((a, b) => a.order - b.order)
  }, [pipelines, pipelineId])

  const pronto = faltas.length === 0 && palavra.trim() !== "" && resposta.trim() !== "" && pipelineId !== "" && etapaId !== ""

  const ligar = async () => {
    if (!pronto || !perfil || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      const r = await ligarCommentGate({
        canalId: perfil.id,
        palavra: palavra.trim(),
        resposta: resposta.trim(),
        pipelineId,
        etapaId,
        ativar,
      })
      onFeito(
        r.already_exists
          ? `Essa automação já existia e continua valendo: ${r.name}`
          : `Comment gate ligado${r.is_active ? "" : " (criado pausado)"} · ${r.name}`,
      )
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ligar o comment gate.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(9,10,14,0.5)] p-4" role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-[460px] max-w-full flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] px-[22px] py-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
        <div>
          <div className="text-[15px] font-semibold text-[var(--ops-title)]">Ligar o comment gate</div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">
            Quem comentar a palavra recebe sua mensagem no direct e entra como negócio na pipeline.
            {perfil ? ` Responde pela conta ${perfil.handle ?? perfil.nome}.` : ""}
          </div>
        </div>

        {faltas.length > 0 && (
          <div className="rounded-[9px] border border-[var(--ops-warn)]/40 bg-[var(--ops-warn)]/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--ops-warn)]">
            {faltas.map((f) => (
              <div key={f}>{IMPEDIMENTO_TEXTO[f]}</div>
            ))}
          </div>
        )}

        <div>
          <CtLabel>Palavra do comentário</CtLabel>
          <input value={palavra} onChange={(e) => setPalavra(e.target.value.toUpperCase())} placeholder="Ex.: SEGMENTO" className={cn(inputCls, "h-9 font-semibold")} />
          <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">
            Casa por palavra inteira, sem ligar para caixa nem acento. Separe variantes por vírgula (SEGMENTO, SEGMENTAR) — o público raramente escreve como a gente previu.
          </div>
        </div>

        <div>
          <CtLabel>Resposta no direct</CtLabel>
          <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={4} className={cn(textareaCls, "text-[11.5px]")} />
          <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">
            A Meta permite uma resposta por comentário, dentro de 7 dias. Coloque aqui o link ou o material que você prometeu.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <CtLabel>Pipeline</CtLabel>
            <select
              value={pipelineId}
              onChange={(e) => {
                setPipelineId(e.target.value)
                const p = pipelines?.find((x) => x.id === e.target.value)
                const ordenadas = [...(p?.stages ?? [])].sort((a, b) => a.order - b.order)
                const aberta = ordenadas.find((s) => s.stage_type !== "won" && s.stage_type !== "lost")
                setEtapaId(aberta?.id ?? ordenadas[0]?.id ?? "")
              }}
              className={cn(selectCls, "h-9")}
            >
              {!pipelines && <option value="">Carregando…</option>}
              {pipelines?.length === 0 && <option value="">Nenhuma pipeline de vendas</option>}
              {pipelines?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <CtLabel>Etapa de entrada</CtLabel>
            <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className={cn(selectCls, "h-9")}>
              {etapas.length === 0 && <option value="">—</option>}
              {etapas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--ops-title)]">
          <input type="checkbox" checked={ativar} onChange={(e) => setAtivar(e.target.checked)} className="accent-[var(--ops-accent)]" />
          Ativar agora
        </label>

        <div className="text-[10.5px] leading-relaxed text-[var(--ops-mut)]">
          Vale para comentários em <strong>qualquer publicação</strong> desta conta que tragam a palavra — não só neste carrossel. Quem manda a palavra por direct não entra (o combinado no slide é comentar). Comentário seu na própria conta não dispara nada. A automação fica em Automações do CRM, onde dá para editar o texto, trocar a etapa ou pausar.
        </div>

        {erro && <div className="text-[11.5px] text-[var(--ops-neg)]">{erro}</div>}

        <div className="mt-1 flex justify-end gap-2">
          <CtBtn onClick={onClose}>Cancelar</CtBtn>
          <CtBtn kind="primary" icon={MessageCircle} onClick={() => void ligar()} disabled={!pronto || salvando}>
            {salvando ? "Ligando…" : "Ligar comment gate"}
          </CtBtn>
        </div>
      </div>
    </div>
  )
}
