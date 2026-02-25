"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/lib/hooks/use-toast"
import { Check, ChevronLeft, ChevronRight, Loader2, Store, User, Palette, Send, Upload, X, FileText, Image } from "lucide-react"

const STEPS = [
  { id: 1, title: "Dados Pessoais", icon: User },
  { id: 2, title: "Dados da Loja", icon: Store },
  { id: 3, title: "Identidade Visual", icon: Palette },
  { id: 4, title: "Revisão e Envio", icon: Send },
]

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

interface UploadedFile {
  path: string
  fileName: string
}

export default function PublicOnboardingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
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
    // Step 1
    name: "",
    email: "",
    phone: "",
    cpf_cnpj: "",
    company: "",
    password: "",
    password_confirm: "",
    use_temp_password: false,
    // Step 2
    store_name: "",
    store_url: "",
    platform: "" as string,
    niche: "",
    country: "BR",
    language: "pt-BR",
    target_audience: "",
    free_shipping_type: "" as string,
    shopify_collaborator_code: "",
    // Step 3
    price_sensitivity: "" as string,
    additional_notes: "",
    logo_url: "",
    design_direction_text: "",
    design_direction_file_url: "",
    brand_manual_url: "",
    // Honeypot
    website: "",
  })

  const updateField = (field: string, value: string | boolean) => {
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

      const res = await fetch("/api/public/upload", { method: "POST", body: fd })
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
        if (!formData.name.trim()) return "Nome é obrigatório"
        if (!formData.email.trim()) return "Email é obrigatório"
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return "Email inválido"
        if (!formData.use_temp_password) {
          if (!formData.password) return "Senha é obrigatória"
          if (formData.password.length < 8) return "Senha deve ter pelo menos 8 caracteres"
          if (formData.password !== formData.password_confirm) return "Senhas não conferem"
        }
        return null
      case 2:
        if (!formData.store_name.trim()) return "Nome da loja é obrigatório"
        if (!formData.store_url.trim()) return "URL da loja é obrigatória"
        if (!formData.platform) return "Plataforma é obrigatória"
        if (!formData.country) return "País é obrigatório"
        if (!formData.language) return "Idioma é obrigatório"
        return null
      case 3:
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
    setCurrentStep((prev) => Math.min(prev + 1, 4))
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        cpf_cnpj: formData.cpf_cnpj || null,
        company: formData.company || null,
        password: formData.use_temp_password ? undefined : formData.password,
        use_temp_password: formData.use_temp_password,
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

      const response = await fetch("/api/public/onboarding-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar formulário")
      }

      setSubmitted(true)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao enviar formulário",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Cadastro Enviado!</CardTitle>
            <p className="text-slate-500 text-base mt-2">
              Seu cadastro foi recebido com sucesso. Verifique seu email para dados de acesso ao portal.
              Nossa equipe irá analisar seus dados e em breve seu onboarding começará.
            </p>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/portal/login")} className="w-full">
              Acessar Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Cadastro de Onboarding</h1>
        <p className="text-slate-500 mt-2">Preencha os dados para iniciar o processo</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8 w-full max-w-2xl">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => {
                  if (isCompleted) setCurrentStep(step.id)
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full justify-center
                  ${isActive ? "bg-blue-600 text-white" : ""}
                  ${isCompleted ? "bg-green-100 text-green-700 cursor-pointer hover:bg-green-200" : ""}
                  ${!isActive && !isCompleted ? "bg-slate-100 text-slate-400" : ""}
                `}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={`h-px w-4 mx-1 ${isCompleted ? "bg-green-300" : "bg-slate-200"}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Form Card */}
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Personal Data */}
          {currentStep === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="seu@email.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(11) 99999-9999" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                  <Input id="cpf_cnpj" value={formData.cpf_cnpj} onChange={(e) => updateField("cpf_cnpj", e.target.value)} placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input id="company" value={formData.company} onChange={(e) => updateField("company", e.target.value)} placeholder="Nome da empresa" />
              </div>
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox id="use_temp" checked={formData.use_temp_password} onCheckedChange={(checked) => updateField("use_temp_password", !!checked)} />
                  <Label htmlFor="use_temp" className="text-sm">Gerar senha temporária para mim</Label>
                </div>
                {!formData.use_temp_password && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha *</Label>
                      <Input id="password" type="password" value={formData.password} onChange={(e) => updateField("password", e.target.value)} placeholder="Mínimo 8 caracteres" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password_confirm">Confirmar senha *</Label>
                      <Input id="password_confirm" type="password" value={formData.password_confirm} onChange={(e) => updateField("password_confirm", e.target.value)} placeholder="Repita a senha" />
                    </div>
                  </div>
                )}
              </div>
              {/* Honeypot */}
              <input type="text" name="website" value={formData.website} onChange={(e) => updateField("website", e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            </>
          )}

          {/* Step 2: Store Data */}
          {currentStep === 2 && (
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

          {/* Step 3: Visual Identity */}
          {currentStep === 3 && (
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
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50">
                    <Image className="h-5 w-5 text-green-600 shrink-0" />
                    <span className="text-sm text-green-700 flex-1 truncate">{uploadedFiles.logo.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("logo")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingField === "logo" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-500">Clique para enviar o logo</span>
                    <span className="text-xs text-slate-400">PNG, JPG, SVG, WebP (máx. 10MB)</span>
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
                <Label htmlFor="design_direction">Direção de design</Label>
                <Textarea id="design_direction" value={formData.design_direction_text} onChange={(e) => updateField("design_direction_text", e.target.value)} placeholder="Descreva o estilo visual desejado, cores, referências..." rows={3} />
              </div>

              {/* Design Reference Upload */}
              <div className="space-y-2">
                <Label>Arquivo de referência visual</Label>
                {uploadedFiles.design ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50">
                    <FileText className="h-5 w-5 text-green-600 shrink-0" />
                    <span className="text-sm text-green-700 flex-1 truncate">{uploadedFiles.design.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("design")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                    onClick={() => designInputRef.current?.click()}
                  >
                    {uploadingField === "design" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-500">Clique para enviar referência visual</span>
                    <span className="text-xs text-slate-400">PNG, JPG, SVG, WebP, PDF (máx. 10MB)</span>
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
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-50">
                    <FileText className="h-5 w-5 text-green-600 shrink-0" />
                    <span className="text-sm text-green-700 flex-1 truncate">{uploadedFiles.brand_manual.fileName}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile("brand_manual")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                    onClick={() => brandInputRef.current?.click()}
                  >
                    {uploadingField === "brand_manual" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="h-6 w-6 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-500">Clique para enviar o manual da marca</span>
                    <span className="text-xs text-slate-400">PDF, PNG, JPG (máx. 10MB)</span>
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
                <Label htmlFor="notes">Observações adicionais</Label>
                <Textarea id="notes" value={formData.additional_notes} onChange={(e) => updateField("additional_notes", e.target.value)} placeholder="Algo mais que devemos saber?" rows={3} />
              </div>
            </>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Dados Pessoais</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-500">Nome:</span><span>{formData.name}</span>
                  <span className="text-slate-500">Email:</span><span>{formData.email}</span>
                  {formData.phone && <><span className="text-slate-500">Telefone:</span><span>{formData.phone}</span></>}
                  {formData.cpf_cnpj && <><span className="text-slate-500">CPF/CNPJ:</span><span>{formData.cpf_cnpj}</span></>}
                  {formData.company && <><span className="text-slate-500">Empresa:</span><span>{formData.company}</span></>}
                  <span className="text-slate-500">Senha:</span><span>{formData.use_temp_password ? "Temporária (enviada por email)" : "Definida por você"}</span>
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-semibold text-slate-900 mb-2">Dados da Loja</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-500">Loja:</span><span>{formData.store_name}</span>
                  <span className="text-slate-500">URL:</span><span className="truncate">{formData.store_url}</span>
                  <span className="text-slate-500">Plataforma:</span><span>{PLATFORMS.find(p => p.value === formData.platform)?.label}</span>
                  <span className="text-slate-500">País:</span><span>{COUNTRIES.find(c => c.value === formData.country)?.label}</span>
                  <span className="text-slate-500">Idioma:</span><span>{LANGUAGES.find(l => l.value === formData.language)?.label}</span>
                  {formData.niche && <><span className="text-slate-500">Nicho:</span><span>{formData.niche}</span></>}
                  {formData.target_audience && <><span className="text-slate-500">Público-alvo:</span><span className="truncate">{formData.target_audience}</span></>}
                </div>
              </div>
              {(formData.price_sensitivity || formData.design_direction_text || uploadedFiles.logo || uploadedFiles.design || uploadedFiles.brand_manual) && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-slate-900 mb-2">Identidade Visual</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {formData.price_sensitivity && <><span className="text-slate-500">Foco:</span><span>{formData.price_sensitivity === "price" ? "Preço" : formData.price_sensitivity === "quality" ? "Qualidade" : "Equilibrado"}</span></>}
                    {uploadedFiles.logo && <><span className="text-slate-500">Logo:</span><span className="text-green-600 truncate">{uploadedFiles.logo.fileName}</span></>}
                    {formData.design_direction_text && <><span className="text-slate-500">Direção:</span><span className="truncate">{formData.design_direction_text}</span></>}
                    {uploadedFiles.design && <><span className="text-slate-500">Referência visual:</span><span className="text-green-600 truncate">{uploadedFiles.design.fileName}</span></>}
                    {uploadedFiles.brand_manual && <><span className="text-slate-500">Manual da marca:</span><span className="text-green-600 truncate">{uploadedFiles.brand_manual.fileName}</span></>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={prevStep} disabled={currentStep === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>

            {currentStep < 4 ? (
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
                    Enviar Cadastro
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
