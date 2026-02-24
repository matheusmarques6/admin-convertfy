"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Loader2, User, Building2, Mail, Link2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/hooks/use-toast"

interface Client {
  id: string
  name: string
  email: string | null
  company: string | null
}

interface StoreLinkModalProps {
  storeId: string
  storeName: string
  orgId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function StoreLinkModal({
  storeId,
  storeName,
  orgId,
  isOpen,
  onClose,
  onSuccess,
}: StoreLinkModalProps) {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isLinking, setIsLinking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("")
      setClients([])
      setSelectedClient(null)
      setIsSearching(false)
      setIsLinking(false)
    }
  }, [isOpen])

  // Debounced search
  const searchClients = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setClients([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/clients/search?q=${encodeURIComponent(query)}&org_id=${encodeURIComponent(orgId)}`
        )
        const data = await res.json()
        if (data.clients) {
          setClients(data.clients)
        }
      } catch (error) {
        console.error("Error searching clients:", error)
      } finally {
        setIsSearching(false)
      }
    },
    [orgId]
  )

  // Handle search input change with debounce
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      setSelectedClient(null)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        searchClients(value)
      }, 300)
    },
    [searchClients]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Handle link confirmation
  const handleLink = async () => {
    if (!selectedClient) return

    setIsLinking(true)
    try {
      const res = await fetch(`/api/client-stores/${storeId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selectedClient.id }),
      })

      const data = await res.json()

      if (res.ok) {
        toast({
          title: "Loja vinculada!",
          description: `"${storeName}" foi vinculada a "${selectedClient.name}"`,
        })
        onSuccess()
        onClose()
      } else {
        toast({
          title: "Erro ao vincular",
          description: data.error || "Não foi possível vincular a loja",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error linking store:", error)
      toast({
        title: "Erro de conexão",
        description: "Não foi possível vincular a loja",
        variant: "destructive",
      })
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Vincular Loja a Cliente
          </DialogTitle>
          <DialogDescription>
            Busque e selecione o cliente para vincular a loja{" "}
            <strong>{storeName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente por nome, email ou empresa..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Results list */}
          <div className="border rounded-lg max-h-[280px] overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Buscando clientes...
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <User className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery.length < 2
                    ? "Digite ao menos 2 caracteres para buscar"
                    : "Nenhum cliente encontrado"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {clients.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 ${
                        selectedClient?.id === client.id
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">
                            {client.name}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {client.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                {client.email}
                              </span>
                            )}
                            {client.company && (
                              <span className="flex items-center gap-1 truncate">
                                <Building2 className="w-3 h-3 flex-shrink-0" />
                                {client.company}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Selected client preview */}
          {selectedClient && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-xs text-muted-foreground mb-1">Cliente selecionado:</p>
              <p className="font-medium text-sm">{selectedClient.name}</p>
              {selectedClient.company && (
                <p className="text-xs text-muted-foreground">{selectedClient.company}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedClient || isLinking}
          >
            {isLinking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Vinculando...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 mr-2" />
                Confirmar Vinculo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
