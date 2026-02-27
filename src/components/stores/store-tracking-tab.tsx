"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Loader2,
  Power,
  PowerOff,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Package,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/lib/hooks/use-toast"

interface TrackingConfig {
  enabled: boolean
  seventeen_track_api_key: string
  widget_config: {
    primary_color: string
    logo_url: string | null
    custom_css: string | null
    show_carrier_logo: boolean
    language: string
    placeholder_tracking: string
    placeholder_email: string
  }
}

interface TrackingStats {
  cached_orders: number
  last_sync: string | null
}

interface StoreTrackingTabProps {
  storeId: string
}

export function StoreTrackingTab({ storeId }: StoreTrackingTabProps) {
  const [config, setConfig] = useState<TrackingConfig | null>(null)
  const [stats, setStats] = useState<TrackingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const { toast } = useToast()

  // Form state
  const [enabled, setEnabled] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#000000")
  const [logoUrl, setLogoUrl] = useState("")
  const [placeholderTracking, setPlaceholderTracking] = useState("Digite seu código de rastreio")
  const [placeholderEmail, setPlaceholderEmail] = useState("Digite seu email")

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/stores/${storeId}/tracking-config`)
      if (res.ok) {
        const data = await res.json()
        const cfg = data.config as TrackingConfig | null
        const st = data.stats as TrackingStats | null

        if (cfg) {
          setConfig(cfg)
          setEnabled(cfg.enabled)
          setApiKey(cfg.seventeen_track_api_key ? "••••••••" : "")
          setPrimaryColor(cfg.widget_config?.primary_color || "#000000")
          setLogoUrl(cfg.widget_config?.logo_url || "")
          setPlaceholderTracking(cfg.widget_config?.placeholder_tracking || "Digite seu código de rastreio")
          setPlaceholderEmail(cfg.widget_config?.placeholder_email || "Digite seu email")
        }
        if (st) setStats(st)
      }
    } catch {
      toast({ title: "Erro ao carregar configuração de rastreio", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  async function handleSave() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        enabled,
        widget_config: {
          primary_color: primaryColor,
          logo_url: logoUrl || null,
          custom_css: config?.widget_config?.custom_css || null,
          show_carrier_logo: true,
          language: "pt-BR",
          placeholder_tracking: placeholderTracking,
          placeholder_email: placeholderEmail,
        },
      }

      // Only send API key if changed (not the masked value)
      if (apiKey && apiKey !== "••••••••") {
        body.seventeen_track_api_key = apiKey
      }

      const res = await fetch(`/api/stores/${storeId}/tracking-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }

      toast({ title: "Configuração salva com sucesso" })
      fetchConfig()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro ao salvar configuração", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/tracking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao sincronizar")
      }

      const data = await res.json()
      toast({ title: `Sincronização concluída: ${data.data?.synced || 0} pedidos` })
      fetchConfig()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro ao sincronizar pedidos", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  function handleCopySnippet() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.convertfy.com.br"
    const snippet = `<div id="convertfy-tracking"></div>\n<script src="${origin}/api/tracking/widget.js"></script>`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    toast({ title: "Snippet copiado!" })
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.convertfy.com.br"

  return (
    <div className="space-y-6">
      {/* Header com toggle */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Rastreio de Pedidos
              </CardTitle>
              <CardDescription className="mt-1">
                Configure o widget de rastreio para os clientes desta loja
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {enabled ? (
                <Badge variant="default" className="gap-1">
                  <Power className="h-3 w-3" /> Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <PowerOff className="h-3 w-3" /> Inativo
                </Badge>
              )}
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Config */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Configuração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key 17Track</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole sua API key da 17Track"
              />
              <p className="text-xs text-muted-foreground">
                Obtida em 17track.net/en/api. Será armazenada de forma encriptada.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="primary-color">Cor principal do widget</Label>
              <div className="flex gap-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1"
                  maxLength={7}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo-url">URL do logo (opcional)</Label>
              <Input
                id="logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://sualojacom.br/logo.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ph-tracking">Placeholder — Código</Label>
              <Input
                id="ph-tracking"
                value={placeholderTracking}
                onChange={(e) => setPlaceholderTracking(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ph-email">Placeholder — Email</Label>
              <Input
                id="ph-email"
                value={placeholderEmail}
                onChange={(e) => setPlaceholderEmail(e.target.value)}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Configuração
            </Button>
          </CardContent>
        </Card>

        {/* Snippet + Stats */}
        <div className="space-y-6">
          {/* Snippet */}
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Código para instalar na loja</CardTitle>
              <CardDescription>
                Cole este snippet na página de rastreio do site do cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
{`<div id="convertfy-tracking"></div>
<script src="${origin}/api/tracking/widget.js"></script>`}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={handleCopySnippet}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <Card className="rounded-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Estatísticas</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing || !enabled}
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar agora
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{stats?.cached_orders ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Pedidos no cache</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">
                    {stats?.last_sync
                      ? new Date(stats.last_sync).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Último sync</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview toggle */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {showPreview ? "Esconder preview" : "Mostrar preview do widget"}
          </Button>

          {showPreview && (
            <Card className="rounded-xl overflow-hidden">
              <CardContent className="p-0">
                <iframe
                  srcDoc={`<!DOCTYPE html><html><body style="margin:0;padding:16px;font-family:sans-serif;"><div id="convertfy-tracking"></div><script src="${origin}/api/tracking/widget.js" data-store-id="${storeId}"></script></body></html>`}
                  className="w-full border-0"
                  style={{ height: 400 }}
                  title="Widget Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
