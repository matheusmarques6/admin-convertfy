"use client"

import { useState, useEffect } from "react"
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
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Store,
  Mail,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type {
  EmailAgentConfig,
  ImageMapEntry,
  ImageMapType,
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

type Tab = "agents" | "settings" | "references" | "test"

export default function EmailGenerationSettingsPage() {
  const [tab, setTab] = useState<Tab>("agents")

  return (
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Geração de Emails"
        description="Prompts dos agentes, configurações e referências de geração automática."
      />

      <SegmentedTabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <SegmentedTabItem value="agents">Agentes</SegmentedTabItem>
        <SegmentedTabItem value="settings">Configurações</SegmentedTabItem>
        <SegmentedTabItem value="references">Referências</SegmentedTabItem>
        <SegmentedTabItem value="test">Testar</SegmentedTabItem>
      </SegmentedTabs>

      {tab === "agents" && <AgentsTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "references" && <ReferencesTab />}
      {tab === "test" && <TestTab />}
    </div>
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
  const defaultModel = agentType === "image" ? "gpt-image-2" : "claude-sonnet-4-6"
  const [model, setModel] = useState(config?.model ?? defaultModel)
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
                  {agentType === "image" ? (
                    <>
                      <option value="gpt-image-2">GPT Image 2</option>
                      <option value="gpt-image-1">GPT Image 1</option>
                    </>
                  ) : (
                    <>
                      <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                      <option value="claude-opus-4-7">Claude Opus 4.7</option>
                      <option value="claude-haiku-3-5">Claude Haiku 3.5</option>
                    </>
                  )}
                </select>
              </div>
              {agentType !== "image" && (
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
              )}
              {agentType !== "image" && (
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
              )}
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
  const [editing, setEditing] = useState<EmailReferenceTemplate | "new" | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75">
          {templates.length} referência{templates.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
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

      {!isLoading && templates.length === 0 && !editing && (
        <div className="rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 text-center">
          <p className="text-[13px] text-slate-500 dark:text-white/45">
            Nenhuma referência ainda. Adicione HTMLs e copys de exemplo para guiar a geração.
          </p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => setEditing(tpl)}
            className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 text-left hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                  {tpl.name}
                </h4>
                {(tpl.flow_type || tpl.email_number) && (
                  <span className="text-[11px] text-slate-500 dark:text-white/45">
                    {FLOW_TYPE_LABELS[tpl.flow_type ?? ""] ?? tpl.flow_type ?? ""}
                    {tpl.email_number ? ` #${tpl.email_number}` : ""}
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
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 dark:text-white/35">
              <span>{new Date(tpl.created_at).toLocaleDateString("pt-BR")}</span>
              {tpl.html && <span>HTML</span>}
              {tpl.copy && <span>Copy</span>}
              {!tpl.html && !tpl.copy && <span>Vazio</span>}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
              <Pencil className="h-3 w-3" />
              Editar
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <ReferenceDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutate() }}
        />
      )}
    </div>
  )
}

function ReferenceDialog({
  template,
  onClose,
  onSaved,
}: {
  template: EmailReferenceTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = template !== null
  const [name, setName] = useState(template?.name ?? "")
  const [flowType, setFlowType] = useState(template?.flow_type ?? "")
  const [emailNumber, setEmailNumber] = useState<number | null>(template?.email_number ?? null)
  const [html, setHtml] = useState(template?.html ?? "")
  const [copy, setCopy] = useState(template?.copy ?? "")
  const [imageMap, setImageMap] = useState<ImageMapEntry[]>(template?.image_map ?? [])
  const [tags, setTags] = useState((template?.tags ?? []).join(", "))
  const [isActive, setIsActive] = useState(template?.is_active ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [testingIdx, setTestingIdx] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const detectImageType = (src: string): ImageMapType => {
    const s = src.toUpperCase()
    if (s.includes("LOGO")) return "logo"
    if (s.includes("HERO") || s.includes("BANNER")) return "hero"
    if (s.includes("PRODUCT") || s.includes("PRODUTO")) return "product"
    if (s.includes("ICON")) return "icon"
    if (s.includes("STAR") || s.includes("SEPARATOR") || s.includes("DIVIDER")) return "decorative"
    return "custom"
  }

  const extractImagesFromHtml = (htmlStr: string) => {
    const imgRe = /<img[^>]+src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*(?:width="(\d+)")?[^>]*(?:height="(\d+)")?[^>]*/gi
    const found: ImageMapEntry[] = []
    const seen = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = imgRe.exec(htmlStr)) !== null) {
      const src = m[1]
      if (seen.has(src)) continue
      seen.add(src)
      if (src.startsWith("http") && !src.includes("placehold")) continue
      const alt = m[2] ?? ""
      const width = m[3] ? parseInt(m[3]) : null
      const height = m[4] ? parseInt(m[4]) : null
      const type = detectImageType(src)
      const existing = imageMap.find((e) => e.src === src)
      found.push({
        src, alt, width, height,
        type: existing?.type ?? type,
        product_index: existing?.product_index ?? (type === "product" ? found.filter((f) => f.type === "product").length : undefined),
        instruction: existing?.instruction ?? null,
      })
    }
    return found
  }

  const handleHtmlChange = (newHtml: string) => {
    setHtml(newHtml)
    if (newHtml.trim()) {
      const detected = extractImagesFromHtml(newHtml)
      if (detected.length > 0) setImageMap(detected)
    }
  }

  const save = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        flow_type: flowType || null,
        email_number: emailNumber,
        html: html || null,
        copy: copy || null,
        image_map: imageMap.length > 0 ? imageMap : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        is_active: isActive,
      }
      const url = isEdit
        ? `/api/admin/email-reference-templates/${template!.id}`
        : "/api/admin/email-reference-templates"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      onSaved()
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar referência" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !confirm("Tem certeza que deseja excluir esta referência?")) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/email-reference-templates/${template!.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Erro ao excluir")
      onSaved()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir referência" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[800px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar referência" : "Nova referência"}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? `Editar: ${template!.name}` : "Nova referência"}
            </h2>
            <DialogPrimitive.Close asChild>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Nome</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Welcome 1" className="crm-input w-full" autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Flow type</label>
                <select value={flowType} onChange={(e) => setFlowType(e.target.value)} className="crm-input w-full">
                  <option value="">Todos</option>
                  {Object.entries(FLOW_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Email #</label>
                <input type="number" value={emailNumber ?? ""} onChange={(e) => setEmailNumber(e.target.value ? parseInt(e.target.value) : null)} placeholder="1" min={1} max={20} className="crm-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Tags</label>
                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="promo, minimal" className="crm-input w-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Referência de Copy (texto/estrutura que o agente Copy deve seguir)
              </label>
              <textarea
                rows={8}
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                placeholder={"Subject: Bem-vinda à [marca]...\nPreheader: ...\n\n1. HERO\nHeadline: ...\nBody: ...\nCTA: ...\n\n2. TEXTO\n..."}
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Referência de HTML (template base para o agente HTML)
              </label>
              <textarea
                rows={8}
                value={html}
                onChange={(e) => handleHtmlChange(e.target.value)}
                placeholder="Cole o HTML de referência aqui..."
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            {imageMap.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Imagens detectadas ({imageMap.length})
                </label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {imageMap.map((img, idx) => {
                    const isHeroOrCustom = img.type === "hero" || img.type === "custom"
                    return (
                      <div key={img.src} className="flex items-start gap-2 p-2.5 rounded-[4px] bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                        <div className="shrink-0 w-10 h-10 rounded bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[16px]">
                          {img.type === "logo" ? "🏷" : img.type === "hero" ? "🖼" : img.type === "product" ? "📦" : img.type === "icon" ? "✨" : img.type === "decorative" ? "⭐" : "🎨"}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-white/40 truncate flex-1">{img.src}</span>
                            {img.width && img.height && (
                              <span className="text-[10px] text-slate-400 dark:text-white/30 shrink-0">{img.width}x{img.height}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setImageMap(imageMap.filter((_, i) => i !== idx))
                              }}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                              title="Remover esta imagem"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={img.type}
                              onChange={(e) => {
                                const updated = [...imageMap]
                                updated[idx] = { ...img, type: e.target.value as ImageMapType }
                                setImageMap(updated)
                              }}
                              className="crm-input text-[11px] h-7 w-[100px]"
                            >
                              <option value="logo">Logo</option>
                              <option value="hero">Hero</option>
                              <option value="product">Produto</option>
                              <option value="icon">Ícone</option>
                              <option value="decorative">Decorativo</option>
                              <option value="custom">Custom</option>
                            </select>
                            {img.type === "icon" && (
                              <input
                                type="text"
                                value={img.instruction ?? ""}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, instruction: e.target.value || null }
                                  setImageMap(updated)
                                }}
                                placeholder="Ex: 🚚"
                                className="crm-input text-[11px] h-7 flex-1"
                              />
                            )}
                            {img.type === "product" && (
                              <input
                                type="number"
                                value={img.product_index ?? 0}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, product_index: parseInt(e.target.value) || 0 }
                                  setImageMap(updated)
                                }}
                                min={0}
                                max={9}
                                placeholder="Índice"
                                className="crm-input text-[11px] h-7 w-[60px]"
                              />
                            )}
                          </div>
                          {isHeroOrCustom && (
                            <div className="space-y-1.5 mt-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
                                  Prompt de geração (GPT Image 2)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setTestingIdx(idx)}
                                  disabled={!img.image_prompt?.trim()}
                                  className="inline-flex items-center gap-1 h-6 px-2 rounded-[4px] text-[10px] font-medium text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Testar geração com uma loja real"
                                >
                                  <Play className="h-3 w-3" />
                                  Testar geração
                                </button>
                              </div>
                              <textarea
                                rows={4}
                                value={img.image_prompt ?? ""}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, image_prompt: e.target.value || null }
                                  setImageMap(updated)
                                }}
                                placeholder={`Descreva exatamente como esta imagem deve ser gerada.\n\nVariáveis disponíveis:\nIdentidade: {brand_name}, {nicho}, {persona}, {diferencial}, {slogan}, {tom_voz}, {posicionamento}\nVisual: {primary_colors}, {secondary_colors}, {color_names}, {font_heading}, {logo_url}\nProdutos: {top_products}, {product_1_name}, ..., {product_5_name}, {top_products_images}\nBloco: {block_purpose}`}
                                className="crm-input w-full font-mono text-[11px]"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {testingIdx !== null && imageMap[testingIdx] && (
              <TestImageDialog
                imagePrompt={imageMap[testingIdx].image_prompt ?? ""}
                onClose={() => setTestingIdx(null)}
              />
            )}
            {isEdit && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-[12px] text-slate-600 dark:text-white/60">{isActive ? "Ativo" : "Inativo"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 text-[12px] text-red-500 hover:text-red-600"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Excluir
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Save className="h-3.5 w-3.5" />
              {isEdit ? "Salvar" : "Criar referência"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Test Image Dialog ─────────────────────────────────────

function TestImageDialog({
  imagePrompt,
  onClose,
}: {
  imagePrompt: string
  onClose: () => void
}) {
  const { data: storesData } = useSWR<{ stores: Array<{ id: string; store_name: string }> }>(
    "/api/admin/stores",
    fetcher,
  )
  const stores = storesData?.stores ?? []
  const [storeId, setStoreId] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ url: string; rendered_prompt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!storeId) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/email-reference-templates/test-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_prompt: imagePrompt, store_id: storeId }),
      })
      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const payload = (data?.data ?? data) as Record<string, unknown>
      if (!res.ok) {
        throw new Error((payload?.error as string) || `HTTP ${res.status}`)
      }
      setResult({
        url: payload.url as string,
        rendered_prompt: payload.rendered_prompt as string,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na geração")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">Testar geração de imagem</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Testar geração de imagem</h2>
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
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Loja para teste
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="crm-input w-full"
                disabled={submitting}
              >
                <option value="">Selecione...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-[6px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
              ⚠️ A geração real custa ~$0.04 e leva ~3 minutos.
            </div>
            {error && (
              <div className="rounded-[6px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            {result && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">
                    Prompt enviado
                  </label>
                  <pre className="text-[11px] font-mono bg-slate-50 dark:bg-white/[0.03] p-2.5 rounded-[4px] max-h-[140px] overflow-y-auto whitespace-pre-wrap">
                    {result.rendered_prompt}
                  </pre>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">
                    Imagem gerada
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt="generated" className="w-full rounded-[4px] border border-slate-200 dark:border-white/[0.06]" />
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                    Abrir em nova aba
                  </a>
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
              Fechar
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={submitting || !storeId}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Gerando..." : "Gerar imagem real"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Test Tab ──────────────────────────────────────────────

interface StoreOption {
  id: string
  store_name: string
}

interface FlowOption {
  id: string
  flow_type: string
  name: string
  emails: Array<{
    id: string
    number: number
    name: string
    status: string
    subject: string | null
  }>
}

interface RunStep {
  agent: string
  status: "pending" | "success" | "error" | "skipped" | "running"
  error?: string
  durationMs?: number
  tokens?: number
  cost?: number
}

function TestTab() {
  const { data: storesData, isLoading: loadingStores } = useSWR<{ stores: StoreOption[] }>(
    "/api/admin/stores",
    fetcher,
  )
  const stores = storesData?.stores ?? []

  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [selectedFlowId, setSelectedFlowId] = useState("")
  const [selectedEmailId, setSelectedEmailId] = useState("")
  const [generating, setGenerating] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<{
    status: "done" | "error"
    error?: string
    batchId?: string
    emailId?: string
  } | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [pollInterval, setPollInterval] = useState(0)

  const { data: producaoData, isLoading: loadingFlows } = useSWR<{ flows: FlowOption[] }>(
    selectedStoreId ? `/api/admin/stores/${selectedStoreId}/producao` : null,
    fetcher,
  )
  const flows = producaoData?.flows ?? []

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)
  const selectedEmail = selectedFlow?.emails.find((e) => e.id === selectedEmailId)

  const { data: statusData } = useSWR(
    batchId && selectedStoreId
      ? `/api/admin/stores/${selectedStoreId}/generation-status/${batchId}`
      : null,
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
    },
  )

  const statusInfo = statusData?.data ?? statusData

  useEffect(() => {
    if (statusInfo && pollInterval > 0) {
      if (statusInfo.status === "done" || statusInfo.status === "error") {
        setPollInterval(0)
      }
    }
  }, [statusInfo, pollInterval])

  const handleGenerate = async () => {
    if (!selectedStoreId || !selectedFlowId || !selectedEmailId || !selectedFlow || !selectedEmail) return

    setGenerating(true)
    setResult(null)
    setBatchId(null)
    setSteps([
      { agent: "seed", status: "pending" },
      { agent: "copy", status: "pending" },
      { agent: "image", status: "pending" },
      { agent: "html", status: "pending" },
    ])

    try {
      const res = await fetch(`/api/admin/stores/${selectedStoreId}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: selectedFlowId,
          emailId: selectedEmailId,
          flowType: selectedFlow.flow_type,
          emailNumber: selectedEmail.number,
        }),
      })

      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          res.status === 504 || text.includes("timed out")
            ? "Timeout: a geração está demorando mais que o esperado. Tente novamente."
            : `Resposta inválida do servidor (HTTP ${res.status})`,
        )
      }
      const responseData = (parsed?.data ?? parsed) as Record<string, unknown>

      if (!res.ok) {
        throw new Error((responseData?.error as string) || `HTTP ${res.status}`)
      }

      setResult({
        status: (responseData.status as string) === "error" ? "error" : "done",
        error: responseData.error as string | undefined,
        batchId: responseData.batchId as string | undefined,
        emailId: responseData.emailId as string | undefined,
      })
      if (responseData.batchId) {
        setBatchId(responseData.batchId as string)
        setPollInterval(2000)
      }
    } catch (err) {
      setResult({
        status: "error",
        error: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setGenerating(false)
    }
  }

  const agentLabels: Record<string, string> = {
    seed: "Seed Blocos",
    copy: "Copy (IA)",
    image: "Imagem (IA)",
    html: "HTML (IA)",
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case "skipped": return <Clock className="h-4 w-4 text-slate-400" />
      default: return <Clock className="h-4 w-4 text-slate-300 dark:text-white/20" />
    }
  }

  const runSteps: RunStep[] = statusInfo?.agents
    ? (statusInfo.agents as RunStep[])
    : steps

  return (
    <div className="max-w-[700px] space-y-5">
      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-slate-700 dark:text-white/80" />
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
            Testar geração de email
          </h3>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-white/45">
          Selecione uma loja e um email para executar o pipeline completo (seed → copy → image → html).
        </p>

        <div className="space-y-3">
          {/* Store selector */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
              <Store className="h-3.5 w-3.5" />
              Loja
            </label>
            {loadingStores ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando lojas...
              </div>
            ) : (
              <select
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value)
                  setSelectedFlowId("")
                  setSelectedEmailId("")
                  setResult(null)
                  setBatchId(null)
                }}
                className="crm-input w-full"
              >
                <option value="">Selecione uma loja...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Flow selector */}
          {selectedStoreId && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                <Mail className="h-3.5 w-3.5" />
                Flow
              </label>
              {loadingFlows ? (
                <div className="flex items-center gap-2 text-[12px] text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando flows...
                </div>
              ) : flows.length === 0 ? (
                <p className="text-[12px] text-amber-600 dark:text-amber-400">
                  Nenhum flow encontrado. Inicialize os flows desta loja primeiro.
                </p>
              ) : (
                <select
                  value={selectedFlowId}
                  onChange={(e) => {
                    setSelectedFlowId(e.target.value)
                    setSelectedEmailId("")
                    setResult(null)
                    setBatchId(null)
                  }}
                  className="crm-input w-full"
                >
                  <option value="">Selecione um flow...</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {FLOW_TYPE_LABELS[f.flow_type] ?? f.flow_type} — {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Email selector */}
          {selectedFlow && selectedFlow.emails.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
              <select
                value={selectedEmailId}
                onChange={(e) => {
                  setSelectedEmailId(e.target.value)
                  setResult(null)
                  setBatchId(null)
                }}
                className="crm-input w-full"
              >
                <option value="">Selecione um email...</option>
                {selectedFlow.emails.map((e) => (
                  <option key={e.id} value={e.id}>
                    #{e.number} — {e.name} {e.subject ? `(${e.subject})` : ""} [{e.status}]
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Generate button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !selectedStoreId || !selectedFlowId || !selectedEmailId}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[13px] font-semibold disabled:opacity-40 transition-opacity"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {generating ? "Gerando..." : "Executar geração"}
          </button>
        </div>
      </div>

      {/* Progress / Result */}
      {(result || generating || statusInfo) && (
        <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-4">
          {/* Status header */}
          <div className="flex items-center gap-2">
            {statusInfo?.status === "done" || result?.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : statusInfo?.status === "error" || result?.status === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            )}
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
              {statusInfo?.status === "done" || result?.status === "done"
                ? "Geração concluída"
                : statusInfo?.status === "error" || result?.status === "error"
                  ? "Erro na geração"
                  : "Gerando email..."}
            </h3>
          </div>

          {/* Agent steps */}
          {statusInfo?.runs && (
            <div className="space-y-1.5">
              {(["seed", "copy", "image", "html"] as const).map((agent) => {
                const agentRuns = (statusInfo.runs as Array<{ agent: string; status: string; error_message?: string; duration_ms?: number; tokens_input?: number; tokens_output?: number; cost_cents?: number }>).filter(
                  (r) => r.agent === agent,
                )
                const latestRun = agentRuns[agentRuns.length - 1]
                const status = latestRun?.status ?? "pending"

                return (
                  <div
                    key={agent}
                    className="flex items-center justify-between px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2">
                      {statusIcon(status)}
                      <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                        {agentLabels[agent] ?? agent}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-white/35">
                      {latestRun?.duration_ms != null && (
                        <span>{(latestRun.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      {(latestRun?.tokens_input || latestRun?.tokens_output) && (
                        <span>
                          {((latestRun.tokens_input ?? 0) + (latestRun.tokens_output ?? 0)).toLocaleString()} tokens
                        </span>
                      )}
                      {latestRun?.cost_cents != null && latestRun.cost_cents > 0 && (
                        <span>${(latestRun.cost_cents / 100).toFixed(4)}</span>
                      )}
                      {latestRun?.error_message && (
                        <span className="text-red-500 max-w-[200px] truncate" title={latestRun.error_message}>
                          {latestRun.error_message}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Fallback steps when no status polling data yet */}
          {!statusInfo?.runs && steps.length > 0 && (
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div
                  key={step.agent}
                  className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 text-slate-300 animate-spin" />
                  ) : (
                    statusIcon(step.status)
                  )}
                  <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                    {agentLabels[step.agent] ?? step.agent}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {result?.error && (
            <div className="p-3 rounded-[4px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <p className="text-[12px] text-red-700 dark:text-red-400 font-mono break-all">
                {result.error}
              </p>
            </div>
          )}

          {/* Summary */}
          {statusInfo?.summary && (statusInfo.status === "done" || statusInfo.status === "error") && (
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-white/45">
              {statusInfo.summary.totalDuration > 0 && (
                <span>Tempo: {(statusInfo.summary.totalDuration / 1000).toFixed(1)}s</span>
              )}
              {statusInfo.summary.tokensTotal > 0 && (
                <span>Tokens: {statusInfo.summary.tokensTotal.toLocaleString()}</span>
              )}
              {statusInfo.summary.totalCost > 0 && (
                <span>Custo: ${(statusInfo.summary.totalCost / 100).toFixed(4)}</span>
              )}
              {batchId && (
                <a
                  href={`/admin/tools/email-generation-logs?batch=${batchId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                >
                  Ver logs completos
                </a>
              )}
              {selectedStoreId && selectedEmailId && statusInfo?.status === "done" && (
                <a
                  href={`/admin/stores/${selectedStoreId}/producao?email=${selectedEmailId}`}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Ver email gerado
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
