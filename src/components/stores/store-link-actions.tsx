"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Link2, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StoreLinkModal } from "@/components/stores/store-link-modal"
import { StoreUnlinkDialog } from "@/components/stores/store-unlink-dialog"

interface StoreLinkActionsProps {
  storeId: string
  storeName: string
  orgId: string
  clientId: string | null
  clientName: string | null
}

export function StoreLinkActions({
  storeId,
  storeName,
  orgId,
  clientId,
  clientName,
}: StoreLinkActionsProps) {
  const router = useRouter()
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false)

  const handleSuccess = () => {
    router.refresh()
  }

  if (!clientId) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsLinkModalOpen(true)}
        >
          <Link2 className="w-4 h-4 mr-1" />
          Vincular
        </Button>

        <StoreLinkModal
          storeId={storeId}
          storeName={storeName}
          orgId={orgId}
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          onSuccess={handleSuccess}
        />
      </>
    )
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsUnlinkDialogOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Unlink className="w-4 h-4 mr-1" />
        Desvincular
      </Button>

      <StoreUnlinkDialog
        storeId={storeId}
        storeName={storeName}
        clientName={clientName || ""}
        isOpen={isUnlinkDialogOpen}
        onClose={() => setIsUnlinkDialogOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  )
}
