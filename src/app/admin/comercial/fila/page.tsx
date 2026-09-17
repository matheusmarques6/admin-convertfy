"use client"

/**
 * Fila de hoje — a lista de quem abordar, na ordem, com teto por dia.
 *
 * O kanban responde "como está o funil"; esta tela responde "quem eu
 * chamo agora". Pendentes (follow-up vencido ou tarefa aberta) vêm
 * antes das conversas novas, e o teto vale só sobre as novas — ele é o
 * limite do número de WhatsApp, não do trabalho.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { AlertTriangle, ListChecks, RefreshCw } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { BotaoToque, type RespostaDoToque } from "@/components/crm/botao-toque"
import { TETO_DIARIO_PADRAO, type FilaDoDia, type ItemDaFila } from "@/lib/crm/fila-do-dia"

/** Lança em não-2xx: erro virando lista vazia se lê como "fila zerada". */
async function fetcher(url: string) {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const raw = body?.error
    throw new Error(
      (typeof raw === "string" ? raw : raw?.message) ?? "Falha ao carregar a fila.",
    )
  }
  // `successResponse` espalha os dados no TOPO do corpo (não há `data`).
  return body as FilaDoDia & { teto: number; total_aberto: number }
}

interface PipelineResumo {
  id: string
  name: string
  scope: string
}

const CHAVE_PIPELINE = "crm:fila:pipeline"

export default function FilaDoDiaPage() {
  const [pipelineId, setPipelineId] = useState<string>("")
  const [teto, setTeto] = useState<number>(TETO_DIARIO_PADRAO)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  const { data: pipelines } = useSWR<{ pipelines?: PipelineResumo[] }>(
    "/api/crm/pipelines?scope=sales",
    (u: string) => fetch(u).then((r) => r.json()),
  )

  const lista = useMemo(() => pipelines?.pipelines ?? [], [pipelines])

  // Escolha lembrada: quem opera a fila volta nela todo dia.
  useEffect(() => {
    if (pipelineId) return
    const salva = typeof window !== "undefined" ? localStorage.getItem(CHAVE_PIPELINE) : null
    if (salva && lista.some((p) => p.id === salva)) setPipelineId(salva)
    else if (lista.length > 0) setPipelineId(lista[0].id)
  }, [lista, pipelineId])

  useEffect(() => {
    if (pipelineId) localStorage.setItem(CHAVE_PIPELINE, pipelineId)
  }, [pipelineId])

  const { data, error, isLoading, mutate } = useSWR(
    pipelineId ? `/api/crm/prospeccao/fila?pipeline_id=${pipelineId}&teto=${teto}` : null,
    fetcher,
  )

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  function aoEnviar(r: RespostaDoToque) {
    const partes = [`${r.toque} aberto no WhatsApp`]
    if (r.moveu && r.etapa) partes.push(`card em "${r.etapa}"`)
    setAviso(
      r.avisos.length
        ? { tipo: "erro", texto: `${partes.join(" · ")}. ${r.avisos.join(" ")}` }
        : { tipo: "ok", texto: `${partes.join(" · ")}.` },
    )
    void mutate()
  }

  return (
    <CrmPageShell
      title="Fila de hoje"
      subtitle="Quem abordar agora, na ordem A → B → C → D, com teto por dia."
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 11, color: "var(--crm-gray-500)", fontWeight: 500 }}>
            Pipeline
          </span>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="rounded-[6px] px-2 py-1.5"
            style={{
              border: "1px solid var(--crm-gray-200)",
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              fontSize: 13,
              minWidth: 240,
            }}
          >
            {lista.length === 0 && <option value="">Nenhuma pipeline de vendas</option>}
            {lista.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 11, color: "var(--crm-gray-500)", fontWeight: 500 }}>
            Conversas novas por dia
          </span>
          <input
            type="number"
            min={0}
            max={500}
            value={teto}
            onChange={(e) => setTeto(Math.max(0, Number(e.target.value) || 0))}
            className="crm-tnum rounded-[6px] px-2 py-1.5"
            style={{
              border: "1px solid var(--crm-gray-200)",
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              fontSize: 13,
              width: 96,
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => void mutate()}
          className="flex cursor-pointer items-center gap-1.5 rounded-[6px] px-3 py-1.5"
          style={{
            border: "1px solid var(--crm-gray-200)",
            background: "var(--crm-gray-0)",
            color: "var(--crm-gray-600)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {aviso && (
        <div
          className="mb-3 rounded-[6px] px-3 py-2"
          style={{
            background: aviso.tipo === "ok" ? "var(--crm-pos-bg)" : "var(--crm-neg-bg)",
            border: `1px solid ${aviso.tipo === "ok" ? "var(--crm-pos-border)" : "var(--crm-neg-border)"}`,
            color: aviso.tipo === "ok" ? "var(--crm-pos)" : "var(--crm-neg)",
            fontSize: 12.5,
          }}
        >
          {aviso.texto}
        </div>
      )}

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

      {/* Sem pipeline escolhida o SWR nem dispara (`key` null), então
          `isLoading` é false e a tela ficaria EM BRANCO entre montar e
          o efeito resolver a pipeline. Os dois casos precisam de texto:
          "carregando" e "não existe pipeline nenhuma" pedem ações
          opostas de quem está olhando. */}
      {!pipelineId && lista.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>
          Nenhuma pipeline de vendas nesta organização — crie uma para a fila
          ter de onde ler.
        </p>
      )}
      {!pipelineId && lista.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>Escolhendo a pipeline…</p>
      )}
      {pipelineId && isLoading && !data && (
        <p style={{ fontSize: 13, color: "var(--crm-gray-500)" }}>Montando a fila…</p>
      )}

      {data && (
        <div className="flex flex-col gap-5">
          <Secao
            titulo="Pendentes"
            subtitulo="Follow-up vencido ou tarefa aberta. Vem antes de abrir conversa nova."
            itens={data.pendentes}
            vazio="Nenhum follow-up devendo."
            aoEnviar={aoEnviar}
            aoErrar={(texto) => setAviso({ tipo: "erro", texto })}
          />

          <Secao
            titulo={`Abordagens novas (${data.novos.length} de ${data.novos.length + data.aguardandoVez})`}
            subtitulo={
              data.aguardandoVez > 0
                ? `${data.aguardandoVez} esperando a vez — o teto é o limite do número, não do trabalho.`
                : "Toda a fila cabe no teto de hoje."
            }
            itens={data.novos}
            vazio="Ninguém novo para abordar nesta pipeline."
            aoEnviar={aoEnviar}
            aoErrar={(texto) => setAviso({ tipo: "erro", texto })}
          />

          {/* Quem ficou de fora e por quê. "Fila vazia" sozinho não
              distingue "acabou" de "todo mundo está bloqueado". */}
          <div
            className="rounded-[6px] px-3 py-2"
            style={{
              background: "var(--crm-gray-25)",
              border: "1px solid var(--crm-gray-200)",
              fontSize: 12,
              color: "var(--crm-gray-600)",
            }}
          >
            <strong style={{ color: "var(--crm-gray-700)" }}>Fora da fila:</strong>{" "}
            {data.excluidos.aguardando_parceiro} em negociação com o parceiro ·{" "}
            {data.excluidos.nao_contatar} pediram para não ser contatados ·{" "}
            {data.excluidos.sem_telefone} sem telefone ·{" "}
            {data.excluidos.cadencia_concluida} com a cadência concluída. De{" "}
            {data.total_aberto} negócios abertos.
          </div>
        </div>
      )}
    </CrmPageShell>
  )
}

function Secao({
  titulo,
  subtitulo,
  itens,
  vazio,
  aoEnviar,
  aoErrar,
}: {
  titulo: string
  subtitulo: string
  itens: ItemDaFila[]
  vazio: string
  aoEnviar: (r: RespostaDoToque) => void
  aoErrar: (msg: string) => void
}) {
  return (
    <section>
      <h2
        className="flex items-center gap-1.5"
        style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)" }}
      >
        <ListChecks className="h-4 w-4" style={{ color: "var(--crm-gray-400)" }} />
        {titulo}
      </h2>
      <p className="mb-2" style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
        {subtitulo}
      </p>

      {itens.length === 0 ? (
        <p
          className="rounded-[6px] px-3 py-3"
          style={{
            border: "1px dashed var(--crm-gray-200)",
            fontSize: 12.5,
            color: "var(--crm-gray-500)",
          }}
        >
          {vazio}
        </p>
      ) : (
        <ul className="flex flex-col" style={{ gap: 1, maxWidth: 880 }}>
          {itens.map((item) => (
            <Linha key={item.dealId} item={item} aoEnviar={aoEnviar} aoErrar={aoErrar} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Linha({
  item,
  aoEnviar,
  aoErrar,
}: {
  item: ItemDaFila
  aoEnviar: (r: RespostaDoToque) => void
  aoErrar: (msg: string) => void
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{
        border: "1px solid var(--crm-gray-200)",
        borderRadius: 6,
        background: "var(--crm-gray-0)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/admin/comercial/deals/${item.dealId}/detail`}
            className="truncate"
            style={{ fontSize: 13.5, fontWeight: 600, color: "var(--crm-gray-900)" }}
          >
            {item.titulo}
          </Link>
          {item.prioridade && (
            <span
              className="crm-tnum"
              style={{
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 10.5,
                fontWeight: 600,
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-gray-200)",
                color: "var(--crm-gray-600)",
              }}
            >
              {item.prioridade}
            </span>
          )}
          {item.segmentoCurto && (
            <span
              title={item.segmento ?? undefined}
              style={{
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 10.5,
                fontWeight: 500,
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-gray-200)",
                color: "var(--crm-gray-600)",
              }}
            >
              {item.segmentoCurto}
            </span>
          )}
          {item.alerta && (
            <span
              className="inline-flex items-center gap-1"
              title={item.alerta}
              style={{ color: "var(--crm-amber)", fontSize: 11 }}
            >
              <AlertTriangle className="h-3 w-3" />
              {item.alerta}
            </span>
          )}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 11.5, color: "var(--crm-gray-500)", marginTop: 1 }}
        >
          {[
            // A coluna de entrada TEM o nome do segmento; repetir logo
            // abaixo do badge é a mesma informação três vezes na linha.
            item.etapa === item.segmento ? null : item.etapa,
            item.angulo,
            item.tarefa?.content,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </div>
      </div>

      <BotaoToque
        dealId={item.dealId}
        // A fila já leu os sinais; reconstruir o `custom_fields` aqui
        // criaria uma segunda verdade sobre as tentativas.
        custom_fields={{ tentativas_contato: item.tentativas, segmento_parceiro: item.segmento }}
        stageName={item.etapa}
        telefone={item.telefone}
        onFeito={aoEnviar}
        onErro={aoErrar}
      />
    </li>
  )
}
