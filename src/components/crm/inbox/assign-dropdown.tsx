"use client"

/**
 * Atribuição de agente da thread — select compacto no header do chat.
 * Membros vêm de /api/admin/org-members; PATCH assigned_to na rota da
 * thread (já suportado pela API).
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import type { OrgMemberOption } from "@/types/crm-inbox"

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
}

export function AssignDropdown({ threadId, assignedTo, onAssigned }: AssignDropdownProps) {
  const { data } = useSWR<{ members: MemberRow[] }>("/api/admin/org-members?is_active=true", fetcher)
  const [saving, setSaving] = useState(false)

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

  const handleChange = async (profileId: string) => {
    setSaving(true)
    try {
      await fetch(`/api/crm/inbox/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: profileId || null }),
      })
      onAssigned()
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={assignedTo ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="crm-input"
      style={{ height: "var(--crm-button-height-sm)", maxWidth: 160 }}
      title="Atribuir a um agente"
      aria-label="Atribuir conversa a um agente"
    >
      <option value="">Sem responsável</option>
      {members.map((m) => (
        <option key={m.profileId} value={m.profileId}>
          {m.name}
        </option>
      ))}
    </select>
  )
}
