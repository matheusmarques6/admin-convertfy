"use client"

import { useState } from "react"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Loader2,
  Search,
  X,
  Percent,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/lib/hooks/use-toast"

interface RecoveryAnalysisProps {
  stores: Array<{ id: string; store_name: string }>
  selectedStoreId: string
}

interface RecoveryData {
  total: { revenue: number; orders: number; aov: number }
  recovered: { revenue: number; orders: number; aov: number }
  recoveryRate: number
  currency: string
  byDiscountCode: Array<{ code: string; revenue: number; orders: number }>
  byUtmSource: Array<{ source: string; revenue: number; orders: number }>
}

const DEFAULT_DISCOUNT_CODES = [
  "BEMVINDA10",
  "DESCONTO10",
  "DESCONTO12",
  "DESCONTO15",
  "VOLTEI12",
  "VOLTEI15",
  "EXCLUSIVO12",
  "EXCLUSIVO14",
  "ESPECIAL",
  "HALLOWEEN",
  "HALLOWEEN15",
  "BLACKVIP",
  "24HORAS",
  "BLACK10",
  "BLACK17",
  "BLACK20",
  "SEXTA14",
  "BLACKWEEK",
  "BLACK",
]

const DEFAULT_UTM_SOURCES = ["klaviyo"]

function getDefaultDateRange() {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setMonth(start.getMonth() - 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { start: fmt(start), end: fmt(end) }
}

function formatCurrency(value: number, currency = "BRL") {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function RecoveryAnalysis({ stores, selectedStoreId }: RecoveryAnalysisProps) {
  const defaultDates = getDefaultDateRange()
  const [storeId, setStoreId] = useState(selectedStoreId || stores[0]?.id || "")
  const [startDate, setStartDate] = useState(defaultDates.start)
  const [endDate, setEndDate] = useState(defaultDates.end)
  const [discountCodes, setDiscountCodes] = useState<string[]>(DEFAULT_DISCOUNT_CODES)
  const [utmSources, setUtmSources] = useState<string[]>(DEFAULT_UTM_SOURCES)
  const [newCode, setNewCode] = useState("")
  const [newUtm, setNewUtm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<RecoveryData | null>(null)

  async function analyze() {
    if (!storeId) {
      toast({ variant: "destructive", title: "Selecione uma loja" })
      return
    }
    if (!startDate || !endDate) {
      toast({ variant: "destructive", title: "Selecione o período" })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/integrations/shopify/recovery-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          date_range: {
            start: new Date(startDate + "T00:00:00").toISOString(),
            end: new Date(endDate + "T23:59:59").toISOString(),
          },
          discount_codes: discountCodes,
          utm_sources: utmSources,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Erro ao analisar")
      }

      const result = await response.json()
      setData(result)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na análise",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setIsLoading(false)
    }
  }

  function addDiscountCode() {
    const code = newCode.trim().toUpperCase()
    if (code && !discountCodes.includes(code)) {
      setDiscountCodes([...discountCodes, code])
      setNewCode("")
    }
  }

  function removeDiscountCode(code: string) {
    setDiscountCodes(discountCodes.filter((c) => c !== code))
  }

  function addUtmSource() {
    const source = newUtm.trim().toLowerCase()
    if (source && !utmSources.includes(source)) {
      setUtmSources([...utmSources, source])
      setNewUtm("")
    }
  }

  function removeUtmSource(source: string) {
    setUtmSources(utmSources.filter((s) => s !== source))
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros da Análise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Store + Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Loja</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.store_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Discount Codes */}
          <div>
            <Label>Cupons de Recuperação</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Adicionar cupom..."
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDiscountCode())}
              />
              <Button variant="outline" size="sm" onClick={addDiscountCode}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {discountCodes.map((code) => (
                <Badge key={code} variant="secondary" className="gap-1 px-2 py-0.5">
                  {code}
                  <button onClick={() => removeDiscountCode(code)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* UTM Sources */}
          <div>
            <Label>UTM Sources</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Adicionar utm_source..."
                value={newUtm}
                onChange={(e) => setNewUtm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUtmSource())}
              />
              <Button variant="outline" size="sm" onClick={addUtmSource}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {utmSources.map((source) => (
                <Badge key={source} variant="secondary" className="gap-1 px-2 py-0.5">
                  {source}
                  <button onClick={() => removeUtmSource(source)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Analyze Button */}
          <Button onClick={analyze} disabled={isLoading} className="w-full md:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Analisar Recuperação
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  Receita Total (Pagos)
                </div>
                <p className="text-2xl font-bold">{formatCurrency(data.total.revenue, data.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.total.orders} pedidos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Receita Recuperada
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(data.recovered.revenue, data.currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.recovered.orders} pedidos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Percent className="h-4 w-4 text-blue-500" />
                  Taxa de Recuperação
                </div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {data.recoveryRate.toFixed(1)}%
                </p>
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(data.recoveryRate, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <ShoppingCart className="h-4 w-4" />
                  Ticket Médio Recuperado
                </div>
                <p className="text-2xl font-bold">{formatCurrency(data.recovered.aov, data.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  vs {formatCurrency(data.total.aov, data.currency)} geral
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Discount Code */}
            {data.byDiscountCode.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por Cupom de Desconto</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cupom</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byDiscountCode.map((item) => (
                        <TableRow key={item.code}>
                          <TableCell>
                            <Badge variant="neutral" showDot={false}>{item.code}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{item.orders}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.revenue, data.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* By UTM Source */}
            {data.byUtmSource.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por UTM Source</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byUtmSource.map((item) => (
                        <TableRow key={item.source}>
                          <TableCell>
                            <Badge variant="neutral" showDot={false}>{item.source}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{item.orders}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.revenue, data.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* No results message */}
          {data.byDiscountCode.length === 0 && data.byUtmSource.length === 0 && data.recovered.orders === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum pedido recuperado encontrado com os filtros selecionados no período.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
