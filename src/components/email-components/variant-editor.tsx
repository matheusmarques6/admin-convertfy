"use client"

/**
 * Editor completo de uma variante da biblioteca de componentes (maquete EG).
 *
 * Grid 2 colunas: esquerda = Identificação + Contexto para a IA + Schema de
 * output (+ seção Avançado com slots/tags/thumbnail); direita (sticky) =
 * Estrutura & Preview com 3 sub-abas (Preview com exemplos do schema, HTML
 * editável, HTML renderizado — exemplo real do email colado manualmente,
 * campo próprio `rendered_html`).
 */

import { useMemo, useState, type ReactNode } from "react"

import { classifyRenderedHtml } from "@/lib/agents/shared/rendered-classify"
import { Check, ChevronDown, ChevronRight, Pencil } from "lucide-react"
import type {
  ComponentOutputField,
} from "@/types/email-generation"
import {
  COMPONENT_OBJECTIVES,
  COMPONENT_TONES,
  DENSITY_LABELS_PT,
} from "@/lib/agents/shared/component-dimensions"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import { C, F, egInputStyle } from "@/components/email-generation/ui/eg-theme"
import {
  EGBtn,
  EGCard,
  EGCheck,
  EGInput,
  EGLabel,
  EGNotice,
  EGRenderFrame,
  EGSelect,
  EGTextarea,
  EGToggle,
} from "@/components/email-generation/ui/eg-atoms"
import { OutputSchemaEditor } from "./output-schema-editor"
import {
  auditEmailWidth,
  EMAIL_WIDTH,
  enforceEmailWidth,
} from "@/lib/email-workspace/email-width"

/** Rascunho editável de variante (strings vazias no lugar de null). */
export interface VariantDraft {
  block_type: string
  name: string
  html: string
  // Exemplo real do email renderizado, colado manualmente (aba própria).
  rendered_html: string
  rendered_html_source_sha?: string | null
  /** Estado calculado no servidor (inclui o hash). */
  rendered_status?: { stale?: boolean | null } | null
  description: string
  long_description: string
  when_use: string
  when_not_use: string
  copy_guidance: string
  design_system: string
  photo_direction: string
  objectives: string[]
  tones: string[]
  density: string // "" | minimal | balanced | rich
  product_slots: number
  output_schema: ComponentOutputField[]
  slots: string // CSV (avançado)
  tags: string // CSV (avançado)
  thumbnail: string
  is_active: boolean
}

/** Substitui {{TAGS}} do HTML pelos exemplos do schema (preview client-side). */
export function mergeExamplesIntoHtml(
  html: string,
  schema: ComponentOutputField[],
): string {
  let out = html
  for (const f of schema) {
    if (!f.key || !f.example) continue
    const re = new RegExp(
      `\\{\\{\\s*${f.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
      "gi",
    )
    out = out.replace(re, f.example)
  }
  return out
}

function toggleIn(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

const DENSITY_OPTIONS = [
  { value: "", label: "(nenhuma)" },
  ...Object.entries(DENSITY_LABELS_PT).map(([value, label]) => ({
    value,
    label,
  })),
]

type PreviewMode = "preview" | "html" | "rendered"

/**
 * Estado do exemplo renderizado (story CM-6).
 *
 * O exemplo é usado pelo agente de hero **de qualquer forma** — print ou
 * não, atualizado ou não (decisão de 30/jul). Este aviso não bloqueia nada:
 * diz o que o exemplo é hoje e o que melhoraria a referência.
 *
 * Só a CLASSIFICAÇÃO roda aqui, ao vivo sobre o que está sendo colado. O
 * estado do hash vem do servidor (`renderedStatus`), porque compará-lo exige
 * `node:crypto` — e este é um componente client.
 */
function RenderedStatusNote({
  html,
  rendered,
  renderedStatus,
}: {
  html: string
  rendered: string
  renderedStatus?: { stale?: boolean | null } | null
}) {
  const classified = classifyRenderedHtml(rendered, html)
  if (classified.kind === "empty") return null

  const isMockup = classified.kind === "mockup"
  const isStale = renderedStatus?.stale === true
  if (!isMockup && !isStale) {
    return (
      <Note tone="pos">
        Exemplo utilizável: o agente de hero o recebe como referência de
        acabamento.
      </Note>
    )
  }

  return (
    <Note tone="warn">
      {isMockup && (
        <>
          Este exemplo parece um print embrulhado em HTML. Ele <b>é usado
          assim mesmo</b> — proporção e hierarquia ainda servem de referência
          —, mas colar o HTML do email renderizado dá um espelho bem melhor.
        </>
      )}
      {isMockup && isStale && <br />}
      {isStale && (
        <>
          O HTML da variante mudou depois que este exemplo foi salvo: ele
          descreve uma versão anterior. Continua sendo enviado, com ressalva
          registrada nos logs — recole para revalidar.
        </>
      )}
    </Note>
  )
}

function Note({
  tone,
  children,
}: {
  tone: "pos" | "warn"
  children: ReactNode
}) {
  const t =
    tone === "pos"
      ? { bg: C.posBg, border: C.posBorder, color: C.pos }
      : { bg: C.warnBg, border: C.warnBorder, color: C.warn }
  return (
    <div
      style={{
        padding: "9px 11px",
        marginBottom: 10,
        borderRadius: 6,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        fontFamily: F.sans,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

export function VariantEditor({
  draft,
  onChange,
  testCard,
  schemaSources,
  selfId,
}: {
  draft: VariantDraft
  onChange: (draft: VariantDraft) => void
  /** Card "Testar geração" (injetado na fase do teste por bloco). */
  testCard?: ReactNode
  /** key → variantes que a usam, para o aviso de colisão no schema. */
  /** Outras variantes, para copiar o schema de uma delas. */
  schemaSources?: Array<{
    id: string
    name: string
    block_type: string
    output_schema?: ComponentOutputField[] | null
  }>
  /** Id da variante em edição — não colide consigo mesma. */
  selfId?: string | null
}) {
  const [pv, setPv] = useState<PreviewMode>("preview")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [editRendered, setEditRendered] = useState(false)

  const set = (patch: Partial<VariantDraft>) => onChange({ ...draft, ...patch })

  const mergedHtml = useMemo(
    () => mergeExamplesIntoHtml(draft.html, draft.output_schema),
    [draft.html, draft.output_schema],
  )
  // Largura canônica: o bloco tem de declarar 600px (é o que o Montador e o
  // enxerto assumem). O salvar normaliza sozinho; o aviso existe para o
  // operador VER o que vai mudar — e corrigir antes, se preferir.
  const widthAudit = useMemo(() => auditEmailWidth(draft.html), [draft.html])

  return (
    <div
      style={{
        display: "grid",
        // 640 = 600px do email + 2×20px de padding do card: o preview cabe
        // no tamanho real sem escala.
        gridTemplateColumns: "minmax(0,1fr) 640px",
        gap: 20,
        alignItems: "start",
      }}
    >
      {/* ── COLUNA ESQUERDA — formulário ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minWidth: 0,
        }}
      >
        {/* Identificação */}
        <EGCard title="Identificação">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Nome</EGLabel>
              <EGInput value={draft.name} onChange={(v) => set({ name: v })} />
            </div>
            <div>
              <EGLabel>Tipo de seção</EGLabel>
              <EGSelect
                value={draft.block_type}
                onChange={(v) => set({ block_type: v })}
                options={COMPONENT_CATEGORIES.map((c) => ({
                  value: c.key,
                  label: c.label,
                }))}
              />
            </div>
            <div>
              <EGLabel>Status</EGLabel>
              <div style={{ height: 36, display: "flex", alignItems: "center" }}>
                <EGToggle
                  on={draft.is_active}
                  onChange={(v) => set({ is_active: v })}
                  label={
                    draft.is_active ? "Ativo (disponível para IA)" : "Inativo"
                  }
                />
              </div>
            </div>
            <div>
              <EGLabel>Slots de produto</EGLabel>
              <EGInput
                type="number"
                min={0}
                max={20}
                value={draft.product_slots}
                onChange={(v) =>
                  set({ product_slots: Math.max(0, Number(v) || 0) })
                }
              />
            </div>
            <div>
              <EGLabel>Densidade</EGLabel>
              <EGSelect
                value={draft.density}
                onChange={(v) => set({ density: v })}
                options={DENSITY_OPTIONS}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Descrição curta</EGLabel>
              <EGInput
                value={draft.description}
                onChange={(v) => set({ description: v })}
                placeholder="Ex: Bloco amarelo com código de cupom em destaque."
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Descrição detalhada</EGLabel>
              <EGTextarea
                value={draft.long_description}
                onChange={(v) => set({ long_description: v })}
                rows={3}
                placeholder="Notas de implementação, quirks de Outlook, etc."
              />
            </div>
          </div>

          {/* Avançado (campos técnicos preservados do editor anterior) */}
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 600,
                color: C.g500,
                padding: 0,
              }}
            >
              {showAdvanced ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              Avançado (slots, tags, thumbnail)
            </button>
            {showAdvanced && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 12,
                }}
              >
                <div>
                  <EGLabel hint="vírgula">Slots</EGLabel>
                  <EGInput
                    mono
                    value={draft.slots}
                    onChange={(v) => set({ slots: v })}
                    placeholder="{{HEADLINE}}, {{CTA_URL}}"
                  />
                </div>
                <div>
                  <EGLabel hint="vírgula">Tags</EGLabel>
                  <EGInput
                    value={draft.tags}
                    onChange={(v) => set({ tags: v })}
                    placeholder="dark_bg, 2x2_grid"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <EGLabel>Thumbnail (URL)</EGLabel>
                  <EGInput
                    mono
                    value={draft.thumbnail}
                    onChange={(v) => set({ thumbnail: v })}
                    placeholder="https://…"
                  />
                </div>
              </div>
            )}
          </div>
        </EGCard>

        {/* Contexto para a IA */}
        <EGCard title="Contexto para a IA">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <EGLabel>Quando usar</EGLabel>
              <EGTextarea
                value={draft.when_use}
                onChange={(v) => set({ when_use: v })}
                rows={2}
                placeholder="Ex: Sempre que houver um código promocional para aplicar no checkout."
              />
            </div>
            <div>
              <EGLabel>Quando NÃO usar</EGLabel>
              <EGTextarea
                value={draft.when_not_use}
                onChange={(v) => set({ when_not_use: v })}
                rows={2}
                placeholder="Ex: Emails calmos de boas-vindas sem oferta explícita."
              />
            </div>
            <div>
              <EGLabel>Orientações de copy para a IA</EGLabel>
              <EGTextarea
                value={draft.copy_guidance}
                onChange={(v) => set({ copy_guidance: v })}
                rows={2}
                placeholder="Ex: Headline vende o desconto. Código em CAIXA ALTA sem espaços."
              />
            </div>
            <div>
              <EGLabel>Design system</EGLabel>
              <EGTextarea
                value={draft.design_system}
                onChange={(v) => set({ design_system: v })}
                rows={6}
                placeholder={
                  "Regras de DESIGN desta variante, para o agente que a finaliza.\n" +
                  "Ex: a banda escura do topo é intencional e nunca vira branca. " +
                  "O botão primário é sólido; o secundário é outline com border 1px. " +
                  "No mobile a foto ocupa a largura toda e o padding cai para 20px. " +
                  "O subtítulo pode sumir se não houver copy; os dois CTAs, nunca."
                }
              />
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 6,
                }}
              >
                Vai para o prompt do agente de hero quando esta variante é a
                escolhida. Diferente de &quot;Orientações de copy&quot;, que
                fala do TEXTO — aqui é o desenho: hierarquia, bandas de fundo,
                acabamento dos botões, comportamento no mobile, o que nunca
                pode ser removido.
              </div>
            </div>
            <div>
              <EGLabel>Direção fotográfica</EGLabel>
              <EGTextarea
                value={draft.photo_direction}
                onChange={(v) => set({ photo_direction: v })}
                rows={6}
                placeholder={
                  "Briefing do FOTÓGRAFO para as imagens desta variante.\n" +
                  "Ex: still do produto em fundo neutro contínuo, luz suave " +
                  "vinda da esquerda, sombra curta. Enquadramento a três " +
                  "quartos, produto ocupando 60% do quadro. Sem modelo. " +
                  "Terço superior limpo, é onde a headline entra."
                }
              />
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 6,
                }}
              >
                Input principal do agente de imagem — nicho, posicionamento e
                paleta viram contexto de apoio. Diz COMO fotografar: luz,
                enquadramento, distância, modelo, cenário, tratamento de cor,
                que área deixar limpa para a copy. O que MOSTRAR continua
                vindo do briefing do bloco.
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <div>
                <EGLabel>Objetivos compatíveis</EGLabel>
                <div
                  style={{
                    maxHeight: 150,
                    overflow: "auto",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {COMPONENT_OBJECTIVES.map((o) => (
                    <EGCheck
                      key={o}
                      on={draft.objectives.includes(o)}
                      onChange={() =>
                        set({ objectives: toggleIn(draft.objectives, o) })
                      }
                      label={o}
                    />
                  ))}
                </div>
              </div>
              <div>
                <EGLabel>Tons compatíveis</EGLabel>
                <div
                  style={{
                    maxHeight: 150,
                    overflow: "auto",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {COMPONENT_TONES.map((t) => (
                    <EGCheck
                      key={t}
                      on={draft.tones.includes(t)}
                      onChange={() => set({ tones: toggleIn(draft.tones, t) })}
                      label={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </EGCard>

        {/* Schema de output */}
        <OutputSchemaEditor
          schema={draft.output_schema}
          onChange={(s) => set({ output_schema: s })}
          blockType={draft.block_type}
          selfId={selfId}
          schemaSources={schemaSources}
        />

      </div>

      {/* ── COLUNA DIREITA — Estrutura & Preview (+ Testar) ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "sticky",
          top: 16,
        }}
      >
        <EGCard title="Estrutura & Preview">
          <div
            style={{
              display: "flex",
              gap: 2,
              background: C.g100,
              padding: 3,
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {(
              [
                ["preview", "Preview"],
                ["html", "HTML"],
                ["rendered", "HTML renderizado"],
              ] as Array<[PreviewMode, string]>
            ).map(([k, l]) => {
              const on = pv === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setPv(k)
                    setEditRendered(false)
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: on ? 600 : 500,
                    color: on ? C.g900 : C.g500,
                    background: on ? C.white : "transparent",
                    boxShadow: on ? C.shadowSm : "none",
                  }}
                >
                  {l}
                </button>
              )
            })}
          </div>

          {pv === "preview" && (
            <>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <EGRenderFrame
                  html={mergedHtml}
                  minHeight={480}
                  emailWidth={EMAIL_WIDTH}
                />
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                Preview a {EMAIL_WIDTH}px (largura real do email) usando os
                exemplos definidos em cada campo do schema.
              </div>
              {draft.html.trim() && !widthAudit.ok && (
                <div style={{ marginTop: 10 }}>
                  <EGNotice tone="warn">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        <strong>Bloco fora de {EMAIL_WIDTH}px.</strong>{" "}
                        {widthAudit.reason} Ao salvar, a largura é fixada
                        automaticamente.
                      </span>
                      <EGBtn
                        onClick={() =>
                          set({ html: enforceEmailWidth(draft.html).html })
                        }
                      >
                        Fixar em {EMAIL_WIDTH}px agora
                      </EGBtn>
                    </div>
                  </EGNotice>
                </div>
              )}
            </>
          )}
          {pv === "html" && (
            <>
              <textarea
                value={draft.html}
                onChange={(e) => set({ html: e.target.value })}
                rows={22}
                style={{
                  ...egInputStyle,
                  height: "auto",
                  padding: "11px 12px",
                  lineHeight: 1.5,
                  resize: "vertical",
                  fontFamily: F.mono,
                  fontSize: 12,
                  whiteSpace: "pre",
                }}
              />
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                Cole aqui o HTML do bloco com todos os elementos. A aba
                “Preview” mostra o render.
              </div>
            </>
          )}
          {pv === "rendered" && (
            <>
              <RenderedStatusNote
                html={draft.html}
                rendered={draft.rendered_html}
                renderedStatus={draft.rendered_status}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 10,
                }}
              >
                <EGBtn
                  variant="secondary"
                  onClick={() => setEditRendered(!editRendered)}
                  title={
                    editRendered
                      ? "Fechar edição do HTML"
                      : "Editar o HTML com render ao vivo"
                  }
                  style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                >
                  {editRendered ? <Check size={13} /> : <Pencil size={13} />}
                  {editRendered ? "Concluir" : "Editar"}
                </EGBtn>
              </div>
              {editRendered && (
                <textarea
                  value={draft.rendered_html}
                  onChange={(e) => set({ rendered_html: e.target.value })}
                  rows={14}
                  placeholder="Cole aqui o HTML do email renderizado"
                  style={{
                    ...egInputStyle,
                    height: "auto",
                    padding: "11px 12px",
                    lineHeight: 1.5,
                    resize: "vertical",
                    fontFamily: F.mono,
                    fontSize: 12,
                    whiteSpace: "pre",
                    marginBottom: 10,
                  }}
                />
              )}
              {draft.rendered_html ? (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <EGRenderFrame
                    html={draft.rendered_html}
                    minHeight={editRendered ? 360 : 520}
                    collapsedMax={editRendered ? 520 : 720}
                    emailWidth={EMAIL_WIDTH}
                  />
                </div>
              ) : (
                <div
                  style={{
                    border: `1px dashed ${C.border}`,
                    borderRadius: 8,
                    padding: "60px 24px",
                    textAlign: "center",
                    fontSize: 12.5,
                    color: C.g400,
                    fontFamily: F.sans,
                  }}
                >
                  Nenhum HTML renderizado colado ainda — clique em Editar para
                  colar o exemplo real do email.
                </div>
              )}
              <div
                style={{
                  fontSize: 11.5,
                  color: C.g400,
                  fontFamily: F.sans,
                  marginTop: 10,
                }}
              >
                {editRendered
                  ? "Cole o HTML do email renderizado — o render abaixo atualiza ao vivo. Use Salvar para persistir."
                  : "Exemplo real do email renderizado (colado manualmente). Independente do HTML do componente."}
              </div>
            </>
          )}
        </EGCard>

        {testCard}
      </div>
    </div>
  )
}
