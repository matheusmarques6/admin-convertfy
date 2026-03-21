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
  CalendarDays,
  BarChart3,
  Zap,
  CheckCircle,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PermissionGate } from "@/components/permission-gate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  pending_review: "bg-info",
  approved: "bg-success",
  rejected: "bg-warning",
  scheduled: "bg-warning",
  sent: "bg-success",
  cancelled: "bg-destructive",
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

type ViewMode = "calendar" | "performance"

export default function CampaignsCalendarPage() {
  const cal = useCampaignsCalendar()
  const [viewMode, setViewMode] = useState<ViewMode>("calendar")
  const [showQuickModal, setShowQuickModal] = useState(false)

  return (
    <PermissionGate requiredFeatures={["campaign_control", "campaign_view"]}>
    <div className="flex-1 space-y-6">
      {/* Page Header */}
      <PageHeader
        icon={CalendarDays}
        title="Campanhas"
        description="Planeje, acompanhe e gerencie suas campanhas de marketing"
        actions={
          <>
            {/* View Toggle */}
            <div className="flex rounded-lg border bg-muted p-1">
              <button
                onClick={() => setViewMode("calendar")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "calendar"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendário</span>
              </button>
              <button
                onClick={() => setViewMode("performance")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "performance"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Desempenho</span>
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQuickModal(true)}
            >
              <Zap className="h-4 w-4 mr-2" />
              Rápida
            </Button>

            <Button
              variant="secondary"
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
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Mail className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Total Campanhas</span>
          </div>
          <p className="text-xl font-bold">{cal.campaigns.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Enviadas</span>
          </div>
          <p className="text-xl font-bold">{cal.campaigns.filter(c => c.status === "sent").length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Rascunho</span>
          </div>
          <p className="text-xl font-bold">{cal.campaigns.filter(c => c.status === "draft").length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Calendar className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Agendadas</span>
          </div>
          <p className="text-xl font-bold">{cal.campaigns.filter(c => c.status === "scheduled").length}</p>
        </Card>
      </div>

      {/* Performance View */}
      {viewMode === "performance" && <CampaignsListView />}

      {/* Calendar View */}
      {viewMode === "calendar" && (<>

      {/* Filters and Navigation */}
      <Card className="rounded-xl border">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" onClick={cal.prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-32 sm:w-48 text-center">
                <h2 className="text-base sm:text-lg font-semibold">
                  {monthNames[cal.month]} {cal.year}
                </h2>
              </div>
              <Button variant="secondary" size="icon" onClick={cal.nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={cal.goToToday}>
                Hoje
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={cal.selectedStore} onValueChange={cal.setSelectedStore}>
                  <SelectTrigger className="w-full sm:w-[200px]">
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
                  variant="secondary"
                  size="sm"
                  onClick={() => cal.syncCampaigns(cal.selectedStore)}
                  disabled={cal.syncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${cal.syncing ? "animate-spin" : ""}`} />
                  Sincronizar Klaviyo
                </Button>
              ) : (
                <Button
                  variant="secondary"
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
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-medium text-muted-foreground">Canais:</span>
        {Object.entries(channelConfig).map(([key, config]) => {
          const Icon = config.icon
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded ${config.color}`} />
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span>{config.label}</span>
            </div>
          )
        })}
        <span className="font-medium text-muted-foreground ml-2">Status:</span>
        {Object.entries(statusColors).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="capitalize">{key}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[480px]">
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
          </div>
        </CardContent>
      </Card>

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
                        <Badge variant="neutral" showDot={false} className="capitalize">
                          {campaign.status}
                        </Badge>
                      </div>
                    )
                  })}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="secondary"
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
