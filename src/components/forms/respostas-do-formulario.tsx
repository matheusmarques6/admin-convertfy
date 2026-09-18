"use client"

/**
 * A visão "Respostas" da aba Resultados (handoff §11): uma linha por
 * envio, uma coluna por pergunta, com o lead e a etapa do negócio — e a
 * exportação em CSV no padrão da casa (`crm-csv`).
 *
 * A planilha é o que veio na tela, e a tela diz quando foi cortada:
 * exportar 200 de 1.340 sem aviso é a planilha "completa" que engana.
 */

import { useMemo } from "react"
import useSWR from "swr"
import { Download, ExternalLink } from "lucide-react"
import { csvDate, downloadCsv, toCsv } from "@/lib/services/crm-csv"

interface Resposta {
  id: string
  created_at: string
  lead: { id: string; name: string | null; email: string | null; phone: string | null } | null
  deal: { id: string; title: string | null; etapa: string | null } | null
  utm: { source: string | null; medium: string | null; campaign: string | null }
  respostas: Array<{ ref: string; pergunta: string; valor: unknown; rotulo?: string }>
}

interface Payload {
  respostas: Resposta[]
  colunas: Array<{ ref: string; pergunta: string }>
  total: number | null
  truncado: boolean
  dias: number | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body as Payload
}

function texto(v: unknown): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map(String).join(", ")
  if (typeof v === "boolean") return v ? "Sim" : "Não"
  return String(v)
}

export function RespostasDoFormulario({
  formId,
  slug,
  dias,
}: {
  formId: string
  slug: string
  /** `null` = tudo. */
  dias: number | null
}) {
  const { data, error, isLoading } = useSWR<Payload>(
    `/api/crm/forms/${formId}/respostas?limite=500${dias ? `&dias=${dias}` : ""}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const linhas = useMemo(() => {
    if (!data) return []
    return data.respostas.map((r) => {
      const porRef = new Map(r.respostas.map((x) => [x.ref, x.rotulo ?? texto(x.valor)]))
      return { r, celulas: data.colunas.map((c) => porRef.get(c.ref) ?? "") }
    })
  }, [data])

  const exportar = () => {
    if (!data) return
    const header = ["Data", "Nome", "E-mail", "Telefone", "Etapa", ...data.colunas.map((c) => c.pergunta), "utm_source", "utm_medium", "utm_campaign"]
    const rows = linhas.map(({ r, celulas }) => [
      csvDate(r.created_at),
      r.lead?.name ?? "",
      r.lead?.email ?? "",
      r.lead?.phone ?? "",
      r.deal?.etapa ?? "",
      ...celulas,
      r.utm.source ?? "",
      r.utm.medium ?? "",
      r.utm.campaign ?? "",
    ])
    downloadCsv(`respostas-${slug}-${dias ? `${dias}d` : "tudo"}.csv`, toCsv(header, rows))
  }

  if (isLoading) return <p className="text-[12px] text-slate-500 dark:text-white/45">Carregando…</p>
  if (error) return <p className="text-[12px] text-red-600 dark:text-red-400">{(error as Error).message}</p>
  if (!data) return null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-slate-500 dark:text-white/45">
          {data.respostas.length} {data.respostas.length === 1 ? "resposta" : "respostas"}
          {dias ? ` nos últimos ${dias} dias` : ""}
          {data.total !== null && !dias && data.total !== data.respostas.length ? ` · ${data.total} no total` : ""}
          {data.truncado && (
            <span className="ml-1.5 text-amber-700 dark:text-amber-300">
              · mostrando as 500 mais recentes — a exportação leva só estas
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={exportar}
          disabled={linhas.length === 0}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-black/[0.10] px-2.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {linhas.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-black/[0.12] px-4 py-8 text-center text-[12px] text-slate-500 dark:border-white/[0.14] dark:text-white/45">
          Nenhuma resposta {dias ? "neste período" : "ainda"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[8px] border border-black/[0.08] dark:border-white/[0.10]">
          <table className="w-full min-w-[720px] border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:bg-white/[0.04] dark:text-white/45">
                <th className="whitespace-nowrap px-2.5 py-2">Quando</th>
                <th className="whitespace-nowrap px-2.5 py-2">Lead</th>
                <th className="whitespace-nowrap px-2.5 py-2">Etapa</th>
                {data.colunas.map((c) => (
                  <th key={c.ref} className="max-w-[220px] truncate px-2.5 py-2" title={c.pergunta}>
                    {c.pergunta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ r, celulas }) => (
                <tr key={r.id} className="border-t border-black/[0.06] align-top dark:border-white/[0.08]">
                  <td className="whitespace-nowrap px-2.5 py-2 text-slate-500 dark:text-white/50">
                    {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-2.5 py-2">
                    {r.lead ? (
                      <a
                        href={`/admin/crm/leads/${r.lead.id}`}
                        className="inline-flex items-center gap-1 font-medium text-slate-800 hover:underline dark:text-white/85"
                      >
                        {r.lead.name || r.lead.email || r.lead.phone || "Lead"}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {r.lead?.email && <span className="block text-[10.5px] text-slate-500 dark:text-white/45">{r.lead.email}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-slate-600 dark:text-white/65">
                    {r.deal?.etapa ?? <span className="text-slate-400">—</span>}
                  </td>
                  {celulas.map((c, i) => (
                    <td key={i} className="max-w-[260px] px-2.5 py-2 text-slate-700 dark:text-white/75">
                      <span className="line-clamp-3">{c || <span className="text-slate-300 dark:text-white/20">—</span>}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
