"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { KlaviyoFullscreenReport } from "@/components/clients/klaviyo-fullscreen-report"

export default function ReportPage() {
  const searchParams = useSearchParams()
  const storeId = searchParams.get("store_id")
  const period = searchParams.get("period") || "30d"

  const [storeName, setStoreName] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStore() {
      if (!storeId) {
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data } = await supabase
        .from("client_stores")
        .select("store_name")
        .eq("id", storeId)
        .single()

      if (data) {
        setStoreName(data.store_name)
      }
      setLoading(false)
    }

    loadStore()
  }, [storeId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <p>Store ID não fornecido</p>
      </div>
    )
  }

  return (
    <KlaviyoFullscreenReport
      storeId={storeId}
      storeName={storeName}
      period={period}
    />
  )
}
