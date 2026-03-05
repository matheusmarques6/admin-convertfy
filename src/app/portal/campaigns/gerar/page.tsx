"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Loader2, Store, Check } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"
import {
  generateRequestSchema,
  type GenerateRequest,
} from "@/lib/schemas/campaign-generation"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Form-only schema (excludes store_ids and generation_id, handled separately) */
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
}

// ---------------------------------------------------------------------------
// StoreSelector (inline until story 20.6 component is available)
// ---------------------------------------------------------------------------

function StoreSelector({
  stores,
  selected,
  onChange,
}: {
  stores: PortalStore[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    )
  }

  const toggleAll = () => {
    onChange(selected.length === stores.length ? [] : stores.map((s) => s.id))
  }

  return (
    <div className="space-y-2">
      {stores.length > 1 && (
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-medium text-primary hover:underline"
        >
          {selected.length === stores.length
            ? "Desmarcar todas"
            : "Selecionar todas"}
        </button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {stores.map((store) => {
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
                  <Check className="h-4 w-4" />
                ) : (
                  <Store className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {store.store_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {store.platform}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GerarCopiesPage() {
  const router = useRouter()
  const [stores, setStores] = useState<PortalStore[]>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
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

  // Fetch stores on mount
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch("/api/portal/stores")
        if (!res.ok) throw new Error("Erro ao carregar lojas")
        const data = await res.json()
        const list: PortalStore[] = (data.stores || []).map(
          (s: { id: string; store_name?: string; name?: string; platform: string }) => ({
            id: s.id,
            store_name: s.store_name || s.name || "Sem nome",
            platform: s.platform,
          }),
        )
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
      router.push("/portal/campaigns")
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
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100">
      <div className="mx-auto max-w-2xl p-6 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <Link
            href="/portal/campaigns"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao calendario
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Gerar Copies de Campanha
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Preencha os dados abaixo para iniciar a geracao de copies.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Campanha *</Label>
            <Input
              id="name"
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
            <Label htmlFor="date">Data da Campanha *</Label>
            <Input
              id="date"
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
            <Label htmlFor="reference_doc_url">
              Documento de Referencia{" "}
              <span className="text-slate-400 font-normal">(opcional)</span>
            </Label>
            <Input
              id="reference_doc_url"
              type="url"
              placeholder="https://docs.google.com/document/d/..."
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
                Nenhuma loja encontrada.{" "}
                <Link
                  href="/portal/stores/new"
                  className="text-primary hover:underline"
                >
                  Adicionar loja
                </Link>
              </p>
            ) : (
              <StoreSelector
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
            className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm dark:shadow-slate-900/20"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              "Gerar Copies"
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
