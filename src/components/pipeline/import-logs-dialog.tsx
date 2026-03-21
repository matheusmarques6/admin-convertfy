"use client"

import { useState, useEffect } from "react"
import { Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { formatDateTime } from "@/lib/utils"
import type { PipelineImportLog, ImportLogStatus } from "@/types"

interface ImportLogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
}

const statusConfig: Record<ImportLogStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  success: { label: "Sucesso", icon: CheckCircle2, color: "text-green-500" },
  failed: { label: "Falha", icon: XCircle, color: "text-red-500" },
  skipped: { label: "Ignorado", icon: MinusCircle, color: "text-amber-500" },
}

export function ImportLogsDialog({
  open,
  onOpenChange,
  pipelineId,
}: ImportLogsDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState<PipelineImportLog[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    if (open) loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipelineId, statusFilter])

  async function loadLogs() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      let query = supabase
        .from("pipeline_import_logs")
        .select(`
          *,
          client:clients (id, name, email),
          rule:pipeline_import_rules (id, name)
        `)
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false })
        .limit(100)

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      setLogs(data || [])
    } catch (error) {
      console.error("Error loading logs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Logs de Importacao</DialogTitle>
          <DialogDescription>
            Historico de importacoes automaticas de clientes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
                <SelectItem value="skipped">Ignorado</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">
              {logs.length} registro{logs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Logs */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon icon={Loader2} size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum log encontrado.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[450px]">
              <div className="space-y-2">
                {logs.map((log) => {
                  const config = statusConfig[log.status]

                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-md border bg-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Icon
                            icon={config.icon}
                            size={16}
                            className={`mt-0.5 ${config.color}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {log.client?.name || "Cliente desconhecido"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {log.client?.email}
                            </p>
                            {log.rule && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Regra: {log.rule.name}
                              </p>
                            )}
                            {log.error_message && (
                              <p className="text-xs text-destructive mt-1">
                                {log.error_message}
                              </p>
                            )}
                            {log.status === "skipped" &&
                              log.metadata &&
                              typeof log.metadata === "object" &&
                              "reason" in log.metadata && (
                                <p className="text-xs text-amber-600 mt-1">
                                  Motivo: {log.metadata.reason === "deal_already_exists"
                                    ? "Deal ja existe nesta pipeline"
                                    : String(log.metadata.reason)}
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge
                            variant={log.status === "success" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {config.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
