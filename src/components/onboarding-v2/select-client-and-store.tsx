"use client"

/**
 * Componente CRITICO (Regra 1+2 do prompt):
 * - Reusa clients existentes (combobox com busca)
 * - Reusa stores do cliente selecionado
 * - Permite criar nova loja se nao existir
 * - NUNCA cria novo cliente daqui (link pra /admin/clients/new)
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Search, Check, ChevronDown, Plus, ExternalLink, X, Loader2 } from "lucide-react"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Client {
  id: string
  name: string
  company: string | null
  email: string | null
}

interface Store {
  id: string
  client_id: string
  store_name: string
  store_url: string | null
  platform: string | null
}

interface Props {
  selectedClientId: string | null
  selectedStoreId: string | null
  onClientChange: (id: string | null) => void
  onStoreChange: (id: string | null) => void
}

export function SelectClientAndStore({
  selectedClientId,
  selectedStoreId,
  onClientChange,
  onStoreChange,
}: Props) {
  const { data, mutate } = useSWR<{
    clients?: Client[]
    stores?: Store[]
  }>("/api/onboardings/lookups", fetcher)
  const clients = useMemo(() => data?.clients ?? [], [data?.clients])
  const stores = useMemo(() => data?.stores ?? [], [data?.stores])

  const [clientSearch, setClientSearch] = useState("")
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [creatingStore, setCreatingStore] = useState(false)
  const [newStoreName, setNewStoreName] = useState("")
  const [newStoreUrl, setNewStoreUrl] = useState("")
  const [newStorePlatform, setNewStorePlatform] = useState("other")
  const [submittingStore, setSubmittingStore] = useState(false)

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  )

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients
    const s = clientSearch.toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.company ?? "").toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s),
    )
  }, [clients, clientSearch])

  const clientStores = useMemo(
    () =>
      selectedClientId
        ? stores.filter((s) => s.client_id === selectedClientId)
        : [],
    [stores, selectedClientId],
  )

  // Reseta store se o cliente muda
  useEffect(() => {
    if (
      selectedStoreId &&
      !clientStores.some((s) => s.id === selectedStoreId)
    ) {
      onStoreChange(null)
    }
  }, [selectedClientId, selectedStoreId, clientStores, onStoreChange])

  async function createStore() {
    if (!selectedClientId || !newStoreName.trim()) return
    setSubmittingStore(true)
    try {
      const res = await fetch("/api/client-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClientId,
          store_name: newStoreName.trim(),
          store_url: newStoreUrl.trim() || null,
          platform: newStorePlatform,
        }),
      })
      if (res.ok) {
        const j = await res.json()
        const newId = j.store?.id ?? j.data?.store?.id ?? j.id
        await mutate()
        if (newId) onStoreChange(newId)
        setCreatingStore(false)
        setNewStoreName("")
        setNewStoreUrl("")
      }
    } finally {
      setSubmittingStore(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cliente */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
          Cliente <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setClientPickerOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] text-left"
          >
            <span
              className={
                selectedClient
                  ? "text-slate-900 dark:text-white truncate"
                  : "text-slate-400 dark:text-white/40"
              }
            >
              {selectedClient
                ? `${selectedClient.name}${selectedClient.company ? ` · ${selectedClient.company}` : ""}`
                : "Selecionar cliente existente..."}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </button>
          {clientPickerOpen && (
            <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#0F1117] shadow-lg max-h-[300px] flex flex-col">
              <div className="relative p-2 border-b border-slate-100 dark:border-white/[0.06]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full h-8 pl-8 pr-2 text-[12px] rounded-[6px] bg-slate-50 dark:bg-white/[0.04] border-0 focus:outline-none"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <p className="text-[12px] text-slate-500 text-center py-4">
                    Nenhum cliente encontrado.
                  </p>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onClientChange(c.id)
                        setClientPickerOpen(false)
                        setClientSearch("")
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.04] text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                          {c.name}
                        </p>
                        {c.company && (
                          <p className="text-[11px] text-slate-500 dark:text-white/55 truncate">
                            {c.company}
                          </p>
                        )}
                      </div>
                      {c.id === selectedClientId && (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-slate-100 dark:border-white/[0.06] p-1.5">
                <Link
                  href="/admin/clients/new"
                  target="_blank"
                  className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-[4px]"
                >
                  <Plus className="h-3 w-3" />
                  Criar novo cliente
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loja */}
      {selectedClientId && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Loja <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setCreatingStore((v) => !v)}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              {creatingStore ? "Cancelar" : "+ Nova loja"}
            </button>
          </div>

          {!creatingStore ? (
            clientStores.length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-white/55 italic">
                Esse cliente não tem nenhuma loja. Clique em &quot;+ Nova
                loja&quot; pra cadastrar.
              </p>
            ) : (
              <div className="space-y-1">
                {clientStores.map((s) => {
                  const sel = s.id === selectedStoreId
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onStoreChange(s.id)}
                      className={
                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] border " +
                        (sel
                          ? "bg-orange-50 dark:bg-orange-500/10 border-orange-300 dark:border-orange-500/40"
                          : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                      }
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                          {s.store_name}
                        </p>
                        {s.store_url && (
                          <p className="text-[11px] text-slate-500 dark:text-white/55 truncate">
                            {s.store_url}
                            {s.platform && ` · ${s.platform}`}
                          </p>
                        )}
                      </div>
                      {sel && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <div className="space-y-2 rounded-[6px] border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-3">
              <input
                autoFocus
                type="text"
                placeholder="Nome da loja"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                className="w-full h-8 px-2 text-[12px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              />
              <input
                type="url"
                placeholder="URL da loja (https://...)"
                value={newStoreUrl}
                onChange={(e) => setNewStoreUrl(e.target.value)}
                className="w-full h-8 px-2 text-[12px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              />
              <select
                value={newStorePlatform}
                onChange={(e) => setNewStorePlatform(e.target.value)}
                className="w-full h-8 px-2 text-[12px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="vtex">VTEX</option>
                <option value="nuvemshop">Nuvemshop</option>
                <option value="custom">Custom</option>
                <option value="other">Outro</option>
              </select>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setCreatingStore(false)}
                  disabled={submittingStore}
                  className="h-7 px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded-[5px]"
                >
                  <X className="h-3 w-3 inline mr-1" />
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createStore}
                  disabled={submittingStore || !newStoreName.trim()}
                  className="inline-flex items-center gap-1.5 h-7 px-3 text-[11px] font-semibold rounded-[5px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingStore && <Loader2 className="h-3 w-3 animate-spin" />}
                  Criar loja
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
