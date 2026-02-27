"use client"

import { useState, useEffect } from "react"
import {
  Code,
  Copy,
  Check,
  Eye,
  Settings,
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
  const [copied, setCopied] = useState(false)
  const [config, setConfig] = useState({
    primaryColor: "#05AFF2",
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

  const scriptCode = `<script src="${DOMAIN}/api/script/widget.js?store=${selectedStore}" async></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

                <div className="space-y-2">
                  <Label>Copie e cole no HTML da sua loja</Label>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 pr-12 text-sm font-mono overflow-x-auto">
                      {scriptCode}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={handleCopy}
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
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

        {/* Preview */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Preview do Widget</h2>
            </div>

            <div className="relative bg-slate-50 dark:bg-[#0d1117] rounded-xl border border-slate-200 dark:border-slate-700/40 min-h-[300px] flex items-end justify-end p-6">
              {/* Simulated widget button */}
              <div className="flex flex-col items-end gap-3">
                {/* Preview of the modal */}
                <div className="bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl w-[320px] border border-slate-200 dark:border-slate-700/40 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700/40 flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Rastrear Pedido</h3>
                    <button className="text-slate-400 text-lg">&times;</button>
                  </div>
                  <div className="p-4">
                    <div className="flex gap-2 mb-4">
                      <input
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        placeholder="Código de rastreio, nº pedido ou email"
                        readOnly
                      />
                      <button className="px-3 py-2 text-xs font-semibold rounded-lg text-white" style={{ background: config.primaryColor }}>
                        Buscar
                      </button>
                    </div>
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Digite para buscar seu pedido
                      </p>
                    </div>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700/40 text-center">
                    <span className="text-[10px] text-slate-400">Powered by Convertfy</span>
                  </div>
                </div>

                {/* Floating button */}
                <button
                  className="flex items-center gap-2 px-5 py-3 rounded-full text-white text-sm font-semibold shadow-lg"
                  style={{ background: config.primaryColor }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  Rastrear Pedido
                </button>
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
                <Label>Posição</Label>
                <Select value={config.position} onValueChange={(v) => setConfig({ ...config, position: v })}>
                  <SelectTrigger className="bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Inferior Direito</SelectItem>
                    <SelectItem value="bottom-left">Inferior Esquerdo</SelectItem>
                    <SelectItem value="inline">Inline (embed)</SelectItem>
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
                <span>Acesse o <strong className="text-slate-800 dark:text-slate-200">Shopify Admin</strong> da sua loja</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <span>Vá em <strong className="text-slate-800 dark:text-slate-200">Online Store → Themes → Edit code</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
                <span>Abra o arquivo <strong className="text-slate-800 dark:text-slate-200">theme.liquid</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">4</span>
                <span>Cole o snippet <strong className="text-slate-800 dark:text-slate-200">antes da tag {`</body>`}</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">5</span>
                <span>Salve e pronto! O widget aparecerá na sua loja</span>
              </li>
            </ol>
          </div>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
