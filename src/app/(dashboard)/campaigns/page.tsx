"use client"

import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Mail,
  Store,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { useCampaignsCalendar } from "./use-campaigns-calendar"
import { CalendarGrid, channelConfig } from "./calendar-grid"

const statusColors: Record<string, string> = {
  draft: "bg-gray-400",
  scheduled: "bg-yellow-500",
  sent: "bg-green-500",
  cancelled: "bg-red-500",
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

export default function CampaignsCalendarPage() {
  const cal = useCampaignsCalendar()

  return (
    <PermissionGate requiredFeatures={["campaign_control", "campaign_view"]}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">
          Visualize e gerencie suas campanhas de marketing
        </p>
        <div className="flex items-center gap-2">
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

      {/* Filters and Navigation */}
      <Card>
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

              {cal.selectedStore !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cal.syncCampaigns(cal.selectedStore)}
                  disabled={cal.syncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${cal.syncing ? "animate-spin" : ""}`} />
                  Sincronizar Klaviyo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
      <Card>
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
      </Card>

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
      {cal.selectedDate && !cal.showFormModal && !cal.selectedCampaign && (
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
              <Button
                className="w-full mt-4"
                onClick={() => cal.setShowFormModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </CardContent>
          </Card>
        </div>
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
