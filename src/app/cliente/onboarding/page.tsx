"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/lib/hooks/use-toast"
import { Check, ChevronLeft, ChevronRight, Loader2, Store, User, Palette, Send, Upload, X, FileText, ImageIcon, Mail, Key, Info, Users, Pencil, AppWindow, Copy, CheckCheck } from "lucide-react"
import { PhoneInputIntl, formatPhoneDisplay } from "@/components/ui/phone-input"
import { CpfCnpjInput } from "@/components/ui/cpf-cnpj-input"
import { OnboardingStepper } from "@/components/onboarding/stepper"
import { PLATFORMS, COUNTRIES, LANGUAGES, SHIPPING_TYPES, PRICE_SENSITIVITIES, SHOPIFY_SCOPES } from "@/lib/constants/onboarding"

// ── Step identity system ──

type StepId = "personal_data" | "store_data" | "store_profile" | "create_shopify_app" | "collaborator_code" | "visual_identity" | "review"

interface StepDef {
  id: StepId
  title: string
  icon: typeof User
}

const ALL_STEPS: StepDef[] = [
  { id: "personal_data", title: "Dados Pessoais", icon: User },
  { id: "store_data", title: "Dados da Loja", icon: Store },
  { id: "store_profile", title: "Perfil da Loja", icon: Users },
  { id: "create_shopify_app", title: "App Shopify", icon: AppWindow },
  { id: "collaborator_code", title: "Codigo Colaborador", icon: Key },
  { id: "visual_identity", title: "Identidade Visual", icon: Palette },
  { id: "review", title: "Revisao e Envio", icon: Send },
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

  // Inline validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Shopify app step: permission selector
  const [selectedScopes, setSelectedScopes] = useState<string[]>(SHOPIFY_SCOPES.map((s) => s.scope))
  const [scopesCopied, setScopesCopied] = useState(false)
  const scopesTextRef = useRef<HTMLElement>(null)

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

  // ── sessionStorage persistence ──

  const STORAGE_KEY = "convertfy_onboarding_draft"

  // Restore on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { formData: savedForm, stepId } = JSON.parse(saved)
        if (savedForm) setFormData((prev) => ({ ...prev, ...savedForm }))
        if (stepId) setCurrentStepId(stepId)
      }
    } catch { /* ignore corrupt data */ }
  }, [])

  // Save on change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, stepId: currentStepId }))
    } catch { /* ignore quota errors */ }
  }, [formData, currentStepId])

  // ── Step navigation helpers ──

  function getVisibleSteps(): StepDef[] {
    return ALL_STEPS.filter((s) => {
      if (s.id === "create_shopify_app" || s.id === "collaborator_code") return formData.platform === "shopify"
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
    // Clear the specific field error when user edits the field
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
    // Handle edge case: user changes platform away from shopify while on a shopify-only step
    if (field === "platform" && value !== "shopify" && (currentStepId === "create_shopify_app" || currentStepId === "collaborator_code")) {
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

  const validateStep = (stepId: StepId): Record<string, string> => {
    const errs: Record<string, string> = {}
    switch (stepId) {
      case "personal_data":
        if (!formData.name.trim()) errs.name = "Nome e obrigatorio"
        if (!formData.email.trim()) errs.email = "Email e obrigatorio"
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = "Email invalido"
        break
      case "store_data":
        if (!formData.store_name.trim()) errs.store_name = "Nome da loja e obrigatorio"
        if (!formData.store_url.trim()) errs.store_url = "URL da loja e obrigatoria"
        else if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(formData.store_url.trim())) errs.store_url = "URL invalida. Ex: minhaloja.com.br ou https://minhaloja.com.br"
        if (!formData.platform) errs.platform = "Plataforma e obrigatoria"
        break
      case "store_profile":
        // All fields are optional
        break
      case "create_shopify_app":
      case "collaborator_code":
      case "visual_identity":
      case "review":
        break
    }
    return errs
  }

  const nextStep = () => {
    const stepErrors = validateStep(currentStepId)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setTimeout(() => {
        const firstError = document.querySelector('[aria-invalid="true"]')
        if (firstError instanceof HTMLElement) firstError.focus()
      }, 0)
      return
    }
    setErrors({})
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
      sessionStorage.removeItem(STORAGE_KEY)
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
      <div className="w-full max-w-2xl mb-8">
        <OnboardingStepper
          steps={visibleSteps.map((s) => ({ id: s.id, label: s.title, icon: s.icon }))}
          currentIndex={currentStepIndex}
          onNavigate={(i) => setCurrentStepId(visibleSteps[i].id)}
        />
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
                  <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Seu nome" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
                  {errors.name && <p id="name-error" className="text-sm text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="email">Email</RequiredLabel>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="seu@email.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
                  {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email}</p>}
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
                  <CpfCnpjInput id="cpf_cnpj" value={formData.cpf_cnpj} onChange={(v) => updateField("cpf_cnpj", v)} placeholder="000.000.000-00" />
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
                  <Input id="store_name" value={formData.store_name} onChange={(e) => updateField("store_name", e.target.value)} placeholder="Minha Loja" aria-invalid={!!errors.store_name} aria-describedby={errors.store_name ? "store_name-error" : undefined} />
                  {errors.store_name && <p id="store_name-error" className="text-sm text-destructive">{errors.store_name}</p>}
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="store_url">URL da loja</RequiredLabel>
                  <Input id="store_url" value={formData.store_url} onChange={(e) => updateField("store_url", e.target.value)} placeholder="https://minhaloja.com.br" aria-invalid={!!errors.store_url} aria-describedby={errors.store_url ? "store_url-error" : undefined} />
                  {errors.store_url && <p id="store_url-error" className="text-sm text-destructive">{errors.store_url}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Plataforma</RequiredLabel>
                <Select value={formData.platform} onValueChange={(v) => updateField("platform", v)}>
                  <SelectTrigger aria-invalid={!!errors.platform} aria-describedby={errors.platform ? "platform-error" : undefined}><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.platform && <p id="platform-error" className="text-sm text-destructive">{errors.platform}</p>}
              </div>
            </>
          )}

          {/* Step: Store Profile */}
          {currentStepId === "store_profile" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="niche">Nicho</Label>
                  <Input id="niche" value={formData.niche} onChange={(e) => updateField("niche", e.target.value)} placeholder="Ex: Moda, Beleza, Tech..." />
                </div>
                <div className="space-y-2">
                  <Label>Pais</Label>
                  <Select value={formData.country} onValueChange={(v) => updateField("country", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o pais" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select value={formData.language} onValueChange={(v) => updateField("language", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o idioma" /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de frete</Label>
                  <Select value={formData.free_shipping_type} onValueChange={(v) => updateField("free_shipping_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {SHIPPING_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
                  {PRICE_SENSITIVITIES.map((ps) => (
                    <div key={ps.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={ps.value} id={ps.value} />
                      <Label htmlFor={ps.value}>{ps.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {/* Step: Create Shopify App (Shopify only — instructional, public form = no token field) */}
          {currentStepId === "create_shopify_app" && (
            <div className="space-y-6">
              {/* Passo 1 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">1. Acessar o Admin</p>
                <p className="text-sm text-muted-foreground">Abra o admin da sua loja Shopify em <strong>suaLoja.myshopify.com/admin</strong></p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: tela de login do admin Shopify]</div>
              </div>

              {/* Passo 2 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">2. Ir para Apps</p>
                <p className="text-sm text-muted-foreground">No menu lateral, clique em <strong>Configuracoes</strong> (icone de engrenagem), depois em <strong>Apps e canais de vendas</strong>. No canto superior, clique em <strong>Desenvolver apps</strong>.</p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: menu configuracoes &gt; apps]</div>
              </div>

              {/* Passo 3 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">3. Permitir desenvolvimento</p>
                <p className="text-sm text-muted-foreground">Se for a primeira vez, clique em <strong>Permitir desenvolvimento de apps personalizados</strong> e confirme novamente.</p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: botao de permitir desenvolvimento]</div>
              </div>

              {/* Passo 4 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">4. Criar o App</p>
                <p className="text-sm text-muted-foreground">Clique em <strong>Criar um app</strong>. No campo &quot;Nome do app&quot;, digite: <strong>convertfy</strong>. Clique em <strong>Criar app</strong>.</p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: modal de criar app]</div>
              </div>

              {/* Passo 5 — Permissoes com seletor interativo */}
              <div className="rounded-xl bg-muted p-4 space-y-3">
                <p className="font-semibold text-foreground">5. Configurar Permissoes</p>
                <p className="text-sm text-muted-foreground">Na aba <strong>Configuracao</strong>, clique em <strong>Configurar escopos da API Admin</strong>. Selecione as permissoes abaixo:</p>

                {/* Scope selector */}
                <div className="bg-background rounded-lg border p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScopes.length === SHOPIFY_SCOPES.length}
                      onChange={(e) => setSelectedScopes(e.target.checked ? SHOPIFY_SCOPES.map((s) => s.scope) : [])}
                      className="rounded border-muted-foreground"
                    />
                    <span className="text-sm font-medium">Selecionar todas (recomendado)</span>
                  </label>
                  <hr className="border-muted" />
                  {SHOPIFY_SCOPES.map((s) => (
                    <label key={s.scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(s.scope)}
                        onChange={(e) => {
                          setSelectedScopes((prev) =>
                            e.target.checked ? [...prev, s.scope] : prev.filter((x) => x !== s.scope)
                          )
                        }}
                        className="rounded border-muted-foreground"
                      />
                      <span className="text-sm">{s.label} — <span className="text-muted-foreground">{s.scope}</span></span>
                    </label>
                  ))}
                </div>

                {/* Copyable text block */}
                {selectedScopes.length > 0 && (
                  <div className="bg-background rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Texto pronto para colar:</p>
                    <div className="flex items-start gap-2">
                      <code ref={scopesTextRef} className="text-sm flex-1 break-all">{selectedScopes.join(", ")}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7"
                        onClick={() => {
                          const text = selectedScopes.join(", ")
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(text).then(() => {
                              setScopesCopied(true)
                              setTimeout(() => setScopesCopied(false), 2000)
                            })
                          } else {
                            // Fallback: select the text
                            const el = scopesTextRef.current
                            if (el) {
                              const range = document.createRange()
                              range.selectNodeContents(el)
                              window.getSelection()?.removeAllRanges()
                              window.getSelection()?.addRange(range)
                            }
                          }
                        }}
                      >
                        {scopesCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        <span className="ml-1 text-xs">{scopesCopied ? "Copiado!" : "Copiar"}</span>
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-sm text-muted-foreground">Depois clique em <strong>Salvar</strong>.</p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: tela de escopos da API Admin]</div>
              </div>

              {/* Passo 6 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">6. Instalar o App</p>
                <p className="text-sm text-muted-foreground">Volte para a aba <strong>Visao geral</strong>. Clique em <strong>Instalar app</strong> e confirme.</p>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: botao instalar app]</div>
              </div>

              {/* Passo 7 */}
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <p className="font-semibold text-foreground">7. Copiar o Token</p>
                <p className="text-sm text-muted-foreground">Apos instalar, a tela mostrara o <strong>Admin API access token</strong>. Copie e guarde em local seguro.</p>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                  <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">ATENCAO: Este token aparece apenas UMA VEZ. Copie agora!</p>
                </div>
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: tela com token gerado]</div>
              </div>
            </div>
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
              {/* Warning: uploads need to be redone after session restore */}
              {(formData.logo_url && !uploadedFiles.logo) ||
               (formData.design_direction_file_url && !uploadedFiles.design) ||
               (formData.brand_manual_url && !uploadedFiles.brand_manual) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>Alguns arquivos precisam ser enviados novamente. Faca o upload novamente abaixo.</span>
                  </div>
                </div>
              ) : null}
              {/* Asymmetric grid: logo (60%) | optional files (40%) */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                {/* Left column: Logo */}
                <div className="sm:col-span-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Logo</p>
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
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 sm:p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[160px]"
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

                {/* Right column: Optional files */}
                <div className="sm:col-span-2 flex flex-col gap-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0">Arquivos opcionais</p>

                  {/* Design Reference Upload - compact horizontal */}
                  <div>
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
                        className="flex items-center gap-3 rounded-lg border-2 border-dashed p-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => designInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); designInputRef.current?.click() } }}
                      >
                        {uploadingField === "design" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />
                        ) : (
                          <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <span className="text-sm text-muted-foreground block">Referencia visual</span>
                          <span className="text-xs text-muted-foreground/70">PNG, JPG, SVG, WebP, PDF</span>
                        </div>
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

                  {/* Brand Manual Upload - compact horizontal */}
                  <div>
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
                        className="flex items-center gap-3 rounded-lg border-2 border-dashed p-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => brandInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); brandInputRef.current?.click() } }}
                      >
                        {uploadingField === "brand_manual" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />
                        ) : (
                          <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <span className="text-sm text-muted-foreground block">Manual da marca</span>
                          <span className="text-xs text-muted-foreground/70">PDF, PNG, JPG</span>
                        </div>
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
                </div>
              </div>

              {/* Text fields below the grid */}
              <div className="space-y-2">
                <Label htmlFor="design_direction">Direcao de design</Label>
                <Textarea id="design_direction" value={formData.design_direction_text} onChange={(e) => updateField("design_direction_text", e.target.value)} placeholder="Descreva o estilo visual desejado, cores, referencias..." rows={3} />
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
              {/* Dados Pessoais */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">Dados Pessoais</h3>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("personal_data")}>
                    <Pencil className="h-3 w-3 mr-1" />Editar
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">Nome</p><p className="text-sm">{formData.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{formData.email}</p></div>
                  {formData.phone && <div><p className="text-xs text-muted-foreground">Telefone</p><p className="text-sm">{formatPhoneDisplay(formData.phone)}</p></div>}
                  {formData.cpf_cnpj && <div><p className="text-xs text-muted-foreground">CPF/CNPJ</p><p className="text-sm">{formData.cpf_cnpj}</p></div>}
                </div>
              </div>

              {/* Dados da Loja */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">Dados da Loja</h3>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("store_data")}>
                    <Pencil className="h-3 w-3 mr-1" />Editar
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">Loja</p><p className="text-sm">{formData.store_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">URL</p><p className="text-sm break-all">{formData.store_url}</p></div>
                  <div><p className="text-xs text-muted-foreground">Plataforma</p><p className="text-sm">{PLATFORMS.find(p => p.value === formData.platform)?.label}</p></div>
                </div>
              </div>

              {/* Perfil da Loja */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">Perfil da Loja</h3>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("store_profile")}>
                    <Pencil className="h-3 w-3 mr-1" />Editar
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formData.niche && <div><p className="text-xs text-muted-foreground">Nicho</p><p className="text-sm">{formData.niche}</p></div>}
                  <div><p className="text-xs text-muted-foreground">Pais</p><p className="text-sm">{COUNTRIES.find(c => c.value === formData.country)?.label}</p></div>
                  <div><p className="text-xs text-muted-foreground">Idioma</p><p className="text-sm">{LANGUAGES.find(l => l.value === formData.language)?.label}</p></div>
                  {formData.target_audience && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Publico-alvo</p><p className="text-sm whitespace-pre-wrap">{formData.target_audience}</p></div>}
                  {formData.price_sensitivity && <div><p className="text-xs text-muted-foreground">Sensibilidade</p><p className="text-sm">{PRICE_SENSITIVITIES.find(p => p.value === formData.price_sensitivity)?.label}</p></div>}
                  {formData.free_shipping_type && <div><p className="text-xs text-muted-foreground">Frete</p><p className="text-sm">{SHIPPING_TYPES.find(s => s.value === formData.free_shipping_type)?.label}</p></div>}
                </div>
              </div>

              {/* App Shopify */}
              {formData.platform === "shopify" && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground">App Shopify</h3>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("create_shopify_app")}>
                      <Pencil className="h-3 w-3 mr-1" />Editar
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Instrucoes visualizadas</p>
                </div>
              )}

              {/* Codigo Colaborador */}
              {formData.platform === "shopify" && formData.shopify_collaborator_code && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground">Codigo Colaborador</h3>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("collaborator_code")}>
                      <Pencil className="h-3 w-3 mr-1" />Editar
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><p className="text-xs text-muted-foreground">Codigo</p><p className="text-sm">{formData.shopify_collaborator_code}</p></div>
                  </div>
                </div>
              )}

              {/* Identidade Visual */}
              {(formData.design_direction_text || formData.logo_url || formData.design_direction_file_url || formData.brand_manual_url || formData.additional_notes) && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground">Identidade Visual</h3>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentStepId("visual_identity")}>
                      <Pencil className="h-3 w-3 mr-1" />Editar
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {formData.logo_url && <div><p className="text-xs text-muted-foreground">Logo</p><p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{uploadedFiles.logo?.fileName || "Arquivo enviado"}</p></div>}
                    {formData.design_direction_file_url && <div><p className="text-xs text-muted-foreground">Referencia visual</p><p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{uploadedFiles.design?.fileName || "Arquivo enviado"}</p></div>}
                    {formData.brand_manual_url && <div><p className="text-xs text-muted-foreground">Manual da marca</p><p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{uploadedFiles.brand_manual?.fileName || "Arquivo enviado"}</p></div>}
                    {formData.design_direction_text && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Direcao de design</p><p className="text-sm whitespace-pre-wrap">{formData.design_direction_text}</p></div>}
                    {formData.additional_notes && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Observacoes</p><p className="text-sm whitespace-pre-wrap">{formData.additional_notes}</p></div>}
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
              {(currentStepId === "create_shopify_app" || currentStepId === "collaborator_code") && (
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
