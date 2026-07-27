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
import { Layers, Trash2, Check, Plus, Loader2, RefreshCw } from "lucide-react"
import type {
  EmailComponentVariant,
} from "@/types/email-generation"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import { normalizeOutputKey } from "@/lib/agents/shared/component-dimensions"
import { validateSchemaTagCoherence } from "@/lib/email-workspace/schema-tag-coherence"
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
import { VariantTaggerCard } from "./variant-tagger-card"
import { VariantTestCard } from "./variant-test-card"

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
    rendered_html: "",
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
    rendered_html: v.rendered_html ?? "",
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
    rendered_html: draft.rendered_html.trim() || null,
    description: draft.description.trim() || null,
    long_description: draft.long_description.trim() || null,
    when_use: draft.when_use.trim() || null,
    when_not_use: draft.when_not_use.trim() || null,
    copy_guidance: draft.copy_guidance.trim() || null,
    objectives: draft.objectives,
    tones: draft.tones,
    density: draft.density || null,
    product_slots: draft.product_slots,
    // Canoniza a chave técnica no save — destrava rascunhos com chaves em
    // maiúsculo/acento sem obrigar a reeditar campo a campo (o servidor
    // também normaliza, mas garantir aqui melhora o feedback imediato).
    output_schema: draft.output_schema.map((f) => ({
      ...f,
      key: normalizeOutputKey(f.key),
    })),
    slots: csvToArr(draft.slots),
    tags: csvToArr(draft.tags),
    thumbnail: draft.thumbnail.trim() || null,
    is_active: draft.is_active,
  }
}

/** Estado do loop de sincronização da biblioteca (batches de 3). */
interface SyncProgress {
  processed: number
  failed: number
  remaining: number | null
}

export function ComponentsWorkspace() {
  const [variants, setVariants] = useState<EmailComponentVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<string>(FIRST_CATEGORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VariantDraft>(emptyDraft(FIRST_CATEGORY))
  const [saving, setSaving] = useState(false)
  const [sync, setSync] = useState<SyncProgress | null>(null)

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

  // Recarrega sem o flicker do spinner (usado pelo card do taguedor e pelo
  // sync — a lista já está na tela, só atualiza os dados).
  const reloadSilent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/components")
      const json = (await res.json()) as { variants?: EmailComponentVariant[] }
      setVariants(json.variants ?? [])
    } catch {
      /* mantém o estado atual */
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

  // Estado do taguedor na biblioteca (só variantes ativas — espelha a
  // elegibilidade do batch): never = fila de sync; pending = propostas
  // aguardando revisão; noSchema = pendência de curadoria (fora da fila).
  const tagStats = useMemo(() => {
    let never = 0
    let pending = 0
    let noSchema = 0
    for (const v of variants) {
      if (!v.is_active) continue
      const hasSchema = (v.output_schema?.length ?? 0) > 0
      if (v.tagging_status === "pending") pending++
      else if (v.tagging_status == null) {
        if (hasSchema) never++
        else noSchema++
      }
    }
    return { never, pending, noSchema }
  }, [variants])

  async function syncLibrary() {
    setSync({ processed: 0, failed: 0, remaining: null })
    let processed = 0
    let failed = 0
    // Ids que falharam neste loop — excluídos das próximas chamadas pra
    // uma variante quebrada não travar a fila (ordenada por created_at).
    const failedIds: string[] = []
    try {
      for (let i = 0; i < 40; i++) {
        const res = await fetch("/api/admin/components/tag-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 3, exclude_ids: failedIds }),
        })
        const json = (await res.json().catch(() => null)) as {
          error?: string
          processed?: Array<{ id: string; name: string }>
          failed?: Array<{ id: string; name: string; error: string }>
          remaining?: number
        } | null
        if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
        const okCount = json?.processed?.length ?? 0
        const failCount = json?.failed?.length ?? 0
        processed += okCount
        failed += failCount
        for (const f of json?.failed ?? []) failedIds.push(f.id)
        const remaining = json?.remaining ?? 0
        setSync({ processed, failed, remaining })
        void reloadSilent()
        if (remaining <= 0 || (okCount === 0 && failCount === 0)) break
      }
      toast({
        title: "Sincronização concluída",
        description: `${processed} proposta(s) pendente(s) gerada(s)${
          failed > 0 ? ` · ${failed} falha(s) — veja variante a variante` : ""
        }. Revise e aprove na lista.`,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha na sincronização",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setSync(null)
      await reloadSilent()
    }
  }

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
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(err?.error || `Erro ${res.status}`)
      }
      const json = (await res.json()) as {
        variant?: EmailComponentVariant
        data?: { variant?: EmailComponentVariant }
      }
      const saved = json.variant ?? json.data?.variant
      toast({ title: "Variante salva" })
      // Warning NÃO-BLOQUEANTE de coerência schema↔tags do HTML: campo sem
      // {{TAG}} gera copy sem slot no template; tag de copy sem campo fica
      // no fallback tag-registry. Não impede o save (variantes legadas).
      const coherence = validateSchemaTagCoherence(
        payload.html,
        payload.output_schema,
      )
      if (
        coherence.keysWithoutTag.length > 0 ||
        coherence.copyTagsWithoutKey.length > 0
      ) {
        const parts: string[] = []
        if (coherence.keysWithoutTag.length > 0) {
          parts.push(
            `Campos sem {{TAG}} no HTML: ${coherence.keysWithoutTag.join(", ")}`,
          )
        }
        if (coherence.copyTagsWithoutKey.length > 0) {
          parts.push(
            `Tags de copy sem campo no schema: ${coherence.copyTagsWithoutKey.join(", ")}`,
          )
        }
        toast({
          title: "Atenção: schema e HTML não estão 100% alinhados",
          description: parts.join(" · "),
        })
      }
      await load()
      if (saved?.id) setSelectedId(saved.id)
      // Se mudou de seção, acompanha a variante na nova categoria
      if (saved && saved.block_type !== cat) setCat(saved.block_type)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao salvar. Verifique os campos.",
        description: e instanceof Error ? e.message : undefined,
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

      {/* Sync do Taguedor: fila de variantes que nunca passaram pelo agente */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12.5,
            color: C.g500,
            fontFamily: F.sans,
          }}
        >
          {tagStats.never > 0 && (
            <EGBadge tone="neut" dot>
              {tagStats.never} sem sincronizar
            </EGBadge>
          )}
          {tagStats.pending > 0 && (
            <EGBadge tone="warn" dot>
              {tagStats.pending} proposta{tagStats.pending > 1 ? "s" : ""}{" "}
              pendente{tagStats.pending > 1 ? "s" : ""}
            </EGBadge>
          )}
          {tagStats.noSchema > 0 && (
            <EGBadge tone="neut">
              {tagStats.noSchema} sem schema (fora da fila)
            </EGBadge>
          )}
          {!loading &&
            tagStats.never === 0 &&
            tagStats.pending === 0 &&
            tagStats.noSchema === 0 && (
              <span>
                Biblioteca sincronizada — variantes ativas com schema já
                passaram pelo taguedor.
              </span>
            )}
        </div>
        <EGBtn
          variant="secondary"
          onClick={() => void syncLibrary()}
          disabled={sync != null || tagStats.never === 0}
          title="Roda o taguedor nas variantes ativas que nunca passaram por ele (batches de 3). Tudo vira proposta pendente — nada é aprovado sozinho."
        >
          {sync ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {sync
            ? `Sincronizando… ${sync.processed} ok${
                sync.failed > 0 ? ` · ${sync.failed} falhas` : ""
              }${sync.remaining != null ? ` · ${sync.remaining} na fila` : ""}`
            : `Sincronizar biblioteca${
                tagStats.never > 0 ? ` (${tagStats.never})` : ""
              }`}
        </EGBtn>
      </div>

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
                {filtered.map((v) => {
                  // Marcador do taguedor no rail: pendente (revisar) ou fora
                  // de sync (nunca tagueada, com schema, ativa).
                  const tagMark =
                    v.tagging_status === "pending" ? (
                      <span style={{ color: C.warn, fontWeight: 600 }}>
                        tag pendente
                      </span>
                    ) : v.tagging_status == null &&
                      v.is_active &&
                      (v.output_schema?.length ?? 0) > 0 ? (
                      <span>sem sync</span>
                    ) : null
                  return (
                    <EGRailItem
                      key={v.id}
                      active={v.id === selectedId}
                      onClick={() => selectVariant(v)}
                      title={v.name}
                      sub={
                        tagMark ? (
                          <>
                            {tagMark}
                            {v.description ? <> · {v.description}</> : null}
                          </>
                        ) : (
                          v.description ?? undefined
                        )
                      }
                      dot
                      dotColor={v.is_active ? "#10B981" : C.g300}
                    />
                  )
                })}
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
              {selected && (
                <EGBadge
                  tone={
                    selected.tagging_status === "approved"
                      ? "pos"
                      : selected.tagging_status === "pending"
                        ? "warn"
                        : "neut"
                  }
                >
                  {selected.tagging_status === "approved"
                    ? "Tag aprovada"
                    : selected.tagging_status === "pending"
                      ? "Tag pendente"
                      : "Sem tag"}
                </EGBadge>
              )}
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

          {/* Revisão do Taguedor — só para variantes já salvas. key por id:
              trocar de variante remonta (zera edição manual do tagueado). */}
          {selected && (
            <div style={{ marginBottom: 20 }}>
              <VariantTaggerCard
                key={selected.id}
                variant={selected}
                onChanged={reloadSilent}
              />
            </div>
          )}

          <VariantEditor
            draft={draft}
            onChange={setDraft}
            testCard={
              <VariantTestCard
                // key atrelada à variante: remonta (reseta result/briefing) ao
                // trocar de variante ou clicar "Nova" — senão o card mostraria
                // os campos/preview do teste da variante ANTERIOR.
                key={selectedId ?? "new"}
                variantId={selectedId}
                html={draft.html}
                schema={draft.output_schema}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
