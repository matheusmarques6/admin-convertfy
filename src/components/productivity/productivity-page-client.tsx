"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ProductivityHome } from "@/components/productivity/productivity-home"
import { DailyPlanning } from "@/components/productivity/daily-planning"
import { useProductivityStore } from "@/stores/productivity-store"

/**
 * Recebe o payload de /api/productivity pré-carregado pelo RSC e hidrata o
 * store zustand num useLayoutEffect — nunca durante render (o store é
 * singleton de módulo: mutar durante SSR vazaria dados entre requests) e
 * antes do paint/efeitos passivos, então o fetchData do mount do
 * ProductivityHome (que lê getState().isLoaded) não dispara e os dados
 * aparecem já no primeiro paint. initialData null → não hidrata →
 * comportamento antigo intacto. Hidrata no máximo uma vez por mount e só
 * se o store ainda não tem dados (nunca sobrescreve estado existente de
 * navegações anteriores).
 */
export function ProductivityPageClient({ initialData }: { initialData: unknown }) {
  const hydratedRef = useRef(false)

  useLayoutEffect(() => {
    if (hydratedRef.current || !initialData) return
    hydratedRef.current = true
    const store = useProductivityStore.getState()
    if (!store.isLoaded && !store.isLoading) {
      store.hydrate(initialData)
    }
  }, [initialData])

  const [planningOpen, setPlanningOpen] = useState(false)

  return (
    <>
      <ProductivityHome />
      <DailyPlanning open={planningOpen} onClose={() => setPlanningOpen(false)} />
    </>
  )
}
