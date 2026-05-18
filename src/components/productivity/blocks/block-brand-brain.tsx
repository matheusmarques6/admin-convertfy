"use client"

import { useState } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"

type StoreContext = {
  briefing: Record<string, unknown> | null
  briefing_status?: string
  onboarding_id: string | null
}

// Briefing tem várias formas dependendo da fase. Tentamos extrair os 4
// quadrantes mais úteis pro drawer: tom de voz, posicionamento,
// persona, benefícios-chave. Faz fallback pro shape antigo.
function parseBriefing(b: Record<string, unknown> | null) {
  if (!b || typeof b !== "object") return null
  // Estrutura nova esperada:
  const tom =
    (b.language_tone as string | undefined) ??
    (b.tom_voz as string | undefined) ??
    (b.tone as string | undefined) ??
    null
  const posicionamento =
    (b.about_brand as string | undefined) ??
    (b.posicionamento as string | undefined) ??
    (b.positioning as string | undefined) ??
    null
  const persona =
    (b.audience as string | undefined) ??
    (b.persona as string | undefined) ??
    null
  let beneficios: string[] = []
  const bRaw =
    (b.offers_and_differentials as unknown) ??
    (b.beneficios as unknown) ??
    (b.benefits as unknown) ??
    null
  if (typeof bRaw === "string") {
    beneficios = bRaw.split(/[\n·•,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  } else if (Array.isArray(bRaw)) {
    beneficios = bRaw.filter((x): x is string => typeof x === "string")
  }
  return { tom, posicionamento, persona, beneficios }
}

function Quadrante({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: 12,
        background: "#fff",
        border: `1px solid ${C.purpleBorder}40`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: C.purpleText,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: C.gray900,
        }}
      >
        {value || <span style={{ color: C.gray500, fontStyle: "italic" }}>—</span>}
      </div>
    </div>
  )
}

export function BlockBrandBrain({ taskId }: { taskId: string }) {
  const { data, loading, error } = useFetch<StoreContext>(
    taskId ? `/api/tasks/${taskId}/store-context` : null,
  )
  const [showFull, setShowFull] = useState(false)

  if (loading) {
    return (
      <BlockSection title="Brand Brain">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando briefing...
        </div>
      </BlockSection>
    )
  }

  if (error || !data?.briefing) {
    const status = data?.briefing_status
    let description = "Será criado automaticamente quando o cliente preencher 100% do formulário."
    if (status === "generating") description = "IA está gerando o briefing agora. Aguarde alguns segundos."
    if (status === "needs_review") description = "Briefing aguardando ajustes solicitados pelo cliente."
    return (
      <BlockSection title="Brand Brain" badge={<Badge label="IA" />}>
        <EmptyState
          title={
            status === "generating"
              ? "Gerando..."
              : "Brand Brain ainda não gerado"
          }
          description={description}
        />
      </BlockSection>
    )
  }

  const parsed = parseBriefing(data.briefing)
  if (!parsed) {
    return (
      <BlockSection title="Brand Brain" badge={<Badge label="IA" />}>
        <EmptyState title="Formato inesperado" description="O briefing salvo não tem a estrutura esperada." />
      </BlockSection>
    )
  }

  const briefingFull = JSON.stringify(data.briefing, null, 2)

  return (
    <BlockSection
      title="Brand Brain"
      badge={<Badge label="IA" />}
      action={
        <button
          type="button"
          onClick={() => setShowFull(!showFull)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.purpleText,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 4,
          }}
        >
          {showFull ? "Recolher" : "Ver completo →"}
        </button>
      }
    >
      <div
        style={{
          background: C.purpleBg,
          border: `1px solid ${C.purpleBorder}30`,
          borderRadius: 6,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        <Quadrante label="Tom de voz" value={parsed.tom} />
        <Quadrante label="Posicionamento" value={parsed.posicionamento} />
        <Quadrante label="Persona" value={parsed.persona} />
        <Quadrante
          label="Benefícios-chave"
          value={
            parsed.beneficios.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 14 }}>
                {parsed.beneficios.map((b, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
      </div>

      {showFull && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: C.gray50,
            border: `1px solid ${C.gray200}`,
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color: C.gray700,
            maxHeight: 320,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {briefingFull}
        </div>
      )}
    </BlockSection>
  )
}

function Badge({ label }: { label: string }) {
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
      {label}
    </span>
  )
}
