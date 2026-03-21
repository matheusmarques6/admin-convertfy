"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/lib/hooks/use-toast"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Store,
  Palette,
  Send,
  Upload,
  X,
  FileText,
  ImageIcon,
  ArrowLeft,
  RefreshCw,
} from "lucide-react"

const PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "tray", label: "Tray" },
  { value: "vtex", label: "VTEX" },
  { value: "other", label: "Outra" },
]

const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "US", label: "Estados Unidos" },
  { value: "PT", label: "Portugal" },
  { value: "ES", label: "Espanha" },
  { value: "MX", label: "México" },
  { value: "AR", label: "Argentina" },
  { value: "CO", label: "Colômbia" },
  { value: "CL", label: "Chile" },
  { value: "DE", label: "Alemanha" },
  { value: "FR", label: "França" },
  { value: "IT", label: "Itália" },
  { value: "UK", label: "Reino Unido" },
  { value: "CA", label: "Canadá" },
  { value: "AU", label: "Austrália" },
  { value: "JP", label: "Japão" },
  { value: "OTHER", label: "Outro" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "other", label: "Outro" },
]

const STEPS = [
  { id: 1, title: "Dados da Loja", icon: Store },
  { id: 2, title: "Identidade Visual", icon: Palette },
  { id: 3, title: "Revisão e Envio", icon: Send },
]

interface ExistingStore {
  id: string
  store_name: string
}

interface UploadedFile {
  path: string
  fileName: string
}

export default function PortalNewStorePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingStores, setExistingStores] = useState<ExistingStore[]>([])
  const [formMode, setFormMode] = useState<"new" | "replace">("new")

  // File upload state
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFile>>({})
  const logoInputRef = useRef<HTMLInputElement>(null)
  const designInputRef = useRef<HTMLInputElement>(null)
  const brandInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    replace_store_id: "",
    store_name: "",
    store_url: "",
    platform: "" as string,
    niche: "",
    country: "BR",
    language: "pt-BR",
    target_audience: "",
    free_shipping_type: "" as string,
    shopify_collaborator_code: "",
    price_sensitivity: "" as string,
    additional_notes: "",
    logo_url: "",
    design_direction_text: "",
    design_direction_file_url: "",
    brand_manual_url: "",
  })

  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch("/api/portal/stores")
        if (res.ok) {
          const data = await res.json()
          setExistingStores(
            (data.stores || []).map((s: { id: string; store_name: string }) => ({
              id: s.id,
              store_name: s.store_name,
            }))
          )
        }
      } catch {
        // Non-blocking
      }
    }
    loadStores()
  }, [])

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileUpload = async (file: File, fileType: "logo" | "design" | "brand_manual") => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    const allowedExts = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".pdf"]
    if (!allowedExts.includes(ext)) {
      toast({ title: "Tipo não permitido", description: `Use: ${allowedExts.join(", ")}`, variant: "destructive" })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo: 10MB", variant: "destructive" })
      return
    }

    setUploadingField(fileType)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("file_type", fileType)

      const res = await fetch("/api/cliente/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro no upload")

      const fieldMap: Record<string, string> = {
        logo: "logo_url",
        design: "design_direction_file_url",
        brand_manual: "brand_manual_url",
      }

      updateField(fieldMap[fileType], data.path)
      setUploadedFiles((prev) => ({ ...prev, [fileType]: { path: data.path, fileName: data.fileName } }))
      toast({ title: "Arquivo enviado", description: file.name })
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      })
    } finally {
      setUploadingField(null)
    }
  }

  const removeFile = (fileType: "logo" | "design" | "brand_manual") => {
    const fieldMap: Record<string, string> = {
      logo: "logo_url",
      design: "design_direction_file_url",
      brand_manual: "brand_manual_url",
    }
    updateField(fieldMap[fileType], "")
    setUploadedFiles((prev) => {
      const next = { ...prev }
      delete next[fileType]
      return next
    })
  }

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (formMode === "replace" && !formData.replace_store_id) return "Selecione a loja para substituir"
        if (!formData.store_name.trim()) return "Nome da loja é obrigatório"
        if (!formData.store_url.trim()) return "URL da loja é obrigatória"
        if (!formData.platform) return "Plataforma é obrigatória"
        if (!formData.country) return "País é obrigatório"
        if (!formData.language) return "Idioma é obrigatório"
        return null
      case 2:
        return null
      default:
        return null
    }
  }

  const nextStep = () => {
    const error = validateStep(currentStep)
    if (error) {
      toast({ title: "Atenção", description: error, variant: "destructive" })
      return
    }
    setCurrentStep((prev) => Math.min(prev + 1, 3))
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        replace_store_id: formMode === "replace" ? formData.replace_store_id : undefined,
        store_name: formData.store_name,
        store_url: formData.store_url,
        platform: formData.platform,
        niche: formData.niche || null,
        country: formData.country,
        language: formData.language,
        target_audience: formData.target_audience || null,
        free_shipping_type: formData.free_shipping_type || null,
        shopify_collaborator_code: formData.shopify_collaborator_code || null,
        price_sensitivity: formData.price_sensitivity || null,
        additional_notes: formData.additional_notes || null,
        logo_url: formData.logo_url || null,
        design_direction_text: formData.design_direction_text || null,
        design_direction_file_url: formData.design_direction_file_url || null,
        brand_manual_url: formData.brand_manual_url || null,
      }

      const response = await fetch("/api/portal/stores/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao enviar")

      setSubmitted(true)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao enviar",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 max-w-md mx-auto text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Loja Enviada!</CardTitle>
            <CardDescription className="text-base mt-2">
              Sua loja foi enviada para aprovação. Você será notificado quando o onboarding começar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => router.push("/client/onboarding")} className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm">
              Ver Onboarding
            </Button>
            <Button variant="secondary" onClick={() => router.push("/client/stores")} className="w-full border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              Voltar para Lojas
            </Button>
          </CardContent>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/client/stores")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Nova Loja</h1>
          <p className="text-slate-500 dark:text-slate-400">Cadastre uma nova loja ou substitua uma existente</p>
        </div>
      </div>

      {/* Mode Selection */}
      {existingStores.length > 0 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Button
                variant={formMode === "new" ? "primary" : "secondary"}
                onClick={() => { setFormMode("new"); updateField("replace_store_id", "") }}
                className="flex-1"
              >
                <Store className="h-4 w-4 mr-2" />
                Nova loja
              </Button>
              <Button
                variant={formMode === "replace" ? "primary" : "secondary"}
                onClick={() => setFormMode("replace")}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Substituir existente
              </Button>
            </div>
            {formMode === "replace" && (
              <div className="mt-4 space-y-2">
                <Label>Selecione a loja para substituir</Label>
                <Select value={formData.replace_store_id} onValueChange={(v) => updateField("replace_store_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma loja" /></SelectTrigger>
                  <SelectContent>
                    {existingStores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.store_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => { if (isCompleted) setCurrentStep(step.id) }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full justify-center
                  ${isActive ? "bg-primary text-white shadow-sm" : ""}
                  ${isCompleted ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-500/20" : ""}
                  ${!isActive && !isCompleted ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" : ""}
                `}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={`h-px w-4 mx-1 ${isCompleted ? "bg-emerald-300" : "bg-slate-200 dark:bg-slate-700"}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40">
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Store Data */}
          {currentStep === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="store_name">Nome da loja *</Label>
                  <Input id="store_name" value={formData.store_name} onChange={(e) => updateField("store_name", e.target.value)} placeholder="Minha Loja" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store_url">URL da loja *</Label>
                  <Input id="store_url" value={formData.store_url} onChange={(e) => updateField("store_url", e.target.value)} placeholder="https://minhaloja.com.br" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plataforma *</Label>
                  <Select value={formData.platform} onValueChange={(v) => updateField("platform", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="niche">Nicho</Label>
                  <Input id="niche" value={formData.niche} onChange={(e) => updateField("niche", e.target.value)} placeholder="Ex: Moda, Beleza, Tech..." />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>País *</Label>
                  <Select value={formData.country} onValueChange={(v) => updateField("country", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o país" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Idioma *</Label>
                  <Select value={formData.language} onValueChange={(v) => updateField("language", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o idioma" /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_audience">Público-alvo</Label>
                <Textarea id="target_audience" value={formData.target_audience} onChange={(e) => updateField("target_audience", e.target.value)} placeholder="Descreva seu público-alvo..." rows={3} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de frete grátis</Label>
                  <Select value={formData.free_shipping_type} onValueChange={(v) => updateField("free_shipping_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Frete grátis total</SelectItem>
                      <SelectItem value="conditional">Frete grátis condicional</SelectItem>
                      <SelectItem value="none">Sem frete grátis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.platform === "shopify" && (
                  <div className="space-y-2">
                    <Label htmlFor="shopify_code">Código de colaborador Shopify</Label>
                    <Input id="shopify_code" value={formData.shopify_collaborator_code} onChange={(e) => updateField("shopify_collaborator_code", e.target.value)} placeholder="Código do colaborador" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 2: Visual Identity */}
          {currentStep === 2 && (
            <>
              <div className="space-y-2">
                <Label>Sensibilidade de preço</Label>
                <RadioGroup value={formData.price_sensitivity} onValueChange={(v) => updateField("price_sensitivity", v)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="price" id="price" />
                    <Label htmlFor="price">Preço</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="balanced" id="balanced" />
                    <Label htmlFor="balanced">Equilibrado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="quality" id="quality" />
                    <Label htmlFor="quality">Qualidade</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo da marca</Label>
                {uploadedFiles.logo ? (
                  <div className="flex items-center gap-3 rounded-lg border dark:border-slate-700/40 p-3 bg-emerald-50 dark:bg-emerald-500/10">
                    <ImageIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">{uploadedFiles.logo.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("logo")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed dark:border-slate-700/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors" onClick={() => logoInputRef.current?.click()}>
                    {uploadingField === "logo" ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-slate-400 dark:text-slate-500" />}
                    <span className="text-sm text-slate-500 dark:text-slate-400">Clique para enviar o logo</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">PNG, JPG, SVG, WebP (máx. 10MB)</span>
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, "logo"); e.target.value = "" }} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="design_direction">Direção de design</Label>
                <Textarea id="design_direction" value={formData.design_direction_text} onChange={(e) => updateField("design_direction_text", e.target.value)} placeholder="Descreva o estilo visual desejado, cores, referências..." rows={3} />
              </div>

              {/* Design Reference Upload */}
              <div className="space-y-2">
                <Label>Arquivo de referência visual</Label>
                {uploadedFiles.design ? (
                  <div className="flex items-center gap-3 rounded-lg border dark:border-slate-700/40 p-3 bg-emerald-50 dark:bg-emerald-500/10">
                    <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">{uploadedFiles.design.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("design")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed dark:border-slate-700/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors" onClick={() => designInputRef.current?.click()}>
                    {uploadingField === "design" ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-slate-400 dark:text-slate-500" />}
                    <span className="text-sm text-slate-500 dark:text-slate-400">Clique para enviar referência visual</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">PNG, JPG, SVG, WebP, PDF (máx. 10MB)</span>
                  </div>
                )}
                <input ref={designInputRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, "design"); e.target.value = "" }} />
              </div>

              {/* Brand Manual Upload */}
              <div className="space-y-2">
                <Label>Manual da marca</Label>
                {uploadedFiles.brand_manual ? (
                  <div className="flex items-center gap-3 rounded-lg border dark:border-slate-700/40 p-3 bg-emerald-50 dark:bg-emerald-500/10">
                    <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">{uploadedFiles.brand_manual.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("brand_manual")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed dark:border-slate-700/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors" onClick={() => brandInputRef.current?.click()}>
                    {uploadingField === "brand_manual" ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-slate-400 dark:text-slate-500" />}
                    <span className="text-sm text-slate-500 dark:text-slate-400">Clique para enviar o manual da marca</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">PDF, PNG, JPG (máx. 10MB)</span>
                  </div>
                )}
                <input ref={brandInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, "brand_manual"); e.target.value = "" }} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações adicionais</Label>
                <Textarea id="notes" value={formData.additional_notes} onChange={(e) => updateField("additional_notes", e.target.value)} placeholder="Algo mais que devemos saber?" rows={3} />
              </div>
            </>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {formMode === "replace" && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-400">
                  Substituindo: {existingStores.find(s => s.id === formData.replace_store_id)?.store_name}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2">Dados da Loja</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Loja:</span><span>{formData.store_name}</span>
                  <span className="text-slate-500 dark:text-slate-400">URL:</span><span className="truncate">{formData.store_url}</span>
                  <span className="text-slate-500 dark:text-slate-400">Plataforma:</span><span>{PLATFORMS.find(p => p.value === formData.platform)?.label}</span>
                  <span className="text-slate-500 dark:text-slate-400">País:</span><span>{COUNTRIES.find(c => c.value === formData.country)?.label}</span>
                  <span className="text-slate-500 dark:text-slate-400">Idioma:</span><span>{LANGUAGES.find(l => l.value === formData.language)?.label}</span>
                  {formData.niche && <><span className="text-slate-500 dark:text-slate-400">Nicho:</span><span>{formData.niche}</span></>}
                  {formData.target_audience && <><span className="text-slate-500 dark:text-slate-400">Público-alvo:</span><span className="truncate">{formData.target_audience}</span></>}
                </div>
              </div>
              {(formData.price_sensitivity || formData.design_direction_text || uploadedFiles.logo || uploadedFiles.design || uploadedFiles.brand_manual) && (
                <div className="border-t dark:border-slate-700/40 pt-4">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2">Identidade Visual</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {formData.price_sensitivity && <><span className="text-slate-500 dark:text-slate-400">Foco:</span><span>{formData.price_sensitivity === "price" ? "Preço" : formData.price_sensitivity === "quality" ? "Qualidade" : "Equilibrado"}</span></>}
                    {uploadedFiles.logo && <><span className="text-slate-500 dark:text-slate-400">Logo:</span><span className="text-emerald-600 dark:text-emerald-400 truncate">{uploadedFiles.logo.fileName}</span></>}
                    {formData.design_direction_text && <><span className="text-slate-500 dark:text-slate-400">Direção:</span><span className="truncate">{formData.design_direction_text}</span></>}
                    {uploadedFiles.design && <><span className="text-slate-500 dark:text-slate-400">Referência:</span><span className="text-emerald-600 dark:text-emerald-400 truncate">{uploadedFiles.design.fileName}</span></>}
                    {uploadedFiles.brand_manual && <><span className="text-slate-500 dark:text-slate-400">Manual:</span><span className="text-emerald-600 dark:text-emerald-400 truncate">{uploadedFiles.brand_manual.fileName}</span></>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t dark:border-slate-700/40">
            <Button variant="secondary" onClick={prevStep} disabled={currentStep === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>

            {currentStep < 3 ? (
              <Button onClick={nextStep}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar para Aprovação
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </div>
  )
}
