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
          router.push("/client/dashboard")
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
          router.push("/client/dashboard")
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
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB] dark:bg-[#0B0E14]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8F9FB] dark:bg-[#0B0E14]">
      <div className="w-full max-w-2xl">
        {/* Progress Steps */}
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
                      isActive && "border-primary bg-primary text-white",
                      isComplete && "border-emerald-500 bg-emerald-500 text-white",
                      !isActive && !isComplete && "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                    )}
                  >
                    {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "w-12 sm:w-20 h-0.5 mx-2",
                        i < currentStep ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Passo {currentStep + 1} de {STEPS.length} — {STEPS[currentStep].label}
          </p>
        </div>

        {/* Step Content */}
        <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 overflow-hidden">
          <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{STEPS[currentStep].label}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {currentStep === 0 && "Precisamos de algumas informações sobre você para começar."}
              {currentStep === 1 && "Conte-nos sobre a loja que você deseja gerenciar."}
              {currentStep === 2 && "Insira o código de colaborador da Shopify para acesso à loja."}
              {currentStep === 3 && "Conecte sua conta Klaviyo para acompanhar métricas de email."}
            </p>
          </div>
          <div className="px-4 pb-6 sm:px-8 sm:pb-8 space-y-4">
            {/* Step 1: Personal Info */}
            {currentStep === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Nome Completo *</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cpf_cnpj" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">CPF / CNPJ</Label>
                    <Input id="cpf_cnpj" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Empresa</Label>
                    <Input id="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome da empresa" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Store Data */}
            {currentStep === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store_name" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Nome da Loja *</Label>
                    <Input id="store_name" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Minha Loja" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store_url" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">URL da Loja</Label>
                    <Input id="store_url" value={storeUrl} onChange={e => setStoreUrl(e.target.value)} placeholder="minhaloja.myshopify.com" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Plataforma</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 shadow-lg">
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="woocommerce">WooCommerce</SelectItem>
                        <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                        <SelectItem value="tray">Tray</SelectItem>
                        <SelectItem value="dupla_estrutura">Dupla Estrutura</SelectItem>
                        <SelectItem value="other">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="niche" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Nicho da Loja</Label>
                    <Input id="niche" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Moda, Cosméticos, Eletrônicos" className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">País</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 shadow-lg">
                        <SelectItem value="BR">Brasil</SelectItem>
                        <SelectItem value="US">Estados Unidos</SelectItem>
                        <SelectItem value="PT">Portugal</SelectItem>
                        <SelectItem value="OTHER">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Idioma</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 shadow-lg">
                        <SelectItem value="pt-BR">Português (BR)</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_audience" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Público Alvo</Label>
                  <Textarea id="target_audience" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="Descreva seu público alvo..." rows={2} className="bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Tipo de Frete Grátis</Label>
                  <Select value={freeShippingType} onValueChange={setFreeShippingType}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 shadow-lg">
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
                <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#1A1F2E] text-sm space-y-2">
                  <p className="font-medium text-slate-700 dark:text-slate-200">Como obter o código de colaborador:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Acesse o painel admin da sua loja Shopify</li>
                    <li>Vá em Configurações &gt; Usuários e permissões</li>
                    <li>Na seção &quot;Colaboradores&quot;, copie o código de acesso</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collaborator_code" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Código de Colaborador</Label>
                  <Input
                    id="collaborator_code"
                    value={collaboratorCode}
                    onChange={e => setCollaboratorCode(e.target.value)}
                    placeholder="Cole o código aqui"
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Este passo pode ser pulado e configurado depois.
                </p>
              </div>
            )}

            {/* Step 4: Klaviyo Keys */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#1A1F2E] text-sm space-y-2">
                  <p className="font-medium text-slate-700 dark:text-slate-200">Como obter a Private API Key do Klaviyo:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Acesse sua conta Klaviyo em klaviyo.com</li>
                    <li>Vá em Account &gt; Settings &gt; API Keys</li>
                    <li>Crie uma Private API Key com todas as permissões</li>
                    <li>Copie a chave gerada</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="klaviyo_key" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Private API Key *</Label>
                  <Input
                    id="klaviyo_key"
                    type="password"
                    value={klaviyoKey}
                    onChange={e => setKlaviyoKey(e.target.value)}
                    placeholder="pk_xxxxxxxxxxxx"
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                  />
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
            className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
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
                className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
              >
                Pular
              </Button>
            )}
            <Button onClick={handleNext} disabled={saving} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
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
