"use client"

/**
 * Atribuição de agente da thread — design v3: botão de ícone (userplus)
 * no header que abre um popover com os membros da org. PATCH
 * assigned_to na rota da thread (inalterado); erro visível no popover.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Check, UserPlus } from "lucide-react"
import type { OrgMemberOption } from "@/types/crm-inbox"
import { IcoBtn, InboxAvatar } from "./inbox-theme"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface MemberRow {
  profile_id: string
  is_active: boolean
  profile?: { id: string; name: string | null; avatar_url: string | null } | null
}

interface AssignDropdownProps {
  threadId: string
  assignedTo: string | null
  onAssigned: () => void
  /** Sem uso visual hoje — mantido pra futuras variações de layout. */
  compact?: boolean
}

export function AssignDropdown({ threadId, assignedTo, onAssigned }: AssignDropdownProps) {
  const { data } = useSWR<{ members: MemberRow[] }>("/api/admin/org-members?is_active=true", fetcher)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const members = useMemo<OrgMemberOption[]>(() => {
    const rows = data?.members ?? []
    const seen = new Set<string>()
    const options: OrgMemberOption[] = []
    for (const m of rows) {
      const id = m.profile?.id ?? m.profile_id
      if (!id || seen.has(id)) continue
      seen.add(id)
      options.push({ profileId: id, name: m.profile?.name ?? "Sem nome", avatarUrl: m.profile?.avatar_url ?? null })
    }
    return options.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // PATCH sem checagem trocava o responsável na tela e deixava o
  // refresh seguinte devolver o antigo, sem dizer nada.
  const assign = async (profileId: string | null) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/inbox/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: profileId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string })?.error || "Não foi possível atribuir")
      }
      setOpen(false)
      onAssigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atribuir")
      onAssigned() // volta ao valor real do servidor
    } finally {
      setSaving(false)
    }
  }

  const current = members.find((m) => m.profileId === assignedTo)

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <IcoBtn
        title={current ? `Atribuída a ${current.name} — trocar` : "Atribuir conversa"}
        on={open}
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
      >
        <UserPlus className="h-3.5 w-3.5" />
      </IcoBtn>

      {open && (
        <div
          className="absolute right-0 top-9 z-40 w-[220px] overflow-hidden rounded-[9px] border py-1 shadow-lg"
          style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
          role="listbox"
          aria-label="Atribuir conversa a um agente"
        >
          {error && (
            <div className="px-3 py-1.5 text-[10.5px]" style={{ color: "var(--ops-neg)" }} role="alert">
              {error}
            </div>
          )}
          <button
            onClick={() => assign(null)}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            style={{ color: "var(--ops-sec)" }}
          >
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed" style={{ borderColor: "var(--ops-border)" }} />
            Sem responsável
            {!assignedTo && <Check className="ml-auto h-3 w-3" style={{ color: "var(--ops-pos)" }} />}
          </button>
          {members.map((m) => (
            <button
              key={m.profileId}
              onClick={() => assign(m.profileId)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              style={{ color: "var(--ops-text)" }}
            >
              <InboxAvatar name={m.name} avatarUrl={m.avatarUrl} size={22} />
              <span className="min-w-0 truncate">{m.name}</span>
              {assignedTo === m.profileId && <Check className="ml-auto h-3 w-3 shrink-0" style={{ color: "var(--ops-pos)" }} />}
            </button>
          ))}
          {members.length === 0 && (
            <div className="px-3 py-2 text-[11px]" style={{ color: "var(--ops-mut)" }}>
              Nenhum membro ativo encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
