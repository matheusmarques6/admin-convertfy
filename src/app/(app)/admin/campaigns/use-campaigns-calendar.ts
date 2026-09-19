import { useState, useCallback } from "react"
import useSWR from "swr"
import { useToast } from "@/lib/hooks/use-toast"
import { Campaign, ClientStore, Client } from "@/types"

interface StoreWithClient extends ClientStore {
  client?: Client
}

interface CampaignsResponse {
  campaigns: Campaign[]
}

interface StoresResponse {
  stores: StoreWithClient[]
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  return res.json()
}

export function useCampaignsCalendar() {
  const { toast } = useToast()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [syncing, setSyncing] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // SWR: stores (static data, fetch once)
  const { data: storesData } = useSWR<StoresResponse>(
    "/api/stores",
    () => fetcher<StoresResponse>("/api/stores"),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // SWR: campaigns (re-fetches on month/store change)
  const buildCampaignsUrl = useCallback(() => {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`
    let url = `/api/campaigns?start_date=${startDate}&end_date=${endDate}`
    if (selectedStore !== "all") url += `&store_id=${selectedStore}`
    return url
  }, [year, month, daysInMonth, selectedStore])

  const {
    data: campaignsData,
    isLoading: loading,
    mutate,
  } = useSWR<CampaignsResponse>(
    ["/api/campaigns", month, year, selectedStore],
    () => fetcher<CampaignsResponse>(buildCampaignsUrl()),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  )

  const campaigns = campaignsData?.campaigns ?? []
  const stores = storesData?.stores ?? []

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
        toast({ title: "Sincronizado!", description: `${data.synced} campanhas sincronizadas com sucesso.` })
        mutate()
      } else {
        const error = await response.json()
        toast({ variant: "destructive", title: "Erro", description: error.error || "Erro ao sincronizar" })
      }
    } catch (error) {
      console.error("Error syncing campaigns:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao sincronizar campanhas" })
    } finally {
      setSyncing(false)
    }
  }

  const syncAllStores = async () => {
    setSyncingAll(true)
    try {
      const response = await fetch("/api/campaigns/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: "Sync completo!",
          description: `${data.totalSynced} campanhas de ${data.totalStores} lojas sincronizadas.${data.failedStores > 0 ? ` (${data.failedStores} falhas)` : ""}`,
        })
        mutate()
      } else {
        const error = await response.json()
        toast({ variant: "destructive", title: "Erro", description: error.error || "Erro ao sincronizar" })
      }
    } catch (error) {
      console.error("Error syncing all stores:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao sincronizar todas as lojas" })
    } finally {
      setSyncingAll(false)
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  const getCampaignsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return campaigns.filter(c => c.scheduled_date === dateStr)
  }

  const isDayToday = (day: number) => {
    const today = new Date()
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dayCampaigns = getCampaignsForDay(day)

    if (dayCampaigns.length === 1) {
      setSelectedCampaign(dayCampaigns[0])
    } else if (dayCampaigns.length > 1) {
      setSelectedDate(dateStr)
    } else {
      setSelectedDate(dateStr)
      setShowFormModal(true)
    }
  }

  const handleCampaignClick = (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedCampaign(campaign)
  }

  return {
    // Calendar state
    year, month, daysInMonth, startingDayOfWeek,
    // Data
    campaigns, stores, loading, syncing, syncingAll,
    selectedStore, setSelectedStore,
    selectedCampaign, setSelectedCampaign,
    selectedDate, setSelectedDate,
    showFormModal, setShowFormModal,
    // Actions
    prevMonth, nextMonth, goToToday,
    getCampaignsForDay, isDayToday,
    handleDayClick, handleCampaignClick,
    syncCampaigns, syncAllStores,
    fetchCampaigns: () => { mutate() },
  }
}
