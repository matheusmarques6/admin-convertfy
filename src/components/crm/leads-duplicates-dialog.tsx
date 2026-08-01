"use client"

/**
 * Revisão e merge de leads duplicados.
 *
 * Cada grupo mostra os leads lado a lado com radio para escolher quem
 * sobrevive (sugestão pré-marcada: quem tem mais dados; convertido é
 * âncora). O merge nunca perde dado — o sobrevivente só ganha o que não
 * tinha, e todo o histórico (negócios, conversas, atividades) migra.
 */

import { useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Copy, GitMerge, Mail, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DupLeadRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  status: string
  converted_to_deal_id: string | null
  created_at: string
}

interface DuplicateGroup {
  matched_by: "email" | "phone"
  match_value: string
  leads: DupLeadRow[]
  suggested_survivor_id: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_PT: Record<string, string> = {
  new: "Novo",
  qualified: "Qualificado",
  unqualified: "Desqualificado",
  converted: "Convertido",
  lost: "Perdido",
}

export function LeadsDuplicatesDialog({
  open,
  onOpenChange,
  onMerged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerged: () => void
}) {
  const { data, isLoading, mutate } = useSWR<{ groups: DuplicateGroup[] }>(
    open ? "/api/crm/leads/duplicates" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const groups = data?.groups ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Copy} size={20} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Leads duplicados
          </DialogTitle>
          <DialogDescription>
            Mesmo email ou mesmo telefone. Escolha qual registro fica — ele herda o que
            não tinha, e negócios, conversas e atividades dos outros migram para ele.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-[8px] bg-gray-100 dark:bg-white/[0.06]"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-gray-200 px-4 py-8 text-center dark:border-white/10">
              <p className="text-[13.5px] font-medium text-gray-900 dark:text-white">
                Nenhum duplicado encontrado
              </p>
              <p className="mt-1 text-[12.5px] text-gray-500 dark:text-[#8B92A5]">
                Nenhum lead compartilha email ou telefone com outro.
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <DuplicateGroupCard
                key={`${g.matched_by}:${g.match_value}`}
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

function DuplicateGroupCard({
  group,
  onMerged,
}: {
  group: DuplicateGroup
  onMerged: () => void
}) {
  const [survivorId, setSurvivorId] = useState(group.suggested_survivor_id)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const merge = async () => {
    const duplicateIds = group.leads.filter((l) => l.id !== survivorId).map((l) => l.id)
    if (duplicateIds.length === 0) return
    if (
      !window.confirm(
        `Mesclar ${duplicateIds.length + 1} leads em um? Os outros registros serão removidos após transferir o histórico. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    setMerging(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/leads/duplicates", {
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
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-gray-500 dark:text-[#8B92A5]">
          <Icon icon={group.matched_by === "email" ? Mail : Phone} customSize={13} />
          <span className="truncate font-medium">
            {group.matched_by === "email" ? "Mesmo email" : "Mesmo telefone"} ·{" "}
            {group.match_value}
          </span>
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
        {group.leads.map((l) => {
          const isSurvivor = l.id === survivorId
          return (
            <label
              key={l.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors",
                isSurvivor
                  ? "bg-[#EEF0FB] dark:bg-[#4E62D8]/10"
                  : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
              )}
            >
              <input
                type="radio"
                name={`survivor-${group.match_value}`}
                checked={isSurvivor}
                onChange={() => setSurvivorId(l.id)}
                className="mt-1 h-3.5 w-3.5 accent-[#4E62D8]"
                aria-label={`Manter ${l.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-white">
                    {l.name}
                  </span>
                  {isSurvivor && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#2137B6] dark:text-[#A8B2EE]">
                      mantém este
                    </span>
                  )}
                  {l.converted_to_deal_id && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      tem negócio
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-gray-500 dark:text-[#8B92A5]">
                  <span>{l.email || "sem email"}</span>
                  <span>{l.phone || "sem telefone"}</span>
                  {l.company && <span>{l.company}</span>}
                  <span>{STATUS_PT[l.status] ?? l.status}</span>
                  <span>
                    criado{" "}
                    {new Date(l.created_at).toLocaleDateString("pt-BR", {
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
