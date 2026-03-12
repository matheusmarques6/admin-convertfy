"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/lib/hooks/use-toast"
import { Check, ChevronLeft, ChevronRight, Loader2, Store, User, Palette, Send, Upload, X, FileText, ImageIcon, Mail, Key, Info } from "lucide-react"
import { PhoneInputIntl, formatPhoneDisplay } from "@/components/ui/phone-input"

// ── Step identity system ──

type StepId = "personal_data" | "store_data" | "collaborator_code" | "visual_identity" | "review"

interface StepDef {
  id: StepId
  title: string
  icon: typeof User
}

const ALL_STEPS: StepDef[] = [
  { id: "personal_data", title: "Dados Pessoais", icon: User },
  { id: "store_data", title: "Dados da Loja", icon: Store },
  { id: "collaborator_code", title: "Codigo Colaborador", icon: Key },
  { id: "visual_identity", title: "Identidade Visual", icon: Palette },
  { id: "review", title: "Revisao e Envio", icon: Send },
]

// ── Constants ──

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
  { value: "MX", label: "Mexico" },
  { value: "AR", label: "Argentina" },
  { value: "CO", label: "Colombia" },
  { value: "CL", label: "Chile" },
  { value: "DE", label: "Alemanha" },
  { value: "FR", label: "Franca" },
  { value: "IT", label: "Italia" },
  { value: "GB", label: "Reino Unido" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "JP", label: "Japao" },
  { value: "OTHER", label: "Outro" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Portugues (Brasil)" },
  { value: "pt-PT", label: "Portugues (Portugal)" },
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
  { value: "fr", label: "Francais" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "other", label: "Outro" },
]

// ── Helpers ──

function RequiredLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor}>
      {children} <span className="text-red-500">*</span>
    </Label>
  )
}

// ── Types ──

interface UploadedFile {
  path: string
  fileName: string
}

// ── Component ──

export default function PublicOnboardingPage() {
  const { toast } = useToast()
  const [currentStepId, setCurrentStepId] = useState<StepId>("personal_data")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // File upload state
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFile>>({})
  const logoInputRef = useRef<HTMLInputElement>(null)
  const designInputRef = useRef<HTMLInputElement>(null)
  const brandInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [formData, setFormData] = useState({
    // Step: personal_data
    name: "",
    email: "",
    phone: "" as string | undefined,
    cpf_cnpj: "",
    // Step: store_data
    store_name: "",
    store_url: "",
    platform: "" as string,
    niche: "",
    country: "BR",
    language: "pt-BR",
    target_audience: "",
    price_sensitivity: "" as string,
    free_shipping_type: "" as string,
    // Step: collaborator_code
    shopify_collaborator_code: "",
    // Step: visual_identity
    additional_notes: "",
    logo_url: "",
    design_direction_text: "",
    design_direction_file_url: "",
    brand_manual_url: "",
    // Honeypot
    website: "",
  })

  // ── Step navigation helpers ──

  function getVisibleSteps(): StepDef[] {
    return ALL_STEPS.filter((s) => {
      if (s.id === "collaborator_code") return formData.platform === "shopify"
      return true
    })
  }

  const visibleSteps = getVisibleSteps()
  const currentStepIndex = visibleSteps.findIndex((s) => s.id === currentStepId)
  const currentStepDef = visibleSteps[currentStepIndex]
  const isLastStep = currentStepIndex === visibleSteps.length - 1

  const updateField = (field: string, value: string | boolean | undefined) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      // Clear collaborator code when switching away from shopify
      if (field === "platform" && value !== "shopify") {
        next.shopify_collaborator_code = ""
        // If currently on collaborator_code step, navigate to store_data
      }
      return next
    })
    // Handle edge case: user changes platform away from shopify while on collaborator step
    if (field === "platform" && value !== "shopify" && currentStepId === "collaborator_code") {
      setCurrentStepId("store_data")
    }
  }

  const handleFileUpload = async (file: File, fileType: "logo" | "design" | "brand_manual") => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    const allowedExts = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".pdf"]
    if (!allowedExts.includes(ext)) {
      toast({ title: "Tipo nao permitido", description: `Use: ${allowedExts.join(", ")}`, variant: "destructive" })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Maximo: 10MB", variant: "destructive" })
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

  const validateStep = (stepId: StepId): string | null => {
    switch (stepId) {
      case "personal_data":
        if (!formData.name.trim()) return "Nome e obrigatorio"
        if (!formData.email.trim()) return "Email e obrigatorio"
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return "Email invalido"
        return null
      case "store_data":
        if (!formData.store_name.trim()) return "Nome da loja e obrigatorio"
        if (!formData.store_url.trim()) return "URL da loja e obrigatoria"
        if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(formData.store_url.trim())) return "URL invalida. Ex: minhaloja.com.br ou https://minhaloja.com.br"
        if (!formData.platform) return "Plataforma e obrigatoria"
        if (!formData.country) return "Pais e obrigatorio"
        if (!formData.language) return "Idioma e obrigatorio"
        return null
      case "collaborator_code":
        return null
      case "visual_identity":
        return null
      case "review":
        return null
      default:
        return null
    }
  }

  const nextStep = () => {
    const error = validateStep(currentStepId)
    if (error) {
      toast({ title: "Atencao", description: error, variant: "destructive" })
      return
    }
    if (currentStepIndex < visibleSteps.length - 1) {
      setCurrentStepId(visibleSteps[currentStepIndex + 1].id)
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepId(visibleSteps[currentStepIndex - 1].id)
    }
  }

  const handleSubmit = async () => {
    if (currentStepId !== "review") return
    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        cpf_cnpj: formData.cpf_cnpj || null,
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
        website: formData.website,
      }

      const response = await fetch("/api/cliente/onboarding-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar formulario")
      }

      setSubmitted(true)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao enviar formulario",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Success screen ──

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Cadastro Enviado!</CardTitle>
            <p className="text-muted-foreground text-base mt-2">
              Seu cadastro foi recebido com sucesso. Enviamos um <strong>link de acesso</strong> para o email <strong>{formData.email}</strong>.
              Clique no link do email para criar sua senha e acessar o portal.
            </p>
            <p className="text-muted-foreground/70 text-sm mt-3">
              Nao recebeu? Verifique sua caixa de spam ou entre em contato com o suporte.
            </p>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // ── Main form ──

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cadastro de Onboarding</h1>
        <p className="text-muted-foreground mt-2">Preencha os dados para iniciar o processo</p>
        <p className="text-muted-foreground/70 text-sm mt-1">
          Ao finalizar o envio, seu onboarding sera iniciado com prazo estimado de 3 a 5 dias uteis.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1 sm:gap-2 mb-8 w-full max-w-2xl">
        {visibleSteps.map((step, index) => {
          const StepIcon = step.icon
          const isActive = currentStepId === step.id
          const isCompleted = currentStepIndex > index

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => {
                  if (isCompleted) setCurrentStepId(step.id)
                }}
                className={`flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-2 text-sm font-medium transition-colors w-full justify-center
                  ${isActive ? "bg-primary text-primary-foreground" : ""}
                  ${isCompleted ? "bg-green-100 text-green-700 cursor-pointer hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50" : ""}
                  ${!isActive && !isCompleted ? "bg-muted text-muted-foreground" : ""}
                `}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <StepIcon className="h-4 w-4 shrink-0" />
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {index < visibleSteps.length - 1 && (
                <div className={`h-px w-2 sm:w-4 mx-0.5 sm:mx-1 shrink-0 ${isCompleted ? "bg-green-300 dark:bg-green-700" : "bg-border"}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Form Card */}
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{currentStepDef?.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step: Personal Data */}
          {currentStepId === "personal_data" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="name">Nome completo</RequiredLabel>
                  <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="email">Email</RequiredLabel>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="seu@email.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <PhoneInputIntl
                    id="phone"
                    defaultCountry="BR"
                    value={formData.phone}
                    onChange={(value) => updateField("phone", value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                  <Input id="cpf_cnpj" value={formData.cpf_cnpj} onChange={(e) => updateField("cpf_cnpj", e.target.value)} placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 mt-4 dark:border-blue-800 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>Voce recebera um link de acesso por email apos o envio do cadastro.</span>
                </div>
              </div>
              {/* Honeypot */}
              <input type="text" name="website" value={formData.website} onChange={(e) => updateField("website", e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            </>
          )}

          {/* Step: Store Data */}
          {currentStepId === "store_data" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="store_name">Nome da loja</RequiredLabel>
                  <Input id="store_name" value={formData.store_name} onChange={(e) => updateField("store_name", e.target.value)} placeholder="Minha Loja" />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="store_url">URL da loja</RequiredLabel>
                  <Input id="store_url" value={formData.store_url} onChange={(e) => updateField("store_url", e.target.value)} placeholder="https://minhaloja.com.br" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel>Plataforma</RequiredLabel>
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
                  <RequiredLabel>Pais</RequiredLabel>
                  <Select value={formData.country} onValueChange={(v) => updateField("country", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o pais" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Idioma</RequiredLabel>
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
                <Label htmlFor="target_audience">Publico-alvo</Label>
                <Textarea id="target_audience" value={formData.target_audience} onChange={(e) => updateField("target_audience", e.target.value)} placeholder="Descreva seu publico-alvo..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Seu publico alvo e mais sensivel a ofertas de preco ou qualidade?</Label>
                <RadioGroup value={formData.price_sensitivity} onValueChange={(v) => updateField("price_sensitivity", v)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="price" id="price" />
                    <Label htmlFor="price">Preco</Label>
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
              <div className="space-y-2">
                <Label>Tipo de frete</Label>
                <Select value={formData.free_shipping_type} onValueChange={(v) => updateField("free_shipping_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Frete gratis total</SelectItem>
                    <SelectItem value="conditional">Frete gratis condicional</SelectItem>
                    <SelectItem value="none">Sem frete gratis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Step: Collaborator Code (Shopify only) */}
          {currentStepId === "collaborator_code" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted p-4 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="font-medium text-foreground">Como obter o codigo de colaborador:</p>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-6">
                  <li>Acesse o painel admin da sua loja Shopify</li>
                  <li>Va em <strong>Configuracoes &gt; Usuarios e permissoes</strong></li>
                  <li>Na secao &quot;Colaboradores&quot;, copie o codigo de acesso</li>
                </ol>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify_code">Codigo de Colaborador</Label>
                <Input
                  id="shopify_code"
                  value={formData.shopify_collaborator_code}
                  onChange={(e) => updateField("shopify_collaborator_code", e.target.value)}
                  placeholder="Cole o codigo aqui"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Este passo e opcional. Voce pode pular e configurar depois.
              </p>
            </div>
          )}

          {/* Step: Visual Identity */}
          {currentStepId === "visual_identity" && (
            <>
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo da marca</Label>
                {uploadedFiles.logo ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50 dark:bg-green-900/20">
                    <ImageIcon className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm text-green-700 dark:text-green-300 flex-1 truncate">{uploadedFiles.logo.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("logo")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 sm:p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => logoInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); logoInputRef.current?.click() } }}
                  >
                    {uploadingField === "logo" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">Clique para enviar o logo</span>
                    <span className="text-xs text-muted-foreground/70">PNG, JPG, SVG, WebP (max. 10MB)</span>
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, "logo")
                    e.target.value = ""
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="design_direction">Direcao de design</Label>
                <Textarea id="design_direction" value={formData.design_direction_text} onChange={(e) => updateField("design_direction_text", e.target.value)} placeholder="Descreva o estilo visual desejado, cores, referencias..." rows={3} />
              </div>

              {/* Design Reference Upload */}
              <div className="space-y-2">
                <Label>Arquivo de referencia visual</Label>
                {uploadedFiles.design ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50 dark:bg-green-900/20">
                    <FileText className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm text-green-700 dark:text-green-300 flex-1 truncate">{uploadedFiles.design.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("design")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 sm:p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => designInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); designInputRef.current?.click() } }}
                  >
                    {uploadingField === "design" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">Clique para enviar referencia visual</span>
                    <span className="text-xs text-muted-foreground/70">PNG, JPG, SVG, WebP, PDF (max. 10MB)</span>
                  </div>
                )}
                <input
                  ref={designInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.webp,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, "design")
                    e.target.value = ""
                  }}
                />
              </div>

              {/* Brand Manual Upload */}
              <div className="space-y-2">
                <Label>Manual da marca</Label>
                {uploadedFiles.brand_manual ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50 dark:bg-green-900/20">
                    <FileText className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm text-green-700 dark:text-green-300 flex-1 truncate">{uploadedFiles.brand_manual.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("brand_manual")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 sm:p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => brandInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); brandInputRef.current?.click() } }}
                  >
                    {uploadingField === "brand_manual" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">Clique para enviar o manual da marca</span>
                    <span className="text-xs text-muted-foreground/70">PDF, PNG, JPG (max. 10MB)</span>
                  </div>
                )}
                <input
                  ref={brandInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, "brand_manual")
                    e.target.value = ""
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observacoes adicionais</Label>
                <Textarea id="notes" value={formData.additional_notes} onChange={(e) => updateField("additional_notes", e.target.value)} placeholder="Algo mais que devemos saber?" rows={3} />
              </div>
            </>
          )}

          {/* Step: Review */}
          {currentStepId === "review" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Dados Pessoais</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Nome:</span><span>{formData.name}</span>
                  <span className="text-muted-foreground">Email:</span><span>{formData.email}</span>
                  {formData.phone && <><span className="text-muted-foreground">Telefone:</span><span>{formatPhoneDisplay(formData.phone)}</span></>}
                  {formData.cpf_cnpj && <><span className="text-muted-foreground">CPF/CNPJ:</span><span>{formData.cpf_cnpj}</span></>}
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-semibold text-foreground mb-2">Dados da Loja</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Loja:</span><span>{formData.store_name}</span>
                  <span className="text-muted-foreground">URL:</span><span className="truncate">{formData.store_url}</span>
                  <span className="text-muted-foreground">Plataforma:</span><span>{PLATFORMS.find(p => p.value === formData.platform)?.label}</span>
                  <span className="text-muted-foreground">Pais:</span><span>{COUNTRIES.find(c => c.value === formData.country)?.label}</span>
                  <span className="text-muted-foreground">Idioma:</span><span>{LANGUAGES.find(l => l.value === formData.language)?.label}</span>
                  {formData.niche && <><span className="text-muted-foreground">Nicho:</span><span>{formData.niche}</span></>}
                  {formData.target_audience && <><span className="text-muted-foreground">Publico-alvo:</span><span className="truncate">{formData.target_audience}</span></>}
                  {formData.price_sensitivity && <><span className="text-muted-foreground">Sensibilidade:</span><span>{formData.price_sensitivity === "price" ? "Preco" : formData.price_sensitivity === "quality" ? "Qualidade" : "Equilibrado"}</span></>}
                  {formData.free_shipping_type && <><span className="text-muted-foreground">Frete:</span><span>{formData.free_shipping_type === "all" ? "Frete gratis total" : formData.free_shipping_type === "conditional" ? "Frete gratis condicional" : "Sem frete gratis"}</span></>}
                </div>
              </div>
              {formData.platform === "shopify" && formData.shopify_collaborator_code && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-foreground mb-2">Codigo Colaborador</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Codigo:</span><span>{formData.shopify_collaborator_code}</span>
                  </div>
                </div>
              )}
              {(formData.design_direction_text || formData.logo_url || formData.design_direction_file_url || formData.brand_manual_url || formData.additional_notes) && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-foreground mb-2">Identidade Visual</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {formData.logo_url && <><span className="text-muted-foreground">Logo:</span><span className="text-green-600 dark:text-green-400 truncate">{uploadedFiles.logo?.fileName || "Arquivo enviado"}</span></>}
                    {formData.design_direction_text && <><span className="text-muted-foreground">Direcao:</span><span className="truncate">{formData.design_direction_text}</span></>}
                    {formData.design_direction_file_url && <><span className="text-muted-foreground">Referencia visual:</span><span className="text-green-600 dark:text-green-400 truncate">{uploadedFiles.design?.fileName || "Arquivo enviado"}</span></>}
                    {formData.brand_manual_url && <><span className="text-muted-foreground">Manual da marca:</span><span className="text-green-600 dark:text-green-400 truncate">{uploadedFiles.brand_manual?.fileName || "Arquivo enviado"}</span></>}
                    {formData.additional_notes && <><span className="text-muted-foreground">Observacoes:</span><span className="truncate">{formData.additional_notes}</span></>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={prevStep} disabled={currentStepIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>

            <div className="flex items-center gap-2">
              {currentStepId === "collaborator_code" && (
                <Button variant="ghost" onClick={nextStep}>
                  Pular
                </Button>
              )}
              {!isLastStep ? (
                <Button onClick={nextStep}>
                  Proximo
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
                      Enviar Cadastro
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
