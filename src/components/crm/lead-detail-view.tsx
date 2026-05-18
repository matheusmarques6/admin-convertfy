"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronRight,
  Edit,
  ExternalLink,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  User,
  Users,
  Zap,
} from "lucide-react"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error ?? `HTTP ${r.status}`)
  }
  return json
}

interface LeadDetailResponse {
  success?: boolean
  data?: { lead: LeadObj; activities: Activity[] }
  lead?: LeadObj
  activities?: Activity[]
}

interface LeadObj {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  source: string | null
  status: string
  notes: string | null
  tags: string[] | null
  ai_qualification_score: number | null
  ai_qualification_reason: string | null
  converted_to_client_id: string | null
  converted_to_deal_id: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
  assignee?: { id: string; name: string; avatar_url: string | null; email: string | null } | null
  custom_fields?: Record<string, unknown> | null
}

interface Activity {
  id: string
  type: string
  content: string
  created_at: string
  due_at: string | null
  completed_at: string | null
  is_internal: boolean
  creator?: { id: string; name: string; avatar_url: string | null } | null
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

interface LeadDetailViewProps {
  leadId: string
}

export function LeadDetailView({ leadId }: LeadDetailViewProps) {
  const router = useRouter()
  const { data, isLoading, error, mutate } = useSWR<LeadDetailResponse>(
    `/api/crm/leads/${leadId}`,
    fetcher,
  )

  const lead = data?.data?.lead ?? data?.lead
  const activities = data?.data?.activities ?? data?.activities ?? []

  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "notes">(
    "overview",
  )

  const handleDelete = async () => {
    if (!lead) return
    if (
      !window.confirm(
        `Excluir lead "${lead.name}"? Esta ação muda o status para lost.`,
      )
    )
      return
    await fetch(`/api/crm/leads/${leadId}`, { method: "DELETE" })
    router.push("/admin/comercial/leads")
  }

  if (isLoading && !lead) {
    return <LeadSkeleton />
  }

  if (error || !lead) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center" style={{ fontFamily: "var(--crm-font-sans)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--crm-gray-900)" }}>
          Lead não encontrado
        </h3>
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)", marginTop: 8 }}>
          Pode ter sido removido ou você não tem acesso.
        </p>
        <Link
          href="/admin/comercial/leads"
          className="mt-4 inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 14px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Leads
        </Link>
      </div>
    )
  }

  const avatarColors = avatarColorFromName(lead.name)

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
        overflow: "hidden",
      }}
    >
      {/* Crumb topbar */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--crm-gray-500)" }}>
          <Link href="/admin/comercial" style={{ color: "var(--crm-gray-500)" }}>
            Comercial
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <Link href="/admin/comercial/leads" style={{ color: "var(--crm-gray-500)" }}>
            Leads
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}>
            {lead.name}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              color: "var(--crm-gray-700)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Edit className="h-3 w-3" />
            Editar
          </button>
          <button
            onClick={handleDelete}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-neg-border)",
              borderRadius: 6,
              color: "var(--crm-neg)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Trash2 className="h-3 w-3" />
            Excluir
          </button>
        </div>
      </div>

      {/* Body 2-col */}
      <div className="flex flex-1 min-h-0">
        {/* ── RAIL ESQUERDO: profile + KPIs + contato + tags ── */}
        <aside
          className="flex flex-col gap-4 overflow-y-auto shrink-0"
          style={{
            width: 360,
            padding: "24px 24px 32px",
            background: "var(--crm-gray-0)",
            borderRight: "1px solid var(--crm-border)",
          }}
        >
          {/* Hero profile */}
          <div className="flex flex-col items-center text-center">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 96,
                height: 96,
                background: avatarColors.bg,
                color: avatarColors.fg,
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                marginBottom: 14,
              }}
            >
              {getInitials(lead.name) || "?"}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                letterSpacing: "-0.015em",
              }}
            >
              {lead.name}
            </h1>
            {lead.role && (
              <div style={{ fontSize: 13, color: "var(--crm-gray-600)", marginTop: 2 }}>
                {lead.role}
              </div>
            )}
            {lead.company && (
              <div
                className="inline-flex items-center gap-1"
                style={{ fontSize: 13, color: "var(--crm-gray-500)", marginTop: 2 }}
              >
                <Building2 className="h-3 w-3" />
                {lead.company}
              </div>
            )}
            <StatusBadge status={lead.status} />
          </div>

          {/* KPIs grid */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 8 }}
          >
            <KpiCard label="Score" value={lead.ai_qualification_score ?? "—"} tone={
              (lead.ai_qualification_score ?? 0) >= 75 ? "pos" :
                (lead.ai_qualification_score ?? 0) >= 50 ? "warn" : "neut"
            } />
            <KpiCard
              label="Criado em"
              value={new Date(lead.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
              tone="neut"
            />
            <KpiCard
              label="Origem"
              value={lead.source ?? "—"}
              tone="neut"
              valueSize={11}
            />
            <KpiCard
              label="Convertido"
              value={lead.converted_to_deal_id ? "Sim" : "—"}
              tone={lead.converted_to_deal_id ? "pos" : "neut"}
            />
          </div>

          {/* Contato */}
          <Section title="Contato">
            <div className="flex flex-col gap-2">
              {lead.email && (
                <ContactLine
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label={lead.email}
                  href={`mailto:${lead.email}`}
                />
              )}
              {lead.phone && (
                <ContactLine
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label={lead.phone}
                  href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                  mono
                />
              )}
              {lead.phone && (
                <ContactLine
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label={lead.phone}
                  href={`tel:${lead.phone}`}
                  mono
                />
              )}
              {!lead.email && !lead.phone && (
                <span style={{ fontSize: 12, color: "var(--crm-gray-400)" }}>
                  Sem contato registrado
                </span>
              )}
            </div>
          </Section>

          {/* Assignee */}
          {lead.assignee && (
            <Section title="Responsável">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 32,
                    height: 32,
                    background: avatarColorFromName(lead.assignee.name).bg,
                    color: avatarColorFromName(lead.assignee.name).fg,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {getInitials(lead.assignee.name)}
                </div>
                <div className="min-w-0">
                  <div
                    className="truncate"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--crm-gray-900)",
                    }}
                  >
                    {lead.assignee.name}
                  </div>
                  {lead.assignee.email && (
                    <div
                      className="truncate"
                      style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
                    >
                      {lead.assignee.email}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--crm-info-bg)",
                      border: "1px solid var(--crm-info-border)",
                      color: "var(--crm-info)",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Conversion CTA */}
          {!lead.converted_to_deal_id && lead.status !== "lost" && (
            <button
              onClick={() =>
                router.push(`/admin/comercial/leads?lead=${leadId}&action=convert`)
              }
              className="cf-focusable inline-flex items-center justify-center gap-1.5"
              style={{
                width: "100%",
                height: 36,
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: 0,
                cursor: "pointer",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Converter em deal
            </button>
          )}

          {lead.converted_to_deal_id && (
            <Link
              href={`/admin/comercial/deals/${lead.converted_to_deal_id}`}
              className="cf-focusable inline-flex items-center justify-center gap-1.5"
              style={{
                width: "100%",
                height: 36,
                background: "var(--crm-pos-bg)",
                color: "var(--crm-pos)",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid var(--crm-pos-border)",
                textDecoration: "none",
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver deal convertido
            </Link>
          )}
        </aside>

        {/* ── MAIN: tabs + content ── */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div
            className="flex items-center gap-1 px-8"
            style={{
              background: "var(--crm-gray-0)",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            {([
              { id: "overview", label: "Visão geral", icon: User, count: null },
              { id: "timeline", label: "Atividades", icon: Calendar, count: activities.length },
              { id: "notes", label: "Notas", icon: StickyNote, count: lead.notes ? 1 : 0 },
            ] as const).map((t) => {
              const Icon = t.icon
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="cf-focusable inline-flex items-center gap-1.5"
                  style={{
                    padding: "14px 16px",
                    background: "transparent",
                    border: 0,
                    borderBottom: active ? "2px solid var(--crm-brand)" : "2px solid transparent",
                    color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span
                      className="crm-tnum"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 9999,
                        background: active ? "var(--crm-blue-50)" : "var(--crm-gray-100)",
                        color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
                      }}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "24px 32px" }}>
            {activeTab === "overview" && (
              <OverviewTab lead={lead} activities={activities} />
            )}
            {activeTab === "timeline" && (
              <TimelineTab activities={activities} />
            )}
            {activeTab === "notes" && (
              <NotesTab lead={lead} onUpdated={() => mutate()} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { bg: string; fg: string; border: string; label: string }
  > = {
    new: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      border: "var(--crm-blue-100)",
      label: "Novo",
    },
    qualified: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      border: "var(--crm-pos-border)",
      label: "Qualificado",
    },
    unqualified: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      border: "var(--crm-warn-border)",
      label: "Desqualificado",
    },
    converted: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      border: "var(--crm-pos-border)",
      label: "Convertido",
    },
    lost: {
      bg: "var(--crm-neg-bg)",
      fg: "var(--crm-neg)",
      border: "var(--crm-neg-border)",
      label: "Perdido",
    },
  }
  const t = map[status] ?? {
    bg: "var(--crm-neut-bg)",
    fg: "var(--crm-neut)",
    border: "var(--crm-neut-border)",
    label: status,
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        marginTop: 8,
        padding: "3px 10px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {t.label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  tone,
  valueSize = 16,
}: {
  label: string
  value: string | number
  tone: "pos" | "warn" | "neg" | "neut"
  valueSize?: number
}) {
  const colors = {
    pos: "var(--crm-pos)",
    warn: "var(--crm-warn)",
    neg: "var(--crm-neg)",
    neut: "var(--crm-gray-900)",
  }
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-50)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className="crm-tnum truncate"
        style={{
          fontSize: valueSize,
          fontWeight: 600,
          color: colors[tone],
          marginTop: 4,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--crm-gray-700)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 10,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function ContactLine({
  icon,
  label,
  href,
  mono,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  mono?: boolean
}) {
  const inner = (
    <>
      <span style={{ color: "var(--crm-gray-400)", flexShrink: 0 }}>{icon}</span>
      <span
        className={`truncate ${mono ? "crm-tnum" : ""}`}
        style={{ flex: 1, minWidth: 0 }}
      >
        {label}
      </span>
    </>
  )
  const style: React.CSSProperties = {
    fontSize: 12,
    color: "var(--crm-gray-700)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {inner}
      </a>
    )
  }
  return <div style={style}>{inner}</div>
}

// ─── Tabs ────────────────────────────────────────────────────────

function OverviewTab({
  lead,
  activities,
}: {
  lead: LeadObj
  activities: Activity[]
}) {
  const lastActivity = activities[0]
  return (
    <div className="flex flex-col gap-5">
      {/* AI suggestion */}
      {lead.ai_qualification_score != null && lead.ai_qualification_score > 0 && (
        <div
          style={{
            padding: "16px 18px",
            background: "var(--crm-brand-gradient-diag)",
            border: "1px solid var(--crm-blue-100)",
            borderRadius: 10,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="flex items-center justify-center"
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: "var(--crm-brand-gradient)",
                color: "var(--crm-brand-fg)",
              }}
            >
              <Zap className="h-3 w-3" />
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--crm-brand-hover)",
                letterSpacing: "0.04em",
              }}
            >
              QUALIFICAÇÃO IA
            </span>
            <span
              className="crm-tnum"
              style={{
                marginLeft: "auto",
                fontSize: 18,
                fontWeight: 700,
                color: lead.ai_qualification_score >= 75
                  ? "var(--crm-pos)"
                  : lead.ai_qualification_score >= 50
                    ? "var(--crm-amber)"
                    : "var(--crm-neg)",
              }}
            >
              {lead.ai_qualification_score}
            </span>
          </div>
          {lead.ai_qualification_reason && (
            <div
              style={{
                fontSize: 12,
                color: "var(--crm-gray-700)",
                lineHeight: 1.5,
              }}
            >
              {lead.ai_qualification_reason}
            </div>
          )}
        </div>
      )}

      {/* Stats inline */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Última atividade"
          value={
            lastActivity
              ? new Date(lastActivity.created_at).toLocaleDateString("pt-BR")
              : "—"
          }
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total de atividades"
          value={activities.length}
        />
        <StatCard
          icon={<Flag className="h-4 w-4" />}
          label="Atualizado em"
          value={new Date(lead.updated_at).toLocaleDateString("pt-BR")}
        />
      </div>

      {/* Notes preview */}
      {lead.notes && (
        <div
          style={{
            padding: "16px 18px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--crm-gray-700)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            Notas
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--crm-gray-700)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {lead.notes}
          </p>
        </div>
      )}

      {/* Recent activities preview */}
      {activities.length > 0 && (
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--crm-gray-700)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 10,
            }}
          >
            Últimas atividades
          </h3>
          <div className="flex flex-col gap-2">
            {activities.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineTab({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div
        className="text-center"
        style={{
          padding: "40px 20px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
        }}
      >
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>
          Nenhuma atividade registrada ainda.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {activities.map((a) => (
        <ActivityRow key={a.id} activity={a} />
      ))}
    </div>
  )
}

function NotesTab({
  lead,
  onUpdated,
}: {
  lead: LeadObj
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(lead.notes ?? "")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: draft }),
      })
      setEditing(false)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            minHeight: 160,
            padding: "12px 14px",
            fontSize: 13,
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
            background: "var(--crm-gray-0)",
            color: "var(--crm-gray-900)",
            fontFamily: "var(--crm-font-sans)",
            resize: "vertical",
            outline: "none",
          }}
          placeholder="Adicione anotações sobre esse lead..."
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => {
              setDraft(lead.notes ?? "")
              setEditing(false)
            }}
            className="crm-button-ghost"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="crm-button-primary"
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: "20px 22px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        minHeight: 200,
      }}
    >
      {lead.notes ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--crm-gray-800)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            margin: 0,
          }}
        >
          {lead.notes}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--crm-gray-400)" }}>
          Nenhuma anotação ainda.
        </p>
      )}
      <button
        onClick={() => setEditing(true)}
        style={{
          marginTop: 12,
          background: "transparent",
          border: 0,
          color: "var(--crm-brand)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {lead.notes ? "Editar" : "Adicionar"} anotação
      </button>
    </div>
  )
}

function ActivityRow({ activity }: { activity: Activity }) {
  const colors = useMemo<{
    bg: string
    fg: string
  }>(() => {
    if (activity.type === "wa_message") return { bg: "#E7FAEB", fg: "#25D366" }
    if (activity.type === "email") return { bg: "var(--crm-blue-50)", fg: "var(--crm-brand)" }
    if (activity.type === "meeting") return { bg: "var(--crm-purple-bg)", fg: "var(--crm-purple)" }
    if (activity.type === "task") return { bg: "var(--crm-warn-bg)", fg: "var(--crm-amber)" }
    return { bg: "var(--crm-gray-100)", fg: "var(--crm-gray-500)" }
  }, [activity.type])

  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: "12px 14px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
      }}
    >
      <span
        className="flex items-center justify-center shrink-0 rounded-[8px]"
        style={{
          width: 30,
          height: 30,
          background: colors.bg,
          color: colors.fg,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
        }}
      >
        {activity.type.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="truncate"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {activity.creator?.name ?? "Sistema"}
          </span>
          <span
            className="crm-tnum shrink-0"
            style={{ fontSize: 11, color: "var(--crm-gray-400)" }}
          >
            {new Date(activity.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--crm-gray-600)",
            marginTop: 2,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          {activity.content}
        </p>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {icon}
        {label}
      </div>
      <div
        className="crm-tnum"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function LeadSkeleton() {
  return (
    <div
      className="flex h-full"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      <aside
        className="shrink-0 p-6 space-y-4"
        style={{
          width: 360,
          background: "var(--crm-gray-0)",
          borderRight: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex flex-col items-center">
          <div
            className="rounded-full animate-pulse mb-3"
            style={{
              width: 96,
              height: 96,
              background: "var(--crm-gray-200)",
            }}
          />
          <div
            className="h-5 rounded animate-pulse"
            style={{ width: 140, background: "var(--crm-gray-200)" }}
          />
          <div
            className="mt-2 h-3 rounded animate-pulse"
            style={{ width: 100, background: "var(--crm-gray-100)" }}
          />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded animate-pulse"
            style={{ height: 60, background: "var(--crm-gray-100)" }}
          />
        ))}
      </aside>
      <main className="flex-1 p-8 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded animate-pulse"
            style={{ height: 60, background: "var(--crm-gray-100)" }}
          />
        ))}
      </main>
    </div>
  )
}
