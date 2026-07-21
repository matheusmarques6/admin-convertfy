"use client"

/**
 * Aba Componentes do hub de Geração de Emails (maquete EG).
 *
 * Biblioteca de variantes por seção: pills de categoria com contador, rail de
 * variantes (dot ativo/inativo + descrição curta) e editor completo
 * (VariantEditor). As variantes são o acervo que o Curador escolhe por bloco
 * com base nas dimensões de matching (objectives/tones/density).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Layers, Trash2, Check, Plus, Loader2 } from "lucide-react"
import type {
  EmailComponentVariant,
} from "@/types/email-generation"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import { toast } from "@/lib/hooks/use-toast"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import {
  EGBadge,
  EGBtn,
  EGCatPills,
  EGRailItem,
  EGSecTitle,
} from "@/components/email-generation/ui/eg-atoms"
import { VariantEditor, type VariantDraft } from "./variant-editor"

const FIRST_CATEGORY = COMPONENT_CATEGORIES[0].key

const csvToArr = (s: string): string[] =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
const arrToCsv = (a: string[] | null | undefined): string => (a ?? []).join(", ")

function emptyDraft(blockType: string): VariantDraft {
  return {
    block_type: blockType,
    name: "",
    html: "",
    description: "",
    long_description: "",
    when_use: "",
    when_not_use: "",
    copy_guidance: "",
    objectives: [],
    tones: [],
    density: "",
    product_slots: 0,
    output_schema: [],
    slots: "",
    tags: "",
    thumbnail: "",
    is_active: true,
  }
}

function draftFromVariant(v: EmailComponentVariant): VariantDraft {
  return {
    block_type: v.block_type,
    name: v.name,
    html: v.html,
    description: v.description ?? "",
    long_description: v.long_description ?? "",
    when_use: v.when_use ?? "",
    when_not_use: v.when_not_use ?? "",
    copy_guidance: v.copy_guidance ?? "",
    objectives: v.objectives ?? [],
    tones: v.tones ?? [],
    density: v.density ?? "",
    product_slots: v.product_slots ?? 0,
    output_schema: v.output_schema ?? [],
    slots: arrToCsv(v.slots),
    tags: arrToCsv(v.tags),
    thumbnail: v.thumbnail ?? "",
    is_active: v.is_active,
  }
}

function payloadFromDraft(draft: VariantDraft) {
  return {
    block_type: draft.block_type,
    name: draft.name,
    html: draft.html,
    description: draft.description.trim() || null,
    long_description: draft.long_description.trim() || null,
    when_use: draft.when_use.trim() || null,
    when_not_use: draft.when_not_use.trim() || null,
    copy_guidance: draft.copy_guidance.trim() || null,
    objectives: draft.objectives,
    tones: draft.tones,
    density: draft.density || null,
    product_slots: draft.product_slots,
    output_schema: draft.output_schema,
    slots: csvToArr(draft.slots),
    tags: csvToArr(draft.tags),
    thumbnail: draft.thumbnail.trim() || null,
    is_active: draft.is_active,
  }
}

export function ComponentsWorkspace() {
  const [variants, setVariants] = useState<EmailComponentVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<string>(FIRST_CATEGORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VariantDraft>(emptyDraft(FIRST_CATEGORY))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/components")
      const json = (await res.json()) as { variants?: EmailComponentVariant[] }
      setVariants(json.variants ?? [])
    } catch {
      toast({ variant: "destructive", title: "Falha ao carregar componentes" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const countByCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of variants) m[v.block_type] = (m[v.block_type] ?? 0) + 1
    return m
  }, [variants])

  const filtered = useMemo(
    () => variants.filter((v) => v.block_type === cat),
    [variants, cat],
  )

  const selected = selectedId
    ? variants.find((v) => v.id === selectedId) ?? null
    : null

  function pickCat(key: string) {
    setCat(key)
    setSelectedId(null)
    setDraft(emptyDraft(key))
  }

  function selectVariant(v: EmailComponentVariant) {
    setSelectedId(v.id)
    setDraft(draftFromVariant(v))
  }

  function startNew() {
    setSelectedId(null)
    setDraft(emptyDraft(cat))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = payloadFromDraft(draft)
      const res = selectedId
        ? await fetch(`/api/admin/components/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/components", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as {
        variant?: EmailComponentVariant
        data?: { variant?: EmailComponentVariant }
      }
      const saved = json.variant ?? json.data?.variant
      toast({ title: "Variante salva" })
      await load()
      if (saved?.id) setSelectedId(saved.id)
      // Se mudou de seção, acompanha a variante na nova categoria
      if (saved && saved.block_type !== cat) setCat(saved.block_type)
    } catch {
      toast({
        variant: "destructive",
        title: "Falha ao salvar. Verifique os campos.",
      })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selectedId) return
    if (!confirm("Excluir esta variante da biblioteca?")) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/components/${selectedId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(String(res.status))
      toast({ title: "Variante excluída" })
      startNew()
      await load()
    } catch {
      toast({ variant: "destructive", title: "Falha ao excluir" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <EGSecTitle
        icon={<Layers size={18} />}
        title="Email / Componentes"
        sub="Acervo de variantes por tipo de bloco. O agente escolhe a melhor para cada loja com base nas dimensões de matching."
      />

      <EGCatPills
        items={COMPONENT_CATEGORIES.map((c) => ({
          key: c.key,
          label: c.label,
          count: countByCat[c.key] ?? 0,
        }))}
        value={cat}
        onChange={pickCat}
      />

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 18,
          alignItems: "flex-start",
        }}
      >
        {/* rail de variantes */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={startNew}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              height: 38,
              borderRadius: 9,
              border: `1px dashed ${C.blue100}`,
              background: C.blue50,
              color: C.brand,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: F.sans,
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Nova variante
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loading ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: 20,
                  color: C.g400,
                }}
              >
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : (
              <>
                {filtered.map((v) => (
                  <EGRailItem
                    key={v.id}
                    active={v.id === selectedId}
                    onClick={() => selectVariant(v)}
                    title={v.name}
                    sub={v.description ?? undefined}
                    dot
                    dotColor={v.is_active ? "#10B981" : C.g300}
                  />
                ))}
                {filtered.length === 0 && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.g400,
                      fontFamily: F.sans,
                      textAlign: "center",
                      padding: 20,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 9,
                    }}
                  >
                    Nenhuma variante nesta categoria ainda.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.g900,
                  fontFamily: F.sans,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selected ? "Editar variante" : "Nova variante"}
              </span>
              <EGBadge tone={draft.is_active ? "pos" : "neut"} dot>
                {draft.is_active ? "Ativo" : "Inativo"}
              </EGBadge>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {selected && (
                <EGBtn
                  variant="danger"
                  onClick={() => void remove()}
                  disabled={saving}
                >
                  <Trash2 size={15} /> Deletar
                </EGBtn>
              )}
              <EGBtn
                variant="dark"
                onClick={() => void save()}
                disabled={saving || !draft.name || !draft.html}
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Salvar
              </EGBtn>
            </div>
          </div>

          <VariantEditor draft={draft} onChange={setDraft} />
        </div>
      </div>
    </div>
  )
}
