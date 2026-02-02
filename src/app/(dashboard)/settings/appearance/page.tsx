"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Moon, Sun, Monitor, Palette } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const themes = [
  {
    value: "light",
    label: "Claro",
    icon: Sun,
    description: "Tema claro para ambientes bem iluminados",
  },
  {
    value: "dark",
    label: "Escuro",
    icon: Moon,
    description: "Tema escuro para reduzir cansaço visual",
  },
  {
    value: "system",
    label: "Sistema",
    icon: Monitor,
    description: "Segue a preferência do seu sistema operacional",
  },
]

export default function AppearanceSettingsPage() {
  const { theme, setTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentTheme = theme === "system" ? systemTheme : theme

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Aparência</h1>
          <p className="text-muted-foreground">
            Personalize a interface do sistema
          </p>
        </div>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Tema
          </CardTitle>
          <CardDescription>
            Escolha o tema visual do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {themes.map((t) => {
              const Icon = t.icon
              const isSelected = theme === t.value

              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors w-full text-left",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg p-3",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Pré-visualização</CardTitle>
          <CardDescription>
            Veja como o sistema aparece com o tema atual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                C
              </div>
              <div>
                <p className="font-medium">Convertfy Admin</p>
                <p className="text-sm text-muted-foreground">
                  Sistema de Gestão
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="h-16 rounded-lg bg-primary/10" />
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-secondary" />
            </div>
            <div className="flex gap-2">
              <Button size="sm">Primário</Button>
              <Button size="sm" variant="secondary">
                Secundário
              </Button>
              <Button size="sm" variant="outline">
                Outline
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Back */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/settings">Voltar</Link>
        </Button>
      </div>
    </div>
  )
}
