import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────

type BadgeVariant = 'positive' | 'negative' | 'warning' | 'neutral' | 'info'

interface StatusBadgeProps {
  /** String de status vinda do backend — mapeamento automático para variante visual */
  status: string
  /** Override do label exibido (se não informado, usa o status capitalizado) */
  label?: string
  /** Se false, esconde o dot. Default true */
  showDot?: boolean
  className?: string
}

// ─── Status Map ──────────────────────────────────────────

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  // === Positive (ativo, sucesso, concluído) ===
  active: { variant: 'positive', label: 'Ativo' },
  ativo: { variant: 'positive', label: 'Ativo' },
  completed: { variant: 'positive', label: 'Concluído' },
  concluido: { variant: 'positive', label: 'Concluído' },
  done: { variant: 'positive', label: 'Concluído' },
  paid: { variant: 'positive', label: 'Pago' },
  pago: { variant: 'positive', label: 'Pago' },
  success: { variant: 'positive', label: 'Sucesso' },
  online: { variant: 'positive', label: 'Online' },
  connected: { variant: 'positive', label: 'Conectado' },
  sent: { variant: 'positive', label: 'Enviado' },
  enviado: { variant: 'positive', label: 'Enviado' },
  published: { variant: 'positive', label: 'Publicado' },
  approved: { variant: 'positive', label: 'Aprovado' },
  healthy: { variant: 'positive', label: 'Saudável' },

  // === Negative (erro, falha, churn) ===
  failed: { variant: 'negative', label: 'Falhou' },
  error: { variant: 'negative', label: 'Erro' },
  erro: { variant: 'negative', label: 'Erro' },
  churned: { variant: 'negative', label: 'Churned' },
  cancelled: { variant: 'negative', label: 'Cancelado' },
  cancelado: { variant: 'negative', label: 'Cancelado' },
  rejected: { variant: 'negative', label: 'Rejeitado' },
  overdue: { variant: 'negative', label: 'Atrasado' },
  atrasado: { variant: 'negative', label: 'Atrasado' },
  disconnected: { variant: 'negative', label: 'Desconectado' },
  expired: { variant: 'negative', label: 'Expirado' },
  critical: { variant: 'negative', label: 'Crítico' },

  // === Warning (atenção, risco, pendente) ===
  'at-risk': { variant: 'warning', label: 'Em Risco' },
  at_risk: { variant: 'warning', label: 'Em Risco' },
  'em-risco': { variant: 'warning', label: 'Em Risco' },
  paused: { variant: 'warning', label: 'Pausado' },
  pausado: { variant: 'warning', label: 'Pausado' },
  pending: { variant: 'warning', label: 'Pendente' },
  pendente: { variant: 'warning', label: 'Pendente' },
  warning: { variant: 'warning', label: 'Atenção' },
  review: { variant: 'warning', label: 'Em Revisão' },
  'in-review': { variant: 'warning', label: 'Em Revisão' },
  pending_review: { variant: 'warning', label: 'Em Revisão' },
  processing: { variant: 'warning', label: 'Processando' },
  queued: { variant: 'warning', label: 'Na Fila' },
  retry: { variant: 'warning', label: 'Retry' },

  // === Neutral (rascunho, inativo, arquivado) ===
  draft: { variant: 'neutral', label: 'Rascunho' },
  rascunho: { variant: 'neutral', label: 'Rascunho' },
  inactive: { variant: 'neutral', label: 'Inativo' },
  inativo: { variant: 'neutral', label: 'Inativo' },
  archived: { variant: 'neutral', label: 'Arquivado' },
  arquivado: { variant: 'neutral', label: 'Arquivado' },
  unknown: { variant: 'neutral', label: 'Desconhecido' },
  none: { variant: 'neutral', label: '—' },
  closed: { variant: 'neutral', label: 'Fechado' },

  // === Info (live, scheduled, sync) ===
  live: { variant: 'info', label: 'Live' },
  scheduled: { variant: 'info', label: 'Agendado' },
  agendado: { variant: 'info', label: 'Agendado' },
  syncing: { variant: 'info', label: 'Sincronizando' },
  'in-progress': { variant: 'info', label: 'Em Andamento' },
  in_progress: { variant: 'info', label: 'Em Andamento' },
  'em-andamento': { variant: 'info', label: 'Em Andamento' },
  running: { variant: 'info', label: 'Executando' },
  open: { variant: 'info', label: 'Aberto' },
  new: { variant: 'info', label: 'Novo' },
  novo: { variant: 'info', label: 'Novo' },
}

function getStatusConfig(status: string): { variant: BadgeVariant; label: string } {
  const normalized = status.toLowerCase().trim()
  return STATUS_MAP[normalized] ?? { variant: 'neutral', label: status }
}

// ─── Component ───────────────────────────────────────────

export function StatusBadge({ status, label, showDot = true, className }: StatusBadgeProps) {
  const config = getStatusConfig(status)

  return (
    <Badge
      variant={config.variant}
      showDot={showDot}
      className={cn(className)}
    >
      {label ?? config.label}
    </Badge>
  )
}

export { STATUS_MAP, getStatusConfig }
export type { BadgeVariant, StatusBadgeProps }
