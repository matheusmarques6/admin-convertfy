"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Palette, Moon, Sun, Monitor } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"

export default function AppearancePage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Aparência</h1>
          <p className="text-muted-foreground">Personalize a interface do sistema</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Tema
          </CardTitle>
          <CardDescription>Escolha o tema visual do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              className="h-24 flex-col gap-2"
              onClick={() => setTheme("light")}
            >
              <Sun className="h-6 w-6" />
              Claro
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              className="h-24 flex-col gap-2"
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-6 w-6" />
              Escuro
            </Button>
            <Button
              variant={theme === "system" ? "default" : "outline"}
              className="h-24 flex-col gap-2"
              onClick={() => setTheme("system")}
            >
              <Monitor className="h-6 w-6" />
              Sistema
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
