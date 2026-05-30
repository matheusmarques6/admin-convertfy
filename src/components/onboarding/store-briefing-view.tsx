"use client"

import { useState, useCallback } from "react"
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
  Save,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
import { isRawTextBriefing, getRawText } from "@/lib/briefing/briefing-text"
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

/**
 * Converts structured BriefingData to a human-readable text for editing
 */
function briefingToText(data: BriefingData): string {
  const lines: string[] = []

  lines.push("## Dados da Loja")
  if (data.dados_loja) {
    const d = data.dados_loja
    if (d.nome) lines.push(`Nome: ${d.nome}`)
    if (d.url) lines.push(`URL: ${d.url}`)
    if (d.plataforma) lines.push(`Plataforma: ${d.plataforma}`)
    if (d.nicho) lines.push(`Nicho: ${d.nicho}`)
    if (d.pais) lines.push(`País: ${d.pais}`)
    if (d.idioma) lines.push(`Idioma: ${d.idioma}`)
    if (d.frete_gratis) lines.push(`Frete: ${d.frete_gratis}`)
  }

  lines.push("")
  lines.push("## Código Colaborador")
  if (data.codigo_colaborador?.shopify_code) {
    lines.push(`Shopify Code: ${data.codigo_colaborador.shopify_code}`)
  }

  lines.push("")
  lines.push("## Materiais de Identidade")
  if (data.materiais_identidade) {
    const m = data.materiais_identidade
    if (m.logo_url) lines.push(`Logo: ${m.logo_url}`)
    if (m.design_direction) lines.push(`Direção Visual: ${m.design_direction}`)
    if (m.design_file_url) lines.push(`Referência Visual: ${m.design_file_url}`)
    if (m.brand_manual_url) lines.push(`Manual da Marca: ${m.brand_manual_url}`)
  }

  lines.push("")
  lines.push("## Foco das Campanhas")
  if (data.foco_campanhas) {
    lines.push(`Abordagem: ${data.foco_campanhas.abordagem}`)
    lines.push(data.foco_campanhas.descricao)
  }

  lines.push("")
  lines.push("## Público-Alvo")
  if (data.publico) {
    if (data.publico.target_audience) lines.push(`Público: ${data.publico.target_audience}`)
    if (data.publico.price_sensitivity) lines.push(`Sensibilidade: ${data.publico.price_sensitivity}`)
    lines.push(data.publico.perfil)
  }

  lines.push("")
  lines.push("## Perfil da Marca")
  if (data.perfil_marca) {
    lines.push(`Tipo: ${data.perfil_marca.tipo}`)
    lines.push(data.perfil_marca.descricao)
  }

  lines.push("")
  lines.push("## Detalhes Adicionais")
  if (data.detalhes_adicionais) {
    if (data.detalhes_adicionais.notas) lines.push(`Notas: ${data.detalhes_adicionais.notas}`)
    if (data.detalhes_adicionais.conceito_frete) lines.push(`Conceito Frete: ${data.detalhes_adicionais.conceito_frete}`)
  }

  return lines.join("\n")
}

/**
 * Parses edited text back into BriefingData, preserving original structure for fields not in text
 */
function textToBriefing(text: string, original: BriefingData): BriefingData {
  const result = JSON.parse(JSON.stringify(original)) as BriefingData
  // Ensure nested objects exist
  result.dados_loja = result.dados_loja || { nome: "", url: "", plataforma: "", nicho: null, pais: null, idioma: null, frete_gratis: null }
  result.codigo_colaborador = result.codigo_colaborador || { shopify_code: null }
  result.materiais_identidade = result.materiais_identidade || { logo_url: null, design_direction: null, design_file_url: null, brand_manual_url: null }
  result.foco_campanhas = result.foco_campanhas || { abordagem: "", descricao: "" }
  result.publico = result.publico || { target_audience: null, price_sensitivity: null, perfil: "" }
  result.perfil_marca = result.perfil_marca || { tipo: "", descricao: "" }
  result.detalhes_adicionais = result.detalhes_adicionais || { notas: null, conceito_frete: null }

  const lines = text.split("\n")

  let currentSection = ""

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.replace("## ", "").toLowerCase()
      continue
    }
    if (!trimmed) continue

    const colonIdx = trimmed.indexOf(":")
    // Check if it's a known label (e.g., "Nome:", "URL:") or free text
    const possibleKey = colonIdx > 0 ? trimmed.substring(0, colonIdx).trim() : ""
    const knownKeys = ["Nome", "URL", "Plataforma", "Nicho", "País", "Idioma", "Frete", "Shopify Code", "Logo", "Direção Visual", "Referência Visual", "Manual da Marca", "Abordagem", "Público", "Sensibilidade", "Tipo", "Notas", "Conceito Frete"]
    const isLabel = colonIdx > 0 && knownKeys.includes(possibleKey)

    if (colonIdx === -1 || !isLabel) {
      // Free text line — append to description fields
      if (currentSection === "foco das campanhas") {
        result.foco_campanhas.descricao = result.foco_campanhas.descricao
          ? result.foco_campanhas.descricao + "\n" + trimmed
          : trimmed
      } else if (currentSection === "público-alvo") {
        result.publico.perfil = result.publico.perfil
          ? result.publico.perfil + "\n" + trimmed
          : trimmed
      } else if (currentSection === "perfil da marca") {
        result.perfil_marca.descricao = result.perfil_marca.descricao
          ? result.perfil_marca.descricao + "\n" + trimmed
          : trimmed
      }
      continue
    }

    const key = trimmed.substring(0, colonIdx).trim()
    const value = trimmed.substring(colonIdx + 1).trim()

    switch (currentSection) {
      case "dados da loja":
        if (key === "Nome") result.dados_loja.nome = value
        else if (key === "URL") result.dados_loja.url = value
        else if (key === "Plataforma") result.dados_loja.plataforma = value
        else if (key === "Nicho") result.dados_loja.nicho = value || null
        else if (key === "País") result.dados_loja.pais = value || null
        else if (key === "Idioma") result.dados_loja.idioma = value || null
        else if (key === "Frete") result.dados_loja.frete_gratis = value || null
        break
      case "código colaborador":
        if (key === "Shopify Code") result.codigo_colaborador.shopify_code = value || null
        break
      case "materiais de identidade":
        if (key === "Logo") result.materiais_identidade.logo_url = value || null
        else if (key === "Direção Visual") result.materiais_identidade.design_direction = value || null
        else if (key === "Referência Visual") result.materiais_identidade.design_file_url = value || null
        else if (key === "Manual da Marca") result.materiais_identidade.brand_manual_url = value || null
        break
      case "foco das campanhas":
        if (key === "Abordagem") result.foco_campanhas.abordagem = value
        break
      case "público-alvo":
        if (key === "Público") result.publico.target_audience = value || null
        else if (key === "Sensibilidade") result.publico.price_sensitivity = value || null
        break
      case "perfil da marca":
        if (key === "Tipo") result.perfil_marca.tipo = value
        break
      case "detalhes adicionais":
        if (key === "Notas") result.detalhes_adicionais.notas = value || null
        else if (key === "Conceito Frete") result.detalhes_adicionais.conceito_frete = value || null
        break
    }
  }

  return result
}

export function StoreBriefingView({
  storeId,
  briefing,
  onRefresh,
  onEditForm,
}: StoreBriefingViewProps) {
  const [regenerating, setRegenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const [saving, setSaving] = useState(false)
  const [creatingManual, setCreatingManual] = useState(false)

  const startEditing = useCallback(() => {
    if (!briefing) return
    if (isRawTextBriefing(briefing.briefing_data)) {
      setEditText(getRawText(briefing.briefing_data))
    } else {
      setEditText(briefingToText(briefing.briefing_data))
    }
    setEditing(true)
  }, [briefing])

  const cancelEditing = useCallback(() => {
    setEditing(false)
    setEditText("")
  }, [])

  async function handleSaveEdit() {
    if (!briefing) return
    setSaving(true)
    try {
      let updatedData: BriefingData | Record<string, unknown>
      if (isRawTextBriefing(briefing.briefing_data)) {
        updatedData = { ...briefing.briefing_data, raw_text: editText }
      } else {
        updatedData = textToBriefing(editText, briefing.briefing_data)
      }
      const res = await fetch("/api/onboarding/store-briefing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing_id: briefing.id,
          briefing_data: updatedData,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({ title: "Briefing atualizado" })
      setEditing(false)
      onRefresh?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveManual() {
    if (!editText.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "O texto do briefing não pode estar vazio" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/onboarding/store-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          mode: "manual",
          briefing_text: editText.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({ title: "Briefing manual criado" })
      setCreatingManual(false)
      setEditText("")
      onRefresh?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setSaving(false)
    }
  }

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

      toast({ title: "Briefing sendo gerado", description: "Aguarde alguns segundos e atualize." })
      // Give N8N a moment then refresh
      setTimeout(() => onRefresh?.(), 10000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao regenerar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setRegenerating(false)
    }
  }

  if (creatingManual) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Criar Briefing Manual</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setCreatingManual(false); setEditText("") }} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveManual} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[500px] font-mono text-sm"
            placeholder="Cole ou digite o briefing aqui..."
          />
        </CardContent>
      </Card>
    )
  }

  if (!briefing) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-4">Nenhum briefing gerado ainda.</p>
          <div className="flex gap-2 justify-center">
            {onEditForm && (
              <Button variant="secondary" onClick={onEditForm}>
                Preencher Formulário
              </Button>
            )}
            <Button onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Gerar Briefing
            </Button>
            <Button variant="secondary" onClick={() => setCreatingManual(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Criar Manual
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
            <Badge variant="neutral">{v.abordagem}</Badge>
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
            <Badge variant="neutral">{v.tipo}</Badge>
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
            {v.periodo ? <InfoRow label="Período" value={`Últimos ${v.periodo === "30d" ? "30 dias" : String(v.periodo)}`} /> : null}
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
            {v.periodo ? <InfoRow label="Período" value={`Últimos ${v.periodo === "30d" ? "30 dias" : String(v.periodo)}`} /> : null}
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

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Editando Briefing</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[500px] font-mono text-sm"
            placeholder="Briefing..."
          />
        </CardContent>
      </Card>
    )
  }

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
            <Button variant="secondary" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" />
              Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" disabled={regenerating}>
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
        {isRawTextBriefing(data) ? (
          <div className="whitespace-pre-wrap font-mono text-sm p-4 rounded-lg bg-muted/50">
            {getRawText(data)}
          </div>
        ) : (
          sections.map((section) => (
            <BriefingSection
              key={section.key}
              title={section.title}
              content={section.render(data[section.key])}
            />
          ))
        )}
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
