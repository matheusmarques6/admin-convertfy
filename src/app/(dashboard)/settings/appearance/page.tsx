"use client"

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
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
        <p className="text-muted-foreground">Configurações visuais do sistema</p>
      </div>

      <GlowCard color="primary" intensity="subtle">
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
      </GlowCard>

      <GlowCard color="primary" intensity="subtle">
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
                  <span className="text-xs text-primary-foreground font-mono">#5327F2</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Primária</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-[#4B53F2] flex items-center justify-center">
                  <span className="text-xs text-white font-mono">#4B53F2</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Accent</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-background border flex items-center justify-center">
                  <span className="text-xs text-foreground font-mono">#141C26</span>
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
                <div className="h-12 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
                  <span className="text-xs text-success font-medium">Sucesso</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center">
                  <span className="text-xs text-warning font-medium">Aviso</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                  <span className="text-xs text-destructive font-medium">Erro</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-info/10 border border-info/20 flex items-center justify-center">
                  <span className="text-xs text-info font-medium">Info</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </GlowCard>
    </div>
  )
}
