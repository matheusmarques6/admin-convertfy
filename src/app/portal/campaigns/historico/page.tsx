"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CampaignHistoryList } from "@/components/campaigns/campaign-history-list"
import { createClient } from "@/lib/supabase/client"
import type { StoreItem } from "@/components/campaigns/store-selector"

interface CampaignGeneration {
  id: string
  name: string
  date: string
  status: "draft" | "processing" | "done"
  drive_folder_url: string | null
  created_at: string
}

export default function CampaignHistoryPage() {
  const [generations, setGenerations] = useState<CampaignGeneration[]>([])
  const [allStores, setAllStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      // Get portal user's client_id first to scope store queries
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("client_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single()

      if (!portalUser) throw new Error("Portal user not found")

      const [genResult, storesResult] = await Promise.all([
        supabase
          .from("campaign_generations")
          .select("id, name, date, status, drive_folder_url, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("client_stores")
          .select("id, store_name, country, language")
          .eq("client_id", portalUser.client_id),
      ])

      if (genResult.error) throw genResult.error

      setGenerations(
        (genResult.data || []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          date: row.date as string,
          status: row.status as CampaignGeneration["status"],
          drive_folder_url: row.drive_folder_url as string | null,
          created_at: row.created_at as string,
        })),
      )

      if (!storesResult.error && storesResult.data) {
        setAllStores(
          storesResult.data.map((row) => ({
            id: row.id as string,
            store_name: row.store_name as string,
            country: row.country as string,
            language: row.language as string,
          })),
        )
      }
    } catch (err) {
      console.error("Error fetching campaign data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleGenerationUpdated = useCallback(
    (id: string, updates: Partial<CampaignGeneration>) => {
      setGenerations((prev) =>
        prev.map((gen) => (gen.id === id ? { ...gen, ...updates } : gen)),
      )
    },
    [],
  )

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100">
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/portal/campaigns"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors mb-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao calendario
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Historico de Campanhas
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Acompanhe o status das campanhas geradas e regenere copies.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06] shadow-sm dark:shadow-slate-900/20"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-3" />
            Carregando historico...
          </div>
        ) : (
          <CampaignHistoryList
            generations={generations}
            allStores={allStores}
            onGenerationUpdated={handleGenerationUpdated}
          />
        )}
      </div>
    </div>
  )
}
