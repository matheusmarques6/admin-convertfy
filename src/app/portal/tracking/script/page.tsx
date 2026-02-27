"use client"

import { useState, useEffect } from "react"
import {
  Code,
  Copy,
  Check,
  Eye,
  Settings,
  Layout,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"

const DOMAIN = process.env.NEXT_PUBLIC_TRACKING_DOMAIN || process.env.NEXT_PUBLIC_APP_URL || ""

interface TrackingStore {
  id: string
  shop_domain: string
  shop_name: string | null
}

export default function PortalTrackingScriptPage() {
  const [stores, setStores] = useState<TrackingStore[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const [config, setConfig] = useState({
    primaryColor: "#6366F1",
    position: "bottom-right",
    language: "pt",
  })

  useEffect(() => {
    fetch("/api/portal/tracking/stores")
      .then((r) => r.json())
      .then((data) => {
        const storesList = (data.stores || []).filter((s: TrackingStore & { is_active: boolean }) => s.is_active)
        setStores(storesList)
        if (storesList.length > 0) {
          setSelectedStore((prev) => prev || storesList[0].id)
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scriptTag = `<script src="${DOMAIN}/api/script/widget.js?store=${selectedStore}" async></script>`

  const handleCopy = (snippet: string, label: string) => {
    navigator.clipboard.writeText(snippet)
    setCopiedSnippet(label)
    setTimeout(() => setCopiedSnippet(null), 2000)
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Script Embedável</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Instale o widget de rastreamento na sua loja Shopify
        </p>
      </div>

      <AnimatedContainer className="space-y-6">
        {/* Store Selection + Script */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Snippet do Widget</h2>
            </div>

            {stores.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Selecione a loja</Label>
                  <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="w-full max-w-sm bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40">
                      <SelectValue placeholder="Selecione uma loja" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.shop_name || store.shop_domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Auto mode explanation */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Modo automático
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    O widget detecta automaticamente o modo de exibição pela URL da página:
                  </p>
                  <div className="flex gap-4 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <Layout className="h-3.5 w-3.5 text-primary" />
                      <span><strong className="text-slate-800 dark:text-slate-200">/pages/rastreamento</strong> &rarr; Inline</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <span><strong className="text-slate-800 dark:text-slate-200">Outras páginas</strong> &rarr; Flutuante</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cole no <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">theme.liquid</code> antes de <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">&lt;/body&gt;</code></Label>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 pr-12 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                      {scriptTag}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={() => handleCopy(scriptTag, "script")}
                    >
                      {copiedSnippet === "script" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Conecte uma loja primeiro para gerar o script.
              </p>
            )}
          </div>
        </AnimatedItem>

        {/* Preview - both modes */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Preview do Widget</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Inline preview */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layout className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Modo Inline</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">/pages/rastreamento</span>
                </div>
                <div className="relative bg-slate-50 dark:bg-[#0d1117] rounded-xl border border-slate-200 dark:border-slate-700/40 p-4">
                  <div className="bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700/40 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700/40 flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: config.primaryColor + "15", color: config.primaryColor }}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Rastrear Pedido</h3>
                    </div>
                    <div className="p-4">
                      <div className="flex gap-2 mb-3">
                        <input
                          className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          placeholder="Código de rastreio, nº pedido ou email"
                          readOnly
                        />
                        <button className="px-3 py-2 text-xs font-semibold rounded-lg text-white" style={{ background: config.primaryColor }}>
                          Buscar
                        </button>
                      </div>
                      <div className="text-center py-4">
                        <p className="text-xs text-slate-400 dark:text-slate-500">Digite para buscar seu pedido</p>
                      </div>
                    </div>
                    <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700/40 text-center">
                      <span className="text-[10px] text-slate-400">Powered by Convertfy</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating preview */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Modo Flutuante</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">demais páginas</span>
                </div>
                <div className="relative bg-slate-50 dark:bg-[#0d1117] rounded-xl border border-slate-200 dark:border-slate-700/40 min-h-[250px] flex items-end justify-end p-4">
                  <div className="flex flex-col items-end gap-3">
                    <div className="bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl w-[280px] border border-slate-200 dark:border-slate-700/40 overflow-hidden">
                      <div className="p-3 border-b border-slate-100 dark:border-slate-700/40 flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-slate-800 dark:text-slate-100">Rastrear Pedido</h3>
                        <button className="text-slate-400 text-lg leading-none">&times;</button>
                      </div>
                      <div className="p-3">
                        <div className="flex gap-2 mb-3">
                          <input
                            className="flex-1 px-2 py-1.5 text-[11px] border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            placeholder="Código, nº pedido ou email"
                            readOnly
                          />
                          <button className="px-2 py-1.5 text-[11px] font-semibold rounded-lg text-white" style={{ background: config.primaryColor }}>
                            Buscar
                          </button>
                        </div>
                        <div className="text-center py-3">
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">Digite para buscar</p>
                        </div>
                      </div>
                    </div>

                    <button
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-xs font-semibold shadow-lg"
                      style={{ background: config.primaryColor }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                      Rastrear Pedido
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedItem>

        {/* Configuration */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Configurações</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cor primária</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  />
                  <Input
                    value={config.primaryColor}
                    onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                    className="w-28 bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Posição (modo flutuante)</Label>
                <Select value={config.position} onValueChange={(v) => setConfig({ ...config, position: v })}>
                  <SelectTrigger className="bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Inferior Direito</SelectItem>
                    <SelectItem value="bottom-left">Inferior Esquerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={config.language} onValueChange={(v) => setConfig({ ...config, language: v })}>
                  <SelectTrigger className="bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </AnimatedItem>

        {/* Installation Instructions */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Como instalar na Shopify</h2>

            <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                <span>No Shopify Admin, vá em <strong className="text-slate-800 dark:text-slate-200">Online Store &rarr; Themes &rarr; Edit code</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <span>Abra o arquivo <strong className="text-slate-800 dark:text-slate-200">theme.liquid</strong> e cole o script acima <strong className="text-slate-800 dark:text-slate-200">antes da tag <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">&lt;/body&gt;</code></strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
                <span>Crie uma <strong className="text-slate-800 dark:text-slate-200">página em branco</strong> chamada &quot;Rastreamento&quot; (Online Store &rarr; Pages &rarr; Add page). A URL será automaticamente <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/pages/rastreamento</code></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">4</span>
                <span>Pronto! O widget aparece <strong className="text-slate-800 dark:text-slate-200">inline</strong> na página de rastreamento e como <strong className="text-slate-800 dark:text-slate-200">botão flutuante</strong> em todas as outras páginas</span>
              </li>
            </ol>
          </div>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
