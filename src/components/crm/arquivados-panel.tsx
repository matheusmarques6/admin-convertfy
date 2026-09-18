"use client"

/**
 * Tela dos negócios arquivados de uma pipeline.
 *
 * Arquivar tira o card do quadro (o GET filtra `.neq("status","archived")`)
 * e até 18/09 não existia NENHUM lugar que os mostrasse — 125 negócios no
 * banco, 39 só no Funil Inbound, onde a coluna "Lead novo" tinha 27 de 27
 * arquivados e aparecia vazia. Sem esta tela, "sumiu" e "foi apagado" são
 * indistinguíveis para quem opera.
 *
 * É uma LISTA, não um kanban: arquivado não se arrasta, e o que importa
 * aqui é conferir quem é e decidir se volta — nome, contato, etapa de onde
 * saiu e quando entrou.
 */

import { useState } from "react"
import { ArchiveRestore, ArrowLeft, Loader2 } from "lucide-react"

export interface NegocioArquivado {
  id: string
  title: string
  stage_id: string
  created_at?: string | null
  source?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  client?: { name: string } | null
}

interface Props {
  negocios: NegocioArquivado[]
  /** id → nome, para dizer de qual etapa o negócio saiu. */
  etapas: Map<string, string>
  carregando: boolean
  onVoltar: () => void
  /** Restaura um negócio. Devolve a mensagem de erro, ou null se deu certo. */
  onRestaurar: (id: string) => Promise<string | null>
}

const COLUNAS = [
  { titulo: "Negócio", absorve: true },
  { titulo: "Saiu da etapa", absorve: false },
  { titulo: "Contato", absorve: false },
  { titulo: "Criado", absorve: false },
  { titulo: "", absorve: false },
] as const

function dataCurta(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR")
}

export function ArquivadosPanel({
  negocios,
  etapas,
  carregando,
  onVoltar,
  onRestaurar,
}: Props) {
  // Por id, e não um booleano só: restaurar é uma chamada por linha e o
  // spinner tem de ficar na linha que o operador clicou.
  const [restaurando, setRestaurando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const restaurar = async (id: string) => {
    setRestaurando(id)
    setErro(null)
    const msg = await onRestaurar(id)
    if (msg) setErro(msg)
    setRestaurando(null)
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "var(--crm-gray-50)", fontFamily: "var(--crm-font-sans)" }}
    >
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--crm-border)", background: "var(--crm-gray-0)" }}
      >
        <button
          onClick={onVoltar}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[13px] transition-colors hover:bg-[var(--crm-gray-100)]"
          style={{ color: "var(--crm-gray-600)", borderRadius: "4px" }}
        >
          <ArrowLeft size={14} aria-hidden />
          Voltar ao quadro
        </button>
        <div className="h-4 w-px" style={{ background: "var(--crm-border)" }} />
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--crm-gray-900)" }}>
            Arquivados
          </h2>
          <p className="text-[12px]" style={{ color: "var(--crm-gray-500)" }}>
            Saíram do quadro e não contam nos indicadores. Restaurar devolve o
            negócio à etapa em que ele estava.
          </p>
        </div>
      </div>

      {erro ? (
        <div
          className="px-4 py-2 text-[12px]"
          style={{ background: "var(--crm-danger-bg)", color: "var(--crm-danger-fg)" }}
          role="alert"
        >
          {erro}
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-4">
        {carregando ? (
          <p className="text-[13px]" style={{ color: "var(--crm-gray-500)" }}>
            Carregando…
          </p>
        ) : negocios.length === 0 ? (
          // Só se chega aqui pelo menu, que aparece quando há arquivados — então
          // a lista vazia quase sempre é o operador tendo restaurado o último.
          // "Nenhum negócio arquivado" solto no canto de uma área grande lê como
          // tela quebrada; o desfecho é que ele volte ao quadro, e o caminho fica
          // à mão.
          <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--crm-gray-600)" }}>
              Nenhum negócio arquivado nesta pipeline.
            </p>
            <button
              onClick={onVoltar}
              className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--crm-gray-100)]"
              style={{
                borderColor: "var(--crm-border)",
                borderRadius: "4px",
                background: "var(--crm-gray-0)",
                color: "var(--crm-gray-900)",
              }}
            >
              <ArrowLeft size={13} aria-hidden />
              Voltar ao quadro
            </button>
          </div>
        ) : (
          <div
            className="overflow-hidden border"
            style={{ borderColor: "var(--crm-border)", borderRadius: "6px", background: "var(--crm-gray-0)" }}
          >
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr style={{ background: "var(--crm-gray-100)" }}>
                  {COLUNAS.map((c, i) => (
                    <th
                      key={c.titulo || i}
                      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                      // gray-500 sobre o gray-100 do cabeçalho mede 4,39:1 — abaixo do mínimo.
                      // `width:100%` só na 1ª: a tabela distribui a sobra por igual, e com
                      // 1246px o contato ficava com 334px para 190px de texto — o olho
                      // atravessava um vão de 140px entre uma coluna e a seguinte.
                      style={{ color: "var(--crm-gray-600)", width: c.absorve ? "100%" : undefined }}
                    >
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {negocios.map((n) => (
                  <tr key={n.id} className="border-t" style={{ borderColor: "var(--crm-border)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--crm-gray-900)" }}>
                      <div className="font-medium">{n.title}</div>
                      {n.client?.name ? (
                        <div className="text-[11px]" style={{ color: "var(--crm-gray-500)" }}>
                          {n.client.name}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--crm-gray-600)" }}>
                      {etapas.get(n.stage_id) ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--crm-gray-600)" }}>
                      {n.contact_email || n.contact_phone || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--crm-gray-600)" }}>
                      {dataCurta(n.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => restaurar(n.id)}
                        disabled={restaurando === n.id}
                        className="inline-flex items-center gap-1.5 border px-2 py-1 text-[12px] transition-colors hover:bg-[var(--crm-gray-100)] disabled:opacity-50"
                        style={{
                          borderColor: "var(--crm-border)",
                          borderRadius: "4px",
                          color: "var(--crm-gray-900)",
                        }}
                      >
                        {restaurando === n.id ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden />
                        ) : (
                          <ArchiveRestore size={13} aria-hidden />
                        )}
                        Restaurar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
