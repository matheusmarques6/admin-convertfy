"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  Archive,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ExternalLink,
  File as FileIcon,
  Flag,
  Link as LinkIcon,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  FileText,
  Plus,
  Shuffle,
  StickyNote,
  Tag as TagIcon,
  XCircle,
  Zap,
} from "lucide-react"
import type { DealFile } from "@/types/crm"
import { InlineEditField } from "./inline-edit-field"
import { CustomFieldsPanel } from "./custom-fields-panel"
import { DealProductsSection, type DealProductsMeta } from "./deal-products-section"
import { MoveDealPipelineDialog } from "./move-deal-pipeline-dialog"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error ?? `HTTP ${r.status}`)
  }
  return json
}

// ─── Tipos ──────────────────────────────────────────────────────

/** Mesmo shape em clients.address e crm_leads.address (migration 20261051). */
export interface ContactAddress {
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  postal_code?: string | null
  city?: string | null
  state?: string | null
}

const ADDRESS_FIELDS: Array<{ key: keyof ContactAddress; label: string }> = [
  { key: "postal_code", label: "CEP" },
  { key: "street", label: "Rua" },
  { key: "number", label: "Número" },
  { key: "complement", label: "Complemento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
]

interface DealFullResponse {
  success?: boolean
  deal: {
    id: string
    title: string
    value: number | null
    currency: string | null
    probability: number | null
    status: string
    source: string | null
    tags: string[] | null
    notes: string | null
    lost_reason: string | null
    won_reason: string | null
    custom_fields: Record<string, unknown> | null
    created_at: string
    updated_at: string
    last_stage_changed_at?: string | null
    expected_close_date?: string | null
    won_at?: string | null
    lost_at?: string | null
    pipeline_id: string
    stage_id: string
    pipeline?: { id: string; name: string }
    stage?: { id: string; name: string; stage_type: string | null; color?: string | null }
    owner?: { id: string; name: string; avatar_url: string | null; email?: string | null } | null
    client?: {
      id: string
      name: string
      company?: string | null
      email?: string | null
      phone?: string | null
      website?: string | null
      address?: ContactAddress | null
    } | null
    store?: {
      id: string
      store_name?: string | null
      store_url?: string | null
      platform?: string | null
    } | null
    lead?: {
      id: string
      name: string
      email: string | null
      phone?: string | null
      company?: string | null
      address?: ContactAddress | null
      ai_qualification_score?: number | null
      ai_qualification_reason?: string | null
    } | null
  }
  activities: Array<{
    id: string
    type: string
    content: string
    metadata?: Record<string, unknown>
    due_at: string | null
    completed_at: string | null
    is_internal: boolean
    created_at: string
    creator?: { id: string; name: string; avatar_url: string | null } | null
  }>
  history?: Array<{
    id: string
    field: string
    old_value: unknown
    new_value: unknown
    changed_at: string
    changer?: { id: string; name: string } | null
  }>
}

// ─── Helpers ────────────────────────────────────────────────────

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
  const palette = [
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

const fmtBRL = (v: number): string =>
  "R$ " +
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000),
  )
}

// ─── Activity types -> icons ────────────────────────────────────

const ACTIVITY_META: Record<
  string,
  { icon: typeof StickyNote; color: string; bg: string; label: string; highlight?: "deal" | "warn" }
> = {
  note: { icon: StickyNote, color: "var(--crm-amber)", bg: "var(--crm-warn-bg)", label: "Nota" },
  call: { icon: Phone, color: "var(--crm-brand)", bg: "var(--crm-blue-50)", label: "Ligação" },
  email: { icon: Mail, color: "var(--crm-brand)", bg: "var(--crm-blue-50)", label: "Email" },
  wa_message: { icon: MessageSquare, color: "#25D366", bg: "#E7FAEB", label: "WhatsApp" },
  ig_message: { icon: MessageSquare, color: "#E1306C", bg: "#FCE4EC", label: "Instagram" },
  meeting: { icon: Calendar, color: "var(--crm-purple)", bg: "var(--crm-purple-bg)", label: "Reunião" },
  task: { icon: CheckSquare, color: "var(--crm-amber)", bg: "var(--crm-warn-bg)", label: "Tarefa" },
  stage_change: { icon: ArrowRight, color: "var(--crm-brand)", bg: "var(--crm-blue-50)", label: "Mudança de etapa", highlight: "deal" },
  system: { icon: Zap, color: "var(--crm-gray-500)", bg: "var(--crm-gray-100)", label: "Sistema" },
  file_attached: { icon: FileIcon, color: "var(--crm-gray-500)", bg: "var(--crm-gray-100)", label: "Arquivo" },
}

// ─── DealDetailView (full page) ─────────────────────────────────

export function DealDetailView({ dealId }: { dealId: string }) {
  const router = useRouter()
  const { data, isLoading, error, mutate } = useSWR<DealFullResponse>(
    `/api/crm/deals/${dealId}`,
    fetcher,
  )
  const { data: filesData, mutate: mutateFiles } = useSWR<{
    success?: boolean
    files?: DealFile[]
    data?: { files: DealFile[] }
  }>(`/api/crm/deals/${dealId}/files`, fetcher, {
    revalidateOnFocus: false,
  })

  const [activeTab, setActiveTab] = useState<
    "historico" | "atividades" | "negocios" | "arquivos" | "atendimentos"
  >("historico")
  const [transferOpen, setTransferOpen] = useState(false)
  const [contactTab, setContactTab] = useState<"perfil" | "endereco" | "campos">(
    "perfil",
  )
  const [filterType, setFilterType] = useState<
    "all" | "negocios" | "notes" | "emails" | "reunioes" | "alertas"
  >("all")
  // Meta dos produtos (soma, ciclos) — trava o valor manual e corrige a
  // projeção 12m no painel Negócio.
  const [productsMeta, setProductsMeta] = useState<DealProductsMeta | null>(null)

  const deal = data?.deal
  const activities = useMemo(() => data?.activities ?? [], [data?.activities])
  const files: DealFile[] = filesData?.data?.files ?? filesData?.files ?? []

  // ── Hooks que dependem de activities/filter ANTES de early returns ──
  // (regras de hooks: tem que ser sempre chamados na mesma ordem)
  const filteredActivities = useMemo(() => {
    if (filterType === "all") return activities
    return activities.filter((a) => {
      if (filterType === "negocios")
        return a.type === "stage_change" || a.type === "system"
      if (filterType === "notes") return a.type === "note"
      if (filterType === "emails") return a.type === "email"
      if (filterType === "reunioes")
        return a.type === "meeting" || a.type === "call"
      if (filterType === "alertas") return a.metadata?.alert === true
      return true
    })
  }, [activities, filterType])

  const counts = useMemo(
    () => ({
      all: activities.length,
      negocios: activities.filter(
        (a) => a.type === "stage_change" || a.type === "system",
      ).length,
      notes: activities.filter((a) => a.type === "note").length,
      emails: activities.filter((a) => a.type === "email").length,
      reunioes: activities.filter(
        (a) => a.type === "meeting" || a.type === "call",
      ).length,
      alertas: activities.filter((a) => a.metadata?.alert === true).length,
    }),
    [activities],
  )

  if (isLoading && !deal) return <DealDetailSkeleton />

  if (error || !deal) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-8 text-center"
        style={{ fontFamily: "var(--crm-font-sans)" }}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
          }}
        >
          Deal não encontrado
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--crm-gray-500)",
            marginTop: 8,
          }}
        >
          Pode ter sido removido ou você não tem acesso.
        </p>
        <Link
          href="/admin/comercial/pipelines"
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
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar para Pipelines
        </Link>
      </div>
    )
  }

  const leadName = deal.client?.name || deal.title
  const avatarColors = avatarColorFromName(leadName)
  const score = deal.lead?.ai_qualification_score ?? null
  const stageDays = daysSince(deal.last_stage_changed_at)
  const isCritical = stageDays > 10
  const company = deal.client?.company ?? deal.store?.store_name ?? null

  const phone = deal.client?.phone ?? deal.lead?.phone ?? null
  const email = deal.client?.email ?? deal.lead?.email ?? null
  const website = deal.store?.store_url ?? null
  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null
  const mailto = email ? `mailto:${email}` : null

  // PATCH helper reutilizavel — usado por todos os InlineEditField.
  const patchDeal = async (update: Record<string, unknown>) => {
    const res = await fetch(`/api/crm/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
  }

  // ── Roteador de escrita do painel de contato ──────────────────
  // Nome/email/telefone/empresa/endereço NÃO são colunas de `deals`:
  // moram em `clients` (deal com cliente) ou `crm_leads` (deal vindo de
  // formulário). O painel resolve o alvo pela entidade que o deal tem —
  // cliente ganha do lead, que é a mesma precedência da LEITURA logo
  // acima (`deal.client?.x ?? deal.lead?.x`). Sem espelhar a leitura, o
  // usuário editaria um registro e continuaria vendo o outro.
  // Espelha a precedencia do servidor (cliente ganha do lead) — ver
  // /api/crm/deals/[id]/contact.
  const contactAddress: ContactAddress =
    (deal.client?.id ? deal.client.address : deal.lead?.address) ?? {}

  // Escrita centralizada em /contact: o servidor resolve o alvo (cliente
  // ou lead) e, quando o deal nao tem nenhum dos dois — caso do deal
  // criado a mao pelo "Novo deal" —, CRIA o lead e linka. Resolver no
  // servidor evita que dois campos salvos em sequencia rapida criem dois
  // leads, e mantem o title do deal em sincronia com o nome.
  const patchContact = async (update: Record<string, unknown>) => {
    const res = await fetch(`/api/crm/deals/${dealId}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
  }

  const saveName = (v: string) => patchContact({ name: v })

  // DELETE do deal e soft — vira status=archived (rota /api/crm/deals/[id]).
  const archiveDeal = async () => {
    if (
      !window.confirm(
        `Arquivar o deal "${deal.title}"? Ele sai do board, mas o histórico é preservado.`,
      )
    )
      return
    const res = await fetch(`/api/crm/deals/${dealId}`, { method: "DELETE" })
    if (res.ok) {
      router.push(`/admin/comercial/pipelines/${deal.pipeline_id}`)
    } else {
      const body = await res.json().catch(() => ({}))
      window.alert(body?.error?.message || "Falha ao arquivar o deal.")
    }
  }

  const handleMoveToNextStage = async () => {
    // Implementacao simples: o user volta pro board pra mover.
    // Futuro: dialog inline pra escolher etapa.
    router.push(`/admin/comercial/pipelines/${deal.pipeline_id}?deal=${dealId}`)
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto md:overflow-hidden"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* TOPBAR */}
      <div
        className="flex items-center justify-between flex-wrap gap-2"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>
          <button
            onClick={() => router.back()}
            className="cf-focusable flex items-center justify-center mr-1"
            style={{
              width: 24,
              height: 24,
              border: 0,
              background: "transparent",
              color: "var(--crm-gray-500)",
              cursor: "pointer",
              borderRadius: 4,
            }}
            aria-label="Voltar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Link href="/admin/comercial/pipelines" style={{ color: "var(--crm-gray-500)" }}>
            Pipeline
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          {deal.pipeline ? (
            <Link
              href={`/admin/comercial/pipelines/${deal.pipeline_id}`}
              style={{ color: "var(--crm-gray-500)" }}
            >
              {deal.pipeline.name}
            </Link>
          ) : (
            <span>Comercial</span>
          )}
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}>
            {leadName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TopbarBtn
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Proposta"
            href={`/admin/comercial/deals/${dealId}/proposta`}
          />
          {phone && (
            <TopbarBtn
              icon={<Phone className="h-3.5 w-3.5" />}
              label="Ligar"
              href={`tel:+${phone.replace(/\D/g, "")}`}
            />
          )}
          {waLink && (
            <TopbarBtn
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="WhatsApp"
              href={waLink}
            />
          )}
          {mailto && (
            <TopbarBtn
              icon={<Mail className="h-3.5 w-3.5" />}
              label="Email"
              href={mailto}
            />
          )}
          <TopbarBtn
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Agendar"
            disabled
          />
          <TopbarBtn
            icon={<Shuffle className="h-3.5 w-3.5" />}
            label="Transferir"
            onClick={() => setTransferOpen(true)}
          />
          <button
            onClick={handleMoveToNextStage}
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 14px",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              fontSize: 13,
              fontWeight: 500,
              border: 0,
              cursor: "pointer",
            }}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Mover etapa
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="cf-focusable flex items-center justify-center rounded-[6px]"
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid var(--crm-border)",
                  background: "var(--crm-gray-0)",
                  color: "var(--crm-gray-600)",
                  cursor: "pointer",
                }}
                aria-label="Mais opções"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[210px] py-1 rounded-[6px]"
                style={{
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  boxShadow: "var(--crm-shadow-lg)",
                }}
              >
                <MenuItem
                  icon={<LinkIcon className="h-3.5 w-3.5" />}
                  label="Copiar link do deal"
                  onSelect={() => {
                    navigator.clipboard
                      ?.writeText(window.location.href)
                      .catch(() => {})
                  }}
                />
                <DropdownMenu.Separator
                  className="h-px my-1"
                  style={{ background: "var(--crm-gray-100)" }}
                />
                <MenuItem
                  icon={<Archive className="h-3.5 w-3.5" />}
                  label="Arquivar deal"
                  tone="danger"
                  onSelect={archiveDeal}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* BODY: 3 colunas */}
      <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">
        {/* ─── RAIL ESQUERDO ─────────────────────────────────── */}
        <aside
          className="flex flex-col gap-4 w-full md:w-[320px] md:shrink-0 md:overflow-y-auto border-b md:border-b-0 md:border-r"
          style={{
            padding: "20px 20px 32px",
            background: "var(--crm-gray-0)",
            borderColor: "var(--crm-border)",
          }}
        >
          {/* Hero card com avatar + score */}
          <div
            className="flex flex-col items-center"
            style={{
              padding: "24px 16px",
              background: "linear-gradient(135deg, var(--crm-blue-50) 0%, var(--crm-gray-0) 100%)",
              border: "1px solid var(--crm-border)",
              borderRadius: 14,
              position: "relative",
            }}
          >
            <div className="relative">
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
                  border: "3px solid var(--crm-gray-0)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                {getInitials(leadName) || "?"}
              </div>
              {score != null && score > 0 && (
                <div
                  className="absolute crm-tnum"
                  style={{
                    bottom: 4,
                    right: -4,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background:
                      score >= 75
                        ? "var(--crm-pos)"
                        : score >= 50
                          ? "var(--crm-amber)"
                          : "var(--crm-neg)",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid var(--crm-gray-0)",
                  }}
                  title={`Score: ${score}`}
                >
                  {score}
                </div>
              )}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                letterSpacing: "-0.015em",
                textAlign: "center",
              }}
            >
              <InlineEditField
                value={leadName}
                placeholder="Nome do contato"
                onSave={saveName}
                displayStyle={{
                  fontSize: 18,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              />
            </h1>
            <div
              className="crm-tnum"
              style={{
                fontSize: 11,
                color: "var(--crm-gray-500)",
                marginTop: 2,
              }}
            >
              Lead #{dealId.slice(0, 7)}
            </div>
            {isCritical && deal.status === "open" && (
              <div
                className="inline-flex items-center gap-1.5"
                style={{
                  marginTop: 8,
                  padding: "3px 10px",
                  borderRadius: 4,
                  background: "var(--crm-neg-bg)",
                  border: "1px solid var(--crm-neg-border)",
                  color: "var(--crm-neg)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <Flag className="h-3 w-3" />
                Sem resposta há {stageDays} dias
              </div>
            )}
            {/* Tags */}
            {deal.tags && deal.tags.length > 0 && (
              <div
                className="flex flex-wrap justify-center gap-1.5"
                style={{ marginTop: 10 }}
              >
                {deal.tags.slice(0, 4).map((t) => (
                  <Badge key={t} tone="info">
                    {t}
                  </Badge>
                ))}
                <button
                  className="inline-flex items-center gap-1"
                  style={{
                    padding: "1px 7px",
                    borderRadius: 4,
                    border: "1px dashed var(--crm-gray-300)",
                    background: "transparent",
                    color: "var(--crm-gray-500)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                  title="Adicionar tag (em breve)"
                  disabled
                >
                  <Plus className="h-2.5 w-2.5" />
                  Tag
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              className="cf-focusable inline-flex items-center justify-center gap-1.5 rounded-[6px]"
              style={{
                height: 34,
                padding: "0 14px",
                background: "var(--crm-gray-0)",
                color: "var(--crm-gray-700)",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--crm-border)",
                cursor: "pointer",
              }}
              disabled
              title="Em breve"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar a uma lista
            </button>
            <button
              className="cf-focusable inline-flex items-center justify-center gap-1.5 rounded-[6px]"
              style={{
                height: 34,
                padding: "0 14px",
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                fontSize: 13,
                fontWeight: 500,
                border: 0,
                cursor: "pointer",
              }}
              disabled
              title="Em breve"
            >
              <Zap className="h-3.5 w-3.5" />
              Executar automação
            </button>
          </div>

          {/* Atendente */}
          {deal.owner && (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-border)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--crm-gray-500)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                Atendente
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 32,
                    height: 32,
                    background: avatarColorFromName(deal.owner.name).bg,
                    color: avatarColorFromName(deal.owner.name).fg,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {getInitials(deal.owner.name)}
                </div>
                <div className="min-w-0">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--crm-gray-900)",
                    }}
                  >
                    {deal.owner.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
                    Closer
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Métricas */}
          <Section title="Métricas">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon={<TrendingIcon />}
                label="Ticket médio"
                value={deal.value && deal.value > 0 ? fmtBRL(deal.value) : "R$ 0"}
              />
              <MetricCard
                icon={<DollarSign className="h-3 w-3" />}
                label="Total comprado"
                value={
                  deal.status === "won" && deal.value && deal.value > 0
                    ? fmtBRL(deal.value)
                    : "R$ 0"
                }
              />
              <MetricCard
                icon={<Calendar className="h-3 w-3" />}
                label="Ciclo de compra"
                value={
                  deal.won_at
                    ? `${Math.max(0, Math.floor((new Date(deal.won_at).getTime() - new Date(deal.created_at).getTime()) / 86400000))}d`
                    : `${daysSince(deal.created_at)}d`
                }
              />
              <MetricCard
                icon={<Calendar className="h-3 w-3" />}
                label="Última compra"
                value={
                  deal.won_at
                    ? new Date(deal.won_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })
                    : "—"
                }
              />
            </div>
          </Section>

          {/* Produtos vendidos — a soma recalcula o valor do negócio */}
          <DealProductsSection
            dealId={dealId}
            canEdit
            onChanged={(meta) => {
              setProductsMeta(meta)
              mutate()
            }}
          />

          {/* Notas (editavel inline) */}
          <Section title="Notas">
            <div
              style={{
                fontSize: 12.5,
                color: "var(--crm-gray-700)",
                lineHeight: 1.5,
                padding: "10px 12px",
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-border)",
                borderRadius: 8,
              }}
            >
              <InlineEditField
                type="textarea"
                value={deal.notes}
                placeholder="Anote algo importante sobre esse deal..."
                onSave={(v) => patchDeal({ notes: v || null })}
                rows={4}
                rootStyle={{ width: "100%" }}
                displayStyle={{
                  fontSize: 12.5,
                  color: deal.notes
                    ? "var(--crm-gray-700)"
                    : "var(--crm-gray-400)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  display: "block",
                  width: "100%",
                }}
              />
            </div>
          </Section>

          {/* Contact tabs */}
          <div>
            <div
              className="flex gap-1 mb-2"
              style={{ borderBottom: "1px solid var(--crm-gray-100)" }}
            >
              {(["perfil", "endereco", "campos"] as const).map((t) => {
                const active = contactTab === t
                return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContactTab(t)}
                  className="cf-focusable"
                  style={{
                    padding: "8px 4px",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    color: active
                      ? "var(--crm-gray-900)"
                      : "var(--crm-gray-500)",
                    background: "transparent",
                    border: 0,
                    borderBottom: active
                      ? "2px solid var(--crm-brand)"
                      : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {t === "perfil" ? "Perfil" : t === "endereco" ? "Endereço" : "Campos adicionais"}
                </button>
                )
              })}
            </div>
            <div className="flex flex-col gap-2.5" style={{ paddingTop: 6 }}>
              {contactTab === "perfil" && (
                <>
                  <ContactField
                    icon={<Mail className="h-3.5 w-3.5" />}
                    label="E-mail"
                    value={email}
                    alwaysShow
                    onSave={(v) => patchContact({ email: v || null })}
                  />
                  <ContactField
                    icon={<Phone className="h-3.5 w-3.5" />}
                    label="Telefone"
                    value={phone}
                    mono
                    alwaysShow
                    onSave={(v) => patchContact({ phone: v || null })}
                  />
                  <ContactField
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label="Empresa"
                    value={company}
                    alwaysShow
                    onSave={(v) => patchContact({ company: v || null })}
                  />
                  {website && (
                    <ContactField
                      icon={<ExternalLink className="h-3.5 w-3.5" />}
                      label="Site"
                      value={website.replace(/^https?:\/\//, "")}
                      href={website.startsWith("http") ? website : `https://${website}`}
                    />
                  )}
                </>
              )}

              {contactTab === "endereco" && (
                <>
                  {ADDRESS_FIELDS.map((f) => (
                    <ContactField
                      key={f.key}
                      label={f.label}
                      value={contactAddress[f.key] ?? null}
                      alwaysShow
                      onSave={(v) =>
                        patchContact({ address: { [f.key]: v || null } })
                      }
                    />
                  ))}
                </>
              )}

              {contactTab === "campos" && (
                <CustomFieldsPanel
                  entityType="deal"
                  entityId={dealId}
                  values={deal.custom_fields ?? {}}
                  onSaved={() => mutate()}
                />
              )}
            </div>
          </div>
        </aside>

        {/* ─── MAIN: tabs + timeline ──────────────────────────── */}
        <main className="flex flex-col min-w-0 md:flex-1">
          {/* Tabs principais */}
          <div
            className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-4 md:px-6"
            style={{
              background: "var(--crm-gray-0)",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            {(
              [
                { id: "historico", label: "Histórico", count: activities.length },
                { id: "atividades", label: "Atividades", count: activities.filter((a) => a.type === "task").length },
                { id: "negocios", label: "Negócios", count: 1 },
                { id: "arquivos", label: "Arquivos", count: files.length },
                { id: "atendimentos", label: "Atendimentos", count: 0 },
              ] as const
            ).map((t) => {
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="cf-focusable inline-flex items-center gap-1.5"
                  style={{
                    padding: "14px 14px",
                    background: "transparent",
                    border: 0,
                    borderBottom: active
                      ? "2px solid var(--crm-brand)"
                      : "2px solid transparent",
                    color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                  {t.count > 0 && (
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
          <div className="md:flex-1 md:overflow-y-auto" style={{ padding: "20px 24px" }}>
            {activeTab === "historico" && (
              <HistoricoTab
                activities={filteredActivities}
                allActivities={activities}
                counts={counts}
                filterType={filterType}
                onFilterChange={setFilterType}
                onCommentAdded={() => mutate()}
                dealId={dealId}
              />
            )}
            {activeTab === "atividades" && (
              <AtividadesTab activities={activities} />
            )}
            {activeTab === "negocios" && (
              <NegociosTab deal={deal} onPatch={patchDeal} productsMeta={productsMeta} />
            )}
            {activeTab === "arquivos" && (
              <ArquivosTab
                dealId={dealId}
                files={files}
                onChanged={() => mutateFiles()}
              />
            )}
            {activeTab === "atendimentos" && (
              <div
                className="text-center"
                style={{
                  padding: "40px 20px",
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 10,
                  color: "var(--crm-gray-500)",
                  fontSize: 13,
                }}
              >
                Nenhum atendimento registrado.
              </div>
            )}
          </div>
        </main>
      </div>

      <MoveDealPipelineDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        dealId={dealId}
        dealTitle={deal.title}
        currentPipelineId={deal.pipeline_id}
        onMoved={() => mutate()}
      />
    </div>
  )
}

// ─── HistoricoTab ───────────────────────────────────────────────

function HistoricoTab({
  activities,
  allActivities,
  counts,
  filterType,
  onFilterChange,
  onCommentAdded,
  dealId,
}: {
  activities: DealFullResponse["activities"]
  allActivities: DealFullResponse["activities"]
  counts: Record<string, number>
  filterType: "all" | "negocios" | "notes" | "emails" | "reunioes" | "alertas"
  onFilterChange: (
    f: "all" | "negocios" | "notes" | "emails" | "reunioes" | "alertas",
  ) => void
  onCommentAdded: () => void
  dealId: string
}) {
  const [showComposer, setShowComposer] = useState(false)
  const [comment, setComment] = useState("")
  const [posting, setPosting] = useState(false)

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    try {
      await fetch(`/api/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          content: comment.trim(),
          is_internal: true,
        }),
      })
      setComment("")
      setShowComposer(false)
      onCommentAdded()
    } finally {
      setPosting(false)
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              letterSpacing: "-0.01em",
            }}
          >
            Histórico
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--crm-gray-500)",
              marginTop: 2,
            }}
          >
            Tudo que aconteceu com esse lead — eventos do sistema, atividades da equipe e respostas do cliente.
          </p>
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
              cursor: "pointer",
            }}
          >
            <TagIcon className="h-3 w-3" />
            Todos
          </button>
          <button
            onClick={() => setShowComposer(true)}
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              fontSize: 12,
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            <Plus className="h-3 w-3" />
            Comentário
          </button>
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <div
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
            padding: 10,
            marginBottom: 16,
          }}
        >
          <textarea
            autoFocus
            className="w-full outline-none"
            style={{
              minHeight: 80,
              padding: "8px 10px",
              fontSize: 13,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              border: "1px solid var(--crm-border)",
              resize: "vertical",
              fontFamily: "var(--crm-font-sans)",
            }}
            placeholder="Anote um comentário sobre esse lead..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                postComment()
              }
              if (e.key === "Escape") {
                setShowComposer(false)
                setComment("")
              }
            }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setShowComposer(false)
                setComment("")
              }}
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: "transparent",
                color: "var(--crm-gray-600)",
                border: "1px solid var(--crm-border)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={postComment}
              disabled={!comment.trim() || posting}
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                border: 0,
                cursor: posting ? "default" : "pointer",
                opacity: !comment.trim() || posting ? 0.5 : 1,
              }}
            >
              {posting ? "Postando..." : "Postar"}
            </button>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {(
          [
            { id: "all", label: "Tudo", count: counts.all },
            { id: "negocios", label: "Negócios", count: counts.negocios },
            { id: "notes", label: "Notas", count: counts.notes },
            { id: "emails", label: "Emails", count: counts.emails },
            { id: "reunioes", label: "Reuniões", count: counts.reunioes },
            { id: "alertas", label: "Alertas", count: counts.alertas },
          ] as const
        ).map((p) => {
          const active = filterType === p.id
          return (
            <button
              key={p.id}
              onClick={() => onFilterChange(p.id)}
              className="shrink-0"
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                borderRadius: 999,
                background: active ? "var(--crm-blue-50)" : "var(--crm-gray-0)",
                color: active ? "var(--crm-brand)" : "var(--crm-gray-600)",
                border: active
                  ? "1px solid var(--crm-blue-100)"
                  : "1px solid var(--crm-border)",
                cursor: "pointer",
              }}
            >
              {p.label}
              {p.count > 0 && (
                <span
                  className="crm-tnum"
                  style={{ marginLeft: 4, opacity: 0.7 }}
                >
                  {p.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div
          className="text-center"
          style={{
            padding: "40px 20px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 10,
            color: "var(--crm-gray-500)",
            fontSize: 13,
          }}
        >
          {filterType === "all" && allActivities.length === 0
            ? "Nenhuma atividade registrada ainda."
            : `Nenhum item para o filtro "${filterType}".`}
        </div>
      ) : (
        <div className="relative">
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 17,
              top: 12,
              bottom: 12,
              width: 1,
              background: "var(--crm-gray-200)",
            }}
          />
          <div className="flex flex-col gap-2">
            {activities.map((a) => (
              <TimelineRow key={a.id} activity={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineRow({
  activity,
}: {
  activity: DealFullResponse["activities"][number]
}) {
  const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.note
  const Icon = meta.icon
  const isAlert = activity.metadata?.alert === true
  const bgHighlight = isAlert
    ? "var(--crm-warn-bg)"
    : meta.highlight === "deal"
      ? "var(--crm-pos-bg)"
      : "var(--crm-gray-0)"
  const borderHighlight = isAlert
    ? "var(--crm-warn-border)"
    : meta.highlight === "deal"
      ? "var(--crm-pos-border)"
      : "var(--crm-border)"

  return (
    <div className="flex items-start gap-3 relative" style={{ zIndex: 1 }}>
      {/* Icon node */}
      <div
        className="flex items-center justify-center shrink-0 rounded-full"
        style={{
          width: 36,
          height: 36,
          background: meta.bg,
          color: meta.color,
          border: "3px solid var(--crm-gray-50)",
        }}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Card */}
      <div
        className="flex-1 min-w-0"
        style={{
          padding: "10px 14px",
          background: bgHighlight,
          border: `1px solid ${borderHighlight}`,
          borderRadius: 8,
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--crm-gray-900)",
              lineHeight: 1.4,
            }}
          >
            {isAlert && <Flag className="h-3 w-3 inline mr-1.5" style={{ color: "var(--crm-warn)" }} />}
            <span>
              <b>{meta.label}</b>
              {activity.content && ` — ${activity.content}`}
            </span>
          </div>
          <span
            className="crm-tnum shrink-0"
            style={{
              fontSize: 11,
              color: "var(--crm-gray-500)",
            }}
          >
            {new Date(activity.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {activity.creator && (
          <div
            className="flex items-center gap-1.5"
            style={{ marginTop: 6, fontSize: 11, color: "var(--crm-gray-500)" }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 16,
                height: 16,
                background: avatarColorFromName(activity.creator.name).bg,
                color: avatarColorFromName(activity.creator.name).fg,
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {getInitials(activity.creator.name)}
            </span>
            <span>{activity.creator.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Atividades tab ─────────────────────────────────────────────

function AtividadesTab({
  activities,
}: {
  activities: DealFullResponse["activities"]
}) {
  const tasks = activities.filter((a) => a.type === "task")
  if (tasks.length === 0) {
    return (
      <div
        className="text-center"
        style={{
          padding: "40px 20px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          color: "var(--crm-gray-500)",
          fontSize: 13,
        }}
      >
        Nenhuma tarefa registrada ainda.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => {
        const isDone = !!t.completed_at
        const isOverdue =
          t.due_at && !isDone && new Date(t.due_at).getTime() < Date.now()
        return (
          <div
            key={t.id}
            className="flex items-center gap-3"
            style={{
              padding: "12px 14px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              borderRadius: 8,
            }}
          >
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: isDone
                  ? "var(--crm-pos)"
                  : isOverdue
                    ? "var(--crm-warn)"
                    : "transparent",
                border: `1.5px solid ${isDone ? "var(--crm-pos)" : isOverdue ? "var(--crm-warn)" : "var(--crm-gray-300)"}`,
                color: "white",
              }}
            >
              {isDone && <Check className="h-3 w-3" />}
            </span>
            <span
              className="flex-1"
              style={{
                fontSize: 13,
                color: isDone ? "var(--crm-pos)" : "var(--crm-gray-900)",
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {t.content}
            </span>
            {t.due_at && (
              <span
                className="crm-tnum"
                style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
              >
                {new Date(t.due_at).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Negocios tab ───────────────────────────────────────────────

function NegociosTab({
  deal,
  onPatch,
  productsMeta,
}: {
  deal: DealFullResponse["deal"]
  onPatch: (update: Record<string, unknown>) => Promise<void>
  productsMeta?: DealProductsMeta | null
}) {
  // Mesma regra do drawer: com produtos, o valor é a soma das linhas
  // (edição manual seria sobrescrita no próximo recálculo) e a projeção
  // 12m respeita o CICLO de cada item; "/mês" só quando é verdade.
  const hasProducts = (productsMeta?.count ?? 0) > 0
  const recurringOnly =
    hasProducts && (productsMeta?.oneTime ?? 0) === 0 && (productsMeta?.recurring ?? 0) > 0
  const annual = hasProducts ? (productsMeta?.annualized ?? deal.value ?? 0) : (deal.value || 0) * 12
  const allMonthly =
    recurringOnly && Math.abs(annual - (productsMeta?.recurring ?? 0) * 12) < 0.01
  const showPerMonth = !hasProducts || allMonthly
  return (
    <div
      style={{
        padding: "20px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              Negócio #{deal.id.slice(0, 6)}
            </h3>
            <span
              className="inline-flex items-center gap-1"
              style={{
                padding: "1px 7px",
                borderRadius: 4,
                background:
                  deal.status === "won"
                    ? "var(--crm-pos-bg)"
                    : deal.status === "lost"
                      ? "var(--crm-neg-bg)"
                      : "var(--crm-blue-50)",
                color:
                  deal.status === "won"
                    ? "var(--crm-pos)"
                    : deal.status === "lost"
                      ? "var(--crm-neg)"
                      : "var(--crm-brand)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {deal.stage?.name ?? deal.status}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {hasProducts && !allMonthly ? "Valor do negócio" : "Valor recorrente"}
          </div>
          <div
            className="crm-tnum"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              marginTop: 4,
            }}
          >
            {hasProducts ? (
              <span title="Com produtos lançados, o valor é a soma das linhas — edite pelos itens">
                {fmtBRL(deal.value || 0)}
                {showPerMonth && (
                  <span style={{ fontSize: 12, color: "var(--crm-gray-500)", fontWeight: 500 }}>
                    /mês
                  </span>
                )}
              </span>
            ) : (
              <InlineEditField
                type="number"
                value={deal.value || 0}
                prefix="R$ "
                suffix="/mês"
                min={0}
                step={100}
                onSave={(v) => onPatch({ value: parseFloat(v) || 0 })}
                displayStyle={{ fontSize: 16, fontWeight: 600 }}
              />
            )}
          </div>
        </div>
        <Stat
          label="Em 12 meses"
          value={fmtBRL(annual)}
          color="var(--crm-brand)"
        />
        <Stat label="Pipeline" value={deal.pipeline?.name ?? "—"} />
        <Stat label="Etapa" value={deal.stage?.name ?? "—"} />
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div>
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
        className="crm-tnum"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: color ?? "var(--crm-gray-900)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Arquivos tab ───────────────────────────────────────────────

function ArquivosTab({
  dealId,
  files,
  onChanged,
}: {
  dealId: string
  files: DealFile[]
  onChanged: () => void
}) {
  const handleDelete = async (fileId: string) => {
    if (!window.confirm("Excluir este arquivo?")) return
    await fetch(`/api/crm/deals/${dealId}/files/${fileId}`, { method: "DELETE" })
    onChanged()
  }

  if (files.length === 0) {
    return (
      <div
        className="text-center"
        style={{
          padding: "40px 20px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          color: "var(--crm-gray-500)",
          fontSize: 13,
        }}
      >
        Nenhum arquivo anexado ainda.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-3"
          style={{
            padding: "12px 14px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
          }}
        >
          <span
            className="flex items-center justify-center shrink-0 rounded-[6px]"
            style={{
              width: 36,
              height: 36,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <FileIcon className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="truncate"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--crm-gray-900)",
              }}
            >
              {f.name}
            </div>
            <div
              className="crm-tnum"
              style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
            >
              {f.size_bytes && f.size_bytes > 1048576
                ? `${(f.size_bytes / 1048576).toFixed(1)} MB`
                : f.size_bytes
                  ? `${Math.round(f.size_bytes / 1024)} KB`
                  : ""}{" "}
              · {new Date(f.created_at).toLocaleDateString("pt-BR")}
            </div>
          </div>
          {f.signed_url && (
            <a
              href={f.signed_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--crm-gray-500)",
                cursor: "pointer",
              }}
              title="Baixar"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={() => handleDelete(f.id)}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--crm-gray-400)",
              cursor: "pointer",
            }}
            title="Remover"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function TopbarBtn({
  icon,
  label,
  href,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  disabled?: boolean
  onClick?: () => void
}) {
  const style: React.CSSProperties = {
    height: 32,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    background: "var(--crm-gray-0)",
    color: disabled ? "var(--crm-gray-400)" : "var(--crm-gray-700)",
    border: "1px solid var(--crm-border)",
    cursor: disabled ? "default" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    opacity: disabled ? 0.6 : 1,
  }
  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {icon}
        {label}
      </a>
    )
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={style}>
      {icon}
      {label}
    </button>
  )
}

function Section({
  title,
  children,
  expandable,
}: {
  title: string
  children: React.ReactNode
  expandable?: boolean
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {title}
        </h3>
        {expandable && (
          <ChevronRight
            className="h-3 w-3"
            style={{ color: "var(--crm-gray-400)" }}
          />
        )}
      </div>
      {children}
    </section>
  )
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
      }}
    >
      <div
        className="inline-flex items-center"
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "var(--crm-blue-50)",
          color: "var(--crm-brand)",
          marginBottom: 6,
          padding: 4,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="crm-tnum"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** Item do menu ⋯ da topbar. */
function MenuItem({
  icon,
  label,
  onSelect,
  tone,
}: {
  icon: React.ReactNode
  label: string
  onSelect: () => void
  tone?: "danger"
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-[color:var(--crm-gray-50)]"
      style={{
        padding: "7px 12px",
        fontSize: 12.5,
        color: tone === "danger" ? "var(--crm-neg)" : "var(--crm-gray-800)",
      }}
    >
      <span
        style={{
          color: tone === "danger" ? "var(--crm-neg)" : "var(--crm-gray-400)",
          display: "flex",
        }}
      >
        {icon}
      </span>
      {label}
    </DropdownMenu.Item>
  )
}

function TrendingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

/**
 * ContactField — linha do painel de contato.
 *
 * Com `onSave` vira edicao inline (mesmo InlineEditField do resto da
 * ficha); sem, segue read-only como era. `alwaysShow` mantem a linha
 * visivel mesmo vazia — necessario no Endereco, senao um campo em branco
 * nao teria como ser preenchido pela primeira vez.
 *
 * `href` e `onSave` sao mutuamente exclusivos na pratica: o link so
 * existe em campo derivado (site da loja), que nao se edita por aqui.
 */
function ContactField({
  icon,
  label,
  value,
  href,
  mono,
  onSave,
  alwaysShow,
}: {
  icon?: React.ReactNode
  label: string
  value: string | null
  href?: string
  mono?: boolean
  onSave?: (next: string) => Promise<void> | void
  alwaysShow?: boolean
}) {
  if (!value && !onSave && !alwaysShow) return null
  const body = (
    <span
      className={mono ? "crm-tnum truncate" : "truncate"}
      style={{ flex: 1, minWidth: 0 }}
    >
      {value}
    </span>
  )
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>{label}</span>
      <div
        className="flex items-center gap-2"
        style={{
          fontSize: 13,
          color: "var(--crm-gray-800)",
        }}
      >
        {icon && (
          <span style={{ color: "var(--crm-gray-400)", flexShrink: 0 }}>
            {icon}
          </span>
        )}
        {onSave ? (
          <InlineEditField
            value={value}
            placeholder={`Adicionar ${label.toLowerCase()}`}
            onSave={onSave}
            rootStyle={{ flex: 1, minWidth: 0, fontSize: 13 }}
            displayStyle={{ color: "var(--crm-gray-800)" }}
          />
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--crm-gray-800)" }}
            className="truncate flex-1"
          >
            {value}
          </a>
        ) : (
          body
        )}
      </div>
    </div>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: "info" | "neg" | "pos" | "warn" | "neut" | "purple"
  children: React.ReactNode
}) {
  const map = {
    info: { bg: "var(--crm-info-bg)", c: "var(--crm-info)", b: "var(--crm-info-border)" },
    neg: { bg: "var(--crm-neg-bg)", c: "var(--crm-neg)", b: "var(--crm-neg-border)" },
    pos: { bg: "var(--crm-pos-bg)", c: "var(--crm-pos)", b: "var(--crm-pos-border)" },
    warn: { bg: "var(--crm-warn-bg)", c: "var(--crm-warn)", b: "var(--crm-warn-border)" },
    neut: { bg: "var(--crm-neut-bg)", c: "var(--crm-neut)", b: "var(--crm-neut-border)" },
    purple: { bg: "var(--crm-purple-bg)", c: "var(--crm-purple)", b: "var(--crm-purple-border)" },
  }
  const t = map[tone]
  return (
    <span
      style={{
        padding: "1px 7px",
        borderRadius: 4,
        background: t.bg,
        border: `1px solid ${t.b}`,
        fontSize: 11,
        fontWeight: 500,
        color: t.c,
      }}
    >
      {children}
    </span>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────

function DealDetailSkeleton() {
  return (
    <div
      className="flex h-full"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      <aside
        className="shrink-0 p-5 space-y-4"
        style={{
          width: 320,
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
            style={{ width: 160, background: "var(--crm-gray-200)" }}
          />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded animate-pulse"
            style={{ height: 60, background: "var(--crm-gray-100)" }}
          />
        ))}
      </aside>
      <main className="flex-1 p-6 space-y-4">
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
