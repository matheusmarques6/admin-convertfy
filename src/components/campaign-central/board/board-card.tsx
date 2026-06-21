"use client"

import { Check, X, Edit3, Layers, Send, ArrowRight, GripVertical } from "lucide-react"
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd"
import { Badge } from "@/components/ui/badge"
import type { BoardCard, BoardColumnKey } from "@/types/campaign-board"
import type { CampaignSuggestionType } from "@/types/campaign-central"
import type { ProductionDesigner } from "@/types/campaign-production"
import { BOARD_COLUMNS } from "@/lib/services/campaign-central/board-mapping"
import { storeBrand, storeInitials, designerInitials } from "../production/helpers"

const TYPE_META: Record<
  CampaignSuggestionType,
  { label: string; tone: "info" | "positive" | "warning" | "neutral" }
> = {
  data: { label: "Data sazonal", tone: "info" },
  tema: { label: "Tema em alta", tone: "neutral" },
  email: { label: "Email campeão", tone: "positive" },
  performance: { label: "Performance", tone: "warning" },
  avulsa: { label: "Avulsa", tone: "neutral" },
}

const COLUMN_COLOR: Record<BoardColumnKey, string> = BOARD_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = c.color
    return acc
  },
  {} as Record<BoardColumnKey, string>,
)

/** Próxima ação (botão primário) por coluna — espelha KB_NEXT do protótipo. */
const NEXT_ACTION: Partial<
  Record<BoardColumnKey, { to: BoardColumnKey; label: string; icon: "check" | "arrow" | "send" }>
> = {
  sugestao: { to: "aprovada", label: "Aprovar", icon: "check" },
  aprovada: { to: "copy", label: "Iniciar copy", icon: "arrow" },
  copy: { to: "design", label: "Concluir copy", icon: "arrow" },
  design: { to: "revisao", label: "Concluir design", icon: "arrow" },
  revisao: { to: "agendada", label: "Aprovar revisão", icon: "check" },
  agendada: { to: "enviada", label: "Marcar enviada", icon: "send" },
}

const DESIGNER_COLUMNS: BoardColumnKey[] = ["design", "revisao", "agendada", "enviada"]

function StoreGlyph({ name, size = 22 }: { name: string; size?: number }) {
  const b = storeBrand(name)
  return (
    <span
      style={{
        width: size,
        height: size,
        background: b.primary,
        fontSize: Math.round(size * 0.36),
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-[6px] font-bold text-white"
    >
      {storeInitials(name)}
    </span>
  )
}

function StoreStack({ targets }: { targets: BoardCard["targets"] }) {
  return (
    <div className="flex items-center">
      {targets.slice(0, 4).map((s, i) => (
        <span
          key={s.store_id || s.store_name + i}
          className="relative rounded-[6px] border-2 border-card"
          style={{ marginLeft: i === 0 ? 0 : -7, zIndex: 5 - i }}
        >
          <StoreGlyph name={s.store_name} />
        </span>
      ))}
      {targets.length > 4 && (
        <span className="ml-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          +{targets.length - 4}
        </span>
      )}
    </div>
  )
}

function formatSendDate(iso: string): string {
  const [, m, d] = iso.split("-")
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${d}/${months[Number(m) - 1] ?? m}`
}

interface Props {
  card: BoardCard
  designers: ProductionDesigner[]
  dragging?: boolean
  /** Drag handle props do @hello-pangea/dnd (aplicados no grip do card). */
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, to: BoardColumnKey) => void
  onReject: (card: BoardCard) => void
  onCopy: (card: BoardCard) => void
  onWorkspace: (card: BoardCard) => void
}

export function BoardCardView({
  card,
  designers,
  dragging,
  dragHandleProps,
  onOpen,
  onMove,
  onReject,
  onCopy,
  onWorkspace,
}: Props) {
  const meta = TYPE_META[card.type] ?? TYPE_META.avulsa
  const next = NEXT_ACTION[card.column]
  const urgent = card.send_in != null && card.send_in >= 0 && card.send_in <= 3 && !!card.send_date

  // Designer dominante (primeiro com designer atribuído) pra mostrar no footer.
  const designerId = card.stores.find((s) => s.designer_id)?.designer_id ?? null
  const designer = designerId ? designers.find((d) => d.id === designerId) ?? null : null
  const showDesigner = DESIGNER_COLUMNS.includes(card.column) && designer

  // Gate de "Sugestão → Aprovada": exige piloto 'good'. Pré-desabilita o botão.
  const approveBlocked = card.column === "sugestao" && !card.has_pilot_good

  const confColor =
    (card.confidence ?? 0) >= 85
      ? "text-emerald-600"
      : (card.confidence ?? 0) >= 75
        ? "text-primary"
        : "text-amber-600"

  return (
    <div
      onClick={() => onOpen(card)}
      className="cursor-pointer rounded-[6px] border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{
        borderLeft: `3px solid ${COLUMN_COLOR[card.column]}`,
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {/* Top badges + handle/confidence */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={meta.tone}>{meta.label}</Badge>
        {card.low_perf && (
          <Badge variant="negative" showDot>
            Baixa perf.
          </Badge>
        )}
        <div className="flex-1" />
        {card.column === "sugestao" && card.confidence != null ? (
          <span className={`text-[11px] font-bold tabular-nums ${confColor}`} title="Confiança da IA">
            {card.confidence}%
          </span>
        ) : (
          <span
            {...(dragHandleProps ?? {})}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab text-muted-foreground/50 active:cursor-grabbing"
            title="Arraste para mover"
          >
            <GripVertical size={14} />
          </span>
        )}
      </div>

      {/* Title */}
      <div className="mb-1.5 text-[14px] font-semibold leading-snug tracking-tight text-foreground">
        {card.title}
      </div>
      {/* Subject */}
      {card.subject && (
        <div className="mb-2.5 truncate text-[11.5px] leading-snug text-muted-foreground">
          &ldquo;{card.subject}&rdquo;
        </div>
      )}

      {/* Meta: stores + date/count */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <StoreStack targets={card.targets} />
        <span
          className={`shrink-0 whitespace-nowrap text-[10.5px] tabular-nums ${
            urgent ? "font-bold text-amber-600" : "font-medium text-muted-foreground"
          }`}
        >
          {card.send_date
            ? formatSendDate(card.send_date)
            : `${card.targets.length} loja${card.targets.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Copies de produção geradas */}
      {card.production_copy_count > 0 && (
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-[5px] border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary">
          <Edit3 size={10} /> {card.production_copy_count} copies de produção
        </div>
      )}

      {/* Footer: designer + actions */}
      <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
        {showDesigner && designer && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
              {designerInitials(designer.name)}
            </span>
            <span className="max-w-[70px] truncate text-[11px] text-muted-foreground">
              {designer.name.split(" ")[0]}
            </span>
          </div>
        )}
        <div className="flex-1" />

        {card.column === "sugestao" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onReject(card)
            }}
            title="Rejeitar"
            className="inline-flex rounded-[5px] p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        )}
        {card.column === "copy" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCopy(card)
            }}
            className="inline-flex items-center gap-1 rounded-[5px] border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-foreground/30"
          >
            <Edit3 size={12} /> Copy
          </button>
        )}
        {card.column === "design" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onWorkspace(card)
            }}
            className="inline-flex items-center gap-1 rounded-[5px] border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-foreground/30"
          >
            <Layers size={12} /> Abrir
          </button>
        )}

        {next ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (approveBlocked) return
              onMove(card, next.to)
            }}
            disabled={approveBlocked}
            title={
              approveBlocked
                ? "Gere a copy de teste e marque ao menos 1 loja como 'Boa' antes de aprovar."
                : undefined
            }
            className="inline-flex items-center gap-1 rounded-[5px] bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {next.icon === "check" && <Check size={12} />}
            {next.icon === "arrow" && <ArrowRight size={12} />}
            {next.icon === "send" && <Send size={12} />}
            {next.label}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
            <Check size={13} /> Enviada
          </span>
        )}
      </div>
    </div>
  )
}
