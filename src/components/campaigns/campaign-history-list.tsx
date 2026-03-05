"use client"

import { useState, useCallback, useEffect } from "react"
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  FileText,
  AlertCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { useCampaignPolling } from "@/hooks/use-campaign-polling"
import { AddStoresModal } from "@/components/campaigns/add-stores-modal"
import type { StoreItem } from "@/components/campaigns/store-selector"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignGeneration {
  id: string
  name: string
  date: string
  status: "draft" | "processing" | "done"
  drive_folder_url: string | null
  created_at: string
}

interface CampaignGenerationStore {
  id: string
  store_id: string
  store_name: string
  country: string
  language: string
  status: "pending" | "generating" | "done" | "error"
  version: number
  error_message: string | null
  generated_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAG_MAP: Record<string, string> = {
  BR: "\u{1F1E7}\u{1F1F7}",
  PT: "\u{1F1F5}\u{1F1F9}",
  GB: "\u{1F1EC}\u{1F1E7}",
  UK: "\u{1F1EC}\u{1F1E7}",
  US: "\u{1F1FA}\u{1F1F8}",
  DE: "\u{1F1E9}\u{1F1EA}",
  FR: "\u{1F1EB}\u{1F1F7}",
  ES: "\u{1F1EA}\u{1F1F8}",
  NL: "\u{1F1F3}\u{1F1F1}",
}

function getFlag(code: string): string {
  return FLAG_MAP[code.toUpperCase()] ?? "\u{1F310}"
}

const LANGUAGE_LABELS: Record<string, string> = {
  pt: "Portugues",
  en: "English",
  es: "Espanol",
  de: "Deutsch",
  fr: "Francais",
  nl: "Nederlands",
}

function getLanguageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? lang.toUpperCase()
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

function GenerationStatusBadge({ status }: { status: CampaignGeneration["status"] }) {
  switch (status) {
    case "processing":
      return (
        <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 animate-pulse">
          Processando
        </Badge>
      )
    case "done":
      return (
        <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
          Concluida
        </Badge>
      )
    case "draft":
    default:
      return (
        <Badge className="border-transparent bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          Rascunho
        </Badge>
      )
  }
}

function StoreStatusBadge({
  status,
  errorMessage,
}: {
  status: CampaignGenerationStore["status"]
  errorMessage: string | null
}) {
  const badge = (() => {
    switch (status) {
      case "generating":
        return (
          <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 animate-pulse">
            Gerando
          </Badge>
        )
      case "done":
        return (
          <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
            Pronta
          </Badge>
        )
      case "error":
        return (
          <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
            Erro
          </Badge>
        )
      case "pending":
      default:
        return (
          <Badge className="border-transparent bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Pendente
          </Badge>
        )
    }
  })()

  if (status === "error" && errorMessage) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              {badge}
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{errorMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}

// ---------------------------------------------------------------------------
// Store action button
// ---------------------------------------------------------------------------

function StoreActionButton({
  store,
  generationId,
  onRegenerated,
}: {
  store: CampaignGenerationStore
  generationId: string
  onRegenerated: () => void
}) {
  const [loading, setLoading] = useState(false)

  const handleRegenerate = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generation_id: generationId,
          store_ids: [store.store_id],
          // name/date are not needed for regeneration but schema requires them;
          // the API route reads them from the existing generation record
          name: "regeneration",
          date: new Date().toISOString().split("T")[0],
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || `Erro ${res.status}`)
      }

      toast({ title: "Regeneracao iniciada!" })
      onRegenerated()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao regenerar",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setLoading(false)
    }
  }, [generationId, store.store_id, onRegenerated])

  if (store.status === "generating" || store.status === "pending") {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        {store.status === "generating" ? "Gerando..." : "Aguardando"}
      </Button>
    )
  }

  if (store.status === "error") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleRegenerate}
        disabled={loading}
        className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        )}
        Tentar novamente
      </Button>
    )
  }

  // done
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRegenerate}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
      )}
      Regerar
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Expandable row with stores table
// ---------------------------------------------------------------------------

function ExpandableGenerationRow({
  generation,
  allStores,
  onGenerationUpdated,
}: {
  generation: CampaignGeneration
  allStores: StoreItem[]
  onGenerationUpdated: (id: string, updates: Partial<CampaignGeneration>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [stores, setStores] = useState<CampaignGenerationStore[]>([])
  const [loadingStores, setLoadingStores] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [addStoresOpen, setAddStoresOpen] = useState(false)

  // Polling: only poll when expanded and processing
  const shouldPoll = expanded && generation.status === "processing"
  const { data: pollData } = useCampaignPolling(shouldPoll ? generation.id : null)

  // Update generation & stores when polling returns data
  useEffect(() => {
    if (!pollData) return

    // Update parent generation status/drive info
    if (pollData.generation.status !== generation.status || pollData.generation.drive_folder_url !== generation.drive_folder_url) {
      onGenerationUpdated(generation.id, {
        status: pollData.generation.status as CampaignGeneration["status"],
        drive_folder_url: pollData.generation.drive_folder_url,
      })
    }

    // Update stores from poll data (merge with existing store info)
    if (loaded && pollData.stores.length > 0) {
      setStores((prev) =>
        prev.map((s) => {
          const polled = pollData.stores.find((ps) => ps.store_id === s.store_id)
          if (!polled) return s
          return {
            ...s,
            status: polled.status as CampaignGenerationStore["status"],
            version: polled.version,
            error_message: polled.error_message,
            generated_at: polled.generated_at,
          }
        }),
      )
    }
  }, [pollData, generation.id, generation.status, generation.drive_folder_url, loaded, onGenerationUpdated])

  const fetchStores = useCallback(async () => {
    setLoadingStores(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("campaign_generation_stores")
        .select(`
          id,
          store_id,
          status,
          version,
          error_message,
          generated_at,
          client_stores (
            store_name,
            country,
            language
          )
        `)
        .eq("generation_id", generation.id)
        .order("created_at", { ascending: true })

      if (error) throw error

      const mapped: CampaignGenerationStore[] = (data || []).map((row) => {
        const storeInfo = row.client_stores as unknown as {
          store_name: string
          country: string
          language: string
        } | null
        return {
          id: row.id as string,
          store_id: row.store_id as string,
          store_name: storeInfo?.store_name ?? "-",
          country: storeInfo?.country ?? "-",
          language: storeInfo?.language ?? "-",
          status: row.status as CampaignGenerationStore["status"],
          version: row.version as number,
          error_message: row.error_message as string | null,
          generated_at: row.generated_at as string | null,
        }
      })

      setStores(mapped)
      setLoaded(true)
    } catch (err) {
      console.error("Error fetching generation stores:", err)
      toast({
        variant: "destructive",
        title: "Erro ao carregar lojas",
      })
    } finally {
      setLoadingStores(false)
    }
  }, [generation.id])

  const handleToggle = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    if (next && !loaded) {
      fetchStores()
    }
  }, [expanded, loaded, fetchStores])

  const handleRegenerated = useCallback(() => {
    fetchStores()
  }, [fetchStores])

  const handleAddStoresSuccess = useCallback(() => {
    // Refresh stores and set generation back to processing
    fetchStores()
    onGenerationUpdated(generation.id, { status: "processing" })
  }, [fetchStores, generation.id, onGenerationUpdated])

  const existingStoreIds = stores.map((s) => s.store_id)

  return (
    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-[#151922] overflow-hidden">
      {/* Generation header row */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
      >
        {/* Expand icon */}
        <div className="shrink-0 text-slate-400 dark:text-slate-500">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </div>

        {/* Name + date */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
            {generation.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Data campanha: {formatDate(generation.date)} | Criada em {formatDateTime(generation.created_at)}
          </p>
        </div>

        {/* Status badge */}
        <GenerationStatusBadge status={generation.status} />

        {/* Drive link */}
        {generation.drive_folder_url && (
          <a
            href={generation.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir no Drive
          </a>
        )}

        {/* Add stores button (only for done campaigns) */}
        {generation.status === "done" && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setAddStoresOpen(true)
            }}
            className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Adicionar lojas
          </Button>
        )}
      </button>

      {/* Expanded stores table */}
      {expanded && (
        <div className="border-t border-slate-200/80 dark:border-slate-700/40">
          {loadingStores ? (
            <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando lojas...
            </div>
          ) : stores.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma loja associada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-[#1A1F2E] hover:bg-slate-50 dark:hover:bg-[#1A1F2E]">
                  <TableHead>Loja</TableHead>
                  <TableHead>Pais</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Versao</TableHead>
                  <TableHead className="text-right">Acao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium">
                      {store.store_name}
                    </TableCell>
                    <TableCell>
                      <span className="mr-1.5">{getFlag(store.country)}</span>
                      {store.country}
                    </TableCell>
                    <TableCell>{getLanguageLabel(store.language)}</TableCell>
                    <TableCell>
                      <StoreStatusBadge
                        status={store.status}
                        errorMessage={store.error_message}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      v{store.version}
                    </TableCell>
                    <TableCell className="text-right">
                      <StoreActionButton
                        store={store}
                        generationId={generation.id}
                        onRegenerated={handleRegenerated}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Add Stores Modal */}
      <AddStoresModal
        generationId={generation.id}
        existingStoreIds={existingStoreIds}
        allStores={allStores}
        open={addStoresOpen}
        onOpenChange={setAddStoresOpen}
        onSuccess={handleAddStoresSuccess}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CampaignHistoryListProps {
  generations: CampaignGeneration[]
  allStores: StoreItem[]
  onGenerationUpdated: (id: string, updates: Partial<CampaignGeneration>) => void
}

export function CampaignHistoryList({ generations, allStores, onGenerationUpdated }: CampaignHistoryListProps) {
  if (generations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700/40 bg-white dark:bg-[#151922] p-12 text-center">
        <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
          Nenhuma campanha gerada ainda
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Use o formulario acima para gerar sua primeira campanha.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {generations.map((gen) => (
        <ExpandableGenerationRow
          key={gen.id}
          generation={gen}
          allStores={allStores}
          onGenerationUpdated={onGenerationUpdated}
        />
      ))}
    </div>
  )
}
