"use client"

/**
 * Card da biblioteca: capa, plataforma, duração, título, origem.
 *
 * Enquanto processa, mostra a barra de QUATRO SEGMENTOS NOMEADOS. A etapa
 * de transcrição fica em andamento SEM número, porque não existe
 * porcentagem para ela — é uma chamada síncrona ao provedor. Preencher com
 * um número inventado é o que faz o usuário achar que travou.
 */

import Link from "next/link"
import { AlertTriangle, Sparkles, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { fmtDuracao, rotuloDaEtapa, segmentosDaEtapa } from "@/lib/transcricoes/pipeline"
import type { TranscricaoResumo } from "@/lib/transcricoes/types"
import { ChipPlataforma, TNUM, TrThumb } from "./ui"

interface Props {
  t: TranscricaoResumo
  selecionado: boolean
  emSelecao: boolean
  onSelecionar: (id: string, comShift: boolean) => void
  onArrastar: (id: string) => void
  onFimArrasto: () => void
}

const dataCurta = (iso: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
}

export function CardTranscricao({ t, selecionado, emSelecao, onSelecionar, onArrastar, onFimArrasto }: Props) {
  const processando = t.status === "processando" || t.status === "aguardando"
  const segmentos = segmentosDaEtapa(t.status, t.etapa, t.progresso)
  const meta = [t.canal, dataCurta(t.publicadoEm ?? t.criadoEm), t.colecaoNome].filter(Boolean).join(" · ")

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        onArrastar(t.id)
      }}
      onDragEnd={onFimArrasto}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[10px] border bg-[var(--ops-card)] transition-colors",
        selecionado ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)] hover:border-[var(--ops-accent)]/40",
      )}
    >
      {/* A caixa de seleção fica sobre a capa e só aparece no hover (ou
          quando já há seleção): o clique normal é abrir a transcrição. */}
      <label
        className={cn(
          "absolute left-2.5 top-2.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 backdrop-blur-sm transition-opacity",
          selecionado || emSelecao ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selecionado}
          aria-label={`Selecionar ${t.titulo}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSelecionar(t.id, (e.nativeEvent as MouseEvent).shiftKey)}
          className="m-0 h-3.5 w-3.5 accent-[var(--ops-accent)]"
        />
      </label>

      <Link href={ROUTES.ADMIN.TRANSCRICOES.DETAIL(t.id)} className="block">
        <TrThumb src={t.thumbUrl} alt="" className="aspect-video w-full">
          <span className="absolute left-2.5 top-2.5 opacity-100 transition-opacity group-hover:opacity-0">
            <ChipPlataforma p={t.plataforma} />
          </span>
          {t.duracaoSeg != null && (
            <span
              className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
              style={TNUM}
            >
              {fmtDuracao(t.duracaoSeg)}
            </span>
          )}
          {t.naBaseDeConhecimento && (
            <span
              title="Na base da ConvertIA"
              className="absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm"
            >
              <Icon icon={Sparkles} customSize={11} />
            </span>
          )}
        </TrThumb>
      </Link>

      <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3 pt-2.5">
        <Link
          href={ROUTES.ADMIN.TRANSCRICOES.DETAIL(t.id)}
          className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ops-title)] hover:underline"
          title={t.titulo}
        >
          {t.titulo}
        </Link>
        {meta && <div className="truncate text-[11px] text-[var(--ops-mut)]">{meta}</div>}

        {t.status === "pronta" && t.locutoresQtd != null && t.locutoresQtd > 0 && (
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-[var(--ops-sec)]">
            <Icon icon={Users} customSize={11} />
            {t.locutoresQtd} {t.locutoresQtd === 1 ? "locutor identificado" : "locutores identificados"}
          </div>
        )}

        {processando && (
          <div className="mt-auto pt-2">
            <div className="mb-1 flex items-center justify-between text-[10.5px] text-[var(--ops-sec)]">
              <span>{rotuloDaEtapa(t.status, t.etapa, t.progresso)}</span>
              {t.tentativas > 0 && <span className="text-[var(--ops-warn)]">tentativa {t.tentativas + 1}</span>}
            </div>
            <BarraEtapas segmentos={segmentos} />
          </div>
        )}

        {t.status === "erro" && t.erroMsg && (
          <div className="mt-auto flex items-start gap-1.5 pt-2 text-[11px] leading-relaxed text-[var(--ops-neg)]">
            <span className="mt-px shrink-0">
              <Icon icon={AlertTriangle} customSize={11} />
            </span>
            <span className="line-clamp-3">{t.erroMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function BarraEtapas({
  segmentos,
}: {
  segmentos: Array<{ i: number; nome: string; estado: "feita" | "atual" | "futura"; preenchimento: number | null }>
}) {
  return (
    <div className="flex gap-1" role="progressbar" aria-label="Etapas do processamento">
      {segmentos.map((s) => (
        <div key={s.i} title={s.nome} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--ops-track)]">
          {s.estado === "feita" && <span className="block h-full w-full bg-[var(--ops-accent)]" />}
          {s.estado === "atual" &&
            (s.preenchimento != null ? (
              // Etapa mensurável: a barra anda com o número real.
              <span
                className="block h-full bg-[var(--ops-accent)] transition-[width] duration-500"
                style={{ width: `${s.preenchimento}%` }}
              />
            ) : (
              // Sem porcentagem real: pulso, nunca um número inventado.
              <span className="block h-full w-full animate-pulse bg-[var(--ops-accent)]/60" />
            ))}
        </div>
      ))}
    </div>
  )
}
