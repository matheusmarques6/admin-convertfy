"use client"

/**
 * Painel de contexto da conversa (coluna direita do design v3):
 * identidade do contato, Origem (canal/conta/atribuída), vínculos de
 * CRM (lead/negócio/cliente — ou criar lead desta conversa), Tags,
 * Janela de 24h com barra e Status da conversa.
 *
 * Em containers largos (>=1240px) é coluna fixa; abaixo disso vira
 * overlay aberto pelo botão de detalhes do header.
 */

import { useState } from "react"
import Link from "next/link"
import { Briefcase, ChevronRight, Plus, Store, UserPlus, X } from "lucide-react"
import { ROUTES } from "@/lib/routes"
import type { ThreadDetail } from "@/types/crm-inbox"
import {
  AvatarWithChannel,
  ChLabel,
  channelSubLabel,
  threadKind,
  windowHoursLeft,
  TNUM,
} from "./inbox-theme"
import { ThreadTags } from "./thread-tags"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

const DEAL_STATUS: Record<string, string> = { open: "Em aberto", won: "Ganho", lost: "Perdido" }

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9.5px] font-[650] uppercase tracking-[0.08em]"
      style={{ color: "var(--ops-mut)" }}
    >
      {children}
    </div>
  )
}

function CrmCard({
  icon,
  title,
  sub,
  href,
  onClick,
  busy,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  href?: string
  onClick?: () => void
  busy?: boolean
}) {
  const inner = (
    <>
      <span
        className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px]"
        style={{ background: "var(--ops-hover, rgba(0,0,0,0.04))", color: "var(--ops-sec)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold" style={{ color: "var(--ops-title)" }}>
          {title}
        </span>
        <span className="mt-px block truncate text-[10.5px]" style={{ color: "var(--ops-sec)" }}>
          {sub}
        </span>
      </span>
      <span className="ml-auto flex shrink-0" style={{ color: "var(--ops-mut)" }}>
        <ChevronRight className="h-3 w-3" />
      </span>
    </>
  )
  const cls =
    "mt-[9px] flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] border px-[11px] py-2.5 text-left transition-colors hover:brightness-[0.98] dark:hover:brightness-110"
  const style = { borderColor: "var(--ops-border)", opacity: busy ? 0.6 : 1 }
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={onClick} disabled={busy} className={cls} style={style}>
      {inner}
    </button>
  )
}

export function ContextPanel({
  thread,
  wide,
  onClose,
  onRefresh,
  onThreadsRefresh,
}: {
  thread: ThreadDetail["thread"]
  /** true = coluna fixa; false = overlay com sombra e botão de fechar. */
  wide: boolean
  onClose: () => void
  onRefresh: () => Promise<unknown> | void
  onThreadsRefresh: () => void
}) {
  const isComment = threadKind(thread) === "comment"
  const isEvolution = thread.channel?.provider === "evolution"
  const isWhatsApp = thread.channel?.type === "whatsapp"
  const hasWindow = thread.channel?.type === "instagram" || (isWhatsApp && !isEvolution)
  const hoursLeft = hasWindow ? windowHoursLeft(thread.window_expires_at) : null
  const windowOpen = hasWindow && Boolean(thread.is_window_open) && (hoursLeft ?? 0) > 0

  const [creatingLead, setCreatingLead] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  const name = thread.contact_name || thread.contact_external_id

  /** Cria o lead com os dados do contato e vincula à thread. */
  const createLead = async () => {
    if (creatingLead) return
    setCreatingLead(true)
    setPanelError(null)
    try {
      const isPhone = /^\+?\d{8,}$/.test(thread.contact_external_id.replace(/\D/g, ""))
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: thread.contact_name || thread.contact_external_id,
          phone: isWhatsApp && isPhone ? thread.contact_external_id : null,
          source: thread.channel?.type === "instagram" ? "instagram" : "whatsapp",
          notes: `Criado a partir da conversa do inbox (${thread.channel?.display_name ?? "canal"}).`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error || "Não foi possível criar o lead")
      const leadId = (data as { id?: string }).id
      if (leadId) {
        const link = await fetch(`/api/crm/inbox/threads/${thread.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: leadId }),
        })
        if (!link.ok) {
          const ld = await link.json().catch(() => ({}))
          throw new Error((ld as { error?: string })?.error || "Lead criado, mas não foi possível vincular")
        }
      }
      await onRefresh()
      onThreadsRefresh()
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Não foi possível criar o lead")
    } finally {
      setCreatingLead(false)
    }
  }

  const changeStatus = async (status: string) => {
    setSavingStatus(true)
    setPanelError(null)
    try {
      const res = await fetch(`/api/crm/inbox/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string })?.error || "Não foi possível mudar o status")
      }
      await onRefresh()
      onThreadsRefresh()
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Não foi possível mudar o status")
      await onRefresh()
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <aside
      className={
        wide
          ? "w-[258px] shrink-0 overflow-y-auto border-l px-4 py-5"
          : "absolute bottom-0 right-0 top-0 z-40 w-[280px] overflow-y-auto border-l px-4 py-5"
      }
      style={{
        borderColor: "var(--ops-border)",
        background: "var(--ops-card)",
        boxShadow: wide ? undefined : "-16px 0 40px rgba(0,0,0,0.22)",
      }}
      aria-label="Detalhes do contato"
    >
      {!wide && (
        <button
          onClick={onClose}
          aria-label="Fechar detalhes"
          className="absolute right-3 top-3 flex h-[26px] w-[26px] items-center justify-center rounded-[7px]"
          style={{ background: "var(--ops-hover, rgba(0,0,0,0.05))", color: "var(--ops-sec)" }}
        >
          <X className="h-[13px] w-[13px]" />
        </button>
      )}

      {/* Identidade */}
      <div className="flex items-center gap-[11px] border-b pb-4" style={{ borderColor: "var(--ops-border)" }}>
        <AvatarWithChannel
          name={name}
          avatarUrl={thread.contact_avatar_url}
          canal={thread.channel?.type ?? "whatsapp"}
          size={44}
          badge={16}
        />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-[650]" style={{ color: "var(--ops-title)" }}>
            {name}
          </div>
          <div className="mt-0.5 truncate text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
            {thread.contact_name ? thread.contact_external_id : channelSubLabel(thread)}
          </div>
        </div>
      </div>

      {panelError && (
        <div
          className="mt-3 rounded-[8px] border px-2.5 py-2 text-[11px]"
          style={{ borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }}
          role="alert"
        >
          {panelError}
        </div>
      )}

      {/* Origem */}
      <div className="mt-3.5">
        <SectionTitle>Origem</SectionTitle>
        <div className="mt-2 flex flex-col gap-1.5 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
          <span className="flex items-center justify-between gap-2">
            <span>Canal</span>
            <ChLabel thread={thread} strong />
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>Conta</span>
            <span className="min-w-0 truncate font-medium" style={{ color: "var(--ops-text)" }}>
              {thread.channel?.display_name ?? "—"}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>Atribuída a</span>
            <span className="min-w-0 truncate font-medium" style={{ color: "var(--ops-text)" }}>
              {thread.assignee?.name ?? "—"}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>Status</span>
            <select
              value={thread.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value)}
              aria-label="Status da conversa"
              className="h-[24px] rounded-[6px] border px-1 text-[11px] outline-none"
              style={{
                borderColor: "var(--ops-border)",
                background: "var(--ops-card)",
                color: "var(--ops-text)",
                opacity: savingStatus ? 0.6 : 1,
              }}
            >
              <option value="open">Aberta</option>
              <option value="pending">Pendente</option>
              <option value="resolved">Resolvida</option>
              <option value="archived">Arquivada</option>
            </select>
          </span>
        </div>
      </div>

      {/* CRM */}
      <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--ops-border)" }}>
        <SectionTitle>CRM</SectionTitle>
        {thread.deal && (
          <CrmCard
            icon={<Briefcase className="h-[13px] w-[13px]" />}
            title={`Negócio · ${thread.deal.title || "sem título"}`}
            sub={[
              thread.deal.status ? DEAL_STATUS[thread.deal.status] ?? thread.deal.status : null,
              typeof thread.deal.value === "number" && thread.deal.value > 0 ? brl.format(thread.deal.value) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            href={ROUTES.ADMIN.COMERCIAL.DEAL_DETAIL(thread.deal.id)}
          />
        )}
        {thread.lead && (
          <CrmCard
            icon={<UserPlus className="h-[13px] w-[13px]" />}
            title={`Lead · ${thread.lead.name || "sem nome"}`}
            sub={thread.lead.status ? `Status ${thread.lead.status}` : "Sem status"}
            href={ROUTES.ADMIN.COMERCIAL.LEADS}
          />
        )}
        {thread.client && (
          <CrmCard
            icon={<Store className="h-[13px] w-[13px]" />}
            title={`Cliente · ${thread.client.name || "sem nome"}`}
            sub={thread.client.email || thread.client.phone || "—"}
            href={`/admin/clients/${thread.client.id}`}
          />
        )}
        {!thread.deal && !thread.lead && !thread.client && (
          <CrmCard
            icon={<Plus className="h-[13px] w-[13px]" />}
            title="Sem vínculo ainda"
            sub={creatingLead ? "Criando lead…" : "Criar lead desta conversa"}
            onClick={createLead}
            busy={creatingLead}
          />
        )}
      </div>

      {/* Tags */}
      <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--ops-border)" }}>
        <SectionTitle>Tags</SectionTitle>
        <div className="mt-2">
          <ThreadTags
            threadId={thread.id}
            tags={thread.tags ?? []}
            onChanged={() => {
              onRefresh()
              onThreadsRefresh()
            }}
          />
        </div>
      </div>

      {/* Janela de 24h */}
      {!isComment && (
        <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--ops-border)" }}>
          <SectionTitle>Janela de 24h</SectionTitle>
          <div className="mt-2 text-[11.5px] leading-[1.55]" style={{ color: "var(--ops-sec)" }}>
            {!hasWindow ? (
              "WhatsApp via QR — envio livre, sem janela."
            ) : windowOpen && hoursLeft != null ? (
              <>
                Fecha em{" "}
                <strong className="font-semibold" style={{ color: "var(--ops-title)", ...TNUM }}>
                  {Math.floor(hoursLeft)}h {Math.round((hoursLeft % 1) * 60)}m
                </strong>
                {isWhatsApp ? ". Depois, só template aprovado." : ". Depois, só quando o contato escrever."}
              </>
            ) : isWhatsApp ? (
              "Fechada — envie um template aprovado para reabrir."
            ) : (
              "Fechada — reabre quando o contato escrever de novo."
            )}
          </div>
          {windowOpen && hoursLeft != null && (
            <div
              className="mt-[9px] h-1 overflow-hidden rounded-[2px]"
              style={{ background: "var(--ops-track, rgba(0,0,0,0.07))" }}
            >
              <div
                className="h-full rounded-[2px]"
                style={{
                  width: `${Math.min(100, (hoursLeft / 24) * 100)}%`,
                  background: hoursLeft < 4 ? "var(--ops-warn)" : "var(--ops-pos)",
                }}
              />
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
