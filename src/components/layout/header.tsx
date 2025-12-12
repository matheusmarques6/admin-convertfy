"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import {
  Bell,
  Search,
  Moon,
  Sun,
  Menu,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients": "Clientes",
  "/pipeline": "Pipeline de Vendas",
  "/financial": "Financeiro",
  "/meetings": "Reuniões",
  "/reports": "Relatórios",
  "/automations": "Automações",
  "/tools": "Ferramentas",
  "/settings": "Configurações",
}

interface HeaderProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [notifications] = useState([
    { id: 1, title: "Pagamento atrasado", description: "Cliente XYZ está com pagamento pendente há 5 dias", time: "2h" },
    { id: 2, title: "Reunião em 1 hora", description: "Reunião agendada com Cliente ABC", time: "5h" },
    { id: 3, title: "Meta atingida!", description: "Você atingiu 100% da meta mensal", time: "1d" },
  ])

  const getPageTitle = () => {
    for (const [path, title] of Object.entries(pageTitles)) {
      if (pathname.startsWith(path)) {
        return title
      }
    }
    return "Convertfy Admin"
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[260px]">
          <Sidebar user={user} />
        </SheetContent>
      </Sheet>

      {/* Page Title */}
      <h1 className="text-xl font-semibold hidden md:block">{getPageTitle()}</h1>

      {/* Search */}
      <div className="flex-1 max-w-md ml-auto mr-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes, deals, relatórios..."
            className="pl-9 bg-muted/50"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Alternar tema</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {notifications.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notificações
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary">
                Marcar todas como lidas
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="flex flex-col items-start p-3 cursor-pointer">
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium text-sm">{notification.title}</span>
                  <span className="text-xs text-muted-foreground">{notification.time}</span>
                </div>
                <span className="text-xs text-muted-foreground mt-1">{notification.description}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-primary cursor-pointer">
              Ver todas as notificações
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
