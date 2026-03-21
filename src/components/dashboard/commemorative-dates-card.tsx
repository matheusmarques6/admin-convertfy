"use client"

import { useState, useMemo } from "react"
import { CalendarHeart, Sparkles, X, TrendingUp, Mail, Workflow, ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface CommemorativeDate {
  date: string
  name: string
  emoji: string
  category: "seasonal" | "commercial" | "awareness" | "cultural"
  tips: string[]
  bestCampaignTypes: string[]
}

// Datas comemorativas brasileiras relevantes para e-commerce
const COMMEMORATIVE_DATES: CommemorativeDate[] = [
  { date: "01-01", name: "Ano Novo", emoji: "\u{1F389}", category: "seasonal", tips: ["Campanhas de 'ano novo, vida nova' com descontos de renovacao", "Flows de reativacao de clientes inativos", "Promover lancamentos de colecao"], bestCampaignTypes: ["Reativacao", "Lancamento de colecao"] },
  { date: "02-14", name: "Valentine's Day (Internacional)", emoji: "\u{1F498}", category: "commercial", tips: ["Campanhas para publico internacional", "Gift guides para presentes romanticos", "Cupons especiais para casais"], bestCampaignTypes: ["Gift Guide", "Promocional"] },
  { date: "03-08", name: "Dia da Mulher", emoji: "\u{1F338}", category: "awareness", tips: ["Campanhas de empoderamento feminino", "Descontos em categorias femininas", "Colaboracoes com influenciadoras"], bestCampaignTypes: ["Awareness", "Promocional"] },
  { date: "03-15", name: "Dia do Consumidor", emoji: "\u{1F6D2}", category: "commercial", tips: ["Mega descontos estilo Black Friday", "Semana do consumidor (estender 7 dias)", "Ofertas relampago por email", "Recuperacao de carrinho agressiva"], bestCampaignTypes: ["Mega Sale", "Flash Sale", "Recuperacao de carrinho"] },
  { date: "04-21", name: "Tiradentes", emoji: "\u{1F1E7}\u{1F1F7}", category: "cultural", tips: ["Aproveitar feriado prolongado para campanhas", "Promover produtos para lazer e viagens"], bestCampaignTypes: ["Feriado", "Promocional"] },
  { date: "05-01", name: "Dia do Trabalho", emoji: "\u2692\uFE0F", category: "cultural", tips: ["Campanhas para feriado prolongado", "Descontos para 'quem trabalha duro merece'"], bestCampaignTypes: ["Feriado", "Promocional"] },
  { date: "05-11", name: "Dia das Maes", emoji: "\u{1F490}", category: "commercial", tips: ["Gift guides por faixa de preco", "Campanhas emocionais com storytelling", "Frete gratis ou expresso para entrega a tempo", "Flows de carrinho abandonado mais agressivos"], bestCampaignTypes: ["Gift Guide", "Emocional", "Last Minute"] },
  { date: "06-12", name: "Dia dos Namorados", emoji: "\u2764\uFE0F", category: "commercial", tips: ["Kits de presentes para casais", "Campanhas com conta regressiva", "Personalizacao de produtos", "Segmentar por genero para sugestoes de presentes"], bestCampaignTypes: ["Gift Guide", "Countdown", "Segmentada"] },
  { date: "06-24", name: "Sao Joao", emoji: "\u{1F525}", category: "cultural", tips: ["Tematica junina para campanhas", "Descontos em categorias sazonais"], bestCampaignTypes: ["Sazonal", "Tematica"] },
  { date: "07-20", name: "Dia do Amigo", emoji: "\u{1F91D}", category: "commercial", tips: ["Campanhas de indicacao 'traga um amigo'", "Descontos para compras em dupla", "Flows de referral marketing"], bestCampaignTypes: ["Referral", "Promocional"] },
  { date: "08-10", name: "Dia dos Pais", emoji: "\u{1F468}", category: "commercial", tips: ["Gift guides para diferentes perfis de pai", "Campanhas de last-minute com entrega rapida", "Kits especiais e combos"], bestCampaignTypes: ["Gift Guide", "Last Minute", "Combo"] },
  { date: "09-07", name: "Independencia do Brasil", emoji: "\u{1F1E7}\u{1F1F7}", category: "cultural", tips: ["Semana Brasil com descontos especiais", "Campanhas patrioticas", "Promover produtos nacionais"], bestCampaignTypes: ["Semana Brasil", "Promocional"] },
  { date: "10-12", name: "Dia das Criancas", emoji: "\u{1F9F8}", category: "commercial", tips: ["Campanhas para pais comprarem para filhos", "Segmentar clientes que compraram brinquedos", "Frete gratis para presentes infantis"], bestCampaignTypes: ["Segmentada", "Gift Guide"] },
  { date: "10-31", name: "Halloween", emoji: "\u{1F383}", category: "seasonal", tips: ["Tematica dark/divertida para campanhas", "Descontos 'assustadoramente bons'", "Colecoes tematicas"], bestCampaignTypes: ["Tematica", "Promocional"] },
  { date: "11-25", name: "Black Friday", emoji: "\u{1F6CD}\uFE0F", category: "commercial", tips: ["Esquentar com teasers 2 semanas antes", "VIP early access para clientes fieis", "Flows de carrinho abandonado maximos", "Campanhas de contagem regressiva", "Segmentar por historico de compra"], bestCampaignTypes: ["Teaser", "VIP Access", "Mega Sale", "Countdown"] },
  { date: "11-28", name: "Cyber Monday", emoji: "\u{1F4BB}", category: "commercial", tips: ["Extensao de Black Friday online", "Descontos exclusivos digitais", "Push final para vendas do periodo"], bestCampaignTypes: ["Flash Sale", "Digital Only"] },
  { date: "12-25", name: "Natal", emoji: "\u{1F384}", category: "commercial", tips: ["Campanhas de presente com urgencia de entrega", "Gift guides por faixa de preco", "Flows de recomendacao baseados em historico", "Mensagens de agradecimento pos-compra"], bestCampaignTypes: ["Gift Guide", "Last Minute", "Agradecimento"] },
  { date: "12-31", name: "Reveillon", emoji: "\u{1F386}", category: "seasonal", tips: ["Liquidacao de fim de ano", "Campanhas de agradecimento pelo ano", "Teasers para colecao do proximo ano"], bestCampaignTypes: ["Liquidacao", "Teaser"] },
]

interface CommemorativeDatesCardProps {
  selectedMonth?: number // 0-11
}

export function CommemorativeDatesCard({ selectedMonth }: CommemorativeDatesCardProps) {
  const [selectedDate, setSelectedDate] = useState<CommemorativeDate | null>(null)

  const month = selectedMonth ?? new Date().getMonth()
  const monthName = new Date(2024, month).toLocaleDateString("pt-BR", { month: "long" })

  const monthDates = useMemo(() => {
    const monthStr = String(month + 1).padStart(2, "0")
    return COMMEMORATIVE_DATES.filter(d => d.date.startsWith(monthStr))
      .sort((a, b) => parseInt(a.date.split("-")[1]) - parseInt(b.date.split("-")[1]))
  }, [month])

  const nextUpcoming = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentDay = now.getDate()

    // Get remaining dates this month + next month
    return COMMEMORATIVE_DATES
      .map(d => {
        const [m, day] = d.date.split("-").map(Number)
        const dateMonth = m - 1
        let year = now.getFullYear()
        if (dateMonth < currentMonth || (dateMonth === currentMonth && day < currentDay)) {
          year++
        }
        return { ...d, sortDate: new Date(year, dateMonth, day) }
      })
      .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
      .slice(0, 3)
  }, [])

  const categoryColors: Record<string, string> = {
    seasonal: "bg-blue-500/10 text-blue-600",
    commercial: "bg-emerald-500/10 text-emerald-600",
    awareness: "bg-purple-500/10 text-purple-600",
    cultural: "bg-amber-500/10 text-amber-600",
  }

  const categoryLabels: Record<string, string> = {
    seasonal: "Sazonal",
    commercial: "Comercial",
    awareness: "Conscientizacao",
    cultural: "Cultural",
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Icon icon={CalendarHeart} size={16} className="text-pink-500" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Datas Comemorativas</CardTitle>
                <p className="text-[11px] text-muted-foreground capitalize">{monthName}</p>
              </div>
            </div>
            {monthDates.length > 0 && (
              <Badge variant="neutral" className="text-xs">
                {monthDates.length} {monthDates.length === 1 ? "data" : "datas"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 flex-1 flex flex-col">
          {monthDates.length > 0 ? (
            <div className="space-y-1.5">
              {monthDates.map((d) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                >
                  <span className="text-lg shrink-0">{d.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                      {d.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.date.split("-")[1]}/{String(month + 1).padStart(2, "0")}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${categoryColors[d.category]}`}>
                    {categoryLabels[d.category]}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <p className="text-xs text-muted-foreground mb-3">
                Nenhuma data comemorativa em {monthName}
              </p>
              {nextUpcoming.length > 0 && (
                <div className="space-y-1.5 w-full">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Proximas datas
                  </p>
                  {nextUpcoming.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDate(d)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
                    >
                      <span className="text-sm">{d.emoji}</span>
                      <span className="text-xs text-foreground">{d.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {d.date.split("-")[1]}/{d.date.split("-")[0]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </div>

      {/* Insights Modal */}
      <Dialog open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <span className="text-xl">{selectedDate?.emoji}</span>
              {selectedDate?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-5 pb-2">
                {/* Category badge */}
                <Badge className={`${categoryColors[selectedDate.category]} border-0`}>
                  {categoryLabels[selectedDate.category]}
                </Badge>

                {/* Tips/Insights */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon icon={Sparkles} size={16} className="text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Insights para Campanhas</h4>
                  </div>
                  <div className="space-y-2">
                    {selectedDate.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5">
                        <Icon icon={TrendingUp} customSize={14} className="text-primary mt-0.5" />
                        <p className="text-xs text-foreground leading-relaxed">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended campaign types */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon icon={Mail} size={16} className="text-brand-400" />
                    <h4 className="text-sm font-semibold text-foreground">Tipos de Campanha Recomendados</h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDate.bestCampaignTypes.map((type) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Suggested timeline */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon icon={Workflow} size={16} className="text-warning" />
                    <h4 className="text-sm font-semibold text-foreground">Timeline Sugerida</h4>
                  </div>
                  <div className="space-y-1.5">
                    <TimelineItem label="Planejamento" days="14-21 dias antes" />
                    <TimelineItem label="Criacao de assets" days="10-14 dias antes" />
                    <TimelineItem label="Configurar flows" days="7-10 dias antes" />
                    <TimelineItem label="Enviar teasers" days="5-7 dias antes" />
                    <TimelineItem label="Campanha principal" days="No dia / semana" />
                    <TimelineItem label="Follow-up / Extensao" days="1-3 dias depois" />
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function TimelineItem({ label, days }: { label: string; days: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
      <span className="text-foreground font-medium flex-1">{label}</span>
      <span className="text-muted-foreground">{days}</span>
    </div>
  )
}
