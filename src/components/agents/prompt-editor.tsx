"use client"

/**
 * PromptEditor — editor da versão ativa.
 *
 * Salvar cria SEMPRE nova versão (is_active=false). Para ativar, usar a
 * lista de histórico (botão "Ativar" → confirm modal).
 *
 * Painel lateral mostra os placeholders disponíveis por agent_type
 * (lista estática hardcoded). Botão "Validar template" extrai `{{var}}`
 * e cruza com a lista — avisa quando há vars não suportadas.
 */
import { useState, useMemo, useEffect } from "react"
import { Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import type { AgentType } from "@/types/email-generation"
import type { PromptRow } from "@/lib/services/prompt-management.service"
import {
  HTML_PROMPT_VAR_KEYS,
  HTML_PROMPT_VAR_DESCRIPTIONS,
} from "@/lib/agents/html/contract"

// ── Placeholders suportados por agent_type ────────────────
// Lista mantida em sincronia com `email-generation.service.ts::buildAllVars`.
// Edits aqui são lightweight (somente sidebar informativa + validador).
const PLACEHOLDERS_BY_AGENT: Record<AgentType, Array<{ key: string; desc: string }>> = {
  copy: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "persona", desc: "Persona-alvo" },
    { key: "diferencial", desc: "Diferencial competitivo" },
    { key: "slogan", desc: "Slogan da marca" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "posicionamento", desc: "Posicionamento" },
    { key: "top_products", desc: "Lista de produtos top" },
    { key: "flow_type", desc: "Tipo do flow (welcome, abandoned_cart, ...)" },
    { key: "email_number", desc: "Número do email no flow (1, 2, 3)" },
    { key: "objective", desc: "Objetivo do email (do blueprint)" },
    { key: "messaging", desc: "Mensagem central (do blueprint)" },
    { key: "blocks_spec", desc: "Spec dos blocos (JSON do blueprint)" },
    { key: "reference_copy", desc: "Cópia de referência" },
  ],
  image: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho" },
    { key: "primary_colors", desc: "Cores primárias da marca" },
    { key: "secondary_colors", desc: "Cores secundárias" },
    { key: "color_names", desc: "Nomes das cores em PT" },
    { key: "font_heading", desc: "Fonte de heading" },
    { key: "logo_url", desc: "URL do logo" },
    { key: "top_products", desc: "Produtos destacados" },
    { key: "product_1_name", desc: "Nome do produto 1" },
    { key: "product_2_name", desc: "Nome do produto 2" },
    { key: "block_purpose", desc: "Propósito do bloco (hero, etc)" },
  ],
  // Fonte unica: `HTML_PROMPT_VAR_KEYS` + descricoes em
  // `src/lib/agents/html/contract.ts`. Mudou a lista la, mudou aqui.
  html: HTML_PROMPT_VAR_KEYS.map((key) => ({
    key,
    desc: HTML_PROMPT_VAR_DESCRIPTIONS[key],
  })),
  qa: [
    { key: "brand_name", desc: "Nome da loja" },
    { key: "html", desc: "HTML completo a validar" },
    { key: "copy", desc: "Texto/copy parseado" },
    { key: "flow_type", desc: "Tipo do flow" },
    { key: "email_number", desc: "Número do email" },
    { key: "claims", desc: "Lista de claims/promessas extraídas" },
  ],
}

const MODEL_OPTIONS_TEXT = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-3-5",
]
const MODEL_OPTIONS_IMAGE = ["gpt-image-2", "gpt-image-1"]

interface Props {
  agentType: AgentType
  activePrompt: PromptRow | null
  onSaved: () => void
}

export function PromptEditor({ agentType, activePrompt, onSaved }: Props) {
  const defaultModel = agentType === "image" ? "gpt-image-2" : "claude-sonnet-4-6"
  const [model, setModel] = useState(activePrompt?.model ?? defaultModel)
  const [systemPrompt, setSystemPrompt] = useState(activePrompt?.system_prompt ?? "")
  const [userTemplate, setUserTemplate] = useState(activePrompt?.user_template ?? "")
  const [temperature, setTemperature] = useState(activePrompt?.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(activePrompt?.max_tokens ?? 2048)
  const [outputSchemaText, setOutputSchemaText] = useState(
    activePrompt?.output_schema ? JSON.stringify(activePrompt.output_schema, null, 2) : "",
  )
  const [submitting, setSubmitting] = useState(false)
  const [validationMsg, setValidationMsg] = useState<{
    kind: "ok" | "error"
    msg: string
  } | null>(null)

  const placeholders = useMemo(
    () => PLACEHOLDERS_BY_AGENT[agentType] ?? [],
    [agentType],
  )
  const knownKeys = useMemo(
    () => new Set(placeholders.map((p) => p.key)),
    [placeholders],
  )

  // Extrai vars do template (system + user) cobrindo as 2 formas que
  // o template-renderer trata como variavel:
  //   1) Substituicao simples: `{{var_name}}`
  //   2) Helpers que tomam VAR como argumento: `{{#if VAR}}`, `{{#case VAR}}`
  // Nao captura `{{#when LABEL}}` (LABEL e' literal, nao var; ler
  // src/lib/agents/image/template-renderer.ts:78-86 pra o contrato).
  const templateAnalysis = useMemo(() => {
    const SIMPLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    const HELPER_RE = /\{\{\s*#(?:if|case)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    const found = new Set<string>()
    const haystack = `${systemPrompt}\n${userTemplate}`
    for (const m of haystack.matchAll(SIMPLE_RE)) found.add(m[1])
    for (const m of haystack.matchAll(HELPER_RE)) found.add(m[1])
    const used = [...found]
    const unknown = used.filter((k) => !knownKeys.has(k))
    const knownUsed = used.filter((k) => knownKeys.has(k))
    return {
      totalUsed: used.length,
      knownUsed: knownUsed.length,
      unknown,
      totalAvailable: knownKeys.size,
    }
  }, [systemPrompt, userTemplate, knownKeys])

  // Auto-validacao: corre a cada mudanca (memoizada). Mensagem em
  // tempo real ajuda o autor a evitar typo de var. Botao manual abaixo
  // forca refresh do estado mesmo se o conteudo nao mudou.
  useEffect(() => {
    if (templateAnalysis.totalUsed === 0) {
      setValidationMsg(null)
      return
    }
    if (templateAnalysis.unknown.length === 0) {
      setValidationMsg({
        kind: "ok",
        msg: `Template OK. ${templateAnalysis.knownUsed}/${templateAnalysis.totalAvailable} vars do contrato em uso.`,
      })
    } else {
      setValidationMsg({
        kind: "error",
        msg: `Variáveis não documentadas: ${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}. Em runtime, viram string vazia.`,
      })
    }
  }, [templateAnalysis])

  const validateTemplate = () => {
    if (templateAnalysis.totalUsed === 0) {
      setValidationMsg({
        kind: "error",
        msg: "Template sem variáveis. Use {{var_name}} no system ou user template.",
      })
      return
    }
    if (templateAnalysis.unknown.length === 0) {
      setValidationMsg({
        kind: "ok",
        msg: `Template OK. ${templateAnalysis.knownUsed}/${templateAnalysis.totalAvailable} vars do contrato em uso.`,
      })
    } else {
      setValidationMsg({
        kind: "error",
        msg: `Variáveis não documentadas: ${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}. Em runtime, viram string vazia.`,
      })
    }
  }

  const save = async () => {
    if (!systemPrompt.trim() || !userTemplate.trim()) {
      toast({ variant: "destructive", title: "system_prompt e user_template obrigatórios" })
      return
    }
    if (templateAnalysis.unknown.length > 0) {
      const confirmed = window.confirm(
        `${templateAnalysis.unknown.length} variável(is) não documentada(s): ` +
          `${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}.\n\n` +
          "Em runtime essas vars viram string vazia. Salvar mesmo assim?",
      )
      if (!confirmed) return
    }
    let outputSchema: unknown = null
    if (outputSchemaText.trim()) {
      try {
        outputSchema = JSON.parse(outputSchemaText)
      } catch {
        toast({ variant: "destructive", title: "output_schema não é JSON válido" })
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/agents/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_type: agentType,
          model,
          system_prompt: systemPrompt,
          user_template: userTemplate,
          temperature,
          max_tokens: maxTokens,
          output_schema: outputSchema,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar")
      toast({
        title: `Versão criada (v${data?.prompt?.version ?? "?"})`,
        description: "A nova versão não está ativa. Use 'Ativar' no histórico.",
      })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao salvar",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const modelOptions = agentType === "image" ? MODEL_OPTIONS_IMAGE : MODEL_OPTIONS_TEXT
  const supportsSchema = agentType === "copy" || agentType === "qa"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div className="space-y-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            {activePrompt ? `Versão ativa: v${activePrompt.version}` : "Nenhuma versão ativa"}
          </h3>
          {activePrompt && (
            <span className="text-[11px] text-slate-400 dark:text-white/40">
              criada em {new Date(activePrompt.created_at).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="crm-input w-full"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {agentType !== "image" && (
            <div className="space-y-1">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Temperatura ({temperature})
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#1F1F1F]"
              />
            </div>
          )}
          {agentType !== "image" && (
            <div className="space-y-1">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Max tokens
              </label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
                min={100}
                max={8000}
                className="crm-input w-full"
              />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
            System prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instruções de sistema para o agente..."
            className="crm-input w-full font-mono text-[12px] min-h-[200px] resize-y"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
            User template (suporta {"{{variáveis}}"})
          </label>
          <textarea
            value={userTemplate}
            onChange={(e) => setUserTemplate(e.target.value)}
            placeholder="Template da mensagem do usuário..."
            className="crm-input w-full font-mono text-[12px] min-h-[200px] resize-y"
          />
        </div>

        {supportsSchema && (
          <div className="space-y-1">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Output schema (JSON Schema, opcional)
            </label>
            <textarea
              value={outputSchemaText}
              onChange={(e) => setOutputSchemaText(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              className="crm-input w-full font-mono text-[11px] min-h-[120px] resize-y"
            />
          </div>
        )}

        {validationMsg && (
          <div
            className={
              validationMsg.kind === "ok"
                ? "flex items-start gap-2 rounded-[4px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-200"
                : "flex items-start gap-2 rounded-[4px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200"
            }
          >
            {validationMsg.kind === "ok" ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span>{validationMsg.msg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={validateTemplate}
            className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08]"
          >
            Validar template
          </button>
          <button
            type="button"
            onClick={save}
            disabled={submitting || !systemPrompt.trim() || !userTemplate.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar nova versão
          </button>
        </div>
      </div>

      <aside className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02] p-4 h-fit lg:sticky lg:top-4">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75 mb-2">
          Placeholders disponíveis
        </h4>
        <ul className="space-y-1.5 text-[11px] max-h-[600px] overflow-y-auto">
          {placeholders.map((p) => (
            <li key={p.key} className="leading-tight">
              <code className="font-mono text-slate-900 dark:text-white">{`{{${p.key}}}`}</code>
              <p className="text-slate-500 dark:text-white/55">{p.desc}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
