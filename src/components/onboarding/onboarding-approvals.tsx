"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Check, X, MessageSquare, Store, User, Calendar, Loader2,
  FileText, ExternalLink, ImageIcon, BookOpen, Palette,
  AlertTriangle, Pencil, Save, XCircle,
} from "lucide-react"
import Link from "next/link"
import {
  PLATFORMS, COUNTRIES, LANGUAGES, SHIPPING_TYPES, PRICE_SENSITIVITIES,
} from "@/lib/constants/onboarding"

interface PendingOnboarding {
  id: string
  client_id: string
  store_id: string
  submitted_at: string
  notes?: string
  client?: {
    id: string
    name: string
    company?: string
    email: string
    phone?: string
    cpf_cnpj?: string
  }
  store?: {
    id: string
    store_name: string
    store_url: string
    platform: string
    niche?: string
    target_audience?: string
    country?: string
    language?: string
    free_shipping_type?: string
    shopify_collaborator_code?: string
  }
  store_onboarding_data?: {
    price_sensitivity?: string
    additional_notes?: string
    logo_url?: string
    design_direction_text?: string
    brand_manual_url?: string
    visual_reference_url?: string
    is_complete?: boolean
  }
}

const countryLabel: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.value, c.label]))
const languageLabel: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]))
const freeShippingLabel: Record<string, string> = Object.fromEntries(SHIPPING_TYPES.map((s) => [s.value, s.label]))
const priceSensitivityLabel: Record<string, string> = Object.fromEntries(PRICE_SENSITIVITIES.map((p) => [p.value, p.label]))
const platformLabel: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]))

// Editable field component
function EditableField({
  label,
  value,
  fieldKey,
  editingFields,
  editValues,
  savedFields,
  onEdit,
  onChange,
  type = "text",
  options,
  className,
}: {
  label: string
  value: string
  fieldKey: string
  editingFields: Set<string>
  editValues: Record<string, string>
  savedFields: Set<string>
  onEdit: (key: string) => void
  onChange: (key: string, value: string) => void
  type?: "text" | "select" | "textarea"
  options?: readonly { value: string; label: string }[]
  className?: string
}) {
  const isEditing = editingFields.has(fieldKey)
  const isSaved = savedFields.has(fieldKey)
  const displayValue = fieldKey in editValues ? editValues[fieldKey] : value

  if (isEditing) {
    if (type === "select" && options) {
      return (
        <div className={className}>
          <span className="text-muted-foreground text-xs">{label}</span>
          <Select value={displayValue} onValueChange={(v) => onChange(fieldKey, v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }
    if (type === "textarea") {
      return (
        <div className={className}>
          <span className="text-muted-foreground text-xs">{label}</span>
          <Textarea
            value={displayValue}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
      )
    }
    return (
      <div className={className}>
        <span className="text-muted-foreground text-xs">{label}</span>
        <Input
          value={displayValue}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    )
  }

  return (
    <div className={`group relative ${className || ""}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <p className={type === "text" ? "truncate" : ""}>{displayValue || "-"}</p>
        {isSaved && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-blue-600 border-blue-300">Editado</Badge>}
        <button
          type="button"
          onClick={() => onEdit(fieldKey)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          title={`Editar ${label}`}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

export function OnboardingApprovals() {
  const { toast } = useToast()
  const [onboardings, setOnboardings] = useState<PendingOnboarding[]>([])
  const [loading, setLoading] = useState(true)
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    onboarding?: PendingOnboarding
    action?: "approved" | "rejected" | "revision_requested"
  }>({ open: false })
  const [comments, setComments] = useState("")
  const [processing, setProcessing] = useState(false)

  // Edit state per onboarding
  const [editingFields, setEditingFields] = useState<Record<string, Set<string>>>({})
  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({})
  const [savedFields, setSavedFields] = useState<Record<string, Set<string>>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/pending-approval")
      const data = await response.json()
      if (response.ok) {
        setOnboardings(data.onboardings || [])
      }
    } catch (error) {
      console.error("Error fetching pending approvals:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleAction = async () => {
    if (!actionDialog.onboarding || !actionDialog.action) return

    setProcessing(true)
    try {
      const response = await fetch(`/api/onboarding/${actionDialog.onboarding.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionDialog.action,
          comments: comments || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar")
      }

      toast({
        title: actionDialog.action === "approved" ? "Aprovado!" : "Ação realizada",
        description: data.message,
      })

      setActionDialog({ open: false })
      setComments("")
      fetchPending()
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao processar",
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
    }
  }

  const openAction = (onboarding: PendingOnboarding, action: "approved" | "rejected" | "revision_requested") => {
    setActionDialog({ open: true, onboarding, action })
    setComments("")
  }

  // Edit handlers
  const startEdit = (onbId: string, fieldKey: string, currentValue: string) => {
    setEditingFields((prev) => {
      const fields = new Set(prev[onbId] || [])
      fields.add(fieldKey)
      return { ...prev, [onbId]: fields }
    })
    setEditValues((prev) => ({
      ...prev,
      [onbId]: { ...prev[onbId], [fieldKey]: currentValue || "" },
    }))
  }

  const updateEditValue = (onbId: string, fieldKey: string, value: string) => {
    setEditValues((prev) => ({
      ...prev,
      [onbId]: { ...prev[onbId], [fieldKey]: value },
    }))
  }

  const cancelEdit = (onbId: string) => {
    setEditingFields((prev) => ({ ...prev, [onbId]: new Set() }))
    setEditValues((prev) => ({ ...prev, [onbId]: {} }))
  }

  const getChangedFields = (onb: PendingOnboarding): Record<string, string> => {
    const values = editValues[onb.id] || {}
    const changes: Record<string, string> = {}

    for (const [key, newValue] of Object.entries(values)) {
      // Get original value
      let originalValue = ""
      if (key === "name") originalValue = onb.client?.name || ""
      else if (key === "email") originalValue = onb.client?.email || ""
      else if (key === "phone") originalValue = onb.client?.phone || ""
      else if (key === "cpf_cnpj") originalValue = onb.client?.cpf_cnpj || ""
      else if (key === "store_name") originalValue = onb.store?.store_name || ""
      else if (key === "store_url") originalValue = onb.store?.store_url || ""
      else if (key === "platform") originalValue = onb.store?.platform || ""
      else if (key === "niche") originalValue = onb.store?.niche || ""
      else if (key === "country") originalValue = onb.store?.country || ""
      else if (key === "language") originalValue = onb.store?.language || ""
      else if (key === "target_audience") originalValue = onb.store?.target_audience || ""
      else if (key === "free_shipping_type") originalValue = onb.store?.free_shipping_type || ""
      else if (key === "shopify_collaborator_code") originalValue = onb.store?.shopify_collaborator_code || ""
      else if (key === "price_sensitivity") originalValue = onb.store_onboarding_data?.price_sensitivity || ""
      else if (key === "additional_notes") originalValue = onb.store_onboarding_data?.additional_notes || ""
      else if (key === "design_direction_text") originalValue = onb.store_onboarding_data?.design_direction_text || ""

      if (newValue !== originalValue) {
        changes[key] = newValue
      }
    }
    return changes
  }

  const saveEdits = async (onb: PendingOnboarding) => {
    const changes = getChangedFields(onb)
    if (Object.keys(changes).length === 0) {
      cancelEdit(onb.id)
      return
    }

    setSaving(onb.id)
    try {
      const response = await fetch(`/api/onboarding/${onb.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar")
      }

      // Update local state with new values
      setSavedFields((prev) => {
        const fields = new Set(prev[onb.id] || [])
        for (const key of Object.keys(changes)) fields.add(key)
        return { ...prev, [onb.id]: fields }
      })

      // Clear editing state
      setEditingFields((prev) => ({ ...prev, [onb.id]: new Set() }))

      // Refresh to get updated data
      fetchPending()

      toast({
        title: "Salvo",
        description: data.message || "Alterações salvas",
      })
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar alterações",
        variant: "destructive",
      })
    } finally {
      setSaving(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Helper to get the resolved display value (edit value or original)
  const getFieldValue = (onbId: string, fieldKey: string, originalValue: string) => {
    const values = editValues[onbId]
    if (values && fieldKey in values) return values[fieldKey]
    return originalValue
  }

  // Helper to get label from maps
  const resolveLabel = (value: string, map: Record<string, string>) => map[value] || value || "-"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (onboardings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <Check className="h-12 w-12 mb-2" />
        <p className="text-lg font-medium">Nenhuma aprovação pendente</p>
        <p className="text-sm">Todos os formulários foram processados</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Aprovações Pendentes</h3>
        <Badge variant="secondary">{onboardings.length} pendente{onboardings.length > 1 ? "s" : ""}</Badge>
      </div>

      {onboardings.map((onb) => {
        const onbEditing = editingFields[onb.id] || new Set<string>()
        const onbEditValues = editValues[onb.id] || {}
        const onbSavedFields = savedFields[onb.id] || new Set<string>()
        const hasEdits = onbEditing.size > 0
        const changes = hasEdits ? getChangedFields(onb) : {}
        const hasChanges = Object.keys(changes).length > 0
        const isSaving = saving === onb.id

        const editField = (key: string) => {
          // Get current value based on field
          let currentValue = ""
          if (key === "name") currentValue = onb.client?.name || ""
          else if (key === "email") currentValue = onb.client?.email || ""
          else if (key === "phone") currentValue = onb.client?.phone || ""
          else if (key === "cpf_cnpj") currentValue = onb.client?.cpf_cnpj || ""
          else if (key === "store_name") currentValue = onb.store?.store_name || ""
          else if (key === "store_url") currentValue = onb.store?.store_url || ""
          else if (key === "platform") currentValue = onb.store?.platform || ""
          else if (key === "niche") currentValue = onb.store?.niche || ""
          else if (key === "country") currentValue = onb.store?.country || ""
          else if (key === "language") currentValue = onb.store?.language || ""
          else if (key === "target_audience") currentValue = onb.store?.target_audience || ""
          else if (key === "free_shipping_type") currentValue = onb.store?.free_shipping_type || ""
          else if (key === "shopify_collaborator_code") currentValue = onb.store?.shopify_collaborator_code || ""
          else if (key === "price_sensitivity") currentValue = onb.store_onboarding_data?.price_sensitivity || ""
          else if (key === "additional_notes") currentValue = onb.store_onboarding_data?.additional_notes || ""
          else if (key === "design_direction_text") currentValue = onb.store_onboarding_data?.design_direction_text || ""

          startEdit(onb.id, key, currentValue)
        }

        const fieldProps = (key: string) => ({
          fieldKey: key,
          editingFields: onbEditing,
          editValues: onbEditValues,
          savedFields: onbSavedFields,
          onEdit: editField,
          onChange: (k: string, v: string) => updateEditValue(onb.id, k, v),
        })

        return (
          <Card key={onb.id} className="border-l-4 border-l-orange-400">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    {onb.store?.store_name || "Loja sem nome"}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <User className="h-3 w-3" />
                    {onb.client?.name} {onb.client?.company ? `(${onb.client.company})` : ""}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(onb.submitted_at)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dados do Cliente */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados do Cliente</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <EditableField
                    label="Nome"
                    value={onb.client?.name || ""}
                    {...fieldProps("name")}
                  />
                  <EditableField
                    label="Email"
                    value={onb.client?.email || ""}
                    {...fieldProps("email")}
                  />
                  <EditableField
                    label="Telefone"
                    value={onb.client?.phone || ""}
                    {...fieldProps("phone")}
                  />
                  <EditableField
                    label="CPF/CNPJ"
                    value={onb.client?.cpf_cnpj || ""}
                    {...fieldProps("cpf_cnpj")}
                  />
                </div>
              </div>

              {/* Dados da Loja */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados da Loja</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                  <EditableField
                    label="Nome da Loja"
                    value={onb.store?.store_name || ""}
                    {...fieldProps("store_name")}
                  />
                  <EditableField
                    label="Plataforma"
                    value={resolveLabel(
                      getFieldValue(onb.id, "platform", onb.store?.platform || ""),
                      platformLabel
                    )}
                    {...fieldProps("platform")}
                    type="select"
                    options={PLATFORMS}
                  />
                  <EditableField
                    label="Nicho"
                    value={onb.store?.niche || ""}
                    {...fieldProps("niche")}
                  />
                  <EditableField
                    label="País"
                    value={resolveLabel(
                      getFieldValue(onb.id, "country", onb.store?.country || ""),
                      countryLabel
                    )}
                    {...fieldProps("country")}
                    type="select"
                    options={COUNTRIES}
                  />
                  <EditableField
                    label="Idioma"
                    value={resolveLabel(
                      getFieldValue(onb.id, "language", onb.store?.language || ""),
                      languageLabel
                    )}
                    {...fieldProps("language")}
                    type="select"
                    options={LANGUAGES}
                  />
                  <EditableField
                    label="Frete"
                    value={resolveLabel(
                      getFieldValue(onb.id, "free_shipping_type", onb.store?.free_shipping_type || ""),
                      freeShippingLabel
                    )}
                    {...fieldProps("free_shipping_type")}
                    type="select"
                    options={SHIPPING_TYPES}
                  />
                  <EditableField
                    label="Código Colaborador"
                    value={onb.store?.shopify_collaborator_code || ""}
                    {...fieldProps("shopify_collaborator_code")}
                  />
                  <EditableField
                    label="URL"
                    value={onb.store?.store_url || ""}
                    {...fieldProps("store_url")}
                    className="col-span-2"
                  />
                </div>
              </div>

              {/* Público e Marca */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Público e Marca</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <EditableField
                    label="Público-alvo"
                    value={onb.store?.target_audience || ""}
                    {...fieldProps("target_audience")}
                    type="textarea"
                  />
                  <EditableField
                    label="Sensibilidade de preço"
                    value={resolveLabel(
                      getFieldValue(onb.id, "price_sensitivity", onb.store_onboarding_data?.price_sensitivity || ""),
                      priceSensitivityLabel
                    )}
                    {...fieldProps("price_sensitivity")}
                    type="select"
                    options={PRICE_SENSITIVITIES}
                  />
                  <EditableField
                    label="Direção de design"
                    value={onb.store_onboarding_data?.design_direction_text || ""}
                    {...fieldProps("design_direction_text")}
                    type="textarea"
                  />
                  <EditableField
                    label="Notas adicionais"
                    value={onb.store_onboarding_data?.additional_notes || ""}
                    {...fieldProps("additional_notes")}
                    type="textarea"
                  />
                </div>
              </div>

              {/* Arquivos */}
              {(onb.store_onboarding_data?.logo_url || onb.store_onboarding_data?.brand_manual_url || onb.store_onboarding_data?.visual_reference_url) && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Arquivos</h4>
                  <div className="flex flex-wrap gap-2">
                    {onb.store_onboarding_data?.logo_url && (
                      <a href={onb.store_onboarding_data.logo_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Logo
                          <ExternalLink className="h-3 w-3" />
                        </Badge>
                      </a>
                    )}
                    {onb.store_onboarding_data?.brand_manual_url && (
                      <a href={onb.store_onboarding_data.brand_manual_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                          <BookOpen className="h-3 w-3" />
                          Manual da Marca
                          <ExternalLink className="h-3 w-3" />
                        </Badge>
                      </a>
                    )}
                    {onb.store_onboarding_data?.visual_reference_url && (
                      <a href={onb.store_onboarding_data.visual_reference_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                          <Palette className="h-3 w-3" />
                          Referência Visual
                          <ExternalLink className="h-3 w-3" />
                        </Badge>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Notas do formulário */}
              {onb.notes && (
                <div className="p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                  <FileText className="h-3 w-3 inline mr-1" />
                  {onb.notes}
                </div>
              )}

              {/* Edit action bar */}
              {hasEdits && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-dashed border-blue-300">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelEdit(onb.id)}
                    disabled={isSaving}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar Edição
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveEdits(onb)}
                    disabled={isSaving || !hasChanges}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar Alterações
                  </Button>
                </div>
              )}

            {/* Arquivos */}
            {(onb.store_onboarding_data?.logo_url || onb.store_onboarding_data?.brand_manual_url || onb.store_onboarding_data?.visual_reference_url) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Arquivos</h4>
                <div className="flex flex-wrap gap-2">
                  {onb.store_onboarding_data?.logo_url && (
                    <a href={onb.store_onboarding_data.logo_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                        <ImageIcon className="h-3 w-3" />
                        Logo
                        <ExternalLink className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                  {onb.store_onboarding_data?.brand_manual_url && (
                    <a href={onb.store_onboarding_data.brand_manual_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                        <BookOpen className="h-3 w-3" />
                        Manual da Marca
                        <ExternalLink className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                  {onb.store_onboarding_data?.visual_reference_url && (
                    <a href={onb.store_onboarding_data.visual_reference_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-muted gap-1">
                        <Palette className="h-3 w-3" />
                        Referência Visual
                        <ExternalLink className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Notas do formulário */}
            {onb.notes && (
              <div className="p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                <FileText className="h-3 w-3 inline mr-1" />
                {onb.notes}
              </div>
            )}

            {/* Formulário status + Ações */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                {onb.store_onboarding_data?.is_complete ? (
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">Formulário Completo</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Formulário Parcial</Badge>
                )}
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/admin/stores/${onb.store_id}`}>
                    <Store className="h-4 w-4 mr-1" />
                    Ver Loja
                  </Link>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openAction(onb, "approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Check className="h-4 w-4 mr-1" />
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAction(onb, "revision_requested")}>
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Revisão
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openAction(onb, "rejected")}>
                  <X className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Action confirmation dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "approved" && "Aprovar Onboarding"}
              {actionDialog.action === "rejected" && "Rejeitar Onboarding"}
              {actionDialog.action === "revision_requested" && "Solicitar Revisão"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "approved"
                ? "Ao aprovar, a geração de copies será iniciada automaticamente no N8N."
                : "O cliente será notificado sobre esta decisão."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <span className="font-medium">Cliente:</span> {actionDialog.onboarding?.client?.name}
              <br />
              <span className="font-medium">Loja:</span> {actionDialog.onboarding?.store?.store_name}
            </div>

            {/* AC 37.1.4: Warning de delecao para rejeicao/revisao (ambos deletam dados) */}
            {(actionDialog.action === "rejected" || actionDialog.action === "revision_requested") && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Esta ação irá apagar todos os dados do formulário. O cliente precisará preencher novamente.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="approval-comments" className="text-sm font-medium">
                Comentários {actionDialog.action !== "approved" ? "(obrigatório)" : "(opcional)"}
              </label>
              <Textarea
                id="approval-comments"
                aria-required={actionDialog.action !== "approved"}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                maxLength={2000}
                placeholder={
                  actionDialog.action === "approved"
                    ? "Comentários opcionais..."
                    : "Descreva o motivo ou os ajustes necessários..."
                }
                rows={3}
              />
              {/* AC 37.1.7: Contador de caracteres */}
              <p className="text-xs text-muted-foreground text-right">
                {comments.length}/2000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionDialog.action !== "approved" && !comments.trim())}
              variant={actionDialog.action === "rejected" ? "destructive" : "default"}
              className={
                actionDialog.action === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {/* AC 37.1.5 + 37.1.6: Texto especifico por acao */}
              {actionDialog.action === "approved" && "Confirmar Aprovação"}
              {actionDialog.action === "rejected" && "Rejeitar Onboarding"}
              {actionDialog.action === "revision_requested" && "Solicitar Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
