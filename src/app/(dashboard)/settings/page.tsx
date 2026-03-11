import Link from "next/link"
import {
  User,
  Building,
  Bell,
  Palette,
  Key,
  Users,
  Tag,
  Layers,
  Plug,
  Mail,
  Settings,
  ChevronRight,
} from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { type LucideIcon } from "lucide-react"

interface SettingItem {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

interface SettingGroup {
  title: string
  items: SettingItem[]
  adminOnly?: boolean
}

const settingsGroups: SettingGroup[] = [
  {
    title: "Conta",
    items: [
      {
        title: "Perfil",
        description: "Gerencie suas informações pessoais",
        href: "/settings/profile",
        icon: User,
      },
      {
        title: "Empresa",
        description: "Configure as informações da sua empresa",
        href: "/settings/company",
        icon: Building,
      },
      {
        title: "Notificações",
        description: "Configure suas preferências de notificação",
        href: "/settings/notifications",
        icon: Bell,
      },
      {
        title: "Aparência",
        description: "Personalize a interface do sistema",
        href: "/settings/appearance",
        icon: Palette,
      },
    ],
  },
  {
    title: "Equipe",
    adminOnly: true,
    items: [
      {
        title: "Usuários",
        description: "Gerencie os usuários do sistema",
        href: "/settings/users",
        icon: Users,
      },
      {
        title: "Permissões",
        description: "Configure as permissões por cargo",
        href: "/settings/permissions",
        icon: Key,
      },
    ],
  },
  {
    title: "Personalização",
    adminOnly: true,
    items: [
      {
        title: "Campos Personalizados",
        description: "Crie campos extras para clientes e deals",
        href: "/settings/custom-fields",
        icon: Layers,
      },
      {
        title: "Tags",
        description: "Gerencie as tags do sistema",
        href: "/settings/tags",
        icon: Tag,
      },
      {
        title: "Templates de Email",
        description: "Crie e edite templates de email",
        href: "/settings/email-templates",
        icon: Mail,
      },
    ],
  },
  {
    title: "Integrações",
    items: [
      {
        title: "APIs e Integrações",
        description: "Conecte com Asaas, Meta, Google, Klaviyo e mais",
        href: "/settings/integrations",
        icon: Plug,
      },
    ],
  },
]

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    // Check profile role (super_admin/admin)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role === "super_admin" || profile?.role === "admin") {
      isAdmin = true
    } else {
      // Check org membership role (owner/admin)
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      isAdmin = membership?.role === "owner" || membership?.role === "admin"
    }
  }

  const visibleGroups = settingsGroups.filter(
    (group) => !group.adminOnly || isAdmin
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as configurações da sua conta, equipe e integrações do sistema.
          </p>
        </div>
      </div>

      {/* Settings Groups */}
      {visibleGroups.map((group) => (
        <div key={group.title} className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className="h-full rounded-xl border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
                  <CardHeader className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors duration-200 group-hover:bg-primary/15">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <CardTitle className="flex items-center justify-between text-base font-semibold">
                          {item.title}
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {item.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
