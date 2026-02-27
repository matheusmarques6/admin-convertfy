"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Code2,
  Copy,
  CheckCircle2,
  ShoppingBag,
  AlertCircle,
  Palette,
  Globe,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"

interface TrackingStoreData {
  client_store_id: string
  store_name: string
  platform: string
  shopify_connected: boolean
  tracking_store_id: string | null
  tracking_active: boolean
  widget_config: {
    primaryColor: string
    language: string
    position: string
  } | null
}

const COLORS = [
  { value: "#3b82f6", label: "Azul", bg: "bg-blue-500" },
  { value: "#10b981", label: "Verde", bg: "bg-emerald-500" },
  { value: "#000000", label: "Preto", bg: "bg-black" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
]

export default function PortalTrackingScriptPage() {
  const [stores, setStores] = useState<TrackingStoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [color, setColor] = useState("#3b82f6")
  const [language, setLanguage] = useState("pt-BR")
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/portal/tracking")
      if (!response.ok) throw new Error("Erro ao carregar")
      const data = await response.json()
      const trackingStores = (data.stores || []).filter(
        (s: TrackingStoreData) => s.tracking_active
      )
      setStores(trackingStores)

      // Auto-select first store or from localStorage
      if (trackingStores.length > 0) {
        let savedId: string | null = null
        try { savedId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
        const match = savedId ? trackingStores.find((s: TrackingStoreData) => s.client_store_id === savedId) : null
        const selected = match || trackingStores[0]
        setSelectedStoreId(selected.client_store_id)

        // Load widget config
        if (selected.widget_config) {
          setColor(selected.widget_config.primaryColor || "#3b82f6")
          setLanguage(selected.widget_config.language || "pt-BR")
        }
      }
    } catch {
      setError("Não foi possível carregar as lojas")
    } finally {
      setLoading(false)
    }
  }

  // Generate the dynamic script code
  const scriptCode = useMemo(() => {
    if (!selectedStoreId) return ""

    const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"

    return `<!-- Convertfy Tracking Widget -->
<script>
(function(){
  var s=document.createElement('script');
  s.src='${origin}/api/tracking/script/widget.js';
  s.async=true;
  s.dataset.storeId='${selectedStoreId}';
  s.dataset.color='${color}';
  s.dataset.lang='${language}';
  document.head.appendChild(s);
})();
</script>`
  }, [selectedStoreId, color, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    toast({ title: "Código copiado!" })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveConfig = async () => {
    if (!selectedStoreId) return
    setSaving(true)

    try {
      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_store_id: selectedStoreId,
          widget_config: {
            primaryColor: color,
            language,
            position: "bottom-right",
          },
        }),
      })

      if (!res.ok) throw new Error("Erro ao salvar")
      toast({ title: "Configuração do widget salva!" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configuração" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-64 bg-slate-100 dark:bg-slate-800" />
        </div>
        <Skeleton className="h-80 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={fetchStores} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <div className="max-w-[800px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Script do Widget</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Instale o widget de rastreamento na sua loja
          </p>
        </div>
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento não ativado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Ative o rastreamento em pelo menos uma loja na página de Integrações antes de gerar o script.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Script do Widget</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure e copie o código para instalar o widget na sua loja
        </p>
      </div>

      {/* Store Selector */}
      {stores.length > 1 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-6">
          <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium mb-2 block">Selecionar Loja</Label>
          <Select value={selectedStoreId} onValueChange={(v) => {
            setSelectedStoreId(v)
            const store = stores.find((s) => s.client_store_id === v)
            if (store?.widget_config) {
              setColor(store.widget_config.primaryColor || "#3b82f6")
              setLanguage(store.widget_config.language || "pt-BR")
            }
          }}>
            <SelectTrigger className="w-full h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200">
              <ShoppingBag className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
              {stores.map((store) => (
                <SelectItem key={store.client_store_id} value={store.client_store_id}>
                  {store.store_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customization */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Personalização
            </h3>
          </div>
          <div className="p-6 space-y-5">
            {/* Color Selection */}
            <div className="space-y-2">
              <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Cor do Widget</Label>
              <div className="flex gap-3">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={`w-10 h-10 rounded-lg ${c.bg} transition-all ${
                      color === c.value
                        ? "ring-2 ring-offset-2 ring-primary ring-offset-white dark:ring-offset-[#151922]"
                        : "hover:scale-105"
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                Idioma do Widget
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O idioma afeta apenas o widget, não a interface do portal.
              </p>
            </div>

            <Button
              onClick={handleSaveConfig}
              disabled={saving}
              className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
            >
              Salvar Configuração
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Preview
            </h3>
          </div>
          <div className="p-6">
            <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-lg p-6 flex items-center justify-center min-h-[200px] border border-slate-200/50 dark:border-slate-700/30">
              {/* Mini preview of the widget button */}
              <div className="text-center space-y-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-lg transition-transform hover:scale-105 cursor-pointer"
                  style={{ backgroundColor: color }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {language === "pt-BR" ? "Rastrear Pedido" :
                     language === "en" ? "Track Order" :
                     language === "es" ? "Rastrear Pedido" :
                     language === "de" ? "Bestellung verfolgen" :
                     "Traccia Ordine"}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Widget aparecerá no canto inferior direito
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Script Code */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-cyan-600" />
            Código de Instalação
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-500" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" />
                Copiar
              </>
            )}
          </Button>
        </div>
        <div className="p-6">
          <pre className="bg-slate-900 dark:bg-[#0D1117] rounded-lg p-4 overflow-x-auto text-sm">
            <code className="text-green-400 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
              {scriptCode}
            </code>
          </pre>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-200">Como instalar:</strong>
            </p>
            <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Copie o código acima</li>
              <li>No Shopify, vá em <strong>Online Store &rarr; Themes &rarr; Edit Code</strong></li>
              <li>Abra o arquivo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">theme.liquid</code></li>
              <li>Cole o código antes da tag <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">&lt;/body&gt;</code></li>
              <li>Salve o arquivo</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
