"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { StoreLinkModal } from "@/components/stores/store-link-modal"

interface StoreUnlinkedBannerProps {
  storeId: string
  storeName: string
  orgId: string
}

export function StoreUnlinkedBanner({ storeId, storeName, orgId }: StoreUnlinkedBannerProps) {
  const router = useRouter()
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)

  return (
    <>
      <Alert variant="warning" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Loja sem cliente vinculado</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <span>
            Esta loja nao esta vinculada a nenhum cliente. Vincular permite melhor organizacao e relatorios.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-2 border-yellow-500/50 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
            onClick={() => setIsLinkModalOpen(true)}
          >
            Vincular agora
          </Button>
        </AlertDescription>
      </Alert>

      <StoreLinkModal
        storeId={storeId}
        storeName={storeName}
        orgId={orgId}
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSuccess={() => {
          setIsLinkModalOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}
