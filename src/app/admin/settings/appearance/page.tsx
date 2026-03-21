"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Palette, Moon, Check, Info } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export default function AppearancePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings">
            <Icon icon={ArrowLeft} size={20} />
          </Link>
        </Button>
        <p className="text-muted-foreground">Configurações visuais do sistema</p>
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon={Palette} size={20} />
            Tema
          </CardTitle>
          <CardDescription>O sistema utiliza tema escuro por padrão</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative rounded-lg border-2 border-primary p-4 bg-card">
              <div className="absolute top-2 right-2">
                <Icon icon={Check} customSize={12} className="text-primary" />
              </div>
              <div className="flex flex-col items-center gap-3">
                <Icon icon={Moon} customSize={32} className="text-primary" />
                <span className="font-medium">Modo Escuro</span>
                <span className="text-xs text-muted-foreground text-center">
                  Tema padrão do sistema
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Icon icon={Info} size={16} className="text-muted-foreground mt-0.5" />
            <p className="text-sm text-muted-foreground">
              O Convertfy utiliza exclusivamente o tema escuro para proporcionar
              melhor experiência visual e reduzir a fadiga ocular durante uso prolongado.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border">
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
                  <span className="text-xs text-primary-foreground font-mono">Primary</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Primária</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-xs text-primary-foreground font-mono">Accent</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Accent</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-background border flex items-center justify-center">
                  <span className="text-xs text-foreground font-mono">Background</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Background</p>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-card border flex items-center justify-center">
                  <span className="text-xs text-foreground font-mono">Card</span>
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
                <div className="h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="text-xs text-primary font-medium">Info</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
