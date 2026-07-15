"use client"

import { useCallback, useEffect, useState } from "react"
import { Calendar, CheckCircle2, AlertTriangle, Loader2, Unplug } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { toast } from "@/lib/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

interface OrgStatus {
  connected: boolean
  google_email: string | null
  is_active: boolean
  last_synced_at: string | null
  sync_error: string | null
}

/**
 * Card da conta Google compartilhada da organizacao ("convertfy").
 *
 * Essa conta central concentra TODAS as reunioes de clientes: cada reuniao
 * de cliente e criada na agenda dela, e cada convocado entra como convidado
 * (aparecendo na agenda pessoal dele). So admin/dev/coo/owner gerenciam —
 * para os demais, o endpoint responde 403 e o card nao aparece.
 */
export function OrgGoogleCalendarCard() {
  const [status, setStatus] = useState<OrgStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/org")
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      if (!res.ok) throw new Error()
      setStatus(await res.json())
    } catch {
      setStatus(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleConnect = () => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/api/integrations/google/authorize?scope=calendar&target=org&return_to=${returnTo}`
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/org", { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao desconectar")
      }
      toast({ title: "Conta central desconectada" })
      await load()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao desconectar",
        description: error instanceof Error ? error.message : "Tente novamente",
      })
    } finally {
      setIsDisconnecting(false)
      setDialogOpen(false)
    }
  }

  // Só admins gerenciam a conta central — para os demais o card some.
  if (forbidden) return null

  if (isLoading) {
    return <Card className="p-4 h-[92px] animate-pulse bg-gray-50 dark:bg-[#1A1D29]" />
  }

  const connected = status?.connected && status?.is_active

  return (
    <>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <Calendar className="h-5 w-5" style={{ color: "#1F1F1F" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
                Google Calendar da Convertfy
              </h4>
              {connected ? (
                <Badge variant="positive" showDot={false} className="text-[10px]">Conectado</Badge>
              ) : (
                <Badge variant="neutral" showDot={false} className="text-[10px]">Desconectado</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-0.5 line-clamp-1">
              Agenda central com todas as reuniões de clientes
            </p>

            {connected && status?.google_email && (
              <p className="text-xs text-gray-600 dark:text-[#A9B0C0] mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {status.google_email}
                {status.last_synced_at && (
                  <span className="text-gray-400">
                    · sync {formatDistanceToNow(new Date(status.last_synced_at), { addSuffix: true, locale: ptBR })}
                  </span>
                )}
              </p>
            )}

            {status && !status.is_active && status.sync_error && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {status.sync_error}
              </p>
            )}

            <div className="mt-2">
              {connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDialogOpen(true)}
                >
                  <Unplug className="h-3 w-3 mr-1" />
                  Desconectar
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs" onClick={handleConnect}>
                  Conectar conta central
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta central?</AlertDialogTitle>
            <AlertDialogDescription>
              As reuniões de clientes deixarão de sincronizar com a agenda central
              da Convertfy até que a conta seja reconectada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDisconnect()
              }}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
