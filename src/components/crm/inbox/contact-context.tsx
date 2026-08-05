"use client"

/**
 * Contexto do contato no topo da conversa: com quem se está falando e o
 * que essa pessoa é no CRM (negócio, lead, cliente).
 *
 * A rota de detalhe sempre devolveu `lead`, `deal`, `client` e
 * `contact_avatar_url` — e a tela não renderizava nada disso. O
 * atendente respondia sem saber se era um lead frio, um negócio de
 * R$ 20 mil em negociação ou um cliente ativo. Custo zero de backend.
 */

import Link from "next/link"
import { Briefcase, Building2, ExternalLink, UserRound } from "lucide-react"
import { ROUTES } from "@/lib/routes"
import type { ThreadDetail } from "@/types/crm-inbox"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

const DEAL_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: "Em aberto", bg: "var(--crm-info-bg)", fg: "var(--crm-info)" },
  won: { label: "Ganho", bg: "var(--crm-pos-bg)", fg: "var(--crm-pos)" },
  lost: { label: "Perdido", bg: "var(--crm-neg-bg)", fg: "var(--crm-neg)" },
}

function Chip({
  icon,
  children,
  href,
  title,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  href?: string
  title?: string
}) {
  const inner = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0" style={{ color: "var(--crm-gray-500)" }}>
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {href && <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />}
    </span>
  )
  const style: React.CSSProperties = {
    fontSize: "var(--crm-text-xs)",
    color: "var(--crm-gray-700)",
    background: "var(--crm-gray-50)",
    border: "1px solid var(--crm-gray-200)",
    borderRadius: "var(--crm-radius-sm, 4px)",
    padding: "2px 8px",
    maxWidth: "100%",
  }
  if (!href) {
    return (
      <span className="inline-flex min-w-0" style={style} title={title}>
        {inner}
      </span>
    )
  }
  return (
    <Link href={href} className="inline-flex min-w-0 hover:brightness-95" style={style} title={title}>
      {inner}
    </Link>
  )
}

export function ContactContext({ thread }: { thread: ThreadDetail["thread"] }) {
  const deal = thread.deal
  const lead = thread.lead
  const client = thread.client

  if (!deal && !lead && !client) return null

  const dealTone = deal?.status ? DEAL_STATUS[deal.status] : null

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b px-4 py-1.5"
      style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
    >
      {deal && (
        <>
          <Chip
            icon={<Briefcase className="h-3 w-3" />}
            href={ROUTES.ADMIN.COMERCIAL.DEAL_DETAIL(deal.id)}
            title="Abrir o negócio"
          >
            {deal.title || "Negócio"}
            {typeof deal.value === "number" && deal.value > 0 && (
              <span style={{ color: "var(--crm-gray-500)" }}> · {brl.format(deal.value)}</span>
            )}
          </Chip>
          {dealTone && (
            <span
              className="shrink-0"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                background: dealTone.bg,
                color: dealTone.fg,
                borderRadius: "var(--crm-radius-sm, 4px)",
                padding: "2px 6px",
              }}
            >
              {dealTone.label}
            </span>
          )}
        </>
      )}

      {client && (
        <Chip icon={<Building2 className="h-3 w-3" />} title={client.email || undefined}>
          {client.name || "Cliente"}
        </Chip>
      )}

      {lead && !deal && (
        <Chip
          icon={<UserRound className="h-3 w-3" />}
          href={ROUTES.ADMIN.COMERCIAL.LEADS}
          title="Ver na base de leads"
        >
          Lead: {lead.name || "sem nome"}
          {lead.status && <span style={{ color: "var(--crm-gray-500)" }}> · {lead.status}</span>}
        </Chip>
      )}
    </div>
  )
}
