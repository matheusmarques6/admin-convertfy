"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/lib/hooks/use-toast"

interface AutomationDeleteButtonProps {
  automationId: string
  automationName: string
}

export function AutomationDeleteButton({ automationId, automationName }: AutomationDeleteButtonProps) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/automations/manage?id=${automationId}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir automação")
      }

      toast({
        title: "Automação excluída",
        description: "A automação foi excluída com sucesso.",
      })

      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir a automação.",
      })
    } finally {
      setIsDeleting(false)
      setShowDialog(false)
    }
  }

  return (
    <>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={(e) => {
          e.preventDefault()
          setShowDialog(true)
        }}
      >
        <Icon icon={Trash2} size={16} className="mr-2" />
        Excluir
      </DropdownMenuItem>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir automação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a automação &quot;{automationName}&quot;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
