"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, AlertTriangle,
  ExternalLink, Trash2, Save, Zap, Info,
} from "lucide-react"
import { Icon, BrandIcon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type IntegrationKey = "shopify" | "klaviyo" | "omnisend" | "ga4" | "meta"

export interface IntegrationCredentials {
  shopify: { store_domain: string; access_token_masked: string | null; configured: boolean }
  klaviyo: { public_key: string; private_key_masked: string | null; list_id: string; configured: boolean }
  omnisend: { api_key_masked: string | null; configured: boolean }
  ga4: { property_id: string; credentials_configured: boolean; client_email: string | null }
  meta: { access_token_masked: string | null; page_id: string; ad_account_id: string; configured: boolean }
}

export interface IntegrationStatusData {
  connected: boolean
  configured?: boolean
  status?: "not_configured" | "pending_validation" | "connected" | "error"
  validated_at?: string | null
  error?: string | null
  hasReportingAccess?: boolean
  missingScopes?: string[]
}

interface IntegrationConfigModalProps {
  open: boolean
  onClose: () => void
  integration: IntegrationKey
  storeId: string
  credentials: IntegrationCredentials[IntegrationKey] | null
  status: IntegrationStatusData | undefined
  onSaved: () => void
}

// ────────────────────────────────────────────────────────────────
// Integration metadata
// ────────────────────────────────────────────────────────────────

const INTEGRATION_META: Record<IntegrationKey, {
  label: string
  brandIcon?: string
  description: string
  docsUrl: string
  color: string
}> = {
  shopify: {
    label: "Shopify",
    brandIcon: "/images/integrations/shopify.svg",
    description: "Conecte sua loja Shopify para sincronizar pedidos, clientes e produtos.",
    docsUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    color: "#95BF46",
  },
  klaviyo: {
    label: "Klaviyo",
    brandIcon: "/images/integrations/klaviyo.svg",
    description: "Integração com Klaviyo para puxar métricas de email, flows e campanhas.",
    docsUrl: "https://developers.klaviyo.com/en/docs/retrieve_api_credentials",
    color: "#4E62D8",
  },
  omnisend: {
    label: "Omnisend",
    brandIcon: "/images/integrations/omnisend.svg",
    description: "Integração com Omnisend para puxar métricas de email, automações e campanhas.",
    docsUrl: "https://support.omnisend.com/en/articles/1061890-generating-api-key",
    color: "#F97316",
  },
  ga4: {
    label: "Google Analytics (GA4)",
    description: "Conecte sua propriedade GA4 via Service Account JSON para importar métricas.",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries",
    color: "#F9AB00",
  },
  meta: {
    label: "Meta Ads",
    description: "Conecte sua conta Meta Business para importar campanhas e métricas de anúncios.",
    docsUrl: "https://developers.facebook.com/docs/marketing-api/get-started",
    color: "#1877F2",
  },
}

// ────────────────────────────────────────────────────────────────
// Modal principal
// ────────────────────────────────────────────────────────────────

export function IntegrationConfigModal({
  open, onClose, integration, storeId, credentials, status, onSaved,
}: IntegrationConfigModalProps) {
  const meta = INTEGRATION_META[integration]
  const { toast } = useToast()

  // ── Estados do formulario (populados na abertura) ────────────
  const [form, setForm] = useState<Record<string, string>>({})
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Reseta form ao abrir/fechar
  useEffect(() => {
    if (!open) return
    setTestResult(null)
    setShowSecret({})

    if (integration === "shopify") {
      const c = credentials as IntegrationCredentials["shopify"] | null
      setForm({
        shopify_store_domain: c?.store_domain || "",
        shopify_access_token: "",
      })
    } else if (integration === "klaviyo") {
      const c = credentials as IntegrationCredentials["klaviyo"] | null
      setForm({
        klaviyo_public_key: c?.public_key || "",
        klaviyo_private_key: "",
        klaviyo_list_id: c?.list_id || "",
      })
    } else if (integration === "omnisend") {
      setForm({ omnisend_api_key: "" })
    } else if (integration === "ga4") {
      const c = credentials as IntegrationCredentials["ga4"] | null
      setForm({
        ga4_property_id: c?.property_id || "",
        ga4_credentials_json: "",
      })
    } else if (integration === "meta") {
      const c = credentials as IntegrationCredentials["meta"] | null
      setForm({
        meta_access_token: "",
        meta_page_id: c?.page_id || "",
        meta_ad_account_id: c?.ad_account_id || "",
      })
    }
  }, [open, integration, credentials])

  const isConfigured = credentials ? (
    integration === "shopify" ? (credentials as IntegrationCredentials["shopify"]).configured :
    integration === "klaviyo" ? (credentials as IntegrationCredentials["klaviyo"]).configured :
    integration === "omnisend" ? (credentials as IntegrationCredentials["omnisend"]).configured :
    integration === "ga4" ? (credentials as IntegrationCredentials["ga4"]).credentials_configured :
    integration === "meta" ? (credentials as IntegrationCredentials["meta"]).configured :
    false
  ) : false

  // ── Testa integracao ─────────────────────────────────────────
  const handleTest = useCallback(async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const payload: Record<string, string> = {}
      // So envia campos preenchidos (ignora mascaras vazias)
      for (const [k, v] of Object.entries(form)) {
        if (v && v.trim()) payload[k] = v.trim()
      }

      const res = await fetch("/api/client-stores/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          integration,
          payload: Object.keys(payload).length > 0 ? payload : undefined,
        }),
      })
      const data = await res.json()
      const result = { valid: !!data.valid, message: data.message || "Sem mensagem" }
      setTestResult(result)

      if (result.valid) {
        toast({ title: "Conexão bem-sucedida", description: result.message })
      } else {
        toast({ variant: "destructive", title: "Falha na conexão", description: result.message })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      setTestResult({ valid: false, message: msg })
      toast({ variant: "destructive", title: "Erro ao testar", description: msg })
    } finally {
      setIsTesting(false)
    }
  }, [form, integration, storeId, toast])

  // ── Salva credenciais ─────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const payload: Record<string, unknown> = { store_id: storeId }

      // Filtra: so envia campos preenchidos (mantem ja salvos se vazio)
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === "string" && v.trim()) {
          if (k === "ga4_credentials_json") {
            try {
              payload.ga4_credentials = JSON.parse(v.trim())
            } catch {
              throw new Error("JSON do GA4 é inválido.")
            }
          } else {
            payload[k] = v.trim()
          }
        }
      }

      const res = await fetch("/api/client-stores/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao salvar")

      toast({ title: "Credenciais salvas", description: `${meta.label} atualizada com sucesso.` })
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast({ variant: "destructive", title: "Erro ao salvar", description: msg })
    } finally {
      setIsSaving(false)
    }
  }, [form, storeId, meta.label, toast, onSaved, onClose])

  // ── Deleta integracao ─────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(
        `/api/client-stores/credentials?store_id=${encodeURIComponent(storeId)}&integration=${integration}`,
        { method: "DELETE" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao remover")

      toast({ title: "Integração removida", description: `${meta.label} foi desconectada.` })
      onSaved()
      onClose()
      setShowDeleteConfirm(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast({ variant: "destructive", title: "Erro ao remover", description: msg })
    } finally {
      setIsDeleting(false)
    }
  }, [storeId, integration, meta.label, toast, onSaved, onClose])

  const toggleSecret = (field: string) => setShowSecret((s) => ({ ...s, [field]: !s[field] }))

  // ────────────────────────────────────────────────────────────
  // Render dos campos por integracao
  // ────────────────────────────────────────────────────────────

  const renderFields = () => {
    const cred = credentials as IntegrationCredentials[IntegrationKey] | null

    if (integration === "shopify") {
      const c = cred as IntegrationCredentials["shopify"] | null
      return (
        <>
          <FormField label="Domínio da Loja" hint="Ex: minhaloja.myshopify.com">
            <Input
              value={form.shopify_store_domain || ""}
              onChange={(e) => setForm({ ...form, shopify_store_domain: e.target.value })}
              placeholder="minhaloja.myshopify.com"
            />
          </FormField>
          <FormField
            label="Admin API Access Token *"
            hint={c?.access_token_masked ? `Token atual: ${c.access_token_masked} (deixe vazio para manter)` : "Token começa com 'shpat_'"}
          >
            <SecretInput
              value={form.shopify_access_token || ""}
              onChange={(v) => setForm({ ...form, shopify_access_token: v })}
              show={!!showSecret.shopify_access_token}
              onToggle={() => toggleSecret("shopify_access_token")}
              placeholder={c?.access_token_masked ? "Manter token atual" : "shpat_xxxxxxxxxxxxxxxx"}
            />
          </FormField>
        </>
      )
    }

    if (integration === "klaviyo") {
      const c = cred as IntegrationCredentials["klaviyo"] | null
      return (
        <>
          <FormField label="Public API Key / Site ID" hint="6 caracteres, encontrado em Account → Settings">
            <Input
              value={form.klaviyo_public_key || ""}
              onChange={(e) => setForm({ ...form, klaviyo_public_key: e.target.value })}
              placeholder="XXXXXX"
            />
          </FormField>
          <FormField
            label="Private API Key *"
            hint={c?.private_key_masked ? `Key atual: ${c.private_key_masked} (deixe vazio para manter)` : "Começa com 'pk_'"}
          >
            <SecretInput
              value={form.klaviyo_private_key || ""}
              onChange={(v) => setForm({ ...form, klaviyo_private_key: v })}
              show={!!showSecret.klaviyo_private_key}
              onToggle={() => toggleSecret("klaviyo_private_key")}
              placeholder={c?.private_key_masked ? "Manter key atual" : "pk_xxxxxxxxxxxxxxxxxxxxx"}
            />
          </FormField>
          <FormField label="List ID (opcional)" hint="ID da lista principal para métricas de crescimento">
            <Input
              value={form.klaviyo_list_id || ""}
              onChange={(e) => setForm({ ...form, klaviyo_list_id: e.target.value })}
              placeholder="Exemplo: SJKA83"
            />
          </FormField>
        </>
      )
    }

    if (integration === "omnisend") {
      const c = cred as IntegrationCredentials["omnisend"] | null
      return (
        <FormField
          label="API Key *"
          hint={c?.api_key_masked ? `Key atual: ${c.api_key_masked} (deixe vazio para manter)` : "Gerada em Store settings → Integrations → API keys"}
        >
          <SecretInput
            value={form.omnisend_api_key || ""}
            onChange={(v) => setForm({ ...form, omnisend_api_key: v })}
            show={!!showSecret.omnisend_api_key}
            onToggle={() => toggleSecret("omnisend_api_key")}
            placeholder={c?.api_key_masked ? "Manter key atual" : "xxxxxxxxxxxxxxxxxxxx"}
          />
        </FormField>
      )
    }

    if (integration === "ga4") {
      const c = cred as IntegrationCredentials["ga4"] | null
      return (
        <>
          <FormField label="Property ID" hint="ID numérico da propriedade GA4 (ex: 123456789)">
            <Input
              value={form.ga4_property_id || ""}
              onChange={(e) => setForm({ ...form, ga4_property_id: e.target.value })}
              placeholder="123456789"
            />
          </FormField>
          <FormField
            label="Service Account JSON *"
            hint={c?.client_email ? `Configurado: ${c.client_email} (cole novo JSON para substituir)` : "JSON baixado ao criar a Service Account no Google Cloud"}
          >
            <Textarea
              value={form.ga4_credentials_json || ""}
              onChange={(e) => setForm({ ...form, ga4_credentials_json: e.target.value })}
              placeholder={c?.credentials_configured ? "Manter credenciais atuais" : '{ "type": "service_account", ... }'}
              rows={6}
              className="font-mono text-xs"
            />
          </FormField>
        </>
      )
    }

    if (integration === "meta") {
      const c = cred as IntegrationCredentials["meta"] | null
      return (
        <>
          <FormField
            label="Access Token *"
            hint={c?.access_token_masked ? `Token atual: ${c.access_token_masked}` : "Long-lived access token da Meta Business"}
          >
            <SecretInput
              value={form.meta_access_token || ""}
              onChange={(v) => setForm({ ...form, meta_access_token: v })}
              show={!!showSecret.meta_access_token}
              onToggle={() => toggleSecret("meta_access_token")}
              placeholder={c?.access_token_masked ? "Manter token atual" : "EAAxxxxx..."}
            />
          </FormField>
          <FormField label="Page ID (opcional)">
            <Input
              value={form.meta_page_id || ""}
              onChange={(e) => setForm({ ...form, meta_page_id: e.target.value })}
              placeholder="123456789"
            />
          </FormField>
          <FormField label="Ad Account ID (opcional)">
            <Input
              value={form.meta_ad_account_id || ""}
              onChange={(e) => setForm({ ...form, meta_ad_account_id: e.target.value })}
              placeholder="act_123456789"
            />
          </FormField>
        </>
      )
    }

    return null
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              {meta.brandIcon ? (
                <BrandIcon src={meta.brandIcon} alt={meta.label} size={28} />
              ) : (
                <div
                  className="w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0"
                  style={{ background: `${meta.color}20`, color: meta.color }}
                >
                  <Icon icon={Zap} size={16} />
                </div>
              )}
              <DialogTitle className="text-base">{isConfigured ? `Editar ${meta.label}` : `Conectar ${meta.label}`}</DialogTitle>
            </div>
            <DialogDescription className="text-xs">{meta.description}</DialogDescription>
          </DialogHeader>

          {/* Status badge */}
          {isConfigured && status && (
            <div className="flex items-center justify-between rounded-[8px] bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 px-3 py-2">
              <div className="flex items-center gap-2">
                {status.status === "connected" ? (
                  <Icon icon={CheckCircle2} size={16} className="text-emerald-600 dark:text-emerald-400" />
                ) : status.status === "error" ? (
                  <Icon icon={XCircle} size={16} className="text-red-600 dark:text-red-400" />
                ) : (
                  <Icon icon={AlertTriangle} size={16} className="text-amber-600 dark:text-amber-400" />
                )}
                <span className="text-[12px] font-medium text-gray-700 dark:text-white/90">
                  {status.status === "connected"
                    ? "Conectado"
                    : status.status === "error"
                      ? status.error || "Erro na conexão"
                      : "Pendente de validação"}
                </span>
              </div>
              {status.validated_at && (
                <span className="text-[10px] text-gray-400 dark:text-white/40 font-mono">
                  {new Date(status.validated_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          )}

          {/* Campos */}
          <div className="space-y-4 py-2">{renderFields()}</div>

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                "rounded-[8px] border px-3 py-2 text-[12px] flex items-start gap-2",
                testResult.valid
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/30 dark:text-emerald-300"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-300"
              )}
            >
              <Icon
                icon={testResult.valid ? CheckCircle2 : XCircle}
                size={16}
                className="shrink-0 mt-0.5"
              />
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Docs link */}
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
          >
            <Icon icon={Info} customSize={12} />
            Como obter essas credenciais
            <Icon icon={ExternalLink} customSize={10} />
          </a>

          <DialogFooter className="gap-2 sm:gap-2">
            {isConfigured && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || isDeleting}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
              >
                <Icon icon={Trash2} size={16} className="mr-1.5" />
                Remover
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={isSaving || isTesting}
            >
              {isTesting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Icon icon={Zap} size={16} className="mr-1.5" />}
              Testar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || isTesting}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Icon icon={Save} size={16} className="mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração {meta.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              As credenciais serão apagadas permanentemente. Você pode reconectar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ────────────────────────────────────────────────────────────────
// Mini componentes
// ────────────────────────────────────────────────────────────────

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-gray-700 dark:text-white/80">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-white/40">{hint}</p>}
    </div>
  )
}

function SecretInput({
  value, onChange, show, onToggle, placeholder,
}: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/70"
      >
        <Icon icon={show ? EyeOff : Eye} size={16} />
      </button>
    </div>
  )
}

// Helper: export for the grid to know which integrations support the modal
export { INTEGRATION_META, type IntegrationStatusData as ModalStatusData }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _badgeRef = Badge // mantem import
