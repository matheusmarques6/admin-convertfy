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
import { normalizeOutputKey } from "@/lib/agents/shared/component-dimensions"
import {
  auditImageAnchors,
  auditOrphanText,
  auditSchemaAnchors,
} from "@/lib/email-workspace/schema-example-coherence"
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
import { VariantTestCard } from "./variant-test-card"

const FIRST_CATEGORY = COMPONENT_CATEGORIES[0].key

/**
 * "Texto que nenhum campo escreve" — a auditoria INVERSA, ao vivo.
 *
 * A outra auditoria pergunta se todo campo do schema acha seu lugar no HTML.
 * Esta pergunta o contrário, e é a que faltava: em 28/08 a variante
 * "produtos 5" tinha os 17 campos ancorando perfeitamente e três selos
 * escritos à mão no HTML ("SELO 1 / OFF 1") que nenhum campo endereçava —
 * sem contrato, o trecho não vai ao n8n, não volta como copy e nenhum agente
 * tem alçada para tocá-lo: sai no email do cliente como está.
 *
 * Descobrir aqui custa zero; descobrir no email custou uma geração paga.
 */
function TextoOrfaoPanel({ draft }: { draft: VariantDraft }) {
  const { trechos } = useMemo(
    () => auditOrphanText(draft.html || "", draft.output_schema),
    [draft.html, draft.output_schema],
  )
  const suspeitos = trechos.filter((t) => t.suspeito)
  if (trechos.length === 0) return null

  return (
    <div
      style={{
        border: `1px solid ${suspeitos.length > 0 ? C.warnBorder : C.border}`,
        background: suspeitos.length > 0 ? C.warnBg : C.g25,
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily: F.sans,
          fontSize: 12,
          fontWeight: 600,
          color: C.g800,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Texto que nenhum campo escreve
        <EGBadge tone={suspeitos.length > 0 ? "warn" : "neut"}>
          {trechos.length}
        </EGBadge>
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 11.5, color: C.g500, marginBottom: 8, lineHeight: 1.45 }}>
        Sai no email exatamente como está no HTML — o n8n nem fica sabendo que
        existe. Em <b>âmbar</b>, texto com cara de exemplo da biblioteca:
        cadastre um campo no schema com esse trecho no <i>example</i>.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {trechos.slice(0, 30).map((t, i) => (
          <span
            key={`${t.range.start}-${i}`}
            title={t.suspeito ? "Parece texto de exemplo da biblioteca" : "Texto fixo — confirme se é proposital"}
            style={{
              fontFamily: F.mono,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${t.suspeito ? C.warnBorder : C.border}`,
              background: t.suspeito ? C.white : C.g50,
              color: t.suspeito ? C.warn : C.g500,
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.texto}
          </span>
        ))}
        {trechos.length > 30 && (
          <span style={{ fontFamily: F.sans, fontSize: 11.5, color: C.g500 }}>
            +{trechos.length - 30}
          </span>
        )}
      </div>
    </div>
  )
}

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
    design_system: "",
    photo_direction: "",
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
    rendered_html_source_sha: v.rendered_html_source_sha ?? null,
    rendered_status: (v as { rendered_status?: { stale?: boolean | null } }).rendered_status ?? null,
    description: v.description ?? "",
    long_description: v.long_description ?? "",
    when_use: v.when_use ?? "",
    when_not_use: v.when_not_use ?? "",
    copy_guidance: v.copy_guidance ?? "",
    design_system: v.design_system ?? "",
    photo_direction: v.photo_direction ?? "",
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
    design_system: draft.design_system.trim() || null,
    photo_direction: draft.photo_direction.trim() || null,
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


  // Fontes para "copiar campos de…" no editor de schema. Só o necessário —
  // a lista inteira já está carregada, então não custa uma requisição.
  const schemaSources = useMemo(
    () =>
      variants.map((v) => ({
        id: v.id,
        name: v.name,
        block_type: v.block_type,
        output_schema: v.output_schema ?? null,
      })),
    [variants],
  )

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
    // Campo sem chave técnica é barrado pelo servidor com "Dados inválidos"
    // e nenhuma pista de QUAL campo — inútil numa lista de dez. Como o campo
    // novo agora nasce com a chave vazia (era "novo_campo", que passava na
    // validação e virava lixo no schema), o aviso preciso tem de vir daqui.
    const semChave = draft.output_schema.filter((f) => !f.key?.trim()).length
    if (semChave > 0) {
      toast({
        variant: "destructive",
        title: `${semChave} campo(s) sem chave técnica`,
        description:
          "Preencha a chave (ex.: hero_headline) ou remova o campo — é ela que endereça o {{PLACEHOLDER}} no HTML.",
      })
      return
    }
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
      // O EXAMPLE é a âncora (20/08): cada campo de texto é encontrado no
      // HTML pela frase do example, e cada imagem gerada pelo token de
      // atributo — a MESMA régua do merge em produção. Desalinhamento NÃO
      // impede o save (travar aqui travaria o conserto das variantes), mas
      // o toast grita: campo sem âncora vira sem_lugar em toda geração.
      const textAudit = auditSchemaAnchors(payload.html, payload.output_schema)
      const imageAudit = auditImageAnchors(payload.html, payload.output_schema)
      const parts: string[] = []
      if (textAudit.missing.length > 0) {
        parts.push(
          `${textAudit.missing.length} campo(s) cujo example não é encontrável no HTML: ${textAudit.missing.map((m) => m.key).join(", ")}`,
        )
      }
      if (imageAudit.missing.length > 0) {
        parts.push(
          `${imageAudit.missing.length} slot(s) de imagem sem token casável: ${imageAudit.missing.map((m) => m.key).join(", ")}`,
        )
      }
      // A direção inversa: texto no HTML que nenhum campo endereça. Só o
      // SUSPEITO grita (rodapé tem texto fixo legítimo, e cobrar por ele
      // faria o aviso virar ruído até ninguém mais ler).
      const orfaos = auditOrphanText(
        payload.html,
        payload.output_schema,
      ).trechos.filter((t) => t.suspeito)
      if (orfaos.length > 0) {
        parts.push(
          `${orfaos.length} trecho(s) de exemplo que nenhum campo escreve: ${orfaos
            .slice(0, 4)
            .map((t) => `"${t.texto}"`)
            .join(", ")}`,
        )
      }
      if (parts.length > 0) {
        toast({
          variant: "destructive",
          title: "Salva, mas o schema não ancora no HTML",
          description: `${parts.join(" · ")}. Ajuste o example (texto) ou o token src/alt (imagem) para casar com o HTML.`,
        })
      } else {
        toast({ title: "Variante salva" })
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

          <TextoOrfaoPanel draft={draft} />

          <VariantEditor
            draft={draft}
            onChange={setDraft}
            schemaSources={schemaSources}
            selfId={selected?.id ?? null}
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
