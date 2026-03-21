"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"

export interface RefundCharge {
  id: string
  amount: number
  description?: string
  asaas_id?: string | null
  subscription_id?: string | null
  refund_total?: number
  client_name?: string
}

interface RefundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  charge: RefundCharge | null
  onSuccess: () => void
}

export function RefundDialog({ open, onOpenChange, charge, onSuccess }: RefundDialogProps) {
  const [refundType, setRefundType] = useState<"full" | "partial">("full")
  const [partialAmount, setPartialAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!charge) return null

  const alreadyRefunded = charge.refund_total ?? 0
  const remaining = charge.amount - alreadyRefunded
  const isAsaas = !!charge.asaas_id

  const effectiveAmount = refundType === "full" ? remaining : parseFloat(partialAmount || "0")
  const isAmountValid = refundType === "full" || (effectiveAmount > 0 && effectiveAmount <= remaining)
  const isReasonValid = reason.trim().length >= 3
  const canSubmit = isAmountValid && isReasonValid && !isSubmitting

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setRefundType("full")
      setPartialAmount("")
      setReason("")
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit() {
    if (!canSubmit || !charge) return

    setIsSubmitting(true)
    try {
      const endpoint = isAsaas
        ? "/api/integrations/asaas/refund"
        : "/api/financial/refund"

      const body: Record<string, unknown> = {
        reason: reason.trim(),
      }

      if (isAsaas) {
        body.invoice_id = charge.id
      } else {
        body.charge_id = charge.id
      }

      if (refundType === "partial") {
        body.amount = effectiveAmount
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (!res.ok || result.error) {
        throw new Error(result.error || result.message || "Erro ao processar reembolso")
      }

      toast({
        title: "Reembolso processado",
        description: isAsaas
          ? "Reembolso solicitado ao Asaas com sucesso."
          : "Reembolso registrado com sucesso.",
      })

      handleOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao reembolsar",
        description: error instanceof Error ? error.message : "Erro desconhecido ao processar reembolso.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Reembolsar Cobranca
          </DialogTitle>
          <DialogDescription>
            {charge.client_name && <span className="font-medium">{charge.client_name}</span>}
            {charge.client_name && charge.description && " — "}
            {charge.description || "Cobranca"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Amount info */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor original</span>
              <span className="font-medium">{formatCurrency(charge.amount)}</span>
            </div>
            {alreadyRefunded > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ja reembolsado</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {formatCurrency(alreadyRefunded)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <span className="text-muted-foreground">Disponivel para reembolso</span>
              <span className="font-semibold">{formatCurrency(remaining)}</span>
            </div>
          </div>

          {/* Refund type */}
          <div className="space-y-3">
            <Label>Tipo de Reembolso</Label>
            <RadioGroup
              value={refundType}
              onValueChange={(v) => setRefundType(v as "full" | "partial")}
              disabled={isSubmitting}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="refund-full" />
                <Label htmlFor="refund-full" className="font-normal cursor-pointer">
                  Reembolso Total ({formatCurrency(remaining)})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="refund-partial" />
                <Label htmlFor="refund-partial" className="font-normal cursor-pointer">
                  Reembolso Parcial
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Partial amount input */}
          {refundType === "partial" && (
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Valor do Reembolso (R$)</Label>
              <Input
                id="refund-amount"
                type="number"
                min={0.01}
                max={remaining}
                step={0.01}
                placeholder={`Max: ${remaining.toFixed(2)}`}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                disabled={isSubmitting}
              />
              {partialAmount && parseFloat(partialAmount) > remaining && (
                <p className="text-xs text-destructive">
                  Valor excede o disponivel para reembolso ({formatCurrency(remaining)})
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="refund-reason">Motivo do Reembolso</Label>
            <Textarea
              id="refund-reason"
              placeholder="Descreva o motivo do reembolso..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              disabled={isSubmitting}
              className="min-h-[80px]"
            />
            {reason.length > 0 && reason.trim().length < 3 && (
              <p className="text-xs text-destructive">
                O motivo deve ter pelo menos 3 caracteres.
              </p>
            )}
          </div>

          {/* Subscription warning */}
          {charge.subscription_id && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cobranca vinculada a assinatura</AlertTitle>
              <AlertDescription>
                O reembolso nao cancela a assinatura automaticamente. A assinatura continuara ativa.
              </AlertDescription>
            </Alert>
          )}

          {/* Destructive warning */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Acao irreversivel</AlertTitle>
            <AlertDescription>
              {isAsaas
                ? "Esta acao nao pode ser desfeita. O valor sera devolvido ao cliente via Asaas."
                : "Esta acao nao pode ser desfeita. O reembolso sera registrado imediatamente."}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Confirmar Reembolso
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
