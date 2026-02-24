"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  FileText,
  ExternalLink,
  Clock,
  Hash,
  Pencil,
  RotateCcw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { toast } from "@/lib/hooks/use-toast"
import type { StoreBriefing, BriefingData } from "@/types/onboarding"

interface StoreBriefingViewProps {
  storeId: string
  briefing?: StoreBriefing | null
  onRefresh?: () => void
  onEditForm?: () => void
}

interface SectionConfig {
  key: keyof BriefingData
  title: string
  render: (data: BriefingData[keyof BriefingData]) => React.ReactNode
}

export function StoreBriefingView({
  storeId,
  briefing,
  onRefresh,
  onEditForm,
}: StoreBriefingViewProps) {
  const [regenerating, setRegenerating] = useState(false)

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch("/api/onboarding/store-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, mode: "regenerate" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({ title: "Briefing regenerado", description: `Versão ${data.version}` })
      onRefresh?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao regenerar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setRegenerating(false)
    }
  }

  if (!briefing) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-4">Nenhum briefing gerado ainda.</p>
          <div className="flex gap-2 justify-center">
            {onEditForm && (
              <Button variant="outline" onClick={onEditForm}>
                Preencher Formulário
              </Button>
            )}
            <Button onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Gerar Briefing
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = briefing.briefing_data

  const sections: SectionConfig[] = [
    {
      key: "dados_loja",
      title: "Dados da Loja",
      render: (d) => {
        const v = d as BriefingData["dados_loja"]
        return (
          <div className="grid gap-2 text-sm">
            <InfoRow label="Nome" value={v.nome} />
            <InfoRow label="URL" value={v.url} />
            <InfoRow label="Plataforma" value={v.plataforma} />
            <InfoRow label="Nicho" value={v.nicho} />
            <InfoRow label="País" value={v.pais} />
            <InfoRow label="Idioma" value={v.idioma} />
            <InfoRow label="Frete" value={v.frete_gratis} />
          </div>
        )
      },
    },
    {
      key: "codigo_colaborador",
      title: "Código Colaborador",
      render: (d) => {
        const v = d as BriefingData["codigo_colaborador"]
        return <InfoRow label="Shopify Code" value={v.shopify_code} />
      },
    },
    {
      key: "materiais_identidade",
      title: "Materiais de Identidade",
      render: (d) => {
        const v = d as BriefingData["materiais_identidade"]
        return (
          <div className="space-y-2 text-sm">
            {v.logo_url && <FileLink label="Logo" path={v.logo_url} />}
            {v.design_direction && <InfoRow label="Direção Visual" value={v.design_direction} />}
            {v.design_file_url && <FileLink label="Referência Visual" path={v.design_file_url} />}
            {v.brand_manual_url && <FileLink label="Manual da Marca" path={v.brand_manual_url} />}
            {!v.logo_url && !v.design_direction && !v.design_file_url && !v.brand_manual_url && (
              <p className="text-muted-foreground">Nenhum material enviado</p>
            )}
          </div>
        )
      },
    },
    {
      key: "foco_campanhas",
      title: "Foco das Campanhas",
      render: (d) => {
        const v = d as BriefingData["foco_campanhas"]
        return (
          <div className="space-y-2 text-sm">
            <Badge variant="secondary">{v.abordagem}</Badge>
            <p className="text-muted-foreground">{v.descricao}</p>
          </div>
        )
      },
    },
    {
      key: "publico",
      title: "Público-Alvo",
      render: (d) => {
        const v = d as BriefingData["publico"]
        return (
          <div className="space-y-2 text-sm">
            {v.target_audience && <InfoRow label="Público" value={v.target_audience} />}
            {v.price_sensitivity && <InfoRow label="Sensibilidade" value={v.price_sensitivity} />}
            <p className="text-muted-foreground">{v.perfil}</p>
          </div>
        )
      },
    },
    {
      key: "perfil_marca",
      title: "Perfil da Marca",
      render: (d) => {
        const v = d as BriefingData["perfil_marca"]
        return (
          <div className="space-y-2 text-sm">
            <Badge variant="secondary">{v.tipo}</Badge>
            <p className="text-muted-foreground">{v.descricao}</p>
          </div>
        )
      },
    },
    {
      key: "detalhes_adicionais",
      title: "Detalhes Adicionais",
      render: (d) => {
        const v = d as BriefingData["detalhes_adicionais"]
        return (
          <div className="space-y-2 text-sm">
            {v.notas && <InfoRow label="Notas" value={v.notas} />}
            {v.conceito_frete && <InfoRow label="Conceito Frete" value={v.conceito_frete} />}
            {!v.notas && !v.conceito_frete && <p className="text-muted-foreground">Sem detalhes</p>}
          </div>
        )
      },
    },
    {
      key: "resumo_performance",
      title: "Resumo de Performance",
      render: (d) => {
        const v = d as Record<string, unknown>
        if (!v || Object.keys(v).length === 0) {
          return <p className="text-muted-foreground text-sm">Dados de performance não disponíveis. Regenere o briefing para atualizar.</p>
        }
        if (v.status === "sem_dados" || v.status === "erro") {
          return <p className="text-muted-foreground text-sm">{(v.mensagem as string) || "Sem dados disponíveis"}</p>
        }
        const klaviyo = v.klaviyo as { receita_total?: number; receita_campanhas?: number; receita_flows?: number } | undefined
        return (
          <div className="space-y-2 text-sm">
            {v.periodo && <InfoRow label="Período" value={`Últimos ${v.periodo === "30d" ? "30 dias" : String(v.periodo)}`} />}
            {klaviyo && (
              <div className="space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Klaviyo</p>
                <InfoRow label="Receita Total" value={`R$ ${(klaviyo.receita_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Receita Campanhas" value={`R$ ${(klaviyo.receita_campanhas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Receita Flows" value={`R$ ${(klaviyo.receita_flows || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: "analise_anuncios",
      title: "Análise de Anúncios",
      render: (d) => {
        const v = d as Record<string, unknown>
        if (!v || Object.keys(v).length === 0) {
          return <p className="text-muted-foreground text-sm">Dados de anúncios não disponíveis. Regenere o briefing para atualizar.</p>
        }
        if (v.status === "sem_dados" || v.status === "erro") {
          return <p className="text-muted-foreground text-sm">{(v.mensagem as string) || "Sem dados disponíveis"}</p>
        }
        const metaAds = v.meta_ads as Record<string, unknown> | undefined
        const googleAds = v.google_ads as Record<string, unknown> | undefined
        return (
          <div className="space-y-3 text-sm">
            {v.periodo && <InfoRow label="Período" value={`Últimos ${v.periodo === "30d" ? "30 dias" : String(v.periodo)}`} />}
            {metaAds && metaAds.status === "conectado" && (
              <div className="space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Meta Ads</p>
                <InfoRow label="Gasto" value={`R$ ${(Number(metaAds.gasto_total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Receita" value={`R$ ${(Number(metaAds.receita_total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="ROAS" value={`${(Number(metaAds.roas) || 0).toFixed(2)}x`} />
                <InfoRow label="Impressões" value={String((Number(metaAds.impressoes) || 0).toLocaleString("pt-BR"))} />
                <InfoRow label="Cliques" value={String((Number(metaAds.cliques) || 0).toLocaleString("pt-BR"))} />
                <InfoRow label="Conversões" value={String(Number(metaAds.conversoes) || 0)} />
                <InfoRow label="CTR" value={`${(Number(metaAds.ctr) || 0).toFixed(2)}%`} />
                <InfoRow label="CPC" value={`R$ ${(Number(metaAds.cpc) || 0).toFixed(2)}`} />
              </div>
            )}
            {metaAds && metaAds.status === "nao_conectado" && (
              <p className="text-muted-foreground text-xs">Meta Ads: não conectado</p>
            )}
            {googleAds && googleAds.status === "conectado" && (
              <div className="space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Google Ads</p>
                <InfoRow label="Gasto" value={`R$ ${(Number(googleAds.gasto_total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Receita" value={`R$ ${(Number(googleAds.receita_total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <InfoRow label="ROAS" value={`${(Number(googleAds.roas) || 0).toFixed(2)}x`} />
                <InfoRow label="Impressões" value={String((Number(googleAds.impressoes) || 0).toLocaleString("pt-BR"))} />
                <InfoRow label="Cliques" value={String((Number(googleAds.cliques) || 0).toLocaleString("pt-BR"))} />
                <InfoRow label="Conversões" value={String(Number(googleAds.conversoes) || 0)} />
                <InfoRow label="CTR" value={`${(Number(googleAds.ctr) || 0).toFixed(2)}%`} />
                <InfoRow label="CPC" value={`R$ ${(Number(googleAds.cpc) || 0).toFixed(2)}`} />
              </div>
            )}
            {googleAds && googleAds.status === "nao_conectado" && (
              <p className="text-muted-foreground text-xs">Google Ads: não conectado</p>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Briefing da Loja</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span>v{briefing.version}</span>
              <Clock className="h-3 w-3 ml-2" />
              <span>{new Date(briefing.generated_at).toLocaleDateString("pt-BR")}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={regenerating}>
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Refazer
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEditForm && (
                  <DropdownMenuItem onClick={onEditForm}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Mudar dados do formulário
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleRegenerate} disabled={regenerating}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Continuar e refazer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {sections.map((section) => (
          <BriefingSection
            key={section.key}
            title={section.title}
            content={section.render(data[section.key])}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function BriefingSection({ title, content }: { title: string; content: React.ReactNode }) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium text-sm">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-8 pb-3">
        {content}
      </CollapsibleContent>
    </Collapsible>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[100px]">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

function FileLink({ label, path }: { label: string; path: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/upload/store-files?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.url) {
        window.open(data.url, "_blank")
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao abrir arquivo" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 text-primary hover:underline text-sm"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
      {label}
    </button>
  )
}
