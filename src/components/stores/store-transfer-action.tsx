"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"

interface ClientResult {
  id: string
  name: string
  email: string
  company: string | null
}

interface StoreTransferActionProps {
  storeId: string
  storeName: string
  currentClientId: string | null
  currentClientName?: string
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

export function StoreTransferAction({
  storeId,
  storeName,
  currentClientId,
  currentClientName,
  onOpenChange,
  open: controlledOpen,
}: StoreTransferActionProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ClientResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [reason, setReason] = useState("")
  const abortControllerRef = useRef<AbortController | null>(null)

  const dialogOpen = controlledOpen ?? isOpen
  const setDialogOpen = onOpenChange ?? setIsOpen

  // Prevent closing dialog while transfer is in progress
  const handleOpenChange = (open: boolean) => {
    if (!open && isTransferring) return
    setDialogOpen(open)
  }

  // Reset state when dialog closes
  useEffect(() => {
    if (!dialogOpen) {
      setSearchQuery("")
      setSearchResults([])
      setSelectedClient(null)
      setReason("")
      setIsTransferring(false)
      // Cancel any in-flight search
      abortControllerRef.current?.abort()
    }
  }, [dialogOpen])

  // Debounced client search with AbortController
  const searchClients = useCallback(async (query: string, signal: AbortSignal) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(
        `/api/clients/search?q=${encodeURIComponent(query)}`,
        { signal }
      )
      const data = await res.json()
      if (data.success && data.data?.clients) {
        const filtered = data.data.clients.filter(
          (c: ClientResult) => c.id !== currentClientId
        )
        setSearchResults(filtered)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.warn("Client search failed:", error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [currentClientId])

  // Search on query change with debounce + cancellation
  useEffect(() => {
    if (!dialogOpen) return
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const timer = setTimeout(() => {
      searchClients(searchQuery, controller.signal)
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery, searchClients, dialogOpen])

  const handleTransfer = async () => {
    if (!selectedClient || isTransferring) return

    setIsTransferring(true)
    try {
      const res = await fetch(`/api/client-stores/${storeId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetClientId: selectedClient.id,
          reason: reason || undefined,
        }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "Loja transferida!",
          description: `"${storeName}" foi transferida para "${selectedClient.name}" com sucesso`,
        })
        setIsTransferring(false)
        setDialogOpen(false)
        router.refresh()
      } else {
        toast({
          title: "Erro ao transferir",
          description: data.error || "Não foi possível transferir a loja",
          variant: "destructive",
        })
        setIsTransferring(false)
      }
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível transferir a loja",
        variant: "destructive",
      })
      setIsTransferring(false)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (isTransferring) e.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>Transferir Loja</DialogTitle>
          <DialogDescription>
            Transferir <strong>&quot;{storeName}&quot;</strong>
            {currentClientName && (
              <> de <strong>{currentClientName}</strong></>
            )} para outro cliente da mesma organização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Client Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente destino</label>
            {selectedClient ? (
              <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.email}</p>
                  {selectedClient.company && (
                    <p className="text-xs text-muted-foreground">{selectedClient.company}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedClient(null)
                    setSearchQuery("")
                  }}
                >
                  Alterar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente por nome, email ou empresa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                    {searchResults.map((client) => (
                      <button
                        key={client.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedClient(client)}
                      >
                        <p className="font-medium text-sm">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.email}
                          {client.company && ` · ${client.company}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhum cliente encontrado
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Motivo <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Textarea
              placeholder="Ex: Cliente mudou de operação, reorganização interna..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>

          {/* Warning */}
          {selectedClient && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>Atenção:</strong> Campanhas, alertas, relatórios, feedback e dados de onboarding
              desta loja serão transferidos para o cliente destino. Dados de receita, métricas
              Klaviyo e dados financeiros (contratos, faturas) permanecem com o cliente original.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            disabled={isTransferring}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedClient || isTransferring}
          >
            {isTransferring ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Transferir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
