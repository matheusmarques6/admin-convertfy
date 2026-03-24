"use client"

import { useState, useEffect } from "react"
import { Mail, Bell, Inbox, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── NotificationToggle ──────────────────────────────────────────────────────

function NotificationToggle({ title, description, icon: IconComp, checked, onCheckedChange, compact }: {
  title: string
  description: string
  icon?: LucideIcon
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  compact?: boolean
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4",
      compact ? "py-3" : "py-4",
      "border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-0",
      "min-h-[44px]",
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {IconComp && (
          <Icon icon={IconComp} size={compact ? 16 : 20} className="text-gray-400 dark:text-[#5C6378] shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-[#EAEDF3]">{title}</p>
          <p className={cn("text-gray-500 dark:text-[#8B92A5] mt-0.5", compact ? "text-[11px]" : "text-xs")}>
            {description}
          </p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

// ── ThemeOption ──────────────────────────────────────────────────────────────

function ThemeOption({ label, selected, onClick, preview }: {
  label: string
  selected: boolean
  onClick: () => void
  preview: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-[8px] border p-3 text-center transition-all duration-150",
        "min-h-[44px]",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
        "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
        selected
          ? "border-[#4E62D8] dark:border-[#7B8CEA] shadow-[0_0_0_1px_#4E62D8] dark:shadow-[0_0_0_1px_#7B8CEA]"
          : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hover:border-[rgba(0,0,0,0.15)]",
      )}
    >
      <div className={cn("w-full h-10 rounded-[4px] border mb-2", preview)} />
      <span className={cn(
        "text-xs font-medium",
        selected ? "text-[#4E62D8] dark:text-[#7B8CEA]" : "text-gray-600 dark:text-[#8B92A5]",
      )}>
        {label}
      </span>
    </button>
  )
}

// ── PreferencesPage ─────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
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
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-[8px]" />
        <Skeleton className="h-48 rounded-[8px]" />
      </div>
    )
  }

  const categories = Object.keys(prefLabels)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferências"
        description="Configure notificações e aparência."
        breadcrumb={[
          { label: "Configurações", href: "/admin/settings" },
          { label: "Preferências" },
        ]}
      />

      <div className="max-w-2xl space-y-6">
        {/* Section 1: Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Notificações</CardTitle>
            <CardDescription>Escolha como e quando receber notificações.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            <NotificationToggle
              title="Email"
              description="Receber notificações por email"
              icon={Mail}
              checked={prefs.email_system_alerts}
              onCheckedChange={() => togglePref("email_system_alerts")}
            />
            <NotificationToggle
              title="Push (Navegador)"
              description="Notificações push no navegador"
              icon={Bell}
              checked={prefs.push_system_alerts}
              onCheckedChange={() => togglePref("push_system_alerts")}
            />
            <NotificationToggle
              title="In-App"
              description="Badge e lista de notificações dentro do admin"
              icon={Inbox}
              checked={prefs.push_new_deal}
              onCheckedChange={() => togglePref("push_new_deal")}
            />

            <div className="pt-4 mt-4 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <p className="text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] mb-3">
                Tipos de notificação
              </p>
              <div className="space-y-0">
                {categories.map((cat) => {
                  const emailKey = `email_${cat}` as keyof Preferences
                  return (
                    <NotificationToggle
                      key={cat}
                      title={prefLabels[cat]}
                      description={`Notificar quando: ${prefLabels[cat].toLowerCase()}`}
                      checked={prefs[emailKey]}
                      onCheckedChange={() => togglePref(emailKey)}
                      compact
                    />
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Aparência</CardTitle>
            <CardDescription>Customize o visual do admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-gray-700 dark:text-[#8B92A5] mb-3">
              Tema
            </p>
            <div className="grid grid-cols-3 gap-3">
              <ThemeOption
                label="Claro"
                selected={theme === "light"}
                onClick={() => setTheme("light")}
                preview="bg-white border-gray-200"
              />
              <ThemeOption
                label="Escuro"
                selected={theme === "dark"}
                onClick={() => setTheme("dark")}
                preview="bg-[#1A1D27] border-[#242836]"
              />
              <ThemeOption
                label="Sistema"
                selected={theme === "system"}
                onClick={() => setTheme("system")}
                preview="bg-gradient-to-r from-white to-[#1A1D27] border-gray-300"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
