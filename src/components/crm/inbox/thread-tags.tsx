"use client"

/**
 * Tags da conversa do inbox (crm_threads.tags TEXT[]).
 *
 * Mesmo modelo de deals/leads: array de NOMES na thread; cor resolvida
 * pela registry global de tags (vocabulário COMPARTILHADO com Leads —
 * entity 'lead' — pra tag criada aqui valer no CRM inteiro).
 *
 * - useTagRegistry / tagColorFor: reusados pelos chips da lista
 * - ThreadTags: chips + botão que abre popover com o TagsSelector
 *   (criação inline com cor); cada mudança faz PATCH do array completo
 */

import { useEffect, useRef, useState } from "react"
import useSWR, { mutate as swrMutate } from "swr"
import { Plus, Tag as TagIcon } from "lucide-react"
import { TagsSelector, type Tag } from "@/components/crm/tags-selector"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TAGS_REGISTRY_KEY = "/api/crm/tags?entity=lead"

// Mesma paleta/fallback do TagsSelector — mantém as cores consistentes
// entre o seletor, o header e os chips da lista.
const PALETTE = ["#4E62D8", "#10B981", "#A855F7", "#F59E0B", "#EC4899", "#EF4444", "#3B82F6", "#6B7280"]

export function tagColorFor(name: string, registry: Tag[]): string {
  // case-insensitive: a registry pode ter a grafia canônica ("Teste")
  // e a thread outra ("teste") — cor não pode divergir por caixa.
  const key = name.toLowerCase()
  const t = registry.find((x) => x.name.toLowerCase() === key)
  if (t) return t.color
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xff
  return PALETTE[h % PALETTE.length]
}

/** Registry de tags da org (vocabulário compartilhado com Leads). */
export function useTagRegistry(): Tag[] {
  const { data } = useSWR<{ tags?: Tag[]; data?: { tags?: Tag[] } }>(TAGS_REGISTRY_KEY, fetcher, {
    revalidateOnFocus: false,
  })
  return (data?.data?.tags ?? data?.tags ?? []) as Tag[]
}

/**
 * Revalida a registry compartilhada — o TagsSelector cria tags novas na
 * própria lista interna; sem isto os chips do header/lista não conhecem
 * a tag recém-criada e caem na cor de fallback (hash) errada.
 */
export function refreshTagRegistry(): void {
  void swrMutate(TAGS_REGISTRY_KEY)
}

// ─── Chips (apresentacional — usado no header e na lista) ─────────

export function ThreadTagChips({
  tags,
  registry,
  max = 3,
  size = "md",
}: {
  tags: string[]
  registry: Tag[]
  max?: number
  size?: "sm" | "md"
}) {
  if (!tags.length) return null
  const visible = tags.slice(0, max)
  const hidden = tags.length - visible.length
  const fontSize = size === "sm" ? 10 : 11

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {visible.map((name) => {
        const color = tagColorFor(name, registry)
        return (
          <span
            key={name}
            className="truncate"
            style={{
              fontSize,
              fontWeight: 530,
              padding: size === "sm" ? "0 5px" : "1px 7px",
              borderRadius: "var(--crm-radius-full)",
              background: `${color}1A`,
              color,
              border: `1px solid ${color}40`,
              maxWidth: 110,
            }}
            title={name}
          >
            {name}
          </span>
        )
      })}
      {hidden > 0 && (
        <span style={{ fontSize, color: "var(--crm-gray-500)", fontFamily: "var(--crm-font-mono)" }}>
          +{hidden}
        </span>
      )}
    </span>
  )
}

// ─── Widget do header do chat ─────────────────────────────────────

interface ThreadTagsProps {
  threadId: string
  tags: string[]
  /** Revalida detail + lista após salvar (padrão do AssignDropdown). */
  onChanged: () => void
}

export function ThreadTags({ threadId, tags, onChanged }: ThreadTagsProps) {
  const registry = useTagRegistry()
  const [open, setOpen] = useState(false)
  // Estado local otimista — o PATCH substitui o array completo.
  const [current, setCurrent] = useState<string[]>(tags)
  const [saving, setSaving] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Thread trocou (ou refresh trouxe tags novas) → ressincroniza.
  const tagsKey = JSON.stringify(tags)
  useEffect(() => {
    setCurrent(tags)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, tagsKey])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const persist = async (names: string[]) => {
    const previous = current
    setCurrent(names)
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/inbox/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: names }),
      })
      if (!res.ok) throw new Error("patch failed")
      refreshTagRegistry()
      onChanged()
    } catch {
      setCurrent(previous) // rollback otimista
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center gap-1.5 min-w-0">
      <ThreadTagChips tags={current} registry={registry} max={3} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Tags da conversa"
        aria-expanded={open}
        className="flex h-6 shrink-0 items-center gap-1 px-1.5"
        style={{
          fontSize: 11,
          borderRadius: "var(--crm-radius-sm)",
          border: "1px dashed var(--crm-gray-300)",
          background: "transparent",
          color: "var(--crm-gray-500)",
          cursor: "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {current.length === 0 ? (
          <>
            <TagIcon className="h-3 w-3" />
            Tags
          </>
        ) : (
          <Plus className="h-3 w-3" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-30"
          style={{
            width: 300,
            padding: 10,
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-gray-200)",
            borderRadius: "var(--crm-radius-md)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <p style={{ fontSize: 11, color: "var(--crm-gray-500)", marginBottom: 6 }}>
            Tags da conversa (compartilhadas com Leads)
          </p>
          <TagsSelector entity="lead" selected={current} onChange={persist} placeholder="Adicionar tag…" />
        </div>
      )}
    </div>
  )
}
