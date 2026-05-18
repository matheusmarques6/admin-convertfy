"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Edit2, X } from "lucide-react"

interface InlineEditBaseProps {
  value: string | number | null
  /** Texto exibido em read-mode. Se omitido, usa value. */
  display?: string | null
  /** Placeholder do input em edit-mode + display "—" em read-mode quando vazio. */
  placeholder?: string
  onSave: (next: string) => Promise<void> | void
  /** Mostra ícone de pencil em hover sempre. Quando false, fica só visível em focus. */
  alwaysShowEdit?: boolean
  className?: string
  /** Estilo do display (read-mode). Cor/peso. */
  displayStyle?: React.CSSProperties
  /** Estilo aplicado em ambos (read + edit) — ex: tamanho de fonte. */
  rootStyle?: React.CSSProperties
}

interface InlineEditTextProps extends InlineEditBaseProps {
  type?: "text"
  maxLength?: number
}

interface InlineEditNumberProps extends InlineEditBaseProps {
  type: "number"
  min?: number
  max?: number
  step?: number
  /** Prefixo (ex: "R$ ") aplicado ao display em read-mode. */
  prefix?: string
  /** Sufixo (ex: " /mês") aplicado ao display em read-mode. */
  suffix?: string
}

interface InlineEditTextareaProps extends InlineEditBaseProps {
  type: "textarea"
  rows?: number
}

interface InlineEditSelectProps extends InlineEditBaseProps {
  type: "select"
  options: Array<{ value: string; label: string }>
}

type InlineEditFieldProps =
  | InlineEditTextProps
  | InlineEditNumberProps
  | InlineEditTextareaProps
  | InlineEditSelectProps

/**
 * Campo de edição inline:
 *   - read mode: mostra valor + ícone pencil em hover
 *   - click: vira input/textarea/select
 *   - Enter (ou blur) salva via onSave; Esc cancela
 *   - durante save: ícone substituído por spinner; bordas escurecem
 *   - erro: mensagem inline em baixo, mantem em edit mode
 *
 * Os 4 variants compartilham o mesmo wrapper visual; só muda o
 * controle de input.
 */
export function InlineEditField(props: InlineEditFieldProps) {
  const {
    value,
    display,
    placeholder,
    onSave,
    alwaysShowEdit,
    className,
    displayStyle,
    rootStyle,
  } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)

  // Sincroniza draft quando value externo muda (ex: refetch)
  useEffect(() => {
    if (!editing) setDraft(value == null ? "" : String(value))
  }, [value, editing])

  // Autofocus quando entra em edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement && props.type !== "number") {
        inputRef.current.select()
      }
    }
  }, [editing, props.type])

  const beginEdit = () => {
    setEditing(true)
    setError(null)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value == null ? "" : String(value))
    setError(null)
  }

  const commit = async () => {
    const trimmed = draft.trim()
    // Se nao mudou, so fecha
    const original = value == null ? "" : String(value)
    if (trimmed === original.trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      cancel()
      return
    }
    if (e.key === "Enter") {
      // Em textarea, Enter quebra linha; Ctrl/Cmd+Enter envia
      if (props.type === "textarea") {
        if (!e.metaKey && !e.ctrlKey) return
      }
      e.preventDefault()
      commit()
    }
  }

  const displayLabel = (() => {
    if (display != null) return display
    if (value == null || value === "") return placeholder ?? "—"
    if (props.type === "select") {
      const opt = props.options.find((o) => o.value === String(value))
      return opt?.label ?? String(value)
    }
    if (props.type === "number") {
      const num = typeof value === "number" ? value : parseFloat(String(value))
      if (!Number.isFinite(num)) return placeholder ?? "—"
      return `${props.prefix ?? ""}${num.toLocaleString("pt-BR")}${props.suffix ?? ""}`
    }
    return String(value)
  })()

  const isEmpty = value == null || value === ""

  if (!editing) {
    return (
      <div
        className={`inline-edit-read group ${className ?? ""}`}
        onClick={beginEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            beginEdit()
          }
        }}
        role="button"
        tabIndex={0}
        title="Clique para editar"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 6px",
          marginLeft: -6,
          marginRight: -6,
          borderRadius: 4,
          cursor: "pointer",
          transition: "background 120ms ease",
          maxWidth: "100%",
          ...rootStyle,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--crm-gray-50)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
      >
        <span
          style={{
            color: isEmpty ? "var(--crm-gray-400)" : undefined,
            fontStyle: isEmpty ? "italic" : undefined,
            ...displayStyle,
          }}
          className="truncate"
        >
          {displayLabel}
        </span>
        <Edit2
          className="h-3 w-3 shrink-0"
          style={{
            color: "var(--crm-gray-400)",
            opacity: alwaysShowEdit ? 0.6 : 0,
            transition: "opacity 120ms ease",
          }}
          aria-hidden
        />
        <style jsx>{`
          .inline-edit-read:hover :global(svg) {
            opacity: 0.7 !important;
          }
          .inline-edit-read:focus-visible {
            outline: 2px solid var(--crm-brand);
            outline-offset: 1px;
          }
        `}</style>
      </div>
    )
  }

  // ── Edit mode ──
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        width: "100%",
        ...rootStyle,
      }}
    >
      <div className="flex items-start gap-1.5" style={{ minWidth: 0 }}>
        {props.type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={saving}
            rows={props.rows ?? 3}
            style={{
              flex: 1,
              padding: "6px 8px",
              fontSize: "inherit",
              fontFamily: "var(--crm-font-sans)",
              border: `1px solid ${error ? "var(--crm-neg)" : "var(--crm-brand)"}`,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              outline: "none",
              resize: "vertical",
              minHeight: 64,
              boxShadow: error
                ? "0 0 0 3px var(--crm-neg-bg)"
                : "0 0 0 3px var(--crm-blue-50)",
            }}
          />
        ) : props.type === "select" ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            disabled={saving}
            style={{
              flex: 1,
              height: 28,
              padding: "0 8px",
              fontSize: "inherit",
              fontFamily: "var(--crm-font-sans)",
              border: `1px solid ${error ? "var(--crm-neg)" : "var(--crm-brand)"}`,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              outline: "none",
              boxShadow: error
                ? "0 0 0 3px var(--crm-neg-bg)"
                : "0 0 0 3px var(--crm-blue-50)",
            }}
          >
            {props.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={props.type === "number" ? "number" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={saving}
            {...(props.type === "number"
              ? {
                  min: props.min,
                  max: props.max,
                  step: props.step ?? 1,
                  inputMode: "decimal" as const,
                }
              : {
                  maxLength: (props as InlineEditTextProps).maxLength,
                })}
            style={{
              flex: 1,
              height: 28,
              padding: "0 8px",
              fontSize: "inherit",
              fontFamily: "var(--crm-font-sans)",
              border: `1px solid ${error ? "var(--crm-neg)" : "var(--crm-brand)"}`,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              outline: "none",
              boxShadow: error
                ? "0 0 0 3px var(--crm-neg-bg)"
                : "0 0 0 3px var(--crm-blue-50)",
              minWidth: 0,
            }}
          />
        )}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={commit}
            disabled={saving}
            title="Salvar (Enter)"
            aria-label="Salvar"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              border: 0,
              cursor: saving ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            title="Cancelar (Esc)"
            aria-label="Cancelar"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-600)",
              border: "1px solid var(--crm-border)",
              cursor: saving ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && (
        <span style={{ fontSize: 11, color: "var(--crm-neg)" }}>{error}</span>
      )}
    </div>
  )
}
