"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  Store,
  ShoppingBag,
  Key,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
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
import { cn } from "@/lib/utils"

const STEPS = [
  { key: "personal_info", label: "Seus Dados", icon: User },
  { key: "store_data", label: "Dados da Loja", icon: Store },
  { key: "shopify_code", label: "Shopify", icon: ShoppingBag },
  { key: "klaviyo_keys", label: "Klaviyo", icon: Key },
] as const

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
  const [data, setData] = useState<WizardData | null>(null)
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

        // Auto-advance to first incomplete step
        if (result.wizardComplete) {
          router.push("/portal/dashboard")
          return
        }
        const steps = result.steps
        if (steps.personalInfo?.complete && !steps.storeData?.complete) setCurrentStep(1)
        else if (steps.storeData?.complete && !steps.shopifyCode?.complete) setCurrentStep(2)
        else if (steps.shopifyCode?.complete && !steps.klaviyoKeys?.complete) setCurrentStep(3)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchWizardState()
  }, [fetchWizardState])

  async function saveStep(step: string, stepData: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch("/api/portal/onboarding/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: stepData }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erro", description: result.error || "Erro ao salvar" })
        return false
      }
      return true
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro de conexão" })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleNext() {
    let success = false

    switch (currentStep) {
      case 0:
        if (!name.trim()) {
          toast({ variant: "destructive", title: "Preencha seu nome completo" })
          return
        }
        success = await saveStep("personal_info", { name, email, cpf_cnpj: cpfCnpj, company })
        break

      case 1:
        if (!storeName.trim()) {
          toast({ variant: "destructive", title: "Preencha o nome da loja" })
          return
        }
        success = await saveStep("store_data", {
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
        if (success) {
          // Refresh to get store_id if it was created
          await fetchWizardState()
        }
        break

      case 2:
        success = await saveStep("shopify_code", {
          store_id: storeId,
          collaborator_code: collaboratorCode,
        })
        break

      case 3:
        if (!klaviyoKey.trim()) {
          toast({ variant: "destructive", title: "Preencha a Private API Key do Klaviyo" })
          return
        }
        success = await saveStep("klaviyo_keys", {
          store_id: storeId,
          private_key: klaviyoKey,
        })
        if (success) {
          toast({ title: "Onboarding concluído!", description: "Bem-vindo ao Convertfy!" })
          router.push("/portal/dashboard")
          return
        }
        break
    }

    if (success && currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              const isActive = i === currentStep
              const isComplete = i < currentStep
              return (
                <div key={step.key} className="flex items-center">
                  <div
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isComplete && "border-success bg-success text-white",
                      !isActive && !isComplete && "border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "w-12 sm:w-20 h-0.5 mx-2",
                        i < currentStep ? "bg-success" : "bg-muted-foreground/20"
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Passo {currentStep + 1} de {STEPS.length} — {STEPS[currentStep].label}
          </p>
        </div>

        {/* Step Content */}
        <GlowCard color="primary" intensity="subtle">
          <CardHeader>
            <CardTitle>{STEPS[currentStep].label}</CardTitle>
            <CardDescription>
              {currentStep === 0 && "Precisamos de algumas informações sobre você para começar."}
              {currentStep === 1 && "Conte-nos sobre a loja que você deseja gerenciar."}
              {currentStep === 2 && "Insira o código de colaborador da Shopify para acesso à loja."}
              {currentStep === 3 && "Conecte sua conta Klaviyo para acompanhar métricas de email."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Personal Info */}
            {currentStep === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo *</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
                    <Input id="cpf_cnpj" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Empresa</Label>
                    <Input id="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome da empresa" />
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Store Data */}
            {currentStep === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store_name">Nome da Loja *</Label>
                    <Input id="store_name" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Minha Loja" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store_url">URL da Loja</Label>
                    <Input id="store_url" value={storeUrl} onChange={e => setStoreUrl(e.target.value)} placeholder="minhaloja.myshopify.com" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Plataforma</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="woocommerce">WooCommerce</SelectItem>
                        <SelectItem value="vtex">VTEX</SelectItem>
                        <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                        <SelectItem value="other">Outra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="niche">Nicho da Loja</Label>
                    <Input id="niche" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Moda, Cosméticos, Eletrônicos" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BR">Brasil</SelectItem>
                        <SelectItem value="US">Estados Unidos</SelectItem>
                        <SelectItem value="PT">Portugal</SelectItem>
                        <SelectItem value="OTHER">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-BR">Português (BR)</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_audience">Público Alvo</Label>
                  <Textarea id="target_audience" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="Descreva seu público alvo..." rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Frete Grátis</Label>
                  <Select value={freeShippingType} onValueChange={setFreeShippingType}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixo (acima de X reais)</SelectItem>
                      <SelectItem value="custom">Personalizado (por região/produto)</SelectItem>
                      <SelectItem value="none">Sem frete grátis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Step 3: Shopify Collaborator Code */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
                  <p className="font-medium">Como obter o código de colaborador:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Acesse o painel admin da sua loja Shopify</li>
                    <li>Vá em Configurações &gt; Usuários e permissões</li>
                    <li>Na seção &quot;Colaboradores&quot;, copie o código de acesso</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collaborator_code">Código de Colaborador</Label>
                  <Input
                    id="collaborator_code"
                    value={collaboratorCode}
                    onChange={e => setCollaboratorCode(e.target.value)}
                    placeholder="Cole o código aqui"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Este passo pode ser pulado e configurado depois.
                </p>
              </div>
            )}

            {/* Step 4: Klaviyo Keys */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
                  <p className="font-medium">Como obter a Private API Key do Klaviyo:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Acesse sua conta Klaviyo em klaviyo.com</li>
                    <li>Vá em Account &gt; Settings &gt; API Keys</li>
                    <li>Crie uma Private API Key com todas as permissões</li>
                    <li>Copie a chave gerada</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="klaviyo_key">Private API Key *</Label>
                  <Input
                    id="klaviyo_key"
                    type="password"
                    value={klaviyoKey}
                    onChange={e => setKlaviyoKey(e.target.value)}
                    placeholder="pk_xxxxxxxxxxxx"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </GlowCard>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || saving}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>

          <div className="flex items-center gap-2">
            {(currentStep === 2) && (
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={saving}
              >
                Pular
              </Button>
            )}
            <Button onClick={handleNext} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {currentStep === 3 ? (
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
