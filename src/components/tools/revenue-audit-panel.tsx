"use client"

/**
 * O resultado da conferência de receita contra a Omnisend.
 *
 * A pergunta que este painel responde é "por que o relatório não bate
 * com o painel do cliente" — e ela não se responde com um número, se
 * responde com a MEMÓRIA DE CÁLCULO: a janela exata que foi enviada, o
 * fuso em que ela foi cortada, e qual das duas APIs respondeu cada
 * metade. Era tudo o que existia só no log.
 */

import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import type { RevenueAuditResult } from "@/app/api/stores/revenue-audit/route"

function fmtNum(n: number | null, moeda: string | null): string {
  if (n === null) return "—"
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moeda ? `${moeda} ${s}` : s
}

/**
 * Contagem não leva moeda nem centavo. Renderizar a tela com os números
 * do caso real mostrou "USD 2.267,00" na linha de pedidos — o tipo de
 * defeito que passa por todo teste unitário e salta aos olhos na tela.
 */
function fmtValor(n: number | null, unidade: string, moeda: string | null): string {
  if (n === null) return "—"
  if (unidade === "contagem") return Math.round(n).toLocaleString("pt-BR")
  return fmtNum(n, moeda)
}

function fmtPct(p: number | null): string {
  if (p === null) return "—"
  const sinal = p > 0 ? "+" : ""
  return `${sinal}${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

export function RevenueAuditPanel({
  r,
  onFechar,
}: {
  r: RevenueAuditResult
  onFechar: () => void
}) {
  const relevantes = r.divergencias.filter((d) => d.relevante)
  const bate = relevantes.length === 0

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {r.storeName} — conferência contra a Omnisend
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Janela enviada: <span className="font-mono">{r.janela.from}</span> até{" "}
            <span className="font-mono">{r.janela.to}</span> (fim exclusivo)
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          fechar
        </button>
      </div>

      {bate ? (
        <div className="mb-3 flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Os números publicados batem com o que a plataforma responde agora, dentro de 0,1%.
          </span>
        </div>
      ) : (
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {relevantes.length === 1
              ? "1 métrica não bate com a plataforma."
              : `${relevantes.length} métricas não batem com a plataforma.`}
          </span>
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="py-1.5 pr-3 font-medium">Métrica</th>
            <th className="py-1.5 pr-3 text-right font-medium">Publicado</th>
            <th className="py-1.5 pr-3 text-right font-medium">Omnisend agora</th>
            <th className="py-1.5 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {r.divergencias.map((d) => (
            <tr key={d.metrica} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-200">{d.metrica}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                {fmtValor(d.nosso, d.unidade, r.currency)}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                {fmtValor(d.plataforma, d.unidade, r.currency)}
              </td>
              <td
                className={`py-1.5 text-right font-mono tabular-nums ${
                  d.relevante
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {d.diferenca === null
                  ? "—"
                  : d.diferenca === 0
                    ? "bate"
                    : `${fmtValor(d.diferenca, d.unidade, null)}${
                        d.unidade === "moeda" ? ` (${fmtPct(d.diferencaPct)})` : ""
                      }`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Procedência: qual API respondeu cada metade. É o que separa o
          número que bate com o painel do que só se parece com ele. */}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
        <Linha
          rotulo="Fuso usado no corte"
          valor={`${r.janela.fusoUsado}${
            r.janela.procedenciaDoFuso === "cadastro"
              ? " (da plataforma)"
              : r.janela.procedenciaDoFuso === "pais"
                ? " (assumido pelo país — a loja não tem fuso cadastrado)"
                : " (padrão da casa — sem fuso e sem país conhecido)"
          }`}
          alerta={r.janela.fusoAssumido}
        />
        <Linha
          rotulo="Fuso da conta na Omnisend"
          valor={r.fuso.brand ?? "não informado"}
          alerta={r.fuso.divergem}
        />
        <Linha
          rotulo="Moeda no cadastro"
          valor={r.moeda.cadastro ?? "—"}
          alerta={r.moeda.divergem}
        />
        <Linha rotulo="Moeda da conta" valor={r.moeda.brand ?? "não informada"} />
        <Linha
          rotulo="Atribuída por data de ENVIO (painel)"
          valor={
            r.plataforma.porDataDeEnvio
              ? fmtNum(r.plataforma.porDataDeEnvio.receitaAtribuida, r.currency)
              : "a Reports API não respondeu nesta conferência"
          }
          alerta={!r.plataforma.porDataDeEnvio}
        />
        <Linha
          rotulo="Atribuída por data do PEDIDO"
          valor={
            r.plataforma.porDataDoPedido
              ? fmtNum(r.plataforma.porDataDoPedido.receitaAtribuida, r.currency)
              : "a Statistics API não respondeu"
          }
          alerta={!r.plataforma.porDataDoPedido}
        />
        {r.nosso?.fetchedAt && (
          <Linha
            rotulo="Nosso número foi tirado em"
            valor={new Date(r.nosso.fetchedAt).toLocaleString("pt-BR")}
          />
        )}
        {r.nosso?.syncError && (
          <Linha rotulo="Ressalva do último sync" valor={r.nosso.syncError} alerta />
        )}
      </dl>

      {r.causas.length > 0 && (
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
            <Info className="h-3 w-3" /> Causas prováveis
          </p>
          <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-200">
            {r.causas.map((c) => (
              <li key={c}>— {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Lista vazia com divergência real não é "está tudo bem": é
          "nenhuma das causas que sabemos reconhecer se aplica". */}
      {r.causas.length === 0 && !bate && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Nenhuma das causas conhecidas (fuso divergente, atribuição sem calibração, sync
          degradado) explica esta diferença — vale olhar a janela e o momento em que cada
          número foi tirado.
        </p>
      )}

      {r.avisosDoPeriodo.length > 0 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {r.avisosDoPeriodo.join(" ")}
        </p>
      )}
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-gray-500 dark:text-gray-400">{rotulo}:</dt>
      <dd
        className={
          alerta
            ? "font-medium text-amber-700 dark:text-amber-400"
            : "text-gray-700 dark:text-gray-200"
        }
      >
        {valor}
      </dd>
    </div>
  )
}
