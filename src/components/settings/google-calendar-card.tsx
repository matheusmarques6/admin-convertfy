"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Calendar,
  Check,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Unplug,
  ExternalLink,
  Video,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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
import { useGoogleCalendarStatus } from "@/lib/hooks/use-api-data"
import { toast, useToast } from "@/lib/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarOption {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

interface CalendarSettingsState {
  selected_calendar_id: string
  auto_meet: boolean
}

/**
 * Google Calendar integration card for the admin settings page.
 *
 * States:
 * - Disconnected: connect button
 * - Connected + active: email, last sync, disconnect button
 * - Connected + inactive (error): error message, reconnect button
 */
export function GoogleCalendarCard() {
  const {
    connected,
    googleEmail,
    isActive,
    lastSyncedAt,
    syncError,
    refresh,
    isLoading,
  } = useGoogleCalendarStatus()

  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleConnect = () => {
    window.location.href = "/api/integrations/google/authorize?scope=calendar&context=admin"
  }

  const handleReconnect = () => {
    window.location.href = "/api/integrations/google/authorize?scope=calendar&context=admin"
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/disconnect", {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao desconectar")
      }

      toast({
        title: "Google Calendar desconectado",
        description: "Sua conta foi desconectada com sucesso.",
      })
      await refresh()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao desconectar",
        description: error instanceof Error ? error.message : "Tente novamente",
      })
    } finally {
      setIsDisconnecting(false)
      setDisconnectDialogOpen(false)
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="rounded-[8px] border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-500/10">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Google Calendar</CardTitle>
              <CardDescription className="mt-1">Carregando...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Disconnected state
  if (!connected) {
    return (
      <Card className="rounded-[8px] border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-500/10">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Google Calendar</CardTitle>
              <CardDescription className="mt-1">
                Sincronize reunioes automaticamente com seu Google Calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <ul className="space-y-1">
                <li className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  Criar reunioes com link Google Meet
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  Sincronizar eventos com Calendar
                </li>
              </ul>
            </div>
            <Button size="sm" className="w-full" onClick={handleConnect}>
              <GoogleCalendarIcon className="mr-2 h-4 w-4" />
              Conectar Google Calendar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Connected but inactive (error state)
  if (!isActive) {
    return (
      <Card className="rounded-[8px] border border-destructive/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-blue-500/10">
                <Calendar className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">Google Calendar</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="neutral" showDot={false} className="text-destructive border-destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Erro
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {googleEmail && (
              <p className="text-sm text-muted-foreground">{googleEmail}</p>
            )}
            {syncError && (
              <p className="text-xs text-destructive">{syncError}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleReconnect}>
                <ExternalLink className="mr-1 h-4 w-4" />
                Reconectar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDisconnectDialogOpen(true)}
              >
                <Unplug className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>

        <DisconnectDialog
          open={disconnectDialogOpen}
          onOpenChange={setDisconnectDialogOpen}
          onConfirm={handleDisconnect}
          isLoading={isDisconnecting}
        />
      </Card>
    )
  }

  // Connected and active
  return (
    <Card className="rounded-[8px] border border-success/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-500/10">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Google Calendar</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="neutral" showDot={false} className="text-success border-success">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {googleEmail && (
            <p className="text-sm text-muted-foreground">{googleEmail}</p>
          )}
          {lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Ultima sync:{" "}
              {formatDistanceToNow(new Date(lastSyncedAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => setDisconnectDialogOpen(true)}
          >
            <Unplug className="mr-2 h-4 w-4" />
            Desconectar
          </Button>

          {/* Calendar Settings (AC 42.8.4, AC 42.8.5) */}
          <CalendarSettings />
        </div>
      </CardContent>

      <DisconnectDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        onConfirm={handleDisconnect}
        isLoading={isDisconnecting}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CalendarSettings — Calendar selector + auto-meet toggle (AC 42.8.4, AC 42.8.5)
// ---------------------------------------------------------------------------

function CalendarSettings() {
  const { toast: toastFn } = useToast()
  const [calendars, setCalendars] = useState<CalendarOption[]>([])
  const [settings, setSettings] = useState<CalendarSettingsState>({
    selected_calendar_id: "primary",
    auto_meet: true,
  })
  const [loadingCalendars, setLoadingCalendars] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [savingCalendar, setSavingCalendar] = useState(false)
  const [savingMeet, setSavingMeet] = useState(false)

  const fetchCalendars = useCallback(async () => {
    setLoadingCalendars(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/calendars")
      if (!res.ok) return
      const data = await res.json()
      setCalendars(data.calendars || [])
    } catch {
      // Silently fail — calendar list is not critical
    } finally {
      setLoadingCalendars(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/settings")
      if (!res.ok) return
      const data = await res.json()
      setSettings({
        selected_calendar_id: data.selected_calendar_id || "primary",
        auto_meet: data.auto_meet ?? true,
      })
    } catch {
      // Silently fail
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendars()
    fetchSettings()
  }, [fetchCalendars, fetchSettings])

  async function handleCalendarChange(calendarId: string) {
    setSavingCalendar(true)
    const previousValue = settings.selected_calendar_id

    // Optimistic update
    setSettings((prev) => ({ ...prev, selected_calendar_id: calendarId }))

    try {
      const res = await fetch("/api/integrations/google/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_calendar_id: calendarId }),
      })

      if (!res.ok) throw new Error("Failed to save")

      const data = await res.json()
      setSettings((prev) => ({
        ...prev,
        selected_calendar_id: data.selected_calendar_id,
      }))

      toastFn({
        title: "Calendario atualizado",
        description: "Novas reunioes serao criadas neste calendario.",
      })
    } catch {
      // Revert on error
      setSettings((prev) => ({ ...prev, selected_calendar_id: previousValue }))
      toastFn({
        variant: "destructive",
        title: "Erro",
        description: "Nao foi possivel salvar o calendario.",
      })
    } finally {
      setSavingCalendar(false)
    }
  }

  async function handleAutoMeetChange(checked: boolean) {
    setSavingMeet(true)
    const previousValue = settings.auto_meet

    // Optimistic update
    setSettings((prev) => ({ ...prev, auto_meet: checked }))

    try {
      const res = await fetch("/api/integrations/google/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_meet: checked }),
      })

      if (!res.ok) throw new Error("Failed to save")

      const data = await res.json()
      setSettings((prev) => ({ ...prev, auto_meet: data.auto_meet }))

      toastFn({
        title: checked ? "Google Meet ativado" : "Google Meet desativado",
        description: checked
          ? "Links do Meet serao criados automaticamente."
          : "Reunioes serao criadas sem link do Meet.",
      })
    } catch {
      // Revert on error
      setSettings((prev) => ({ ...prev, auto_meet: previousValue }))
      toastFn({
        variant: "destructive",
        title: "Erro",
        description: "Nao foi possivel salvar a preferencia.",
      })
    } finally {
      setSavingMeet(false)
    }
  }

  const isLoading = loadingCalendars || loadingSettings

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2 border-t">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-3 border-t">
      {/* Calendar Selector (AC 42.8.4) */}
      <div className="space-y-2">
        <Label htmlFor="calendar-select" className="text-xs font-medium">
          Calendario para reunioes
        </Label>
        <Select
          value={settings.selected_calendar_id}
          onValueChange={handleCalendarChange}
          disabled={savingCalendar || calendars.length === 0}
        >
          <SelectTrigger id="calendar-select" className="w-full">
            <SelectValue placeholder="Selecione um calendario" />
          </SelectTrigger>
          <SelectContent>
            {calendars.map((cal) => (
              <SelectItem key={cal.id} value={cal.id}>
                <div className="flex items-center gap-2">
                  <span>{cal.summary}</span>
                  {cal.primary && (
                    <span className="text-xs text-muted-foreground">(Principal)</span>
                  )}
                  {cal.id === settings.selected_calendar_id && (
                    <Check className="h-3 w-3 text-success ml-auto" />
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {savingCalendar && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Salvando...
          </div>
        )}
        {calendars.length === 0 && !loadingCalendars && (
          <p className="text-xs text-muted-foreground">
            Nenhum calendario com permissao de escrita encontrado.
          </p>
        )}
      </div>

      {/* Auto Meet Toggle (AC 42.8.5) */}
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Video className="h-4 w-4 text-blue-500 shrink-0" />
          <div>
            <Label htmlFor="auto-meet" className="text-sm cursor-pointer">
              Google Meet automatico
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gera link do Meet ao sincronizar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savingMeet && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="auto-meet"
            checked={settings.auto_meet}
            onCheckedChange={handleAutoMeetChange}
            disabled={savingMeet}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disconnect confirmation dialog (AC 42.7.5)
// ---------------------------------------------------------------------------

function DisconnectDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar Google Calendar?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza? Reunioes futuras nao serao mais sincronizadas com seu
            Google Calendar e links de Google Meet nao serao gerados automaticamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="mr-2 h-4 w-4" />
            )}
            Desconectar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Google Calendar SVG icon (simplified brand icon)
// ---------------------------------------------------------------------------

function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 2v4M8 2v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
