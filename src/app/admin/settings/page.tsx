import Link from "next/link"
import {
  User,
  Building,
  Puzzle,
  Plug,
  Settings,
  ChevronRight,
  Users,
} from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { type LucideIcon } from "lucide-react"

interface SettingItem {
  title: string
  description: string
  href: string
  icon: LucideIcon
  badge?: string
}

interface SettingGroup {
  items: SettingItem[]
  adminOnly?: boolean
}

const settingsGroups: SettingGroup[] = [
  {
    items: [
      {
        title: "Minha Conta",
        description: "Perfil, aparencia, notificacoes e seguranca",
        href: "/settings/profile",
        icon: User,
      },
      {
        title: "Empresa",
        description: "Dados da organizacao, CNPJ e endereco",
        href: "/settings/company",
        icon: Building,
      },
      {
        title: "Equipe e Permissoes",
        description: "Usuarios, cargos e controle de acesso",
        href: "/settings/users",
        icon: Users,
        badge: "Admin",
      },
      {
        title: "Personalizacao",
        description: "Campos customizados, tags e templates de email",
        href: "/settings/custom-fields",
        icon: Puzzle,
        badge: "Admin",
      },
      {
        title: "Integracoes",
        description: "Asaas, Meta, Google, Klaviyo e mais",
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

  // Filter admin-only items
  const items = settingsGroups[0].items.filter(
    (item) => !item.badge || (item.badge === "Admin" && isAdmin) || item.badge !== "Admin"
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie sua conta, equipe e integracoes do sistema.
          </p>
        </div>
      </div>

      {/* Settings Grid - 5 consolidated items */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <Card className="h-full rounded-xl border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
              <CardHeader className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors duration-200 group-hover:bg-primary/15">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <CardTitle className="flex items-center justify-between text-base font-semibold">
                      <span className="flex items-center gap-2">
                        {item.title}
                        {item.badge && isAdmin && (
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {item.badge}
                          </span>
                        )}
                      </span>
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
  )
}
