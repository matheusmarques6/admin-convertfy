"use client"

/**
 * Detecção e merge de negócios duplicados da pipeline.
 *
 * Duplicado = 2+ negócios ABERTOS do MESMO contato (cliente ou lead)
 * nesta pipeline. O merge migra timeline, produtos, conversas e
 * arquivos para o sobrevivente e apaga os demais (valor recalculado
 * quando produtos migram).
 */

import { useState } from "react"
import useSWR from "swr"
import { AlertTriangle, GitMerge, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DupDealRow {
  id: string
  title: string
  value: number | null
  owner_name: string | null
  contact_name: string | null
  created_at: string
}

interface DuplicateGroup {
  key: string
  deals: DupDealRow[]
  suggested_survivor_id: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtBRL = (v: number | null) =>
  v == null
    ? "—"
    : "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })

export function DealsDuplicatesDialog({
  open,
  onOpenChange,
  pipelineId,
  onMerged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  onMerged: () => void
}) {
  const { data, isLoading, mutate } = useSWR<{ groups: DuplicateGroup[] }>(
    open ? `/api/crm/deals/duplicates?pipeline_id=${pipelineId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const groups = data?.groups ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Layers} size={20} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Negócios duplicados
          </DialogTitle>
          <DialogDescription>
            Mesmo contato com mais de um negócio aberto nesta pipeline. Escolha
            qual fica — timeline, produtos, conversas e arquivos dos outros migram
            para ele.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-[8px] bg-gray-100 dark:bg-white/[0.06]"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-gray-200 px-4 py-8 text-center dark:border-white/10">
              <p className="text-[13.5px] font-medium text-gray-900 dark:text-white">
                Nenhum duplicado encontrado
              </p>
              <p className="mt-1 text-[12.5px] text-gray-500 dark:text-[#8B92A5]">
                Nenhum contato tem mais de um negócio aberto nesta pipeline.
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <DuplicateDealGroupCard
                key={g.key}
                group={g}
                onMerged={() => {
                  mutate()
                  onMerged()
                }}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DuplicateDealGroupCard({
  group,
  onMerged,
}: {
  group: DuplicateGroup
  onMerged: () => void
}) {
  const [survivorId, setSurvivorId] = useState(group.suggested_survivor_id)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contact = group.deals.find((d) => d.contact_name)?.contact_name

  const merge = async () => {
    const duplicateIds = group.deals.filter((d) => d.id !== survivorId).map((d) => d.id)
    if (duplicateIds.length === 0) return
    if (
      !window.confirm(
        `Mesclar ${duplicateIds.length + 1} negócios em um? Os outros serão removidos após transferir timeline, produtos e conversas. Não dá para desfazer.`,
      )
    ) {
      return
    }
    setMerging(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/deals/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivor_id: survivorId, duplicate_ids: duplicateIds }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null
        const raw = json?.error
        setError(
          (typeof raw === "string"
            ? raw
            : (raw as { message?: string } | undefined)?.message) ??
            "Não foi possível mesclar.",
        )
        return
      }
      onMerged()
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-black/[0.08] dark:border-white/[0.08]">
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.05] px-3 py-2 dark:border-white/[0.05]">
        <span className="min-w-0 truncate text-[11.5px] font-medium text-gray-500 dark:text-[#8B92A5]">
          {contact ?? "Mesmo contato"} · {group.deals.length} negócios abertos
        </span>
        <button
          type="button"
          onClick={merge}
          disabled={merging}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] bg-[#4E62D8] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2137B6] disabled:opacity-50"
        >
          <Icon icon={GitMerge} customSize={13} />
          {merging ? "Mesclando…" : "Mesclar"}
        </button>
      </div>

      <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
        {group.deals.map((d) => {
          const isSurvivor = d.id === survivorId
          return (
            <label
              key={d.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors",
                isSurvivor
                  ? "bg-[#EEF0FB] dark:bg-[#4E62D8]/10"
                  : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
              )}
            >
              <input
                type="radio"
                name={`deal-survivor-${group.key}`}
                checked={isSurvivor}
                onChange={() => setSurvivorId(d.id)}
                className="mt-1 h-3.5 w-3.5 accent-[#4E62D8]"
                aria-label={`Manter ${d.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-white">
                    {d.title}
                  </span>
                  {isSurvivor && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#2137B6] dark:text-[#A8B2EE]">
                      mantém este
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-gray-500 dark:text-[#8B92A5]">
                  <span className="tabular-nums">{fmtBRL(d.value)}</span>
                  {d.owner_name && <span>{d.owner_name}</span>}
                  <span>
                    criado{" "}
                    {new Date(d.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 border-t border-black/[0.05] px-3 py-2 text-[12px] text-red-600 dark:border-white/[0.05] dark:text-red-400">
          <Icon icon={AlertTriangle} customSize={13} />
          {error}
        </p>
      )}
    </div>
  )
}
