"use client"

import { useState } from "react"
import { FileText, Sparkles } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { InlineEditField } from "@/components/crm/inline-edit-field"
import type { StoreBriefing, BriefingMarca, BriefingDetail } from "@/types/email-workspace"

interface BriefingResourceViewProps {
  storeId: string
  briefing: StoreBriefing | null
  onChanged: () => void
}

export function BriefingResourceView({
  storeId,
  briefing,
  onChanged,
}: BriefingResourceViewProps) {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<"marca" | "briefing">("marca")
  const [generating, setGenerating] = useState(false)

  const handleAiTreatment = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/process-briefing`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || "Falha ao tratar briefing")
      }
      toast.toast({
        title: "Briefing tratado",
        description: "Versão nova criada via IA",
      })
      onChanged()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setGenerating(false)
    }
  }

  const patchBriefing = async (
    section: "marca" | "briefing",
    update: Record<string, unknown>,
  ) => {
    if (!briefing) {
      // Cria versao manual
      const res = await fetch(`/api/admin/stores/${storeId}/briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [section]: update,
          source: "manual",
        }),
      })
      if (!res.ok) throw new Error("Falha ao criar briefing")
      onChanged()
      return
    }
    const next = { ...(briefing[section] as object), ...update }
    const res = await fetch(`/api/admin/stores/${storeId}/briefing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [section]: next,
        source: "edited",
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || "Falha ao salvar")
    }
    onChanged()
  }

  const lastUpdate = briefing ? formatRelativeTime(briefing.created_at) : null

  const marca: BriefingMarca = briefing?.marca ?? {}
  const detail: BriefingDetail = briefing?.briefing ?? {}

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--crm-gray-50)" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between sticky top-0 z-10"
        style={{
          padding: "20px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-[8px]"
            style={{
              width: 32,
              height: 32,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--crm-gray-900)",
                  letterSpacing: "-0.015em",
                }}
              >
                Briefing da loja
              </h2>
              {briefing && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    background: "var(--crm-warn-bg)",
                    color: "var(--crm-warn)",
                    border: "1px solid var(--crm-warn-border)",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  Tratado por IA · v{briefing.version}
                </span>
              )}
            </div>
            {lastUpdate && (
              <span style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
                · revisado pela última vez {lastUpdate}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleAiTreatment}
          disabled={generating}
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 12px",
            background: briefing ? "var(--crm-gray-0)" : "var(--crm-brand)",
            color: briefing ? "var(--crm-gray-700)" : "var(--crm-brand-fg)",
            border: briefing ? "1px solid var(--crm-border)" : 0,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: generating ? "default" : "pointer",
            opacity: generating ? 0.6 : 1,
          }}
        >
          <Sparkles className="h-3 w-3" />
          {briefing ? "Refazer com IA" : "Tratar briefing com IA"}
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 sticky"
        style={{
          top: 73,
          zIndex: 9,
          padding: "0 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <TabButton
          active={activeTab === "marca"}
          onClick={() => setActiveTab("marca")}
          label="Marca"
          subtitle="Posicionamento + voz"
        />
        <TabButton
          active={activeTab === "briefing"}
          onClick={() => setActiveTab("briefing")}
          label="Briefing"
          subtitle="Estratégia + restrições"
        />
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px 48px" }}>
        {activeTab === "marca" && (
          <>
            {/* Slogan card — sempre aparece pra permitir adicionar */}
            {(briefing || marca.slogan !== undefined) && (
              <div
                style={{
                  padding: "32px 32px",
                  background:
                    "linear-gradient(135deg, var(--crm-warn-bg) 0%, var(--crm-gray-0) 100%)",
                  border: "1px solid var(--crm-warn-border)",
                  borderRadius: 14,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--crm-warn)",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  SLOGAN
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: "var(--crm-gray-900)",
                    fontStyle: "italic",
                    lineHeight: 1.3,
                  }}
                >
                  &ldquo;
                  <InlineEditField
                    value={marca.slogan ?? null}
                    placeholder="Slogan da marca"
                    onSave={(v) => patchBriefing("marca", { slogan: v || null })}
                    displayStyle={{ fontSize: 24, fontWeight: 600, fontStyle: "italic" }}
                  />
                  &rdquo;
                </div>
              </div>
            )}

            {/* Posicionamento */}
            <RowField
              label="Nicho"
              value={marca.nicho}
              placeholder="Ex: E-commerce de calçados esportivos · vôlei e basquete"
              onSave={(v) => patchBriefing("marca", { nicho: v })}
            />
            <RowField
              label="Diferencial declarado"
              value={marca.diferencial}
              placeholder="O que distingue essa loja..."
              onSave={(v) => patchBriefing("marca", { diferencial: v })}
              textarea
            />
            <RowField
              label="Persona-alvo"
              value={marca.persona}
              placeholder="Descreva o público-alvo..."
              onSave={(v) => patchBriefing("marca", { persona: v })}
              textarea
            />

            {/* Tom de voz */}
            <SectionLabel style={{ marginTop: 28 }}>Tom de voz</SectionLabel>
            <p style={{ fontSize: 11, color: "var(--crm-gray-500)", margin: "4px 0 12px" }}>
              Atributos do tom da marca
            </p>
            <ToneSelector
              tom={marca.tom_voz}
              onSave={(v) => patchBriefing("marca", { tom_voz: v })}
            />

            <div
              className="flex items-center gap-2"
              style={{ marginTop: 24, fontSize: 13 }}
            >
              <span style={{ color: "var(--crm-gray-500)" }}>
                Posicionamento de preço
              </span>
              <PositioningSelector
                pos={marca.posicionamento}
                onSave={(v) => patchBriefing("marca", { posicionamento: v })}
              />
            </div>

            {/* Hashtags */}
            <SectionLabel style={{ marginTop: 28 }}>Hashtags da marca</SectionLabel>
            <p style={{ fontSize: 11, color: "var(--crm-gray-500)", margin: "4px 0 12px" }}>
              Usadas em campanhas e UGC
            </p>
            <TagListEditor
              tags={marca.hashtags ?? []}
              prefix="#"
              onSave={(tags) => patchBriefing("marca", { hashtags: tags })}
            />
          </>
        )}

        {activeTab === "briefing" && (
          <>
            <RowField
              label="Nível de liberdade criativa"
              value={detail.nivel_liberdade}
              placeholder="Alto / Médio / Baixo"
              onSave={(v) => patchBriefing("briefing", { nivel_liberdade: v })}
            />
            <RowField
              label="Aprova antes de enviar"
              value={detail.aprova_antes}
              placeholder="Quem precisa aprovar? Com qual prazo?"
              onSave={(v) => patchBriefing("briefing", { aprova_antes: v })}
            />
            <RowField
              label="Conceito atual"
              value={detail.conceito}
              placeholder="Conceito visual / campanha em vigor..."
              onSave={(v) => patchBriefing("briefing", { conceito: v })}
              textarea
            />
            <RowField
              label="Sensibilidades"
              value={detail.sensibilidade}
              placeholder="Temas, palavras, abordagens a evitar..."
              onSave={(v) => patchBriefing("briefing", { sensibilidade: v })}
              textarea
            />

            {/* Diferenciais */}
            <SectionLabel style={{ marginTop: 28 }}>
              Diferenciais
            </SectionLabel>
            <p style={{ fontSize: 11, color: "var(--crm-gray-500)", margin: "4px 0 12px" }}>
              Pontos fortes pra explorar nas campanhas
            </p>
            <BulletListEditor
              items={detail.diferenciais ?? []}
              tone="pos"
              onSave={(items) => patchBriefing("briefing", { diferenciais: items })}
              placeholder="ex: Frete grátis em todo Brasil"
            />

            {/* Restrições */}
            <SectionLabel style={{ marginTop: 28 }}>Restrições</SectionLabel>
            <p style={{ fontSize: 11, color: "var(--crm-gray-500)", margin: "4px 0 12px" }}>
              Limites que o time precisa respeitar
            </p>
            <BulletListEditor
              items={detail.restricoes ?? []}
              tone="warn"
              onSave={(items) => patchBriefing("briefing", { restricoes: items })}
              placeholder="ex: Não usar fotos de outras marcas"
            />

            {/* Competidores */}
            <SectionLabel style={{ marginTop: 28 }}>Competidores</SectionLabel>
            <TagListEditor
              tags={detail.competidores ?? []}
              onSave={(tags) => patchBriefing("briefing", { competidores: tags })}
              placeholder="Nome do competidor"
            />

            {/* Politicas */}
            <SectionLabel style={{ marginTop: 28 }}>
              Políticas e regras
            </SectionLabel>
            <p style={{ fontSize: 11, color: "var(--crm-gray-500)", margin: "4px 0 12px" }}>
              Frete, devolução, garantia, prazo de pagamento... incluir em rodapé/comunicação
            </p>
            <PoliciesEditor
              items={detail.politicas ?? []}
              onSave={(items) => patchBriefing("briefing", { politicas: items })}
            />
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  label: string
  subtitle: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "14px 4px",
        background: "transparent",
        border: 0,
        borderBottom: active
          ? "2px solid var(--crm-brand)"
          : "2px solid transparent",
        color: active ? "var(--crm-brand)" : "var(--crm-gray-700)",
        cursor: "pointer",
        textAlign: "left",
        minWidth: 140,
        marginRight: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          color: active ? "var(--crm-brand)" : "var(--crm-gray-900)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, color: "var(--crm-gray-500)", marginTop: 1 }}>
        {subtitle}
      </div>
    </button>
  )
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 13,
        fontWeight: 600,
        color: "var(--crm-gray-900)",
        ...style,
      }}
    >
      {children}
    </h3>
  )
}

function RowField({
  label,
  value,
  placeholder,
  onSave,
  textarea,
}: {
  label: string
  value: string | undefined | null
  placeholder?: string
  onSave: (v: string) => Promise<void>
  textarea?: boolean
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "200px 1fr",
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid var(--crm-gray-100)",
        alignItems: textarea ? "start" : "center",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--crm-gray-500)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <div style={{ fontSize: 13, color: "var(--crm-gray-900)" }}>
        <InlineEditField
          type={textarea ? "textarea" : "text"}
          value={value ?? null}
          placeholder={placeholder}
          onSave={onSave}
          rows={3}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 13,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
            whiteSpace: textarea ? "pre-wrap" : "normal",
            display: textarea ? "block" : "inline",
            width: textarea ? "100%" : undefined,
          }}
        />
      </div>
    </div>
  )
}

const TONS = ["formal", "casual", "afetivo", "divertido"] as const

function ToneSelector({
  tom,
  onSave,
}: {
  tom: string | undefined
  onSave: (v: string) => Promise<void>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TONS.map((t) => {
        const active = tom === t
        return (
          <button
            key={t}
            onClick={() => onSave(t)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: active ? "var(--crm-blue-50)" : "var(--crm-gray-0)",
              border: active
                ? "1px solid var(--crm-blue-100)"
                : "1px solid var(--crm-border)",
              color: active ? "var(--crm-brand)" : "var(--crm-gray-700)",
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

const POSITIONS = ["popular", "medio", "premium"] as const

function PositioningSelector({
  pos,
  onSave,
}: {
  pos: string | undefined
  onSave: (v: string) => Promise<void>
}) {
  return (
    <div className="flex gap-1">
      {POSITIONS.map((p) => {
        const active = pos === p
        return (
          <button
            key={p}
            onClick={() => onSave(p)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: active ? "var(--crm-blue-50)" : "transparent",
              border: active
                ? "1px solid var(--crm-blue-100)"
                : "1px solid transparent",
              color: active ? "var(--crm-brand)" : "var(--crm-gray-700)",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {p === "medio" ? "Médio" : p === "popular" ? "Popular" : "Premium"}
          </button>
        )
      })}
    </div>
  )
}

function TagListEditor({
  tags,
  prefix,
  placeholder,
  onSave,
}: {
  tags: string[]
  prefix?: string
  placeholder?: string
  onSave: (tags: string[]) => Promise<void>
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onSave([...tags, v])
    setDraft("")
  }
  const remove = (i: number) => {
    const next = [...tags]
    next.splice(i, 1)
    onSave(next)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "4px 10px",
            background: "var(--crm-gray-100)",
            border: "1px solid var(--crm-border)",
            color: "var(--crm-gray-700)",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "var(--crm-font-mono, monospace)",
          }}
        >
          {prefix ?? ""}
          {t}
          <button
            onClick={() => remove(i)}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--crm-gray-500)",
              cursor: "pointer",
              padding: 0,
              fontSize: 12,
              lineHeight: 1,
            }}
            aria-label="Remover"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        placeholder={placeholder ?? "+ adicionar"}
        style={{
          padding: "4px 10px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-gray-300)",
          color: "var(--crm-gray-700)",
          borderRadius: 4,
          fontSize: 12,
          outline: "none",
          width: 140,
        }}
      />
    </div>
  )
}

function BulletListEditor({
  items,
  tone,
  placeholder,
  onSave,
}: {
  items: string[]
  tone: "pos" | "warn"
  placeholder?: string
  onSave: (items: string[]) => Promise<void>
}) {
  const [draft, setDraft] = useState("")
  const colors = {
    pos: {
      bg: "var(--crm-pos-bg)",
      border: "var(--crm-pos-border)",
      fg: "var(--crm-pos)",
    },
    warn: {
      bg: "var(--crm-warn-bg)",
      border: "var(--crm-warn-border)",
      fg: "var(--crm-warn)",
    },
  }[tone]
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onSave([...items, v])
    setDraft("")
  }
  const remove = (i: number) => {
    const next = [...items]
    next.splice(i, 1)
    onSave(next)
  }
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div
          key={`${it}-${i}`}
          className="flex items-start gap-2.5"
          style={{
            padding: "10px 14px",
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: colors.fg,
              marginTop: 7,
              flexShrink: 0,
            }}
          />
          <span
            className="flex-1"
            style={{
              fontSize: 13,
              color: "var(--crm-gray-800)",
              lineHeight: 1.45,
            }}
          >
            {it}
          </span>
          <button
            onClick={() => remove(i)}
            style={{
              background: "transparent",
              border: 0,
              color: colors.fg,
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
              lineHeight: 1,
            }}
            aria-label="Remover"
          >
            ×
          </button>
        </div>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        placeholder={placeholder ?? "+ adicionar"}
        style={{
          padding: "10px 14px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-gray-300)",
          color: "var(--crm-gray-700)",
          borderRadius: 8,
          fontSize: 13,
          outline: "none",
        }}
      />
    </div>
  )
}

function PoliciesEditor({
  items,
  onSave,
}: {
  items: Array<{ tipo: string; valor: string }>
  onSave: (items: Array<{ tipo: string; valor: string }>) => Promise<void>
}) {
  const [draftTipo, setDraftTipo] = useState("")
  const [draftValor, setDraftValor] = useState("")

  const add = () => {
    const tipo = draftTipo.trim()
    const valor = draftValor.trim()
    if (!tipo || !valor) return
    onSave([...items, { tipo, valor }])
    setDraftTipo("")
    setDraftValor("")
  }
  const remove = (i: number) => {
    const next = [...items]
    next.splice(i, 1)
    onSave(next)
  }
  const updateAt = (i: number, patch: { tipo?: string; valor?: string }) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    onSave(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-2"
          style={{
            padding: "8px 10px",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
          }}
        >
          <input
            type="text"
            value={p.tipo}
            onChange={(e) => updateAt(i, { tipo: e.target.value })}
            placeholder="Tipo (ex: Frete)"
            style={{
              padding: "4px 8px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              color: "var(--crm-gray-900)",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              width: 140,
              outline: "none",
            }}
          />
          <input
            type="text"
            value={p.valor}
            onChange={(e) => updateAt(i, { valor: e.target.value })}
            placeholder="Valor (ex: Grátis acima de R$199)"
            style={{
              flex: 1,
              padding: "4px 8px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              color: "var(--crm-gray-700)",
              borderRadius: 4,
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            onClick={() => remove(i)}
            aria-label="Remover"
            style={{
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid var(--crm-border)",
              borderRadius: 4,
              color: "var(--crm-gray-500)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div
        className="flex items-center gap-2"
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-gray-300)",
          borderRadius: 6,
        }}
      >
        <input
          type="text"
          value={draftTipo}
          onChange={(e) => setDraftTipo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draftTipo.trim() && draftValor.trim()) {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Tipo (ex: Devolução)"
          style={{
            padding: "4px 8px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            color: "var(--crm-gray-900)",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            width: 140,
            outline: "none",
          }}
        />
        <input
          type="text"
          value={draftValor}
          onChange={(e) => setDraftValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draftTipo.trim() && draftValor.trim()) {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Valor (ex: 30 dias após compra)"
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            color: "var(--crm-gray-700)",
            borderRadius: 4,
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          onClick={add}
          disabled={!draftTipo.trim() || !draftValor.trim()}
          style={{
            height: 24,
            padding: "0 10px",
            background:
              !draftTipo.trim() || !draftValor.trim()
                ? "var(--crm-gray-100)"
                : "var(--crm-brand)",
            color:
              !draftTipo.trim() || !draftValor.trim()
                ? "var(--crm-gray-400)"
                : "var(--crm-brand-fg)",
            border: 0,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor:
              !draftTipo.trim() || !draftValor.trim() ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          + Adicionar
        </button>
      </div>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return new Date(iso).toLocaleDateString("pt-BR")
}
