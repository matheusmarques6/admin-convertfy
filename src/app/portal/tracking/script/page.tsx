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
  Loader2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
  } | null
}

const PRESET_COLORS = [
  { value: "#3b82f6", label: "Azul", ring: "ring-blue-400" },
  { value: "#0ea5e9", label: "Celeste", ring: "ring-sky-400" },
  { value: "#10b981", label: "Verde", ring: "ring-emerald-400" },
  { value: "#8b5cf6", label: "Roxo", ring: "ring-violet-400" },
  { value: "#f59e0b", label: "Amarelo", ring: "ring-amber-400" },
  { value: "#ef4444", label: "Vermelho", ring: "ring-red-400" },
  { value: "#ec4899", label: "Rosa", ring: "ring-pink-400" },
  { value: "#000000", label: "Preto", ring: "ring-gray-500" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Portugues (BR)", flag: "BR" },
  { value: "en", label: "English", flag: "US" },
  { value: "es", label: "Espanol", flag: "ES" },
  { value: "fr", label: "Francais", flag: "FR" },
  { value: "de", label: "Deutsch", flag: "DE" },
  { value: "it", label: "Italiano", flag: "IT" },
]

export default function PortalTrackingScriptPage() {
  const [stores, setStores] = useState<TrackingStoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [color, setColor] = useState("#3b82f6")
  const [customColor, setCustomColor] = useState("")
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

      if (trackingStores.length > 0) {
        let savedId: string | null = null
        try { savedId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
        const match = savedId ? trackingStores.find((s: TrackingStoreData) => s.client_store_id === savedId) : null
        const selected = match || trackingStores[0]
        setSelectedStoreId(selected.client_store_id)

        if (selected.widget_config) {
          const savedColor = selected.widget_config.primaryColor || "#3b82f6"
          setColor(savedColor)
          if (!PRESET_COLORS.some(c => c.value === savedColor)) {
            setCustomColor(savedColor)
          }
          setLanguage(selected.widget_config.language || "pt-BR")
        }
      }
    } catch {
      setError("Nao foi possivel carregar as lojas")
    } finally {
      setLoading(false)
    }
  }

  const activeColor = customColor || color

  const scriptCode = useMemo(() => {
    if (!selectedStoreId) return ""

    const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"

    return `<!-- Convertfy - Rastreamento de Pedidos -->
<div id="convertfy-tracking"></div>
<script>
(function(){
  var s=document.createElement('script');
  s.src='${origin}/api/tracking/script/widget.js';
  s.async=true;
  s.dataset.storeId='${selectedStoreId}';
  s.dataset.color='${activeColor}';
  s.dataset.lang='${language}';
  s.dataset.container='convertfy-tracking';
  document.head.appendChild(s);
})();
</script>`
  }, [selectedStoreId, activeColor, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    toast({ title: "Codigo copiado!" })
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
            primaryColor: activeColor,
            language,
          },
        }),
      })

      if (!res.ok) throw new Error("Erro ao salvar")
      toast({ title: "Configuracao salva com sucesso!" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configuracao" })
    } finally {
      setSaving(false)
    }
  }

  const selectedLang = LANGUAGES.find(l => l.value === language)

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div>
            <Skeleton className="h-7 w-56 bg-slate-200 dark:bg-slate-700 mb-2" />
            <Skeleton className="h-4 w-80 bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="lg:col-span-2 h-[400px] bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          <Skeleton className="lg:col-span-3 h-[400px] bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
        </div>
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
      <div className="max-w-[600px] mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <Link href="/portal/tracking"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Script de Rastreamento</h1>
        </div>
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento nao ativado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Ative o rastreamento em pelo menos uma loja na pagina de Integracoes para gerar o script.
          </p>
          <Button asChild className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            <Link href="/portal/integrations">Ir para Integracoes</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <Link href="/portal/tracking"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Script de Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Configure e instale a pagina de rastreamento na sua loja
          </p>
        </div>
      </div>

      {/* Store Selector */}
      {stores.length > 1 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5">
          <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium mb-2 block">Selecionar Loja</Label>
          <Select value={selectedStoreId} onValueChange={(v) => {
            setSelectedStoreId(v)
            const store = stores.find((s) => s.client_store_id === v)
            if (store?.widget_config) {
              const savedColor = store.widget_config.primaryColor || "#3b82f6"
              setColor(savedColor)
              if (!PRESET_COLORS.some(c => c.value === savedColor)) {
                setCustomColor(savedColor)
              } else {
                setCustomColor("")
              }
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

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Settings Panel */}
        <div className="lg:col-span-2 space-y-5">
          {/* Colors */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Cor do Script
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-2.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => { setColor(c.value); setCustomColor("") }}
                    className={`group flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg transition-all ${
                      activeColor === c.value && !customColor
                        ? "bg-slate-50 dark:bg-white/[0.06]"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                    title={c.label}
                  >
                    <div
                      className={`w-8 h-8 rounded-full transition-all shadow-sm ${
                        activeColor === c.value && !customColor
                          ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#151922] " + c.ring + " scale-110"
                          : "group-hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{c.label}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500 dark:text-slate-400">Cor personalizada</Label>
                <div className="flex gap-2 items-center">
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700/40 flex-shrink-0 cursor-pointer relative overflow-hidden"
                    style={{ backgroundColor: activeColor }}
                  >
                    <input
                      type="color"
                      value={activeColor}
                      onChange={(e) => { setCustomColor(e.target.value); setColor(e.target.value) }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                  <Input
                    placeholder="#3b82f6"
                    value={customColor}
                    onChange={(e) => {
                      const v = e.target.value
                      setCustomColor(v)
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v)
                    }}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Idioma
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      language === lang.value
                        ? "bg-primary/5 dark:bg-primary/10 border border-primary/20"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    <span className="text-sm font-medium w-7 text-center text-slate-500 dark:text-slate-400">{lang.flag}</span>
                    <span className={`text-sm ${language === lang.value ? "text-primary font-medium" : "text-slate-700 dark:text-slate-200"}`}>
                      {lang.label}
                    </span>
                    {language === lang.value && (
                      <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Save */}
          <Button
            onClick={handleSaveConfig}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm h-11"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configuracao
          </Button>
        </div>

        {/* Right: Code + Preview */}
        <div className="lg:col-span-3 space-y-5">
          {/* Script Code */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-cyan-600" />
                Codigo de Instalacao
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
            <div className="p-5">
              <pre className="bg-slate-900 dark:bg-[#0D1117] rounded-lg p-4 overflow-x-auto text-sm">
                <code className="text-green-400 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                  {scriptCode}
                </code>
              </pre>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                Como instalar
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-3">
                {[
                  { step: 1, text: "Copie o codigo acima clicando em \"Copiar\"" },
                  { step: 2, text: "No Shopify, va em Online Store > Pages > Add page" },
                  { step: 3, text: "Crie uma pagina chamada \"Rastreamento\" ou \"Rastrear Pedido\"" },
                  { step: 4, text: "No editor, clique em \"Show HTML\" (<>) e cole o codigo" },
                  { step: 5, text: "Salve a pagina e adicione-a ao menu da sua loja" },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[11px] font-bold text-primary">{step}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-500/5 rounded-lg border border-blue-100 dark:border-blue-500/10 p-4">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <strong>Dica:</strong> O script renderiza automaticamente o formulario de rastreamento dentro da pagina.
                  Os clientes poderao consultar o codigo de rastreio diretamente na sua loja.
                </p>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                Preview
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {selectedLang?.label || "Portugues"}
              </span>
            </div>
            <div className="p-5">
              <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-lg border border-slate-200/50 dark:border-slate-700/30 p-6">
                {/* Mini preview of the tracking page */}
                <div className="max-w-[360px] mx-auto">
                  {/* Search icon */}
                  <div
                    className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: activeColor + "14" }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="1.8">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  {/* Title */}
                  <h4 className="text-center text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                    {language === "pt-BR" ? "Rastreie seu pedido" :
                     language === "en" ? "Track your order" :
                     language === "es" ? "Rastrea tu pedido" :
                     language === "fr" ? "Suivez votre commande" :
                     language === "de" ? "Verfolgen Sie Ihre Bestellung" :
                     "Traccia il tuo ordine"}
                  </h4>
                  <p className="text-center text-xs text-slate-400 dark:text-slate-500 mb-4">
                    {language === "pt-BR" ? "Insira o codigo de rastreamento" :
                     language === "en" ? "Enter the tracking code" :
                     language === "es" ? "Ingresa el codigo de seguimiento" :
                     language === "fr" ? "Entrez le code de suivi" :
                     language === "de" ? "Geben Sie die Sendungsnummer ein" :
                     "Inserisci il codice di tracciamento"}
                  </p>
                  {/* Mock input */}
                  <div className="flex gap-2">
                    <div className="flex-1 h-10 bg-white dark:bg-[#151922] border border-slate-200 dark:border-slate-600/40 rounded-lg" />
                    <div
                      className="h-10 px-4 rounded-lg flex items-center"
                      style={{ backgroundColor: activeColor }}
                    >
                      <span className="text-white text-xs font-semibold">
                        {language === "pt-BR" ? "Rastrear" :
                         language === "en" ? "Track" :
                         language === "es" ? "Rastrear" :
                         language === "fr" ? "Suivre" :
                         language === "de" ? "Verfolgen" :
                         "Traccia"}
                      </span>
                    </div>
                  </div>
                  {/* Powered by */}
                  <p className="text-center text-[10px] text-slate-300 dark:text-slate-600 mt-4">Powered by Convertfy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
