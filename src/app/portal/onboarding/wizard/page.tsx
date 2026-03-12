"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  Store,
  Users,
  ShoppingBag,
  Key,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  AppWindow,
  Copy,
  CheckCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"
import { CpfCnpjInput } from "@/components/ui/cpf-cnpj-input"
import { PLATFORMS, COUNTRIES, LANGUAGES, SHIPPING_TYPES, SHOPIFY_SCOPES } from "@/lib/constants/onboarding"
import { OnboardingStepper } from "@/components/onboarding/stepper"

const ALL_STEPS = [
  { key: "personal_info", label: "Seus Dados", icon: User },
  { key: "store_data", label: "Dados da Loja", icon: Store },
  { key: "store_profile", label: "Perfil da Loja", icon: Users },
  { key: "create_shopify_app", label: "App Shopify", icon: AppWindow },
  { key: "shopify_code", label: "Shopify", icon: ShoppingBag },
  { key: "klaviyo_keys", label: "Klaviyo", icon: Key },
] as const

type StepDef = (typeof ALL_STEPS)[number]

interface WizardData {
  name: string
  email: string
  cpf_cnpj: string
  company: string
  store: {
    id: string
    store_name: string
    store_url: string
    platform: string
    niche: string
    country: string
    language: string
    target_audience: string
    free_shipping_type: string
    shopify_collaborator_code: string
    has_shopify: boolean
    has_klaviyo: boolean
  } | null
}

export default function OnboardingWizardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [, setData] = useState<WizardData | null>(null)
  const [storeId, setStoreId] = useState<string>("")

  // Form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [cpfCnpj, setCpfCnpj] = useState("")
  const [company, setCompany] = useState("")

  const [storeName, setStoreName] = useState("")
  const [storeUrl, setStoreUrl] = useState("")
  const [platform, setPlatform] = useState("shopify")
  const [niche, setNiche] = useState("")
  const [country, setCountry] = useState("BR")
  const [language, setLanguage] = useState("pt-BR")
  const [targetAudience, setTargetAudience] = useState("")
  const [freeShippingType, setFreeShippingType] = useState("")

  const [collaboratorCode, setCollaboratorCode] = useState("")
  const [klaviyoKey, setKlaviyoKey] = useState("")

  // Shopify app step
  const [shopifyToken, setShopifyToken] = useState("")
  const [shopifyMyshopifyDomain, setShopifyMyshopifyDomain] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<string[]>(SHOPIFY_SCOPES.map((s) => s.scope))
  const [scopesCopied, setScopesCopied] = useState(false)
  const [validatingToken, setValidatingToken] = useState(false)
  const scopesTextRef = useRef<HTMLElement>(null)

  // Inline validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Clear a specific field error when user edits
  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // If platform changes and current step index exceeds visible steps, clamp it
  useEffect(() => {
    const steps = ALL_STEPS.filter((s) => {
      if (s.key === "create_shopify_app" || s.key === "shopify_code") return platform === "shopify"
      return true
    })
    if (currentStep >= steps.length) {
      setCurrentStep(steps.length - 1)
    }
  }, [platform, currentStep])

  // Conditional steps: hide shopify-only steps when platform !== "shopify"
  function getVisibleSteps(): StepDef[] {
    return ALL_STEPS.filter((s) => {
      if (s.key === "create_shopify_app" || s.key === "shopify_code") return platform === "shopify"
      return true
    })
  }

  const visibleSteps = getVisibleSteps()
  const currentStepDef = visibleSteps[currentStep]
  const isLastStep = currentStep === visibleSteps.length - 1

  const fetchWizardState = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/onboarding/wizard")
      const result = await res.json()
      if (result.data) {
        const d = result.data as WizardData
        setData(d)
        setName(d.name)
        setEmail(d.email)
        setCpfCnpj(d.cpf_cnpj)
        setCompany(d.company)
        if (d.store) {
          setStoreId(d.store.id)
          setStoreName(d.store.store_name)
          setStoreUrl(d.store.store_url)
          setPlatform(d.store.platform)
          setNiche(d.store.niche)
          setCountry(d.store.country)
          setLanguage(d.store.language)
          setTargetAudience(d.store.target_audience)
          setFreeShippingType(d.store.free_shipping_type)
          setCollaboratorCode(d.store.shopify_collaborator_code)
        }

        if (result.wizardComplete) {
          router.push("/portal/dashboard")
          return
        }
        // Resume at the first incomplete visible step
        const steps = result.steps
        const storePlatform = d.store?.platform || "shopify"
        const resumeSteps = ALL_STEPS.filter((s) => {
          if (s.key === "create_shopify_app" || s.key === "shopify_code") return storePlatform === "shopify"
          return true
        })
        const stepComplete: Record<string, boolean> = {
          personal_info: !!steps.personalInfo?.complete,
          store_data: !!steps.storeData?.complete,
          store_profile: !!steps.storeData?.complete, // store_profile is saved together with store_data
          create_shopify_app: true, // always complete — instructional step
          shopify_code: !!steps.shopifyCode?.complete,
          klaviyo_keys: !!steps.klaviyoKeys?.complete,
        }
        const firstIncomplete = resumeSteps.findIndex((s) => !stepComplete[s.key])
        if (firstIncomplete > 0) setCurrentStep(firstIncomplete)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchWizardState()
  }, [fetchWizardState])

  function validateCurrentStep(): Record<string, string> {
    const errs: Record<string, string> = {}
    const stepKey = currentStepDef?.key
    switch (stepKey) {
      case "personal_info":
        if (!name.trim()) errs.name = "Nome e obrigatorio"
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Email invalido"
        {
          const digits = cpfCnpj.replace(/\D/g, "")
          if (digits.length > 0 && digits.length !== 11 && digits.length !== 14) errs.cpf_cnpj = "CPF deve ter 11 digitos ou CNPJ 14 digitos"
        }
        break
      case "store_data":
        if (!storeName.trim()) errs.store_name = "Nome da loja e obrigatorio"
        if (storeUrl.trim() && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(storeUrl.trim())) errs.store_url = "URL invalida. Ex: minhaloja.com.br"
        break
      case "store_profile":
        // All fields are optional
        break
      case "klaviyo_keys":
        if (!klaviyoKey.trim()) errs.klaviyo_key = "Private API Key e obrigatoria"
        break
    }
    return errs
  }

  function focusFirstError() {
    setTimeout(() => {
      const firstError = document.querySelector('[aria-invalid="true"]')
      if (firstError instanceof HTMLElement) firstError.focus()
    }, 0)
  }

  async function saveStep(step: string, stepData: Record<string, unknown>): Promise<boolean | string> {
    setSaving(true)
    try {
      const res = await fetch("/api/portal/onboarding/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: stepData }),
      })
      const result = await res.json()
      if (!res.ok) {
        // Return the error string so caller can show it inline
        return result.error || "Erro ao salvar"
      }
      return true
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro de conexao" })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleNext() {
    const stepKey = currentStepDef?.key
    if (!stepKey) return

    // Client-side validation
    const stepErrors = validateCurrentStep()
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      focusFirstError()
      return
    }
    setErrors({})

    let result: boolean | string = false

    switch (stepKey) {
      case "personal_info":
        result = await saveStep("personal_info", { name, email, cpf_cnpj: cpfCnpj, company })
        break

      case "store_data":
        // Just advance to store_profile — no API call yet
        result = true
        break

      case "store_profile":
        // Send ALL store fields together (store_data + store_profile) in a single saveStep
        result = await saveStep("store_data", {
          store_id: storeId || undefined,
          store_name: storeName,
          store_url: storeUrl,
          platform,
          niche,
          country,
          language,
          target_audience: targetAudience,
          free_shipping_type: freeShippingType,
        })
        if (result === true) {
          await fetchWizardState()
        }
        break

      case "create_shopify_app":
        // If token is filled, validate and save via backend
        if (shopifyToken.trim()) {
          // Client-side format check
          if (!shopifyToken.startsWith("shpat_") || shopifyToken.length < 20) {
            setErrors({ shopify_token: "Token deve comecar com shpat_ e ter pelo menos 20 caracteres" })
            focusFirstError()
            return
          }
          // Domain required when token is provided
          if (!shopifyMyshopifyDomain.trim()) {
            setErrors({ shopify_myshopify_domain: "Dominio .myshopify.com e obrigatorio quando o token e informado" })
            focusFirstError()
            return
          }
          // Validate domain format
          const cleanDomain = shopifyMyshopifyDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
          if (!cleanDomain.endsWith(".myshopify.com")) {
            setErrors({ shopify_myshopify_domain: "Dominio deve terminar com .myshopify.com (ex: minhaloja.myshopify.com)" })
            focusFirstError()
            return
          }
          setValidatingToken(true)
          result = await saveStep("create_shopify_app", {
            store_id: storeId,
            token: shopifyToken,
            shopify_myshopify_domain: shopifyMyshopifyDomain.trim(),
          })
          setValidatingToken(false)
        } else {
          // No token — just advance (step is optional)
          result = true
        }
        break

      case "shopify_code":
        result = await saveStep("shopify_code", {
          store_id: storeId,
          collaborator_code: collaboratorCode,
        })
        break

      case "klaviyo_keys":
        result = await saveStep("klaviyo_keys", {
          store_id: storeId,
          private_key: klaviyoKey,
        })
        if (result === true) {
          toast({ title: "Onboarding concluido!", description: "Bem-vindo ao Convertfy!" })
          router.push("/portal/dashboard")
          return
        }
        break
    }

    // Handle API error inline
    if (typeof result === "string") {
      // Map API errors to the most relevant field
      const fieldMap: Record<string, string> = {
        personal_info: "name",
        store_data: "store_name",
        store_profile: "niche",
        create_shopify_app: "shopify_token",
        shopify_code: "collaborator_code",
        klaviyo_keys: "klaviyo_key",
      }
      const field = fieldMap[stepKey] || stepKey
      setErrors({ [field]: result })
      focusFirstError()
      return
    }

    if (result === true && !isLastStep) {
      setCurrentStep(currentStep + 1)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-2xl">
        {/* Progress Steps */}
        <div className="mb-8">
          <OnboardingStepper
            steps={visibleSteps.map((s) => ({ id: s.key, label: s.label, icon: s.icon }))}
            currentIndex={currentStep}
            onNavigate={setCurrentStep}
          />
        </div>

        {/* Step Content */}
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-8 pt-8 pb-4">
            <h2 className="text-lg font-semibold text-foreground">{currentStepDef?.label}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {currentStepDef?.key === "personal_info" && "Precisamos de algumas informações sobre você para começar."}
              {currentStepDef?.key === "store_data" && "Conte-nos sobre a loja que você deseja gerenciar."}
              {currentStepDef?.key === "store_profile" && "Detalhes sobre o público e operação da sua loja."}
              {currentStepDef?.key === "create_shopify_app" && "Siga o tutorial para criar um app personalizado na sua loja Shopify."}
              {currentStepDef?.key === "shopify_code" && "Insira o código de colaborador da Shopify para acesso à loja."}
              {currentStepDef?.key === "klaviyo_keys" && "Conecte sua conta Klaviyo para acompanhar métricas de email."}
            </p>
          </div>
          <div className="px-8 pb-8 space-y-4">
            {/* Step 1: Personal Info */}
            {currentStepDef?.key === "personal_info" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-medium">Nome Completo *</Label>
                    <Input id="name" value={name} onChange={e => { setName(e.target.value); clearError("name") }} placeholder="Seu nome completo" className="h-10" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
                    {errors.name && <p id="name-error" className="text-sm text-destructive">{errors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-medium">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); clearError("email") }} placeholder="seu@email.com" className="h-10" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
                    {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cpf_cnpj" className="font-medium">CPF / CNPJ</Label>
                    <CpfCnpjInput id="cpf_cnpj" value={cpfCnpj} onChange={(v) => { setCpfCnpj(v); clearError("cpf_cnpj") }} placeholder="000.000.000-00" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company" className="font-medium">Empresa</Label>
                    <Input id="company" value={company} onChange={e => { setCompany(e.target.value); clearError("company") }} placeholder="Nome da empresa" className="h-10" />
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Store Data */}
            {currentStepDef?.key === "store_data" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store_name" className="font-medium">Nome da Loja *</Label>
                    <Input id="store_name" value={storeName} onChange={e => { setStoreName(e.target.value); clearError("store_name") }} placeholder="Minha Loja" className="h-10" aria-invalid={!!errors.store_name} aria-describedby={errors.store_name ? "store_name-error" : undefined} />
                    {errors.store_name && <p id="store_name-error" className="text-sm text-destructive">{errors.store_name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store_url" className="font-medium">URL da Loja</Label>
                    <Input id="store_url" value={storeUrl} onChange={e => { setStoreUrl(e.target.value); clearError("store_url") }} placeholder="minhaloja.myshopify.com" className="h-10" aria-invalid={!!errors.store_url} aria-describedby={errors.store_url ? "store_url-error" : undefined} />
                    {errors.store_url && <p id="store_url-error" className="text-sm text-destructive">{errors.store_url}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Plataforma</Label>
                  <Select value={platform} onValueChange={(v) => { setPlatform(v); clearError("platform") }}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Step 3: Store Profile */}
            {currentStepDef?.key === "store_profile" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="niche" className="font-medium">Nicho da Loja</Label>
                    <Input id="niche" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Moda, Cosméticos, Eletrônicos" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-medium">País</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-medium">Idioma</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-medium">Tipo de Frete Gratis</Label>
                    <Select value={freeShippingType} onValueChange={setFreeShippingType}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {SHIPPING_TYPES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_audience" className="font-medium">Publico Alvo</Label>
                  <Textarea id="target_audience" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="Descreva seu publico alvo..." rows={2} />
                </div>
              </>
            )}

            {/* Step: Create Shopify App (tutorial + token + domain fields) */}
            {currentStepDef?.key === "create_shopify_app" && (
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
                  <p className="text-sm text-muted-foreground">Apos instalar, a tela mostrara o <strong>Admin API access token</strong>. Copie e cole no campo abaixo.</p>
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">ATENCAO: Este token aparece apenas UMA VEZ. Copie agora!</p>
                  </div>
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center text-muted-foreground text-sm">[Imagem: tela com token gerado]</div>
                </div>

                {/* Token + Domain fields (wizard only) */}
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="shopify_myshopify_domain" className="font-medium">Dominio .myshopify.com da sua loja</Label>
                    <Input
                      id="shopify_myshopify_domain"
                      value={shopifyMyshopifyDomain}
                      onChange={(e) => { setShopifyMyshopifyDomain(e.target.value); clearError("shopify_myshopify_domain") }}
                      placeholder="minhaloja.myshopify.com"
                      className="h-10"
                      aria-invalid={!!errors.shopify_myshopify_domain}
                      aria-describedby={errors.shopify_myshopify_domain ? "shopify_myshopify_domain-error" : undefined}
                    />
                    {errors.shopify_myshopify_domain && <p id="shopify_myshopify_domain-error" className="text-sm text-destructive">{errors.shopify_myshopify_domain}</p>}
                    <p className="text-xs text-muted-foreground">Encontre em Configuracoes &gt; Dominios. Ex: minhaloja.myshopify.com</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shopify_token" className="font-medium">Admin API Access Token (opcional)</Label>
                    <Input
                      id="shopify_token"
                      type="password"
                      value={shopifyToken}
                      onChange={(e) => { setShopifyToken(e.target.value); clearError("shopify_token") }}
                      placeholder="shpat_xxxxxxxxxxxx"
                      className="h-10"
                      aria-invalid={!!errors.shopify_token}
                      aria-describedby={errors.shopify_token ? "shopify_token-error" : undefined}
                    />
                    {errors.shopify_token && <p id="shopify_token-error" className="text-sm text-destructive">{errors.shopify_token}</p>}
                  </div>
                  {validatingToken && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Validando token...
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    O token e opcional. Voce pode configurar depois no painel.
                  </p>
                </div>
              </div>
            )}

            {/* Step: Shopify Collaborator Code */}
            {currentStepDef?.key === "shopify_code" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted text-sm space-y-2">
                  <p className="font-medium text-foreground">Como obter o código de colaborador:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Acesse o painel admin da sua loja Shopify</li>
                    <li>Vá em Configurações &gt; Usuários e permissões</li>
                    <li>Na seção &quot;Colaboradores&quot;, copie o código de acesso</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collaborator_code" className="font-medium">Código de Colaborador</Label>
                  <Input
                    id="collaborator_code"
                    value={collaboratorCode}
                    onChange={e => { setCollaboratorCode(e.target.value); clearError("collaborator_code") }}
                    placeholder="Cole o código aqui"
                    className="h-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Este passo pode ser pulado e configurado depois.
                </p>
              </div>
            )}

            {/* Step 4: Klaviyo Keys */}
            {currentStepDef?.key === "klaviyo_keys" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted text-sm space-y-2">
                  <p className="font-medium text-foreground">Como obter a Private API Key do Klaviyo:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Acesse sua conta Klaviyo em klaviyo.com</li>
                    <li>Vá em Account &gt; Settings &gt; API Keys</li>
                    <li>Crie uma Private API Key com todas as permissões</li>
                    <li>Copie a chave gerada</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="klaviyo_key" className="font-medium">Private API Key *</Label>
                  <Input
                    id="klaviyo_key"
                    type="password"
                    value={klaviyoKey}
                    onChange={e => { setKlaviyoKey(e.target.value); clearError("klaviyo_key") }}
                    placeholder="pk_xxxxxxxxxxxx"
                    className="h-10"
                    aria-invalid={!!errors.klaviyo_key}
                    aria-describedby={errors.klaviyo_key ? "klaviyo_key-error" : undefined}
                  />
                  {errors.klaviyo_key && <p id="klaviyo_key-error" className="text-sm text-destructive">{errors.klaviyo_key}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || saving}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>

          <div className="flex items-center gap-2">
            {(currentStepDef?.key === "create_shopify_app" || currentStepDef?.key === "shopify_code") && (
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={saving || validatingToken}
                className="text-muted-foreground hover:text-foreground"
              >
                Pular
              </Button>
            )}
            <Button onClick={handleNext} disabled={saving || validatingToken} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isLastStep ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Concluir
                </>
              ) : (
                <>
                  Continuar
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
