"use client"

/**
 * Editor do output_schema de uma variante (aba Componentes).
 * Cada linha = um campo que a IA gera: key, label, tipo, maxLen, obrigatório,
 * exemplo e orientação específica pro campo.
 */

import { Copy, Trash2, Plus } from "lucide-react"
import type { ComponentOutputField, FieldNature } from "@/types/email-generation"
import {
  FIELD_NATURES,
  FIELD_NATURE_LABELS_PT,
  FIELD_TYPES,
  FIELD_TYPE_LABELS_PT,
  deriveFieldNature,
  sanitizeOutputKeyInput,
  type ComponentFieldType,
} from "@/lib/agents/shared/component-dimensions"
import {
  duplicateField,
  mergeSchemas,
} from "@/lib/email-workspace/schema-duplicate"
import { toast } from "@/lib/hooks/use-toast"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import { EGCard, EGCheck, EGSelect } from "@/components/email-generation/ui/eg-atoms"

const rowInput: React.CSSProperties = { ...egInputStyle, height: 32 }

function SchemaRow({
  field,
  onChange,
  onDelete,
  onDuplicate,
}: {
  field: ComponentOutputField
  onChange: (f: ComponentOutputField) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 14,
        background: C.g25,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={field.key}
          onChange={(e) =>
            onChange({ ...field, key: sanitizeOutputKeyInput(e.target.value) })
          }
          placeholder="chave_tecnica"
          title="Chave técnica (minúsculas/underscore) — casa com o {{PLACEHOLDER}} do HTML sem diferenciar maiúsculas"
          style={{ ...rowInput, flex: 1, fontFamily: F.mono, fontSize: 12 }}
        />
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Rótulo"
          style={{ ...rowInput, flex: 1 }}
        />
        <div style={{ width: 130, flexShrink: 0 }}>
          <EGSelect
            value={field.type}
            onChange={(v) =>
              onChange({ ...field, type: v as ComponentFieldType })
            }
            options={FIELD_TYPES.map((t) => ({
              value: t,
              label: FIELD_TYPE_LABELS_PT[t],
            }))}
          />
        </div>
        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicar campo — a cópia entra logo abaixo, com o número da chave somado (product_1_name → product_2_name)"
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.g400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Remover campo"
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.g400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
      >
        <input
          type="number"
          value={field.max_len}
          min={0}
          onChange={(e) =>
            onChange({ ...field, max_len: Number(e.target.value) || 0 })
          }
          title="Máx. caracteres (0 = sem limite)"
          style={{ ...rowInput, width: 80 }}
        />
        <div style={{ width: 100, display: "flex", alignItems: "center" }}>
          <EGCheck
            on={field.required}
            onChange={(v) => onChange({ ...field, required: v })}
            label="Obrig."
          />
        </div>
        {/* Natureza (épico Taguedor): quem produz o valor final. Vazio =
            derivada do tipo (image → imagem gerada; resto → copy). */}
        <div style={{ width: 170, flexShrink: 0 }} title="Natureza do campo — copy: o n8n escreve · imagem gerada: o agente de imagem cria · asset fixo: a arte da biblioteca fica intacta">
          <EGSelect
            value={field.nature ?? ""}
            onChange={(v) => {
              const next = { ...field }
              if (v) next.nature = v as FieldNature
              else delete next.nature
              onChange(next)
            }}
            options={[
              {
                value: "",
                label: `Auto (${FIELD_NATURE_LABELS_PT[deriveFieldNature(field)]})`,
              },
              ...FIELD_NATURES.map((n) => ({
                value: n,
                label: FIELD_NATURE_LABELS_PT[n],
              })),
            ]}
          />
        </div>
        <input
          value={field.example}
          onChange={(e) => onChange({ ...field, example: e.target.value })}
          placeholder="Exemplo"
          style={{ ...rowInput, flex: 1 }}
        />
      </div>
      <textarea
        value={field.guidance}
        onChange={(e) => onChange({ ...field, guidance: e.target.value })}
        placeholder="Orientação específica para este campo (para a IA)"
        rows={1}
        style={{
          ...egInputStyle,
          height: "auto",
          padding: "8px 11px",
          marginTop: 8,
          lineHeight: 1.4,
          resize: "vertical",
          fontSize: 12.5,
        }}
      />
      {field.type === "image" && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 12,
            borderTop: `1px dashed ${C.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: C.g600,
              fontFamily: F.sans,
            }}
          >
            Imagem — briefing e formato
          </div>
          <textarea
            value={field.image_spec ?? ""}
            onChange={(e) => onChange({ ...field, image_spec: e.target.value })}
            placeholder="O que a imagem deve transmitir (cena, produto, clima, o que você quer passar com ela)"
            rows={2}
            style={{
              ...egInputStyle,
              height: "auto",
              padding: "8px 11px",
              lineHeight: 1.4,
              resize: "vertical",
              fontSize: 12.5,
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={field.image_aspect ?? ""}
              onChange={(e) =>
                onChange({ ...field, image_aspect: e.target.value })
              }
              placeholder="Proporção (ex.: 16:9)"
              title="Proporção da imagem — texto livre, ex.: 16:9, 4:5, 1:1"
              style={{ ...rowInput, flex: 1 }}
            />
            <input
              type="number"
              min={0}
              value={field.image_width ?? ""}
              onChange={(e) =>
                onChange({
                  ...field,
                  image_width: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Largura (px)"
              title="Largura em pixels"
              style={{ ...rowInput, width: 110 }}
            />
            <input
              type="number"
              min={0}
              value={field.image_height ?? ""}
              onChange={(e) =>
                onChange({
                  ...field,
                  image_height: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Altura (px)"
              title="Altura em pixels"
              style={{ ...rowInput, width: 110 }}
            />
          </div>
        </div>
      )}

    </div>
  )
}

export function OutputSchemaEditor({
  schema,
  onChange,
  blockType,
  selfId,
  schemaSources,
}: {
  schema: ComponentOutputField[]
  onChange: (schema: ComponentOutputField[]) => void
  /** Seção da variante — decide se a colisão conflita ou é reuso. */
  blockType?: string
  /** Id da própria variante, para não colidir consigo mesma. */
  selfId?: string | null
  /**
   * Outras variantes da biblioteca, para copiar o schema de uma delas.
   * Metade das que não têm schema repete a forma de outra que já está
   * pronta — `body_title`/`body_text`/`body_cta_label` aparece em quatro.
   */
  schemaSources?: Array<{
    id: string
    name: string
    block_type: string
    output_schema?: ComponentOutputField[] | null
  }>
}) {
  const setField = (i: number, f: ComponentOutputField) =>
    onChange(schema.map((x, j) => (j === i ? f : x)))
  const delField = (i: number) => onChange(schema.filter((_, j) => j !== i))
  /** Traz os campos de outra variante, sem sobrescrever os daqui. */
  function copyFrom(sourceId: string) {
    const src = (schemaSources ?? []).find((v) => v.id === sourceId)
    if (!src) return
    const r = mergeSchemas(schema, src.output_schema ?? [])
    if (r.added.length === 0) {
      toast({
        title: "Nada a copiar",
        description:
          r.skipped.length > 0
            ? `Todos os ${r.skipped.length} campos de “${src.name}” já existem aqui.`
            : `“${src.name}” não tem campos.`,
      })
      return
    }
    onChange(r.schema)
    toast({
      title: `${r.added.length} campo(s) copiado(s)`,
      description:
        `De “${src.name}”.` +
        (r.skipped.length > 0
          ? ` ${r.skipped.length} já existia(m) aqui e ficou(aram) como está(ão): ${r.skipped.join(", ")}.`
          : ""),
    })
  }

  const addField = () =>
    onChange([
      ...schema,
      {
        key: "novo_campo",
        label: "Novo campo",
        type: "text_short",
        max_len: 60,
        required: false,
        example: "",
        guidance: "",
      },
    ])

  return (
    <EGCard
      title="Schema de output"
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(schemaSources ?? []).some(
            (v) => v.id !== selfId && (v.output_schema?.length ?? 0) > 0,
          ) && (
            <div style={{ width: 210 }}>
              <EGSelect
                value=""
                placeholder="copiar campos de…"
                onChange={(v) => v && copyFrom(v)}
                options={(schemaSources ?? [])
                  .filter(
                    (v) =>
                      v.id !== selfId && (v.output_schema?.length ?? 0) > 0,
                  )
                  // Mesma seção primeiro: é de onde a forma costuma servir.
                  .sort(
                    (a, b) =>
                      Number(b.block_type === blockType) -
                        Number(a.block_type === blockType) ||
                      a.name.localeCompare(b.name),
                  )
                  .map((v) => ({
                    value: v.id,
                    label: `${v.name} (${v.output_schema?.length})`,
                  }))}
              />
            </div>
          )}
        <button
          type="button"
          onClick={addField}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.g700,
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: F.sans,
            cursor: "pointer",
          }}
        >
          <Plus size={14} /> Campo
        </button>
        </div>
      }
    >
      <div
        style={{
          fontSize: 12.5,
          color: C.g500,
          fontFamily: F.sans,
          marginBottom: 14,
        }}
      >
        Campos que a IA gera para este bloco. Chave técnica, tipo, limite e
        exemplo alimentam o preview e o prompt.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {schema.map((f, i) => (
          <SchemaRow
            key={i}
            field={f}
            onChange={(nf) => setField(i, nf)}
            onDelete={() => delField(i)}
            onDuplicate={() =>
              onChange([
                ...schema.slice(0, i + 1),
                duplicateField(
                  f,
                  schema.map((x) => x.key ?? ""),
                ),
                ...schema.slice(i + 1),
              ])
            }
          />
        ))}
        {schema.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: C.g400,
              fontFamily: F.sans,
              textAlign: "center",
              padding: 24,
              border: `1px dashed ${C.border}`,
              borderRadius: 10,
            }}
          >
            Nenhum campo. Clique em “Campo” para adicionar.
          </div>
        )}
      </div>
    </EGCard>
  )
}
