"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Loader2,
  Plus,
  GripVertical,
  X,
} from "lucide-react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/lib/hooks/use-toast"

const DEFAULT_STAGES = [
  { name: "Lead", color: "#94A3B8", order: 1 },
  { name: "Qualificacao", color: "#F59E0B", order: 2 },
  { name: "Proposta", color: "#3B82F6", order: 3 },
  { name: "Negociacao", color: "#05AFF2", order: 4 },
  { name: "Fechado Ganho", color: "#22C55E", order: 5 },
  { name: "Fechado Perdido", color: "#EF4444", order: 6 },
]

const pipelineSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  is_default: z.boolean(),
})

type PipelineForm = z.infer<typeof pipelineSchema>

interface StageInput {
  name: string
  color: string
  order: number
}

interface PipelineCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function PipelineCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: PipelineCreateDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [stages, setStages] = useState<StageInput[]>(DEFAULT_STAGES)

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

  function handleAddStage() {
    setStages((prev) => [
      ...prev,
      {
        name: "",
        color: "#05AFF2",
        order: prev.length + 1,
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

  async function onSubmit(data: PipelineForm) {
    const emptyStages = stages.filter((s) => !s.name.trim())
    if (emptyStages.length > 0) {
      toast({
        variant: "destructive",
        title: "Etapas incompletas",
        description: "Todas as etapas precisam ter um nome.",
      })
      return
    }

    if (stages.length < 2) {
      toast({
        variant: "destructive",
        title: "Minimo de 2 etapas",
        description: "Uma pipeline precisa ter pelo menos 2 etapas.",
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          is_default: data.is_default,
          stages,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao criar pipeline")
      }

      toast({
        title: "Pipeline criada!",
        description: `A pipeline "${data.name}" foi criada com ${stages.length} etapas.`,
      })

      reset()
      setStages(DEFAULT_STAGES)
      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error("Error creating pipeline:", error)
      toast({
        variant: "destructive",
        title: "Erro ao criar pipeline",
        description: error instanceof Error ? error.message : "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Nova Pipeline</DialogTitle>
          <DialogDescription>
            Crie uma nova pipeline com etapas personalizadas
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pipeline-name">Nome *</Label>
            <Input
              id="pipeline-name"
              placeholder="Ex: Pipeline de Vendas B2B"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="pipeline-desc">Descricao</Label>
            <Textarea
              id="pipeline-desc"
              placeholder="Descreva o proposito desta pipeline..."
              {...register("description")}
              disabled={isLoading}
            />
          </div>

          {/* Default */}
          <div className="flex items-center gap-3">
            <Switch
              checked={isDefault}
              onCheckedChange={(v) => setValue("is_default", v)}
              disabled={isLoading}
            />
            <Label>Definir como pipeline padrao</Label>
          </div>

          {/* Stages */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Etapas da Pipeline</Label>
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

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2 pr-4">
                {stages.map((stage, index) => (
                  <div
                    key={index}
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

            {stages.length < 2 && (
              <p className="text-sm text-destructive">
                Adicione pelo menos 2 etapas.
              </p>
            )}
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
