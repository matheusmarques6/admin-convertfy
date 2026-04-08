"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { getInitials } from "@/lib/utils"
import type { MemberWithDetails } from "@/types"

// ─── Types ───────────────────────────────────────────────

interface TeamMemberRow {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  store_access_count: number
  client_count: number
  features_count: number
  status: string
  last_sign_in_at: string | null
}

interface TeamPageClientProps {
  members: (MemberWithDetails & { client_count?: number })[]
}

// ─── Helpers ─────────────────────────────────────────────

function getOnlineStatus(lastSignIn: string | null | undefined): string {
  if (!lastSignIn) return "offline"
  const diffMs = Date.now() - new Date(lastSignIn).getTime()
  const diffMin = diffMs / 60000
  if (diffMin < 15) return "online"
  if (diffMin < 60 * 24) return "away"
  return "offline"
}

const ROLE_LABELS: Record<string, { label: string; variant: "positive" | "negative" | "warning" | "neutral" | "info" }> = {
  owner: { label: "Admin", variant: "negative" },
  admin: { label: "Admin", variant: "negative" },
  manager: { label: "Gerente", variant: "info" },
  coordinator: { label: "Coordenador", variant: "warning" },
  copywriter: { label: "Copywriter", variant: "neutral" },
  designer: { label: "Designer", variant: "neutral" },
  developer: { label: "Dev", variant: "neutral" },
  support: { label: "Suporte", variant: "neutral" },
  analyst: { label: "Analista", variant: "neutral" },
  member: { label: "Membro", variant: "neutral" },
}

// ─── Columns ─────────────────────────────────────────────

const columns: ColumnDef<TeamMemberRow>[] = [
  {
    accessorKey: "name",
    header: "Membro",
    mobilePriority: "title",
    width: "280px",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={row.avatar_url || undefined} />
          <AvatarFallback className="bg-gray-100 dark:bg-[#242836] text-xs font-semibold text-gray-500 dark:text-[#8B92A5]">
            {getInitials(row.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {row.name}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
            {row.email}
          </p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "role",
    header: "Cargo",
    type: "badge",
    mobilePriority: "badge",
    width: "120px",
    cell: (row) => {
      const cfg = ROLE_LABELS[row.role] || ROLE_LABELS.member
      return <Badge variant={cfg.variant} showDot={false}>{cfg.label}</Badge>
    },
  },
  {
    accessorKey: "store_access_count",
    header: "Lojas",
    type: "number",
    mobilePriority: "detail",
    width: "100px",
  },
  {
    accessorKey: "client_count",
    header: "Clientes",
    type: "number",
    mobilePriority: "detail",
    width: "100px",
  },
  {
    accessorKey: "features_count",
    header: "Features",
    type: "number",
    mobilePriority: "detail",
    hideOnTablet: true,
    width: "100px",
  },
  {
    accessorKey: "status",
    header: "Status",
    type: "badge",
    mobilePriority: "badge",
    width: "110px",
    cell: (row) => <StatusBadge status={row.status} />,
  },
]

// ─── Component ───────────────────────────────────────────

export function TeamPageClient({ members }: TeamPageClientProps) {
  const router = useRouter()

  const rows: TeamMemberRow[] = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        name: m.profile?.name || "Sem nome",
        email: m.profile?.email || "—",
        avatar_url: m.profile?.avatar_url || null,
        role: m.role,
        store_access_count: m.store_access_count || 0,
        client_count: m.client_count || 0,
        features_count: m.enabled_features?.length || 0,
        status: getOnlineStatus(m.profile?.last_sign_in_at),
        last_sign_in_at: m.profile?.last_sign_in_at || null,
      })),
    [members]
  )

  const handleRowClick = (row: TeamMemberRow) => {
    router.push(`/admin/settings/team?member=${row.id}`)
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      onRowClick={handleRowClick}
      rowKey="id"
      emptyMessage="Nenhum membro na equipe"
      emptyDescription="Convide membros em Configurações → Equipe."
    />
  )
}
