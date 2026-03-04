"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Copy, Link as LinkIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StoreOnboardingForm } from "@/components/onboarding/store-onboarding-form"
import { toast } from "@/lib/hooks/use-toast"

interface StoreFormTabProps {
  storeId: string
  clientId: string | null
}

export function StoreFormTab({ storeId, clientId }: StoreFormTabProps) {
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/onboarding/store-data?store_id=${storeId}`)
      const data = await res.json()
      setInitialData(data)
    } catch {
      setInitialData(null)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Link compartilhável */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Link de acesso do cliente</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/public/onboarding`}
              className="text-xs bg-muted/50"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = `${window.location.origin}/public/onboarding`
                navigator.clipboard.writeText(link)
                toast({ title: "Link copiado!", description: "O link do portal foi copiado para a área de transferência." })
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            O cliente acessa este link para preencher o formulário de onboarding. Você pode editar todos os campos abaixo.
          </p>
        </CardContent>
      </Card>

      {/* Formulário editável */}
      <StoreOnboardingForm
        storeId={storeId}
        clientId={clientId || ''}
        initialData={initialData as Record<string, unknown> | undefined}
        onComplete={fetchData}
      />
    </div>
  )
}
