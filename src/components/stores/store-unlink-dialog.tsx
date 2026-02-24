"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreUnlinkDialogProps {
  storeId: string
  storeName: string
  clientName: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function StoreUnlinkDialog({
  storeId,
  storeName,
  clientName,
  isOpen,
  onClose,
  onSuccess,
}: StoreUnlinkDialogProps) {
  const { toast } = useToast()
  const [isUnlinking, setIsUnlinking] = useState(false)

  const handleUnlink = async () => {
    setIsUnlinking(true)
    try {
      const res = await fetch(`/api/client-stores/${storeId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: null }),
      })

      const data = await res.json()

      if (res.ok) {
        toast({
          title: "Loja desvinculada!",
          description: `"${storeName}" foi desvinculada de "${clientName}"`,
        })
        onSuccess()
        onClose()
      } else {
        toast({
          title: "Erro ao desvincular",
          description: data.error || "Não foi possível desvincular a loja",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error unlinking store:", error)
      toast({
        title: "Erro de conexão",
        description: "Não foi possível desvincular a loja",
        variant: "destructive",
      })
    } finally {
      setIsUnlinking(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desvincular Loja</AlertDialogTitle>
          <AlertDialogDescription>
            A loja <strong>{storeName}</strong> será desvinculada de{" "}
            <strong>{clientName}</strong>. Campanhas e integrações continuarão
            funcionando.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUnlinking}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleUnlink}
            disabled={isUnlinking}
          >
            {isUnlinking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Desvinculando...
              </>
            ) : (
              "Desvincular"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
