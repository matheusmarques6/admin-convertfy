"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Store } from "lucide-react"
import { storeQuickCreateSchema } from "@/lib/schemas/store.schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"

type QuickStoreFormData = z.infer<typeof storeQuickCreateSchema>

interface QuickStoreFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function QuickStoreForm({ onSuccess, onCancel }: QuickStoreFormProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<QuickStoreFormData>({
    resolver: zodResolver(storeQuickCreateSchema),
    defaultValues: {
      store_name: "",
      platform: "shopify",
      store_url: "",
    },
  })

  const platformValue = watch("platform")

  async function onSubmit(data: QuickStoreFormData) {
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/client-stores/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: data.store_name,
          platform: data.platform,
          store_url: data.store_url,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar loja")
      }

      toast({
        title: "Loja cadastrada!",
        description: `A loja "${data.store_name}" foi criada com sucesso.`,
      })

      onSuccess()
    } catch (error) {
      console.error("Error creating store:", error)
      toast({
        title: "Erro ao cadastrar loja",
        description: error instanceof Error ? error.message : "Não foi possível criar a loja",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          Cadastro Rápido de Loja
        </DialogTitle>
        <DialogDescription>
          Cadastre uma nova loja sem vinculá-la a um cliente. Você poderá vincular depois.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Store Name */}
        <div className="space-y-2">
          <Label htmlFor="store_name">Nome da Loja *</Label>
          <Input
            id="store_name"
            placeholder="Ex: Minha Loja"
            {...register("store_name")}
          />
          {errors.store_name && (
            <p className="text-sm text-destructive">{errors.store_name.message}</p>
          )}
        </div>

        {/* Platform */}
        <div className="space-y-2">
          <Label htmlFor="platform">Plataforma *</Label>
          <Select
            value={platformValue}
            onValueChange={(value) =>
              setValue("platform", value as QuickStoreFormData["platform"], { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
              <SelectItem value="woocommerce">WooCommerce</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
          {errors.platform && (
            <p className="text-sm text-destructive">{errors.platform.message}</p>
          )}
        </div>

        {/* Store URL */}
        <div className="space-y-2">
          <Label htmlFor="store_url">URL da Loja *</Label>
          <Input
            id="store_url"
            placeholder="https://minhaloja.com.br"
            {...register("store_url")}
          />
          {errors.store_url && (
            <p className="text-sm text-destructive">{errors.store_url.message}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Cadastrando...
            </>
          ) : (
            "Cadastrar Loja"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
