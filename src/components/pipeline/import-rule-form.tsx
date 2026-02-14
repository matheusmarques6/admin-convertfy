"use client"

import { useState } from "react"
import { Loader2, Plus, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type {
  Pipeline,
  PipelineStage,
  PipelineMember,
  PipelineImportRule,
  ImportCondition,
  ImportConditionField,
  ImportConditionOperator,
  DealDefaults,
} from "@/types"

interface ImportRuleFormProps {
  pipeline: Pipeline
  stages: PipelineStage[]
  members: PipelineMember[]
  rule?: PipelineImportRule
  onSave: () => void
  onCancel: () => void
}

const FIELD_OPTIONS: { value: ImportConditionField; label: string; type: "text" | "number" | "select" }[] = [
  { value: "status", label: "Status", type: "select" },
  { value: "name", label: "Nome", type: "text" },
  { value: "company", label: "Empresa", type: "text" },
  { value: "email", label: "Email", type: "text" },
  { value: "phone", label: "Telefone", type: "text" },
  { value: "website", label: "Website", type: "text" },
  { value: "tags", label: "Tags", type: "text" },
  { value: "health_score", label: "Health Score", type: "number" },
  { value: "owner_id", label: "Responsavel", type: "text" },
]

const STATUS_OPTIONS = [
  { value: "prospect", label: "Prospect" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "churned", label: "Churned" },
]

const OPERATOR_OPTIONS: { value: ImportConditionOperator; label: string; types: string[] }[] = [
  { value: "equals", label: "Igual a", types: ["text", "number", "select"] },
  { value: "not_equals", label: "Diferente de", types: ["text", "number", "select"] },
  { value: "contains", label: "Contem", types: ["text"] },
  { value: "not_contains", label: "Nao contem", types: ["text"] },
  { value: "starts_with", label: "Comeca com", types: ["text"] },
  { value: "ends_with", label: "Termina com", types: ["text"] },
  { value: "is_empty", label: "Esta vazio", types: ["text", "number", "select"] },
  { value: "is_not_empty", label: "Nao esta vazio", types: ["text", "number", "select"] },
  { value: "greater_than", label: "Maior que", types: ["number"] },
  { value: "less_than", label: "Menor que", types: ["number"] },
]

function getFieldType(field: ImportConditionField): "text" | "number" | "select" {
  return FIELD_OPTIONS.find((f) => f.value === field)?.type || "text"
}

function getOperatorsForField(field: ImportConditionField) {
  const fieldType = getFieldType(field)
  return OPERATOR_OPTIONS.filter((op) => op.types.includes(fieldType))
}

export function ImportRuleForm({
  pipeline,
  stages,
  members,
  rule,
  onSave,
  onCancel,
}: ImportRuleFormProps) {
  const isEditing = !!rule
  const [isLoading, setIsLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  // Form state
  const [name, setName] = useState(rule?.name || "")
  const [description, setDescription] = useState(rule?.description || "")
  const [targetStageId, setTargetStageId] = useState(rule?.target_stage_id || "")
  const [priority, setPriority] = useState(rule?.priority || 0)
  const [conditions, setConditions] = useState<ImportCondition[]>(
    rule?.conditions || []
  )
  const [dealDefaults, setDealDefaults] = useState<DealDefaults>(
    rule?.deal_defaults || {
      title_template: "{{client.name}} - Novo Deal",
      value: 0,
      probability: 10,
    }
  )

  function handleAddCondition() {
    setConditions((prev) => [
      ...prev,
      { field: "status", operator: "equals", value: "" },
    ])
  }

  function handleRemoveCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index))
  }

  function handleConditionChange(
    index: number,
    field: keyof ImportCondition,
    value: unknown
  ) {
    setConditions((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c
        const updated = { ...c, [field]: value }
        // Reset operator when field changes
        if (field === "field") {
          const newFieldType = getFieldType(value as ImportConditionField)
          const validOps = OPERATOR_OPTIONS.filter((op) =>
            op.types.includes(newFieldType)
          )
          if (!validOps.find((op) => op.value === updated.operator)) {
            updated.operator = validOps[0]?.value || "equals"
          }
          updated.value = ""
        }
        return updated
      })
    )
  }

  async function handlePreview() {
    setIsPreviewLoading(true)
    try {
      const supabase = createClient()

      // Build query based on conditions
      let query = supabase.from("clients").select("id", { count: "exact", head: true })

      for (const condition of conditions) {
        const { field, operator, value } = condition
        if (field.startsWith("custom_fields.")) continue

        switch (operator) {
          case "equals":
            query = query.eq(field, value)
            break
          case "not_equals":
            query = query.neq(field, value)
            break
          case "contains":
            query = query.ilike(field, `%${value}%`)
            break
          case "not_contains":
            query = query.not(field, "ilike", `%${value}%`)
            break
          case "starts_with":
            query = query.ilike(field, `${value}%`)
            break
          case "ends_with":
            query = query.ilike(field, `%${value}`)
            break
          case "is_empty":
            query = query.is(field, null)
            break
          case "is_not_empty":
            query = query.not(field, "is", null)
            break
          case "greater_than":
            query = query.gt(field, Number(value))
            break
          case "less_than":
            query = query.lt(field, Number(value))
            break
        }
      }

      const { count, error } = await query
      if (error) throw error
      setPreviewCount(count || 0)
    } catch (error) {
      console.error("Error previewing:", error)
      toast({
        variant: "destructive",
        title: "Erro ao fazer preview",
        description: "Nao foi possivel contar clientes que correspondem.",
      })
    } finally {
      setIsPreviewLoading(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Nome obrigatorio" })
      return
    }
    if (!targetStageId) {
      toast({ variant: "destructive", title: "Selecione uma etapa destino" })
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const ruleData = {
        pipeline_id: pipeline.id,
        target_stage_id: targetStageId,
        name,
        description: description || null,
        priority,
        conditions,
        deal_defaults: dealDefaults,
        created_by: user?.id,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("pipeline_import_rules")
          .update(ruleData)
          .eq("id", rule.id)

        if (error) throw error

        toast({
          title: "Regra atualizada!",
          description: "A regra de importacao foi atualizada.",
        })
      } else {
        const { error } = await supabase
          .from("pipeline_import_rules")
          .insert(ruleData)

        if (error) throw error

        toast({
          title: "Regra criada!",
          description: "A regra de importacao foi criada e esta ativa.",
        })
      }

      onSave()
    } catch (error) {
      console.error("Error saving rule:", error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar regra",
        description: "Tente novamente.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ScrollArea className="max-h-[70vh] pr-4">
      <div className="space-y-5">
        {/* Basic Info */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome da Regra *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Prospects E-commerce"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              placeholder="0"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Maior = avaliada primeiro
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descricao</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva quando esta regra deve ser aplicada..."
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label>Etapa Destino *</Label>
          <Select value={targetStageId} onValueChange={setTargetStageId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Conditions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Condicoes</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                TODAS as condicoes devem ser verdadeiras (logica AND)
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCondition}
              disabled={isLoading}
            >
              <Plus className="mr-1 h-3 w-3" />
              Condicao
            </Button>
          </div>

          {conditions.length === 0 && (
            <div className="text-center py-4 border rounded-md border-dashed">
              <p className="text-sm text-muted-foreground">
                Sem condicoes = todos os clientes serao importados
              </p>
            </div>
          )}

          <div className="space-y-2">
            {conditions.map((condition, index) => {
              const fieldType = getFieldType(condition.field)
              const operators = getOperatorsForField(condition.field)
              const needsValue = !["is_empty", "is_not_empty"].includes(
                condition.operator
              )

              return (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 rounded-md border bg-muted/30"
                >
                  {/* Field */}
                  <Select
                    value={condition.field}
                    onValueChange={(v) =>
                      handleConditionChange(index, "field", v)
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Operator */}
                  <Select
                    value={condition.operator}
                    onValueChange={(v) =>
                      handleConditionChange(index, "operator", v)
                    }
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Value */}
                  {needsValue && (
                    <>
                      {condition.field === "status" ? (
                        <Select
                          value={condition.value as string}
                          onValueChange={(v) =>
                            handleConditionChange(index, "value", v)
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : fieldType === "number" ? (
                        <Input
                          type="number"
                          value={condition.value as string}
                          onChange={(e) =>
                            handleConditionChange(
                              index,
                              "value",
                              e.target.value
                            )
                          }
                          placeholder="Valor"
                          className="flex-1"
                        />
                      ) : (
                        <Input
                          value={condition.value as string}
                          onChange={(e) =>
                            handleConditionChange(
                              index,
                              "value",
                              e.target.value
                            )
                          }
                          placeholder="Valor"
                          className="flex-1"
                        />
                      )}
                    </>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveCondition(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          {/* Preview */}
          {conditions.length > 0 && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={isPreviewLoading}
              >
                {isPreviewLoading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Search className="mr-1 h-3 w-3" />
                )}
                Testar Regra
              </Button>
              {previewCount !== null && (
                <Badge variant="secondary">
                  {previewCount} cliente{previewCount !== 1 ? "s" : ""}{" "}
                  correspondem
                </Badge>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Deal Defaults */}
        <div className="space-y-3">
          <Label>Configuracao do Deal Criado</Label>
          <p className="text-xs text-muted-foreground">
            Configure como o deal sera criado automaticamente. Use{" "}
            {"{{client.name}}"}, {"{{client.company}}"} como variaveis.
          </p>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Template do Titulo</Label>
              <Input
                value={dealDefaults.title_template || ""}
                onChange={(e) =>
                  setDealDefaults((prev) => ({
                    ...prev,
                    title_template: e.target.value,
                  }))
                }
                placeholder="{{client.name}} - Novo Deal"
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Valor Inicial (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={dealDefaults.value || 0}
                  onChange={(e) =>
                    setDealDefaults((prev) => ({
                      ...prev,
                      value: Number(e.target.value),
                    }))
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Probabilidade (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={dealDefaults.probability || 10}
                  onChange={(e) =>
                    setDealDefaults((prev) => ({
                      ...prev,
                      probability: Number(e.target.value),
                    }))
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Responsavel pelo Deal</Label>
              <Select
                value={dealDefaults.owner_id || "auto"}
                onValueChange={(v) =>
                  setDealDefaults((prev) => ({
                    ...prev,
                    owner_id: v === "auto" ? undefined : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Automatico (dono do cliente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Automatico (dono do cliente)
                  </SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.user?.name || "Usuario"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notas</Label>
              <Textarea
                value={dealDefaults.notes || ""}
                onChange={(e) =>
                  setDealDefaults((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                placeholder="Notas padrao para deals importados..."
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar Alteracoes" : "Criar Regra"}
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}
