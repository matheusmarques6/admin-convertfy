import Link from "next/link"
import { User, Settings2, Users, Palette, Plug, Sparkles, Wrench } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PageHeader } from "@/components/ui/page-header"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { type LucideIcon } from "lucide-react"

interface SettingSection {
  title: string
  description: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
}

const SETTINGS_SECTIONS: SettingSection[] = [
  {
    title: "Conta",
    description: "Dados pessoais, empresa e senha",
    icon: User,
    href: "/admin/settings/account",
  },
  {
    title: "Preferências",
    description: "Notificações, aparência e tema",
    icon: Settings2,
    href: "/admin/settings/preferences",
  },
  {
    title: "Equipe",
    description: "Usuários, roles e permissões",
    icon: Users,
    href: "/admin/settings/team",
    adminOnly: true,
  },
  {
    title: "Personalização",
    description: "Campos custom, tags e templates de email",
    icon: Palette,
    href: "/admin/settings/customize",
    adminOnly: true,
  },
  {
    title: "Integrações",
    description: "Shopify, Klaviyo, Asaas, Wise e outras conexões",
    icon: Plug,
    href: "/admin/settings/integrations",
  },
  {
    title: "Templates IA",
    description: "Prompts reutilizáveis com variáveis pra o assistente Claude",
    icon: Sparkles,
    href: "/admin/settings/ai-templates",
    adminOnly: true,
  },
  {
    title: "Manutenção",
    description: "Reconciliar tasks legadas e outras ações administrativas",
    icon: Wrench,
    href: "/admin/settings/manutencao",
    adminOnly: true,
  },
]

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role === "super_admin" || profile?.role === "admin") {
      isAdmin = true
    } else {
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      isAdmin = membership?.role === "owner" || membership?.role === "admin"
    }
  }

  const visibleSections = SETTINGS_SECTIONS.filter(
    (s) => !s.adminOnly || isAdmin
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta, equipe e integrações."
      />

      <div className={cn(
        "grid gap-3",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}>
        {visibleSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white",
              "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
              "p-5 text-left block",
              "hover:border-[rgba(0,0,0,0.15)] dark:hover:border-[rgba(255,255,255,0.14)]",
              "hover:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)]",
              "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
              "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
              "transition-all duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
              "min-h-[44px]",
            )}
          >
            <Icon
              icon={section.icon}
              size={20}
              className="text-gray-400 dark:text-[#5C6378] mb-3"
            />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {section.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-1 leading-relaxed">
              {section.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
