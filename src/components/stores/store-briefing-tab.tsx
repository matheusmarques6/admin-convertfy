"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StoreBriefingView } from "@/components/onboarding/store-briefing-view"
import { StoreOnboardingForm } from "@/components/onboarding/store-onboarding-form"
import type { StoreBriefing } from "@/types/onboarding"

interface StoreBriefingTabProps {
  storeId: string
  clientId: string | null
}

export function StoreBriefingTab({ storeId, clientId }: StoreBriefingTabProps) {
  const [briefing, setBriefing] = useState<StoreBriefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // AC 12.1.1 — silent=true omite setLoading para não acionar spinner durante polling
  const fetchBriefing = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/onboarding/store-briefing?store_id=${storeId}`)
      const data = await res.json()
      setBriefing(data.briefing || null)
    } catch {
      setBriefing(null)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  // Fetch inicial no mount
  useEffect(() => {
    fetchBriefing()
  }, [fetchBriefing])

  // AC 12.1.1 — Polling de 10s enquanto sem briefing (silent, sem spinner)
  useEffect(() => {
    if (briefing !== null) return // já tem briefing, não pollar
    if (loading) return           // aguarda fetch inicial

    const interval = setInterval(() => {
      fetchBriefing(true) // silent=true: sem setLoading, sem spinner
    }, 10_000)

    return () => clearInterval(interval)
  }, [briefing, loading, fetchBriefing])

  async function openFormDialog() {
    setFormLoading(true)
    setFormDialogOpen(true)
    try {
      const res = await fetch(`/api/onboarding/store-data?store_id=${storeId}`)
      const data = await res.json()
      setFormInitialData(data)
    } catch {
      setFormInitialData(null)
    } finally {
      setFormLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* AC 12.1.1 — Indicador de aguardando N8N quando sem briefing e sem loading */}
      {briefing === null && (
        <div className="flex items-center gap-2 mb-4 rounded-md border border-muted bg-muted/30 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Briefing sendo gerado pelo N8N. Atualizando automaticamente a cada 10 segundos...
          </p>
        </div>
      )}
      <StoreBriefingView
        storeId={storeId}
        briefing={briefing}
        onRefresh={fetchBriefing}
        onEditForm={openFormDialog}
      />

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formulário de Onboarding</DialogTitle>
          </DialogHeader>
          {formLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <StoreOnboardingForm
              storeId={storeId}
              clientId={clientId || ''}
              initialData={formInitialData as Record<string, unknown> | undefined}
              onComplete={() => {
                setFormDialogOpen(false)
                fetchBriefing()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
