"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreDeleteActionProps {
  storeId: string
  storeName: string
}

export function StoreDeleteAction({ storeId, storeName }: StoreDeleteActionProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/client-stores/${storeId}`, {
        method: "DELETE",
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "Loja excluída!",
          description: `"${storeName}" foi removida com sucesso`,
        })
        router.push("/admin/stores")
      } else {
        toast({
          title: "Erro ao excluir",
          description: data.error || "Não foi possível excluir a loja",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting store:", error)
      toast({
        title: "Erro de conexão",
        description: "Não foi possível excluir a loja",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
        >
          <Icon icon={Trash2} size={16} className="mr-1" />
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir loja</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a loja <strong>&quot;{storeName}&quot;</strong>?
            Esta ação é irreversível e removerá todos os dados associados, incluindo alertas, briefings, dados de onboarding e acessos configurados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete() }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Icon icon={Trash2} size={16} className="mr-2" />
                Excluir
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
