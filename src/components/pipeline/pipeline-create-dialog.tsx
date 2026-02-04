"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"

const pipelineSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  is_default: z.boolean(),
})

type PipelineForm = z.infer<typeof pipelineSchema>

interface StageInput {
  id: string
  name: string
  color: string
}

const defaultStages: StageInput[] = [
  { id: "1", name: "Prospecção", color: "#6B7280" },
  { id: "2", name: "Qualificação", color: "#3B82F6" },
  { id: "3", name: "Proposta", color: "#F59E0B" },
  { id: "4", name: "Negociação", color: "#8B5CF6" },
  { id: "5", name: "Fechamento", color: "#22C55E" },
]

const colorOptions = [
  "#6B7280", "#EF4444", "#F59E0B", "#22C55E", "#3B82F6",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#06B6D4",
]

interface PipelineCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PipelineCreateDialog({ open, onOpenChange }: PipelineCreateDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [stages, setStages] = useState<StageInput[]>(defaultStages)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PipelineForm>({
    resolver: zodResolver(pipelineSchema),
    defaultValues: {
      name: "",
      description: "",
      is_default: false,
    },
  })

  const isDefault = watch("is_default")

  function addStage() {
    const newStage: StageInput = {
      id: Date.now().toString(),
      name: "",
      color: colorOptions[stages.length % colorOptions.length],
    }
    setStages([...stages, newStage])
  }

  function removeStage(id: string) {
    if (stages.length <= 1) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "O pipeline precisa ter pelo menos uma etapa.",
      })
      return
    }
    setStages(stages.filter((s) => s.id !== id))
  }

  function updateStage(id: string, field: "name" | "color", value: string) {
    setStages(stages.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  async function onSubmit(data: PipelineForm) {
    // Validate stages
    const validStages = stages.filter((s) => s.name.trim())
    if (validStages.length === 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Adicione pelo menos uma etapa ao pipeline.",
      })
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()

      // If this is set as default, unset other defaults first
      if (data.is_default) {
        await supabase
          .from("pipelines")
          .update({ is_default: false })
          .eq("is_default", true)
      }

      // Create the pipeline
      const { data: pipeline, error: pipelineError } = await supabase
        .from("pipelines")
        .insert({
          name: data.name,
          description: data.description || null,
          is_default: data.is_default,
        })
        .select()
        .single()

      if (pipelineError) throw pipelineError

      // Create the stages
      const stagesData = validStages.map((stage, index) => ({
        pipeline_id: pipeline.id,
        name: stage.name,
        color: stage.color,
        order: index,
      }))

      const { error: stagesError } = await supabase
        .from("pipeline_stages")
        .insert(stagesData)

      if (stagesError) throw stagesError

      toast({
        title: "Pipeline criado!",
        description: "O pipeline foi criado com sucesso.",
      })

      reset()
      setStages(defaultStages)
      onOpenChange(false)
      router.push(`/pipeline?pipelineId=${pipeline.id}`)
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao criar pipeline",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Pipeline</DialogTitle>
          <DialogDescription>
            Crie um novo pipeline de vendas com etapas personalizadas
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Pipeline *</Label>
            <Input
              id="name"
              placeholder="Ex: Vendas B2B"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Descrição do pipeline..."
              {...register("description")}
              disabled={isLoading}
            />
          </div>

          {/* Default toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pipeline Padrão</Label>
              <p className="text-sm text-muted-foreground">
                Usar este pipeline como padrão ao abrir a página
              </p>
            </div>
            <Switch
              checked={isDefault}
              onCheckedChange={(checked) => setValue("is_default", checked)}
              disabled={isLoading}
            />
          </div>

          {/* Stages */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Etapas do Pipeline</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStage}
                disabled={isLoading}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Etapa
              </Button>
            </div>

            <div className="space-y-2">
              {stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(stage.id, "name", e.target.value)}
                    placeholder="Nome da etapa"
                    className="flex-1"
                    disabled={isLoading}
                  />
                  <div className="flex gap-1">
                    {colorOptions.slice(0, 5).map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-6 h-6 rounded-full border-2 ${
                          stage.color === color ? "border-foreground" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateStage(stage.id, "color", color)}
                        disabled={isLoading}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStage(stage.id)}
                    disabled={isLoading || stages.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Pipeline
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
