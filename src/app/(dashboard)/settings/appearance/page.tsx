"use client"

<<<<<<< HEAD
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Palette, Moon, Check, Info } from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export default function AppearancePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-5 w-5" />
=======
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

  // currentTheme could be used for preview, currently just using theme
  void (theme === "system" ? systemTheme : theme)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Aparência</h1>
<<<<<<< HEAD
          <p className="text-muted-foreground">Configurações visuais do sistema</p>
        </div>
      </div>

=======
          <p className="text-muted-foreground">
            Personalize a interface do sistema
          </p>
        </div>
      </div>

      {/* Theme Selection */}
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Tema
          </CardTitle>
<<<<<<< HEAD
          <CardDescription>O sistema utiliza tema escuro por padrão</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative rounded-lg border-2 border-primary p-4 bg-card">
              <div className="absolute top-2 right-2">
                <div className="rounded-full bg-primary p-1">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <Moon className="h-8 w-8 text-primary" />
                <span className="font-medium">Modo Escuro</span>
                <span className="text-xs text-muted-foreground text-center">
                  Tema padrão do sistema
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
            <p className="text-sm text-muted-foreground">
              O Convertfy utiliza exclusivamente o tema escuro para proporcionar
              melhor experiência visual e reduzir a fadiga ocular durante uso prolongado.
            </p>
=======
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
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
          </div>
        </CardContent>
      </Card>

<<<<<<< HEAD
      <Card>
        <CardHeader>
          <CardTitle>Identidade Visual</CardTitle>
          <CardDescription>Cores e logo do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-3">Logo</h4>
            <div className="flex items-center gap-6 p-4 rounded-lg bg-muted/50">
              <Logo size="lg" />
              <div className="h-12 w-px bg-border" />
              <Logo size="md" />
              <div className="h-12 w-px bg-border" />
              <Logo size="sm" />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Paleta de Cores</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-xs text-primary-foreground font-mono">#3a68fc</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Primária</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-[#8B5CF6] flex items-center justify-center">
                  <span className="text-xs text-white font-mono">#8B5CF6</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Accent</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-background border flex items-center justify-center">
                  <span className="text-xs text-foreground font-mono">#080808</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Background</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-card border flex items-center justify-center">
                  <span className="text-xs text-foreground font-mono">#0d0d0d</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Card</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Status</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <span className="text-xs text-emerald-500 font-medium">Sucesso</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <span className="text-xs text-amber-500 font-medium">Aviso</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <span className="text-xs text-red-500 font-medium">Erro</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <span className="text-xs text-blue-500 font-medium">Info</span>
                </div>
              </div>
=======
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
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
            </div>
          </div>
        </CardContent>
      </Card>
<<<<<<< HEAD
=======

      {/* Back */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/settings">Voltar</Link>
        </Button>
      </div>
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
    </div>
  )
}
