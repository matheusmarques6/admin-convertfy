"use client"

/**
 * Estúdio de Agentes — aba Editor: canvas editável (drag para reorganizar,
 * posições por usuário em localStorage) + painel de configuração do nó.
 *
 * O painel edita a config REAL do agente (email_agent_configs): salvar cria
 * uma nova versão via POST /api/admin/agents/prompts e a ativa na
 * sequência — mesma semântica da aba Agentes do hub (não existe camada de
 * staging: ativar É publicar). Nós sem config (copy externo, copy_merge de
 * código, QA Vision derivado) explicam o que são em vez de fingir edição.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ExternalLink, X, Zap } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { ROUTES } from "@/lib/routes"
import { AGENT_VISUAL } from "@/lib/agents/agent-visual"
import {
  STUDIO_NODE_BY_KEY,
  nodeMeta,
  rerunPlanFor,
} from "@/lib/agents/studio-graph"
import { FlowCanvas, type Positions } from "./flow-canvas"
import { SHADOW_LG, StudioBtn, fmtInt, usd } from "./studio-atoms"
import type { LogsPayload, PromptRowLite, PromptsPayload } from "./studio-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Agentes cuja config vive em email_agent_configs e é editável aqui. */
const EDITABLE_AGENTS = new Set([
  "assembler_chooser",
  "assembler",
  "blueprint",
  "subject",
  "image",
  "hero_section",
  "text_format",
  "image_format",
  "typography",
  "color_format",
  "qa",
])

const MODEL_OPTIONS_TEXT = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4-7",
  "claude-haiku-3-5",
  "moonshotai/kimi-k3",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.3-chat",
]
const MODEL_OPTIONS_IMAGE = ["openai/gpt-5.4-image-2", "gpt-image-2", "gpt-image-1"]

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: C.g400,
          fontFamily: F.sans,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 11, color: C.g400, fontFamily: F.sans }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 7,
  border: `1px solid ${C.border}`,
  background: C.white,
  fontSize: 12.5,
  color: C.g900,
  fontFamily: F.sans,
  outline: "none",
  boxSizing: "border-box",
}

function NodeConfigPanel({
  nodeKey,
  prompts,
  byAgent,
  onSaved,
  onClose,
}: {
  nodeKey: string
  prompts: PromptsPayload | undefined
  byAgent: LogsPayload["by_agent"] | undefined
  onSaved: () => void
  onClose: () => void
}) {
  const n = STUDIO_NODE_BY_KEY[nodeKey]
  const agentKey = n?.type === "agent" ? n.agent : undefined
  const editable = agentKey ? EDITABLE_AGENTS.has(agentKey) : false
  const activeLite: PromptRowLite | null =
    (agentKey && prompts?.by_type?.[agentKey]?.active) || null

  // Prompt truncado na listagem → busca o detalhe completo ao abrir.
  const { data: detail } = useSWR<{ prompt: PromptRowLite }>(
    editable && activeLite ? `/api/admin/agents/prompts/${activeLite.id}` : null,
    fetcher,
  )
  const active = detail?.prompt ?? null

  const [model, setModel] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [temperature, setTemperature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  // Reset do form quando muda o nó selecionado.
  useEffect(() => {
    setModel(null)
    setSystemPrompt(null)
    setTemperature(null)
    setFeedback(null)
  }, [nodeKey])

  if (!n) return null
  const meta = nodeMeta(n)
  const vis = agentKey ? AGENT_VISUAL[agentKey] : null
  const stats = agentKey ? byAgent?.find((a) => a.agent === agentKey) : undefined
  const rerun = rerunPlanFor(nodeKey)

  const dirty =
    active != null &&
    ((model != null && model !== active.model) ||
      (systemPrompt != null && systemPrompt !== active.system_prompt) ||
      (temperature != null && temperature !== String(active.temperature)))

  const save = async () => {
    if (!active || !agentKey) return
    setSaving(true)
    setFeedback(null)
    try {
      const tempNum = temperature != null ? Number(temperature.replace(",", ".")) : active.temperature
      if (Number.isNaN(tempNum) || tempNum < 0 || tempNum > 2) {
        setFeedback({ ok: false, msg: "Temperatura precisa estar entre 0 e 2." })
        setSaving(false)
        return
      }
      const res = await fetch("/api/admin/agents/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_type: agentKey,
          model: model ?? active.model,
          system_prompt: systemPrompt ?? active.system_prompt,
          user_template: active.user_template,
          temperature: tempNum,
          max_tokens: active.max_tokens,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.prompt?.id) {
        throw new Error(json?.error ?? "Falha ao criar versão")
      }
      const act = await fetch(`/api/admin/agents/prompts/${json.prompt.id}/activate`, {
        method: "POST",
      })
      if (!act.ok) {
        const actJson = await act.json().catch(() => null)
        throw new Error(actJson?.error ?? "Versão criada mas não ativada")
      }
      setFeedback({ ok: true, msg: `v${json.prompt.version} publicada — vale a partir da próxima execução.` })
      setModel(null)
      setSystemPrompt(null)
      setTemperature(null)
      onSaved()
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Erro ao salvar" })
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = agentKey === "image" ? MODEL_OPTIONS_IMAGE : MODEL_OPTIONS_TEXT
  const modelValue = model ?? active?.model ?? ""
  const selectOptions = modelValue && !modelOptions.includes(modelValue)
    ? [modelValue, ...modelOptions]
    : modelOptions

  return (
    <aside
      style={{
        width: 340,
        flexShrink: 0,
        background: C.white,
        borderLeft: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            color: meta.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: F.sans,
          }}
        >
          {meta.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
            {meta.name}
          </div>
          <div style={{ fontSize: 11, color: C.g400, fontFamily: F.sans }}>
            {n.type === "agent"
              ? "Agente do pipeline"
              : n.type === "trigger"
                ? "Gatilho"
                : "Saída"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: C.g400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {vis && (
          <div style={{ fontSize: 12, color: C.g500, fontFamily: F.sans, lineHeight: 1.5 }}>
            {vis.desc}
          </div>
        )}

        {/* Nós especiais: sem config editável */}
        {n.type !== "agent" && (
          <InfoNote>
            {n.type === "trigger"
              ? "O pipeline dispara pela fila de dispatch quando a pesquisa da loja completa (ou pelo botão de teste do hub)."
              : "Email com status ready — aparece no workspace do designer e na aba Geradas do hub."}
          </InfoNote>
        )}
        {agentKey === "copy" && (
          <InfoNote>
            A copy roda no n8n (externo) — subject, preheader e blocos. O prompt é
            gerenciado lá; aqui só acompanhamos as execuções.
          </InfoNote>
        )}
        {agentKey === "copy_merge" && (
          <InfoNote>
            Estágio de CÓDIGO (Fase A): troca {"{{TAG}}"} pela copy ancorada — sem LLM,
            custo zero. Não há prompt para editar.
          </InfoNote>
        )}
        {agentKey === "qavision" && (
          <div
            style={{
              fontSize: 11.5,
              fontFamily: F.sans,
              lineHeight: 1.5,
              padding: "9px 11px",
              borderRadius: 8,
              background: C.warnBg,
              border: `1px solid ${C.warnBorder}`,
              color: C.warn,
            }}
          >
            QA Vision é o agente de QA em modo multimodal — roda sob demanda (default
            OFF). Ligue/desligue em{" "}
            <Link
              href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=settings`}
              style={{ color: C.warn, fontWeight: 600 }}
            >
              Configurações do hub
            </Link>
            ; o prompt é o do nó QA.
          </div>
        )}

        {/* Config editável */}
        {editable && !active && (
          <InfoNote>
            {activeLite
              ? "Carregando config ativa…"
              : "Sem config ativa — o pipeline usa o modelo padrão das Configurações. Crie a config na aba Agentes do hub."}
          </InfoNote>
        )}
        {editable && active && (
          <>
            <Field label="Modelo">
              <select
                style={{ ...inputStyle, appearance: "auto" }}
                value={modelValue}
                onChange={(e) => setModel(e.target.value)}
              >
                {selectOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Prompt do sistema"
              hint="Salvar cria uma versão nova e ativa — vale a partir da próxima execução."
            >
              <textarea
                value={systemPrompt ?? active.system_prompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 170,
                  padding: "9px 10px",
                  borderRadius: 7,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: C.g700,
                  fontFamily: F.mono,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Temperatura">
                <input
                  style={{ ...inputStyle, ...TNUM }}
                  value={temperature ?? String(active.temperature)}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </Field>
              <Field label="Versão ativa">
                <div
                  style={{
                    ...inputStyle,
                    display: "flex",
                    alignItems: "center",
                    background: C.g50,
                    color: C.g500,
                    ...TNUM,
                  }}
                >
                  v{active.version}
                </div>
              </Field>
            </div>
          </>
        )}

        {/* Métricas dos últimos dias */}
        {agentKey && stats && (
          <div
            style={{
              padding: "11px 12px",
              borderRadius: 8,
              background: C.g50,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: C.g400,
                fontFamily: F.sans,
                marginBottom: 8,
              }}
            >
              Últimos 14 dias
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
              {(
                [
                  ["Execuções", fmtInt(stats.runs)],
                  ["Custo", vis?.external ? "—" : usd(stats.cost_usd)],
                  [
                    "Tempo médio",
                    stats.avg_duration_ms != null
                      ? (stats.avg_duration_ms / 1000).toFixed(1).replace(".", ",") + "s"
                      : "—",
                  ],
                  [
                    "Erros",
                    stats.errors ? `${stats.errors} · ${stats.retries} retries` : "0",
                  ],
                ] as Array<[string, string]>
              ).map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10.5, color: C.g400, fontFamily: F.sans }}>{l}</div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: C.g900,
                      fontFamily: F.sans,
                      ...TNUM,
                      marginTop: 1,
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rerun && (
          <div style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, lineHeight: 1.5 }}>
            Re-execução disponível na aba Execuções: {rerun.hint}
          </div>
        )}

        {feedback && (
          <div
            style={{
              padding: "9px 11px",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: F.sans,
              lineHeight: 1.5,
              background: feedback.ok ? C.posBg : C.negBg,
              border: `1px solid ${feedback.ok ? C.posBorder : C.negBorder}`,
              color: feedback.ok ? C.pos : C.neg,
            }}
          >
            {feedback.msg}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          gap: 8,
        }}
      >
        {editable && active ? (
          <StudioBtn
            variant="primary"
            onClick={save}
            disabled={!dirty || saving}
            style={{ flex: 1, height: 34, justifyContent: "center" }}
          >
            {saving ? "Publicando…" : "Salvar e publicar"}
          </StudioBtn>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        {agentKey && EDITABLE_AGENTS.has(agentKey) && (
          <Link
            href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=agents`}
            style={{
              height: 34,
              padding: "0 13px",
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: C.white,
              color: C.g600,
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: F.sans,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            <ExternalLink size={13} /> Hub
          </Link>
        )}
      </div>
    </aside>
  )
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: C.g500,
        fontFamily: F.sans,
        lineHeight: 1.5,
        padding: "9px 11px",
        borderRadius: 8,
        background: C.g50,
        border: `1px solid ${C.border}`,
      }}
    >
      {children}
    </div>
  )
}

export function EditorTab({
  positions,
  onMove,
  onRunPipeline,
}: {
  positions: Positions
  onMove: (key: string, x: number, y: number) => void
  /** Abre a aba Teste do próprio Estúdio (sem sair da página). */
  onRunPipeline?: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const { data: prompts, mutate: refetchPrompts } = useSWR<PromptsPayload>(
    "/api/admin/agents/prompts",
    fetcher,
  )
  const { data: logs } = useSWR<LogsPayload>(
    "/api/admin/email-generation-logs?days=14",
    fetcher,
  )

  const modelByAgent = useMemo(() => {
    const out: Record<string, string | null> = {}
    if (prompts?.by_type) {
      for (const [k, v] of Object.entries(prompts.by_type)) {
        out[k] = v.active?.model ?? null
      }
    }
    return out
  }, [prompts])

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <FlowCanvas
          positions={positions}
          selected={selected}
          onSelect={setSelected}
          onMove={onMove}
          modelByAgent={modelByAgent}
          overlay={
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              {/* Abre a aba Teste do próprio Estúdio; fallback: aba Testar
                  do hub quando montado sem o callback. */}
              {onRunPipeline ? (
                <button
                  onClick={onRunPipeline}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 38,
                    padding: "0 18px",
                    borderRadius: 8,
                    border: "none",
                    background: C.brand,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: F.sans,
                    cursor: "pointer",
                    boxShadow: SHADOW_LG,
                  }}
                >
                  <Zap size={15} /> Executar pipeline
                </button>
              ) : (
                <Link
                  href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=test`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 38,
                    padding: "0 18px",
                    borderRadius: 8,
                    border: "none",
                    background: C.brand,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: F.sans,
                    cursor: "pointer",
                    boxShadow: SHADOW_LG,
                    textDecoration: "none",
                  }}
                >
                  <Zap size={15} /> Executar pipeline
                </Link>
              )}
            </div>
          }
        />
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              color: C.g400,
              fontFamily: F.sans,
              background: "rgba(255,255,255,0.85)",
              padding: "3px 9px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            Arraste os nós para reorganizar · clique para configurar
          </span>
        </div>
      </div>
      {selected && (
        <NodeConfigPanel
          nodeKey={selected}
          prompts={prompts}
          byAgent={logs?.by_agent}
          onSaved={() => refetchPrompts()}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
