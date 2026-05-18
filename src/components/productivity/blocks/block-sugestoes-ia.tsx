"use client"

import { useState } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"

type Variation = {
  label: "direto" | "beneficio" | "pergunta"
  headline: string
  body: string
  cta: string
}

type Suggestions = {
  generated_at: string
  model: string
  target_block: string
  variations: Variation[]
}

const LABELS = {
  direto: "Direto",
  beneficio: "Benefício",
  pergunta: "Pergunta",
} as const

const COLORS = {
  direto: C.brandBlue,
  beneficio: C.green,
  pergunta: C.amber,
} as const

function VariationCard({
  v,
  selected,
  onSelect,
}: {
  v: Variation
  selected: boolean
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const color = COLORS[v.label] ?? C.brandBlue
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        padding: 12,
        border: `1px solid ${selected ? color : C.gray200}`,
        borderRadius: 6,
        background: selected ? `${color}08` : "#fff",
        cursor: "pointer",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {LABELS[v.label]}
        </span>
        {selected && (
          <span style={{ fontSize: 10, color, fontWeight: 700 }}>✓ selecionada</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.gray900, marginBottom: 4 }}>
        {v.headline}
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.gray700,
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? "unset" : 3,
          overflow: "hidden",
        }}
      >
        {v.body}
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, color: C.brandBlue, fontWeight: 600 }}>
          CTA: {v.cta}
        </span>
        <span
          style={{
            fontSize: 10,
            color: C.gray500,
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
        >
          {expanded ? "Recolher" : "Ver tudo"}
        </span>
      </div>
    </button>
  )
}

export function BlockSugestoesIA({
  taskId,
  onApply,
}: {
  taskId: string
  onApply?: (variation: Variation) => void
}) {
  const { data, loading, mutate } = useFetch<{
    suggestions: Suggestions | null
    cached: boolean
    error?: string
  }>(`/api/tasks/${taskId}/ai-suggestions`)

  const [selected, setSelected] = useState<number | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  async function regenerate() {
    setRegenerating(true)
    try {
      const r = await fetch(`/api/tasks/${taskId}/ai-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force_regenerate: true, target_block: "hero" }),
      })
      if (r.ok) {
        setSelected(null)
        mutate()
      }
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <BlockSection title="Sugestões da IA" badge={<Badge />}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando sugestões...
        </div>
      </BlockSection>
    )
  }

  const suggestions = data?.suggestions
  const variations = suggestions?.variations ?? []

  return (
    <BlockSection
      title="Sugestões da IA"
      badge={<Badge />}
      action={
        suggestions && (
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.brandBlue,
              background: "transparent",
              border: `1px solid ${C.brandBlue}40`,
              cursor: regenerating ? "wait" : "pointer",
              padding: "4px 10px",
              borderRadius: 4,
              opacity: regenerating ? 0.6 : 1,
            }}
          >
            {regenerating ? "Gerando..." : "Pedir novas opções"}
          </button>
        )
      }
    >
      {!suggestions ? (
        <EmptyState
          title="Nenhuma sugestão gerada ainda"
          description={
            data?.error ??
            "A IA precisa do Brand Brain do cliente para gerar variações. Clique pra gerar agora."
          }
          action={
            <button
              type="button"
              onClick={regenerate}
              disabled={regenerating}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: C.brandBlue,
                border: "none",
                cursor: regenerating ? "wait" : "pointer",
                padding: "8px 16px",
                borderRadius: 4,
                opacity: regenerating ? 0.6 : 1,
              }}
            >
              {regenerating ? "Gerando 3 variações..." : "Gerar variações"}
            </button>
          }
        />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 8,
            }}
          >
            {variations.map((v, i) => (
              <VariationCard
                key={i}
                v={v}
                selected={selected === i}
                onSelect={() => setSelected(i)}
              />
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${C.gray100}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              color: C.gray500,
            }}
          >
            <span>
              Gerado {new Date(suggestions.generated_at).toLocaleString("pt-BR")} ·{" "}
              {suggestions.model}
            </span>
            {selected != null && (
              <button
                type="button"
                onClick={() => onApply?.(variations[selected])}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.brandBlue,
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 4,
                }}
              >
                Aplicar variação escolhida →
              </button>
            )}
          </div>
        </>
      )}
    </BlockSection>
  )
}

function Badge() {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        background: C.purple,
        color: "#fff",
        padding: "2px 6px",
        borderRadius: 3,
        letterSpacing: 0.6,
      }}
    >
      IA
    </span>
  )
}
