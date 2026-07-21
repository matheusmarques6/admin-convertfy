"use client"

/**
 * Editor do output_schema de uma variante (aba Componentes).
 * Cada linha = um campo que a IA gera: key, label, tipo, maxLen, obrigatório,
 * exemplo e orientação específica pro campo.
 */

import { Trash2, Plus } from "lucide-react"
import type { ComponentOutputField } from "@/types/email-generation"
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS_PT,
  sanitizeOutputKeyInput,
  type ComponentFieldType,
} from "@/lib/agents/shared/component-dimensions"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import { EGCard, EGCheck, EGSelect } from "@/components/email-generation/ui/eg-atoms"

const rowInput: React.CSSProperties = { ...egInputStyle, height: 32 }

function SchemaRow({
  field,
  onChange,
  onDelete,
}: {
  field: ComponentOutputField
  onChange: (f: ComponentOutputField) => void
  onDelete: () => void
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
    </div>
  )
}

export function OutputSchemaEditor({
  schema,
  onChange,
}: {
  schema: ComponentOutputField[]
  onChange: (schema: ComponentOutputField[]) => void
}) {
  const setField = (i: number, f: ComponentOutputField) =>
    onChange(schema.map((x, j) => (j === i ? f : x)))
  const delField = (i: number) => onChange(schema.filter((_, j) => j !== i))
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
