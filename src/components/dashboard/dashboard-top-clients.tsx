"use client"

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────

interface TopClient {
  id: string
  name: string
  plan: string
  revenue30d: number
  healthScore: number
}

interface DashboardTopClientsProps {
  clients?: TopClient[]
  loading?: boolean
}

// ─── Mock data ────────────────────────────────────────────

const _MOCK_TOP_CLIENTS: TopClient[] = [
  { id: "1", name: "AchaTudo Store", plan: "Premium", revenue30d: 125400, healthScore: 92 },
  { id: "2", name: "Based 3.0", plan: "Enterprise", revenue30d: 98750, healthScore: 88 },
  { id: "3", name: "LensEVO", plan: "Premium", revenue30d: 87200, healthScore: 95 },
  { id: "4", name: "Donaris", plan: "Standard", revenue30d: 64300, healthScore: 76 },
  { id: "5", name: "Clube Rock", plan: "Premium", revenue30d: 58900, healthScore: 84 },
  { id: "6", name: "Momi Jewel", plan: "Standard", revenue30d: 45600, healthScore: 71 },
  { id: "7", name: "FashionUp", plan: "Enterprise", revenue30d: 42100, healthScore: 90 },
  { id: "8", name: "PetKing", plan: "Standard", revenue30d: 38400, healthScore: 65 },
  { id: "9", name: "TechBrasil", plan: "Premium", revenue30d: 35200, healthScore: 82 },
  { id: "10", name: "GreenLife", plan: "Standard", revenue30d: 28900, healthScore: 58 },
]

// ─── Column definitions ──────────────────────────────────

const topClientColumns: ColumnDef<TopClient>[] = [
  {
    accessorKey: "name",
    header: "Cliente",
    type: "text",
    mobilePriority: "title",
    cell: (row) => (
      <span className="font-medium text-gray-900 dark:text-white dark:text-[#EAEDF3]">
        {row.name}
      </span>
    ),
  },
  {
    accessorKey: "plan",
    header: "Plano",
    type: "badge",
    mobilePriority: "badge",
    cell: (row) => (
      <Badge variant="neutral" showDot={false}>
        {row.plan}
      </Badge>
    ),
  },
  {
    accessorKey: "revenue30d",
    header: "Receita 30d",
    type: "currency",
    mobilePriority: "detail",
    sortable: true,
  },
  {
    accessorKey: "healthScore",
    header: "Health",
    type: "custom",
    mobilePriority: "detail",
    cell: (row) => {
      const variant =
        row.healthScore >= 80
          ? "positive"
          : row.healthScore >= 50
            ? "warning"
            : "negative"
      return (
        <Badge variant={variant} showDot>
          {row.healthScore}/100
        </Badge>
      )
    },
  },
]

// ─── DashboardTopClients (exported) ───────────────────────

export function DashboardTopClients({
  clients,
  loading = false,
}: DashboardTopClientsProps) {
  const data = clients ?? []

  return (
    <div className="mt-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Top Clientes por Receita
            </CardTitle>
            <Link
              href="/admin/clients"
              className="text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
            >
              Ver todos →
            </Link>
          </div>
        </CardHeader>
        <CardContent className={cn("p-0", loading && "p-6 pt-0")}>
          <DataTable
            columns={topClientColumns}
            data={data}
            loading={loading}
            emptyMessage="Nenhum cliente encontrado"
            rowKey="id"
          />
        </CardContent>
      </Card>
    </div>
  )
}
