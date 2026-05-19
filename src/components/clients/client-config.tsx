"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Pencil,
  Check,
  X,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  Building2,
  CreditCard,
  AlertTriangle,
  Download,
  Bell,
  Settings as SettingsIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
import { toast } from "@/lib/hooks/use-toast"
import { formatDate, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { ClientPortalUsers } from "@/components/clients/client-portal-users"
import type { ClientWithRelations } from "@/components/clients/client-overview"
import { useRouter } from "next/navigation"

interface ClientConfigProps {
  client: ClientWithRelations
}

// ─── Inline editable field ────────────────────────────────

function InlineEditField({
  label,
  value,
  onSave,
  type = "text",
  placeholder,
}: {
  label: string
  value: string | null | undefined
  onSave: (newValue: string) => Promise<void>
  type?: "text" | "email" | "tel" | "url"
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (draft === (value ?? "")) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[140px_1fr_auto] gap-3 items-center py-3",
        "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
      )}
    >
      <Label className="text-[12px] text-gray-500 dark:text-[#8B92A5] font-normal">
        {label}
      </Label>
      {editing ? (
        <Input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") {
              setDraft(value ?? "")
              setEditing(false)
            }
          }}
          className="h-8 text-sm"
        />
      ) : (
        <p className="text-sm text-gray-900 dark:text-[#EAEDF3] truncate">
          {value || <span className="text-gray-400 dark:text-[#5C6378]">—</span>}
        </p>
      )}
      {editing ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setDraft(value ?? "")
              setEditing(false)
            }}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="primary"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:opacity-100"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

// ─── Custom fields ────────────────────────────────────────

function CustomFieldRow({
  fieldKey,
  value,
  onUpdate,
  onDelete,
}: {
  fieldKey: string
  value: string
  onUpdate: (newValue: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onUpdate(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[140px_1fr_auto] gap-3 items-center py-3",
        "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
      )}
    >
      <Label className="text-[12px] text-gray-500 dark:text-[#8B92A5] font-normal capitalize">
        {fieldKey.replace(/_/g, " ")}
      </Label>
      {editing ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") {
              setDraft(value)
              setEditing(false)
            }
          }}
          className="h-8 text-sm"
        />
      ) : (
        <p className="text-sm text-gray-900 dark:text-[#EAEDF3] truncate">
          {value || <span className="text-gray-400 dark:text-[#5C6378]">—</span>}
        </p>
      )}
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setDraft(value)
                setEditing(false)
              }}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="primary"
              size="icon"
              className="h-7 w-7"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#991B1B] hover:bg-[#FEF2F2]"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Config Component ────────────────────────────────

export function ClientConfig({ client }: ClientConfigProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [newFieldDialog, setNewFieldDialog] = useState(false)
  const [newFieldKey, setNewFieldKey] = useState("")
  const [newFieldValue, setNewFieldValue] = useState("")
  const [creatingField, setCreatingField] = useState(false)

  const customFields = (client.custom_fields as Record<string, unknown>) ?? {}

  // Notification preferences (stored in custom_fields.notifications)
  const notifPrefs = (customFields.notifications as Record<string, boolean>) ?? {
    alert_invoice_due: true,
    alert_churn_risk: true,
    welcome_email: false,
    upsell_sdr: true,
  }
  const [notifs, setNotifs] = useState(notifPrefs)

  const activeContract = client.contracts?.find((c) => c.status === "active")

  async function updateClient(updates: Record<string, unknown>) {
    const { error } = await supabase.from("clients").update(updates).eq("id", client.id)
    if (error) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: error.message })
      throw error
    }
    toast({ title: "Cliente atualizado" })
    router.refresh()
  }

  async function updateCustomField(key: string, value: string) {
    const updated = { ...customFields, [key]: value }
    await updateClient({ custom_fields: updated })
  }

  async function deleteCustomField(key: string) {
    const { [key]: _, ...rest } = customFields
    void _
    await updateClient({ custom_fields: rest })
  }

  async function createCustomField() {
    if (!newFieldKey.trim()) {
      toast({ variant: "destructive", title: "Nome do campo obrigatório" })
      return
    }
    const sanitizedKey = newFieldKey.trim().toLowerCase().replace(/\s+/g, "_")
    setCreatingField(true)
    try {
      await updateCustomField(sanitizedKey, newFieldValue)
      setNewFieldDialog(false)
      setNewFieldKey("")
      setNewFieldValue("")
    } finally {
      setCreatingField(false)
    }
  }

  async function updateNotificationPref(key: string, value: boolean) {
    const updated = { ...notifs, [key]: value }
    setNotifs(updated)
    const newFields = { ...customFields, notifications: updated }
    try {
      await supabase.from("clients").update({ custom_fields: newFields }).eq("id", client.id)
    } catch {
      setNotifs(notifs)
      toast({ variant: "destructive", title: "Erro ao atualizar preferência" })
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/clients/manage?id=${client.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir cliente")
      }
      toast({ title: "Cliente excluído", description: "O cliente foi excluído com sucesso." })
      router.push("/admin/clients")
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  async function handleExportData() {
    try {
      const dataExport = {
        client,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(dataExport, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cliente-${client.name.toLowerCase().replace(/\s+/g, "-")}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Dados exportados" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao exportar dados" })
    }
  }

  // Custom fields list (excluding internal/system fields)
  const displayCustomFields = Object.entries(customFields).filter(
    ([key]) =>
      !key.startsWith("asaas_") &&
      key !== "cpf_cnpj" &&
      key !== "address" &&
      key !== "notes" &&
      key !== "notifications",
  )

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Left column 3/5 — Main settings */}
      <div className="lg:col-span-3 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
              Configurações
            </h2>
            <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
              Acesso ao portal, dados cadastrais, integrações de cobrança, notificações e ações sensíveis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportData}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar dados
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/clients/${client.id}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar cliente
              </Link>
            </Button>
          </div>
        </div>

        {/* Portal Users */}
        <ClientPortalUsers clientId={client.id} clientName={client.name} />

        {/* Dados do cliente */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Dados do cliente</CardTitle>
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                Informações cadastrais sincronizadas com Asaas
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="group">
              <InlineEditField
                label="Nome completo"
                value={client.name}
                onSave={(v) => updateClient({ name: v })}
              />
            </div>
            <div className="group">
              <InlineEditField
                label="Email principal"
                value={client.email}
                onSave={(v) => updateClient({ email: v })}
                type="email"
              />
            </div>
            <div className="group">
              <InlineEditField
                label="Telefone"
                value={client.phone}
                onSave={(v) => updateClient({ phone: v })}
                type="tel"
              />
            </div>
            <div className="group">
              <InlineEditField
                label="CPF / CNPJ"
                value={client.cpf_cnpj}
                onSave={(v) => updateClient({ cpf_cnpj: v })}
              />
            </div>
            <div className="group">
              <InlineEditField
                label="Empresa"
                value={client.company}
                onSave={(v) => updateClient({ company: v })}
              />
            </div>
            <div
              className={cn(
                "grid grid-cols-[140px_1fr_auto] gap-3 items-center py-3",
                "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
              )}
            >
              <Label className="text-[12px] text-gray-500 dark:text-[#8B92A5] font-normal">
                Cliente desde
              </Label>
              <p className="text-sm text-gray-900 dark:text-[#EAEDF3]">
                {formatDate(client.created_at)}
              </p>
              <span />
            </div>
            {(customFields.asaas_customer_id as string) && (
              <div
                className={cn(
                  "grid grid-cols-[140px_1fr_auto] gap-3 items-center py-3",
                  "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
                )}
              >
                <Label className="text-[12px] text-gray-500 dark:text-[#8B92A5] font-normal">
                  ID Asaas
                </Label>
                <p className="text-sm font-mono text-gray-900 dark:text-[#EAEDF3] truncate">
                  {customFields.asaas_customer_id as string}
                </p>
                <span />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custom Fields */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Campos personalizados</CardTitle>
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                Campos customizados para uso interno
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setNewFieldDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo campo
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {displayCustomFields.length === 0 ? (
              <p className="text-[13px] text-gray-400 dark:text-[#5C6378] py-4 text-center">
                Nenhum campo personalizado.
              </p>
            ) : (
              displayCustomFields.map(([key, value]) => (
                <CustomFieldRow
                  key={key}
                  fieldKey={key}
                  value={typeof value === "object" ? JSON.stringify(value) : String(value)}
                  onUpdate={(v) => updateCustomField(key, v)}
                  onDelete={() => deleteCustomField(key)}
                />
              ))
            )}
            {client.tags && client.tags.length > 0 && (
              <div
                className={cn(
                  "grid grid-cols-[140px_1fr_auto] gap-3 items-center py-3",
                  "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
                )}
              >
                <Label className="text-[12px] text-gray-500 dark:text-[#8B92A5] font-normal">
                  Tags
                </Label>
                <div className="flex flex-wrap gap-1">
                  {client.tags.map((tag: string) => (
                    <Badge key={tag} variant="neutral" showDot={false} className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <span />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zona de perigo */}
        <Card className="rounded-[8px] border border-[#FECACA] dark:border-[rgba(252,165,165,0.3)] bg-[#FEF2F2]/40 dark:bg-[#3B1111]/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#991B1B] dark:text-[#FCA5A5]">
              Zona de perigo
            </CardTitle>
            <p className="text-[12px] text-[#991B1B]/80 dark:text-[#FCA5A5]/80 mt-0.5">
              Ações abaixo são irreversíveis ou afetam o relacionamento com o cliente. Tenha certeza antes de prosseguir.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-3 rounded-[6px] border border-[#FECACA] dark:border-[rgba(252,165,165,0.3)] bg-white dark:bg-[#1A1D27]">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
                  Excluir cliente
                </p>
                <p className="text-[12px] text-gray-500 dark:text-[#8B92A5]">
                  Remove o cliente e todos os dados relacionados permanentemente.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="border-[#FECACA] text-[#991B1B] hover:bg-[#FEF2F2]"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Excluir
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column 2/5 — Sidebar */}
      <div className="lg:col-span-2 space-y-5">
        {/* Atribuição interna */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Atribuição interna</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {client.owner ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={client.owner.avatar_url} />
                  <AvatarFallback className="bg-[#ECFDF5] dark:bg-[#0B2C24] text-[#065F46] dark:text-[#6EE7B7] text-[12px] font-semibold">
                    {getInitials(client.owner.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                    {client.owner.name}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                    CSM · responsável
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-[#5C6378]">Não atribuído</p>
            )}

            <div className="space-y-2 pt-3 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Workspace</span>
                <span className="text-[12px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                  Operacional
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Status</span>
                <span className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-semibold",
                  client.status === "active"
                    ? "text-[#065F46] dark:text-[#6EE7B7]"
                    : client.status === "onboarding"
                      ? "text-[#92400E] dark:text-[#FCD34D]"
                      : "text-gray-500 dark:text-[#8B92A5]",
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    client.status === "active"
                      ? "bg-[#10B981]"
                      : client.status === "onboarding"
                        ? "bg-[#F59E0B]"
                        : "bg-gray-400",
                  )} />
                  {client.status === "active" ? "Ativo" : client.status === "onboarding" ? "Onboarding" : client.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Plano</span>
                <span className="text-[12px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                  {activeContract?.plan_name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Health</span>
                <span className={cn(
                  "text-[12px] font-semibold tabular-nums",
                  (client.health_score ?? 50) >= 70
                    ? "text-[#065F46] dark:text-[#6EE7B7]"
                    : (client.health_score ?? 50) >= 50
                      ? "text-[#92400E] dark:text-[#FCD34D]"
                      : "text-[#991B1B] dark:text-[#FCA5A5]",
                )}>
                  {client.health_score ?? 50}/100
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" size="sm" className="flex-1" asChild>
                <Link href={`/admin/clients/${client.id}/edit`}>
                  Trocar CSM
                </Link>
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" asChild>
                <Link href={`/admin/clients/${client.id}/edit`}>
                  <SettingsIcon className="h-3.5 w-3.5 mr-1.5" />
                  Configurar
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Integrações de cobrança */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Integrações de cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "flex items-center justify-between gap-3 p-3 rounded-[6px] border",
                customFields.asaas_customer_id
                  ? "bg-[#ECFDF5]/50 dark:bg-[#0B2C24]/30 border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)]"
                  : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-[6px] bg-[#EEF0FB] dark:bg-[#141C3D] flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-[#2137B6] dark:text-[#7B8CEA]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
                    Asaas
                  </p>
                  {customFields.asaas_customer_id ? (
                    <p className="text-[10px] text-gray-500 dark:text-[#8B92A5] font-mono truncate">
                      {customFields.asaas_customer_id as string}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                      Não conectado
                    </p>
                  )}
                </div>
              </div>
              {customFields.asaas_customer_id ? (
                <Badge variant="positive" className="text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/admin/clients/${client.id}/edit`}>Conectar</Link>
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[6px] bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)] flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
                    Stripe
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                    Não configurado
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" disabled title="Em breve">
                Conectar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
                Alertar antes de vencer fatura
              </span>
              <Switch
                checked={notifs.alert_invoice_due ?? true}
                onCheckedChange={(v) => updateNotificationPref("alert_invoice_due", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
                Avisar churn risk
              </span>
              <Switch
                checked={notifs.alert_churn_risk ?? true}
                onCheckedChange={(v) => updateNotificationPref("alert_churn_risk", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
                Email de boas-vindas automático
              </span>
              <Switch
                checked={notifs.welcome_email ?? false}
                onCheckedChange={(v) => updateNotificationPref("welcome_email", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
                Notificar SDR sobre upsell
              </span>
              <Switch
                checked={notifs.upsell_sdr ?? true}
                onCheckedChange={(v) => updateNotificationPref("upsell_sdr", v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New custom field dialog */}
      <Dialog open={newFieldDialog} onOpenChange={setNewFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo campo personalizado</DialogTitle>
            <DialogDescription>
              Adicione um campo customizado para uso interno do time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="field_key">Nome do campo</Label>
              <Input
                id="field_key"
                placeholder="ex: vendedor_externo"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
              />
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">
                Usa snake_case · espaços viram underscore
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="field_value">Valor</Label>
              <Input
                id="field_value"
                placeholder="ex: João Silva"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewFieldDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={createCustomField} disabled={creatingField}>
              {creatingField && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar campo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#991B1B]" />
              Excluir cliente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{client.name}&quot;? Esta ação é
              irreversível e remove todos os dados relacionados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
