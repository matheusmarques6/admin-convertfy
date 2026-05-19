"use client"

import { useState } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"
import type {
  TaskStoreContext,
  BrandBrainSource,
} from "@/types/task-store-context"

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

function ExtraSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: C.gray50,
        border: `1px solid ${C.gray200}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: C.gray500,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: C.gray700 }}>
        {children}
      </div>
    </div>
  )
}

function ChipList({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "do" | "dont" }) {
  const palette = {
    neutral: { bg: C.gray100, fg: C.gray700 },
    do: { bg: "#ECFDF5", fg: "#047857" },
    dont: { bg: "#FEF2F2", fg: "#BE123C" },
  }[tone]
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            fontSize: 11,
            background: palette.bg,
            color: palette.fg,
            padding: "2px 8px",
            borderRadius: 10,
            fontWeight: 500,
          }}
        >
          {it}
        </span>
      ))}
    </div>
  )
}

export function BlockBrandBrain({ taskId }: { taskId: string }) {
  const { data, loading, error } = useFetch<TaskStoreContext>(
    taskId ? `/api/tasks/${taskId}/store-context` : null,
  )
  const [showFull, setShowFull] = useState(false)

  if (loading) {
    return (
      <BlockSection title="Brand Brain">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando contexto da marca...
        </div>
      </BlockSection>
    )
  }

  const bb = data?.brand_brain
  const sourceLabel = labelForSource(bb?.source ?? "empty")

  if (error || !bb || bb.source === "empty") {
    const status = data?.briefing_status
    let description = "Será criado automaticamente quando o cliente preencher 100% do formulário ou quando o time curar o diagnóstico na aba Contexto."
    if (status === "generating") description = "IA está gerando o briefing agora. Aguarde alguns segundos."
    if (status === "needs_review") description = "Briefing aguardando ajustes solicitados pelo cliente."
    return (
      <BlockSection title="Brand Brain" badge={<Badge label="IA" tone="purple" />}>
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

  const hasExtras =
    !!bb.brand_thesis ||
    !!bb.brand_presence ||
    (bb.icp_motivations?.length ?? 0) > 0 ||
    (bb.icp_frictions?.length ?? 0) > 0 ||
    (bb.tone_do?.length ?? 0) > 0 ||
    (bb.tone_dont?.length ?? 0) > 0

  return (
    <BlockSection
      title="Brand Brain"
      badge={
        <span style={{ display: "inline-flex", gap: 4 }}>
          <Badge label="IA" tone="purple" />
          {sourceLabel && <Badge label={sourceLabel.text} tone={sourceLabel.tone} />}
        </span>
      }
      action={
        hasExtras && (
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
        )
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
        <Quadrante label="Tom de voz" value={bb.language_tone} />
        <Quadrante label="Posicionamento" value={bb.about_brand} />
        <Quadrante label="Persona" value={bb.audience} />
        <Quadrante label="Ofertas & diferenciais" value={bb.offers_and_differentials} />
      </div>

      {showFull && hasExtras && (
        <>
          {bb.brand_thesis && (
            <ExtraSection label="Pull-quote da marca">{bb.brand_thesis}</ExtraSection>
          )}
          {bb.brand_presence && (
            <ExtraSection label="Presença digital">{bb.brand_presence}</ExtraSection>
          )}
          {(bb.icp_motivations?.length ?? 0) > 0 && (
            <ExtraSection label="Motivações do ICP">
              <ChipList items={bb.icp_motivations!} />
            </ExtraSection>
          )}
          {(bb.icp_frictions?.length ?? 0) > 0 && (
            <ExtraSection label="Fricções do ICP">
              <ChipList items={bb.icp_frictions!} />
            </ExtraSection>
          )}
          {(bb.tone_do?.length ?? 0) > 0 && (
            <ExtraSection label="Tom · DO">
              <ChipList items={bb.tone_do!} tone="do" />
            </ExtraSection>
          )}
          {(bb.tone_dont?.length ?? 0) > 0 && (
            <ExtraSection label="Tom · DON'T">
              <ChipList items={bb.tone_dont!} tone="dont" />
            </ExtraSection>
          )}
        </>
      )}
    </BlockSection>
  )
}

function labelForSource(
  source: BrandBrainSource,
): { text: string; tone: "purple" | "gray" | "blue" } | null {
  switch (source) {
    case "curated":
      return { text: "Diagnóstico do time", tone: "gray" }
    case "briefing":
      return { text: "Briefing IA", tone: "purple" }
    case "mixed":
      return { text: "Diagnóstico + briefing", tone: "blue" }
    case "empty":
      return null
  }
}

function Badge({
  label,
  tone = "purple",
}: {
  label: string
  tone?: "purple" | "gray" | "blue"
}) {
  const palette = {
    purple: { bg: C.purple, fg: "#fff" },
    gray: { bg: C.gray200, fg: C.gray700 },
    blue: { bg: C.brandBlue, fg: "#fff" },
  }[tone]
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        background: palette.bg,
        color: palette.fg,
        padding: "2px 6px",
        borderRadius: 3,
        letterSpacing: 0.6,
      }}
    >
      {label}
    </span>
  )
}
