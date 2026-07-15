"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { mutate } from "swr"
import { RotateCcw, Loader2 } from "lucide-react"
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

interface StoreForceResyncActionProps {
  storeId: string
  storeName: string
}

/** Botao "Limpar cache" — limpa caches L1+L2 da loja (omnisend_reports_cache,
 *  omnisend_*_metrics, store_revenue_summary) e dispara sync imediato pra
 *  repopular tudo com calculo atual. Util quando os valores no overview ou
 *  no detalhe estao com discrepancia (cache stale ou linha gravada com
 *  calculo bugado). */
export function StoreForceResyncAction({ storeId, storeName }: StoreForceResyncActionProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isResyncing, setIsResyncing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleResync = async () => {
    setIsResyncing(true)
    try {
      const res = await fetch(`/api/client-stores/${storeId}/force-resync`, {
        method: "POST",
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "Cache limpo e sync executado",
          description: `${data.sync?.campaigns ?? 0} campanhas, ${data.sync?.automations ?? 0} flows. Receita atribuida: ${data.sync?.attributedRevenue?.toLocaleString('pt-BR', { style: 'currency', currency: data.sync?.currency || 'BRL' }) ?? "-"}`,
        })
        setIsOpen(false)
        // Refresh server components
        router.refresh()
        // Forca o SWR a re-buscar TODAS as chaves dessa loja (report,
        // campaigns, flows, etc.) sem precisar de F5. Sem isso, os cards
        // client-side (revalidateOnFocus:false) continuavam mostrando o dado
        // velho ate um reload manual.
        mutate(
          (key) => typeof key === "string" && key.includes(storeId),
          undefined,
          { revalidate: true },
        )
      } else {
        toast({
          title: "Erro ao limpar cache",
          description: data.error || "Nao foi possivel limpar o cache",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error force-resyncing store:", error)
      toast({
        title: "Erro de conexao",
        description: "Nao foi possivel limpar o cache",
        variant: "destructive",
      })
    } finally {
      setIsResyncing(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Icon icon={RotateCcw} size={16} className="mr-1" />
          Limpar cache
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Limpar cache da loja</AlertDialogTitle>
          <AlertDialogDescription>
            Isso vai apagar todo o cache de relatorios da loja <strong>&quot;{storeName}&quot;</strong>{" "}
            (campanhas, flows, summary de revenue) e disparar um sync imediato com a Omnisend
            pra repopular com os valores atuais. Util quando os numeros estao divergentes
            entre overview e detalhe. Pode demorar 30-60s.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResyncing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleResync() }}
            disabled={isResyncing}
          >
            {isResyncing ? (
              <>
                <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
                Limpando e sincronizando...
              </>
            ) : (
              <>
                <Icon icon={RotateCcw} size={16} className="mr-2" />
                Limpar e sincronizar
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
