"use client"

import { useEffect, useState } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"

export function BlockCriteriosAceitacao({ taskId }: { taskId: string }) {
  const { data, loading, mutate } = useFetch<{ criteria: string[] }>(
    `/api/tasks/${taskId}/acceptance-criteria`,
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])

  useEffect(() => {
    if (data?.criteria) setDraft(data.criteria)
  }, [data])

  async function save() {
    const filtered = draft.map((s) => s.trim()).filter(Boolean)
    await fetch(`/api/tasks/${taskId}/acceptance-criteria`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ criteria: filtered }),
    })
    setEditing(false)
    mutate()
  }

  if (loading) {
    return (
      <BlockSection title="Critérios de aceitação">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando...
        </div>
      </BlockSection>
    )
  }

  const criteria = data?.criteria ?? []

  return (
    <BlockSection
      title="Critérios de aceitação"
      action={
        editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(criteria)
              }}
              style={{
                fontSize: 11,
                color: C.gray500,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                background: C.brandBlue,
                border: "none",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 4,
              }}
            >
              Salvar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.brandBlue,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            {criteria.length > 0 ? "Editar" : "Adicionar"}
          </button>
        )
      }
    >
      {editing ? (
        <div>
          {draft.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input
                value={c}
                onChange={(e) =>
                  setDraft((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))
                }
                placeholder="Critério (ex: largura 600px responsivo)"
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 12,
                  border: `1px solid ${C.gray200}`,
                  borderRadius: 4,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setDraft((arr) => arr.filter((_, idx) => idx !== i))}
                style={{
                  fontSize: 11,
                  color: C.red,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                }}
                aria-label="Remover"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft((arr) => [...arr, ""])}
            style={{
              fontSize: 11,
              color: C.brandBlue,
              fontWeight: 600,
              background: "transparent",
              border: `1px dashed ${C.brandBlue}40`,
              borderRadius: 4,
              padding: "6px 10px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            + Adicionar critério
          </button>
        </div>
      ) : criteria.length === 0 ? (
        <EmptyState
          title="Sem critérios definidos"
          description="Adicione os critérios que a task precisa atender para ser considerada concluída."
        />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {criteria.map((c, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "6px 0",
                fontSize: 13,
                color: C.gray900,
                borderBottom: i < criteria.length - 1 ? `1px solid ${C.gray100}` : "none",
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="11" fill={C.greenBg} />
                <path
                  d="M8 12.5l2.5 2.5L16 9"
                  stroke={C.green}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {c}
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  )
}
