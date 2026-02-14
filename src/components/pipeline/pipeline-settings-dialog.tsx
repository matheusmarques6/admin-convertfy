"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Plus,
  GripVertical,
  X,
  Trash2,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { Pipeline, PipelineStage } from "@/types"

interface StageEdit {
  id?: string
  name: string
  color: string
  order: number
  isNew?: boolean
}

interface PipelineSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline
  stages: PipelineStage[]
  pipelines: Pipeline[]
  onSuccess?: () => void
}

export function PipelineSettingsDialog({
  open,
  onOpenChange,
  pipeline,
  stages: initialStages,
  pipelines,
  onSuccess,
}: PipelineSettingsDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState(pipeline.name)
  const [description, setDescription] = useState(pipeline.description || "")
  const [isDefault, setIsDefault] = useState(pipeline.is_default)
  const [stages, setStages] = useState<StageEdit[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [migrateToPipelineId, setMigrateToPipelineId] = useState<string>("")

  useEffect(() => {
    if (open) {
      setName(pipeline.name)
      setDescription(pipeline.description || "")
      setIsDefault(pipeline.is_default)
      setStages(
        initialStages.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          order: s.order,
        }))
      )
    }
  }, [open, pipeline, initialStages])

  function handleAddStage() {
    setStages((prev) => [
      ...prev,
      {
        name: "",
        color: "#8B5CF6",
        order: prev.length + 1,
        isNew: true,
      },
    ])
  }

  function handleRemoveStage(index: number) {
    if (stages.length <= 2) {
      toast({
        variant: "destructive",
        title: "Minimo de 2 etapas",
        description: "Uma pipeline precisa ter pelo menos 2 etapas.",
      })
      return
    }
    setStages((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      return updated.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  function handleStageChange(index: number, field: "name" | "color", value: string) {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    )
  }

  function handleMoveStage(fromIndex: number, direction: "up" | "down") {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= stages.length) return
    setStages((prev) => {
      const updated = [...prev]
      const temp = updated[fromIndex]
      updated[fromIndex] = updated[toIndex]
      updated[toIndex] = temp
      return updated.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Nome obrigatorio" })
      return
    }

    const emptyStages = stages.filter((s) => !s.name.trim())
    if (emptyStages.length > 0) {
      toast({
        variant: "destructive",
        title: "Etapas incompletas",
        description: "Todas as etapas precisam ter um nome.",
      })
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()

      // Atualizar pipeline
      if (isDefault && !pipeline.is_default) {
        await supabase
          .from("pipelines")
          .update({ is_default: false })
          .eq("is_default", true)
      }

      const { error: pipelineError } = await supabase
        .from("pipelines")
        .update({
          name,
          description: description || null,
          is_default: isDefault,
        })
        .eq("id", pipeline.id)

      if (pipelineError) throw pipelineError

      // Gerenciar stages
      const existingIds = stages.filter((s) => s.id).map((s) => s.id!)
      const originalIds = initialStages.map((s) => s.id)
      const removedIds = originalIds.filter((id) => !existingIds.includes(id))

      // Deletar stages removidas
      if (removedIds.length > 0) {
        // Mover deals das stages removidas para a primeira stage restante
        const firstStage = stages[0]
        if (firstStage?.id) {
          for (const removedId of removedIds) {
            await supabase
              .from("deals")
              .update({ stage_id: firstStage.id })
              .eq("stage_id", removedId)
          }
        }

        const { error } = await supabase
          .from("pipeline_stages")
          .delete()
          .in("id", removedIds)

        if (error) throw error
      }

      // Atualizar stages existentes
      for (const stage of stages.filter((s) => s.id && !s.isNew)) {
        const { error } = await supabase
          .from("pipeline_stages")
          .update({
            name: stage.name,
            color: stage.color,
            order: stage.order,
          })
          .eq("id", stage.id!)

        if (error) throw error
      }

      // Criar novas stages
      const newStages = stages.filter((s) => s.isNew || !s.id)
      if (newStages.length > 0) {
        const { error } = await supabase.from("pipeline_stages").insert(
          newStages.map((s) => ({
            pipeline_id: pipeline.id,
            name: s.name,
            color: s.color,
            order: s.order,
          }))
        )
        if (error) throw error
      }

      toast({
        title: "Pipeline atualizada!",
        description: "As alteracoes foram salvas com sucesso.",
      })

      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error("Error updating pipeline:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar pipeline",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDelete() {
    setIsLoading(true)
    try {
      const supabase = createClient()

      // Se tem deals e selecionou para onde migrar
      if (migrateToPipelineId) {
        // Buscar primeira stage da pipeline destino
        const { data: targetStages } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", migrateToPipelineId)
          .order("order", { ascending: true })
          .limit(1)

        if (targetStages && targetStages.length > 0) {
          await supabase
            .from("deals")
            .update({
              pipeline_id: migrateToPipelineId,
              stage_id: targetStages[0].id,
            })
            .eq("pipeline_id", pipeline.id)
        }
      }

      const { error } = await supabase
        .from("pipelines")
        .delete()
        .eq("id", pipeline.id)

      if (error) throw error

      toast({
        title: "Pipeline excluida!",
        description: `A pipeline "${pipeline.name}" foi excluida.`,
      })

      setShowDeleteConfirm(false)
      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error("Error deleting pipeline:", error)
      toast({
        variant: "destructive",
        title: "Erro ao excluir pipeline",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const otherPipelines = pipelines.filter((p) => p.id !== pipeline.id)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Configuracoes da Pipeline</DialogTitle>
            <DialogDescription>
              Edite as informacoes e etapas da pipeline
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da pipeline"
                disabled={isLoading}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descricao da pipeline..."
                disabled={isLoading}
              />
            </div>

            {/* Default */}
            <div className="flex items-center gap-3">
              <Switch
                checked={isDefault}
                onCheckedChange={setIsDefault}
                disabled={isLoading}
              />
              <Label>Pipeline padrao</Label>
            </div>

            {/* Stages */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Etapas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddStage}
                  disabled={isLoading}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Adicionar Etapa
                </Button>
              </div>

              <ScrollArea className="max-h-[250px]">
                <div className="space-y-2 pr-4">
                  {stages.map((stage, index) => (
                    <div
                      key={stage.id || `new-${index}`}
                      className="flex items-center gap-2 p-2 rounded-md border bg-card"
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => handleMoveStage(index, "up")}
                          disabled={index === 0 || isLoading}
                          tabIndex={-1}
                        >
                          <GripVertical className="h-3 w-3 rotate-180" />
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => handleMoveStage(index, "down")}
                          disabled={index === stages.length - 1 || isLoading}
                          tabIndex={-1}
                        >
                          <GripVertical className="h-3 w-3" />
                        </button>
                      </div>

                      <span className="text-xs text-muted-foreground w-5">
                        {stage.order}
                      </span>

                      <input
                        type="color"
                        value={stage.color}
                        onChange={(e) =>
                          handleStageChange(index, "color", e.target.value)
                        }
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                        disabled={isLoading}
                      />

                      <Input
                        value={stage.name}
                        onChange={(e) =>
                          handleStageChange(index, "name", e.target.value)
                        }
                        placeholder="Nome da etapa"
                        className="flex-1"
                        disabled={isLoading}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveStage(index)}
                        disabled={isLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir Pipeline
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar Alteracoes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa acao nao pode ser desfeita. Todos os dados associados serao
              permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {otherPipelines.length > 0 && (
            <div className="space-y-2">
              <Label>Migrar deals para outra pipeline (opcional)</Label>
              <Select
                value={migrateToPipelineId}
                onValueChange={setMigrateToPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (ou deals serao excluidos)" />
                </SelectTrigger>
                <SelectContent>
                  {otherPipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
