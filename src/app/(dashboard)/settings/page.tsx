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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const settingsGroups = [
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

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie as configurações do sistema
        </p>
      </div>

      {/* Settings Groups */}
      {settingsGroups.map((group) => (
        <div key={group.title} className="space-y-4">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {group.items.map((item) => (
              <Card key={item.href} className="hover:border-primary/50 transition-colors">
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
