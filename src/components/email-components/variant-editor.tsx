"use client"

/**
 * Editor completo de uma variante da biblioteca de componentes (maquete EG).
 *
 * Grid 2 colunas: esquerda = Identificação + Contexto para a IA + Schema de
 * output (+ seção Avançado com slots/tags/thumbnail); direita (sticky) =
 * Estrutura & Preview com 3 sub-abas (Preview com exemplos do schema, HTML
 * editável, HTML renderizado cru).
 */

import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type {
  ComponentOutputField,
} from "@/types/email-generation"
import {
  COMPONENT_OBJECTIVES,
  COMPONENT_TONES,
  DENSITY_LABELS_PT,
} from "@/lib/agents/shared/component-dimensions"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import {
  EGCard,
  EGCheck,
  EGInput,
  EGLabel,
  EGRenderFrame,
  EGSelect,
  EGTextarea,
  EGToggle,
} from "@/components/email-generation/ui/eg-atoms"
import { OutputSchemaEditor } from "./output-schema-editor"

/** Rascunho editável de variante (strings vazias no lugar de null). */
export interface VariantDraft {
  block_type: string
  name: string
  html: string
  description: string
  long_description: string
  when_use: string
  when_not_use: string
  copy_guidance: string
  objectives: string[]
  tones: string[]
  density: string // "" | minimal | balanced | rich
  product_slots: number
  output_schema: ComponentOutputField[]
  slots: string // CSV (avançado)
  tags: string // CSV (avançado)
  thumbnail: string
  is_active: boolean
}

/** Substitui {{TAGS}} do HTML pelos exemplos do schema (preview client-side). */
export function mergeExamplesIntoHtml(
  html: string,
  schema: ComponentOutputField[],
): string {
  let out = html
  for (const f of schema) {
    if (!f.key || !f.example) continue
    const re = new RegExp(
      `\\{\\{\\s*${f.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
      "gi",
    )
    out = out.replace(re, f.example)
  }
  return out
}

function toggleIn(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

const DENSITY_OPTIONS = [
  { value: "", label: "(nenhuma)" },
  ...Object.entries(DENSITY_LABELS_PT).map(([value, label]) => ({
    value,
    label,
  })),
]

type PreviewMode = "preview" | "html" | "rendered"

export function VariantEditor({
  draft,
  onChange,
  testCard,
}: {
  draft: VariantDraft
  onChange: (draft: VariantDraft) => void
  /** Card "Testar geração" (injetado na fase do teste por bloco). */
  testCard?: ReactNode
}) {
  const [pv, setPv] = useState<PreviewMode>("preview")
  const [showAdvanced, setShowAdvanced] = useState(false)

  const set = (patch: Partial<VariantDraft>) => onChange({ ...draft, ...patch })

  const mergedHtml = useMemo(
    () => mergeExamplesIntoHtml(draft.html, draft.output_schema),
    [draft.html, draft.output_schema],
  )

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 540px",
        gap: 20,
        alignItems: "start",
      }}
    >
      {/* ── COLUNA ESQUERDA — formulário ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minWidth: 0,
        }}
      >
        {/* Identificação */}
        <EGCard title="Identificação">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Nome</EGLabel>
              <EGInput value={draft.name} onChange={(v) => set({ name: v })} />
            </div>
            <div>
              <EGLabel>Tipo de seção</EGLabel>
              <EGSelect
                value={draft.block_type}
                onChange={(v) => set({ block_type: v })}
                options={COMPONENT_CATEGORIES.map((c) => ({
                  value: c.key,
                  label: c.label,
                }))}
              />
            </div>
            <div>
              <EGLabel>Status</EGLabel>
              <div style={{ height: 36, display: "flex", alignItems: "center" }}>
                <EGToggle
                  on={draft.is_active}
                  onChange={(v) => set({ is_active: v })}
                  label={
                    draft.is_active ? "Ativo (disponível para IA)" : "Inativo"
                  }
                />
              </div>
            </div>
            <div>
              <EGLabel>Slots de produto</EGLabel>
              <EGInput
                type="number"
                min={0}
                max={20}
                value={draft.product_slots}
                onChange={(v) =>
                  set({ product_slots: Math.max(0, Number(v) || 0) })
                }
              />
            </div>
            <div>
              <EGLabel>Densidade</EGLabel>
              <EGSelect
                value={draft.density}
                onChange={(v) => set({ density: v })}
                options={DENSITY_OPTIONS}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Descrição curta</EGLabel>
              <EGInput
                value={draft.description}
                onChange={(v) => set({ description: v })}
                placeholder="Ex: Bloco amarelo com código de cupom em destaque."
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Descrição detalhada</EGLabel>
              <EGTextarea
                value={draft.long_description}
                onChange={(v) => set({ long_description: v })}
                rows={3}
                placeholder="Notas de implementação, quirks de Outlook, etc."
              />
            </div>
          </div>

          {/* Avançado (campos técnicos preservados do editor anterior) */}
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 600,
                color: C.g500,
                padding: 0,
              }}
            >
              {showAdvanced ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              Avançado (slots, tags, thumbnail)
            </button>
            {showAdvanced && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 12,
                }}
              >
                <div>
                  <EGLabel hint="vírgula">Slots</EGLabel>
                  <EGInput
                    mono
                    value={draft.slots}
                    onChange={(v) => set({ slots: v })}
                    placeholder="{{HEADLINE}}, {{CTA_URL}}"
                  />
                </div>
                <div>
                  <EGLabel hint="vírgula">Tags</EGLabel>
                  <EGInput
                    value={draft.tags}
                    onChange={(v) => set({ tags: v })}
                    placeholder="dark_bg, 2x2_grid"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <EGLabel>Thumbnail (URL)</EGLabel>
                  <EGInput
                    mono
                    value={draft.thumbnail}
                    onChange={(v) => set({ thumbnail: v })}
                    placeholder="https://…"
                  />
                </div>
              </div>
            )}
          </div>
        </EGCard>

        {/* Contexto para a IA */}
        <EGCard title="Contexto para a IA">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <EGLabel>Quando usar</EGLabel>
              <EGTextarea
                value={draft.when_use}
                onChange={(v) => set({ when_use: v })}
                rows={2}
                placeholder="Ex: Sempre que houver um código promocional para aplicar no checkout."
              />
            </div>
            <div>
              <EGLabel>Quando NÃO usar</EGLabel>
              <EGTextarea
                value={draft.when_not_use}
                onChange={(v) => set({ when_not_use: v })}
                rows={2}
                placeholder="Ex: Emails calmos de boas-vindas sem oferta explícita."
              />
            </div>
            <div>
              <EGLabel>Orientações de copy para a IA</EGLabel>
              <EGTextarea
                value={draft.copy_guidance}
                onChange={(v) => set({ copy_guidance: v })}
                rows={2}
                placeholder="Ex: Headline vende o desconto. Código em CAIXA ALTA sem espaços."
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <div>
                <EGLabel>Objetivos compatíveis</EGLabel>
                <div
                  style={{
                    maxHeight: 150,
                    overflow: "auto",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {COMPONENT_OBJECTIVES.map((o) => (
                    <EGCheck
                      key={o}
                      on={draft.objectives.includes(o)}
                      onChange={() =>
                        set({ objectives: toggleIn(draft.objectives, o) })
                      }
                      label={o}
                    />
                  ))}
                </div>
              </div>
              <div>
                <EGLabel>Tons compatíveis</EGLabel>
                <div
                  style={{
                    maxHeight: 150,
                    overflow: "auto",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {COMPONENT_TONES.map((t) => (
                    <EGCheck
                      key={t}
                      on={draft.tones.includes(t)}
                      onChange={() => set({ tones: toggleIn(draft.tones, t) })}
                      label={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </EGCard>

        {/* Schema de output */}
        <OutputSchemaEditor
          schema={draft.output_schema}
          onChange={(s) => set({ output_schema: s })}
        />
      </div>

      {/* ── COLUNA DIREITA — Estrutura & Preview (+ Testar) ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "sticky",
          top: 16,
        }}
      >
        <EGCard title="Estrutura & Preview">
          <div
            style={{
              display: "flex",
              gap: 2,
              background: C.g100,
              padding: 3,
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {(
              [
                ["preview", "Preview"],
                ["html", "HTML"],
                ["rendered", "HTML renderizado"],
              ] as Array<[PreviewMode, string]>
            ).map(([k, l]) => {
              const on = pv === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPv(k)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
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
                  {l}
                </button>
              )
            })}
          </div>

          {pv === "preview" && (
            <>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <EGRenderFrame html={mergedHtml} minHeight={480} />
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                Preview usando os exemplos definidos em cada campo do schema.
              </div>
            </>
          )}
          {pv === "html" && (
            <>
              <textarea
                value={draft.html}
                onChange={(e) => set({ html: e.target.value })}
                rows={22}
                style={{
                  ...egInputStyle,
                  height: "auto",
                  padding: "11px 12px",
                  lineHeight: 1.5,
                  resize: "vertical",
                  fontFamily: F.mono,
                  fontSize: 12,
                  whiteSpace: "pre",
                }}
              />
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                Cole aqui o HTML do bloco com todos os elementos. A aba “HTML
                renderizado” mostra o render real.
              </div>
            </>
          )}
          {pv === "rendered" && (
            <>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <EGRenderFrame html={draft.html} minHeight={520} />
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                Render real do HTML atual (mesmo motor do email final).
              </div>
            </>
          )}
        </EGCard>

        {testCard}
      </div>
    </div>
  )
}
