"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterSelect } from "@/components/ui/filter-select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"
import { isRawTextBriefing, getRawText, briefingToFullText } from "@/lib/briefing/briefing-text"
import type { StoreBriefing } from "@/types/onboarding"

interface BriefingStore {
  store_id: string
  store_name: string
}

export default function BriefingsSettingsPage() {
  const { toast } = useToast()
  const [stores, setStores] = useState<BriefingStore[]>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [storeId, setStoreId] = useState("")
  const [briefing, setBriefing] = useState<StoreBriefing | null>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(false)

  // Load list of stores with a current briefing
  useEffect(() => {
    let cancelled = false
    async function loadStores() {
      try {
        const res = await fetch("/api/admin/briefings")
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Erro ao carregar lojas")
        if (!cancelled) setStores((j.stores as BriefingStore[]) || [])
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Erro",
            description: err instanceof Error ? err.message : "Erro ao carregar lojas.",
          })
        }
      } finally {
        if (!cancelled) setLoadingStores(false)
      }
    }
    loadStores()
    return () => {
      cancelled = true
    }
  }, [toast])

  const loadBriefing = useCallback(
    async (id: string) => {
      setLoadingBriefing(true)
      setBriefing(null)
      try {
        const res = await fetch(`/api/onboarding/store-briefing?store_id=${id}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Erro ao carregar briefing")
        setBriefing((j.briefing as StoreBriefing | null) ?? null)
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: err instanceof Error ? err.message : "Erro ao carregar briefing.",
        })
      } finally {
        setLoadingBriefing(false)
      }
    },
    [toast]
  )

  function handleSelectStore(id: string) {
    setStoreId(id)
    if (id) loadBriefing(id)
  }

  // Compute the displayed text
  const briefingText = briefing
    ? isRawTextBriefing(briefing.briefing_data)
      ? getRawText(briefing.briefing_data)
      : briefingToFullText(briefing.briefing_data)
    : ""

  async function handleCopy() {
    if (!briefingText) return
    try {
      await navigator.clipboard.writeText(briefingText)
      toast({ title: "Briefing copiado" })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível copiar." })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Briefings"
        description="Veja o briefing completo de cada loja"
        breadcrumb={[
          { label: "Configurações", href: "/admin/settings" },
          { label: "Briefings" },
        ]}
      />

      {/* Store selector */}
      {loadingStores ? (
        <Skeleton className="h-9 w-64 rounded-[6px]" />
      ) : (
        <FilterSelect
          value={storeId}
          onValueChange={handleSelectStore}
          options={stores.map((s) => ({ value: s.store_id, label: s.store_name }))}
          placeholder="Selecionar loja…"
          className="w-full sm:w-auto"
        />
      )}

      {/* Briefing content */}
      {!storeId ? (
        <div className="text-center py-12 text-gray-400 dark:text-[#5C6378]">
          Selecione uma loja para ver o briefing
        </div>
      ) : loadingBriefing ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded-[6px]" />
          ))}
        </div>
      ) : !briefing ? (
        <div className="text-center py-12 text-gray-400 dark:text-[#5C6378]">
          Esta loja não possui briefing
        </div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold">Briefing completo</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!briefingText}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar texto
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-[#EAEDF3] max-h-[600px] overflow-auto font-sans">
              {briefingText || "—"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
