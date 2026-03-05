"use client"

import { useState, useMemo, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StoreSelector, type StoreItem } from "@/components/campaigns/store-selector"
import { toast } from "@/lib/hooks/use-toast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddStoresModalProps {
  generationId: string
  existingStoreIds: string[]
  allStores: StoreItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddStoresModal({
  generationId,
  existingStoreIds,
  allStores,
  open,
  onOpenChange,
  onSuccess,
}: AddStoresModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter out stores already in the campaign
  const availableStores = useMemo(() => {
    const existingSet = new Set(existingStoreIds)
    return allStores.filter((s) => !existingSet.has(s.id))
  }, [allStores, existingStoreIds])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSelectedIds([])
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  const handleConfirm = useCallback(async () => {
    if (selectedIds.length === 0) return

    setIsSubmitting(true)

    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generation_id: generationId,
          store_ids: selectedIds,
          // name and date are required by the request schema even on
          // the regeneration flow (generation_id present). The backend
          // uses the existing generation data, but validation still runs.
          name: "add-stores",
          date: new Date().toISOString().slice(0, 10),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(
          errorData?.error?.message || "Erro ao adicionar lojas",
        )
      }

      toast({
        title: "Lojas adicionadas",
        description: "A geracao de copies para as novas lojas foi iniciada.",
      })

      setSelectedIds([])
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao adicionar lojas",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [generationId, selectedIds, onOpenChange, onSuccess])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar lojas</DialogTitle>
          <DialogDescription>
            Selecione lojas adicionais para gerar copies nesta campanha.
          </DialogDescription>
        </DialogHeader>

        {availableStores.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todas as lojas ja estao incluidas nesta campanha.
          </p>
        ) : (
          <StoreSelector
            stores={availableStores}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              `Adicionar ${selectedIds.length > 0 ? `(${selectedIds.length})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
