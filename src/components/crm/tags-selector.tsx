"use client"

/**
 * TagsSelector — combobox de tags com:
 *  - Badges removíveis das tags selecionadas
 *  - Dropdown com lista filtrada pelo input
 *  - Opção 'Criar tag "X"' quando o texto não bate com nenhuma
 *  - Hover em cada item: × pra excluir tag da org
 *  - Persiste em /api/crm/tags (GET lista, POST cria, DELETE remove)
 *
 * Usado em: import wizard (bulk), new deal, new lead, lead/deal drawer.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Plus, Tag as TagIcon, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Tag {
  id: string
  name: string
  color: string
  entity_type?: string
}

interface TagsSelectorProps {
  entity?: "lead" | "deal" | "client"
  selected: string[] // names das tags selecionadas
  onChange: (names: string[]) => void
  placeholder?: string
  className?: string
}

const PALETTE = [
  "#4E62D8",
  "#10B981",
  "#A855F7",
  "#F59E0B",
  "#EC4899",
  "#EF4444",
  "#3B82F6",
  "#6B7280",
]

export function TagsSelector({
  entity = "lead",
  selected,
  onChange,
  placeholder = "Adicionar tag…",
  className,
}: TagsSelectorProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Carrega tags da org
  const reload = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/tags?entity=${entity}`)
      const json = await res.json()
      setTags((json.data?.tags ?? json.tags ?? []) as Tag[])
    } catch {
      setTags([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])

  // Click-outside fecha
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tags.filter(
      (t) =>
        !selected.includes(t.name) &&
        (q === "" || t.name.toLowerCase().includes(q)),
    )
  }, [tags, selected, query])

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return tags.find((t) => t.name.toLowerCase() === q) ?? null
  }, [tags, query])

  const colorOfName = (name: string): string => {
    const t = tags.find((x) => x.name === name)
    if (t) return t.color
    // fallback hash
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xff
    return PALETTE[h % PALETTE.length]
  }

  const addTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed])
    }
    setQuery("")
    inputRef.current?.focus()
  }

  const createTag = async () => {
    const name = query.trim()
    if (!name) return
    try {
      const randomColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      const res = await fetch("/api/crm/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: randomColor, entity_type: entity }),
      })
      const json = await res.json()
      const created = json.data?.tag ?? json.tag
      if (created) {
        setTags((prev) =>
          prev.find((t) => t.id === created.id) ? prev : [...prev, created],
        )
        addTag(created.name)
      }
    } catch {
      /* noop */
    }
  }

  const deleteTagFromOrg = async (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Excluir a tag "${tag.name}" da organização?`)) return
    try {
      await fetch(`/api/crm/tags/${tag.id}`, { method: "DELETE" })
      setTags((prev) => prev.filter((t) => t.id !== tag.id))
      // Tambem remove da selecao se estiver lá
      onChange(selected.filter((n) => n !== tag.name))
    } catch {
      /* noop */
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {/* Chips + input */}
      <div
        onClick={() => {
          setOpen(true)
          inputRef.current?.focus()
        }}
        className="flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1 bg-white border rounded-[6px] cursor-text focus-within:border-brand-500 transition-colors"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
      >
        {selected.map((name) => {
          const color = colorOfName(name)
          return (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-medium border"
              style={{
                background: `${color}14`,
                color,
                borderColor: `${color}33`,
              }}
            >
              {name}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(selected.filter((n) => n !== name))
                }}
                className="hover:bg-black/[0.06] rounded-full p-0.5 transition-colors"
                aria-label={`Remover ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (filtered.length > 0) addTag(filtered[0].name)
              else if (query.trim() && !exactMatch) createTag()
            }
            if (e.key === "Backspace" && !query && selected.length > 0) {
              onChange(selected.slice(0, -1))
            }
            if (e.key === "Escape") setOpen(false)
          }}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none border-none bg-transparent text-[12.5px] py-1 placeholder:text-slate-400"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-[8px] shadow-xl z-50 max-h-[280px] overflow-auto"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        >
          {loading && (
            <div className="px-3 py-3 text-[12px] text-slate-400 italic">
              Carregando…
            </div>
          )}
          {!loading && filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-3 text-[12px] text-slate-400 italic">
              {tags.length === 0
                ? "Nenhuma tag criada ainda. Digite e tecle Enter."
                : "Todas as tags já estão selecionadas."}
            </div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => addTag(t.name)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer group"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: t.color }}
              />
              <span className="flex-1 text-[12.5px] text-slate-800">{t.name}</span>
              <button
                onClick={(e) => deleteTagFromOrg(t, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1"
                aria-label={`Excluir ${t.name}`}
                title="Excluir tag"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div
              onClick={createTag}
              className="flex items-center gap-2 px-3 py-2 bg-brand-50/40 hover:bg-brand-50 cursor-pointer border-t"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <Plus className="h-3.5 w-3.5 text-brand-600 shrink-0" />
              <span className="text-[12.5px] text-brand-700 font-medium">
                Criar tag &quot;{query.trim()}&quot;
              </span>
            </div>
          )}
          {query.trim() === "" && tags.length > 0 && (
            <div
              className="px-3 py-1.5 border-t text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1"
              style={{ borderColor: "rgba(0,0,0,0.04)" }}
            >
              <TagIcon className="h-3 w-3" />
              {tags.length} tag(s) cadastrada(s)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
