"use client"

/**
 * Área "Schema × HTML" — a relação entre campos e {{TAGS}}, à vista e editável.
 *
 * O schema é a base: o endereço de um campo no HTML é {{MAIÚSCULA_DA_KEY}}, e
 * nada mais. Uma variante podia declarar `hero_headline`/`hero_subhead` no
 * schema e carregar `{{HERO_EYEBROW}}`/`{{COUPON_CODE}}` no HTML por meses —
 * a copy voltava do n8n sem endereço e o placeholder cru chegava ao email.
 *
 * Uma linha por relação, três estados (ancorado · campo sem tag · tag sem
 * campo) e UMA ação por linha — a coluna "O que fazer". A tela tinha virado
 * um mural de botões onde nem escolher entre dois caminhos dava; agora o
 * caminho é escolhido por `primaryAction`, na ordem do custo:
 *
 *   tag existe com outro nome  → Renomear tag
 *   frase do exemplo no HTML   → Ancorar pelo exemplo
 *   nem uma nem outra          → Remover campo (a arte não tem o elemento)
 *   tag sem campo no schema    → Criar campo
 *
 * Tag sem campo tem DUAS saídas legítimas e o código não tem como adivinhar
 * a intenção: virar campo no schema, ou sumir do HTML. As duas ficam na
 * linha — "Criar campo" em botão, "apagar a tag" em link.
 *
 * Alternativas, diagnóstico (natureza, trecho do documento) e ajuste fino
 * ficam atrás de "Avançado", fechado por padrão.
 *
 * Este painel opera sobre o `html` — o único documento. A camada tagueada
 * (`html_tagged` + proposta + aprovação) foi removida da biblioteca: era um
 * segundo documento sobre o mesmo assunto e ninguém conseguia dizer qual
 * estava vendo. Não bloqueia salvar.
 */

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"

import {
  anchorByExample,
  auditSchemaTags,
  renameTagInHtml,
} from "@/lib/email-workspace/schema-tag-coherence"
import { tagContext } from "@/lib/email-workspace/tag-context"
import {
  deriveFieldNature,
  FIELD_NATURES,
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

/** Onde a tag está no documento — ou por que não está. */
function TagWhere({
  kind,
  tag,
  html,
}: {
  kind: RowKind
  tag: string
  html: string
}) {
  const ctx = useMemo(() => tagContext(html, tag), [html, tag])

  if (kind === "missing") {
    return (
      <div style={{ fontSize: 10.5, color: C.neg, marginTop: 4, lineHeight: 1.4 }}>
        não está no HTML — este endereço vem da key, não do documento
      </div>
    )
  }
  if (!ctx) return null
  return (
    <div style={{ fontSize: 10.5, color: C.g500, marginTop: 4, lineHeight: 1.4 }}>
      <span style={{ opacity: 0.75 }}>…{ctx.before} </span>
      <span style={{ ...mono, fontSize: 10, color: C.g700 }}>[tag]</span>
      <span style={{ opacity: 0.75 }}> {ctx.after}…</span>
      {ctx.repeated && (
        <div style={{ color: C.warn, marginTop: 2 }}>
          aparece mais de uma vez — a copy é escrita em todas
        </div>
      )}
    </div>
  )
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
  /** Frase do exemplo achada no HTML — o caminho de âncora sem tag. */
  examplePhrase?: string | null
  orphanKind?: "copy" | "desconhecida"
}

export function SchemaTagAuditPanel({
  html,
  schema,
  onChangeHtml,
  onChangeSchema,
}: {
  html: string
  schema: ComponentOutputField[]
  onChangeHtml: (html: string) => void
  onChangeSchema: (schema: ComponentOutputField[]) => void
}) {
  const [draftKeys, setDraftKeys] = useState<Record<number, string>>({})
  const [draftTags, setDraftTags] = useState<Record<string, string>>({})
  // Modo simples por padrão: UMA ação por linha e mais nada. Alternativas,
  // diagnóstico e ajuste fino ficam atrás daqui.
  const [avancado, setAvancado] = useState(false)

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
      examplePhrase: m.examplePhrase,
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
    if (!from || !to) return
    if (html.includes(`{{${from}}}`)) onChangeHtml(renameTagInHtml(html, from, to))
  }

  /** Apaga a tag do HTML — para a tag que ninguém preenche. */
  function removeTag(tag: string) {
    onChangeHtml(
      html.replace(
        new RegExp(`\\{\\{\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
        "",
      ),
    )
  }

  /** Ancora um campo sem tag numa tag existente do HTML (renomeia a tag). */
  function bindTag(fieldIdx: number, tagFrom: string) {
    const key = schema[fieldIdx]?.key?.trim()
    const to = placeholderForKey(key ?? "")
    if (!tagFrom || !to) return
    onChangeHtml(renameTagInHtml(html, tagFrom, to))
  }

  /**
   * Ancora pelo EXEMPLO: troca a frase real do HTML pelo `{{PLACEHOLDER}}`
   * do campo. É a saída para o campo que não tem nenhuma tag para renomear —
   * e é o caminho normal numa variante recém-colada, onde o HTML ainda é o
   * exemplo pronto e não existe placeholder nenhum.
   */
  function anchorFieldByExample(fieldIdx: number, phrase: string) {
    const key = schema[fieldIdx]?.key?.trim()
    const to = placeholderForKey(key ?? "")
    if (!phrase || !to) return
    onChangeHtml(anchorByExample(html, phrase, to))
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

  /**
   * A ÚNICA ação que a linha oferece no modo simples.
   *
   * A ordem é a do custo: renomear a tag que já existe no lugar certo é o
   * conserto mais barato e mais seguro; trocar a frase do exemplo vem depois;
   * e quando não há nem tag nem frase, a arte não tem onde receber o campo —
   * aí a ação honesta é tirar o campo do schema, não fingir que há conserto.
   */
  function primaryAction(r: Row): {
    label: string
    tone: "dark" | "secondary" | "danger"
    title: string
    hint?: string
    run: () => void
  } | null {
    if (r.kind === "anchored") return null

    if (r.kind === "orphan") {
      return {
        label: "Criar campo",
        tone: "dark",
        title: `Adiciona ao schema o campo que {{${r.tag}}} está pedindo`,
        hint: "o HTML escreve aqui, mas schema nenhum declara o campo",
        run: () => createFieldForTag(r.tag),
      }
    }

    if (r.idx == null) return null

    if (r.legacyTag) {
      return {
        label: "Renomear tag",
        tone: "dark",
        title: `Renomeia {{${r.legacyTag}}} para {{${r.tag}}} no HTML`,
        hint: `o slot existe com outro nome: {{${r.legacyTag}}}`,
        run: () => bindTag(r.idx!, r.legacyTag!),
      }
    }

    if (r.examplePhrase) {
      return {
        label: "Ancorar pelo exemplo",
        tone: "dark",
        title: `Troca “${r.examplePhrase}” por {{${r.tag}}} no HTML`,
        hint: `a frase “${r.examplePhrase}” está no HTML`,
        run: () => anchorFieldByExample(r.idx!, r.examplePhrase!),
      }
    }

    return {
      label: "Remover campo",
      tone: "danger",
      title: "Tira o campo do schema — a arte não tem onde recebê-lo",
      hint: "sem tag e sem a frase do exemplo: a arte não tem esse elemento",
      run: () => removeField(r.idx!),
    }
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "0 0 12px",
          fontSize: 12,
          color: C.g500,
          fontFamily: F.sans,
        }}
      >
        <span>
          {audit.anchored.length} ancorado(s) · {missingCount} sem tag ·{" "}
          {orphanCount} tag(s) sem campo
        </span>
        <button
          type="button"
          onClick={() => setAvancado((v) => !v)}
          style={{
            marginLeft: "auto",
            border: `1px solid ${C.border}`,
            background: avancado ? C.g100 : C.white,
            color: C.g600,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 11.5,
            fontFamily: F.sans,
            cursor: "pointer",
          }}
        >
          {avancado ? "Ocultar avançado" : "Avançado"}
        </button>
      </div>

      {avancado && (
        <p
          style={{
            fontSize: 11.5,
            color: C.g500,
            margin: "0 0 14px",
            lineHeight: 1.6,
          }}
        >
          O endereço de um campo é{" "}
          <span style={mono}>{"{{MAIÚSCULA_DA_KEY}}"}</span>, calculado da key:
          escrever a key no schema não escreve a tag no HTML. Renomear a key
          troca os dois lados de uma vez.
        </p>
      )}

      {schema.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.g500 }}>
          Esta variante não tem schema. Sem campos declarados não há o que
          endereçar — a copy do n8n não tem onde entrar.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Estado</th>
                <th style={th}>Campo</th>
                {avancado && <th style={th}>Natureza</th>}
                {avancado && <th style={th}>Tag no HTML</th>}
                <th style={th}>O que fazer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = ROW_BADGE[r.kind]
                const acao = primaryAction(r)
                return (
                  <tr key={`${r.kind}:${r.tag}:${r.idx ?? "x"}`}>
                    <td style={cell}>
                      <EGBadge tone={badge.tone}>{badge.label}</EGBadge>
                    </td>

                    {/* Campo — a key, editável */}
                    <td style={cell}>
                      {r.field && r.idx != null ? (
                        <>
                          <EGInput
                            mono
                            value={draftKeys[r.idx] ?? r.field.key}
                            onChange={(v) =>
                              setDraftKeys((d) => ({ ...d, [r.idx!]: v }))
                            }
                            title="Renomear troca a key no schema e o endereço nos dois HTMLs"
                            style={{ height: 30, fontSize: 12 }}
                          />
                          {draftKeys[r.idx] != null && (
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
                        </>
                      ) : (
                        <span style={{ ...mono, color: C.g500 }}>
                          {`{{${r.tag}}}`}
                          <div style={{ fontSize: 10.5, marginTop: 2 }}>
                            tag do HTML, sem campo no schema
                          </div>
                        </span>
                      )}
                    </td>

                    {avancado && (
                      <td style={{ ...cell, fontSize: 11.5, color: C.g600 }}>
                        {r.field && r.idx != null ? (
                          <>
                            <EGSelect
                              value={r.field.nature ?? ""}
                              onChange={(v) => {
                                const next = { ...schema[r.idx!] }
                                if (v)
                                  next.nature = v as ComponentOutputField["nature"]
                                else delete next.nature
                                onChangeSchema(
                                  schema.map((f, i) => (i === r.idx ? next : f)),
                                )
                              }}
                              options={[
                                {
                                  value: "",
                                  label: `Auto (${FIELD_NATURE_LABELS_PT[deriveFieldNature(r.field)]})`,
                                },
                                ...FIELD_NATURES.map((n) => ({
                                  value: n,
                                  label: FIELD_NATURE_LABELS_PT[n],
                                })),
                              ]}
                            />
                            <div style={{ color: C.g400, fontSize: 10.5, marginTop: 3 }}>
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
                    )}

                    {avancado && (
                      <td style={cell}>
                        <span
                          style={{
                            ...mono,
                            color: r.kind === "missing" ? C.neg : C.g700,
                          }}
                        >
                          {`{{${r.tag}}}`}
                        </span>
                        <TagWhere kind={r.kind} tag={r.tag} html={html} />
                      </td>
                    )}

                    {/* O QUE FAZER — uma acao por linha, e so */}
                    <td style={{ ...cell, fontSize: 12 }}>
                      {acao ? (
                        <>
                          <EGBtn
                            variant={acao.tone}
                            onClick={acao.run}
                            title={acao.title}
                            style={{ height: 28, fontSize: 12 }}
                          >
                            {acao.label}
                          </EGBtn>
                          {acao.hint && (
                            <div
                              style={{
                                fontSize: 10.5,
                                color: C.g500,
                                marginTop: 4,
                                lineHeight: 1.4,
                              }}
                            >
                              {acao.hint}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: C.g400 }}>—</span>
                      )}

                      {/* Alternativas: fora do caminho, atras de Avancado */}
                      {avancado && r.kind === "missing" && r.idx != null && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: `1px dashed ${C.g200}`,
                          }}
                        >
                          {orphanOptions.length > 0 && (
                            <div style={{ minWidth: 190 }}>
                              <EGSelect
                                value=""
                                placeholder="ancorar noutra tag…"
                                options={orphanOptions}
                                onChange={(v) => v && bindTag(r.idx!, v)}
                              />
                            </div>
                          )}
                          <EGBtn
                            variant="danger"
                            onClick={() => removeField(r.idx!)}
                            style={{ height: 26, fontSize: 11.5 }}
                          >
                            <Trash2 size={12} /> remover campo
                          </EGBtn>
                        </div>
                      )}
                      {r.kind === "orphan" && (
                        <div style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={() => removeTag(r.tag)}
                            title={`Apaga {{${r.tag}}} do HTML`}
                            style={{
                              border: "none",
                              background: "none",
                              padding: 0,
                              color: C.neg,
                              fontSize: 11.5,
                              fontFamily: F.sans,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            ou apagar a tag do HTML
                          </button>
                        </div>
                      )}
                      {avancado && r.kind === "orphan" && (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: `1px dashed ${C.g200}`,
                          }}
                        >
                          <EGInput
                            mono
                            value={draftTags[r.tag] ?? r.tag}
                            onChange={(v) =>
                              setDraftTags((d) => ({ ...d, [r.tag]: v }))
                            }
                            title="Renomear a tag direto no HTML"
                            style={{ height: 28, fontSize: 11.5 }}
                          />
                          {draftTags[r.tag] != null && (
                            <EGBtn
                              variant="dark"
                              onClick={() => commitTag(r.tag)}
                              style={{ height: 26, fontSize: 11.5 }}
                            >
                              Aplicar
                            </EGBtn>
                          )}
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
