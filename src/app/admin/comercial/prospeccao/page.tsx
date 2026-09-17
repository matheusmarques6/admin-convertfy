"use client"

/**
 * Relatório da campanha de prospecção, por segmento.
 *
 * A pergunta é qual segmento vale o dia. Taxa sem denominador aparece
 * como "—", nunca 0% — zero se lê como "ninguém respondeu" quando a
 * verdade costuma ser "ninguém foi abordado ainda".
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import type {
  DiaDaCampanha,
  ExtratoDoParceiro,
  LinhaDoSegmento,
  Marco,
  RelatorioDaCampanha,
} from "@/lib/crm/relatorio-prospeccao"

type Resposta = RelatorioDaCampanha & {
  evolucao: DiaDaCampanha[]
  marcos: Marco[]
  parceiro: (ExtratoDoParceiro & { nome: string }) | null
  historico_lido: boolean
}

async function fetcher(url: string) {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const raw = body?.error
    throw new Error(
      (typeof raw === "string" ? raw : raw?.message) ?? "Falha ao carregar o relatório.",
    )
  }
  return body as Resposta
}

interface PipelineResumo {
  id: string
  name: string
}

const CHAVE_PIPELINE = "crm:prospeccao:pipeline"

/** `null` vira "—". Zero é medição e aparece como 0%. */
function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

export default function RelatorioDaProspeccaoPage() {
  const [pipelineId, setPipelineId] = useState("")

  const { data: pipelines } = useSWR<{ pipelines?: PipelineResumo[] }>(
    "/api/crm/pipelines?scope=sales",
    (u: string) => fetch(u).then((r) => r.json()),
  )
  const lista = useMemo(() => pipelines?.pipelines ?? [], [pipelines])

  useEffect(() => {
    if (pipelineId) return
    const salva = typeof window !== "undefined" ? localStorage.getItem(CHAVE_PIPELINE) : null
    if (salva && lista.some((p) => p.id === salva)) setPipelineId(salva)
    else if (lista.length > 0) setPipelineId(lista[0].id)
  }, [lista, pipelineId])

  useEffect(() => {
    if (pipelineId) localStorage.setItem(CHAVE_PIPELINE, pipelineId)
  }, [pipelineId])

  const { data, error, isLoading } = useSWR(
    pipelineId ? `/api/crm/prospeccao/relatorio?pipeline_id=${pipelineId}` : null,
    fetcher,
  )

  return (
    <CrmPageShell
      title="Relatório da campanha"
      subtitle="Qual segmento responde, qual tem loja vendendo e qual fecha."
    >
      <div className="mb-4">
        <select
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          aria-label="Pipeline do relatório"
          className="rounded-[6px] px-2 py-1.5"
          style={{
            border: "1px solid var(--crm-gray-200)",
            background: "var(--crm-gray-0)",
            color: "var(--crm-gray-900)",
            fontSize: 13,
            minWidth: 260,
          }}
        >
          {lista.length === 0 && <option value="">Nenhuma pipeline de vendas</option>}
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div
          className="rounded-[6px] px-3 py-2"
          style={{
            background: "var(--crm-neg-bg)",
            border: "1px solid var(--crm-neg-border)",
            color: "var(--crm-neg)",
            fontSize: 12.5,
          }}
        >
          {(error as Error).message}
        </div>
      )}
      {!pipelineId && lista.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>
          Nenhuma pipeline de vendas nesta organização.
        </p>
      )}
      {pipelineId && isLoading && !data && (
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>Somando a campanha…</p>
      )}

      {data && (
        <div className="flex flex-col gap-5">
          {!data.historico_lido && (
            <p
              className="rounded-[6px] px-3 py-2"
              style={{
                background: "var(--crm-warn-bg)",
                border: "1px solid var(--crm-warn-border)",
                color: "var(--crm-warn)",
                fontSize: 12,
              }}
            >
              O histórico de etapas não pôde ser lido. As contagens saem da etapa
              atual de cada negócio, então são um piso — não o número.
            </p>
          )}

          <Marcos marcos={data.marcos} />

          {data.parceiro && <Parceiro extrato={data.parceiro} />}

          <Tabela linhas={data.linhas} total={data.total} />

          <Evolucao dias={data.evolucao} />

          <Perdas motivos={data.perdidosPorMotivo} />
        </div>
      )}
    </CrmPageShell>
  )
}

function Marcos({ marcos }: { marcos: Marco[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {marcos.map((m) => {
        const passou = m.diasRestantes < 0
        return (
          <div
            key={m.data}
            className="rounded-[6px] px-3 py-2"
            style={{
              border: `1px solid ${passou ? "var(--crm-gray-200)" : "var(--crm-warn-border)"}`,
              background: passou ? "var(--crm-gray-25)" : "var(--crm-warn-bg)",
              minWidth: 190,
            }}
          >
            <div
              className="crm-tnum"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: passou ? "var(--crm-gray-400)" : "var(--crm-warn)",
              }}
            >
              {passou ? `há ${Math.abs(m.diasRestantes)}d` : `${m.diasRestantes}d`}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--crm-gray-600)" }}>{m.nome}</div>
          </div>
        )
      })}
    </div>
  )
}

function Parceiro({ extrato }: { extrato: ExtratoDoParceiro & { nome: string } }) {
  return (
    <div
      className="flex flex-wrap items-center gap-5 rounded-[6px] px-3 py-2"
      style={{ border: "1px solid var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
    >
      <strong style={{ fontSize: 13, color: "var(--crm-gray-900)" }}>{extrato.nome}</strong>
      <Metrica rotulo="Ganhos" valor={String(extrato.ganhos)} />
      <Metrica rotulo="Receita" valor={brl(extrato.receita)} />
      <Metrica
        rotulo="Comissão"
        // Sem percentual cadastrado a comissão é "—": zero diria que
        // não há comissão, que é outra afirmação.
        valor={extrato.comissao == null ? "—" : brl(extrato.comissao)}
        nota={extrato.percentual == null ? "percentual não cadastrado" : `${extrato.percentual}%`}
      />
    </div>
  )
}

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--crm-gray-500)", textTransform: "uppercase" }}>
        {rotulo}
      </div>
      <div className="crm-tnum" style={{ fontSize: 15, fontWeight: 600, color: "var(--crm-gray-900)" }}>
        {valor}
      </div>
      {nota && <div style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}>{nota}</div>}
    </div>
  )
}

const COLUNAS: Array<{ chave: keyof LinhaDoSegmento; rotulo: string; tipo: "n" | "pct" | "brl" }> = [
  { chave: "total", rotulo: "Total", tipo: "n" },
  { chave: "abordados", rotulo: "Abordados", tipo: "n" },
  { chave: "responderam", rotulo: "Responderam", tipo: "n" },
  { chave: "taxaDeResposta", rotulo: "Taxa", tipo: "pct" },
  { chave: "vendendo", rotulo: "Vendendo", tipo: "n" },
  { chave: "percentualVendendo", rotulo: "% vend.", tipo: "pct" },
  { chave: "diagnosticosAgendados", rotulo: "Diag. ag.", tipo: "n" },
  { chave: "diagnosticosFeitos", rotulo: "Diag. feitos", tipo: "n" },
  { chave: "propostas", rotulo: "Propostas", tipo: "n" },
  { chave: "ganhos", rotulo: "Ganhos", tipo: "n" },
  { chave: "receita", rotulo: "Receita", tipo: "brl" },
  { chave: "perdidos", rotulo: "Perdidos", tipo: "n" },
]

function celula(l: LinhaDoSegmento, c: (typeof COLUNAS)[number]): string {
  const v = l[c.chave]
  if (c.tipo === "pct") return pct(v as number | null)
  if (c.tipo === "brl") return brl(Number(v))
  return String(v)
}

function Tabela({ linhas, total }: { linhas: LinhaDoSegmento[]; total: LinhaDoSegmento }) {
  return (
    <div className="overflow-x-auto">
      <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                borderBottom: "1px solid var(--crm-gray-200)",
                color: "var(--crm-gray-500)",
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              Segmento
            </th>
            {COLUNAS.map((c) => (
              <th
                key={c.chave}
                style={{
                  textAlign: "right",
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--crm-gray-200)",
                  color: "var(--crm-gray-500)",
                  fontWeight: 600,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.segmento}>
              <td
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--crm-gray-100)",
                  color: "var(--crm-gray-900)",
                  whiteSpace: "nowrap",
                }}
              >
                {l.segmento}
              </td>
              {COLUNAS.map((c) => (
                <td
                  key={c.chave}
                  className="crm-tnum"
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--crm-gray-100)",
                    color: "var(--crm-gray-700)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {celula(l, c)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td
              style={{
                padding: "6px 8px",
                borderTop: "1px solid var(--crm-gray-300)",
                fontWeight: 700,
                color: "var(--crm-gray-900)",
              }}
            >
              Total
            </td>
            {COLUNAS.map((c) => (
              <td
                key={c.chave}
                className="crm-tnum"
                style={{
                  textAlign: "right",
                  padding: "6px 8px",
                  borderTop: "1px solid var(--crm-gray-300)",
                  fontWeight: 700,
                  color: "var(--crm-gray-900)",
                  whiteSpace: "nowrap",
                }}
              >
                {celula(total, c)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Evolucao({ dias }: { dias: DiaDaCampanha[] }) {
  const maior = Math.max(1, ...dias.map((d) => d.abordados))
  return (
    <section>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)" }}>
        Abordagens por dia
      </h2>
      <p className="mb-2" style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
        Meta de 40 por dia, por número de WhatsApp.
      </p>
      {dias.length === 0 ? (
        <p
          className="rounded-[6px] px-3 py-3"
          style={{
            border: "1px dashed var(--crm-gray-200)",
            fontSize: 12.5,
            color: "var(--crm-gray-500)",
          }}
        >
          Nenhuma abordagem registrada ainda — a série começa no primeiro T1.
        </p>
      ) : (
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {dias.map((d) => (
            // `flex-1` sozinho estica: com três dias cada barra vira um
            // bloco de 400px e o gráfico deixa de parecer uma série.
            <div
              key={d.dia}
              className="flex flex-1 flex-col items-center gap-1"
              style={{ maxWidth: 34 }}
              title={`${d.dia}: ${d.abordados} de ${d.abordados + Math.max(0, d.faltaParaMeta)}`}
            >
              <div
                style={{
                  // Barra com zero altura some e o dia vazio vira buraco:
                  // 2px de piso deixa o dia sem abordagem visível.
                  height: Math.max(2, (d.abordados / maior) * 96),
                  width: "100%",
                  background:
                    d.faltaParaMeta <= 0 ? "var(--crm-pos)" : "var(--crm-gray-300)",
                  borderRadius: 2,
                }}
              />
              <span className="crm-tnum" style={{ fontSize: 9, color: "var(--crm-gray-400)" }}>
                {d.dia.slice(8)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Perdas({ motivos }: { motivos: Array<{ motivo: string; quantidade: number }> }) {
  if (motivos.length === 0) return null
  return (
    <section>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)" }}>
        Perdas por motivo
      </h2>
      <ul className="mt-1 flex flex-col gap-1" style={{ maxWidth: 520 }}>
        {motivos.map((m) => (
          <li
            key={m.motivo}
            className="flex items-center justify-between rounded-[6px] px-3 py-1.5"
            style={{ border: "1px solid var(--crm-gray-200)", fontSize: 12.5 }}
          >
            <span style={{ color: "var(--crm-gray-700)" }}>{m.motivo}</span>
            <span className="crm-tnum" style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
              {m.quantidade}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
