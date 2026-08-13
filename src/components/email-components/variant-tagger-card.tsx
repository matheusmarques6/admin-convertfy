"use client"

/**
 * Card de revisão do Taguedor de Variantes (aba Componentes).
 *
 * A variante é um "exemplo pronto" (HTML com frases/URLs reais); o taguedor
 * propõe o html_tagged com {{UPPER(key)}} no lugar dos exemplos. Aqui o
 * humano revisa: relatório por campo (âncora exact/fuzzy/inference/
 * existing_tag/not_found), comparação lado a lado com edição manual do
 * tagueado, preview com os exemplos do schema, e as ações rodar/re-rodar,
 * aprovar e rejeitar. Só com aprovação o pipeline consome o html_tagged.
 */

import { useMemo, useState } from "react"
import {
  Check,
  Eye,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  SplitSquareHorizontal,
  Tags,
  X,
} from "lucide-react"
import type {
  ComponentOutputField,
  EmailComponentVariant,
  TaggingFieldReport,
} from "@/types/email-generation"
import {
  deriveFieldNature,
  FIELD_NATURES,
  FIELD_NATURE_LABELS_PT,
  placeholderForKey,
  sanitizeOutputKeyInput,
} from "@/lib/agents/shared/component-dimensions"
import {
  auditSchemaTags,
  renameTagInHtml,
} from "@/lib/email-workspace/schema-tag-coherence"
import {
  CAUSE_TEXT,
  groupDivergence,
} from "@/lib/email-workspace/tagging-divergence"
import { toast } from "@/lib/hooks/use-toast"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import {
  EGBadge,
  EGBtn,
  EGCard,
  EGNotice,
  EGRenderFrame,
  type EGBadgeTone,
} from "@/components/email-generation/ui/eg-atoms"
import { mergeExamplesIntoHtml } from "./variant-editor"

/**
 * Selo da coluna Âncora.
 *
 * A VERDADE é o HTML tagueado: `{{UPPER(key)}}` está lá ou não está. O
 * `anchored_by` do relatório é só a explicação de COMO o agente chegou (ou
 * não) até ali — e num relatório antigo ele mente por construção, porque
 * `existing_tag` significava duas coisas incompatíveis: "o slot já tinha a
 * tag CERTA" (nada a fazer) e "o slot tem OUTRA tag" (o defeito). Julgar o
 * campo pela palavra do relatório pintava de vermelho campos perfeitamente
 * ancorados.
 */
function anchorBadge(
  present: boolean,
  anchoredBy?: TaggingFieldReport["anchored_by"],
): { tone: EGBadgeTone; label: string } {
  if (present) {
    switch (anchoredBy) {
      case "exact":
        return { tone: "pos", label: "exata" }
      case "fuzzy":
        return { tone: "pos", label: "aproximada" }
      case "renamed":
        return { tone: "pos", label: "renomeada" }
      case "inference":
        // Ancorou, mas por palpite do agente — vale um olhar humano.
        return { tone: "warn", label: "inferida" }
      default:
        // existing_tag / not_found / sem relatório: seja qual for a
        // explicação, o placeholder ESTÁ no HTML. Ancorado.
        return { tone: "pos", label: "ancorada" }
    }
  }
  switch (anchoredBy) {
    case "existing_tag":
      return { tone: "neg", label: "tag divergente" }
    case "not_found":
      return { tone: "neg", label: "não achada" }
    case undefined:
      return { tone: "warn", label: "sem relatório" }
    default:
      // O relatório afirma ter ancorado e o placeholder não está lá.
      return { tone: "neg", label: "prometida, ausente" }
  }
}

type View = "report" | "review" | "preview"

export function VariantTaggerCard({
  variant,
  onChanged,
  schema: schemaProp,
  onChangeSchema,
  onRenameInOriginHtml,
}: {
  variant: EmailComponentVariant
  /** Recarrega a lista de variantes após rodar/aprovar/rejeitar. */
  onChanged: () => Promise<void> | void
  /**
   * Schema VIVO do rascunho do editor — não o salvo em `variant`. As duas
   * telas precisam olhar o mesmo dado: senão renomear um campo aqui deixaria
   * o relatório cobrando a key antiga até alguém salvar.
   */
  schema: ComponentOutputField[]
  onChangeSchema: (schema: ComponentOutputField[]) => void
  /** Mantém o HTML de origem no mesmo endereço quando a key é renomeada. */
  onRenameInOriginHtml: (from: string, to: string) => void
}) {
  const [running, setRunning] = useState(false)
  const [acting, setActing] = useState(false)
  const [view, setView] = useState<View>("report")
  // null = sem edição manual; string = HTML tagueado editado na revisão.
  const [editedHtml, setEditedHtml] = useState<string | null>(null)
  // Modo manual: o humano faz as vezes do taguedor — parte do HTML
  // original, insere os {{PLACEHOLDERS}} na mão e aprova direto.
  const [manualMode, setManualMode] = useState(false)

  const schema = schemaProp
  const status = variant.tagging_status
  const meta = variant.tagging_meta
  const taggedBase = variant.html_tagged ?? ""
  const tagged = editedHtml ?? taggedBase
  const busy = running || acting
  // Sub-abas visíveis com proposta OU em edição manual.
  const reviewing = status != null || manualMode

  function startManual() {
    // Semente = proposta existente (se houver) ou o HTML original — o
    // curador substitui as frases de exemplo pelos {{PLACEHOLDERS}} na mão.
    setEditedHtml(tagged.trim() ? tagged : variant.html)
    setManualMode(true)
    setView("review")
  }

  function cancelManual() {
    setManualMode(false)
    setEditedHtml(null)
    setView("report")
  }

  // Placeholders esperados = {{UPPER(key)}} de cada campo (asset_fixo fica
  // fora — a arte não vira slot). NÃO há isenção: o relatório dizer
  // "existing_tag"/"not_found" explica POR QUE faltou, não autoriza faltar.
  // O placeholder cobrado é sempre o canônico, nunca o nome que o relatório
  // devolveu — senão uma tag divergente se auto-aprovaria.
  const { expected, missing } = useMemo(() => {
    const exp = schema
      .filter((f) => deriveFieldNature(f) !== "asset_fixo")
      .map((f) => ({ key: f.key, placeholder: placeholderForKey(f.key) }))
    const miss =
      status == null
        ? []
        : exp.filter((e) => !tagged.includes(`{{${e.placeholder}}}`))
    return { expected: exp, missing: miss }
  }, [schema, tagged, status])

  const divergent = status != null && missing.length > 0

  // Causa de cada ausência, lida do relatório do agente.
  const divergence = useMemo(
    () => (divergent ? groupDivergence(missing, meta?.fields) : []),
    [divergent, missing, meta?.fields],
  )

  const badge: { tone: EGBadgeTone; label: string } =
    status === "approved"
      ? divergent
        ? { tone: "neg", label: "Aprovada · divergente" }
        : { tone: "pos", label: "Tag aprovada" }
      : status === "pending"
        ? divergent
          ? { tone: "warn", label: "Pendente · divergente" }
          : { tone: "warn", label: "Proposta pendente" }
        : schema.length === 0
          ? { tone: "neut", label: "Sem schema" }
          : { tone: "neut", label: "Não sincronizada" }

  async function runTagger() {
    setRunning(true)
    try {
      const res = await fetch(`/api/admin/components/${variant.id}/tag`, {
        method: "POST",
      })
      const json = (await res.json().catch(() => null)) as {
        error?: string
        issues?: string[]
      } | null
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
      const issues = json?.issues ?? []
      toast({
        title: "Proposta de tags gerada",
        description:
          issues.length > 0
            ? `${issues.length} aviso(s) no relatório — revise antes de aprovar.`
            : "Revise e aprove para o pipeline consumir.",
      })
      setEditedHtml(null)
      setManualMode(false)
      setView("report")
      await onChanged()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao rodar o taguedor",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setRunning(false)
    }
  }

  async function approve() {
    setActing(true)
    try {
      const body: { action: "approve"; html_tagged?: string } = {
        action: "approve",
      }
      if (editedHtml != null && editedHtml.trim() && editedHtml !== taggedBase) {
        body.html_tagged = editedHtml
      }
      const res = await fetch(`/api/admin/components/${variant.id}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as {
        error?: string
      } | null
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
      toast({
        title: "Tag aprovada",
        description: "O pipeline passa a consumir o HTML tagueado.",
      })
      setEditedHtml(null)
      setManualMode(false)
      await onChanged()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao aprovar",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setActing(false)
    }
  }

  async function reject() {
    if (
      !confirm(
        "Rejeitar a proposta? O HTML tagueado e o relatório são descartados (dá pra re-rodar depois).",
      )
    ) {
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/admin/components/${variant.id}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })
      const json = (await res.json().catch(() => null)) as {
        error?: string
      } | null
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
      toast({ title: "Proposta rejeitada" })
      setEditedHtml(null)
      setView("report")
      await onChanged()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao rejeitar",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setActing(false)
    }
  }

  const generatedAt = meta?.generated_at
    ? new Date(meta.generated_at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <EGCard
      title="Taguedor"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta && (
            <span
              style={{
                fontSize: 11.5,
                color: C.g400,
                fontFamily: F.sans,
              }}
            >
              {meta.model}
              {generatedAt ? ` · ${generatedAt}` : ""}
            </span>
          )}
          <EGBadge tone={badge.tone} dot>
            {badge.label}
          </EGBadge>
        </div>
      }
    >
      {/* Ações */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: C.g500,
            fontFamily: F.sans,
            flex: 1,
            minWidth: 260,
          }}
        >
          {schema.length === 0
            ? "A variante não tem schema de output — cadastre os campos antes de taguear."
            : manualMode
              ? "Modo manual: troque as frases de exemplo pelos {{PLACEHOLDERS}} na aba Revisão (os chips mostram o que falta) e aprove."
              : status == null
                ? "Converte o HTML de exemplo em HTML tagueado ({{PLACEHOLDER}} por campo do schema). A proposta fica pendente até você aprovar — ou taguee manualmente e faça as vezes do agente."
                : status === "pending"
                  ? "Revise a proposta abaixo (edite o HTML tagueado se precisar) e aprove — só então o pipeline consome."
                  : "O pipeline consome este HTML tagueado. Re-rode se o HTML ou o schema mudarem."}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {manualMode ? (
            <EGBtn variant="secondary" onClick={cancelManual} disabled={busy}>
              <X size={14} /> Cancelar edição
            </EGBtn>
          ) : (
            status != null && (
              <EGBtn
                variant="danger"
                onClick={() => void reject()}
                disabled={busy}
              >
                <X size={14} /> Rejeitar
              </EGBtn>
            )
          )}
          {!manualMode && (
            <EGBtn
              variant="secondary"
              onClick={startManual}
              disabled={busy || schema.length === 0}
              title="Edite o HTML tagueado na mão (parte da proposta atual ou do HTML original) e aprove sem rodar o agente"
            >
              <Pencil size={14} />
              {status == null ? "Taguear manualmente" : "Editar na mão"}
            </EGBtn>
          )}
          <EGBtn
            variant="secondary"
            onClick={() => void runTagger()}
            disabled={busy || schema.length === 0}
            title="Roda o agente taguedor nesta variante (a proposta atual é substituída)"
          >
            {running ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {status == null ? "Rodar taguedor" : "Re-rodar"}
          </EGBtn>
          {(status === "pending" ||
            (editedHtml != null && (manualMode || status === "approved"))) && (
            <EGBtn
              variant="dark"
              onClick={() => void approve()}
              disabled={busy || !tagged.trim()}
              title={
                editedHtml != null
                  ? "Aprova com o HTML tagueado editado na revisão"
                  : "Aprova a proposta do taguedor"
              }
            >
              {acting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Aprovar
            </EGBtn>
          )}
        </div>
      </div>

      {running && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: C.g500,
            fontFamily: F.sans,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Loader2 size={13} className="animate-spin" />
          Tagueando — modelos de raciocínio podem levar 1–3 min nesta variante…
        </div>
      )}

      {/* Divergência: campo do schema sem placeholder no tagueado.
          A causa sai do relatório do agente, não de um palpite fixo — cada
          uma pede um conserto diferente, e "re-rode" só serve para uma
          delas. Campo que voltou `not_found` não tem onde ancorar: mandar
          re-rodar manda repetir o mesmo resultado. */}
      {divergent && (
        <div style={{ marginTop: 14 }}>
          <EGNotice tone={status === "approved" ? "neg" : "warn"}>
            <div style={{ marginBottom: divergence.length > 1 ? 7 : 0 }}>
              Placeholders esperados ausentes do HTML tagueado.
            </div>
            {divergence.map((g) => (
              <div
                key={g.cause}
                style={{ marginTop: divergence.length > 1 ? 5 : 0 }}
              >
                <span style={{ fontFamily: F.mono, fontSize: 11.5 }}>
                  {g.placeholders.join(", ")}
                </span>{" "}
                — {CAUSE_TEXT[g.cause].what}. {CAUSE_TEXT[g.cause].fix}.
              </div>
            ))}
          </EGNotice>
        </div>
      )}

      {/* Issues do guard (warnings do último run) */}
      {status != null && (meta?.issues?.length ?? 0) > 0 && (
        <div style={{ marginTop: divergent ? 8 : 14 }}>
          <EGNotice tone="warn">
            {(meta?.issues ?? []).map((i, idx) => (
              <div key={idx}>{i}</div>
            ))}
          </EGNotice>
        </div>
      )}

      {reviewing && (
        <>
          {/* Sub-abas */}
          <div
            style={{
              display: "flex",
              gap: 2,
              background: C.g100,
              padding: 3,
              borderRadius: 8,
              margin: "16px 0 14px",
              maxWidth: 460,
            }}
          >
            {(
              [
                ["report", "Relatório", ListChecks],
                ["review", "Revisão", SplitSquareHorizontal],
                ["preview", "Preview", Eye],
              ] as Array<[View, string, typeof ListChecks]>
            ).map(([k, l, Icon]) => {
              const on = view === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: on ? 600 : 500,
                    color: on ? C.g900 : C.g500,
                    background: on ? C.white : "transparent",
                    boxShadow: on ? C.shadowSm : "none",
                  }}
                >
                  <Icon size={13} />
                  {l}
                </button>
              )
            })}
          </div>

          {view === "report" && (
            <>
              <TaggingReportTable
                schema={schema}
                report={meta?.fields ?? []}
                tagged={tagged}
                onChangeSchema={onChangeSchema}
                onChangeTagged={setEditedHtml}
                onRenameInOriginHtml={onRenameInOriginHtml}
              />
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11.5,
                  color: C.g500,
                  lineHeight: 1.6,
                }}
              >
                Editar aqui muda o <strong>rascunho</strong>: key e natureza vão
                no schema (grave em “Salvar variante”, no editor abaixo) e o
                endereço no HTML tagueado só passa a valer quando você{" "}
                <strong>Aprovar</strong>.
              </div>
            </>
          )}

          {view === "review" && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div>
                  <div style={reviewColTitle}>HTML original (exemplo pronto)</div>
                  <pre style={reviewPre}>{variant.html}</pre>
                </div>
                <div>
                  <div style={reviewColTitle}>
                    HTML tagueado (proposta — editável)
                    {editedHtml != null && editedHtml !== taggedBase && (
                      <span style={{ color: C.warn, marginLeft: 6 }}>
                        · editado
                      </span>
                    )}
                  </div>
                  <textarea
                    value={tagged}
                    onChange={(e) => setEditedHtml(e.target.value)}
                    spellCheck={false}
                    style={{
                      ...egInputStyle,
                      width: "100%",
                      height: 420,
                      padding: "10px 12px",
                      lineHeight: 1.5,
                      resize: "vertical",
                      fontFamily: F.mono,
                      fontSize: 11.5,
                      whiteSpace: "pre",
                    }}
                  />
                </div>
              </div>

              {/* Chips de presença dos placeholders esperados */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 12,
                  alignItems: "center",
                }}
              >
                <Tags size={13} color={C.g400} />
                {expected.map((e) => {
                  const present = tagged.includes(`{{${e.placeholder}}}`)
                  return (
                    <span
                      key={e.key}
                      title={
                        present
                          ? "Placeholder presente no HTML tagueado"
                          : "Placeholder AUSENTE do HTML tagueado"
                      }
                      style={{
                        fontFamily: F.mono,
                        fontSize: 10.5,
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: `1px solid ${present ? C.posBorder : C.negBorder}`,
                        background: present ? C.posBg : C.negBg,
                        color: present ? C.pos : C.neg,
                      }}
                    >
                      {`{{${e.placeholder}}}`}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {view === "preview" && (
            <>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <EGRenderFrame
                  html={mergeExamplesIntoHtml(tagged, schema)}
                  minHeight={420}
                />
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                HTML tagueado com os exemplos do schema no lugar dos
                placeholders — deve ficar idêntico ao exemplo original.
              </div>
            </>
          )}
        </>
      )}
    </EGCard>
  )
}

const reviewColTitle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: C.g600,
  fontFamily: F.sans,
  marginBottom: 6,
}

const reviewPre: React.CSSProperties = {
  margin: 0,
  height: 420,
  overflow: "auto",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.g25,
  padding: "10px 12px",
  fontFamily: F.mono,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: C.g700,
  whiteSpace: "pre",
}

/**
 * Relatório do Taguedor — editável nas quatro colunas de dado.
 *
 * Campo e Placeholder são O MESMO valor visto de dois jeitos (o endereço é
 * `{{UPPER(key)}}`), então editar qualquer um dos dois faz a mesma coisa:
 * renomeia a key no schema e o placeholder nos dois HTMLs. Natureza escreve
 * `field.nature`. Âncora é onde mora o conserto: campo sem endereço ganha um
 * seletor com as tags livres do HTML tagueado, e escolher uma renomeia essa
 * tag para o endereço do campo.
 *
 * Onde cada edição é gravada:
 *   schema + HTML de origem → rascunho da variante (botão "Salvar variante")
 *   HTML tagueado           → estado local, gravado no botão "Aprovar"
 */
function TaggingReportTable({
  schema,
  report,
  tagged,
  onChangeSchema,
  onChangeTagged,
  onRenameInOriginHtml,
}: {
  schema: EmailComponentVariant["output_schema"]
  report: TaggingFieldReport[]
  tagged: string
  onChangeSchema: (schema: ComponentOutputField[]) => void
  onChangeTagged: (html: string) => void
  /** Mantém o HTML de origem no mesmo endereço quando a key é renomeada. */
  onRenameInOriginHtml: (from: string, to: string) => void
}) {
  const [draftKeys, setDraftKeys] = useState<Record<number, string>>({})

  const fields = useMemo(() => schema ?? [], [schema])
  const reportByKey = new Map(report.map((r) => [r.key, r] as const))
  const rows = fields.map((f, idx) => {
    const rep = reportByKey.get(f.key) ?? null
    const nature = deriveFieldNature(f)
    // O endereço é derivado da key, sempre — o relatório não tem voz aqui.
    // Deixar `rep.placeholder` mandar permitia uma proposta com tag
    // divergente se declarar ancorada no próprio nome que inventou.
    const placeholder = placeholderForKey(f.key)
    const present = tagged.includes(`{{${placeholder}}}`)
    return { field: f, idx, rep, nature, placeholder, present }
  })

  // Tags do HTML tagueado que nenhum campo reivindica — as candidatas a
  // âncora de um campo órfão.
  const freeTags = useMemo(
    () => auditSchemaTags(tagged, fields).orphans.map((o) => o.tag),
    [tagged, fields],
  )

  /** Renomeia a key: schema + HTML tagueado + HTML de origem, de uma vez. */
  function commitKey(idx: number, raw: string) {
    setDraftKeys((d) => {
      const n = { ...d }
      delete n[idx]
      return n
    })
    const nextKey = sanitizeOutputKeyInput(raw).trim()
    const prevKey = fields[idx]?.key?.trim() ?? ""
    if (!nextKey || nextKey === prevKey) return
    if (fields.some((f, i) => i !== idx && f.key.trim() === nextKey)) {
      toast({
        variant: "destructive",
        title: "Já existe um campo com essa key",
        description: "Dois campos no mesmo endereço fariam a copy de um sobrescrever a do outro.",
      })
      return
    }
    onChangeSchema(
      fields.map((f, i) => (i === idx ? { ...f, key: nextKey } : f)),
    )
    const from = placeholderForKey(prevKey)
    const to = placeholderForKey(nextKey)
    if (!from || !to) return
    onChangeTagged(renameTagInHtml(tagged, from, to))
    onRenameInOriginHtml(from, to)
  }

  /** Ancora o campo numa tag existente do tagueado (renomeia a tag). */
  function bindTag(idx: number, from: string) {
    const to = placeholderForKey(fields[idx]?.key ?? "")
    if (!from || !to) return
    onChangeTagged(renameTagInHtml(tagged, from, to))
  }

  function setNature(idx: number, nature: string) {
    onChangeSchema(
      fields.map((f, i) =>
        i === idx
          ? { ...f, nature: nature as ComponentOutputField["nature"] }
          : f,
      ),
    )
  }

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 600,
    color: C.g500,
    fontFamily: F.sans,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  }
  const td: React.CSSProperties = {
    padding: "7px 10px",
    fontSize: 12,
    fontFamily: F.sans,
    color: C.g700,
    borderBottom: `1px solid ${C.g100}`,
    verticalAlign: "top",
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Campo</th>
            <th style={th}>Placeholder</th>
            <th style={th}>Natureza</th>
            <th style={th}>Âncora</th>
            <th style={th}>Nota</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ field, idx, rep, nature, placeholder, present }) => {
            // Campo e Placeholder editam O MESMO valor: quem estiver em
            // edição manda, e o outro mostra a projeção do que será aplicado.
            const editing = draftKeys[idx]
            const pendingKey = sanitizeOutputKeyInput(editing ?? field.key)
            return (
              <tr key={`${field.key}:${idx}`}>
                {/* 1. Campo (key) */}
                <td style={{ ...td, minWidth: 180 }}>
                  <input
                    value={editing ?? field.key}
                    onChange={(e) =>
                      setDraftKeys((d) => ({ ...d, [idx]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitKey(idx, editing ?? field.key)
                      if (e.key === "Escape")
                        setDraftKeys((d) => {
                          const n = { ...d }
                          delete n[idx]
                          return n
                        })
                    }}
                    title="Renomear troca a key no schema e o placeholder nos dois HTMLs"
                    style={{
                      ...egInputStyle,
                      height: 30,
                      fontFamily: F.mono,
                      fontSize: 11.5,
                    }}
                  />
                </td>

                {/* 2. Placeholder — mesma edição, vista pelo endereço */}
                <td style={{ ...td, minWidth: 200 }}>
                  <input
                    value={
                      editing != null
                        ? placeholderForKey(pendingKey)
                        : placeholder
                    }
                    onChange={(e) =>
                      setDraftKeys((d) => ({
                        ...d,
                        [idx]: e.target.value.toLowerCase(),
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitKey(idx, editing ?? field.key)
                      if (e.key === "Escape")
                        setDraftKeys((d) => {
                          const n = { ...d }
                          delete n[idx]
                          return n
                        })
                    }}
                    title="É o endereço no HTML — editar aqui renomeia a key junto"
                    style={{
                      ...egInputStyle,
                      height: 30,
                      fontFamily: F.mono,
                      fontSize: 11.5,
                      color:
                        nature === "asset_fixo"
                          ? C.g400
                          : present
                            ? C.pos
                            : C.neg,
                    }}
                  />
                </td>

                {/* 3. Natureza */}
                <td style={{ ...td, minWidth: 150 }}>
                  <select
                    value={nature}
                    onChange={(e) => setNature(idx, e.target.value)}
                    style={{ ...egInputStyle, height: 30, fontSize: 11.5 }}
                  >
                    {FIELD_NATURES.map((n) => (
                      <option key={n} value={n}>
                        {FIELD_NATURE_LABELS_PT[n]}
                      </option>
                    ))}
                  </select>
                </td>

                {/* 4. Âncora — selo quando ok, conserto quando falta */}
                <td style={{ ...td, minWidth: 210 }}>
                  {nature === "asset_fixo" ? (
                    <span style={{ color: C.g400 }}>fora do sync</span>
                  ) : present ? (
                    (() => {
                      const a = anchorBadge(true, rep?.anchored_by)
                      return <EGBadge tone={a.tone}>{a.label}</EGBadge>
                    })()
                  ) : (
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: 5 }}
                    >
                      {(() => {
                        const a = anchorBadge(false, rep?.anchored_by)
                        return <EGBadge tone={a.tone}>{a.label}</EGBadge>
                      })()}
                      {freeTags.length > 0 ? (
                        <select
                          value=""
                          onChange={(e) =>
                            e.target.value && bindTag(idx, e.target.value)
                          }
                          title={`Renomeia a tag escolhida para {{${placeholder}}}`}
                          style={{
                            ...egInputStyle,
                            height: 28,
                            fontSize: 11,
                            fontFamily: F.mono,
                          }}
                        >
                          <option value="">ancorar em…</option>
                          {freeTags.map((t) => (
                            <option key={t} value={t}>
                              {`{{${t}}} → {{${placeholder}}}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 10.5, color: C.g400 }}>
                          sem tag livre no tagueado
                        </span>
                      )}
                    </div>
                  )}
                </td>

                <td style={{ ...td, color: C.g500, maxWidth: 340 }}>
                  {editing != null ? (
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <EGBtn
                        variant="dark"
                        onClick={() => commitKey(idx, editing)}
                        style={{ height: 26, fontSize: 11 }}
                      >
                        Aplicar
                      </EGBtn>
                      <EGBtn
                        onClick={() =>
                          setDraftKeys((d) => {
                            const n = { ...d }
                            delete n[idx]
                            return n
                          })
                        }
                        style={{ height: 26, fontSize: 11 }}
                      >
                        Cancelar
                      </EGBtn>
                    </div>
                  ) : (
                    (rep?.note ??
                      (rep == null && nature !== "asset_fixo"
                        ? "Campo sem entrada no último run — adicionado depois? Re-rode o taguedor."
                        : ""))
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td style={{ ...td, color: C.g400 }} colSpan={5}>
                Schema vazio.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
