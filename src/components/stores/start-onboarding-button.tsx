"use client"

/**
 * StartOnboardingButton (Epic AE - Story AE-2)
 *
 * Botão na tela de produção/onboarding da loja que dispara o pipeline
 * de geração de emails. Abre modal com 3 modos:
 *   - "Iniciar do zero"      → mode='fresh'
 *   - "Retomar batch atual"  → mode='resume'
 *   - "Refazer (descarta)"   → mode='redo' (double-confirm)
 *
 * Em sucesso: toast + redirect pra workspace de produção.
 * Em 409 (batch_in_progress) com mode=fresh: alerta sugerindo Resume/Redo.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play, RotateCcw, AlertTriangle } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Mode = "fresh" | "resume" | "redo"

interface StartOnboardingButtonProps {
  storeId: string
  briefingConfirmed: boolean
  redirectPath?: string // default `/admin/stores/{storeId}/producao`
  className?: string
}

interface StartOnboardingResponse {
  success?: boolean
  batch_id?: string
  emails_dispatched?: number
  dispatched_to_n8n?: boolean
  flow_ids_used?: string[]
  reused_batch?: boolean
  message?: string
  error?: string
  code?: string
  details?: { current_batch_id?: string }
}

export function StartOnboardingButton({
  storeId,
  briefingConfirmed,
  redirectPath,
  className,
}: StartOnboardingButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmingRedo, setConfirmingRedo] = useState(false)
  const [conflictBatchId, setConflictBatchId] = useState<string | null>(null)

  const targetPath = redirectPath ?? `/admin/stores/${storeId}/producao`

  async function run(mode: Mode) {
    setLoading(true)
    setConflictBatchId(null)
    try {
      const resp = await fetch(`/api/admin/stores/${storeId}/start-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, triggered_by: "ui" }),
      })
      const json = (await resp.json()) as StartOnboardingResponse

      if (!resp.ok) {
        // 409 batch_in_progress
        if (resp.status === 409 && json.code === "batch_in_progress") {
          setConflictBatchId(json.details?.current_batch_id ?? null)
          toast({
            title: "Já existe batch em andamento",
            description: "Escolha 'Retomar' para continuar ou 'Refazer' para descartar.",
            variant: "destructive",
          })
          return
        }
        if (resp.status === 422 && json.code === "briefing_not_confirmed") {
          toast({
            title: "Briefing não confirmado",
            description: "Confirme o briefing antes de iniciar a geração.",
            variant: "destructive",
          })
          return
        }
        toast({
          title: "Falha ao iniciar geração",
          description: json.error || `HTTP ${resp.status}`,
          variant: "destructive",
        })
        return
      }

      const batch = json.batch_id ?? ""
      const shortId = batch.slice(0, 8)
      if (json.message === "nothing_to_generate") {
        toast({
          title: "Nenhum email para gerar",
          description: "Todos os emails já estão prontos ou em andamento.",
        })
      } else if (json.reused_batch) {
        toast({
          title: "Batch retomado",
          description: `Batch ${shortId} já em execução. Acompanhe o progresso.`,
        })
      } else {
        toast({
          title: "Geração iniciada",
          description: `Batch ${shortId} — ${json.emails_dispatched ?? 0} emails despachados.`,
        })
      }
      setOpen(false)
      router.push(targetPath)
      router.refresh()
    } catch (e) {
      toast({
        title: "Erro inesperado",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setConfirmingRedo(false)
    }
  }

  const triggerDisabled = !briefingConfirmed

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setConfirmingRedo(false)
          setConflictBatchId(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="primary"
          size="md"
          disabled={triggerDisabled}
          className={className}
          title={
            triggerDisabled
              ? "Confirme o briefing antes de iniciar a geração"
              : "Iniciar geração de emails"
          }
        >
          <Play className="h-4 w-4" />
          Iniciar Onboarding
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar geração de emails</DialogTitle>
          <DialogDescription>
            Escolha como deseja disparar o pipeline de geração para essa loja.
          </DialogDescription>
        </DialogHeader>

        {conflictBatchId && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Batch em andamento
            </div>
            <div className="mt-1 text-xs">
              ID: <span className="font-mono">{conflictBatchId.slice(0, 8)}</span>.
              Use Retomar para continuar ou Refazer para descartar.
            </div>
          </div>
        )}

        <div className="space-y-3 py-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full justify-start"
            onClick={() => run("fresh")}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Iniciar do zero
          </Button>

          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={() => run("resume")}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Retomar batch atual
          </Button>

          {!confirmingRedo ? (
            <Button
              variant="destructive"
              size="lg"
              className="w-full justify-start"
              onClick={() => setConfirmingRedo(true)}
              disabled={loading}
            >
              <AlertTriangle className="h-4 w-4" />
              Refazer (descarta atual)
            </Button>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
              <div className="font-medium text-red-900">
                Confirma descartar batch atual?
              </div>
              <div className="mt-1 text-xs text-red-800">
                Emails em andamento serão marcados como falhos (
                <span className="font-mono">superseded_by_redo</span>) e um novo
                batch será criado.
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => run("redo")}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Sim, refazer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRedo(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
