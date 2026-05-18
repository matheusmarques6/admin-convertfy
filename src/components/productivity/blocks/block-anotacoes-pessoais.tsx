"use client"

import { useEffect, useRef, useState } from "react"
import { BlockSection, MiniSpinner, useFetch, C } from "./_shared"

export function BlockAnotacoesPessoais({ taskId }: { taskId: string }) {
  const { data, loading } = useFetch<{ private_notes: string; can_edit: boolean }>(
    `/api/tasks/${taskId}/private-notes`,
  )
  const [value, setValue] = useState("")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<number | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (data?.private_notes != null && !initRef.current) {
      setValue(data.private_notes)
      initRef.current = true
    }
  }, [data])

  // Auto-save com debounce 800ms
  function onChange(v: string) {
    setValue(v)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      void save(v)
    }, 800)
  }

  async function save(v: string) {
    if (!data?.can_edit) return
    setSaving(true)
    try {
      const r = await fetch(`/api/tasks/${taskId}/private-notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ private_notes: v }),
      })
      if (r.ok) setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <BlockSection title="Anotações pessoais">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando...
        </div>
      </BlockSection>
    )
  }

  if (!data?.can_edit) {
    return (
      <BlockSection title="Anotações pessoais">
        <div style={{ fontSize: 12, color: C.gray500, padding: "16px 0", textAlign: "center" }}>
          Apenas o responsável da task pode adicionar anotações pessoais.
        </div>
      </BlockSection>
    )
  }

  return (
    <BlockSection
      title="Anotações pessoais"
      badge={
        <span style={{ fontSize: 10, color: C.gray500 }}>
          (privadas — só você vê)
        </span>
      }
      action={
        <div style={{ fontSize: 10, color: C.gray500, fontStyle: "italic" }}>
          {saving
            ? "Salvando..."
            : savedAt
            ? `Salvo ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </div>
      }
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Suas anotações sobre essa task..."
        style={{
          width: "100%",
          minHeight: 120,
          padding: 10,
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: "inherit",
          border: `1px solid ${C.gray200}`,
          borderRadius: 4,
          outline: "none",
          resize: "vertical",
          color: C.gray900,
        }}
        onBlur={() => save(value)}
      />
    </BlockSection>
  )
}
