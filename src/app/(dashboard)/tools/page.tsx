"use client"

import { useState } from "react"
import {
  Wand2,
  Mail,
  Calculator,
  BarChart3,
  Sparkles,
  Loader2,
  Copy,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"

export default function ToolsPage() {
  const [emailSubjects, setEmailSubjects] = useState<string[]>([])
  const [isGeneratingSubjects, setIsGeneratingSubjects] = useState(false)
  const [campaignType, setCampaignType] = useState("abandoned_cart")
  const [adCopyResult, setAdCopyResult] = useState("")
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false)
  const [product, setProduct] = useState("")
  const [tone, setTone] = useState("professional")

  // ROAS Calculator state
  const [adSpend, setAdSpend] = useState("")
  const [revenue, setRevenue] = useState("")
  const roas = adSpend && revenue ? (parseFloat(revenue) / parseFloat(adSpend)).toFixed(2) : null

  // Benchmark state
  const [isGeneratingBenchmark, setIsGeneratingBenchmark] = useState(false)

  async function generateBenchmark() {
    setIsGeneratingBenchmark(true)
    // TODO: Implementar com dados reais de comparação entre clientes
    setTimeout(() => {
      setIsGeneratingBenchmark(false)
      toast({
        title: "Em desenvolvimento",
        description: "O benchmark comparativo estará disponível em breve.",
      })
    }, 500)
  }

  async function generateEmailSubjects() {
    setIsGeneratingSubjects(true)
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email_subjects", campaignType }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar assuntos")
      }

      setEmailSubjects(data.subjects || [])
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar assuntos",
        description: error instanceof Error ? error.message : "Tente novamente.",
      })
    } finally {
      setIsGeneratingSubjects(false)
    }
  }

  async function generateAdCopy() {
    if (!product.trim()) {
      toast({
        variant: "destructive",
        title: "Campo obrigatório",
        description: "Informe o produto ou serviço para gerar a copy.",
      })
      return
    }

    setIsGeneratingCopy(true)
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ad_copy", product, tone }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar copy")
      }

      setAdCopyResult(data.copy || "")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar copy",
        description: error instanceof Error ? error.message : "Tente novamente.",
      })
    } finally {
      setIsGeneratingCopy(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência." })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Hub de Ferramentas</h1>
        <p className="text-muted-foreground">
          Ferramentas e utilitários para aumentar sua produtividade
        </p>
      </div>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            IA
          </TabsTrigger>
          <TabsTrigger value="calculators" className="gap-2">
            <Calculator className="h-4 w-4" />
            Calculadoras
          </TabsTrigger>
        </TabsList>

        {/* AI Tools */}
        <TabsContent value="ai" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Email Subject Generator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-primary" />
                  Gerador de Assuntos de Email
                </CardTitle>
                <CardDescription>
                  Gere assuntos de email otimizados para maior abertura
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de campanha</Label>
                  <Select value={campaignType} onValueChange={setCampaignType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="abandoned_cart">Carrinho Abandonado</SelectItem>
                      <SelectItem value="welcome">Boas-vindas</SelectItem>
                      <SelectItem value="promotional">Promocional</SelectItem>
                      <SelectItem value="newsletter">Newsletter</SelectItem>
                      <SelectItem value="reactivation">Reativação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={generateEmailSubjects}
                  disabled={isGeneratingSubjects}
                  className="w-full"
                >
                  {isGeneratingSubjects ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {isGeneratingSubjects ? "Gerando..." : "Gerar Assuntos"}
                </Button>

                {emailSubjects.length > 0 && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Sugestões:</Label>
                    {emailSubjects.map((subject, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted text-sm cursor-pointer hover:bg-muted/80 flex items-center justify-between gap-2"
                        onClick={() => copyToClipboard(subject)}
                      >
                        <span>{subject}</span>
                        <Copy className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ad Copy Generator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Gerador de Copy para Ads
                </CardTitle>
                <CardDescription>
                  Crie copies persuasivas para seus anúncios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Produto/Serviço</Label>
                  <Input
                    placeholder="Ex: Gestão de tráfego pago"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tom de voz</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                      <SelectItem value="friendly">Amigável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={generateAdCopy}
                  disabled={isGeneratingCopy}
                  className="w-full"
                >
                  {isGeneratingCopy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {isGeneratingCopy ? "Gerando..." : "Gerar Copy"}
                </Button>

                {adCopyResult && (
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <Label>Resultado:</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(adCopyResult)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar
                      </Button>
                    </div>
                    <Textarea
                      value={adCopyResult}
                      readOnly
                      className="min-h-[200px]"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Calculators */}
        <TabsContent value="calculators" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* ROAS Calculator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="h-4 w-4 text-primary" />
                  Calculadora de ROAS
                </CardTitle>
                <CardDescription>
                  Calcule o retorno sobre investimento em anúncios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Investimento em Ads (R$)</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={adSpend}
                    onChange={(e) => setAdSpend(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Receita Gerada (R$)</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                  />
                </div>

                {roas && (
                  <div className="p-4 rounded-lg bg-primary/10 text-center">
                    <p className="text-sm text-muted-foreground">Seu ROAS é</p>
                    <p className="text-3xl font-bold text-primary">{roas}x</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Para cada R$ 1 investido, você gera{" "}
                      {formatCurrency(parseFloat(roas))}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Benchmark Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Benchmark da Carteira
                </CardTitle>
                <CardDescription>
                  Compare o desempenho de um cliente com a média
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Selecione o cliente</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client1">Loja ABC</SelectItem>
                      <SelectItem value="client2">Loja XYZ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={generateBenchmark}
                  disabled={isGeneratingBenchmark}
                >
                  {isGeneratingBenchmark ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="mr-2 h-4 w-4" />
                  )}
                  Gerar Comparativo
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
