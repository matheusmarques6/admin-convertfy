"use client"

/**
 * Auditoria de moeda e fuso.
 *
 * A tela antiga dizia "OK" para loja cuja moeda ninguém nunca conferiu —
 * ela comparava o cadastro com uma cópia dele mesmo. Aqui o eixo é a
 * PROCEDÊNCIA: quem definiu a moeda e quando. E o botão faz o que a tela
 * antiga só sugeria em texto: confere com a plataforma e grava.
 */

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  PencilLine,
  RefreshCw,
  Globe2,
  ArrowRight,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { Badge } from "@/components/ui/badge"
import { ROUTES } from "@/lib/routes"
import { useToast } from "@/lib/hooks/use-toast"
import { ValorBRL } from "@/components/money/valor-brl"
import { RevenueAuditPanel } from "@/components/tools/revenue-audit-panel"
import type { RevenueAuditResult } from "@/app/api/stores/revenue-audit/route"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new Error(body?.error || `A auditoria falhou (HTTP ${r.status})`)
  return body
}

type StatusMoeda =
  | "plataforma"
  | "manual"
  | "nunca-conferido"
  | "sem-config"
  | "divergencia"
  | "sem-dados"

interface AuditRow {
  storeId: string
  storeName: string
  clientName: string | null
  platform: "klaviyo" | "omnisend" | "none"
  configuredCurrency: string | null
  currencySource: string | null
  currencySyncedAt: string | null
  reportedCurrency: string | null
  timezone: string | null
  timezoneSource: string | null
  status: StatusMoeda
  storeRevenueLocal: number
  storeRevenueBRL: number | null
  conversionRatio: number | null
  fxRateDate: string | null
  hint: string
}

interface AuditResponse {
  success: boolean
  data: {
    stores: AuditRow[]
    summary: {
      total: number
      plataforma: number
      manual: number
      nuncaConferido: number
      semConfig: number
      divergencia: number
      semDados: number
      semFuso: number
      currenciesInUse: string[]
    }
    period: string
  }
}

interface RelatorioDaLoja {
  storeId: string
  storeName: string
  gravado: boolean
  erro?: string
  resumo: string
  decisao: { mudou: boolean } | null
}

const STATUS_META: Record<StatusMoeda, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  plataforma: { label: "Da plataforma", tone: "success" },
  manual: { label: "Manual", tone: "neutral" },
  "nunca-conferido": { label: "Nunca conferido", tone: "warn" },
  "sem-config": { label: "Sem moeda", tone: "danger" },
  divergencia: { label: "Divergência", tone: "warn" },
  "sem-dados": { label: "Sem dados", tone: "neutral" },
}

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300",
  neutral: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
}

const fmtLocal = (v: number, code: string | null) => {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code || "BRL",
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    // Código que o Intl não conhece: mostrar o número com o código ao lado
    // é melhor que a tela quebrar.
    return `${code ?? ""} ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`.trim()
  }
}

export default function CurrencyAuditPage() {
  const { toast } = useToast()
  const [period, setPeriod] = useState("30d")
  const [sincronizando, setSincronizando] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState<RelatorioDaLoja[] | null>(null)
  const [auditandoReceita, setAuditandoReceita] = useState<string | null>(null)
  const [auditoriaReceita, setAuditoriaReceita] = useState<RevenueAuditResult | null>(null)
  // Mês anterior COMPLETO: é a janela do relatório mensal, que é onde a
  // divergência com o painel aparece e é reclamada.
  const [janela, setJanela] = useState(mesAnteriorCompleto)

  async function conferirReceita(storeId: string) {
    setAuditandoReceita(storeId)
    setAuditoriaReceita(null)
    try {
      const res = await fetch("/api/stores/revenue-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, start: janela.inicio, end: janela.fim }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `Falhou (HTTP ${res.status})`)
      setAuditoriaReceita((body?.data ?? body) as RevenueAuditResult)
    } catch (e) {
      toast({
        title: "Não deu para conferir",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setAuditandoReceita(null)
    }
  }

  const { data, isLoading, error, mutate } = useSWR<AuditResponse>(
    `/api/stores/currency-audit?period=${period}`,
    fetcher,
  )

  const stores = data?.data?.stores ?? []
  const summary = data?.data?.summary

  async function conferir(alvo: { storeId?: string; forcar?: boolean; rotulo: string }) {
    setSincronizando(alvo.storeId ?? "todas")
    setRelatorio(null)
    try {
      const res = await fetch("/api/stores/platform-profile-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: alvo.storeId, forcar: alvo.forcar }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `Falhou (HTTP ${res.status})`)
      const lojas: RelatorioDaLoja[] = body?.data?.lojas ?? []
      const alteradas = body?.data?.alteradas ?? 0
      const comErro = body?.data?.comErro ?? 0
      setRelatorio(lojas)
      toast({
        title:
          alteradas > 0
            ? `${alteradas} loja(s) corrigidas`
            : `Nada a mudar em ${alvo.rotulo}`,
        description: comErro > 0 ? `${comErro} loja(s) não responderam — veja o relatório abaixo.` : undefined,
        variant: comErro > 0 ? "destructive" : undefined,
      })
      await mutate()
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Não consegui conferir com a plataforma",
        variant: "destructive",
      })
    } finally {
      setSincronizando(null)
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Moeda e fuso das lojas"
        description="Confere com a plataforma de e-mail quem é a moeda e o fuso de cada loja. Moeda errada distorce a conversão do dashboard; fuso ausente desloca a janela do relatório."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-[6px] border border-black/[0.08] bg-white p-0.5 dark:bg-[#1A1D27]">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`px-3 py-1.5 text-sm font-medium rounded-[4px] transition-colors ${
                period === p
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {summary && (
            <span className="text-xs text-muted-foreground">
              Moedas em uso: {summary.currenciesInUse.length > 0 ? summary.currenciesInUse.join(", ") : "—"}
            </span>
          )}
          <button
            type="button"
            onClick={() => conferir({ rotulo: "nenhuma loja" })}
            disabled={sincronizando !== null}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-black/[0.08] bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60 dark:bg-[#1A1D27] dark:text-gray-100 dark:hover:bg-white/5"
          >
            {sincronizando === "todas" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Conferir com a plataforma
          </button>
        </div>
      </div>

      {/* Janela da conferência de receita. Separada dos chips de período
          acima, que governam a coluna de faturamento da tabela: aqui o
          que importa é reproduzir a MESMA janela do relatório mensal,
          que é onde a divergência com o painel é reclamada. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span>Conferir receita no período de</span>
        <input
          type="date"
          value={janela.inicio}
          onChange={(e) => setJanela((j) => ({ ...j, inicio: e.target.value }))}
          className="rounded-[4px] border border-black/[0.08] bg-white px-2 py-1 dark:bg-[#1A1D27] dark:text-gray-100"
        />
        <span>até</span>
        <input
          type="date"
          value={janela.fim}
          onChange={(e) => setJanela((j) => ({ ...j, fim: e.target.value }))}
          className="rounded-[4px] border border-black/[0.08] bg-white px-2 py-1 dark:bg-[#1A1D27] dark:text-gray-100"
        />
        <span className="text-gray-400 dark:text-gray-500">
          — use o botão “Receita” na linha da loja
        </span>
      </div>

      {auditoriaReceita && (
        <RevenueAuditPanel r={auditoriaReceita} onFechar={() => setAuditoriaReceita(null)} />
      )}

      {error ? (
        <div className="rounded-[6px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-200">
          {error instanceof Error ? error.message : "A auditoria falhou."}
        </div>
      ) : isLoading ? (
        <PageSkeleton variant="metrics" showHeader={false} className="px-0 py-0" />
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} tone="success" label="Da plataforma" value={summary.plataforma} />
              <SummaryCard icon={<HelpCircle className="h-4 w-4" />} tone="warn" label="Nunca conferido" value={summary.nuncaConferido} />
              <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} tone="danger" label="Sem moeda" value={summary.semConfig} />
              <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} tone="warn" label="Divergência" value={summary.divergencia} />
              <SummaryCard icon={<Globe2 className="h-4 w-4" />} tone="warn" label="Sem fuso" value={summary.semFuso} />
              <SummaryCard icon={<PencilLine className="h-4 w-4" />} tone="neutral" label="Manual" value={summary.manual} />
            </div>
          )}

          {relatorio && relatorio.length > 0 && (
            <div className="rounded-[6px] border border-black/[0.06] bg-white p-4 text-xs dark:bg-[#1A1D27]">
              <p className="mb-2 font-semibold text-gray-900 dark:text-white">
                O que a plataforma respondeu
              </p>
              <ul className="space-y-1 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                {relatorio.map((l) => (
                  <li key={l.storeId} className={l.erro ? "text-red-600 dark:text-red-400" : undefined}>
                    {l.resumo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-[6px] border border-black/[0.06] bg-white dark:bg-[#1A1D27] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#242836] border-b border-black/[0.06]">
                  <tr>
                    <Th>Loja</Th>
                    <Th>Cliente</Th>
                    <Th>Plataforma</Th>
                    <Th>Moeda</Th>
                    <Th>Procedência</Th>
                    <Th>Fuso</Th>
                    <Th>Status</Th>
                    <Th align="right">Receita (local)</Th>
                    <Th align="right">Receita (BRL)</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {stores.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhuma loja encontrada.
                      </td>
                    </tr>
                  ) : (
                    stores.map((s) => {
                      const meta = STATUS_META[s.status]
                      return (
                        <tr
                          key={s.storeId}
                          className="border-b border-black/[0.04] hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.storeName}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.clientName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge variant="neutral" className="text-[11px]">
                              {s.platform}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">
                            {s.configuredCurrency ?? "—"}
                            {s.reportedCurrency && s.reportedCurrency !== s.configuredCurrency && (
                              <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">
                                (Klaviyo: {s.reportedCurrency})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                            {s.currencySource ? (
                              <span className="inline-flex items-center gap-1">
                                {s.currencySource === "manual" ? (
                                  <PencilLine className="h-3 w-3" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                {s.currencySource}
                                {s.currencySyncedAt && (
                                  <span className="opacity-70">
                                    · {new Date(s.currencySyncedAt).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" /> nunca conferido
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-600 dark:text-gray-300">
                            {s.timezone ?? (
                              <span className="text-amber-600 dark:text-amber-400">sem fuso</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}
                              title={s.hint}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                            {s.storeRevenueLocal > 0
                              ? fmtLocal(s.storeRevenueLocal, s.reportedCurrency || s.configuredCurrency)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                            {s.storeRevenueBRL == null ? (
                              "—"
                            ) : (
                              <ValorBRL
                                valorBRL={s.storeRevenueBRL}
                                valorOriginal={s.storeRevenueLocal}
                                moeda={s.reportedCurrency || s.configuredCurrency}
                                taxa={s.conversionRatio}
                                dataDaTaxa={s.fxRateDate}
                                semCentavos
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                conferir({
                                  storeId: s.storeId,
                                  // Loja marcada como manual só muda se pedirem
                                  // explicitamente — o botão dela É o pedido.
                                  forcar: s.currencySource === "manual",
                                  rotulo: s.storeName,
                                })
                              }
                              disabled={sincronizando !== null}
                              className="mr-3 text-xs text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-300"
                            >
                              {sincronizando === s.storeId ? "conferindo…" : "Conferir"}
                            </button>
                            {/* Só Omnisend: a conferência de receita bate contra as
                                APIs de analytics deles, e oferecer o botão numa loja
                                Klaviyo seria um clique que só sabe falhar. */}
                            {s.platform === "omnisend" && (
                              <button
                                type="button"
                                onClick={() => conferirReceita(s.storeId)}
                                disabled={auditandoReceita !== null}
                                className="mr-3 text-xs text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-300"
                              >
                                {auditandoReceita === s.storeId ? "conferindo…" : "Receita"}
                              </button>
                            )}
                            <Link
                              href={ROUTES.ADMIN.STORES.DETAIL(s.storeId)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Abrir <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[6px] border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
            <p className="font-semibold mb-1">Como ler esta tela:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong>Nunca conferido</strong>: a moeda está preenchida, mas ninguém a confrontou com a
                plataforma — pode ser o default BRL herdado do cadastro antigo.
              </li>
              <li>
                <strong>Sem moeda</strong>: o sync assume BRL e valor estrangeiro entra no dashboard sem
                conversão.
              </li>
              <li>
                <strong>Sem fuso</strong>: a janela do relatório é cortada num fuso assumido
                (America/Sao_Paulo), e o total diverge do painel da plataforma sem explicação.
              </li>
              <li>
                <strong>Manual</strong>: alguém definiu à mão. A sincronia em massa respeita; o botão
                <em> Conferir</em> da própria linha sobrescreve, porque ali o pedido é explícito.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE_CLASS
  label: string
  value: number
}) {
  return (
    <div className={`rounded-[6px] border p-3 ${TONE_CLASS[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-gray-400 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  )
}


/**
 * Primeiro e último dia do mês anterior, em YYYY-MM-DD.
 *
 * Montado em UTC de propósito: `new Date(ano, mes, dia)` é local, e num
 * fuso a oeste o dia 1 vira o último dia do mês anterior — a janela
 * sairia deslocada justamente na ferramenta que existe para achar
 * janela deslocada.
 */
function mesAnteriorCompleto(): { inicio: string; fim: string } {
  const hoje = new Date()
  const primeiroDesteMes = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)
  const fim = new Date(primeiroDesteMes)
  fim.setUTCDate(0) // último dia do mês anterior
  const inicio = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { inicio: iso(inicio), fim: iso(fim) }
}
