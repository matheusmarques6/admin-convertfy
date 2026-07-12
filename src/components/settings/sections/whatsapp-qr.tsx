"use client"

/**
 * Seção de Configurações "whatsapp-qr" — credenciais da Evolution API
 * (WhatsApp via QR / Baileys). Write-only: o GET devolve só metadata
 * (configurado?, últimos 4, origem) e os inputs sempre nascem vazios;
 * o PUT valida a key contra a Evolution no servidor antes de salvar.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, QrCode, XCircle } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"

interface EvolutionSettingsMetadata {
  base_url_configured: boolean
  api_key: { configured: boolean; last4: string | null; source: "db" | "env" | null }
  webhook_secret: { configured: boolean; source: "db" | "env" | null }
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

interface RewireResult {
  channel_id: string
  instance: string
  ok: boolean
  error?: string
}

function sourceLabel(source: "db" | "env" | null): string {
  if (source === "db") return "via Configurações"
  if (source === "env") return "via env"
  return "não configurado"
}

function StatusLine({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
      )}
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-500 dark:text-slate-400">{detail}</span>
    </div>
  )
}

export function WhatsAppQrSection() {
  const { toast } = useToast()
  const [meta, setMeta] = useState<EvolutionSettingsMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [rewire, setRewire] = useState<RewireResult[]>([])

  const loadMetadata = useCallback(async () => {
    const res = await fetch("/api/admin/settings/evolution")
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || "Falha ao carregar")
    const settings = (json?.data?.settings ?? json?.settings) as EvolutionSettingsMetadata
    if (settings) setMeta(settings)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadMetadata()
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Erro ao carregar",
            description: err instanceof Error ? err.message : "Erro desconhecido",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadMetadata, toast])

  const handleSave = async () => {
    setSaving(true)
    setRewire([])
    try {
      const body: Record<string, string> = {}
      if (apiKey.trim()) body.api_key = apiKey.trim()
      if (webhookSecret.trim()) body.webhook_secret = webhookSecret.trim()

      const res = await fetch("/api/admin/settings/evolution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Falha ao salvar")

      const settings = (json?.data?.settings ?? json?.settings) as EvolutionSettingsMetadata | undefined
      if (settings) setMeta(settings)
      const rewireResults = (json?.data?.rewire ?? json?.rewire ?? []) as RewireResult[]
      setRewire(rewireResults)
      setApiKey("")
      setWebhookSecret("")

      const failed = rewireResults.filter((r) => !r.ok).length
      toast({
        title: "Salvo!",
        description:
          failed > 0
            ? `Credenciais atualizadas, mas ${failed} canal(is) falharam no rewire do webhook.`
            : "Credenciais da Evolution atualizadas.",
        ...(failed > 0 ? { variant: "destructive" as const } : {}),
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setSaving(false)
    }
  }

  const canSave = !saving && (apiKey.trim().length > 0 || webhookSecret.trim().length > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp QR (Evolution)"
        description="Credenciais do servidor Evolution API (WhatsApp não-oficial via QR). Config global — vale para todos os canais."
      />

      {loading ? (
        <div className="space-y-4 max-w-3xl">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="max-w-3xl space-y-5">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <QrCode className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-sm font-semibold">Estado atual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatusLine
                label="URL do servidor"
                ok={meta?.base_url_configured ?? false}
                detail={meta?.base_url_configured ? "configurada (env EVOLUTION_API_URL)" : "env EVOLUTION_API_URL ausente"}
              />
              <StatusLine
                label="API key"
                ok={meta?.api_key.configured ?? false}
                detail={
                  meta?.api_key.configured
                    ? [meta.api_key.last4, sourceLabel(meta.api_key.source)].filter(Boolean).join(" · ")
                    : "não configurada"
                }
              />
              <StatusLine
                label="Webhook secret"
                ok={meta?.webhook_secret.configured ?? false}
                detail={meta?.webhook_secret.configured ? sourceLabel(meta.webhook_secret.source) : "não configurado"}
              />
              {meta?.updated_at && (
                <p className="text-xs text-slate-400 pt-1">
                  Atualizado em {new Date(meta.updated_at).toLocaleString("pt-BR")}
                  {meta.updated_by_name ? ` por ${meta.updated_by_name}` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Atualizar credenciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="API key global" htmlFor="evolution-api-key">
                <Input
                  id="evolution-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="novo valor (write-only)"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Validada contra o servidor Evolution antes de salvar.
                </p>
              </FormField>
              <FormField label="Webhook secret" htmlFor="evolution-webhook-secret">
                <Input
                  id="evolution-webhook-secret"
                  type="password"
                  autoComplete="off"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="novo valor (write-only)"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Mínimo 16 caracteres (letras, números, hífen e underscore). Ao trocar, os webhooks dos canais ativos
                  são re-apontados e o secret anterior vale por 24h.
                </p>
              </FormField>

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={!canSave}>
                  {saving ? "Testando e salvando..." : "Testar e salvar"}
                </Button>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Os valores nunca são exibidos depois de salvos. A URL do servidor é fixa (env EVOLUTION_API_URL).
                </p>
              </div>
            </CardContent>
          </Card>

          {rewire.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Rewire dos webhooks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {rewire.map((r) => (
                  <div key={r.channel_id} className="flex items-center gap-2 text-sm">
                    {r.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{r.instance}</span>
                    {!r.ok && <span className="text-xs text-red-400">{r.error ?? "falha desconhecida"}</span>}
                  </div>
                ))}
                {rewire.some((r) => !r.ok) && (
                  <p className="text-xs text-slate-400 pt-1">
                    Canais com falha continuam apontando pro secret anterior (válido por 24h). Re-tente em seguida:
                    reconecte o canal em Canais ou salve um novo secret.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
