"use client"

/**
 * Estúdio de Agentes — painel de embasamento do Estruturador (fase 4 do
 * ADR adr-estruturador-adaptativo).
 *
 * Renderiza o parsed_output da run de forma LEGÍVEL (decisão 8: "nós
 * precisamos entender como a ia pensou e como influenciou cada uma das
 * partes"): diagnóstico, estrutura posição a posição com referência+porquê,
 * fio narrativo, fontes, aprendizados aplicados e descartes.
 *
 * Embaixo, o ciclo de calibração (decisão 9): 👍/👎 + comentário por run
 * (upsert por autor — reclicar atualiza) e o botão "Gerar rascunho de
 * aprendizado", que monta a nota do vault a partir da run + feedback
 * (buildAprendizadoDraft, puro). O caminho de volta ao agente é a curadoria
 * no Obsidian — nunca injeção direta no prompt.
 *
 * `AgentOrientacoes` e `AgentFeedback` servem DOIS agentes desde 04/09
 * (migration 20261111): o Estruturador, que decide a sequência, e o
 * Curador, que escolhe o bloco de cada posição. A tela é a mesma; o que
 * muda é a quem o texto chega e qual rascunho o botão monta. Só o
 * `EstruturadorEmbasamento` continua sendo de um agente só — é a leitura do
 * output dele.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  ClipboardList,
  Copy as CopyIcon,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react"

import {
  EGAccordionRow,
  EGTextarea,
} from "@/components/email-generation/ui/eg-atoms"
import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { buildAprendizadoDraft } from "@/lib/agents/estruturador/aprendizado-draft"
import { buildAprendizadoCuradorDraft } from "@/lib/agents/architect/aprendizado-curador"
import {
  ROTULO_AGENTE,
  type AgenteCalibravel,
} from "@/lib/agents/shared/agente-calibravel"
import {
  LIMITE_ORIENTACAO,
  rotuloEscopo,
  type EscopoOrientacao,
  type KindOrientacao,
} from "@/lib/agents/estruturador/orientacoes"
import {
  CodeBlock,
  OUT_BODY,
  OUT_LABEL,
  OutCard,
  OutItem,
  OutPill,
  OutSection,
  StudioBtn,
} from "./studio-atoms"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ── Shapes tolerantes do parsed_output (a run é a fonte; UI não valida) ──

interface PosicaoView {
  section?: string
  papel?: string
  referencia?: string
  adaptacao?: string
  porque?: string
}

interface DescarteView {
  section?: string | null
  papel_na_referencia?: string | null
  porque?: string
  origem?: string
}

interface EmbasamentoView {
  diagnostico?: {
    objecao_dominante?: string
    alvo_id?: string
    referencia_base?: string
    traducao_do_mecanismo?: string
  }
  estrutura?: PosicaoView[]
  fio_narrativo?: string
  fontes?: Array<{ ref?: string; o_que_pegou?: string; porque?: string }>
  aprendizados_aplicados?: Array<{ slug?: string; como?: string }>
  text_only?: boolean
  descartes?: DescarteView[]
  _validador?: { retry_count?: number; posicoes_removidas?: number; shadow?: boolean }
}

interface FeedbackRow {
  id: string
  rating: "up" | "down"
  comentario: string | null
  autor: string | null
  mine: boolean
  created_at: string
}

// Os átomos (label/body/Sec/Pill) viraram compartilhados em studio-atoms:
// as saídas do Curador, do Montador e do Blueprint usam a MESMA anatomia
// que este painel estabeleceu.
const label = OUT_LABEL
const body = OUT_BODY
const Sec = OutSection
const Pill = OutPill

export function EstruturadorEmbasamento({ output }: { output: unknown }) {
  const o = (output ?? {}) as EmbasamentoView
  const estrutura = Array.isArray(o.estrutura) ? o.estrutura : []
  const descartes = Array.isArray(o.descartes) ? o.descartes : []
  const fontes = Array.isArray(o.fontes) ? o.fontes : []
  const aprendizados = Array.isArray(o.aprendizados_aplicados)
    ? o.aprendizados_aplicados
    : []

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {o._validador?.shadow === true && <Pill text="shadow — não consumido" tone="warn" />}
        {o._validador?.shadow === false && <Pill text="consumido pelo pipeline" tone="info" />}
        {(o._validador?.retry_count ?? 0) > 0 && (
          <Pill text={`retry ×${o._validador?.retry_count}`} tone="neut" />
        )}
        {(o._validador?.posicoes_removidas ?? 0) > 0 && (
          <Pill text={`${o._validador?.posicoes_removidas} posição(ões) removidas pelo validador`} tone="warn" />
        )}
        {o.text_only === true && <Pill text="text_only" tone="warn" />}
      </div>

      <Sec title="Diagnóstico">
        <div style={body}>
          <strong>{o.diagnostico?.alvo_id ? "Alvo (Seletor):" : "Objeção dominante:"}</strong>{" "}
          {o.diagnostico?.alvo_id ?? o.diagnostico?.objecao_dominante ?? "—"}
          <br />
          <strong>Referência base:</strong> {o.diagnostico?.referencia_base ?? "—"}
          <br />
          <strong>Tradução do mecanismo:</strong>{" "}
          {o.diagnostico?.traducao_do_mecanismo ?? "—"}
        </div>
      </Sec>

      {estrutura.length > 0 && (
        <Sec title={`Estrutura (${estrutura.length} posições)`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {estrutura.map((p, i) => (
              <OutItem key={i}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...body, fontWeight: 700, ...TNUM }}>{i + 1}.</span>
                  <span style={{ ...body, fontWeight: 700 }}>{p.section ?? "?"}</span>
                  {p.referencia && <Pill text={p.referencia} tone="neut" />}
                </div>
                <div style={{ ...body, marginTop: 3 }}>{p.papel ?? "—"}</div>
                {p.adaptacao && (
                  <div style={{ ...body, color: C.g500, marginTop: 2 }}>
                    <strong>Adaptação:</strong> {p.adaptacao}
                  </div>
                )}
                {p.porque && (
                  <div style={{ ...body, color: C.g500, marginTop: 2 }}>
                    <strong>Porquê:</strong> {p.porque}
                  </div>
                )}
              </OutItem>
            ))}
          </div>
        </Sec>
      )}

      {o.fio_narrativo && (
        <Sec title="Fio narrativo">
          <div style={{ ...body, fontStyle: "italic" }}>{o.fio_narrativo}</div>
        </Sec>
      )}

      {fontes.length > 0 && (
        <Sec title="Fontes">
          <div style={body}>
            {fontes.map((f, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <strong>{f.ref ?? "?"}</strong> — {f.o_que_pegou ?? "—"}
                {f.porque ? ` (${f.porque})` : ""}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {aprendizados.length > 0 && (
        <Sec title="Aprendizados aplicados">
          <div style={body}>
            {aprendizados.map((a, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <strong>{a.slug ?? "?"}</strong>
                {a.como ? ` — ${a.como}` : ""}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {descartes.length > 0 && (
        <Sec title="Descartes">
          <div style={body}>
            {descartes.map((d, i) => (
              <div key={i} style={{ marginBottom: 3, display: "flex", gap: 6, alignItems: "baseline" }}>
                <Pill
                  text={d.origem === "validador" ? "validador" : "modelo"}
                  tone={d.origem === "validador" ? "warn" : "neut"}
                />
                <span>
                  {d.section ? `${d.section}: ` : ""}
                  {d.papel_na_referencia ? `${d.papel_na_referencia} — ` : ""}
                  {d.porque ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Sec>
      )}
    </OutCard>
  )
}

interface OrientacaoRow {
  id: string
  escopo: EscopoOrientacao
  kind?: KindOrientacao | null
  texto: string
}

/**
 * Um campo editável = escopo + kind. Só o `flow` se divide em dois.
 *
 * Não é invenção da tela: o pipeline JÁ trata as duas coisas como variáveis
 * de prompt independentes (`intencao_flow` e `progressao`, montadas em
 * estruturador.service.ts a partir do vault). Quem escreve sobre um fluxo
 * escreve as duas — o arco e a escada — e elas não cabem numa caixa só.
 */
export type CampoOrientacao =
  | "global"
  | "flow"
  | "flow:intencao"
  | "flow:progressao"
  | "email"

interface OrientacoesResponse {
  global: OrientacaoRow | null
  flow: OrientacaoRow | null
  flow_intencao: OrientacaoRow | null
  flow_progressao: OrientacaoRow | null
  email: OrientacaoRow | null
  /** `false` = fluxo sem `email_structure_refs`. Ver o aviso no topo. */
  tem_material_vault: boolean | null
}

type ChaveResposta = Exclude<keyof OrientacoesResponse, "tem_material_vault">

const DEF: Record<
  CampoOrientacao,
  {
    escopo: EscopoOrientacao
    kind: KindOrientacao
    chave: ChaveResposta
    icon: typeof ClipboardList
    dica: string
  }
> = {
  email: {
    escopo: "email",
    kind: "geral",
    chave: "email",
    icon: ClipboardList,
    dica: "Ex.: sempre entregue o cupom no hero.",
  },
  flow: {
    escopo: "flow",
    kind: "geral",
    chave: "flow",
    icon: ClipboardList,
    dica: "Ex.: nunca abra com desconto.",
  },
  "flow:intencao": {
    escopo: "flow",
    kind: "intencao",
    chave: "flow_intencao",
    icon: Target,
    dica: "O arco do fluxo: o que ele precisa provocar, do primeiro ao último e-mail.",
  },
  "flow:progressao": {
    escopo: "flow",
    kind: "progressao",
    chave: "flow_progressao",
    icon: TrendingUp,
    dica: "Como a forma muda de e-mail para e-mail — urgência, tamanho, prova, oferta.",
  },
  global: {
    escopo: "global",
    kind: "geral",
    chave: "global",
    icon: ClipboardList,
    dica: "Ex.: depoimento nunca fecha o email.",
  },
}

/**
 * Orientações do COO — o outro lado do 👍/👎.
 *
 * O feedback acima julga UMA decisão e vira rascunho de aprendizado (o
 * caminho do vault, curado). Isto aqui instrui as PRÓXIMAS gerações e vale
 * na hora: o texto é servido em `<orientacao_do_coo>`, acima dos
 * aprendizados na precedência do prompt. A UI precisa deixar a diferença
 * óbvia, senão viram a mesma caixa com dois significados.
 *
 * Serve dois lugares. No Estúdio (`execs-tab`) nasce de uma RUN e mostra os
 * três escopos. Na aba Arquitetura nasce do fluxo em edição, sem run — daí
 * `runId` opcional (alimenta só `origem_run_id`, que a rota já aceita nulo)
 * e `campos`, que recorta o que aparece. Um editor só: escrever a mesma
 * diretriz em dois componentes diferentes é como as telas antigas
 * divergiram.
 */
export function AgentOrientacoes({
  agente = "estruturador",
  runId,
  flowType,
  emailNumber,
  campos = ["email", "flow", "flow:intencao", "flow:progressao", "global"],
  titulo = "Orientações para as próximas gerações",
  rotulos,
  colapsavel = false,
}: {
  /**
   * A quem o texto será servido. A tabela separa por `agente` (migration
   * 20261111): escrever para o Estruturador NÃO instrui o Curador, e o
   * contrário também não — são papéis e erros diferentes.
   */
  agente?: AgenteCalibravel
  runId?: string | null
  flowType: string | null
  emailNumber: number
  /**
   * Quais campos editar aqui, na ordem em que aparecem. São coisas
   * diferentes e nenhum é apelido do outro: `flow` é a REGRA que vale em
   * todo e-mail do fluxo ("nunca abra com desconto"), `flow:intencao` é o
   * arco e `flow:progressao` é a escada. A aba Arquitetura pede só os dois
   * últimos — lá se desenha o fluxo, não se escreve regra de método.
   */
  campos?: ReadonlyArray<CampoOrientacao>
  titulo?: string
  /** Sobrescreve o rótulo de um campo com o vocabulário da tela. */
  rotulos?: Partial<Record<CampoOrientacao, string>>
  /**
   * Recolhe cada campo atrás de uma linha de acordeão com o resumo do que
   * está escrito. O campo cresce até 520px; aberto por padrão entre o título
   * do fluxo e a régua, ele empurraria a régua para fora da tela.
   */
  colapsavel?: boolean
}) {
  const qs = new URLSearchParams()
  qs.set("agente", agente)
  if (flowType) qs.set("flow_type", flowType)
  if (flowType) qs.set("email_number", String(emailNumber))
  const { data, mutate } = useSWR<OrientacoesResponse>(
    `/api/admin/agents/estruturador-orientacoes?${qs.toString()}`,
    fetcher,
  )

  // Rascunho local por campo: mostra o que está gravado até o COO digitar,
  // e aí passa a mostrar o que ele digitou (sem o SWR sobrescrever no meio
  // da frase quando revalida).
  const [rascunho, setRascunho] = useState<Partial<Record<CampoOrientacao, string>>>({})
  const [salvando, setSalvando] = useState<CampoOrientacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<CampoOrientacao | null>(null)
  const [aberto, setAberto] = useState<CampoOrientacao | null>(null)

  const gravado = (campo: CampoOrientacao) => data?.[DEF[campo].chave]?.texto ?? ""

  const valor = (campo: CampoOrientacao) => rascunho[campo] ?? gravado(campo)
  const sujo = (campo: CampoOrientacao) =>
    rascunho[campo] !== undefined && rascunho[campo] !== gravado(campo)

  const salvar = async (campo: CampoOrientacao) => {
    const { escopo, kind } = DEF[campo]
    setSalvando(campo)
    setErro(null)
    setSalvo(null)
    try {
      const res = await fetch("/api/admin/agents/estruturador-orientacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agente,
          escopo,
          kind,
          flow_type: escopo === "global" ? null : flowType,
          email_number: escopo === "email" ? emailNumber : null,
          texto: valor(campo),
          origem_run_id: runId ?? null,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `HTTP ${res.status}`)
      }
      setRascunho((r) => ({ ...r, [campo]: undefined }))
      setSalvo(campo)
      void mutate()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSalvando(null)
    }
  }

  /** Primeira linha do que está escrito — o resumo da linha fechada. */
  const resumo = (campo: CampoOrientacao) => {
    const linha = valor(campo).split("\n").map((l) => l.trim()).find(Boolean)
    if (!linha) return "Não definido"
    return linha.length > 54 ? `${linha.slice(0, 54)}…` : linha
  }

  // Sem flow não dá para escopar por flow/email — só a geral faz sentido.
  const visiveis = campos.filter(
    (c) => DEF[c].escopo === "global" || Boolean(flowType),
  )

  const campo = (chave: CampoOrientacao, primeiro: boolean) => {
    const { escopo, kind, icon: Icon } = DEF[chave]
    const rotulo =
      rotulos?.[chave] ?? rotuloEscopo(escopo, flowType, emailNumber, kind)
    const corpo = miolo(chave)

    if (colapsavel) {
      const isOpen = aberto === chave
      return (
        <div key={chave}>
          <EGAccordionRow
            icon={<Icon size={16} color={C.brand} style={{ flex: "0 0 16px" }} />}
            label={rotulo}
            status={resumo(chave)}
            filled={valor(chave).trim().length > 0}
            open={isOpen}
            first={primeiro}
            onToggle={() => setAberto(isOpen ? null : chave)}
          />
          {isOpen && (
            <div style={{ padding: "0 14px 14px", background: C.g50 }}>{corpo}</div>
          )}
        </div>
      )
    }

    return (
      <div key={chave} style={{ marginBottom: 10 }}>
        <div style={{ ...label, marginBottom: 3 }}>{rotulo}</div>
        {corpo}
      </div>
    )
  }

  /** O campo em si — igual nos dois modos, só a moldura muda. */
  const miolo = (chave: CampoOrientacao) => {
    // O teto é ANUNCIADO, não aplicado: aqui se cola documento inteiro, e
    // `maxLength` comeria o fim da colagem sem dizer nada (foi o que
    // aconteceu com 4000 — número que era o limite de mensagem do WhatsApp).
    const excedeu = valor(chave).length > LIMITE_ORIENTACAO

    return (
    <>
        {/* Cresce até o teto do átomo e depois rola por dentro: altura fixa
            de 2 linhas escondia quase tudo o que cabe aqui. */}
        <EGTextarea
          value={valor(chave)}
          onChange={(v) => setRascunho((r) => ({ ...r, [chave]: v }))}
          placeholder={DEF[chave].dica}
          minRows={6}
          limite={LIMITE_ORIENTACAO}
          style={{
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            padding: "7px 10px",
            fontSize: 12,
            fontFamily: F.sans,
            color: C.g900,
            background: C.white,
          }}
        />
        {sujo(chave) && (
          <div style={{ marginTop: 5 }}>
            <StudioBtn
              onClick={() => void salvar(chave)}
              disabled={salvando != null || excedeu}
              title={
                excedeu
                  ? `Passou do limite de ${LIMITE_ORIENTACAO.toLocaleString("pt-BR")} caracteres — corte o excesso para salvar. Nada foi apagado.`
                  : undefined
              }
              style={{ height: 26 }}
            >
              {salvando === chave ? "Salvando…" : "Salvar"}
            </StudioBtn>
          </div>
        )}
        {salvo === chave && !sujo(chave) && (
          <div style={{ ...body, color: "#065F46", marginTop: 4 }}>
            Salvo — vale a partir da próxima geração.
          </div>
        )}
    </>
    )
  }

  /**
   * O limite que precisa aparecer ANTES de alguém escrever: `carregarMaterial`
   * corta em `refs.length === 0`, então um fluxo sem referência de estrutura
   * no vault nem chega a montar o prompt do Estruturador — a orientação não
   * é ignorada, ela nunca é lida.
   */
  const semMaterial =
    agente === "estruturador" &&
    Boolean(flowType) &&
    data?.tem_material_vault === false
  const aviso = semMaterial ? (
    <div
      style={{
        fontSize: 11.5,
        lineHeight: 1.5,
        color: C.warn,
        background: C.warnBg,
        border: `1px solid ${C.warnBorder}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontFamily: F.sans,
      }}
    >
      Este fluxo ainda não tem referência de estrutura no vault. Sem ela o
      Estruturador não roda aqui (devolve <code>sem_material</code> e a
      geração cai no outline), então <strong>nada do que estiver escrito
      abaixo chega a uma geração</strong> — o texto fica gravado e passa a
      valer no dia em que o fluxo ganhar referência.
    </div>
  ) : null

  const lista = (
    <>
      {visiveis.map((c, i) => campo(c, i === 0))}
      {erro && (
        <div style={{ fontSize: 11.5, color: "#991B1B", fontFamily: F.sans }}>
          {erro}
        </div>
      )}
    </>
  )

  // No modo recolhido a própria linha do acordeão é o cabeçalho — repetir
  // título e descrição em cima dela seria dizer a mesma coisa duas vezes.
  if (colapsavel) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {aviso}
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: "hidden",
            background: C.white,
          }}
        >
          {lista}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: C.g50,
      }}
    >
      <div style={{ ...label, marginBottom: 3 }}>{titulo}</div>
      <div style={{ ...body, color: C.g500, marginBottom: 10 }}>
        Vale imediatamente, em <strong>todas as lojas</strong> — não passa
        pelo vault. Nenhum campo é obrigatório.
      </div>
      {aviso && <div style={{ marginBottom: 10 }}>{aviso}</div>}
      {lista}
    </div>
  )
}

/** Teto do `comentario` na rota de feedback (`z.string().max(4000)`). */
const LIMITE_COMENTARIO = 4000

export function AgentFeedback({
  agente,
  runId,
  output,
  flowType,
  emailNumber,
  storeName,
  runIso,
}: {
  /**
   * Quem decidiu. Não vai para a rota — o agente é lido da RUN lá, para
   * que a tela não possa gravar feedback de Curador numa run de
   * Estruturador. Aqui ele escolhe o rascunho e o vocabulário do botão.
   */
  agente: AgenteCalibravel
  runId: string
  output: unknown
  flowType: string | null
  emailNumber: number
  storeName: string
  /** Data da run (ou da execução) — vira o `data` do rascunho. */
  runIso: string
}) {
  const { data, mutate } = useSWR<{ feedbacks: FeedbackRow[] }>(
    `/api/admin/agents/estruturador-feedback?run_id=${runId}`,
    fetcher,
  )
  const feedbacks = useMemo(() => data?.feedbacks ?? [], [data])
  const meu = feedbacks.find((f) => f.mine) ?? null

  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState<"up" | "down" | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ path: string; markdown: string } | null>(null)

  const enviar = async (rating: "up" | "down") => {
    setEnviando(rating)
    setErro(null)
    try {
      const res = await fetch("/api/admin/agents/estruturador-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          rating,
          comentario: comentario.trim() || meu?.comentario || null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          (json && typeof json.error === "string" && json.error) ||
            "Falha ao registrar o feedback",
        )
      }
      setComentario("")
      void mutate()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar feedback")
    } finally {
      setEnviando(null)
    }
  }

  const gerarDraft = () => {
    // Os dois erram coisas diferentes — a sequência × o bloco de cada
    // posição —, então o rascunho não pode ser o mesmo texto com outro
    // título: cada builder lê o output do SEU agente.
    const comum = {
      flowType: flowType ?? "custom",
      emailNumber,
      storeName,
      runId,
      dataIso: runIso,
      feedbacks: feedbacks.map((f) => ({
        rating: f.rating,
        comentario: f.comentario,
        autor: f.autor,
      })),
    }
    const d =
      agente === "curador"
        ? buildAprendizadoCuradorDraft({
            ...comum,
            output: (output ?? {}) as Parameters<
              typeof buildAprendizadoCuradorDraft
            >[0]["output"],
          })
        : buildAprendizadoDraft({
            ...comum,
            output: (output ?? {}) as Parameters<
              typeof buildAprendizadoDraft
            >[0]["output"],
          })
    setDraft({ path: d.path, markdown: d.markdown })
  }

  // O comentário viaja junto do 👍/👎: acima do teto a rota devolveria 400,
  // então o botão espera em vez de perder o texto.
  const comentarioLongo = comentario.length > LIMITE_COMENTARIO

  const fbBtn = (rating: "up" | "down") => {
    const on = meu?.rating === rating
    const Icon = rating === "up" ? ThumbsUp : ThumbsDown
    const tone = rating === "up" ? "#065F46" : "#991B1B"
    return (
      <button
        onClick={() => void enviar(rating)}
        disabled={enviando != null || comentarioLongo}
        title={
          comentarioLongo
            ? `O comentário passou de ${LIMITE_COMENTARIO.toLocaleString("pt-BR")} caracteres — corte o excesso para enviar.`
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 7,
          border: `1px solid ${on ? tone : C.border}`,
          background: on ? (rating === "up" ? "#ECFDF5" : "#FEF2F2") : C.white,
          color: on ? tone : C.g500,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: F.sans,
          cursor: enviando != null ? "wait" : "pointer",
        }}
      >
        <Icon size={13} />
        {rating === "up" ? "Boa decisão" : "Decisão ruim"}
      </button>
    )
  }

  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: C.g50,
      }}
    >
      <div style={{ ...label, marginBottom: 3 }}>
        Sobre ESTA decisão do {ROTULO_AGENTE[agente]}
      </div>
      <div style={{ ...body, color: C.g500, marginBottom: 8 }}>
        {agente === "curador"
          ? "Julga a escolha de bloco desta run e alimenta o rascunho de aprendizado do vault. Para instruir as próximas gerações, use o bloco acima."
          : "Julga a run que está aberta e alimenta o rascunho de aprendizado do vault. Para instruir as próximas gerações, use o bloco acima."}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {fbBtn("up")}
        {fbBtn("down")}
      </div>
      {/* `limite` e não `maxLength`: o teto de 4000 é da rota de feedback, e
          o atributo nativo comeria uma colagem longa sem avisar — o mesmo
          defeito que engoliu a especificação de fluxo no bloco acima. */}
      <div style={{ marginBottom: 8 }}>
        <EGTextarea
          value={comentario}
          onChange={setComentario}
          placeholder={
            meu?.comentario
              ? `Seu comentário atual: ${meu.comentario}`
              : "O que estava certo/errado nesta decisão? (vai junto do 👍/👎)"
          }
          minRows={2}
          limite={LIMITE_COMENTARIO}
          style={{
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            padding: "7px 10px",
            fontSize: 12,
            fontFamily: F.sans,
            color: C.g900,
            background: C.white,
          }}
        />
      </div>
      {erro && (
        <div style={{ fontSize: 11.5, color: "#991B1B", fontFamily: F.sans, marginBottom: 8 }}>
          {erro}
        </div>
      )}

      {feedbacks.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...label, marginBottom: 4 }}>Feedback recebido</div>
          {feedbacks.map((f) => (
            <div key={f.id} style={{ ...body, marginBottom: 3 }}>
              {f.rating === "up" ? "👍" : "👎"} <strong>{f.autor ?? "—"}</strong>
              {f.comentario ? `: ${f.comentario}` : ""}
            </div>
          ))}
        </div>
      )}

      <StudioBtn onClick={gerarDraft} style={{ height: 30 }}>
        Gerar rascunho de aprendizado
      </StudioBtn>

      {draft && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ ...body, color: C.g500 }}>
              Salvar no vault como <code style={{ fontSize: 11 }}>{draft.path}</code>
            </span>
            <StudioBtn
              onClick={() => void navigator.clipboard?.writeText(draft.markdown)}
              style={{ height: 26 }}
            >
              <CopyIcon size={12} /> Copiar
            </StudioBtn>
          </div>
          <CodeBlock text={draft.markdown} />
        </div>
      )}
    </div>
  )
}
