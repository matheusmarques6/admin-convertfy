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
    <div className="space-y-6">
      {/* Header */}
      <p className="text-muted-foreground">
        Gerencie as configurações do sistema
      </p>

      {/* Settings Groups */}
      {visibleGroups.map((group) => (
        <div key={group.title} className="space-y-4">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {group.items.map((item) => (
              <Card key={item.href} className="rounded-xl border bg-card hover:border-primary/30 transition-colors">
                <Link href={item.href}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg p-2 bg-primary/10">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription>{item.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
