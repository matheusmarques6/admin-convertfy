"use client"

/**
 * Editor do output_schema de uma variante (aba Componentes).
 * Cada linha = um campo que a IA gera: key, label, tipo, maxLen, obrigatório,
 * exemplo e orientação específica pro campo.
 */

import { Trash2, Plus } from "lucide-react"
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
  classifyKeyCollision,
  suggestScopedKey,
  type KeyCollision,
  type KeyUser,
} from "@/lib/email-workspace/key-collision"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import { EGCard, EGCheck, EGSelect } from "@/components/email-generation/ui/eg-atoms"

const rowInput: React.CSSProperties = { ...egInputStyle, height: 32 }

function SchemaRow({
  field,
  onChange,
  onDelete,
  collision,
  onFixKey,
}: {
  field: ComponentOutputField
  onChange: (f: ComponentOutputField) => void
  onDelete: () => void
  collision?: KeyCollision
  onFixKey?: () => void
}) {
  const conflita = collision?.severity === "conflita"
  return (
    <div
      style={{
        border: `1px solid ${conflita ? C.warnBorder : C.border}`,
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

      {/* Colisão de key. Só avisa quando outra SEÇÃO usa a mesma key: as duas
          convivem no mesmo email, viram o mesmo {{PLACEHOLDER}}, e o set_text
          do merge troca todas as ocorrências — a copy de uma é escrita na
          outra. Repetição dentro da mesma seção é reuso legítimo (só existe
          uma hero por email), então fica em nota discreta. Nunca bloqueia. */}
      {conflita && (
        <div
          style={{
            marginTop: 10,
            padding: "9px 11px",
            borderRadius: 7,
            background: C.warnBg,
            border: `1px solid ${C.warnBorder}`,
            fontSize: 12,
            fontFamily: F.sans,
            color: C.warn,
            lineHeight: 1.45,
          }}
        >
          <strong>Também em outra seção</strong> —{" "}
          {collision!.outras_secoes
            .map((v) => `${v.name} (${v.block_type})`)
            .join(", ")}
          . Se as duas caírem no mesmo email, viram o mesmo{" "}
          <code style={{ fontFamily: F.mono }}>
            {`{{${field.key.toUpperCase()}}}`}
          </code>{" "}
          e a copy de uma é escrita na outra.
          {onFixKey && (
            <button
              type="button"
              onClick={onFixKey}
              style={{
                marginLeft: 8,
                border: `1px solid ${C.warnBorder}`,
                background: C.white,
                color: C.warn,
                borderRadius: 6,
                padding: "2px 9px",
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: F.sans,
                cursor: "pointer",
              }}
            >
              Escopar pela seção
            </button>
          )}
        </div>
      )}
      {collision?.severity === "mesma_secao" && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            fontFamily: F.sans,
            color: C.g500,
          }}
        >
          Mesma key em {collision.mesma_secao.length} variante
          {collision.mesma_secao.length > 1 ? "s" : ""} da mesma seção — elas
          não convivem no mesmo email, então não há conflito.
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
  keyUsage,
}: {
  schema: ComponentOutputField[]
  onChange: (schema: ComponentOutputField[]) => void
  /** Seção da variante — decide se a colisão conflita ou é reuso. */
  blockType?: string
  /** Id da própria variante, para não colidir consigo mesma. */
  selfId?: string | null
  /** Uso cru vindo de `/api/admin/components/key-usage`. */
  keyUsage?: Record<string, KeyUser[]>
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
            collision={
              blockType && keyUsage
                ? classifyKeyCollision(
                    blockType,
                    keyUsage[f.key?.trim() ?? ""] ?? [],
                    selfId,
                  )
                : undefined
            }
            onFixKey={
              blockType
                ? () =>
                    setField(i, {
                      ...f,
                      key: suggestScopedKey(blockType, f.key),
                    })
                : undefined
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
