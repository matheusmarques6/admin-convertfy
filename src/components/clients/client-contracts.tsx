"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, FileText, Calendar, Loader2, Upload, X, Paperclip, ExternalLink } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"
import { centsToReais } from "@/lib/currency"
import { CurrencyInput } from "@/components/ui/currency-input"
import { toast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import type { Contract } from "@/types"

interface ClientContractsProps {
  clientId: string
}


interface ContractFormData {
  plan_name: string
  monthly_value: number
  start_date: string
  end_date: string
  status: string
  notes: string
}

export function ClientContracts({ clientId }: ClientContractsProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<ContractFormData>({
    plan_name: "",
    monthly_value: 0,
    start_date: "",
    end_date: "",
    status: "active",
    notes: "",
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadContracts() {
    const supabase = createClient()
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50)
    setContracts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadContracts()
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeContract = contracts.find((c) => c.status === "active")
  const pastContracts = contracts.filter((c) => c.status !== "active")

  function handleOpenDialog() {
    setFormData({
      plan_name: "",
      monthly_value: 0,
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      status: "active",
      notes: "",
    })
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    setShowDialog(true)
  }

  function handleFileSelect(file: File) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (![".pdf", ".doc", ".docx"].includes(ext)) {
      toast({ variant: "destructive", title: "Tipo de arquivo não permitido. Use PDF, DOC ou DOCX." })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Arquivo muito grande. Máximo: 10MB." })
      return
    }
    setSelectedFile(file)
  }

  function handleRemoveFile() {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleCreateContract() {
    if (!formData.plan_name.trim()) {
      toast({ variant: "destructive", title: "Nome do plano é obrigatório" })
      return
    }
    if (formData.monthly_value <= 0) {
      toast({ variant: "destructive", title: "Valor mensal inválido" })
      return
    }
    if (!formData.start_date) {
      toast({ variant: "destructive", title: "Data de início é obrigatória" })
      return
    }

    setSaving(true)
    try {
      // Upload file first if selected
      let documentPath: string | null = null
      if (selectedFile) {
        const uploadBody = new FormData()
        uploadBody.append("file", selectedFile)
        uploadBody.append("client_id", clientId)

        const uploadResponse = await fetch("/api/upload/contracts", {
          method: "POST",
          body: uploadBody,
        })

        const uploadResult = await uploadResponse.json()

        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || "Erro ao fazer upload do arquivo")
        }

        documentPath = uploadResult.path
      }

      // Create contract with file path (not signed URL)
      const response = await fetch("/api/clients/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          plan_name: formData.plan_name.trim(),
          monthly_value: centsToReais(formData.monthly_value),
          start_date: formData.start_date,
          end_date: formData.end_date || null,
          status: formData.status,
          notes: formData.notes.trim() || null,
          document_url: documentPath,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao criar contrato")
      }

      toast({ title: "Contrato criado com sucesso!" })
      setShowDialog(false)
      await loadContracts()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao criar contrato",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleViewDocument(storagePath: string) {
    setDownloadingDoc(storagePath)
    try {
      const response = await fetch(`/api/upload/contracts?path=${encodeURIComponent(storagePath)}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao gerar URL do documento")
      }

      const url = result.url
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao abrir documento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setDownloadingDoc(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Icon icon={Loader2} size={24} className="animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  function renderDocumentButton(contract: Contract) {
    if (!contract.document_url) return null
    const isDownloading = downloadingDoc === contract.document_url
    return (
      <div className="pt-4 border-t">
        <Button
          variant="secondary"
          size="sm"
          disabled={isDownloading}
          onClick={() => handleViewDocument(contract.document_url!)}
        >
          {isDownloading ? (
            <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
          ) : (
            <Icon icon={ExternalLink} size={16} className="mr-2" />
          )}
          {isDownloading ? "Gerando link..." : "Ver Documento"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Contract */}
      {activeContract ? (
        <Card className="rounded-xl border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Contrato Ativo</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {activeContract.plan_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status="active" />
              <Button variant="secondary" size="sm" onClick={handleOpenDialog}>
                <Icon icon={Plus} size={16} className="mr-2" />
                Novo Contrato
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Valor Mensal</p>
                <p className="text-xl font-semibold text-foreground">
                  {formatCurrency(activeContract.monthly_value)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="text-sm font-medium">
                  {formatDate(activeContract.start_date)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Término</p>
                <p className="text-sm font-medium">
                  {activeContract.end_date
                    ? formatDate(activeContract.end_date)
                    : "Indeterminado"}
                </p>
              </div>
            </div>
            {activeContract.notes && (
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">Observações</p>
                <p className="text-sm mt-1">{activeContract.notes}</p>
              </div>
            )}
            {renderDocumentButton(activeContract)}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Icon icon={FileText} size={24} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Nenhum contrato ativo
            </p>
            <Button onClick={handleOpenDialog}>
              <Icon icon={Plus} size={16} className="mr-2" />
              Novo Contrato
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contract History */}
      {pastContracts.length > 0 && (
        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle className="text-base">Histórico de Contratos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pastContracts.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg p-2 bg-background">
                      <Icon icon={Calendar} size={16} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{contract.plan_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(contract.start_date)} -{" "}
                        {contract.end_date
                          ? formatDate(contract.end_date)
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {contract.document_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={downloadingDoc === contract.document_url}
                        onClick={() => handleViewDocument(contract.document_url!)}
                      >
                        {downloadingDoc === contract.document_url ? (
                          <Icon icon={Loader2} size={16} className="animate-spin" />
                        ) : (
                          <Icon icon={FileText} size={16} />
                        )}
                      </Button>
                    )}
                    <p className="font-medium">
                      {formatCurrency(contract.monthly_value)}/mês
                    </p>
                    <StatusBadge status={contract.status} />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* New Contract Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Contrato</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo contrato para este cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan_name">Nome do Plano *</Label>
              <Input
                id="plan_name"
                placeholder="Ex: Plano Growth"
                value={formData.plan_name}
                onChange={(e) => setFormData(prev => ({ ...prev, plan_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_value">Valor Mensal *</Label>
              <CurrencyInput
                id="monthly_value"
                value={formData.monthly_value}
                onValueChange={(cents) => setFormData(prev => ({ ...prev, monthly_value: cents }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Término</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Observações sobre o contrato..."
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Documento (PDF, DOC, DOCX)</Label>
              {selectedFile ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
                  <Icon icon={Paperclip} size={16} className="text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={handleRemoveFile}
                    disabled={saving}
                  >
                    <Icon icon={X} customSize={14} />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon icon={Upload} size={20} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Clique para anexar arquivo
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContract} disabled={saving || formData.monthly_value === 0}>
              {saving ? (
                <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
              ) : (
                <Icon icon={Plus} size={16} className="mr-2" />
              )}
              {saving ? "Criando..." : "Criar Contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
