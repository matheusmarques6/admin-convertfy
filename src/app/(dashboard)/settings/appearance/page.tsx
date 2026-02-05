"use client"

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
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Aparência</h1>
          <p className="text-muted-foreground">Configurações visuais do sistema</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Tema
          </CardTitle>
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
          </div>
        </CardContent>
      </Card>

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
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
