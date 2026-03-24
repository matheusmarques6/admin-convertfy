"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Wrench,
  Mail,
  Sparkles,
  Calculator,
  BarChart3,
  PenLine,
  Wand2,
  Loader2,
  Copy,
  ArrowRight,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency, cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { LucideIcon } from "lucide-react"

// ─── Tool definitions ────────────────────────────────────

interface ToolDef {
  id: string
  name: string
  description: string
  icon: LucideIcon
  category: "ai" | "calculators"
  badge?: string
  href?: string
}

const TOOLS: ToolDef[] = [
  {
    id: "copy-generator",
    name: "Gerador de Copy",
    description: "Crie assuntos e textos para campanhas de email e SMS com IA.",
    icon: PenLine,
    category: "ai",
    badge: "IA",
    href: "/admin/tools/copy",
  },
  {
    id: "email-subjects",
    name: "Assuntos de Email",
    description: "Gere assuntos de email otimizados para maior taxa de abertura.",
    icon: Mail,
    category: "ai",
    badge: "IA",
  },
  {
    id: "ad-copy",
    name: "Copy para Ads",
    description: "Copies persuasivas para anúncios em redes sociais e Google.",
    icon: Sparkles,
    category: "ai",
    badge: "IA",
  },
  {
    id: "roas-calculator",
    name: "Calculadora de ROAS",
    description: "Calcule o retorno sobre investimento em anúncios.",
    icon: Calculator,
    category: "calculators",
  },
  {
    id: "benchmark",
    name: "Benchmark da Carteira",
    description: "Compare o desempenho de um cliente com a média da carteira.",
    icon: BarChart3,
    category: "calculators",
    badge: "Em breve",
  },
]

const CATEGORY_LABELS: Record<string, string> = {
  ai: "Geradores de IA",
  calculators: "Calculadoras",
}

// ─── ToolCard ────────────────────────────────────────────

function ToolCard({
  tool,
  onClick,
}: {
  tool: ToolDef
  onClick: () => void
}) {
  const content = (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        "bg-card p-4 cursor-pointer transition-all duration-150",
        "hover:border-[rgba(0,0,0,0.15)] dark:hover:border-[rgba(255,255,255,0.14)]",
        "group"
      )}
      onClick={tool.href ? undefined : onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon icon={tool.icon} size={20} className="text-gray-500 dark:text-[#8B92A5]" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
            {tool.name}
          </h4>
        </div>
        {tool.badge && (
          <Badge
            variant={tool.badge === "Em breve" ? "neutral" : "info"}
            showDot={false}
          >
            {tool.badge}
          </Badge>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-[#8B92A5] line-clamp-2 mb-3">
        {tool.description}
      </p>
      <div className="flex items-center text-xs text-[#4E62D8] dark:text-[#7B8CEA] font-medium group-hover:gap-1.5 gap-1 transition-all">
        Abrir
        <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  )

  if (tool.href) {
    return <Link href={tool.href}>{content}</Link>
  }

  return content
}

// ─── Inline Tool Dialogs ─────────────────────────────────

function EmailSubjectsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [campaignType, setCampaignType] = useState("abandoned_cart")
  const [subjects, setSubjects] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  async function generate() {
    setIsGenerating(true)
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email_subjects", campaignType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao gerar assuntos")
      setSubjects(data.subjects || [])
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Tente novamente.",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast({ title: "Copiado!" })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Mail} size={20} />
            Gerador de Assuntos de Email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <Button onClick={generate} disabled={isGenerating} className="w-full">
            {isGenerating ? (
              <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
            ) : (
              <Icon icon={Wand2} size={16} className="mr-2" />
            )}
            {isGenerating ? "Gerando..." : "Gerar Assuntos"}
          </Button>
          {subjects.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <Label>Sugestões:</Label>
              {subjects.map((subject, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => copyToClipboard(subject)}
                  className="w-full text-left p-3 rounded-[6px] bg-gray-50 dark:bg-[#1A1D27] text-sm hover:bg-gray-100 dark:hover:bg-[#242836] flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="text-gray-700 dark:text-[#8B92A5]">{subject}</span>
                  <Copy className="h-3 w-3 shrink-0 text-gray-400 dark:text-[#5C6378]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AdCopyDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [product, setProduct] = useState("")
  const [tone, setTone] = useState("professional")
  const [result, setResult] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  async function generate() {
    if (!product.trim()) {
      toast({ variant: "destructive", title: "Informe o produto ou serviço" })
      return
    }
    setIsGenerating(true)
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ad_copy", product, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao gerar copy")
      setResult(data.copy || "")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Tente novamente.",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Sparkles} size={20} />
            Gerador de Copy para Ads
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <Button onClick={generate} disabled={isGenerating} className="w-full">
            {isGenerating ? (
              <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />
            ) : (
              <Icon icon={Wand2} size={16} className="mr-2" />
            )}
            {isGenerating ? "Gerando..." : "Gerar Copy"}
          </Button>
          {result && (
            <div className="space-y-2 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center justify-between">
                <Label>Resultado:</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(result)
                    toast({ title: "Copiado!" })
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copiar
                </Button>
              </div>
              <Textarea value={result} readOnly className="min-h-[160px]" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ROASDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [adSpend, setAdSpend] = useState("")
  const [revenue, setRevenue] = useState("")
  const roas =
    adSpend && revenue ? (parseFloat(revenue) / parseFloat(adSpend)).toFixed(2) : null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Calculator} size={20} />
            Calculadora de ROAS
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <div className="p-4 rounded-[8px] bg-gray-50 dark:bg-[#1A1D27] text-center">
              <p className="text-xs text-gray-500 dark:text-[#8B92A5]">Seu ROAS é</p>
              <p className="text-3xl font-bold font-mono tabular-nums text-[#4E62D8] dark:text-[#7B8CEA]">
                {roas}x
              </p>
              <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-1">
                Para cada R$ 1 investido, você gera {formatCurrency(parseFloat(roas))}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ────────────────────────────────────────────────

export default function ToolsPage() {
  const [openTool, setOpenTool] = useState<string | null>(null)

  const categories = Object.entries(CATEGORY_LABELS)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wrench}
        title="Ferramentas"
        description="Geradores de IA e calculadoras para otimizar seu trabalho."
      />

      {categories.map(([catKey, catLabel]) => {
        const catTools = TOOLS.filter((t) => t.category === catKey)
        if (catTools.length === 0) return null
        return (
          <div key={catKey}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] mb-3">
              {catLabel}
            </h3>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {catTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onClick={() => setOpenTool(tool.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Tool Dialogs */}
      <EmailSubjectsDialog
        open={openTool === "email-subjects"}
        onClose={() => setOpenTool(null)}
      />
      <AdCopyDialog
        open={openTool === "ad-copy"}
        onClose={() => setOpenTool(null)}
      />
      <ROASDialog
        open={openTool === "roas-calculator"}
        onClose={() => setOpenTool(null)}
      />
    </div>
  )
}
