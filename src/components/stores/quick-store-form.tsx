"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Store, Search, User, X } from "lucide-react"
import { storeQuickCreateSchema } from "@/lib/schemas/store.schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"

type QuickStoreFormData = z.infer<typeof storeQuickCreateSchema>

interface ClientOption {
  id: string
  name: string
  email: string | null
  company: string | null
}

interface QuickStoreFormProps {
  onSuccess: () => void
  onCancel: () => void
  defaultClientId?: string
}

export function QuickStoreForm({ onSuccess, onCancel, defaultClientId }: QuickStoreFormProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Client search state
  const [clientSearch, setClientSearch] = useState("")
  const [clientResults, setClientResults] = useState<ClientOption[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<QuickStoreFormData>({
    resolver: zodResolver(storeQuickCreateSchema),
    defaultValues: {
      store_name: "",
      platform: "shopify",
      store_url: "",
      client_id: null,
    },
  })

  const platformValue = watch("platform")

  // Auto-select client when defaultClientId is provided
  useEffect(() => {
    if (!defaultClientId) return

    async function fetchDefaultClient() {
      try {
        const res = await fetch(`/api/clients/search?q=&id=${encodeURIComponent(defaultClientId!)}`)
        const data = await res.json()
        if (data.clients && data.clients.length > 0) {
          const client = data.clients[0]
          setSelectedClient(client)
          setValue("client_id", client.id)
        }
      } catch {
        // Silently fail — user can still search manually
      }
    }

    fetchDefaultClient()
  }, [defaultClientId, setValue])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Debounced client search
  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setClientResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.clients) {
        setClientResults(data.clients)
      }
    } catch {
      // Silently fail
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleClientSearchChange = useCallback((value: string) => {
    setClientSearch(value)
    setShowResults(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchClients(value), 300)
  }, [searchClients])

  const handleSelectClient = (client: ClientOption) => {
    setSelectedClient(client)
    setClientSearch("")
    setShowResults(false)
    setClientResults([])
    setValue("client_id", client.id)
  }

  const handleClearClient = () => {
    setSelectedClient(null)
    setValue("client_id", null)
  }

  async function onSubmit(data: QuickStoreFormData) {
    setIsSubmitting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        store_name: data.store_name,
        platform: data.platform,
        store_url: data.store_url,
      }
      if (data.client_id) {
        payload.client_id = data.client_id
      }

      const response = await fetch("/api/client-stores/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar loja")
      }

      toast({
        title: "Loja cadastrada!",
        description: `A loja "${data.store_name}" foi criada com sucesso.`,
      })

      onSuccess()
    } catch (error) {
      console.error("Error creating store:", error)
      toast({
        title: "Erro ao cadastrar loja",
        description: error instanceof Error ? error.message : "Não foi possível criar a loja",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          Cadastro Rápido de Loja
        </DialogTitle>
        <DialogDescription>
          Cadastre uma nova loja. Vincule a um cliente para que ela apareça no portal.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Client (optional) */}
        <div className="space-y-2">
          <Label>Vincular a Cliente</Label>
          {selectedClient ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <User className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedClient.name}</p>
                {selectedClient.company && (
                  <p className="text-xs text-muted-foreground truncate">{selectedClient.company}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleClearClient}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente por nome..."
                value={clientSearch}
                onChange={(e) => handleClientSearchChange(e.target.value)}
                onFocus={() => clientSearch.length >= 2 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                className="pl-9"
              />
              {/* Search Results Dropdown */}
              {showResults && (clientSearch.length >= 2) && (
                <div className="absolute z-50 w-full mt-1 max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span className="text-sm">Buscando...</span>
                    </div>
                  ) : clientResults.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum cliente encontrado
                    </div>
                  ) : (
                    clientResults.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectClient(client)}
                        className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <p className="text-sm font-medium">{client.name}</p>
                        {client.company && (
                          <p className="text-xs text-muted-foreground">{client.company}</p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Vincular a um cliente permite que ele veja a loja no portal
          </p>
        </div>

        {/* Store Name */}
        <div className="space-y-2">
          <Label htmlFor="store_name">Nome da Loja *</Label>
          <Input
            id="store_name"
            placeholder="Ex: Minha Loja"
            {...register("store_name")}
          />
          {errors.store_name && (
            <p className="text-sm text-destructive">{errors.store_name.message}</p>
          )}
        </div>

        {/* Platform */}
        <div className="space-y-2">
          <Label htmlFor="platform">Plataforma *</Label>
          <Select
            value={platformValue}
            onValueChange={(value) =>
              setValue("platform", value as QuickStoreFormData["platform"], { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
              <SelectItem value="woocommerce">WooCommerce</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
          {errors.platform && (
            <p className="text-sm text-destructive">{errors.platform.message}</p>
          )}
        </div>

        {/* Store URL */}
        <div className="space-y-2">
          <Label htmlFor="store_url">URL da Loja *</Label>
          <Input
            id="store_url"
            placeholder="https://minhaloja.com.br"
            {...register("store_url")}
          />
          {errors.store_url && (
            <p className="text-sm text-destructive">{errors.store_url.message}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Cadastrando...
            </>
          ) : (
            "Cadastrar Loja"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
