"use client"

import { useState, useMemo } from "react"
import {
  CalendarDays,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { PermissionGate } from "@/components/permission-gate"
import { FilterSelect } from "@/components/ui/filter-select"
import { CampaignModal } from "@/components/campaigns/campaign-modal"
import { CampaignFormModal } from "@/components/campaigns/campaign-form-modal"
import { CampaignCalendar } from "@/components/campaigns/campaign-calendar"
import { CampaignPerformance } from "@/components/campaigns/campaign-performance"
import { QuickCampaignModal } from "@/components/campaigns/quick-campaign-modal"
import { useCampaignsCalendar } from "./use-campaigns-calendar"
import { cn } from "@/lib/utils"

type ViewMode = "calendar" | "performance"

export default function CampaignsPage() {
  const cal = useCampaignsCalendar()
  const [viewMode, setViewMode] = useState<ViewMode>("calendar")
  const [showQuickModal, setShowQuickModal] = useState(false)

  // KPI counts
  const counts = useMemo(() => ({
    total: cal.campaigns.length,
    sent: cal.campaigns.filter(c => c.status === "sent").length,
    scheduled: cal.campaigns.filter(c => c.status === "scheduled" || c.status === "approved" || c.status === "pending_review").length,
    draft: cal.campaigns.filter(c => c.status === "draft").length,
  }), [cal.campaigns])

  // Store filter options for calendar
  const storeOptions = useMemo(() => [
    { value: "all", label: "Todas as lojas" },
    ...cal.stores.map(s => ({ value: s.id, label: s.store_name })),
  ], [cal.stores])

  return (
    <PermissionGate requiredFeatures={["campaign_control", "campaign_view"]}>
    <div className="flex-1 space-y-6">
      {/* Page Header — DS v3.0 Rule 14 */}
      <PageHeader
        icon={CalendarDays}
        title="Campanhas"
        description="Planeje, acompanhe e gerencie suas campanhas de marketing"
        badge={counts.total}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQuickModal(true)}
            >
              <Zap className="h-4 w-4 mr-2" />
              Rápida
            </Button>
            <Button
              onClick={() => {
                cal.setSelectedDate(null)
                cal.setShowFormModal(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </>
        }
      >
        {/* SegmentedTabs — DS v3.0 Rule 18: view switcher */}
        <SegmentedTabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SegmentedTabItem value="calendar">Calendário</SegmentedTabItem>
          <SegmentedTabItem value="performance">Performance</SegmentedTabItem>
        </SegmentedTabs>
      </PageHeader>

      {/* KPI Summary — DS v3.0: no icon-in-circle, font-mono tabular-nums */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-[#8B92A5]">Total</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] mt-1">
            {counts.total}
          </p>
        </div>
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-[#8B92A5]">Enviadas</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#065F46] dark:text-[#6EE7B7] mt-1">
            {counts.sent}
          </p>
        </div>
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-[#8B92A5]">Agendadas</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#4E62D8] dark:text-[#7B8CEA] mt-1">
            {counts.scheduled}
          </p>
        </div>
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-[#8B92A5]">Rascunho</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] mt-1">
            {counts.draft}
          </p>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="space-y-4">
          {/* Calendar controls: store filter + sync */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterSelect
              value={cal.selectedStore}
              onValueChange={cal.setSelectedStore}
              options={storeOptions}
              placeholder="Loja"
            />
            <div className="flex items-center gap-2">
              {cal.selectedStore !== "all" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => cal.syncCampaigns(cal.selectedStore)}
                  disabled={cal.syncing}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", cal.syncing && "animate-spin")} />
                  Sincronizar Klaviyo
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => cal.syncAllStores()}
                  disabled={cal.syncingAll}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", cal.syncingAll && "animate-spin")} />
                  Sync Todas as Lojas
                </Button>
              )}
            </div>
          </div>

          <CampaignCalendar
            campaigns={cal.campaigns}
            loading={cal.loading}
            onCampaignClick={(campaign) => cal.setSelectedCampaign(campaign)}
          />
        </div>
      )}

      {/* Performance View */}
      {viewMode === "performance" && (
        <CampaignPerformance
          onCampaignClick={(campaign) => cal.setSelectedCampaign(campaign)}
        />
      )}

      {/* Campaign Detail Modal */}
      {cal.selectedCampaign && (
        <CampaignModal
          campaign={cal.selectedCampaign}
          onClose={() => cal.setSelectedCampaign(null)}
          onEdit={() => cal.setShowFormModal(true)}
          onDelete={() => {
            cal.fetchCampaigns()
            cal.setSelectedCampaign(null)
          }}
        />
      )}

      {/* Quick Campaign Modal */}
      {showQuickModal && (
        <QuickCampaignModal
          initialDate={cal.selectedDate || undefined}
          onClose={() => {
            setShowQuickModal(false)
            cal.setSelectedDate(null)
          }}
          onSave={() => {
            cal.fetchCampaigns()
            setShowQuickModal(false)
            cal.setSelectedDate(null)
          }}
        />
      )}

      {/* Campaign Form Modal */}
      {cal.showFormModal && (
        <CampaignFormModal
          initialDate={cal.selectedDate || undefined}
          onClose={() => {
            cal.setShowFormModal(false)
            cal.setSelectedDate(null)
            cal.setSelectedCampaign(null)
          }}
          onSave={() => {
            cal.fetchCampaigns()
            cal.setShowFormModal(false)
            cal.setSelectedDate(null)
            cal.setSelectedCampaign(null)
          }}
        />
      )}
    </div>
    </PermissionGate>
  )
}
