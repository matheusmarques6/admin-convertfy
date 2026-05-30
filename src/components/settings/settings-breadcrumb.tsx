"use client"

import { usePathname } from "next/navigation"
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs"
import { ROUTES } from "@/lib/routes"

const SEGMENT_LABELS: Record<string, string> = {
  settings: "Configuracoes",
  account: "Conta",
  preferences: "Preferencias",
  team: "Equipe",
  briefings: "Briefings",
  customize: "Personalizacao",
  integrations: "Integracoes",
  profile: "Perfil",
  company: "Empresa",
  appearance: "Aparencia",
  notifications: "Notificacoes",
  users: "Usuarios",
  permissions: "Permissoes",
  "custom-fields": "Campos custom",
  tags: "Tags",
  "email-templates": "Templates de email",
}

/**
 * Breadcrumb automatico para `/admin/settings/**`. Le o pathname e
 * mapeia cada segmento ao label legivel. Esconde quando esta na pagina
 * raiz (`/admin/settings`) — ja tem PageHeader proprio.
 */
export function SettingsBreadcrumb() {
  const pathname = usePathname()
  if (!pathname.startsWith("/admin/settings")) return null

  const segments = pathname.replace(/^\/admin\//, "").split("/").filter(Boolean)
  if (segments.length <= 1) return null // pagina raiz

  const items: BreadcrumbItem[] = []
  let acc = "/admin"
  segments.forEach((seg, i) => {
    acc += `/${seg}`
    const isLast = i === segments.length - 1
    items.push({
      label: SEGMENT_LABELS[seg] ?? seg,
      href: isLast ? undefined : seg === "settings" ? ROUTES.ADMIN.SETTINGS.ROOT : acc,
    })
  })

  return <Breadcrumbs items={items} className="px-1" />
}
