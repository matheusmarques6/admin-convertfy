"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Mail,
  Store,
  X,
  Calendar,
  BarChart3,
  Zap,
  PenLine,
  Construction,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PermissionGate } from "@/components/permission-gate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CampaignModal } from "@/components/campaigns/campaign-modal"
import { CampaignFormModal } from "@/components/campaigns/campaign-form-modal"
import { CampaignsListView } from "@/components/campaigns/campaigns-list-view"
import { QuickCampaignModal } from "@/components/campaigns/quick-campaign-modal"
import { useCampaignsCalendar } from "./use-campaigns-calendar"
import { CalendarGrid, channelConfig } from "./calendar-grid"

const statusColors: Record<string, string> = {
  draft: "bg-muted-foreground",
  pending_review: "bg-blue-500",
  approved: "bg-emerald-500",
  rejected: "bg-orange-500",
  scheduled: "bg-warning",
  sent: "bg-success",
  cancelled: "bg-destructive",
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

type ViewMode = "calendar" | "performance" | "copy"

export default function CampaignsCalendarPage() {
  const cal = useCampaignsCalendar()
  const [viewMode, setViewMode] = useState<ViewMode>("calendar")
  const [showQuickModal, setShowQuickModal] = useState(false)

  return (
    <PermissionGate requiredFeatures={["campaign_control", "campaign_view"]}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">
          Visualize e gerencie suas campanhas de marketing
        </p>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-lg border bg-muted p-1">
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "calendar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendário
            </button>
            <button
              onClick={() => setViewMode("performance")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "performance"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Desempenho
            </button>
            <button
              onClick={() => setViewMode("copy")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "copy"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PenLine className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQuickModal(true)}
          >
            <Zap className="h-4 w-4 mr-2" />
            Rápida
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              cal.setSelectedDate(null)
              cal.setShowFormModal(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {/* Performance View */}
      {viewMode === "performance" && <CampaignsListView />}

      {/* Copy View - Em Desenvolvimento */}
      {viewMode === "copy" && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Copy</h3>
          <p className="text-muted-foreground mt-1 max-w-md">
            Geração de copys para campanhas em desenvolvimento. Em breve você poderá criar e gerenciar copys diretamente por aqui.
          </p>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (<>

      {/* Filters and Navigation */}
      <GlowCard color="primary" intensity="subtle">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={cal.prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-48 text-center">
                <h2 className="text-lg font-semibold">
                  {monthNames[cal.month]} {cal.year}
                </h2>
              </div>
              <Button variant="outline" size="icon" onClick={cal.nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={cal.goToToday}>
                Hoje
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <Select value={cal.selectedStore} onValueChange={cal.setSelectedStore}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todas as lojas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lojas</SelectItem>
                    {cal.stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cal.selectedStore !== "all" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cal.syncCampaigns(cal.selectedStore)}
                  disabled={cal.syncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${cal.syncing ? "animate-spin" : ""}`} />
                  Sincronizar Klaviyo
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cal.syncAllStores()}
                  disabled={cal.syncingAll}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${cal.syncingAll ? "animate-spin" : ""}`} />
                  Sync Todas as Lojas
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </GlowCard>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">Canais:</span>
        {Object.entries(channelConfig).map(([key, config]) => {
          const Icon = config.icon
          return (
            <div key={key} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${config.color}`} />
              <Icon className="h-3 w-3" />
              <span>{config.label}</span>
            </div>
          )
        })}
        <span className="text-muted-foreground ml-4">Status:</span>
        {Object.entries(statusColors).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span className="capitalize">{key}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <GlowCard color="primary" intensity="subtle">
        <CardContent className="p-0">
          {cal.loading ? (
            <div className="p-6">
              <Skeleton className="h-[600px] w-full" />
            </div>
          ) : (
            <CalendarGrid
              daysInMonth={cal.daysInMonth}
              startingDayOfWeek={cal.startingDayOfWeek}
              getCampaignsForDay={cal.getCampaignsForDay}
              isDayToday={cal.isDayToday}
              onDayClick={cal.handleDayClick}
              onCampaignClick={cal.handleCampaignClick}
            />
          )}
        </CardContent>
      </GlowCard>

      </>)}

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

      {/* Day Campaigns List Modal */}
      {cal.selectedDate && !cal.showFormModal && !cal.selectedCampaign && !showQuickModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Campanhas em {new Date(cal.selectedDate + "T12:00:00").toLocaleDateString("pt-BR")}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => cal.setSelectedDate(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cal.campaigns
                  .filter((c) => c.scheduled_date === cal.selectedDate)
                  .map((campaign) => {
                    const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
                    return (
                      <div
                        key={campaign.id}
                        onClick={() => {
                          cal.setSelectedDate(null)
                          cal.setSelectedCampaign(campaign)
                        }}
                        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: campaign.color }}
                        >
                          <ChannelIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {campaign.scheduled_time || "Sem horário"} •{" "}
                            {campaign.store?.store_name || "Loja"}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {campaign.status}
                        </Badge>
                      </div>
                    )
                  })}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowQuickModal(true)}
                >
                  Rápida
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => cal.setShowFormModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Completa
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
