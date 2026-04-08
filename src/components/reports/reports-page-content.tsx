"use client"

import { useState } from "react"
import { BarChart3, Zap } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Button } from "@/components/ui/button"
import { TabReports, type PendingStore } from "./tab-reports"
import { TabJobs } from "./tab-jobs"
import { GenerateReportModal, type StoreOption } from "./generate-report-modal"
import type { Report } from "@/types"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

interface ReportsPageContentProps {
  reports: ReportWithRelations[]
  clients: { id: string; name: string }[]
  pendingStores: PendingStore[]
  totalCount: number
  thisMonthCount: number
  configuredStores: StoreOption[]
  initialStoreId?: string
  initialTab?: string
}

export function ReportsPageContent({
  reports,
  clients,
  pendingStores,
  totalCount,
  thisMonthCount,
  configuredStores,
  initialStoreId,
  initialTab,
}: ReportsPageContentProps) {
  const [tab, setTab] = useState<string>(initialTab === "jobs" ? "jobs" : "reports")
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Relatórios"
        description="Gere e visualize relatórios de desempenho dos clientes"
        badge={totalCount}
        actions={
          <Button onClick={() => setShowGenerateModal(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Gerar Relatório
          </Button>
        }
      >
        <SegmentedTabs value={tab} onValueChange={setTab}>
          <SegmentedTabItem value="reports">Relatórios</SegmentedTabItem>
          <SegmentedTabItem value="jobs">Histórico de Geração</SegmentedTabItem>
        </SegmentedTabs>
      </PageHeader>

      {tab === "reports" && (
        <TabReports
          initialReports={reports}
          clients={clients}
          totalCount={totalCount}
          thisMonthCount={thisMonthCount}
          pendingStores={pendingStores}
          initialStoreId={initialStoreId}
        />
      )}

      {tab === "jobs" && <TabJobs />}

      <GenerateReportModal
        open={showGenerateModal}
        onOpenChange={setShowGenerateModal}
        stores={configuredStores}
        onGenerated={() => {
          // Switch to jobs tab to show the new job
          setTab("jobs")
        }}
      />
    </div>
  )
}
