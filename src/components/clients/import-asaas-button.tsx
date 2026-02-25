"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"

interface ImportStats {
  connected: boolean
  lastSync?: string
  asaasCustomers: number
  localClients: number
  syncedClients: number
}

export function ImportAsaasButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  // Fetch stats on mount to show pending badge
  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const response = await fetch("/api/integrations/asaas/customers")
        const data = await response.json()
        if (data?.connected && data.asaasCustomers > data.syncedClients) {
          setPendingCount(data.asaasCustomers - data.syncedClients)
        }
      } catch {
        // Silently ignore - badge just won't show
      }
    }
    fetchPendingCount()
    const interval = setInterval(fetchPendingCount, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (open) {
      loadStats()
    }
  }, [open])

  async function loadStats() {
    setIsLoading(true)
    try {
      const response = await fetch("/api/integrations/asaas/customers")
      const data = await response.json()
      setStats(data)
      if (data?.connected && data.asaasCustomers > data.syncedClients) {
        setPendingCount(data.asaasCustomers - data.syncedClients)
      } else {
        setPendingCount(0)
      }
    } catch (error) {
      console.error("Error loading stats:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleImport() {
    setIsImporting(true)
    try {
      const response = await fetch("/api/integrations/asaas/customers", {
        method: "POST",
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: "Importação concluída!",
          description: `${result.stats.imported} novos clientes importados, ${result.stats.updated} atualizados.`,
        })
        setPendingCount(0)
        setOpen(false)
        // Revalidate server components to refresh client list
        router.refresh()
      } else {
        toast({
          variant: "destructive",
          title: "Erro na importação",
          description: result.error,
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="relative">
          <Download className="mr-2 h-4 w-4" />
          Importar do Asaas
          {pendingCount > 0 && (
            <span className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center px-1">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Importar Clientes do Asaas
          </DialogTitle>
          <DialogDescription>
            Importe todos os clientes cadastrados no Asaas para o sistema.
            Clientes existentes serão atualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {!stats.connected ? (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
                  <p className="text-sm text-warning">
                    A integração com o Asaas não está ativa. Configure a integração
                    em Configurações → Integrações primeiro.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-2xl font-bold">{stats.asaasCustomers}</p>
                      <p className="text-sm text-muted-foreground">
                        Clientes no Asaas
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-2xl font-bold">{stats.localClients}</p>
                      <p className="text-sm text-muted-foreground">
                        Clientes locais
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Clientes sincronizados</p>
                        <p className="text-sm text-muted-foreground">
                          {stats.syncedClients} de {stats.asaasCustomers} clientes
                        </p>
                      </div>
                      <div className="text-2xl font-bold text-success">
                        {stats.asaasCustomers > 0
                          ? Math.round((stats.syncedClients / stats.asaasCustomers) * 100)
                          : 0}%
                      </div>
                    </div>
                    {stats.lastSync && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Última sincronização:{" "}
                        {new Date(stats.lastSync).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>

                  {stats.asaasCustomers > stats.syncedClients && (
                    <div className="rounded-lg border border-primary/50 bg-primary/10 p-4">
                      <p className="text-sm text-primary">
                        Existem {stats.asaasCustomers - stats.syncedClients} clientes
                        no Asaas que ainda não foram importados.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Erro ao carregar informações
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={loadStats}
            disabled={isLoading || isImporting}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!stats?.connected || isImporting || isLoading}
          >
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isImporting ? "Importando..." : "Importar Todos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
