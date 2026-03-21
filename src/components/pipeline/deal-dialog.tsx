"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { Deal, PipelineStage } from "@/types"

interface ClientOption {
  id: string
  name: string
  company?: string
}

const dealSchema = z.object({
  title: z.string().min(2, "Titulo deve ter pelo menos 2 caracteres"),
  value: z.number().min(0, "Valor deve ser positivo"),
  probability: z.number().min(0).max(100),
  client_id: z.string().optional(),
  expected_close_date: z.string().optional(),
  notes: z.string().optional(),
})

type DealForm = z.infer<typeof dealSchema>

interface DealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal?: Deal
  pipelineId?: string
  stageId?: string
  onSuccess?: () => void
}

export function DealDialog({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stageId,
  onSuccess,
}: DealDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [selectedStageId, setSelectedStageId] = useState(stageId || "")

  const isEditing = !!deal

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<DealForm>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: deal?.title || "",
      value: deal?.value || 0,
      probability: deal?.probability || 50,
      client_id: deal?.client_id || undefined,
      notes: deal?.notes || "",
    },
  })

  useEffect(() => {
    if (open) {
      loadData()
      if (deal) {
        reset({
          title: deal.title,
          value: deal.value,
          probability: deal.probability,
          client_id: deal.client_id || undefined,
          expected_close_date: deal.expected_close_date || "",
          notes: deal.notes || "",
        })
        setSelectedStageId(deal.stage_id)
      } else {
        reset({
          title: "",
          value: 0,
          probability: 50,
          client_id: undefined,
          expected_close_date: "",
          notes: "",
        })
        setSelectedStageId(stageId || "")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal, stageId, reset])

  async function loadData() {
    const supabase = createClient()

    // Load clients
    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, name, company")
      .order("name")

    setClients((clientsData || []) as ClientOption[])

    // Load stages
    if (pipelineId) {
      const { data: stagesData } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("order")

      setStages(stagesData || [])

      // Set first stage as default if no stage selected
      if (!stageId && stagesData && stagesData.length > 0) {
        setSelectedStageId(stagesData[0].id)
      }
    }
  }

  async function onSubmit(data: DealForm) {
    if (!pipelineId || !selectedStageId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Pipeline ou etapa não selecionados.",
      })
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const dealData = {
        title: data.title,
        value: data.value,
        probability: data.probability,
        client_id: data.client_id || null,
        expected_close_date: data.expected_close_date || null,
        notes: data.notes || null,
        pipeline_id: pipelineId,
        stage_id: selectedStageId,
        owner_id: user?.id,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("deals")
          .update(dealData)
          .eq("id", deal.id)

        if (error) throw error

        toast({
          title: "Deal atualizado!",
          description: "O deal foi atualizado com sucesso.",
        })
      } else {
        const { error } = await supabase.from("deals").insert(dealData)

        if (error) throw error

        toast({
          title: "Deal criado!",
          description: "O deal foi criado com sucesso.",
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error saving deal:", error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar deal",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Deal" : "Novo Deal"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informações do deal"
              : "Adicione um novo negócio ao pipeline"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Nome do deal"
              {...register("title")}
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Client */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select
              onValueChange={(value) => setValue("client_id", value)}
              defaultValue={deal?.client_id || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                    {client.company && (
                      <span className="text-muted-foreground ml-2">
                        ({client.company})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage */}
          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select
              value={selectedStageId}
              onValueChange={setSelectedStageId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa" />
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

          {/* Value and Probability */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                placeholder="0,00"
                {...register("value", { valueAsNumber: true })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="probability">Probabilidade (%)</Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                placeholder="50"
                {...register("probability", { valueAsNumber: true })}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Expected Close Date */}
          <div className="space-y-2">
            <Label htmlFor="expected_close_date">Data prevista de fechamento</Label>
            <Input
              id="expected_close_date"
              type="date"
              {...register("expected_close_date")}
              disabled={isLoading}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Notas sobre o deal..."
              {...register("notes")}
              disabled={isLoading}
            />
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
              {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Deal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
