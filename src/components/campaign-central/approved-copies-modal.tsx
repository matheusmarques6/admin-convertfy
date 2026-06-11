"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  X,
  Check,
  Copy as CopyIcon,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/hooks/use-toast"
import type {
  CampaignSuggestion,
  CopyResultEntry,
  EmailDraftBlock,
} from "@/types/campaign-central"

interface StoreOption {
  id: string
  store_name: string
  country?: string | null
  language?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const LANG_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
}

function langKey(language: string | null | undefined): string {
  return (language ?? "pt-BR").slice(0, 2).toLowerCase()
}

function countryKey(country: string | null | undefined): string {
  return (country ?? "BR").toUpperCase().slice(0, 2)
}

function copyBlocksToText(entry: CopyResultEntry): string {
  const lines: string[] = []
  lines.push(`Assunto: ${entry.subject}`)
  lines.push(`Preview: ${entry.preheader ?? entry.preview}`)
  lines.push("")
  for (const block of entry.blocks ?? []) {
    switch (block.type) {
      case "heading":
        if (block.headline) lines.push(`# ${block.headline}`)
        if (block.sub) lines.push(block.sub)
        lines.push("")
        break
      case "text":
        if (block.value) lines.push(block.value, "")
        break
      case "image":
        if (block.caption) lines.push(`[Imagem: ${block.caption}]`, "")
        break
      case "offer":
        if (block.value) lines.push(`>> ${block.value}`, "")
        break
      case "button":
        if (block.value) lines.push(`>> [${block.value}]`, "")
        break
      case "divider":
        lines.push("---", "")
        break
      case "footer":
        if (block.value) lines.push(block.value)
        break
      case "products":
        for (const item of block.items ?? []) {
          lines.push(`• ${item.name ?? "Produto"} — ${item.price ?? ""}`)
        }
        lines.push("")
        break
    }
  }
  return lines.join("\n").trim()
}

interface Props {
  suggestion: CampaignSuggestion
  onClose: () => void
  onContinueGenerating: () => void
}

interface CopyRowData {
  storeId: string
  mode: "test" | "production"
  entry: CopyResultEntry
}

export function ApprovedCopiesModal({ suggestion, onClose, onContinueGenerating }: Props) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    "/api/stores",
    fetcher,
    { revalidateOnFocus: false },
  )
  const storeById = useMemo(
    () => new Map((storesData?.stores ?? []).map((s) => [s.id, s])),
    [storesData],
  )

  const rows = useMemo<CopyRowData[]>(() => {
    const list: CopyRowData[] = []
    for (const [storeId, entry] of Object.entries(suggestion.copy_results?.test ?? {})) {
      list.push({ storeId, mode: "test", entry })
    }
    for (const [storeId, entry] of Object.entries(suggestion.copy_results?.production ?? {})) {
      list.push({ storeId, mode: "production", entry })
    }
    // Aprovadas primeiro
    list.sort((a, b) => {
      const av = a.entry.quality === "good" ? 0 : 1
      const bv = b.entry.quality === "good" ? 0 : 1
      return av - bv
    })
    return list
  }, [suggestion.copy_results])

  const approvedCount = rows.filter((r) => r.entry.quality === "good").length
  const targetCount = suggestion.targets.length
  const generatedCount = rows.length

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const onCopy = async (key: string, entry: CopyResultEntry) => {
    try {
      await navigator.clipboard.writeText(copyBlocksToText(entry))
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1400)
    } catch {
      toast({ title: "Falha ao copiar", description: "Clipboard indisponível" })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 p-4 backdrop-blur-md md:p-7 dark:bg-gray-950/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[88vh] w-[920px] max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-4">
          <Badge variant="positive" showDot>
            Aprovada
          </Badge>
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            Copies por loja · {suggestion.title}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted/30 px-5 py-3 text-[12.5px]">
          <span>
            <span className="text-muted-foreground">Lojas-alvo: </span>
            <strong className="font-bold tabular-nums text-foreground">{targetCount}</strong>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span>
            <span className="text-muted-foreground">Copies geradas: </span>
            <strong className="font-bold tabular-nums text-foreground">{generatedCount}</strong>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span>
            <span className="text-muted-foreground">Aprovadas: </span>
            <strong className="font-bold tabular-nums text-emerald-600">{approvedCount}</strong>
          </span>
          <div className="flex-1" />
          {suggestion.design_task_id && (
            <a
              href={`/admin/operacional/deals?task=${suggestion.design_task_id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
            >
              <ExternalLink size={12} /> Ver task do designer
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={onContinueGenerating}>
            <Sparkles size={13} className="mr-1" /> Continuar gerando
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-5">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[6px] border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
              <Edit3 size={24} className="text-muted-foreground/60" />
              <div className="text-[13px] text-muted-foreground">
                Ainda não há copies geradas pra esta campanha. Clique em "Continuar gerando".
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {rows.map(({ storeId, mode, entry }) => {
                const key = `${mode}:${storeId}`
                const store = storeById.get(storeId)
                const isGood = entry.quality === "good"
                const isExpanded = expanded.has(key)
                return (
                  <div
                    key={key}
                    className={`overflow-hidden rounded-[8px] border bg-card ${
                      isGood ? "border-emerald-300" : "border-border"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 border-b border-border/50 px-3.5 py-2 ${
                        isGood ? "bg-emerald-50" : "bg-muted/40"
                      }`}
                    >
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {store?.store_name ?? storeId}
                      </span>
                      {store && <Badge variant="neutral">{countryKey(store.country)}</Badge>}
                      {store && (
                        <Badge variant="info">{LANG_LABEL[langKey(store.language)] ?? "—"}</Badge>
                      )}
                      <Badge variant={mode === "production" ? "positive" : "warning"}>
                        {mode === "production" ? "Rollout" : "Piloto"}
                      </Badge>
                      <div className="flex-1" />
                      {isGood && (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                          <Check size={13} /> Aprovada
                        </span>
                      )}
                    </div>
                    <div className="px-3.5 py-3">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Assunto
                      </div>
                      <div className="mb-2.5 text-[14px] font-semibold text-foreground">
                        {entry.subject}
                      </div>
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Preview
                      </div>
                      <div className="mb-2 text-[12.5px] leading-normal text-muted-foreground">
                        {entry.preheader ?? entry.preview}
                      </div>
                      {entry.blocks && entry.blocks.length > 0 && (
                        <button
                          onClick={() => toggleExpand(key)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {isExpanded
                            ? "Ocultar email completo"
                            : `Ver email completo (${entry.blocks.length} blocos)`}
                        </button>
                      )}
                      {isExpanded && entry.blocks && (
                        <div className="mt-3 space-y-2.5 rounded-[6px] border border-border/70 bg-muted/30 p-3">
                          {entry.blocks.map((b, i) => (
                            <BlockPreview key={b.id ?? i} block={b} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 border-t border-border/50 px-3.5 py-2.5">
                      <button
                        onClick={() => onCopy(key, entry)}
                        className={`inline-flex items-center gap-1 text-[12px] font-semibold ${
                          copiedKey === key
                            ? "text-emerald-600"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <CopyIcon size={13} />
                        {copiedKey === key ? "Copiado" : "Copiar tudo"}
                      </button>
                      <div className="flex-1" />
                      <span className="text-[11px] text-muted-foreground/70">
                        gerada{" "}
                        {new Date(entry.generated_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BlockPreview({ block }: { block: EmailDraftBlock }) {
  switch (block.type) {
    case "image":
      return (
        <div className="rounded-[4px] border border-dashed border-border bg-muted px-2 py-2 font-mono text-[10.5px] text-muted-foreground">
          [Imagem] {block.caption ?? ""}
        </div>
      )
    case "heading":
      return (
        <div>
          <div className="text-[15px] font-bold leading-tight text-foreground">
            {block.headline ?? "—"}
          </div>
          {block.sub && (
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">{block.sub}</div>
          )}
        </div>
      )
    case "text":
      return (
        <div className="text-[12.5px] leading-relaxed text-foreground/85">{block.value}</div>
      )
    case "offer":
      return (
        <div className="rounded-[4px] border border-primary/20 bg-primary/5 px-2 py-1.5 text-center text-[12.5px] font-semibold text-primary">
          {block.value}
        </div>
      )
    case "button":
      return (
        <div className="text-center">
          <span className="inline-block rounded-[4px] bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-white">
            {block.value}
          </span>
        </div>
      )
    case "divider":
      return <hr className="border-border" />
    case "footer":
      return (
        <div className="text-center text-[10.5px] text-muted-foreground/70">{block.value}</div>
      )
    case "products": {
      const cols = block.columns ?? 3
      return (
        <div className={`grid gap-2 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {(block.items ?? []).map((it, i) => (
            <div key={i} className="rounded-[4px] border border-border bg-card p-1.5">
              <div className="mb-1 h-14 rounded-[3px] border border-dashed border-border/70 bg-muted/60" />
              <div className="truncate text-[11px] font-semibold text-foreground">
                {it.name ?? "—"}
              </div>
              <div className="text-[10.5px] font-bold text-primary">{it.price ?? ""}</div>
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}
