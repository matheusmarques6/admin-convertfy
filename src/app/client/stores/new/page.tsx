"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store,
  Loader2,
  Check,
  ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Breadcrumbs } from "@/components/ui/breadcrumbs"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"

const PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
] as const

export default function PortalNewStorePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const [formData, setFormData] = useState({
    store_name: "",
    store_url: "",
    platform: "shopify",
  })

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const isValid = formData.store_name.trim() && formData.store_url.trim() && formData.platform

  const handleSubmit = async () => {
    if (!isValid) {
      toast({ variant: "destructive", title: "Preencha todos os campos obrigatórios" })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/portal/stores/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: formData.store_name,
          store_url: formData.store_url,
          platform: formData.platform,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao enviar")

      setSubmitted(true)
      setHasChanges(false)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao enviar",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Success State ──────────────────────────────────────

  if (submitted) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Minhas Lojas", href: "/client/stores" },
            { label: "Nova Loja" },
          ]}
        />
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-14 h-14 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-[#10B981]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#EAEDF3] mb-1">
            Loja Enviada!
          </h2>
          <p className="text-sm text-gray-400 dark:text-[#5C6378] mb-6">
            Sua loja foi enviada para aprovação. Você será notificado quando o onboarding começar.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => router.push("/client/stores")}
              className="w-full rounded-[6px] h-9"
            >
              Voltar para Lojas
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Form ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Minhas Lojas", href: "/client/stores" },
          { label: "Nova Loja" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Adicionar Loja
        </h1>
        <p className="text-sm text-gray-400 dark:text-[#5C6378] mt-0.5">
          Cadastre uma nova loja para começar o onboarding
        </p>
      </div>

      {/* Form Card */}
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5 max-w-lg">
        <div className="space-y-5">
          {/* Store Name */}
          <div className="space-y-1.5">
            <Label
              htmlFor="store_name"
              className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]"
            >
              Nome da loja
            </Label>
            <Input
              id="store_name"
              value={formData.store_name}
              onChange={(e) => updateField("store_name", e.target.value)}
              placeholder="Minha Loja"
              className="h-10 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F9FAFB]"
            />
          </div>

          {/* Store URL */}
          <div className="space-y-1.5">
            <Label
              htmlFor="store_url"
              className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]"
            >
              URL do Shopify
            </Label>
            <Input
              id="store_url"
              type="url"
              value={formData.store_url}
              onChange={(e) => updateField("store_url", e.target.value)}
              placeholder="https://minhaloja.myshopify.com"
              className="h-10 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F9FAFB]"
            />
            <p className="text-xs text-gray-400 dark:text-[#5C6378]">
              O domínio .myshopify.com da sua loja
            </p>
          </div>

          {/* Platform - SegmentedTabs */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]">
              Plataforma
            </Label>
            <div className="flex rounded-[6px] border border-[#e5e7eb] dark:border-[#374151] overflow-hidden">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => updateField("platform", p.value)}
                  className={cn(
                    "flex-1 h-10 text-sm font-medium transition-colors duration-150",
                    formData.platform === p.value
                      ? "bg-[#4E8FFF] text-white"
                      : "bg-white dark:bg-[#111827] text-gray-500 dark:text-[#5C6378] hover:bg-[#f3f4f6] dark:hover:bg-[#374151]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SaveBar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#1F2937] px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <p className="text-sm text-gray-400 dark:text-[#5C6378]">
              Alterações não salvas
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/client/stores")}
                className="rounded-[6px] h-9"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !isValid}
                className="rounded-[6px] h-9"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar para Aprovação"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
