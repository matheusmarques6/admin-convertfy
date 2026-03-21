"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Mail, Smartphone, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/hooks/use-toast"

interface Preferences {
  email_new_deal: boolean
  email_deal_update: boolean
  email_client_update: boolean
  email_system_alerts: boolean
  push_new_deal: boolean
  push_deal_update: boolean
  push_client_update: boolean
  push_system_alerts: boolean
}

const defaultPrefs: Preferences = {
  email_new_deal: true, email_deal_update: true, email_client_update: false, email_system_alerts: true,
  push_new_deal: true, push_deal_update: false, push_client_update: false, push_system_alerts: true,
}

const prefLabels: Record<string, string> = {
  new_deal: "Novo deal criado",
  deal_update: "Atualização de deal",
  client_update: "Atualização de cliente",
  system_alerts: "Alertas do sistema",
}

export default function NotificationsPage() {
  const { toast } = useToast()
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id)
        if (data && data.length > 0) {
          const loaded = { ...defaultPrefs }
          for (const row of data) {
            if (row.preference_key in loaded) {
              (loaded as Record<string, boolean>)[row.preference_key] = row.enabled
            }
          }
          setPrefs(loaded)
        }
      } catch {
        // table may not exist
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function togglePref(key: keyof Preferences) {
    const newValue = !prefs[key]
    setPrefs((prev) => ({ ...prev, [key]: newValue }))
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from("notification_preferences").upsert(
        { user_id: user.id, preference_key: key, enabled: newValue },
        { onConflict: "user_id,preference_key" }
      )
    } catch {
      setPrefs((prev) => ({ ...prev, [key]: !newValue }))
      toast({ variant: "destructive", title: "Erro", description: "Erro ao salvar preferência." })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  const categories = Object.keys(prefLabels)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <p className="text-muted-foreground">Configure suas preferências de notificação</p>
      </div>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Notificações por Email</CardTitle>
          <CardDescription>Escolha quais eventos geram notificação por email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.map((cat) => {
            const key = `email_${cat}` as keyof Preferences
            return (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key}>{prefLabels[cat]}</Label>
                <Switch id={key} checked={prefs[key]} onCheckedChange={() => togglePref(key)} aria-label={`Ativar ou desativar notificação de ${prefLabels[cat]}`} />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Notificações Push</CardTitle>
          <CardDescription>Escolha quais eventos geram notificação push</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.map((cat) => {
            const key = `push_${cat}` as keyof Preferences
            return (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key}>{prefLabels[cat]}</Label>
                <Switch id={key} checked={prefs[key]} onCheckedChange={() => togglePref(key)} aria-label={`Ativar ou desativar notificação push de ${prefLabels[cat]}`} />
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
