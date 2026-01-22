"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Mail,
  MessageSquare,
  Bell,
  Store,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { Campaign, ClientStore, Client } from "@/types"
import { CampaignModal } from "@/components/campaigns/campaign-modal"
import { CampaignFormModal } from "@/components/campaigns/campaign-form-modal"

// Channel icons and colors
const channelConfig = {
  email: { icon: Mail, color: "bg-blue-500", label: "Email" },
  sms: { icon: MessageSquare, color: "bg-green-500", label: "SMS" },
  push: { icon: Bell, color: "bg-purple-500", label: "Push" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-500", label: "WhatsApp" },
}

// Status colors
const statusColors = {
  draft: "bg-gray-400",
  scheduled: "bg-yellow-500",
  sent: "bg-green-500",
  cancelled: "bg-red-500",
}

interface StoreWithClient extends ClientStore {
  client?: Client
}

export default function CampaignsCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stores, setStores] = useState<StoreWithClient[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)

  // Get calendar data
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // First day of month and days in month
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Month names in Portuguese
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  // Fetch stores
  const fetchStores = useCallback(async () => {
    try {
      const response = await fetch("/api/stores")
      if (response.ok) {
        const data = await response.json()
        setStores(data.stores || [])
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }, [])

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`

      let url = `/api/campaigns?start_date=${startDate}&end_date=${endDate}`
      if (selectedStore !== "all") {
        url += `&store_id=${selectedStore}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error)
    } finally {
      setLoading(false)
    }
  }, [year, month, daysInMonth, selectedStore])

  // Sync campaigns from Klaviyo
  const syncCampaigns = async (storeId: string) => {
    setSyncing(true)
    try {
      const response = await fetch("/api/campaigns/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Sincronizado ${data.synced} campanhas com sucesso!`)
        fetchCampaigns()
      } else {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
      }
    } catch (error) {
      console.error("Error syncing campaigns:", error)
      alert("Erro ao sincronizar campanhas")
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get campaigns for a specific day
  const getCampaignsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return campaigns.filter(c => c.scheduled_date === dateStr)
  }

  // Check if day is today
  const isToday = (day: number) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  // Handle day click
  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dayCampaigns = getCampaignsForDay(day)

    if (dayCampaigns.length === 1) {
      setSelectedCampaign(dayCampaigns[0])
    } else if (dayCampaigns.length > 1) {
      setSelectedDate(dateStr)
    } else {
      // Open form to create new campaign
      setSelectedDate(dateStr)
      setShowFormModal(true)
    }
  }

  // Handle campaign click
  const handleCampaignClick = (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedCampaign(campaign)
  }

  // Render calendar grid
  const renderCalendarDays = () => {
    const days = []

    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className="h-32 border border-border/50 bg-muted/20"
        />
      )
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCampaigns = getCampaignsForDay(day)
      const dayIsToday = isToday(day)

      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`
            h-32 border border-border/50 p-1 cursor-pointer transition-colors
            hover:bg-muted/50
            ${dayIsToday ? "bg-primary/5 border-primary/30" : ""}
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className={`
                text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full
                ${dayIsToday ? "bg-primary text-primary-foreground" : ""}
              `}
            >
              {day}
            </span>
            {dayCampaigns.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{dayCampaigns.length - 3}
              </span>
            )}
          </div>
          <div className="space-y-0.5 overflow-hidden">
            {dayCampaigns.slice(0, 3).map((campaign) => {
              const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
              return (
                <div
                  key={campaign.id}
                  onClick={(e) => handleCampaignClick(campaign, e)}
                  className={`
                    text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1
                    text-white cursor-pointer hover:opacity-90 transition-opacity
                  `}
                  style={{ backgroundColor: campaign.color || "#3b82f6" }}
                  title={campaign.name}
                >
                  <ChannelIcon className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{campaign.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return days
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendário de Campanhas</h1>
          <p className="text-muted-foreground">
            Visualize e gerencie suas campanhas de marketing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedDate(null)
              setShowFormModal(true)
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
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-48 text-center">
                <h2 className="text-lg font-semibold">
                  {monthNames[month]} {year}
                </h2>
              </div>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToToday}>
                Hoje
              </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedStore}
                  onValueChange={setSelectedStore}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todas as lojas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lojas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedStore !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncCampaigns(selectedStore)}
                  disabled={syncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
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
          {loading ? (
            <div className="p-6">
              <Skeleton className="h-[600px] w-full" />
            </div>
          ) : (
            <>
              {/* Week days header */}
              <div className="grid grid-cols-7 border-b">
                {weekDays.map((day) => (
                  <div
                    key={day}
                    className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {renderCalendarDays()}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Campaign Detail Modal */}
      {selectedCampaign && (
        <CampaignModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onEdit={() => {
            setShowFormModal(true)
          }}
          onDelete={() => {
            fetchCampaigns()
            setSelectedCampaign(null)
          }}
        />
      )}

      {/* Day Campaigns List Modal */}
      {selectedDate && !showFormModal && !selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Campanhas em {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR")}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedDate(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {campaigns
                  .filter((c) => c.scheduled_date === selectedDate)
                  .map((campaign) => {
                    const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
                    return (
                      <div
                        key={campaign.id}
                        onClick={() => {
                          setSelectedDate(null)
                          setSelectedCampaign(campaign)
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
                onClick={() => setShowFormModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Campaign Form Modal */}
      {showFormModal && (
        <CampaignFormModal
          stores={stores}
          initialDate={selectedDate || undefined}
          campaign={selectedCampaign || undefined}
          onClose={() => {
            setShowFormModal(false)
            setSelectedDate(null)
            setSelectedCampaign(null)
          }}
          onSave={() => {
            fetchCampaigns()
            setShowFormModal(false)
            setSelectedDate(null)
            setSelectedCampaign(null)
          }}
        />
      )}
    </div>
  )
}
