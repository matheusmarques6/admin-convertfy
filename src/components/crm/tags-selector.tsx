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

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { X, Plus, Tag as TagIcon, Trash2, Check } from "lucide-react"
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createColor, setCreateColor] = useState(PALETTE[0])
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

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

  // O dropdown é absolute dentro de containers com overflow (modais do CRM).
  // Sem isso, abrir o combobox no fim do modal deixa a lista fora da área
  // visível — o usuário vê o campo mas não alcança os itens.
  useEffect(() => {
    if (!open) return
    menuRef.current?.scrollIntoView({ block: "nearest" })
  }, [open])

  // Lista TODAS as tags da org que casam com a busca — inclusive as já
  // selecionadas, marcadas com check. Esconder a selecionada fazia a tag
  // recém-criada sumir da lista no instante em que era criada (ela entra
  // já selecionada), o que lê como "a tag não foi adicionada".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tags.filter((t) => q === "" || t.name.toLowerCase().includes(q))
  }, [tags, query])

  // Primeira sugestão ainda NÃO escolhida — alvo do Enter.
  const firstUnselected = useMemo(
    () => filtered.find((t) => !selected.includes(t.name)) ?? null,
    [filtered, selected],
  )

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

  // Abre modal pra criar tag com cor escolhida (em vez de criar inline
  // com cor aleatoria). Pre-preenche nome com a query atual.
  const openCreateModal = (prefillName?: string) => {
    setCreateName(prefillName ?? query.trim() ?? "")
    setCreateColor(PALETTE[Math.floor(Math.random() * PALETTE.length)])
    setCreateError(null)
    setCreateModalOpen(true)
    setOpen(false)
  }

  const submitCreate = async () => {
    const name = createName.trim()
    if (!name) {
      setCreateError("Digite um nome pra tag.")
      return
    }
    setCreateSubmitting(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/crm/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: createColor, entity_type: entity }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCreateError(json.error?.message ?? json.error ?? `Erro ${res.status}`)
        return
      }
      const created = json.data?.tag ?? json.tag
      if (created) {
        setTags((prev) =>
          prev.find((t) => t.id === created.id) ? prev : [...prev, created],
        )
        addTag(created.name)
      }
      setCreateName("")
      setQuery("")
      setCreateModalOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreateSubmitting(false)
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
                type="button"
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
              if (firstUnselected) addTag(firstUnselected.name)
              else if (query.trim() && !exactMatch) openCreateModal()
            }
            if (e.key === "Backspace" && !query && selected.length > 0) {
              onChange(selected.slice(0, -1))
            }
            if (e.key === "Escape") setOpen(false)
          }}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none border-none bg-transparent text-[12.5px] py-1 placeholder:text-slate-400"
          role="combobox"
          aria-controls={menuId}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={placeholder}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-[8px] shadow-xl z-50 max-h-[280px] overflow-auto"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        >
          {loading && (
            <div className="px-3 py-3 text-[12px] text-slate-400 italic">
              Carregando…
            </div>
          )}
          {!loading && tags.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-slate-400 italic">
              Nenhuma tag criada ainda. Digite e tecle Enter.
            </div>
          )}
          {!loading && tags.length > 0 && filtered.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-slate-400 italic">
              Nenhuma tag encontrada para &quot;{query.trim()}&quot;.
            </div>
          )}
          {filtered.map((t) => {
            const isSelected = selected.includes(t.name)
            return (
            <div
              key={t.id}
              role="presentation"
              className="flex items-center hover:bg-slate-50 group"
            >
              {/* <button> de verdade: é "interactive content", então nenhum
                  <label> ancestral consegue re-despachar o clique em outro
                  controle. type="button" evita submit dentro dos forms. */}
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  isSelected
                    ? onChange(selected.filter((n) => n !== t.name))
                    : addTag(t.name)
                }
                className="flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5 text-left"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: t.color }}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-[12.5px]",
                    isSelected ? "text-slate-900 font-medium" : "text-slate-800",
                  )}
                >
                  {t.name}
                </span>
                {isSelected && (
                  <Check
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: t.color }}
                  />
                )}
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => deleteTagFromOrg(t, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1 mr-2 shrink-0"
                aria-label={`Excluir ${t.name}`}
                title="Excluir tag"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            )
          })}
          {/* Botão "Criar nova tag…" sempre visivel no fim da lista */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openCreateModal(query.trim() || undefined)}
            className="flex w-full items-center gap-2 px-3 py-2 bg-brand-50/40 hover:bg-brand-50 border-t text-left"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            <Plus className="h-3.5 w-3.5 text-brand-600 shrink-0" />
            <span className="text-[12.5px] text-brand-700 font-medium">
              {query.trim() && !exactMatch
                ? `Criar tag "${query.trim()}" …`
                : "Criar nova tag…"}
            </span>
          </button>
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

      {/* Modal de criar tag com escolha de cor */}
      {createModalOpen && (
        <CreateTagModal
          name={createName}
          color={createColor}
          submitting={createSubmitting}
          error={createError}
          onNameChange={setCreateName}
          onColorChange={setCreateColor}
          onCancel={() => {
            setCreateModalOpen(false)
            setCreateError(null)
          }}
          onSubmit={submitCreate}
        />
      )}
    </div>
  )
}

// ── CreateTagModal ──────────────────────────────────────────────────────────

function CreateTagModal({
  name, color, submitting, error,
  onNameChange, onColorChange, onCancel, onSubmit,
}: {
  name: string
  color: string
  submitting: boolean
  error: string | null
  onNameChange: (v: string) => void
  onColorChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/30 backdrop-blur-[1px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[12px] shadow-2xl w-[400px] max-w-[92vw] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
            style={{ background: `${color}14`, color }}
          >
            <TagIcon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-900 m-0 leading-tight">
              Criar tag
            </h2>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              Tags ficam disponíveis pra toda a organização
            </p>
          </div>
        </div>
        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Preview */}
          <div className="flex items-center justify-center py-3">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold border"
              style={{
                background: `${color}14`,
                color,
                borderColor: `${color}33`,
              }}
            >
              {name.trim() || "Pré-visualização"}
            </span>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-[11.5px] font-semibold text-slate-700 mb-1.5">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                // O modal vive dentro do <form> do dialog de deal — sem isso o
                // Enter dispara o submit implícito e cria o deal no meio da
                // criação da tag.
                e.preventDefault()
                if (name.trim()) onSubmit()
              }}
              placeholder="Ex: VIP, Black Friday, Frio..."
              className="w-full h-9 px-3 rounded-[6px] border text-[13px] outline-none focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
              maxLength={60}
            />
          </div>

          {/* Cor */}
          <div>
            <label className="block text-[11.5px] font-semibold text-slate-700 mb-2">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(c)}
                  className={cn(
                    "h-9 w-9 rounded-full border-2 transition-transform flex items-center justify-center",
                    color === c ? "scale-110 border-slate-900" : "border-transparent hover:scale-105",
                  )}
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                >
                  {color === c && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-700">
              ⚠ {error}
            </div>
          )}
        </div>
        {/* Footer */}
        <div
          className="px-5 py-3 border-t border-black/[0.06] flex items-center justify-end gap-2 bg-slate-50/40"
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-9 px-4 rounded-[6px] text-[12.5px] font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!name.trim() || submitting}
            className="h-9 px-4 rounded-[6px] text-[12.5px] font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: name.trim() && !submitting ? color : "#9CA3AF" }}
          >
            <Plus className="h-3.5 w-3.5" />
            {submitting ? "Criando…" : "Criar tag"}
          </button>
        </div>
      </div>
    </div>
  )
}
