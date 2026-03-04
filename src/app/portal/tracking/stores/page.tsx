"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Store,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"

interface TrackingStore {
  id: string
  shop_domain: string
  shop_name: string | null
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

function formatDate(d: string | null) {
  if (!d) return "Nunca"
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function PortalTrackingStoresPage() {
  const [stores, setStores] = useState<TrackingStore[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ shop_domain: "", access_token: "", shop_name: "" })
  const [submitting, setSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const fetchStores = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/tracking/stores")
      if (!response.ok) throw new Error("Erro")
      const result = await response.json()
      setStores(result.stores || [])
    } catch (err) {
      console.error("Error fetching stores:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  const handleAdd = async () => {
    if (!addForm.shop_domain || !addForm.access_token) {
      setAddError("Preencha todos os campos obrigatórios")
      return
    }
    setSubmitting(true)
    setAddError(null)

    try {
      const response = await fetch("/api/portal/tracking/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao conectar loja")
      }

      setShowAddDialog(false)
      setAddForm({ shop_domain: "", access_token: "", shop_name: "" })
      fetchStores()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisconnect = async (storeId: string) => {
    if (!confirm("Tem certeza? Seus dados de rastreio serão preservados.")) return

    try {
      await fetch(`/api/portal/tracking/stores?id=${storeId}`, { method: "DELETE" })
      fetchStores()
    } catch (err) {
      console.error("Error disconnecting store:", err)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 bg-white dark:bg-[#151922] rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Lojas Conectadas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie as lojas Shopify conectadas ao rastreamento
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-primary hover:bg-primary/85 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          Conectar Nova Loja
        </Button>
      </div>

      <AnimatedContainer className="space-y-4">
        {/* Info Card */}
        <AnimatedItem>
          <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 flex gap-3">
            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Seus dados ficam salvos aqui</p>
              <p className="text-sm text-blue-600 dark:text-blue-400/80 mt-0.5">
                Se trocar de loja Shopify, conecte a nova e os rastreios continuam disponíveis. Os dados são persistidos na nossa base, independente da loja.
              </p>
            </div>
          </div>
        </AnimatedItem>

        {/* Stores List */}
        {stores.length === 0 ? (
          <AnimatedItem>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Store className="h-7 w-7 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">Nenhuma loja conectada</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Conecte sua loja Shopify para começar a rastrear pedidos
              </p>
              <Button onClick={() => setShowAddDialog(true)} className="bg-primary hover:bg-primary/85 text-white gap-2">
                <Plus className="h-4 w-4" />
                Conectar Loja
              </Button>
            </div>
          </AnimatedItem>
        ) : (
          stores.map((store) => (
            <AnimatedItem key={store.id}>
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      <Store className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                          {store.shop_name || store.shop_domain}
                        </h3>
                        {store.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                            <XCircle className="h-3 w-3" />
                            Inativa
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{store.shop_domain}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Última sincronização: {formatDate(store.last_sync_at)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                    onClick={() => handleDisconnect(store.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </AnimatedItem>
          ))
        )}
      </AnimatedContainer>

      {/* Add Store Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Nova Loja</DialogTitle>
            <DialogDescription>
              Insira o domínio da sua loja Shopify e o Access Token para começar a receber os pedidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da loja (opcional)</Label>
              <Input
                placeholder="Minha Loja"
                value={addForm.shop_name}
                onChange={(e) => setAddForm({ ...addForm, shop_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Domínio da loja *</Label>
              <Input
                placeholder="minha-loja.myshopify.com"
                value={addForm.shop_domain}
                onChange={(e) => setAddForm({ ...addForm, shop_domain: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Access Token *</Label>
              <Input
                type="password"
                placeholder="shpat_..."
                value={addForm.access_token}
                onChange={(e) => setAddForm({ ...addForm, access_token: e.target.value })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gere um token em Shopify Admin → Settings → Apps → Develop apps
              </p>
            </div>

            {addError && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {addError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={submitting}
              className="bg-primary hover:bg-primary/85 text-white"
            >
              {submitting ? "Conectando..." : "Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
