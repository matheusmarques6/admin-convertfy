"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Store, Check, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"
import {
  generateRequestSchema,
  type GenerateRequest,
} from "@/lib/schemas/campaign-generation"
import { CampaignHistoryList } from "@/components/campaigns/campaign-history-list"
import { createClient } from "@/lib/supabase/client"
import type { StoreItem } from "@/components/campaigns/store-selector"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const formSchema = generateRequestSchema.omit({
  store_ids: true,
  generation_id: true,
})

type FormValues = {
  name: string
  date: string
  reference_doc_url?: string | null
}

interface PortalStore {
  id: string
  store_name: string
  platform: string
  country: string
  language: string
  client_name: string
  client_id: string | null
}

const COUNTRY_LABELS: Record<string, string> = {
  BR: "Brasil",
  US: "Estados Unidos",
  GB: "Reino Unido",
  PT: "Portugal",
  ES: "Espanha",
  OTHER: "Outro",
}

const LANGUAGE_LABELS: Record<string, string> = {
  "pt-BR": "Portugues (BR)",
  "en-US": "English (US)",
  "en": "English",
  "es-ES": "Espanol (ES)",
  "es": "Espanol",
}

interface CampaignGeneration {
  id: string
  name: string
  date: string
  status: "draft" | "processing" | "done"
  drive_folder_url: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Inline StoreSelector (simple version for the form)
// ---------------------------------------------------------------------------

const STORES_PER_PAGE = 6

function InlineStoreSelector({
  stores,
  selected,
  onChange,
}: {
  stores: PortalStore[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState("")
  const [countryFilter, setCountryFilter] = useState<string>("all")
  const [languageFilter, setLanguageFilter] = useState<string>("all")
  const [page, setPage] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const countries = useMemo(
    () => [...new Set(stores.map((s) => s.country))].sort(),
    [stores],
  )

  const languages = useMemo(
    () => [...new Set(stores.map((s) => s.language))].sort(),
    [stores],
  )

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      const matchesSearch = s.store_name.toLowerCase().includes(search.toLowerCase())
      const matchesCountry = countryFilter === "all" || s.country === countryFilter
      const matchesLanguage = languageFilter === "all" || s.language === languageFilter
      return matchesSearch && matchesCountry && matchesLanguage
    })
  }, [stores, search, countryFilter, languageFilter])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [search, countryFilter, languageFilter])

  const totalPages = Math.ceil(filteredStores.length / STORES_PER_PAGE)
  const pagedStores = filteredStores.slice(page * STORES_PER_PAGE, (page + 1) * STORES_PER_PAGE)

  const filteredIds = useMemo(() => new Set(filteredStores.map((s) => s.id)), [filteredStores])
  const allFilteredSelected = filteredStores.length > 0 && filteredStores.every((s) => selected.includes(s.id))

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    )
  }

  const selectAllFiltered = () => {
    const merged = Array.from(new Set([...selected, ...filteredStores.map((s) => s.id)]))
    onChange(merged)
  }

  const clearFiltered = () => {
    onChange(selected.filter((id) => !filteredIds.has(id)))
  }

  const goToPage = (p: number) => {
    setPage(p)
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/40 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Lojas
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {selected.filter((id) => filteredIds.has(id)).length} de {filteredStores.length} selecionada(s)
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Icon icon={Search} customSize={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar loja..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {countries.length > 1 && (
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="h-8 text-sm w-full sm:w-[160px]">
              <SelectValue placeholder="Todos os paises" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os paises</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {COUNTRY_LABELS[c] || c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {languages.length > 1 && (
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="h-8 text-sm w-full sm:w-[160px]">
              <SelectValue placeholder="Todos os idiomas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os idiomas</SelectItem>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_LABELS[l] || l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Select/Clear buttons */}
      {filteredStores.length > 1 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={allFilteredSelected ? clearFiltered : selectAllFiltered}
            className="text-xs font-medium text-primary hover:underline"
          >
            {allFilteredSelected ? "Limpar selecao" : "Selecionar todas"}
          </button>
        </div>
      )}

      {/* Store grid (paginated) */}
      {filteredStores.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          Nenhuma loja encontrada para os filtros selecionados.
        </p>
      ) : (
        <>
          <div ref={gridRef} className="grid gap-2 sm:grid-cols-3">
            {pagedStores.map((store) => {
              const isSelected = selected.includes(store.id)
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => toggle(store.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-slate-200 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isSelected ? (
                      <Icon icon={Check} size={16} />
                    ) : (
                      <Icon icon={Store} size={16} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {store.store_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {COUNTRY_LABELS[store.country] || store.country} &middot; {LANGUAGE_LABELS[store.language] || store.language}
                    </p>
                    {store.client_name && (
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {store.client_name}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Pagina {page + 1} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 0}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700/40 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Icon icon={ChevronLeft} customSize={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToPage(i)}
                    className={`inline-flex items-center justify-center h-7 w-7 rounded-md text-xs font-medium transition-colors ${
                      i === page
                        ? "bg-primary text-white"
                        : "border border-slate-200 dark:border-slate-700/40 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages - 1}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700/40 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Icon icon={ChevronRight} customSize={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CopyTab Component
// ---------------------------------------------------------------------------

export function CopyTab() {
  // Form state
  const [stores, setStores] = useState<PortalStore[]>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // History state
  const [generations, setGenerations] = useState<CampaignGeneration[]>([])
  const [allStores, setAllStores] = useState<StoreItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      date: "",
      reference_doc_url: null,
    },
  })

  // Fetch stores for the form (admin context — uses /api/stores)
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch("/api/stores?active=true")
        if (!res.ok) throw new Error("Erro ao carregar lojas")
        const data = await res.json()
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const list: PortalStore[] = (data.stores || [])
          .filter((s: any) => s.client_id)
          .map((s: any) => ({
            id: s.id,
            store_name: s.store_name || s.name || "Sem nome",
            platform: s.platform || "",
            country: s.country || "BR",
            language: s.language || "pt-BR",
            client_name: s.client?.name || s.client?.company || "",
            client_id: s.client_id,
          }))
        /* eslint-enable @typescript-eslint/no-explicit-any */
        setStores(list)
      } catch (err) {
        console.error("Error fetching stores:", err)
        toast({
          variant: "destructive",
          title: "Erro ao carregar lojas",
          description: "Tente recarregar a pagina.",
        })
      } finally {
        setLoadingStores(false)
      }
    }
    fetchStores()
  }, [])

  // Fetch history (admin context — RLS scopes by org_id)
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const [genResult, storesResult] = await Promise.all([
        supabase
          .from("campaign_generations")
          .select("id, name, date, status, drive_folder_url, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("client_stores")
          .select("id, store_name, country, language")
          .eq("is_active", true),
      ])

      if (genResult.error) throw genResult.error

      setGenerations(
        (genResult.data || []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          date: row.date as string,
          status: row.status as CampaignGeneration["status"],
          drive_folder_url: row.drive_folder_url as string | null,
          created_at: row.created_at as string,
        })),
      )

      if (!storesResult.error && storesResult.data) {
        setAllStores(
          storesResult.data.map((row) => ({
            id: row.id as string,
            store_name: row.store_name as string,
            country: row.country as string,
            language: row.language as string,
          })),
        )
      }
    } catch (err) {
      console.error("Error fetching campaign history:", err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleGenerationUpdated = useCallback(
    (id: string, updates: Partial<CampaignGeneration>) => {
      setGenerations((prev) =>
        prev.map((gen) => (gen.id === id ? { ...gen, ...updates } : gen)),
      )
    },
    [],
  )

  const handleGenerationDeleted = useCallback(
    (id: string) => {
      setGenerations((prev) => prev.filter((gen) => gen.id !== id))
    },
    [],
  )

  const canSubmit = isValid && selectedStoreIds.length > 0 && !submitting

  const onSubmit = async (formData: FormValues) => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const body: GenerateRequest = {
        name: formData.name,
        date: formData.date,
        reference_doc_url: formData.reference_doc_url || null,
        store_ids: selectedStoreIds,
      }

      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        const message =
          res.status === 500
            ? "Erro ao iniciar geracao. Tente novamente."
            : errorData?.error || `Erro ${res.status}`
        throw new Error(message)
      }

      toast({ title: "Geracao iniciada!" })
      reset()
      setSelectedStoreIds([])
      fetchHistory()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ========== FORM: Gerar Copies ========== */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Gerar Copies de Campanha
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Preencha os dados abaixo para iniciar a geracao de copies.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="copy-name">Nome da Campanha *</Label>
            <Input
              id="copy-name"
              placeholder="Ex: Black Friday 2026"
              maxLength={255}
              {...register("name")}
              className={errors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Campaign Date */}
          <div className="space-y-2">
            <Label htmlFor="copy-date">Data da Campanha *</Label>
            <Input
              id="copy-date"
              type="date"
              {...register("date")}
              className={errors.date ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {errors.date && (
              <p className="text-sm text-red-500">{errors.date.message}</p>
            )}
          </div>

          {/* Reference Document URL */}
          <div className="space-y-2">
            <Label htmlFor="copy-ref-url">
              Documento de Referencia{" "}
              <span className="text-slate-400 font-normal">(opcional)</span>
            </Label>
            <Input
              id="copy-ref-url"
              type="text"
              placeholder="Link ou texto de referencia"
              {...register("reference_doc_url", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
              className={
                errors.reference_doc_url
                  ? "border-red-500 focus-visible:ring-red-500"
                  : ""
              }
            />
            {errors.reference_doc_url && (
              <p className="text-sm text-red-500">
                {errors.reference_doc_url.message}
              </p>
            )}
          </div>

          {/* Store Selector */}
          <div className="space-y-2">
            <Label>Lojas *</Label>
            {loadingStores ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-[62px] rounded-lg" />
                ))}
              </div>
            ) : stores.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma loja disponivel para gerar copies. Verifique se as lojas estao vinculadas a um cliente.{" "}
                <Link
                  href="/admin/stores"
                  className="text-primary hover:underline"
                >
                  Gerenciar lojas
                </Link>
              </p>
            ) : (
              <InlineStoreSelector
                stores={stores}
                selected={selectedStoreIds}
                onChange={setSelectedStoreIds}
              />
            )}
            {selectedStoreIds.length === 0 && !loadingStores && stores.length > 0 && (
              <p className="text-sm text-slate-500">
                Selecione pelo menos uma loja.
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="bg-primary hover:bg-primary/85 text-white"
          >
            {submitting ? (
              <>
                <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              "Gerar Copies"
            )}
          </Button>
        </form>
      </div>

      {/* ========== HISTORY ========== */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Historico de Geracoes
        </h2>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
            <Icon icon={Loader2} size={20} className="animate-spin mr-2" />
            Carregando historico...
          </div>
        ) : (
          <CampaignHistoryList
            generations={generations}
            allStores={allStores}
            onGenerationUpdated={handleGenerationUpdated}
            onGenerationDeleted={handleGenerationDeleted}
          />
        )}
      </div>
    </div>
  )
}
