"use client"

import { useState, useEffect } from "react"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Zap,
  ZapOff,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ImportRuleForm } from "./import-rule-form"
import { ImportLogsDialog } from "./import-logs-dialog"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { Pipeline, PipelineStage, PipelineMember, PipelineImportRule } from "@/types"

interface ImportRulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline
  stages: PipelineStage[]
  members: PipelineMember[]
  onSuccess?: () => void
}

export function ImportRulesDialog({
  open,
  onOpenChange,
  pipeline,
  stages,
  members,
  onSuccess,
}: ImportRulesDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [rules, setRules] = useState<PipelineImportRule[]>([])
  const [editingRule, setEditingRule] = useState<PipelineImportRule | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [deletingRule, setDeletingRule] = useState<PipelineImportRule | null>(null)

  useEffect(() => {
    if (open) loadRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline.id])

  async function loadRules() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("pipeline_import_rules")
        .select(`
          *,
          target_stage:pipeline_stages!pipeline_import_rules_target_stage_id_fkey (
            id, name, color
          )
        `)
        .eq("pipeline_id", pipeline.id)
        .order("priority", { ascending: false })

      if (error) throw error
      setRules(data || [])
    } catch (error) {
      console.error("Error loading rules:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToggleRule(ruleId: string, isActive: boolean) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("pipeline_import_rules")
        .update({ is_active: isActive })
        .eq("id", ruleId)

      if (error) throw error

      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: isActive } : r))
      )

      toast({
        title: isActive ? "Regra ativada" : "Regra desativada",
        description: isActive
          ? "Novos clientes serao avaliados por esta regra."
          : "Esta regra nao sera mais avaliada.",
      })
    } catch (error) {
      console.error("Error toggling rule:", error)
      toast({
        variant: "destructive",
        title: "Erro ao alterar regra",
      })
    }
  }

  async function handleDeleteRule() {
    if (!deletingRule) return
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("pipeline_import_rules")
        .delete()
        .eq("id", deletingRule.id)

      if (error) throw error

      setRules((prev) => prev.filter((r) => r.id !== deletingRule.id))
      setDeletingRule(null)

      toast({
        title: "Regra excluida!",
        description: "A regra de importacao foi removida.",
      })

      onSuccess?.()
    } catch (error) {
      console.error("Error deleting rule:", error)
      toast({
        variant: "destructive",
        title: "Erro ao excluir regra",
      })
    }
  }

  function handleRuleSaved() {
    setShowCreateForm(false)
    setEditingRule(null)
    loadRules()
    onSuccess?.()
  }

  // Show form when creating/editing
  if (showCreateForm || editingRule) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Editar Regra" : "Nova Regra de Importacao"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Atualize as condicoes e configuracoes da regra"
                : "Configure as condicoes para importacao automatica de clientes"}
            </DialogDescription>
          </DialogHeader>

          <ImportRuleForm
            pipeline={pipeline}
            stages={stages}
            members={members}
            rule={editingRule || undefined}
            onSave={handleRuleSaved}
            onCancel={() => {
              setShowCreateForm(false)
              setEditingRule(null)
            }}
          />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Regras de Importacao</DialogTitle>
            <DialogDescription>
              Configure regras para importar clientes automaticamente para esta pipeline.
              Quando um cliente e criado ou atualizado, as regras ativas serao avaliadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogs(true)}
              >
                <FileText className="mr-2 h-4 w-4" />
                Ver Logs
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Regra
              </Button>
            </div>

            <Separator />

            {/* Rules List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8">
                <ZapOff className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  Nenhuma regra de importacao configurada.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie regras para importar clientes automaticamente.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Zap
                              className={`h-4 w-4 flex-shrink-0 ${
                                rule.is_active
                                  ? "text-amber-500"
                                  : "text-muted-foreground"
                              }`}
                            />
                            <p className="font-medium truncate">{rule.name}</p>
                            <Badge
                              variant={rule.is_active ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {rule.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>

                          {rule.description && (
                            <p className="text-sm text-muted-foreground mt-1 ml-6">
                              {rule.description}
                            </p>
                          )}

                          <div className="flex items-center gap-3 mt-2 ml-6">
                            <span className="text-xs text-muted-foreground">
                              {rule.conditions.length} condicao(oes)
                            </span>
                            {rule.target_stage && (
                              <div className="flex items-center gap-1">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{
                                    backgroundColor: rule.target_stage.color,
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">
                                  → {rule.target_stage.name}
                                </span>
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Prioridade: {rule.priority}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(v) =>
                              handleToggleRule(rule.id, v)
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingRule(rule)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingRule(rule)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingRule}
        onOpenChange={() => setDeletingRule(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra &quot;{deletingRule?.name}&quot; sera excluida. Deals ja
              importados nao serao afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Logs */}
      <ImportLogsDialog
        open={showLogs}
        onOpenChange={setShowLogs}
        pipelineId={pipeline.id}
      />
    </>
  )
}
