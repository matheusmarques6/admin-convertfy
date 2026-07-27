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
  Play,
  SplitSquareHorizontal,
  Tags,
  X,
} from "lucide-react"
import type {
  EmailComponentVariant,
  TaggingFieldReport,
} from "@/types/email-generation"
import {
  deriveFieldNature,
  FIELD_NATURE_LABELS_PT,
  placeholderForKey,
} from "@/lib/agents/shared/component-dimensions"
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

const ANCHOR_TONES: Record<TaggingFieldReport["anchored_by"], EGBadgeTone> = {
  exact: "pos",
  fuzzy: "warn",
  inference: "warn",
  existing_tag: "info",
  not_found: "neg",
}

const ANCHOR_LABELS: Record<TaggingFieldReport["anchored_by"], string> = {
  exact: "exata",
  fuzzy: "aproximada",
  inference: "inferida",
  existing_tag: "tag existente",
  not_found: "não achada",
}

type View = "report" | "review" | "preview"

export function VariantTaggerCard({
  variant,
  onChanged,
}: {
  variant: EmailComponentVariant
  /** Recarrega a lista de variantes após rodar/aprovar/rejeitar. */
  onChanged: () => Promise<void> | void
}) {
  const [running, setRunning] = useState(false)
  const [acting, setActing] = useState(false)
  const [view, setView] = useState<View>("report")
  // null = sem edição manual; string = HTML tagueado editado na revisão.
  const [editedHtml, setEditedHtml] = useState<string | null>(null)

  const schema = useMemo(
    () => (Array.isArray(variant.output_schema) ? variant.output_schema : []),
    [variant.output_schema],
  )
  const status = variant.tagging_status
  const meta = variant.tagging_meta
  const taggedBase = variant.html_tagged ?? ""
  const tagged = editedHtml ?? taggedBase
  const busy = running || acting

  // Placeholders esperados (naturezas copy/imagem_gerada; asset_fixo fica
  // fora — a arte não vira slot). existing_tag/not_found do relatório não
  // são cobrados. Campo do schema SEM placeholder no tagueado = divergência
  // (schema mudou depois do taguedor, edição manual removeu, etc).
  const { expected, missing } = useMemo(() => {
    const reportByKey = new Map(
      (meta?.fields ?? []).map((r) => [r.key, r] as const),
    )
    const exp = schema
      .filter((f) => deriveFieldNature(f) !== "asset_fixo")
      .map((f) => {
        const rep = reportByKey.get(f.key)
        return {
          key: f.key,
          placeholder: rep?.placeholder ?? placeholderForKey(f.key),
          exemptFromCheck:
            rep?.anchored_by === "existing_tag" ||
            rep?.anchored_by === "not_found",
        }
      })
    const miss =
      status == null
        ? []
        : exp.filter(
            (e) =>
              !e.exemptFromCheck && !tagged.includes(`{{${e.placeholder}}}`),
          )
    return { expected: exp, missing: miss }
  }, [schema, meta, tagged, status])

  const divergent = status != null && missing.length > 0

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
            : status == null
              ? "Converte o HTML de exemplo em HTML tagueado ({{PLACEHOLDER}} por campo do schema). A proposta fica pendente até você aprovar."
              : status === "pending"
                ? "Revise a proposta abaixo (edite o HTML tagueado se precisar) e aprove — só então o pipeline consome."
                : "O pipeline consome este HTML tagueado. Re-rode se o HTML ou o schema mudarem."}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {status != null && (
            <EGBtn variant="danger" onClick={() => void reject()} disabled={busy}>
              <X size={14} /> Rejeitar
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
            (status === "approved" && editedHtml != null)) && (
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

      {/* Divergência: campo do schema sem placeholder no tagueado */}
      {divergent && (
        <div style={{ marginTop: 14 }}>
          <EGNotice tone={status === "approved" ? "neg" : "warn"}>
            Placeholders esperados ausentes do HTML tagueado:{" "}
            {missing.map((m) => `{{${m.placeholder}}}`).join(", ")} — o schema
            mudou depois do taguedor ou a edição removeu a tag. Re-rode o
            taguedor ou ajuste na revisão.
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

      {status != null && (
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
            <TaggingReportTable
              schema={schema}
              report={meta?.fields ?? []}
              tagged={tagged}
            />
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
                  const present =
                    e.exemptFromCheck || tagged.includes(`{{${e.placeholder}}}`)
                  return (
                    <span
                      key={e.key}
                      title={
                        e.exemptFromCheck
                          ? "Campo coberto por tag existente ou sem âncora (não cobrado)"
                          : present
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
                        opacity: e.exemptFromCheck ? 0.6 : 1,
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

function TaggingReportTable({
  schema,
  report,
  tagged,
}: {
  schema: EmailComponentVariant["output_schema"]
  report: TaggingFieldReport[]
  tagged: string
}) {
  const reportByKey = new Map(report.map((r) => [r.key, r] as const))
  const rows = (schema ?? []).map((f) => {
    const rep = reportByKey.get(f.key) ?? null
    const nature = deriveFieldNature(f)
    const placeholder = rep?.placeholder ?? placeholderForKey(f.key)
    const present = tagged.includes(`{{${placeholder}}}`)
    return { field: f, rep, nature, placeholder, present }
  })

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
          {rows.map(({ field, rep, nature, placeholder, present }) => (
            <tr key={field.key}>
              <td style={{ ...td, fontFamily: F.mono, fontSize: 11.5 }}>
                {field.key}
              </td>
              <td style={{ ...td, fontFamily: F.mono, fontSize: 11.5 }}>
                <span
                  style={{
                    color:
                      nature === "asset_fixo"
                        ? C.g400
                        : present
                          ? C.pos
                          : rep?.anchored_by === "existing_tag"
                            ? C.info
                            : C.neg,
                  }}
                >
                  {`{{${placeholder}}}`}
                </span>
              </td>
              <td style={td}>{FIELD_NATURE_LABELS_PT[nature]}</td>
              <td style={td}>
                {nature === "asset_fixo" ? (
                  <span style={{ color: C.g400 }}>fora do sync</span>
                ) : rep ? (
                  <EGBadge tone={ANCHOR_TONES[rep.anchored_by]}>
                    {ANCHOR_LABELS[rep.anchored_by]}
                  </EGBadge>
                ) : (
                  <EGBadge tone="warn">sem relatório</EGBadge>
                )}
              </td>
              <td style={{ ...td, color: C.g500, maxWidth: 380 }}>
                {rep?.note ??
                  (rep == null && nature !== "asset_fixo"
                    ? "Campo sem entrada no último run — adicionado depois? Re-rode o taguedor."
                    : "")}
              </td>
            </tr>
          ))}
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
