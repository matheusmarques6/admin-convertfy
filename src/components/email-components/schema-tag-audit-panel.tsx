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
import { Check, Link2, Plus, Quote, Trash2 } from "lucide-react"

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
  taggedHtml,
  onChangeTaggedHtml,
  taggingStatus,
  agentReport,
}: {
  html: string
  schema: ComponentOutputField[]
  onChangeHtml: (html: string) => void
  onChangeSchema: (schema: ComponentOutputField[]) => void
  /** Proposta do Taguedor. Vira o 2º documento do seletor. */
  taggedHtml?: string | null
  onChangeTaggedHtml?: (html: string) => void
  taggingStatus?: string | null
  /** Relatório do último run — vira a coluna "nota do agente". */
  agentReport?: Array<{ key: string; anchored_by?: string; note?: string }>
}) {
  const [draftKeys, setDraftKeys] = useState<Record<number, string>>({})
  const [draftTags, setDraftTags] = useState<Record<string, string>>({})
  // Qual documento a tabela está lendo. Antes eram DOIS painéis quase
  // idênticos — este, sobre o HTML de origem, e o do card do Taguedor, sobre
  // a proposta. Mesmas linhas, mesmos campos, e nada na tela dizia que eram
  // documentos diferentes: os nomes nunca batiam e parecia haver trabalho em
  // dobro. Uma tabela só, e o documento se escolhe.
  const [doc, setDoc] = useState<"origem" | "proposta">("origem")

  const temProposta = !!taggedHtml?.trim()
  /**
   * A proposta é VISÍVEL aqui, mas não editável: `html_tagged` não faz parte
   * do rascunho do editor e não tem caminho de gravação pelo "Salvar
   * variante". Habilitar os consertos sobre ela perderia a edição em
   * silêncio — o conserto da proposta mora na sub-aba "Revisão" do card do
   * Taguedor, que grava ao Aprovar.
   */
  const podeEditar = (a: "origem" | "proposta") =>
    a === "origem" || !!onChangeTaggedHtml
  const alvo: "origem" | "proposta" = temProposta ? doc : "origem"
  const activeHtml = alvo === "proposta" ? (taggedHtml as string) : html

  /** Escreve no documento ativo. */
  const writeHtml = (next: string) =>
    alvo === "proposta" ? onChangeTaggedHtml?.(next) : onChangeHtml(next)

  const audit = useMemo(
    () => auditSchemaTags(activeHtml, schema),
    [activeHtml, schema],
  )

  const notaPorKey = useMemo(
    () => new Map((agentReport ?? []).map((r) => [r.key, r])),
    [agentReport],
  )

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
    // Renomear a key troca o endereço nos DOIS documentos. O endereço é o
    // contrato: deixar um deles para trás recria exatamente o desalinhamento
    // que este painel existe para acabar.
    const from = placeholderForKey(prevKey)
    const to = placeholderForKey(nextKey)
    if (!from || !to) return
    if (html.includes(`{{${from}}}`)) onChangeHtml(renameTagInHtml(html, from, to))
    if (taggedHtml?.includes(`{{${from}}}`)) {
      onChangeTaggedHtml?.(renameTagInHtml(taggedHtml, from, to))
    }
  }

  /** Ancora um campo sem tag numa tag existente do HTML (renomeia a tag). */
  function bindTag(fieldIdx: number, tagFrom: string) {
    const key = schema[fieldIdx]?.key?.trim()
    const to = placeholderForKey(key ?? "")
    if (!tagFrom || !to) return
    writeHtml(renameTagInHtml(activeHtml, tagFrom, to))
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
    writeHtml(anchorByExample(activeHtml, phrase, to))
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
    writeHtml(renameTagInHtml(activeHtml, from, to))
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

  /** Contagem de problemas no documento que NÃO está aberto. */
  const outroAudit = useMemo(() => {
    if (!temProposta) return null
    const outro = alvo === "proposta" ? html : (taggedHtml as string)
    return auditSchemaTags(outro, schema)
  }, [temProposta, alvo, html, taggedHtml, schema])

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
      {/* Seletor de documento. Substitui o painel gêmeo do card do Taguedor:
          as mesmas linhas, e você escolhe o que está olhando. */}
      {temProposta && (
        <div
          style={{
            display: "flex",
            gap: 2,
            background: C.g100,
            padding: 3,
            borderRadius: 8,
            marginBottom: 12,
            maxWidth: 460,
          }}
        >
          {(
            [
              ["origem", "HTML de origem"],
              ["proposta", "Proposta do Taguedor"],
            ] as Array<["origem" | "proposta", string]>
          ).map(([v, label]) => {
            const on = alvo === v
            const probs =
              v === alvo
                ? missingCount + orphanCount
                : (outroAudit?.missing.length ?? 0) +
                  (outroAudit?.orphans.length ?? 0)
            return (
              <button
                key={v}
                type="button"
                onClick={() => setDoc(v)}
                style={{
                  flex: 1,
                  height: 30,
                  border: "none",
                  borderRadius: 6,
                  background: on ? C.white : "transparent",
                  color: on ? C.g900 : C.g500,
                  boxShadow: on ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  fontSize: 12.5,
                  fontWeight: on ? 600 : 500,
                  fontFamily: F.sans,
                  cursor: "pointer",
                }}
              >
                {label}
                <span style={{ color: probs === 0 ? C.pos : C.neg, marginLeft: 6 }}>
                  {probs === 0 ? "ok" : probs}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <p
        style={{
          fontSize: 12,
          color: C.g500,
          margin: "0 0 4px",
          lineHeight: 1.6,
        }}
      >
        {alvo === "proposta" ? (
          <>
            Você está vendo a <b>proposta do Taguedor</b> — o que vai para
            produção <b>depois</b> de aprovada
            {taggingStatus === "approved"
              ? " (já está aprovada, então é ela que roda hoje)"
              : " (ainda pendente: hoje produção usa o HTML de origem)"}
            .{" "}
          </>
        ) : (
          <>
            Você está vendo o <b>HTML de origem</b> — o que você edita e o que
            o Taguedor lê para propor.{" "}
          </>
        )}
        O schema é a base: cada campo endereça{" "}
        <span style={mono}>{"{{MAIÚSCULA_DA_KEY}}"}</span> — sem apelido, sem
        tradução. É esse endereço que o blueprint manda ao n8n e que o merge
        procura para montar o email. <b>O endereço é calculado a partir da
        key</b>: escrever a key no schema não escreve a tag no HTML, e por isso
        um campo novo nasce como “sem tag” até você ancorar.
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
        {orphanCount} tag(s) sem campo. Renomear uma key troca o endereço nos{" "}
        <b>dois</b> documentos; as demais ações escrevem só no que está aberto.
      </p>

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
                      {r.field && r.idx != null ? (
                        <>
                          {/* Natureza decide quem preenche o campo — o n8n,
                              o agente de imagem, ou ninguém (arte fixa). Era
                              editável só no card do Taguedor; veio junto. */}
                          <EGSelect
                            value={r.field.nature ?? ""}
                            onChange={(v) => {
                              const next = { ...schema[r.idx!] }
                              if (v) next.nature = v as ComponentOutputField["nature"]
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
                          title={
                            r.kind === "missing"
                              ? "Endereço que o schema EXIGE — derivado da key. Ainda não existe no HTML: por isso você não o encontra procurando lá."
                              : "Derivado da key — o endereço não se escolhe"
                          }
                        >
                          {`{{${r.tag}}}`}
                        </span>
                      )}
                      {/* De onde saiu o nome: ancorado mostra o trecho do
                          documento; sem tag deixa explícito que o endereço é
                          CALCULADO da key e ainda não foi escrito no HTML. */}
                      <TagWhere kind={r.kind} tag={r.tag} html={activeHtml} />
                      {/* Nota do agente — o "porquê" que só o relatório do
                          Taguedor tinha. Vale para a proposta; no HTML de
                          origem ela descreveria outro documento. */}
                      {alvo === "proposta" &&
                        r.field &&
                        notaPorKey.get(r.field.key.trim())?.note && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: C.g500,
                              marginTop: 4,
                              lineHeight: 1.4,
                              fontStyle: "italic",
                            }}
                          >
                            agente: {notaPorKey.get(r.field.key.trim())!.note}
                          </div>
                        )}
                    </td>

                    {/* Conserto — só no documento que tem onde gravar */}
                    <td style={{ ...cell, fontSize: 11.5 }}>
                      {!podeEditar(alvo) && r.kind !== "anchored" && (
                        <span style={{ color: C.g500, lineHeight: 1.5 }}>
                          A proposta é só leitura aqui. Conserte no{" "}
                          <b>HTML de origem</b> e re-rode o Taguedor, ou edite
                          a proposta na sub-aba <b>Revisão</b> do card acima —
                          é ela que grava ao Aprovar.
                        </span>
                      )}
                      {podeEditar(alvo) && r.kind === "anchored" && (
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

                      {podeEditar(alvo) && r.kind === "missing" && r.idx != null && (
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
                          {/* O outro caminho: sem tag para renomear, a frase
                              real do exemplo ainda pode estar no HTML — a
                              variante É um exemplo pronto. Trocar a frase
                              pelo placeholder é o mesmo trabalho das regras
                              1 e 2 do Taguedor, feito por código. */}
                          {r.examplePhrase && (
                            <EGBtn
                              variant="dark"
                              onClick={() =>
                                anchorFieldByExample(r.idx!, r.examplePhrase!)
                              }
                              title={`Troca “${r.examplePhrase}” por {{${r.tag}}} no HTML`}
                              style={{ height: 28, fontSize: 11.5 }}
                            >
                              <Quote size={12} /> ancorar pelo exemplo
                            </EGBtn>
                          )}
                          {!r.legacyTag &&
                            !r.examplePhrase &&
                            orphanOptions.length === 0 && (
                              <span style={{ color: C.neg }}>
                                Nem tag livre, nem a frase do exemplo no HTML —
                                a arte não tem onde receber este campo. Rode o
                                Taguedor, insira {`{{${r.tag}}}`} à mão, ou
                                remova o campo.
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

                      {podeEditar(alvo) && r.kind === "orphan" && (
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
