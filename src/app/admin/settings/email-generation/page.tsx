"use client"

import { useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Bot,
  Image,
  Code2,
  Save,
  History,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type {
  EmailBlueprint,
  EmailAgentConfig,
  EmailGenerationSettings,
  EmailReferenceTemplate,
  AgentType,
} from "@/types/email-generation"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const FLOW_TYPE_LABELS: Record<string, string> = {
  welcome: "Boas-vindas",
  site_abandoned: "Site abandonado",
  abandoned_cart: "Carrinho abandonado",
  browse_abandonment: "Browse abandonment",
  upsell: "Upsell",
  win_back: "Win-back",
  shipping_stages: "Etapas de envio",
  post_purchase: "Pós-compra",
  custom: "Personalizado",
}

const AGENT_LABELS: Record<AgentType, string> = {
  copy: "Copy",
  image: "Imagens",
  html: "HTML",
}

const AGENT_ICONS: Record<AgentType, typeof Bot> = {
  copy: Bot,
  image: Image,
  html: Code2,
}

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  copy: "Gera textos, assuntos e copies para os blocos do email",
  image: "Gera prompts e coordena a criação de imagens para os emails",
  html: "Compila o HTML final combinando blocos, imagens e estilos",
}

type Tab = "blueprints" | "agents" | "settings" | "references"

export default function EmailGenerationSettingsPage() {
  const [tab, setTab] = useState<Tab>("blueprints")

  return (
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Geração de Emails"
        description="Blueprints, prompts dos agentes e configurações de geração automática."
      />

      <SegmentedTabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <SegmentedTabItem value="blueprints">Blueprints</SegmentedTabItem>
        <SegmentedTabItem value="agents">Agentes</SegmentedTabItem>
        <SegmentedTabItem value="settings">Configurações</SegmentedTabItem>
        <SegmentedTabItem value="references">Referências</SegmentedTabItem>
      </SegmentedTabs>

      {tab === "blueprints" && <BlueprintsTab />}
      {tab === "agents" && <AgentsTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "references" && <ReferencesTab />}
    </div>
  )
}

// ─── Blueprints Tab ─────────────────────────────────────────

function BlueprintsTab() {
  const { data, mutate, isLoading } = useSWR<{ blueprints: EmailBlueprint[] }>(
    "/api/admin/email-blueprints",
    fetcher,
  )
  const blueprints = data?.blueprints ?? []
  const [editing, setEditing] = useState<EmailBlueprint | "new" | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null)

  const flowTypes = Array.from(new Set(blueprints.map((b) => b.flow_type))).sort()
  const activeFlow = selectedFlow ?? flowTypes[0] ?? null
  const filtered = activeFlow
    ? blueprints.filter((b) => b.flow_type === activeFlow)
    : []

  return (
    <div className="flex gap-5">
      <div className="w-[200px] shrink-0 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-2">
          Flows
        </div>
        {isLoading && (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}
        {flowTypes.map((ft) => (
          <button
            key={ft}
            type="button"
            onClick={() => setSelectedFlow(ft)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-[6px] text-[13px] transition-colors",
              activeFlow === ft
                ? "bg-slate-100 dark:bg-white/[0.06] font-medium text-slate-900 dark:text-white"
                : "text-slate-600 dark:text-white/55 hover:bg-slate-50 dark:hover:bg-white/[0.03]",
            )}
          >
            {FLOW_TYPE_LABELS[ft] ?? ft}
            <span className="ml-1.5 text-[11px] text-slate-400">
              ({blueprints.filter((b) => b.flow_type === ft).length})
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="w-full flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-[12px] font-medium text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.03] mt-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo blueprint
        </button>
      </div>

      <div className="flex-1 min-w-0">
        {!isLoading && filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-slate-500 dark:text-white/45">
            {flowTypes.length === 0
              ? "Nenhum blueprint cadastrado ainda."
              : "Selecione um flow na sidebar."}
          </div>
        )}
        {filtered
          .sort((a, b) => a.email_number - b.email_number)
          .map((bp) => (
            <div
              key={bp.id}
              className="group flex items-start justify-between gap-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-3 mb-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded text-slate-500">
                    #{bp.email_number}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                    {bp.objective}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55 line-clamp-2">
                  {bp.messaging}
                </p>
                {bp.subject_hint && (
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-white/35 italic">
                    Assunto: {bp.subject_hint}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setEditing(bp)}
                  className="flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Excluir blueprint #${bp.email_number}?`)) return
                    await fetch(`/api/admin/email-blueprints/${bp.id}`, { method: "DELETE" })
                    mutate()
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
      </div>

      {editing && (
        <BlueprintDialog
          blueprint={editing === "new" ? null : editing}
          defaultFlowType={activeFlow}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function BlueprintDialog({
  blueprint,
  defaultFlowType,
  onClose,
  onSaved,
}: {
  blueprint: EmailBlueprint | null
  defaultFlowType: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = blueprint !== null
  const [flowType, setFlowType] = useState(blueprint?.flow_type ?? defaultFlowType ?? "welcome")
  const [emailNumber, setEmailNumber] = useState(blueprint?.email_number ?? 1)
  const [objective, setObjective] = useState(blueprint?.objective ?? "")
  const [messaging, setMessaging] = useState(blueprint?.messaging ?? "")
  const [subjectHint, setSubjectHint] = useState(blueprint?.subject_hint ?? "")
  const [blocksJson, setBlocksJson] = useState(
    JSON.stringify(blueprint?.blocks ?? [], null, 2),
  )
  const [toneOverride, setToneOverride] = useState(blueprint?.tone_override ?? "")
  const [submitting, setSubmitting] = useState(false)

  const save = async () => {
    if (!objective.trim() || !messaging.trim()) return
    setSubmitting(true)
    try {
      let blocks: unknown[]
      try {
        blocks = JSON.parse(blocksJson)
      } catch {
        toast({ variant: "destructive", title: "JSON de blocos inválido" })
        setSubmitting(false)
        return
      }

      const payload = {
        flow_type: flowType,
        email_number: emailNumber,
        objective: objective.trim(),
        messaging: messaging.trim(),
        subject_hint: subjectHint.trim() || null,
        blocks,
        tone_override: toneOverride.trim() || null,
      }
      const url = isEdit
        ? `/api/admin/email-blueprints/${blueprint!.id}`
        : "/api/admin/email-blueprints"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }
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

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar blueprint" : "Novo blueprint"}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? "Editar blueprint" : "Novo blueprint"}
            </h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Flow type
                </label>
                <select
                  value={flowType}
                  onChange={(e) => setFlowType(e.target.value)}
                  className="crm-input w-full"
                  disabled={isEdit}
                >
                  {Object.entries(FLOW_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Email #
                </label>
                <input
                  type="number"
                  value={emailNumber}
                  onChange={(e) => setEmailNumber(parseInt(e.target.value) || 1)}
                  min={1}
                  className="crm-input w-full"
                  disabled={isEdit}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Objetivo
              </label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Ex: Apresentar a marca e oferecer primeiro desconto"
                className="crm-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Messaging
              </label>
              <textarea
                rows={3}
                value={messaging}
                onChange={(e) => setMessaging(e.target.value)}
                placeholder="Descreva a abordagem e tom da mensagem..."
                className="crm-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Sugestão de assunto
              </label>
              <input
                type="text"
                value={subjectHint}
                onChange={(e) => setSubjectHint(e.target.value)}
                placeholder="Opcional"
                className="crm-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Blocos (JSON)
              </label>
              <textarea
                rows={5}
                value={blocksJson}
                onChange={(e) => setBlocksJson(e.target.value)}
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Override de tom
              </label>
              <input
                type="text"
                value={toneOverride}
                onChange={(e) => setToneOverride(e.target.value)}
                placeholder="Opcional (ex: divertido, formal)"
                className="crm-input w-full"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !objective.trim() || !messaging.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Salvar" : "Criar blueprint"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Agents Tab ─────────────────────────────────────────────

function AgentsTab() {
  const { data, mutate, isLoading } = useSWR<{ configs: EmailAgentConfig[] }>(
    "/api/admin/email-agent-configs",
    fetcher,
  )
  const configs = data?.configs ?? []
  const [editingAgent, setEditingAgent] = useState<AgentType | null>(null)

  const activeConfigs = (["copy", "image", "html"] as AgentType[]).map((at) => ({
    agentType: at,
    config: configs.find((c) => c.agent_type === at && c.is_active) ?? null,
  }))

  return (
    <div className="space-y-3">
      {isLoading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}
      {!isLoading && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {activeConfigs.map(({ agentType, config }) => {
            const IconComp = AGENT_ICONS[agentType]
            return (
              <button
                key={agentType}
                type="button"
                onClick={() => setEditingAgent(agentType)}
                className={cn(
                  "rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]",
                  "p-4 text-left transition-all hover:border-slate-300 dark:hover:border-white/[0.14]",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <IconComp className="h-5 w-5 text-slate-500 dark:text-white/45" />
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                    {AGENT_LABELS[agentType]}
                  </span>
                  {config && (
                    <Badge variant="info" showDot={false}>
                      v{config.version}
                    </Badge>
                  )}
                </div>
                <p className="text-[12px] text-slate-500 dark:text-white/55 line-clamp-2">
                  {AGENT_DESCRIPTIONS[agentType]}
                </p>
                {config && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 dark:text-white/35">
                    <span>{config.model}</span>
                    <span>T={config.temperature}</span>
                    <span>{config.max_tokens} tokens</span>
                  </div>
                )}
                {!config && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                    Não configurado
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {editingAgent && (
        <AgentConfigDialog
          agentType={editingAgent}
          config={configs.find((c) => c.agent_type === editingAgent && c.is_active) ?? null}
          onClose={() => setEditingAgent(null)}
          onSaved={() => {
            setEditingAgent(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function AgentConfigDialog({
  agentType,
  config,
  onClose,
  onSaved,
}: {
  agentType: AgentType
  config: EmailAgentConfig | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = config !== null
  const [model, setModel] = useState(config?.model ?? "claude-sonnet-4-6")
  const [systemPrompt, setSystemPrompt] = useState(config?.system_prompt ?? "")
  const [userTemplate, setUserTemplate] = useState(config?.user_template ?? "")
  const [temperature, setTemperature] = useState(config?.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(config?.max_tokens ?? 2048)
  const [submitting, setSubmitting] = useState(false)

  const { data: historyData } = useSWR<{ configs: EmailAgentConfig[] }>(
    `/api/admin/email-agent-configs?agent_type=${agentType}&active_only=false`,
    fetcher,
  )
  const history = historyData?.configs ?? []

  const save = async () => {
    if (!systemPrompt.trim() || !userTemplate.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        agent_type: agentType,
        model,
        system_prompt: systemPrompt.trim(),
        user_template: userTemplate.trim(),
        temperature,
        max_tokens: maxTokens,
      }
      const url = isEdit
        ? `/api/admin/email-agent-configs/${config!.id}`
        : "/api/admin/email-agent-configs"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Erro ao salvar")
      }
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

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[700px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            Configurar agente {AGENT_LABELS[agentType]}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              Agente: {AGENT_LABELS[agentType]}
              {config && (
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  v{config.version}
                </span>
              )}
            </h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Modelo
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="crm-input w-full"
                >
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-opus-4-7">Claude Opus 4.7</option>
                  <option value="claude-haiku-3-5">Claude Haiku 3.5</option>
                </select>
              </div>
              <div className="space-y-1.5">
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
                  className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#4E62D8]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Max tokens
                </label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
                  min={100}
                  max={32768}
                  className="crm-input w-full"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                System prompt
              </label>
              <textarea
                rows={6}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instruções de sistema para o agente..."
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                User template
              </label>
              <textarea
                rows={6}
                value={userTemplate}
                onChange={(e) => setUserTemplate(e.target.value)}
                placeholder="Template da mensagem do usuário com {{variáveis}}..."
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            {history.length > 1 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  <History className="h-3.5 w-3.5" />
                  Versões anteriores
                </div>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {history
                    .filter((h) => !h.is_active)
                    .slice(0, 5)
                    .map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between text-[11px] text-slate-500 dark:text-white/45 px-2 py-1 rounded bg-slate-50 dark:bg-white/[0.03]"
                      >
                        <span>
                          v{h.version} - {h.model} - T={h.temperature}
                        </span>
                        <span>
                          {new Date(h.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !systemPrompt.trim() || !userTemplate.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Save className="h-3.5 w-3.5" />
              {isEdit ? "Salvar (nova versão)" : "Criar configuração"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Settings Tab ───────────────────────────────────────────

function SettingsTab() {
  const { data, mutate, isLoading } = useSWR<{ settings: EmailGenerationSettings | null }>(
    "/api/admin/email-generation-settings?org_id=00000000-0000-0000-0000-000000000001",
    fetcher,
  )
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<EmailGenerationSettings>>({})
  const [emailInput, setEmailInput] = useState("")

  const settings = data?.settings
  const merged = {
    auto_trigger: form.auto_trigger ?? settings?.auto_trigger ?? false,
    max_parallel: form.max_parallel ?? settings?.max_parallel ?? 3,
    generate_images: form.generate_images ?? settings?.generate_images ?? true,
    notify_on_error: form.notify_on_error ?? settings?.notify_on_error ?? true,
    notify_on_success: form.notify_on_success ?? settings?.notify_on_success ?? false,
    notify_emails: form.notify_emails ?? settings?.notify_emails ?? [],
  }

  const dirty = Object.keys(form).length > 0

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/email-generation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: "00000000-0000-0000-0000-000000000001",
          ...form,
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      setForm({})
      mutate()
      toast({ title: "Configurações salvas" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configurações" })
    } finally {
      setSaving(false)
    }
  }

  const addEmail = () => {
    const email = emailInput.trim()
    if (!email || !email.includes("@")) return
    const current = merged.notify_emails
    if (!current.includes(email)) {
      setForm((f) => ({ ...f, notify_emails: [...current, email] }))
    }
    setEmailInput("")
  }

  const removeEmail = (email: string) => {
    setForm((f) => ({
      ...f,
      notify_emails: merged.notify_emails.filter((e) => e !== email),
    }))
  }

  if (isLoading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-[600px] space-y-5">
      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Comportamento
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Trigger automático</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Iniciar geração automaticamente ao criar emails
            </p>
          </div>
          <Switch
            checked={merged.auto_trigger}
            onCheckedChange={(v) => setForm((f) => ({ ...f, auto_trigger: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Gerar imagens</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Incluir geração de imagens no pipeline
            </p>
          </div>
          <Switch
            checked={merged.generate_images}
            onCheckedChange={(v) => setForm((f) => ({ ...f, generate_images: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Execuções paralelas</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Máximo de agentes rodando simultaneamente
            </p>
          </div>
          <input
            type="number"
            value={merged.max_parallel}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                max_parallel: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)),
              }))
            }
            min={1}
            max={10}
            className="crm-input w-[80px] text-center"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Notificações
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em erros</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando uma geração falhar
            </p>
          </div>
          <Switch
            checked={merged.notify_on_error}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_error: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em sucesso</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando a geração concluir com sucesso
            </p>
          </div>
          <Switch
            checked={merged.notify_on_success}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_success: v }))}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] text-slate-700 dark:text-white/80">Emails para notificação</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="email@exemplo.com"
              className="crm-input flex-1"
            />
            <button
              type="button"
              onClick={addEmail}
              className="h-8 px-3 rounded-[6px] bg-slate-100 dark:bg-white/[0.06] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-200 dark:hover:bg-white/[0.10]"
            >
              Adicionar
            </button>
          </div>
          {merged.notify_emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {merged.notify_emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 px-2 py-0.5 rounded-full"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar configurações
          </button>
        </div>
      )}
    </div>
  )
}

// ─── References Tab ─────────────────────────────────────────

function ReferencesTab() {
  const { data, mutate, isLoading } = useSWR<{ templates: EmailReferenceTemplate[] }>(
    "/api/admin/email-reference-templates",
    fetcher,
  )
  const templates = data?.templates ?? []
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [flowType, setFlowType] = useState("")
  const [html, setHtml] = useState("")
  const [tags, setTags] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/email-reference-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          flow_type: flowType || undefined,
          html: html || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error("Erro ao criar")
      setAdding(false)
      setName("")
      setFlowType("")
      setHtml("")
      setTags("")
      mutate()
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar referência" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75">
          {templates.length} referência{templates.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova referência
        </button>
      </div>

      {isLoading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && templates.length === 0 && !adding && (
        <div className="rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 text-center">
          <p className="text-[13px] text-slate-500 dark:text-white/45">
            Nenhuma referência ainda. Adicione HTMLs de exemplo para guiar a geração.
          </p>
        </div>
      )}

      {adding && (
        <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Template Black Friday"
                className="crm-input w-full"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Flow type
              </label>
              <select
                value={flowType}
                onChange={(e) => setFlowType(e.target.value)}
                className="crm-input w-full"
              >
                <option value="">Todos</option>
                {Object.entries(FLOW_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              HTML
            </label>
            <textarea
              rows={8}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="Cole o HTML de referência aqui..."
              className="crm-input w-full font-mono text-[12px]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Tags (separadas por vírgula)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="promo, minimal, dark"
              className="crm-input w-full"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                  {tpl.name}
                </h4>
                {tpl.flow_type && (
                  <span className="text-[11px] text-slate-500 dark:text-white/45">
                    {FLOW_TYPE_LABELS[tpl.flow_type] ?? tpl.flow_type}
                  </span>
                )}
              </div>
              <Badge
                variant={tpl.is_active ? "positive" : "neutral"}
                showDot
              >
                {tpl.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {tpl.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tpl.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-400 dark:text-white/35">
              {new Date(tpl.created_at).toLocaleDateString("pt-BR")}
              {tpl.html ? " - HTML incluído" : " - Sem HTML"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
