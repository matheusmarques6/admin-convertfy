"use client"

/**
 * Área "Schema × HTML" — a relação entre campos e {{TAGS}}, à vista e editável.
 *
 * O schema é a base: o endereço de um campo no HTML é {{MAIÚSCULA_DA_KEY}}, e
 * nada mais. Uma variante podia declarar `hero_headline`/`hero_subhead` no
 * schema e carregar `{{HERO_EYEBROW}}`/`{{COUPON_CODE}}` no HTML por meses —
 * a copy voltava do n8n sem endereço e o placeholder cru chegava ao email.
 *
 * Aqui as duas colunas ficam lado a lado, uma linha por relação, com os três
 * estados possíveis (ancorado · campo sem tag · tag sem campo) e um conserto
 * possível em cada linha. Toda ação escreve nos DOIS lados de uma vez, para
 * que não exista um jeito de salvar algo desalinhado sem querer:
 *
 *   renomear key   → troca a key no schema E o {{PLACEHOLDER}} no HTML
 *   ancorar campo  → renomeia a tag escolhida do HTML para o placeholder
 *   criar campo    → adiciona ao schema o campo que a tag órfã pedia
 *   renomear tag   → conserto de nome direto no HTML (tags órfãs)
 *
 * Não bloqueia salvar: a biblioteca tem variantes legadas, e travar o save
 * travaria justamente o conserto delas.
 */

import { useMemo, useState } from "react"
import { AlertTriangle, Check, Link2, Plus, Trash2 } from "lucide-react"

import {
  auditSchemaTags,
  renameTagInHtml,
} from "@/lib/email-workspace/schema-tag-coherence"
import {
  deriveFieldNature,
  FIELD_NATURE_LABELS_PT,
  FIELD_TYPE_LABELS_PT,
  placeholderForKey,
  sanitizeOutputKeyInput,
  type ComponentFieldType,
} from "@/lib/agents/shared/component-dimensions"
import type { ComponentOutputField } from "@/types/email-generation"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import {
  EGBadge,
  EGBtn,
  EGCard,
  EGInput,
  EGSelect,
  type EGBadgeTone,
} from "@/components/email-generation/ui/eg-atoms"

/** Tag de imagem pelo nome — usado ao criar campo a partir de tag órfã. */
function guessTypeFromTag(tag: string): ComponentFieldType {
  return /(?:IMAGE|IMG|THUMB|PHOTO|ICON|LOGO)(?:_\d+)?$/.test(tag)
    ? "image"
    : "text_short"
}

const mono: React.CSSProperties = {
  fontFamily: F.mono,
  fontSize: 11.5,
  whiteSpace: "nowrap",
}

const cell: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: `1px solid ${C.g200}`,
  verticalAlign: "middle",
}

const th: React.CSSProperties = {
  ...cell,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: C.g500,
  textAlign: "left",
  borderBottom: `1px solid ${C.g300}`,
}

type RowKind = "anchored" | "missing" | "orphan"

const ROW_BADGE: Record<RowKind, { tone: EGBadgeTone; label: string }> = {
  anchored: { tone: "pos", label: "ancorado" },
  missing: { tone: "neg", label: "sem tag" },
  orphan: { tone: "warn", label: "sem campo" },
}

interface Row {
  kind: RowKind
  /** Índice no output_schema (linhas de campo). */
  idx?: number
  field?: ComponentOutputField
  /** Placeholder canônico do campo, ou a tag órfã. */
  tag: string
  legacyTag?: string | null
  orphanKind?: "copy" | "desconhecida"
}

export function SchemaTagAuditPanel({
  html,
  schema,
  onChangeHtml,
  onChangeSchema,
  /** HTML tagueado aprovado, quando existir — é ele que roda em produção. */
  approvedTaggedHtml,
}: {
  html: string
  schema: ComponentOutputField[]
  onChangeHtml: (html: string) => void
  onChangeSchema: (schema: ComponentOutputField[]) => void
  approvedTaggedHtml?: string | null
}) {
  const [draftKeys, setDraftKeys] = useState<Record<number, string>>({})
  const [draftTags, setDraftTags] = useState<Record<string, string>>({})

  const audit = useMemo(() => auditSchemaTags(html, schema), [html, schema])

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map(
      schema.map((f, i) => [f.key.trim(), { f, i }] as const),
    )
    const missing: Row[] = audit.missing.map((m) => ({
      kind: "missing" as const,
      idx: byKey.get(m.key)?.i,
      field: byKey.get(m.key)?.f,
      tag: m.placeholder,
      legacyTag: m.legacyTag,
    }))
    const orphans: Row[] = audit.orphans.map((o) => ({
      kind: "orphan" as const,
      tag: o.tag,
      orphanKind: o.kind,
    }))
    const anchored: Row[] = audit.anchored.map((a) => ({
      kind: "anchored" as const,
      idx: byKey.get(a.key)?.i,
      field: byKey.get(a.key)?.f,
      tag: a.placeholder,
    }))
    // Problemas primeiro: é o que precisa de ação.
    return [...missing, ...orphans, ...anchored]
  }, [audit, schema])

  // ── Ações ───────────────────────────────────────────────────────────

  /** Renomeia a key no schema E o placeholder no HTML, de uma vez. */
  function commitKey(idx: number) {
    const raw = draftKeys[idx]
    setDraftKeys((d) => {
      const next = { ...d }
      delete next[idx]
      return next
    })
    const nextKey = sanitizeOutputKeyInput(raw ?? "").trim()
    const prevKey = schema[idx]?.key?.trim() ?? ""
    if (!nextKey || nextKey === prevKey) return
    // Colisão com outro campo: não aplica (dois campos no mesmo endereço
    // fariam a copy de um sobrescrever a do outro).
    if (schema.some((f, i) => i !== idx && f.key.trim() === nextKey)) return

    onChangeSchema(
      schema.map((f, i) => (i === idx ? { ...f, key: nextKey } : f)),
    )
    const from = placeholderForKey(prevKey)
    const to = placeholderForKey(nextKey)
    if (from && to && html.includes(`{{${from}}}`)) {
      onChangeHtml(renameTagInHtml(html, from, to))
    }
  }

  /** Ancora um campo sem tag numa tag existente do HTML (renomeia a tag). */
  function bindTag(fieldIdx: number, tagFrom: string) {
    const key = schema[fieldIdx]?.key?.trim()
    const to = placeholderForKey(key ?? "")
    if (!tagFrom || !to) return
    onChangeHtml(renameTagInHtml(html, tagFrom, to))
  }

  /** Cria no schema o campo que a tag órfã estava pedindo. */
  function createFieldForTag(tag: string) {
    const key = sanitizeOutputKeyInput(tag.toLowerCase())
    if (!key || schema.some((f) => f.key.trim() === key)) return
    const type = guessTypeFromTag(tag)
    onChangeSchema([
      ...schema,
      {
        key,
        label: tag
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        type,
        max_len: type === "text_short" ? 60 : 0,
        required: false,
        example: "",
        guidance: "",
      },
    ])
  }

  function removeField(idx: number) {
    onChangeSchema(schema.filter((_, i) => i !== idx))
  }

  /** Renomeia livremente uma tag órfã no HTML (conserto de nome). */
  function commitTag(from: string) {
    const raw = draftTags[from]
    setDraftTags((d) => {
      const next = { ...d }
      delete next[from]
      return next
    })
    const to = placeholderForKey(raw ?? "")
    if (!to || to === from) return
    onChangeHtml(renameTagInHtml(html, from, to))
  }

  // ── Render ──────────────────────────────────────────────────────────

  const missingCount = audit.missing.length
  const orphanCount = audit.orphans.length
  const problems = missingCount + orphanCount

  // Opções de âncora para um campo sem tag: as tags órfãs do HTML.
  const orphanOptions = audit.orphans.map((o) => ({
    value: o.tag,
    label: `{{${o.tag}}}`,
  }))

  const taggedAudit =
    approvedTaggedHtml && approvedTaggedHtml.trim()
      ? auditSchemaTags(approvedTaggedHtml, schema)
      : null

  return (
    <EGCard
      title="Schema × HTML"
      right={
        problems === 0 ? (
          <EGBadge tone="pos" dot>
            alinhado
          </EGBadge>
        ) : (
          <EGBadge tone="neg" dot>
            {problems} {problems === 1 ? "problema" : "problemas"}
          </EGBadge>
        )
      }
    >
      <p
        style={{
          fontSize: 12,
          color: C.g500,
          margin: "0 0 4px",
          lineHeight: 1.6,
        }}
      >
        O schema é a base: cada campo endereça{" "}
        <span style={mono}>{"{{MAIÚSCULA_DA_KEY}}"}</span> no HTML — sem
        apelido, sem tradução. É esse endereço que o blueprint manda ao n8n e
        que o merge procura para montar o email.
      </p>
      <p
        style={{
          fontSize: 11.5,
          color: C.g400,
          margin: "0 0 14px",
          lineHeight: 1.6,
        }}
      >
        {audit.anchored.length} ancorado(s) · {missingCount} campo(s) sem tag ·{" "}
        {orphanCount} tag(s) sem campo. Toda ação aqui escreve nos dois lados:
        renomear uma key troca também o placeholder no HTML.
      </p>

      {taggedAudit && !taggedAudit.ok && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontSize: 12,
            lineHeight: 1.6,
            color: C.warn,
            background: C.warnBg,
            border: `1px solid ${C.warnBorder}`,
            borderRadius: 5,
            padding: "8px 10px",
            marginBottom: 14,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Em produção esta variante usa o <strong>HTML tagueado aprovado</strong>
            , e ele também está desalinhado ({taggedAudit.missing.length} campo(s)
            sem tag, {taggedAudit.orphans.length} tag(s) sem campo). Consertar
            aqui arruma o HTML de origem — para o tagueado valer, rode o Taguedor
            de novo e aprove a proposta.
          </span>
        </div>
      )}

      {schema.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.g500 }}>
          Esta variante não tem schema. Sem campos declarados não há o que
          endereçar — a copy do n8n não tem onde entrar.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 96 }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: 128 }} />
              <col style={{ width: "26%" }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Estado</th>
                <th style={th}>Campo (key)</th>
                <th style={th}>Natureza</th>
                <th style={th}>Tag no HTML</th>
                <th style={th}>Conserto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = ROW_BADGE[r.kind]
                const rowBg =
                  r.kind === "missing"
                    ? C.negBg
                    : r.kind === "orphan"
                      ? C.warnBg
                      : undefined
                return (
                  <tr
                    key={`${r.kind}:${r.tag}:${r.idx ?? "x"}`}
                    style={{ background: rowBg }}
                  >
                    <td style={cell}>
                      <EGBadge tone={badge.tone}>{badge.label}</EGBadge>
                    </td>

                    {/* Campo — editável nas linhas que têm campo */}
                    <td style={cell}>
                      {r.field && r.idx != null ? (
                        <EGInput
                          mono
                          value={draftKeys[r.idx] ?? r.field.key}
                          onChange={(v) =>
                            setDraftKeys((d) => ({ ...d, [r.idx!]: v }))
                          }
                          title="Renomear troca a key no schema e o placeholder no HTML"
                          style={{ height: 30, fontSize: 12 }}
                        />
                      ) : (
                        <span style={{ ...mono, color: C.g400 }}>
                          — nenhum campo —
                        </span>
                      )}
                      {r.field && r.idx != null && draftKeys[r.idx] != null && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <EGBtn
                            variant="dark"
                            onClick={() => commitKey(r.idx!)}
                            style={{ height: 26, fontSize: 11.5 }}
                          >
                            Aplicar
                          </EGBtn>
                          <EGBtn
                            onClick={() =>
                              setDraftKeys((d) => {
                                const n = { ...d }
                                delete n[r.idx!]
                                return n
                              })
                            }
                            style={{ height: 26, fontSize: 11.5 }}
                          >
                            Cancelar
                          </EGBtn>
                        </div>
                      )}
                    </td>

                    <td style={{ ...cell, fontSize: 11.5, color: C.g600 }}>
                      {r.field ? (
                        <>
                          {FIELD_NATURE_LABELS_PT[deriveFieldNature(r.field)]}
                          <div style={{ color: C.g400, fontSize: 10.5 }}>
                            {FIELD_TYPE_LABELS_PT[r.field.type]}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: C.g400 }}>
                          {r.orphanKind === "copy"
                            ? "tag de copy"
                            : "fora do registry"}
                        </span>
                      )}
                    </td>

                    {/* Tag — derivada nas linhas de campo, editável nas órfãs */}
                    <td style={cell}>
                      {r.kind === "orphan" ? (
                        <>
                          <EGInput
                            mono
                            value={draftTags[r.tag] ?? r.tag}
                            onChange={(v) =>
                              setDraftTags((d) => ({ ...d, [r.tag]: v }))
                            }
                            title="Renomear a tag diretamente no HTML"
                            style={{ height: 30, fontSize: 12 }}
                          />
                          {draftTags[r.tag] != null && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <EGBtn
                                variant="dark"
                                onClick={() => commitTag(r.tag)}
                                style={{ height: 26, fontSize: 11.5 }}
                              >
                                Aplicar
                              </EGBtn>
                              <EGBtn
                                onClick={() =>
                                  setDraftTags((d) => {
                                    const n = { ...d }
                                    delete n[r.tag]
                                    return n
                                  })
                                }
                                style={{ height: 26, fontSize: 11.5 }}
                              >
                                Cancelar
                              </EGBtn>
                            </div>
                          )}
                        </>
                      ) : (
                        <span
                          style={{
                            ...mono,
                            color: r.kind === "missing" ? C.neg : C.g700,
                          }}
                          title="Derivado da key — o endereço não se escolhe"
                        >
                          {`{{${r.tag}}}`}
                        </span>
                      )}
                    </td>

                    {/* Conserto */}
                    <td style={{ ...cell, fontSize: 11.5 }}>
                      {r.kind === "anchored" && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            color: C.pos,
                          }}
                        >
                          <Check size={13} /> campo e HTML no mesmo endereço
                        </span>
                      )}

                      {r.kind === "missing" && r.idx != null && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          {r.legacyTag && (
                            <EGBtn
                              variant="dark"
                              onClick={() => bindTag(r.idx!, r.legacyTag!)}
                              title={`Renomeia {{${r.legacyTag}}} para {{${r.tag}}} no HTML`}
                              style={{ height: 28, fontSize: 11.5 }}
                            >
                              <Link2 size={12} /> {`{{${r.legacyTag}}}`} →{" "}
                              {`{{${r.tag}}}`}
                            </EGBtn>
                          )}
                          {orphanOptions.length > 0 && (
                            <div style={{ minWidth: 190 }}>
                              <EGSelect
                                value=""
                                placeholder="ancorar numa tag do HTML…"
                                options={orphanOptions}
                                onChange={(v) => v && bindTag(r.idx!, v)}
                              />
                            </div>
                          )}
                          {!r.legacyTag && orphanOptions.length === 0 && (
                            <span style={{ color: C.neg }}>
                              O HTML não tem nenhuma tag livre. Rode o Taguedor
                              ou insira {`{{${r.tag}}}`} no HTML à mão.
                            </span>
                          )}
                          <EGBtn
                            variant="danger"
                            onClick={() => removeField(r.idx!)}
                            title="Remove o campo do schema"
                            style={{ height: 28, fontSize: 11.5 }}
                          >
                            <Trash2 size={12} /> remover campo
                          </EGBtn>
                        </div>
                      )}

                      {r.kind === "orphan" && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <EGBtn
                            variant="dark"
                            onClick={() => createFieldForTag(r.tag)}
                            title={`Cria o campo ${r.tag.toLowerCase()} no schema`}
                            style={{ height: 28, fontSize: 11.5 }}
                          >
                            <Plus size={12} /> criar campo{" "}
                            <span style={mono}>{r.tag.toLowerCase()}</span>
                          </EGBtn>
                          <span style={{ color: C.warn }}>
                            ou renomeie a tag ao lado para o endereço de um
                            campo existente.
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </EGCard>
  )
}
