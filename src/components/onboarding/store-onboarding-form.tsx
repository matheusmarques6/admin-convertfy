"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Loader2,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"

interface StoreOnboardingFormProps {
  storeId?: string
  clientId: string
  initialData?: {
    store?: Record<string, unknown> | null
    onboarding_data?: Record<string, unknown> | null
    client?: Record<string, unknown> | null
  }
  onSave?: (isComplete: boolean) => void
  /** @deprecated Use onSave instead */
  onComplete?: () => void
}

const PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "tray", label: "Tray" },
  { value: "dupla_estrutura", label: "Dupla Estrutura" },
  { value: "other", label: "Outros" },
]

const SHIPPING_TYPES = [
  { value: "free", label: "Frete Grátis" },
  { value: "fixed", label: "Frete Fixo" },
  { value: "custom", label: "Personalizado" },
]

const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "PT", label: "Portugal" },
  { value: "US", label: "Estados Unidos" },
  { value: "OTHER", label: "Outro" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "pt-PT", label: "Português (PT)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
]

const STEPS = [
  { title: "Dados Pessoais", description: "Informações do responsável" },
  { title: "Dados da Loja", description: "Informações da loja" },
  { title: "Público e Marca", description: "Audiência e posicionamento" },
  { title: "História da Loja", description: "Origem, jornada e marcos" },
  { title: "Arquivos", description: "Logo e materiais visuais" },
]

interface MilestoneInput {
  date: string
  description: string
}

export function StoreOnboardingForm({
  storeId: initialStoreId,
  clientId,
  initialData,
  onSave,
  onComplete,
}: StoreOnboardingFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentStoreId, setCurrentStoreId] = useState<string | undefined>(initialStoreId)
  const hasExistingData = !!(initialData?.onboarding_data || initialData?.store)

  // Form state
  const [formData, setFormData] = useState({
    // Personal data
    client_name: "",
    client_email: "",
    client_phone: "",
    client_cpf_cnpj: "",
    client_company: "",
    // Store data
    store_name: "",
    store_url: "",
    platform: "shopify",
    shopify_collaborator_code: "",
    niche: "",
    free_shipping_type: "",
    country: "",
    language: "",
    target_audience: "",
    price_sensitivity: "" as "" | "price" | "quality" | "balanced",
    additional_notes: "",
    history_raw: "",
    logo_url: "",
    design_direction_text: "",
    design_direction_file_url: "",
    brand_manual_url: "",
  })

  const [milestones, setMilestones] = useState<MilestoneInput[]>([])

  // File names for display
  const [fileNames, setFileNames] = useState({
    logo: "",
    design: "",
    brand_manual: "",
  })

  // Load initial data
  useEffect(() => {
    if (initialData) {
      const store = initialData.store || {}
      const od = initialData.onboarding_data || {}
      const client = initialData.client || {}
      setFormData((prev) => ({
        ...prev,
        // Personal data from client
        client_name: (client.name as string) || prev.client_name,
        client_email: (client.email as string) || prev.client_email,
        client_phone: (client.phone as string) || "",
        client_cpf_cnpj: (client.cpf_cnpj as string) || "",
        client_company: (client.company as string) || "",
        // Store data
        store_name: (store.store_name as string) || prev.store_name,
        store_url: (store.store_url as string) || prev.store_url,
        platform: (store.platform as string) || prev.platform,
        shopify_collaborator_code: (store.shopify_collaborator_code as string) || "",
        niche: (store.niche as string) || "",
        free_shipping_type: (store.free_shipping_type as string) || "",
        country: (store.country as string) || "",
        language: (store.language as string) || "",
        target_audience: (store.target_audience as string) || "",
        price_sensitivity: ((od.price_sensitivity as string) || "") as "" | "price" | "quality" | "balanced",
        additional_notes: (od.additional_notes as string) || "",
        history_raw: (od.history_raw as string) || "",
        logo_url: (od.logo_url as string) || "",
        design_direction_text: (od.design_direction_text as string) || "",
        design_direction_file_url: (od.design_direction_file_url as string) || "",
        brand_manual_url: (od.brand_manual_url as string) || "",
      }))
      const rawMs = od.milestones_raw
      if (Array.isArray(rawMs)) {
        setMilestones(
          (rawMs as Array<Record<string, unknown>>).map((m) => ({
            date: (m.date as string) ?? "",
            description: (m.description as string) ?? "",
          })),
        )
      }
    }
  }, [initialData])

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  async function handleFileUpload(file: File, fileType: "logo" | "design" | "brand_manual") {
    if (!currentStoreId) {
      toast({ variant: "destructive", title: "Salve o formulário primeiro", description: "Salve o rascunho antes de enviar arquivos para criar a loja." })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("store_id", currentStoreId)
      fd.append("file_type", fileType)

      const res = await fetch("/api/upload/store-files", { method: "POST", body: fd })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || "Erro no upload")

      const fieldMap = {
        logo: "logo_url",
        design: "design_direction_file_url",
        brand_manual: "brand_manual_url",
      }

      updateField(fieldMap[fileType], data.path)
      setFileNames((prev) => ({ ...prev, [fileType]: file.name }))

      toast({ title: "Arquivo enviado", description: file.name })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no upload"
      toast({ variant: "destructive", title: "Erro no upload", description: message })
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveFile(fileType: "logo" | "design" | "brand_manual") {
    const fieldMap = {
      logo: "logo_url",
      design: "design_direction_file_url",
      brand_manual: "brand_manual_url",
    }
    const path = formData[fieldMap[fileType] as keyof typeof formData]

    if (path) {
      try {
        await fetch(`/api/upload/store-files?path=${encodeURIComponent(path)}`, { method: "DELETE" })
      } catch {
        // ignore delete errors
      }
    }

    updateField(fieldMap[fileType], "")
    setFileNames((prev) => ({ ...prev, [fileType]: "" }))
  }

  async function handleSave(complete: boolean) {
    setSaving(true)
    try {
      const milestonesPayload = milestones
        .map((m) => ({ date: m.date.trim() || null, description: m.description.trim() }))
        .filter((m) => m.description.length > 0)

      const payload: Record<string, unknown> = {
        ...formData,
        price_sensitivity: formData.price_sensitivity || null,
        history_raw: formData.history_raw.trim() || null,
        milestones_raw: milestonesPayload,
        is_complete: complete,
      }

      // Send store_id if we have one, otherwise send client_id to create a new store
      if (currentStoreId) {
        payload.store_id = currentStoreId
      } else {
        payload.client_id = clientId
      }

      const res = await fetch("/api/onboarding/store-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")

      // Update local storeId if a new store was created by the API
      if (data.store_id && !currentStoreId) {
        setCurrentStoreId(data.store_id)
      }

      toast({
        title: complete ? "Formulário concluído" : "Rascunho salvo",
        description: data.message,
      })

      // Notify parent - onSave takes precedence over deprecated onComplete
      if (onSave) {
        onSave(complete)
      } else if (onComplete) {
        onComplete()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar"
      toast({ variant: "destructive", title: "Erro ao salvar", description: message })
    } finally {
      setSaving(false)
    }
  }

  function canAdvance() {
    if (currentStep === 0) {
      return formData.client_name.trim() !== "" && formData.client_email.trim() !== ""
    }
    if (currentStep === 1) {
      return formData.store_name.trim() !== "" && formData.store_url.trim() !== ""
    }
    return true
  }

  const progressPercent = ((currentStep + 1) / STEPS.length) * 100

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {hasExistingData ? "Editar Formulário de Onboarding" : "Formulário de Onboarding"}
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            Etapa {currentStep + 1} de {STEPS.length}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2 mt-2" />
        <div className="flex gap-2 mt-2">
          {STEPS.map((step, i) => {
            const canNavigate = hasExistingData || i <= currentStep
            return (
              <button
                key={i}
                onClick={() => canNavigate && setCurrentStep(i)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  i === currentStep
                    ? "bg-primary text-primary-foreground"
                    : canNavigate
                    ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step.title}
              </button>
            )
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 0: Dados Pessoais */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_name">Nome Completo *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => updateField("client_name", e.target.value)}
                  placeholder="Nome do responsável"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_email">Email *</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => updateField("client_email", e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="client_phone">Telefone</Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) => updateField("client_phone", e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_cpf_cnpj">CPF/CNPJ</Label>
                <Input
                  id="client_cpf_cnpj"
                  value={formData.client_cpf_cnpj}
                  onChange={(e) => updateField("client_cpf_cnpj", e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_company">Empresa</Label>
                <Input
                  id="client_company"
                  value={formData.client_company}
                  onChange={(e) => updateField("client_company", e.target.value)}
                  placeholder="Nome da empresa"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Dados da Loja */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="store_name">Nome da Loja *</Label>
                <Input
                  id="store_name"
                  value={formData.store_name}
                  onChange={(e) => updateField("store_name", e.target.value)}
                  placeholder="Minha Loja"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store_url">URL da Loja *</Label>
                <Input
                  id="store_url"
                  value={formData.store_url}
                  onChange={(e) => updateField("store_url", e.target.value)}
                  placeholder="minhaloja.myshopify.com"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select value={formData.platform} onValueChange={(v) => updateField("platform", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaborator_code">Código Colaborador (Shopify)</Label>
                <Input
                  id="collaborator_code"
                  value={formData.shopify_collaborator_code}
                  onChange={(e) => updateField("shopify_collaborator_code", e.target.value)}
                  placeholder="Código de acesso"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="niche">Nicho</Label>
                <Input
                  id="niche"
                  value={formData.niche}
                  onChange={(e) => updateField("niche", e.target.value)}
                  placeholder="Moda, Saúde, Eletrônicos..."
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Frete</Label>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>País</Label>
                <Select value={formData.country} onValueChange={(v) => updateField("country", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={formData.language} onValueChange={(v) => updateField("language", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Público e Marca */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target_audience">Público-Alvo</Label>
              <Textarea
                id="target_audience"
                value={formData.target_audience}
                onChange={(e) => updateField("target_audience", e.target.value)}
                placeholder="Descreva seu público-alvo: faixa etária, interesses, comportamento de compra..."
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <Label>Sensibilidade de Preço</Label>
              <RadioGroup
                value={formData.price_sensitivity}
                onValueChange={(v) => updateField("price_sensitivity", v)}
                className="grid gap-3 sm:grid-cols-3"
              >
                {[
                  { value: "price", label: "Preço", desc: "Foco em promoções e descontos" },
                  { value: "quality", label: "Qualidade", desc: "Foco em marca e exclusividade" },
                  { value: "balanced", label: "Equilibrado", desc: "Abordagem mista" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      formData.price_sensitivity === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.desc}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additional_notes">Notas Adicionais</Label>
              <Textarea
                id="additional_notes"
                value={formData.additional_notes}
                onChange={(e) => updateField("additional_notes", e.target.value)}
                placeholder="Informações extras sobre a marca, tom de voz, referências..."
                rows={4}
              />
            </div>
          </div>
        )}

        {/* Step 3: História da Loja */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="history_raw">História da Loja</Label>
              <p className="text-xs text-muted-foreground">
                Conte de onde a marca veio: quem fundou, por que, como evoluiu. Pode escrever de forma livre — vamos estruturar depois.
              </p>
              <Textarea
                id="history_raw"
                value={formData.history_raw}
                onChange={(e) => updateField("history_raw", e.target.value)}
                placeholder="Ex: Comecei em 2019 vendendo produtos artesanais no Instagram. Em 2021 abri a loja online quando percebi que o público pedia mais variedade. Hoje atendemos clientes em todo o Brasil com foco em produtos sustentáveis."
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Marcos da Operação</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setMilestones((prev) => [...prev, { date: "", description: "" }])}
                >
                  + Adicionar marco
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Eventos importantes da jornada: lançamento, primeira meta batida, expansão de catálogo, etc.
              </p>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-3">
                  Nenhum marco adicionado ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <Input
                        type="text"
                        placeholder="2021-03"
                        value={m.date}
                        onChange={(e) => {
                          const v = e.target.value
                          setMilestones((prev) => prev.map((x, i) => (i === idx ? { ...x, date: v } : x)))
                        }}
                        className="w-32"
                      />
                      <Input
                        type="text"
                        placeholder="Lançamento da loja online"
                        value={m.description}
                        onChange={(e) => {
                          const v = e.target.value
                          setMilestones((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)))
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setMilestones((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Arquivos */}
        {currentStep === 4 && (
          <div className="space-y-6">
            {/* Logo */}
            <FileUploadArea
              label="Logo da Loja"
              description="PNG, JPG, SVG ou WEBP"
              fileType="logo"
              currentPath={formData.logo_url}
              currentName={fileNames.logo}
              uploading={uploading}
              onUpload={handleFileUpload}
              onRemove={handleRemoveFile}
            />

            {/* Design Direction */}
            <div className="space-y-2">
              <Label htmlFor="design_direction">Direção de Design (texto)</Label>
              <Textarea
                id="design_direction"
                value={formData.design_direction_text}
                onChange={(e) => updateField("design_direction_text", e.target.value)}
                placeholder="Descreva o estilo visual desejado: cores, tipografia, referências..."
                rows={3}
              />
            </div>

            <FileUploadArea
              label="Referência Visual (arquivo)"
              description="PNG, JPG, PDF"
              fileType="design"
              currentPath={formData.design_direction_file_url}
              currentName={fileNames.design}
              uploading={uploading}
              onUpload={handleFileUpload}
              onRemove={handleRemoveFile}
            />

            {/* Brand Manual */}
            <FileUploadArea
              label="Manual da Marca"
              description="PDF"
              fileType="brand_manual"
              currentPath={formData.brand_manual_url}
              currentName={fileNames.brand_manual}
              uploading={uploading}
              onUpload={handleFileUpload}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            {currentStep > 0 && (
              <Button variant="secondary" onClick={() => setCurrentStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar Rascunho
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button
                onClick={() => setCurrentStep((s) => s + 1)}
                disabled={!canAdvance()}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => handleSave(true)}
                disabled={saving || !canAdvance()}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                {hasExistingData ? "Salvar Alterações" : "Concluir"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- File Upload Area Component ---
function FileUploadArea({
  label,
  description,
  fileType,
  currentPath,
  currentName,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string
  description: string
  fileType: "logo" | "design" | "brand_manual"
  currentPath: string
  currentName: string
  uploading: boolean
  onUpload: (file: File, type: "logo" | "design" | "brand_manual") => void
  onRemove: (type: "logo" | "design" | "brand_manual") => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {currentPath ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <FileText className="h-5 w-5 text-primary" />
          <span className="text-sm flex-1 truncate">{currentName || "Arquivo enviado"}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRemove(fileType)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Clique para enviar</p>
              <p className="text-xs text-muted-foreground">{description} - Max 10MB</p>
            </>
          )}
          <input
            type="file"
            className="hidden"
            accept=".png,.jpg,.jpeg,.svg,.webp,.pdf"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUpload(file, fileType)
              e.target.value = ""
            }}
          />
        </label>
      )}
    </div>
  )
}
