"use client"

import { useState, useCallback } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import {
  Loader2,
  Link2,
  TrendingUp,
  Plus,
  Copy,
  Pencil,
  Trash2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrencyCompact, formatPercent } from "@/lib/utils/format"
import { toast } from "@/lib/hooks/use-toast"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UtmConversions {
  totalOrdersWithUtm: number
  utmTrackingRate: number
  bySource: Array<{ source: string; orders: number; revenue: number }>
  byMedium: Array<{ medium: string; orders: number; revenue: number }>
  byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
}

interface UtmTemplate {
  id: string
  name: string
  description: string | null
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string | null
  utm_term: string | null
  is_active: boolean
  usage_count: number
  created_at: string
  generatedUrl: string | null
}

interface StoreUtmTabProps {
  storeId: string
  storeUrl?: string | null
  period: "7d" | "30d" | "90d" | "all" | "custom"
  customDates?: CustomDateRange
  currency?: string
}

interface TemplateFormData {
  name: string
  description: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  utm_term: string
}

const EMPTY_FORM: TemplateFormData = {
  name: "",
  description: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

function buildReportUrl(storeId: string, period: string, customDates?: CustomDateRange): string {
  let url = `/api/integrations/shopify/report?store_id=${storeId}&period=${period}`
  if (period === "custom" && customDates) {
    url += `&start_date=${customDates.startDate}&end_date=${customDates.endDate}`
  }
  return url
}

function generatePreviewUrl(
  storeUrl: string | null | undefined,
  form: TemplateFormData
): string | null {
  if (!storeUrl || !form.utm_source || !form.utm_medium || !form.utm_campaign) return null
  try {
    const url = new URL(storeUrl.replace(/\/+$/, ""))
    url.searchParams.set("utm_source", form.utm_source)
    url.searchParams.set("utm_medium", form.utm_medium)
    url.searchParams.set("utm_campaign", form.utm_campaign)
    if (form.utm_content) url.searchParams.set("utm_content", form.utm_content)
    if (form.utm_term) url.searchParams.set("utm_term", form.utm_term)
    return url.toString()
  } catch {
    return null
  }
}

function hasSpaces(value: string): boolean {
  return value.trim().includes(" ")
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StoreUtmTab({ storeId, storeUrl, period, customDates, currency = "BRL" }: StoreUtmTabProps) {
  const [activeSubTab, setActiveSubTab] = useState("source")

  // UTM conversion data (existing report)
  const { data, isLoading } = useSWR(
    buildReportUrl(storeId, period, customDates),
    fetcher,
    { revalidateOnFocus: false }
  )

  // UTM templates
  const templatesKey = `/api/stores/${storeId}/utm-templates`
  const { data: templatesData, isLoading: templatesLoading } = useSWR(
    templatesKey,
    fetcher,
    { revalidateOnFocus: false }
  )

  const utmData: UtmConversions | null = data?.orders?.utmConversions ?? null
  const templates: UtmTemplate[] = templatesData?.templates ?? []

  return (
    <div className="space-y-8">
      {/* --- Templates Section --- */}
      <UtmTemplatesSection
        storeId={storeId}
        storeUrl={storeUrl}
        templates={templates}
        isLoading={templatesLoading}
        templatesKey={templatesKey}
      />

      {/* --- UTM Conversions Section --- */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Conversoes UTM</h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !utmData || utmData.totalOrdersWithUtm === 0 ? (
          <Card className="rounded-[8px]">
            <CardContent className="py-16 text-center">
              <Link2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">Nenhum dado UTM encontrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Os pedidos deste periodo nao possuem parametros UTM nas URLs de origem.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="rounded-[8px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Pedidos com UTM
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{utmData.totalOrdersWithUtm}</span>
                    <Badge variant="neutral" className="text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {formatPercent(utmData.utmTrackingRate)} do total
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[8px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Taxa de Rastreio UTM
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {formatPercent(utmData.utmTrackingRate)}
                    </span>
                    <span className="text-sm text-muted-foreground">dos pedidos rastreados</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sub-tabs */}
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList>
                <TabsTrigger value="source">Source</TabsTrigger>
                <TabsTrigger value="medium">Medium</TabsTrigger>
                <TabsTrigger value="campaign">Campaign</TabsTrigger>
              </TabsList>

              <TabsContent value="source">
                <UtmTable
                  data={utmData.bySource.map((item) => ({
                    name: item.source,
                    orders: item.orders,
                    revenue: item.revenue,
                  }))}
                  columnLabel="Source"
                  currency={currency}
                />
              </TabsContent>

              <TabsContent value="medium">
                <UtmTable
                  data={utmData.byMedium.map((item) => ({
                    name: item.medium,
                    orders: item.orders,
                    revenue: item.revenue,
                  }))}
                  columnLabel="Medium"
                  currency={currency}
                />
              </TabsContent>

              <TabsContent value="campaign">
                <UtmTable
                  data={utmData.byCampaign.map((item) => ({
                    name: item.campaign,
                    orders: item.orders,
                    revenue: item.revenue,
                  }))}
                  currency={currency}
                  columnLabel="Campaign"
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Templates Section
// ---------------------------------------------------------------------------

function UtmTemplatesSection({
  storeId,
  storeUrl,
  templates,
  isLoading,
  templatesKey,
}: {
  storeId: string
  storeUrl?: string | null
  templates: UtmTemplate[]
  isLoading: boolean
  templatesKey: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<UtmTemplate | null>(null)
  const [deleteTemplate, setDeleteTemplate] = useState<UtmTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleCreate = useCallback(() => {
    setEditingTemplate(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((template: UtmTemplate) => {
    setEditingTemplate(template)
    setDialogOpen(true)
  }, [])

  const handleCopyLink = useCallback(
    async (template: UtmTemplate) => {
      if (!template.generatedUrl) {
        toast({
          variant: "destructive",
          title: "URL nao disponivel",
          description: "Configure a URL da loja para gerar links UTM.",
        })
        return
      }

      try {
        await navigator.clipboard.writeText(template.generatedUrl)

        // Increment usage_count via PATCH
        await fetch(`/api/stores/${storeId}/utm-templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ increment_usage: true }),
        })

        globalMutate(templatesKey)

        toast({
          title: "Link copiado!",
          description: "URL com parametros UTM copiada para a area de transferencia.",
        })
      } catch {
        toast({
          variant: "destructive",
          title: "Erro ao copiar",
          description: "Nao foi possivel copiar o link.",
        })
      }
    },
    [storeId, templatesKey]
  )

  const handleSave = useCallback(
    async (formData: TemplateFormData) => {
      setSaving(true)
      try {
        const url = editingTemplate
          ? `/api/stores/${storeId}/utm-templates/${editingTemplate.id}`
          : `/api/stores/${storeId}/utm-templates`

        const method = editingTemplate ? "PATCH" : "POST"

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })

        const result = await res.json()

        if (!res.ok) {
          throw new Error(result.error || "Erro ao salvar template")
        }

        globalMutate(templatesKey)
        setDialogOpen(false)
        setEditingTemplate(null)

        toast({
          title: editingTemplate ? "Template atualizado" : "Template criado",
          description: `Template "${formData.name}" salvo com sucesso.`,
        })
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Erro ao salvar",
          description: err instanceof Error ? err.message : "Erro desconhecido",
        })
      } finally {
        setSaving(false)
      }
    },
    [storeId, editingTemplate, templatesKey]
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTemplate) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/stores/${storeId}/utm-templates/${deleteTemplate.id}`,
        { method: "DELETE" }
      )

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Erro ao excluir template")
      }

      globalMutate(templatesKey)
      setDeleteTemplate(null)

      toast({
        title: "Template excluido",
        description: `Template "${deleteTemplate.name}" foi removido.`,
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setDeleting(false)
    }
  }, [storeId, deleteTemplate, templatesKey])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Templates de UTM</h3>
          <p className="text-sm text-muted-foreground">
            Crie templates reutilizaveis para gerar links com parametros UTM.
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo Template
        </Button>
      </div>

      {/* Warning if store_url is missing */}
      {!storeUrl && (
        <Card className="rounded-[8px] border-yellow-500/50 bg-yellow-500/5 mb-4">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Configure a URL da loja nas configuracoes para gerar links UTM.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="rounded-[8px]">
          <CardContent className="py-12 text-center">
            <Link2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhum template criado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Crie seu primeiro template para padronizar os links UTM.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-[8px]">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Medium</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-center">Usos</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium max-w-[200px]">
                      <div className="truncate">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {t.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" showDot={false} className="text-xs font-mono">
                        {t.utm_source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" showDot={false} className="text-xs font-mono">
                        {t.utm_medium}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" showDot={false} className="text-xs font-mono">
                        {t.utm_campaign}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{t.usage_count}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={t.is_active ? "info" : "neutral"} className="text-xs">
                        {t.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleCopyLink(t)}
                          title="Copiar link"
                          disabled={!t.generatedUrl}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(t)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteTemplate(t)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <UtmTemplateDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingTemplate(null)
        }}
        template={editingTemplate}
        storeUrl={storeUrl}
        onSave={handleSave}
        saving={saving}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTemplate}
        onOpenChange={(open) => {
          if (!open) setDeleteTemplate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o template &quot;{deleteTemplate?.name}&quot;? Esta acao
              nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template Form Dialog
// ---------------------------------------------------------------------------

function UtmTemplateDialog({
  open,
  onOpenChange,
  template,
  storeUrl,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: UtmTemplate | null
  storeUrl?: string | null
  onSave: (data: TemplateFormData) => Promise<void>
  saving: boolean
}) {
  const [form, setForm] = useState<TemplateFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof TemplateFormData, string>>>({})

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      if (template) {
        setForm({
          name: template.name,
          description: template.description || "",
          utm_source: template.utm_source,
          utm_medium: template.utm_medium,
          utm_campaign: template.utm_campaign,
          utm_content: template.utm_content || "",
          utm_term: template.utm_term || "",
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
    }
    onOpenChange(isOpen)
  }

  const updateField = (field: keyof TemplateFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TemplateFormData, string>> = {}

    if (!form.name.trim()) newErrors.name = "Nome e obrigatorio"
    if (!form.utm_source.trim()) newErrors.utm_source = "Source e obrigatorio"
    if (!form.utm_medium.trim()) newErrors.utm_medium = "Medium e obrigatorio"
    if (!form.utm_campaign.trim()) newErrors.utm_campaign = "Campaign e obrigatorio"

    // Check for spaces in UTM values
    if (form.utm_source && hasSpaces(form.utm_source))
      newErrors.utm_source = "Nao pode conter espacos"
    if (form.utm_medium && hasSpaces(form.utm_medium))
      newErrors.utm_medium = "Nao pode conter espacos"
    if (form.utm_campaign && hasSpaces(form.utm_campaign))
      newErrors.utm_campaign = "Nao pode conter espacos"
    if (form.utm_content && hasSpaces(form.utm_content))
      newErrors.utm_content = "Nao pode conter espacos"
    if (form.utm_term && hasSpaces(form.utm_term)) newErrors.utm_term = "Nao pode conter espacos"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    await onSave(form)
  }

  const previewUrl = generatePreviewUrl(storeUrl, form)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Editar Template" : "Novo Template UTM"}</DialogTitle>
          <DialogDescription>
            {template
              ? "Atualize os dados do template de UTM."
              : "Crie um template reutilizavel com parametros UTM."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-name">Nome *</Label>
            <Input
              id="utm-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Ex: Campanha Black Friday"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-desc">Descricao</Label>
            <Input
              id="utm-desc"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Descricao opcional do template"
            />
          </div>

          {/* UTM Source */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-source">UTM Source *</Label>
            <Input
              id="utm-source"
              value={form.utm_source}
              onChange={(e) => updateField("utm_source", e.target.value)}
              placeholder="Ex: klaviyo, google, facebook"
            />
            {errors.utm_source && <p className="text-xs text-destructive">{errors.utm_source}</p>}
          </div>

          {/* UTM Medium */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-medium">UTM Medium *</Label>
            <Input
              id="utm-medium"
              value={form.utm_medium}
              onChange={(e) => updateField("utm_medium", e.target.value)}
              placeholder="Ex: email, cpc, social"
            />
            {errors.utm_medium && <p className="text-xs text-destructive">{errors.utm_medium}</p>}
          </div>

          {/* UTM Campaign */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-campaign">UTM Campaign *</Label>
            <Input
              id="utm-campaign"
              value={form.utm_campaign}
              onChange={(e) => updateField("utm_campaign", e.target.value)}
              placeholder="Ex: black-friday-2024, welcome-series"
            />
            {errors.utm_campaign && (
              <p className="text-xs text-destructive">{errors.utm_campaign}</p>
            )}
          </div>

          {/* UTM Content */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-content">UTM Content</Label>
            <Input
              id="utm-content"
              value={form.utm_content}
              onChange={(e) => updateField("utm_content", e.target.value)}
              placeholder="Ex: hero-banner, cta-button"
            />
            {errors.utm_content && (
              <p className="text-xs text-destructive">{errors.utm_content}</p>
            )}
          </div>

          {/* UTM Term */}
          <div className="space-y-1.5">
            <Label htmlFor="utm-term">UTM Term</Label>
            <Input
              id="utm-term"
              value={form.utm_term}
              onChange={(e) => updateField("utm_term", e.target.value)}
              placeholder="Ex: desconto, frete-gratis"
            />
            {errors.utm_term && <p className="text-xs text-destructive">{errors.utm_term}</p>}
          </div>

          {/* URL Preview */}
          {storeUrl ? (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Preview da URL</Label>
              {previewUrl ? (
                <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-2">
                  <ExternalLink className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs font-mono break-all text-muted-foreground">{previewUrl}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Preencha os campos obrigatorios para visualizar a URL.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                URL da loja nao configurada. O preview nao esta disponivel.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Salvando...
              </>
            ) : template ? (
              "Salvar"
            ) : (
              "Criar Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// UTM Conversions Table (existing)
// ---------------------------------------------------------------------------

function UtmTable({
  data,
  columnLabel,
  currency = "BRL",
}: {
  data: Array<{ name: string; orders: number; revenue: number }>
  columnLabel: string
  currency?: string
}) {
  if (!data || data.length === 0) {
    return (
      <Card className="rounded-[8px]">
        <CardContent className="py-10 text-center text-muted-foreground">
          Nenhum dado para esta dimensao.
        </CardContent>
      </Card>
    )
  }

  const sorted = [...data].sort((a, b) => b.orders - a.orders)

  return (
    <Card className="rounded-[8px]">
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead>{columnLabel}</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item, index) => (
              <TableRow key={item.name}>
                <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium max-w-[300px] truncate">
                  {item.name || "(vazio)"}
                </TableCell>
                <TableCell className="text-right">
                  {item.orders.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrencyCompact(item.revenue, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
