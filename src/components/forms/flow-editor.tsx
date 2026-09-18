"use client"

/**
 * O construtor de fluxo: o que acontece depois de cada resposta.
 *
 * Ele edita a camada que `crm_form_fields` não tem onde guardar — saltos,
 * telas finais e a tela de abertura — e escreve num `FormSchema`, que é a
 * MESMA forma da versão publicada. Uma segunda forma só para o rascunho
 * divergiria na primeira mudança, e quem edita não teria como saber qual
 * das duas está olhando.
 *
 * **A unidade é a TELA, não a pergunta.** É o que a engine percorre: um
 * grupo de quatro campos é um clique só, e a regra escrita em qualquer
 * uma das quatro vale para as quatro. Listando blocos, o construtor
 * mostrava 10 passos onde havia 6, anunciava "segue para Sobrenome" (um
 * passo que nunca acontece) e não dizia em lugar nenhum que aquelas
 * perguntas estão juntas.
 *
 * Três decisões que a tela precisa carregar, e que nenhum teste pega:
 *
 * **O caminho padrão é desenhado, não subentendido.** Debaixo de cada
 * pergunta aparece "senão, segue para …" mesmo sem regra nenhuma. Sem
 * essa linha, quem abre um formulário sem lógica não vê fluxo nenhum e
 * não tem onde clicar para começar.
 *
 * **O valor da condição é a lista fechada quando ela existe.** Digitar à
 * mão o texto de uma opção é como a regra do lead qualificado passou um
 * mês apontando para o vazio: renomeou a opção, a regra continua
 * comparando o texto antigo e nada acusa.
 *
 * **O problema aparece onde ele mora.** O diagnóstico não é só uma lista
 * no topo: a regra defeituosa fica marcada na própria linha, porque é ali
 * que ela se conserta.
 */

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CornerDownRight,
  Flag,
  Layers,
  Plus,
  Trash2,
} from "lucide-react"
import type {
  FormBlock,
  FormEnding,
  FormSchema,
  LogicCondition,
  LogicRule,
} from "@/types/forms-conversational"
import type { QualifiedOperator } from "@/types/form-tracking"
import {
  contarProblemas,
  diagnosticarFluxo,
  opcoesDaPergunta,
  type ProblemaDoFluxo,
} from "@/lib/forms/diagnostico-fluxo"
import { DestinoEditor } from "./destino-editor"
import { MediaField } from "./media-field"
import type { MidiaDaTela } from "@/lib/forms/midia"
import { rotuloCurtoDoTipo } from "@/lib/forms/tipos-de-pergunta"
import {
  alvosDoFluxo,
  rotuloDaTela,
  sujeitosDaCondicao,
  telasDoFluxo,
  type AlvoDoFluxo,
  type SujeitoDaCondicao,
  type TelaDoFluxo,
} from "@/lib/forms/mapa-do-fluxo"

const PREFIXO_ENDING = "ending:"

const OPERADORES: Array<{ value: QualifiedOperator; label: string }> = [
  { value: "equals", label: "é igual a" },
  { value: "not_equals", label: "é diferente de" },
  { value: "in", label: "é uma destas" },
  { value: "not_in", label: "não é nenhuma destas" },
  { value: "contains", label: "contém" },
  { value: "gt", label: "é maior que" },
  { value: "gte", label: "é maior ou igual a" },
  { value: "lt", label: "é menor que" },
  { value: "lte", label: "é menor ou igual a" },
  { value: "is_set", label: "foi respondida" },
]

const MULTIPLOS: ReadonlySet<QualifiedOperator> = new Set(["in", "not_in"])
const NUMERICOS: ReadonlySet<QualifiedOperator> = new Set(["gt", "gte", "lt", "lte"])

/**
 * O título do aviso vermelho.
 *
 * "regra não funciona" é a frase que faz alguém agir, e ela vale quando
 * TODO erro é de regra. Uma tela que ninguém alcança não é uma regra:
 * chamá-la assim manda procurar no lugar errado.
 */
function tituloDosErros(problemas: readonly ProblemaDoFluxo[]): string {
  const erros = problemas.filter((p) => p.gravidade === "erro")
  const n = erros.length
  if (erros.every((p) => p.regra !== undefined)) {
    return `${n} ${n === 1 ? "regra não funciona" : "regras não funcionam"}`
  }
  return `${n} ${n === 1 ? "problema quebra o fluxo" : "problemas quebram o fluxo"}`
}

function tituloDoBloco(b: FormBlock, i: number): string {
  const t = (b.label ?? "").trim()
  return t || `Pergunta ${i + 1}`
}

/** Um `ref` curto e estável para um final novo, sem colidir com os que há. */
function refDeFinalNovo(existentes: readonly FormEnding[]): string {
  let n = existentes.length + 1
  const usados = new Set(existentes.map((e) => e.ref))
  while (usados.has(`final-${n}`)) n += 1
  return `final-${n}`
}

/**
 * O que o construtor mostra quando está dentro do inspetor da aba Criar
 * — um item por vez, o que está selecionado na espinha.
 *
 * É o MESMO componente, filtrado, e não uma segunda cópia dos painéis:
 * duas implementações do editor de desvio divergiriam na primeira
 * correção, e o sintoma seria uma regra que funciona num lugar e não no
 * outro. Sem `foco`, ele desenha o fluxo inteiro como sempre desenhou.
 */
export type FocoDoFluxo =
  | { tipo: "abertura" }
  | { tipo: "tela"; ref: string }
  | { tipo: "final"; ref: string }
  | { tipo: "comportamento" }

export function FlowEditor({
  fluxo,
  onChange,
  temAbertura,
  foco,
  formId,
}: {
  fluxo: FormSchema
  onChange: (f: FormSchema) => void
  /** Só o conversacional tem tela de abertura e barra de progresso. */
  temAbertura: boolean
  foco?: FocoDoFluxo
  /** O upload da mídia da abertura precisa dele. */
  formId?: string
}) {
  const problemas = useMemo(() => diagnosticarFluxo(fluxo), [fluxo])
  const contagem = contarProblemas(problemas)
  const blocos = fluxo.blocks ?? []
  const finais = fluxo.endings ?? []
  const telas = useMemo(() => telasDoFluxo(fluxo), [fluxo])
  const alvos = useMemo(() => alvosDoFluxo(fluxo), [fluxo])

  const set = (patch: Partial<FormSchema>) => onChange({ ...fluxo, ...patch })

  const trocarBloco = (ref: string, patch: Partial<FormBlock>) =>
    set({ blocks: blocos.map((b) => (b.ref === ref ? { ...b, ...patch } : b)) })

  /**
   * O destino padrão é gravado na CABEÇA e limpo dos demais blocos da
   * tela. A engine lê o primeiro que declarar (para reagrupar não apagar
   * a configuração em silêncio), então deixar dois declarados faria a
   * tela e o formulário discordarem assim que alguém mudasse a ordem.
   */
  const trocarProximoDaTela = (tela: TelaDoFluxo, goto: string | null) => {
    const refs = new Set(tela.blocos.map((b) => b.ref))
    set({
      blocks: blocos.map((b) => {
        if (!refs.has(b.ref)) return b
        const copia = { ...b }
        delete copia.proximo
        return b.ref === tela.cabeca && goto ? { ...copia, proximo: goto } : copia
      }),
    })
  }

  const trocarFinal = (ref: string, patch: Partial<FormEnding>) =>
    set({ endings: finais.map((e) => (e.ref === ref ? { ...e, ...patch } : e)) })

  // Com foco, o inspetor desenha SÓ o item escolhido: o cabeçalho de
  // seção, o diagnóstico e os vizinhos já estão na espinha e no topo da
  // aba, e repeti-los dentro de um painel de 320px seria a parede que
  // este redesenho existe para desfazer.
  if (foco) {
    if (foco.tipo === "abertura") {
      return temAbertura ? (
        <div className="space-y-4 p-3">
          <Abertura fluxo={fluxo} set={set} semCabecalho formId={formId} />
          <Comportamento fluxo={fluxo} set={set} semCabecalho />
        </div>
      ) : null
    }
    if (foco.tipo === "comportamento") {
      return (
        <div className="p-3">
          <Comportamento fluxo={fluxo} set={set} semCabecalho />
        </div>
      )
    }
    if (foco.tipo === "tela") {
      const tela = telas.find((t) => t.cabeca === foco.ref)
      if (!tela) return null
      return (
        <div className="p-3">
          <TelaNoFluxo
            tela={tela}
            alvos={alvos}
            sujeitos={sujeitosDaCondicao(fluxo, tela.cabeca)}
            problemas={problemas.filter((p) => tela.blocos.some((b) => b.ref === p.ref))}
            onChangeBloco={trocarBloco}
            onChangeProximo={(goto) => trocarProximoDaTela(tela, goto)}
            semMoldura
          />
        </div>
      )
    }
    const i = finais.findIndex((e) => e.ref === foco.ref)
    if (i < 0) return null
    return (
      <div className="p-3">
        <FinalDoFluxo
          fim={finais[i]}
          padrao={i === 0}
          orfao={problemas.some((p) => p.tipo === "final_orfao" && p.ref === foco.ref)}
          onChange={(patch) => trocarFinal(foco.ref, patch)}
          onRemove={() => set({ endings: finais.filter((e) => e.ref !== foco.ref) })}
          semMoldura
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      {problemas.length > 0 && (
        <div
          className={
            "rounded-[6px] border px-3 py-2.5 " +
            (contagem.erros > 0
              ? "border-red-300/70 bg-red-50 dark:border-red-400/25 dark:bg-red-400/[0.07]"
              : "border-amber-300/70 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.07]")
          }
        >
          <p
            className={
              "flex items-center gap-1.5 text-[12px] font-semibold " +
              (contagem.erros > 0
                ? "text-red-900 dark:text-red-200"
                : "text-amber-900 dark:text-amber-200")
            }
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {contagem.erros > 0 ? tituloDosErros(problemas) : null}
            {contagem.erros === 0 &&
              `${contagem.avisos} ${contagem.avisos === 1 ? "ponto a conferir" : "pontos a conferir"}`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {problemas.slice(0, 6).map((p, i) => (
              <li
                key={`${p.tipo}-${p.ref}-${i}`}
                className={
                  "text-[11.5px] leading-relaxed " +
                  (p.gravidade === "erro"
                    ? "text-red-800 dark:text-red-200/85"
                    : "text-amber-800 dark:text-amber-200/85")
                }
              >
                {p.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}

      {temAbertura && <Abertura fluxo={fluxo} set={set} formId={formId} />}

      <section>
        <Cabecalho
          titulo="Caminho das telas"
          apoio="Cada tela é um passo — perguntas agrupadas contam como uma. Sem desvio, segue para o destino padrão."
        />
        {telas.length === 0 ? (
          <Vazio
            titulo="Nenhuma pergunta ainda"
            apoio="Adicione perguntas na aba Perguntas — o fluxo é montado sobre elas."
          />
        ) : (
          <div className="mt-2 space-y-1.5">
            {telas.map((tela) => (
              <TelaNoFluxo
                key={tela.cabeca}
                tela={tela}
                alvos={alvos}
                sujeitos={sujeitosDaCondicao(fluxo, tela.cabeca)}
                problemas={problemas.filter((p) =>
                  tela.blocos.some((b) => b.ref === p.ref),
                )}
                onChangeBloco={trocarBloco}
                onChangeProximo={(goto) => trocarProximoDaTela(tela, goto)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <Cabecalho
          titulo="Telas finais"
          apoio="A primeira é o desfecho de quem chega ao fim. As outras só aparecem quando uma regra leva até elas."
        />
        <div className="mt-2 space-y-1.5">
          {finais.map((fim, i) => (
            <FinalDoFluxo
              key={fim.ref}
              fim={fim}
              padrao={i === 0}
              orfao={problemas.some((p) => p.tipo === "final_orfao" && p.ref === fim.ref)}
              onChange={(patch) => trocarFinal(fim.ref, patch)}
              onRemove={() => set({ endings: finais.filter((e) => e.ref !== fim.ref) })}
            />
          ))}
          {finais.length === 0 && (
            <Vazio
              titulo="Nenhuma tela final"
              apoio="Quem terminar vê a mensagem de sucesso configurada em Destino."
            />
          )}
          <button
            type="button"
            onClick={() =>
              set({
                endings: [
                  ...finais,
                  {
                    ref: refDeFinalNovo(finais),
                    title: finais.length === 0 ? "Recebemos sua resposta." : "Obrigado!",
                    description: null,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[5px] border border-black/[0.08] dark:border-white/[0.12] text-[11px] font-medium text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Plus className="h-3 w-3" />
            Adicionar tela final
          </button>
        </div>
      </section>

      {temAbertura && <Comportamento fluxo={fluxo} set={set} />}
    </div>
  )
}

// ───────────────────────────── seções ───────────────────────────────────

function Abertura({
  fluxo,
  set,
  semCabecalho,
  formId,
}: {
  fluxo: FormSchema
  set: (patch: Partial<FormSchema>) => void
  /** No inspetor o título já está na espinha e no topo do painel. */
  semCabecalho?: boolean
  /** Para o upload da mídia da abertura. */
  formId?: string
}) {
  const w = fluxo.settings?.welcome
  const ligar = (on: boolean) =>
    set({
      settings: {
        ...fluxo.settings,
        welcome: on
          ? { title: w?.title || "Vamos começar?", description: w?.description ?? null, button_label: w?.button_label }
          : undefined,
      },
    })
  const trocar = (patch: Partial<NonNullable<typeof w>>) =>
    set({ settings: { ...fluxo.settings, welcome: { ...(w ?? { title: "" }), ...patch } } })

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <Cabecalho
          titulo="Tela de abertura"
          apoio={
            semCabecalho
              ? undefined
              : "A primeira tela, antes da primeira pergunta. Sem ela, o formulário começa perguntando."
          }
        />
        <Chave ligada={Boolean(w)} onChange={ligar} rotulo="Tela de abertura" />
      </div>
      {w && (
        <div className="mt-2 space-y-2 rounded-[6px] border border-black/[0.07] dark:border-white/[0.10] p-2.5">
          <Campo rotulo="Título">
            <input
              type="text"
              value={w.title}
              onChange={(e) => trocar({ title: e.target.value })}
              className="crm-input w-full"
              placeholder="Vamos descobrir se faz sentido para você"
            />
          </Campo>
          <Campo rotulo="Texto de apoio">
            <textarea
              rows={2}
              value={w.description ?? ""}
              onChange={(e) => trocar({ description: e.target.value || null })}
              className="crm-input w-full"
              placeholder="Leva menos de 2 minutos."
            />
          </Campo>
          <Campo rotulo="Botão">
            <input
              type="text"
              value={w.button_label ?? ""}
              onChange={(e) => trocar({ button_label: e.target.value || undefined })}
              className="crm-input w-full"
              placeholder="Começar"
            />
          </Campo>
          {/*
            A abertura é a tela onde a imagem ou o vídeo mais pesa: é ali
            que a pessoa decide se continua. Sem este campo, a mídia da
            abertura existia no schema e não tinha por onde entrar.
          */}
          <MediaField
            formId={formId}
            valor={w.midia ?? null}
            onChange={(m: MidiaDaTela | null) => trocar({ midia: m })}
            rotulo="Imagem ou vídeo da abertura"
            ajuda="Entra acima do título. Vídeo curto do rosto de quem assina funciona melhor que imagem."
          />
        </div>
      )}
    </section>
  )
}

function Comportamento({
  fluxo,
  set,
  semCabecalho,
}: {
  fluxo: FormSchema
  set: (patch: Partial<FormSchema>) => void
  semCabecalho?: boolean
}) {
  const s = fluxo.settings ?? {}
  const trocar = (patch: Partial<typeof s>) => set({ settings: { ...s, ...patch } })
  return (
    <section>
      <Cabecalho
        titulo="Comportamento"
        apoio={semCabecalho ? undefined : "Como a pessoa anda pelas perguntas."}
      />
      <div className="mt-2 space-y-2 rounded-[6px] border border-black/[0.07] dark:border-white/[0.10] p-2.5">
        <LinhaDeChave
          rotulo="Barra de progresso"
          apoio="Mostra quanto falta. A estimativa muda com o caminho, mas a barra nunca volta."
          ligada={s.mostrar_progresso !== false}
          onChange={(v) => trocar({ mostrar_progresso: v })}
        />
        <LinhaDeChave
          rotulo="Enter avança"
          apoio="Em texto longo, Shift+Enter quebra linha."
          ligada={s.enter_avanca !== false}
          onChange={(v) => trocar({ enter_avanca: v })}
        />
        <Campo rotulo="Texto do botão de avançar">
          <input
            type="text"
            value={s.rotulo_avancar ?? ""}
            onChange={(e) => trocar({ rotulo_avancar: e.target.value || undefined })}
            className="crm-input w-full"
            placeholder="OK"
          />
        </Campo>
      </div>
    </section>
  )
}

// ───────────────────────────── tela ─────────────────────────────────────


function TelaNoFluxo({
  tela,
  alvos,
  sujeitos,
  problemas,
  onChangeBloco,
  onChangeProximo,
  semMoldura,
}: {
  tela: TelaDoFluxo
  alvos: AlvoDoFluxo[]
  sujeitos: SujeitoDaCondicao[]
  problemas: ProblemaDoFluxo[]
  onChangeBloco: (ref: string, patch: Partial<FormBlock>) => void
  onChangeProximo: (goto: string | null) => void
  /** No inspetor não há acordeão: a tela já foi escolhida na espinha. */
  semMoldura?: boolean
}) {
  // Tela que AGRUPA nasce aberta: é exatamente nela que as perguntas de
  // dentro somem da vista, que era a queixa. Tela de pergunta única já
  // tem o rótulo dela no cabeçalho — abrir todas viraria uma parede.
  const [aberto, setAberto] = useState(
    tela.regras.length > 0 || Boolean(tela.proximoDeclarado) || tela.blocos.length > 1,
  )
  const temErro = problemas.some((p) => p.gravidade === "erro")
  const juntas = tela.blocos.length > 1
  const visivel = semMoldura || aberto

  const adicionarDesvio = (ref: string) => {
    const bloco = tela.blocos.find((b) => b.ref === ref)
    if (!bloco) return
    const opcoes = opcoesDaPergunta(bloco)
    const cond: LogicCondition = opcoes
      ? { ref, operator: "in", value: [opcoes[0]] }
      : { ref, operator: "is_set", value: null }
    const finalOutro = alvos.find((a) => a.tipo === "final" && a.ref)
    onChangeBloco(ref, {
      logic: [
        ...(bloco.logic ?? []),
        { conditions: [cond], logic: "and", goto: finalOutro?.goto ?? PREFIXO_ENDING },
      ],
    })
    setAberto(true)
  }

  return (
    <div
      className={
        semMoldura
          ? ""
          : "rounded-[6px] border bg-white dark:bg-white/[0.02] " +
            (temErro
              ? "border-red-300 dark:border-red-400/35"
              : "border-slate-200 dark:border-white/[0.10]")
      }
    >
      {!semMoldura && (
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] bg-slate-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums text-slate-600 dark:bg-white/[0.07] dark:text-white/65">
          {juntas && <Layers className="h-2.5 w-2.5" />}
          Tela {tela.numero}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-900 dark:text-white">
          {tela.titulo ?? rotuloDaTela(tela)}
        </span>
        {juntas && (
          <span className="shrink-0 text-[10.5px] text-slate-500 dark:text-white/45">
            {tela.blocos.length} perguntas juntas
          </span>
        )}
        {tela.regras.length > 0 && (
          <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
            {tela.regras.length} {tela.regras.length === 1 ? "desvio" : "desvios"}
          </span>
        )}
        <ChevronDown
          className={
            "h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40 transition-transform " +
            (aberto ? "rotate-180" : "")
          }
        />
      </button>
      )}

      {!visivel && (
        <p className="flex items-center gap-1.5 px-2.5 pb-2 text-[11px] text-slate-500 dark:text-white/45">
          <CornerDownRight className="h-3 w-3 shrink-0" />
          {tela.regras.length > 0 ? "Sem desvio, vai para" : "Vai para"}{" "}
          <RotuloDoAlvo alvo={tela.destino} />
          {/*
            "Em ordem" e "configurado para a tela seguinte" parecem iguais
            e não são: inserir uma pergunta no meio muda o primeiro e não
            muda o segundo.
          */}
          {tela.proximoDeclarado && (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[9.5px] font-medium uppercase tracking-wide text-slate-500 dark:bg-white/[0.07] dark:text-white/50">
              fixo
            </span>
          )}
        </p>
      )}

      {visivel && (
        <div
          className={
            semMoldura
              ? "space-y-2.5"
              : "space-y-2.5 border-t border-slate-100 px-2.5 pb-2.5 pt-2.5 dark:border-white/[0.06]"
          }
        >
          {/*
            As perguntas DENTRO da tela, listadas.
            Sem esta lista, uma tela de quatro campos aparece como uma
            linha só e as outras três somem do fluxo — o operador conta
            os passos certo e as perguntas errado.
          */}
          <div className="space-y-1">
            {tela.blocos.map((b, i) => (
              <div
                key={b.ref}
                className="flex items-center gap-2 rounded-[5px] bg-slate-50/80 px-2 py-1.5 dark:bg-white/[0.03]"
              >
                <span className="w-3.5 shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-white/35">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-700 dark:text-white/75">
                  {tituloDoBloco(b, i)}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400 dark:text-white/35">
                  {rotuloCurtoDoTipo(b.type)}
                </span>
                <button
                  type="button"
                  onClick={() => adicionarDesvio(b.ref)}
                  className="shrink-0 text-[10.5px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  + desvio
                </button>
              </div>
            ))}
          </div>

          {tela.regras.map((r) => (
            <Regra
              key={`${r.ref}-${r.indice}`}
              regra={r.regra}
              indice={r.indice}
              deQuemParte={juntas ? r.deQuemParte : null}
              alvos={alvos}
              sujeitos={sujeitos}
              padraoRef={r.ref}
              problemas={problemas.filter((p) => p.ref === r.ref && p.regra === r.indice)}
              onChange={(nova) =>
                onChangeBloco(r.ref, {
                  logic: (tela.blocos.find((b) => b.ref === r.ref)?.logic ?? []).map((x, j) =>
                    j === r.indice ? nova : x,
                  ),
                })
              }
              onRemove={() =>
                onChangeBloco(r.ref, {
                  logic: (tela.blocos.find((b) => b.ref === r.ref)?.logic ?? []).filter(
                    (_, j) => j !== r.indice,
                  ),
                })
              }
            />
          ))}

          {/*
            O destino padrão deixou de ser uma frase.
            "Segue para a próxima" era leitura, não configuração: quem
            quisesse pular uma tela tinha de inventar um desvio com uma
            condição que sempre casa.
          */}
          <div className="flex items-center gap-1.5 rounded-[5px] border border-dashed border-slate-300 px-2 py-1.5 dark:border-white/[0.12]">
            <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
            <span className="shrink-0 text-[11px] text-slate-500 dark:text-white/50">
              {tela.regras.length > 0 ? "Sem desvio, vai para" : "Depois desta tela"}
            </span>
            <select
              value={tela.proximoDeclarado ?? ""}
              onChange={(e) => onChangeProximo(e.target.value || null)}
              className="crm-input min-w-0 flex-1 text-[11px]"
            >
              <option value="">
                Em ordem — {rotuloCurto(tela.destino)}
              </option>
              <SelectDeAlvos alvos={alvos} />
            </select>
          </div>

          {problemas
            .filter((p) => p.regra === undefined)
            .map((p, i) => (
              <p
                key={i}
                className={
                  "text-[11px] leading-relaxed " +
                  (p.gravidade === "erro"
                    ? "text-red-700 dark:text-red-300"
                    : "text-amber-700 dark:text-amber-300")
                }
              >
                {p.mensagem}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

/** O destino como uma frase curta: "Tela 4 · Faturamento" ou o final. */
function rotuloCurto(alvo: AlvoDoFluxo): string {
  if (alvo.tipo === "tela") return `Tela ${alvo.numero}`
  if (alvo.tipo === "final") return alvo.rotulo
  return "destino removido"
}

function RotuloDoAlvo({ alvo }: { alvo: AlvoDoFluxo }) {
  return (
    <strong
      className={
        "font-medium " +
        (alvo.tipo === "perdido"
          ? "text-red-600 dark:text-red-400"
          : "text-slate-700 dark:text-white/75")
      }
    >
      {alvo.tipo === "tela" ? `Tela ${alvo.numero} · ${alvo.rotulo}` : alvo.rotulo}
    </strong>
  )
}

/**
 * As opções de destino, agrupadas.
 *
 * A tela e o final são coisas diferentes para quem monta — uma continua
 * o formulário, a outra o termina — e misturá-las numa lista só faz
 * alguém escolher "Obrigado!" achando que é mais uma pergunta.
 */
function SelectDeAlvos({ alvos }: { alvos: AlvoDoFluxo[] }) {
  const telas = alvos.filter((a) => a.tipo === "tela")
  const finais = alvos.filter((a) => a.tipo === "final")
  return (
    <>
      <optgroup label="Ir para a tela">
        {telas.map((a) => (
          <option key={a.goto} value={a.goto}>
            {a.tipo === "tela" ? `${a.numero}. ${a.rotulo}` : a.rotulo}
          </option>
        ))}
      </optgroup>
      <optgroup label="Terminar">
        {finais.map((a) => (
          <option key={a.goto} value={a.goto}>
            {a.rotulo}
          </option>
        ))}
      </optgroup>
    </>
  )
}

function Regra({
  regra,
  indice,
  deQuemParte,
  alvos,
  sujeitos,
  padraoRef,
  problemas,
  onChange,
  onRemove,
}: {
  regra: LogicRule
  indice: number
  /** Numa tela com várias perguntas, de qual delas este desvio parte. */
  deQuemParte: string | null
  alvos: AlvoDoFluxo[]
  sujeitos: SujeitoDaCondicao[]
  padraoRef: string
  problemas: ProblemaDoFluxo[]
  onChange: (r: LogicRule) => void
  onRemove: () => void
}) {
  const conds = regra.conditions ?? []
  const temErro = problemas.some((p) => p.gravidade === "erro")
  const destinoPerdido = !alvos.some((a) => a.goto === regra.goto)

  const trocarCond = (i: number, patch: Partial<LogicCondition>) =>
    onChange({ ...regra, conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <div
      className={
        "rounded-[6px] border px-2 py-2 " +
        (temErro
          ? "border-red-300 bg-red-50/60 dark:border-red-400/30 dark:bg-red-400/[0.05]"
          : "border-slate-200 bg-slate-50/60 dark:border-white/[0.08] dark:bg-white/[0.02]")
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
          Desvio {indice + 1}
          {/*
            Numa tela de quatro campos, "Desvio 1" sozinho não diz de onde
            ele parte — e a engine numera por PERGUNTA, então duas telas
            podem ter dois "Desvio 1".
          */}
          {deQuemParte && (
            <span className="normal-case tracking-normal text-slate-400 dark:text-white/35">
              {" "}
              em {deQuemParte}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-400 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
          aria-label={`Remover desvio ${indice + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        {conds.map((cond, i) => (
          <Condicao
            key={i}
            cond={cond}
            primeira={i === 0}
            juncao={regra.logic}
            onJuncao={(l) => onChange({ ...regra, logic: l })}
            sujeitos={sujeitos}
            padraoRef={padraoRef}
            onChange={(patch) => trocarCond(i, patch)}
            onRemove={
              conds.length > 1
                ? () => onChange({ ...regra, conditions: conds.filter((_, j) => j !== i) })
                : undefined
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...regra,
              conditions: [...conds, { ref: padraoRef, operator: "is_set", value: null }],
            })
          }
          className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          + condição
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 border-t border-black/[0.06] pt-2 dark:border-white/[0.07]">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
        <span className="shrink-0 text-[11px] text-slate-500 dark:text-white/50">vai para</span>
        <select
          value={regra.goto}
          onChange={(e) => onChange({ ...regra, goto: e.target.value })}
          className="crm-input min-w-0 flex-1 text-[11px]"
        >
          {/*
            Destino apagado precisa de uma opção para o `select` pousar.
            Sem ela o campo fica EM BRANCO e some da tela o fato de que a
            regra aponta para algum lugar — o erro em vermelho embaixo
            passa a falar de um destino que não se vê.
          */}
          {destinoPerdido && (
            <option value={regra.goto}>Destino removido — escolha outro</option>
          )}
          <SelectDeAlvos alvos={alvos} />
        </select>
      </div>

      {problemas.map((p, i) => (
        <p
          key={i}
          className={
            "mt-1.5 text-[11px] leading-relaxed " +
            (p.gravidade === "erro"
              ? "text-red-700 dark:text-red-300"
              : "text-amber-700 dark:text-amber-300")
          }
        >
          {p.mensagem}
        </p>
      ))}
    </div>
  )
}

function Condicao({
  cond,
  primeira,
  juncao,
  onJuncao,
  sujeitos,
  padraoRef,
  onChange,
  onRemove,
}: {
  cond: LogicCondition
  primeira: boolean
  juncao: "and" | "or"
  onJuncao: (l: "and" | "or") => void
  sujeitos: SujeitoDaCondicao[]
  padraoRef: string
  onChange: (patch: Partial<LogicCondition>) => void
  onRemove?: () => void
}) {
  const sujeito = sujeitos.find((s) => s.ref === cond.ref)
  const alvo = sujeito?.bloco
  const opcoes = opcoesDaPergunta(alvo)
  // Valor calculado só aceita aritmética. Oferecer "é uma destas" ali
  // deixaria montar, com dois cliques, a condição que nunca casa.
  const soNumero = Boolean(sujeito?.numerico)
  const multiplos = MULTIPLOS.has(cond.operator)
  const chipsDeOpcao =
    Boolean(opcoes) &&
    multiplos &&
    cond.operator !== "is_set" &&
    !NUMERICOS.has(cond.operator) &&
    !soNumero
  const selecionados = Array.isArray(cond.value)
    ? cond.value.map(String)
    : cond.value == null || cond.value === ""
      ? []
      : [String(cond.value)]

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {primeira ? (
          <span className="w-9 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
            Se
          </span>
        ) : (
          <select
            value={juncao}
            onChange={(e) => onJuncao(e.target.value === "or" ? "or" : "and")}
            className="w-9 shrink-0 rounded-[4px] border-0 bg-transparent px-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 outline-none focus:ring-0 dark:text-white/45"
            aria-label="Como as condições se combinam"
          >
            <option value="and">E</option>
            <option value="or">OU</option>
          </select>
        )}
        <select
          value={cond.ref}
          onChange={(e) => {
            const ref = e.target.value || padraoRef
            const novo = sujeitos.find((s) => s.ref === ref)
            // Trocar para um valor calculado com "é uma destas" no lugar
            // deixaria a condição impossível de casar, sem nada em tela.
            const op = novo?.numerico && !NUMERICOS.has(cond.operator) ? "gte" : cond.operator
            onChange({ ref, operator: op, value: null })
          }}
          className="crm-input min-w-0 flex-1 text-[11px]"
        >
          {/*
            Sujeito que não está na lista precisa de uma opção para o
            `select` pousar. Sem ela o campo fica EM BRANCO — foi assim
            que a condição do corte do funil apareceu apontando para o
            vazio, e quem fosse "consertar" escolhendo outra pergunta
            desligaria o corte.
          */}
          {!sujeito && (
            <option value={cond.ref}>Resposta removida — escolha outra</option>
          )}
          <GrupoDeSujeitos sujeitos={sujeitos} grupo="desta_tela" rotulo="Respondida nesta tela" />
          <GrupoDeSujeitos sujeitos={sujeitos} grupo="anteriores" rotulo="Já respondida antes" />
          <GrupoDeSujeitos sujeitos={sujeitos} grupo="calculado" rotulo="Valor calculado" />
          <GrupoDeSujeitos sujeitos={sujeitos} grupo="oculto" rotulo="Campo oculto (vem da URL)" />
          <GrupoDeSujeitos
            sujeitos={sujeitos}
            grupo="posteriores"
            rotulo="Ainda sem resposta aqui"
          />
        </select>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-slate-400 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
            aria-label="Remover condição"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex items-start gap-1.5 pl-[42px]">
        <select
          value={cond.operator}
          data-operador
          onChange={(e) => {
            const op = e.target.value as QualifiedOperator
            // Trocar de "é uma destas" para "é igual a" deixaria uma lista
            // onde cabe um valor só — e a condição pararia de casar sem
            // nada em tela dizendo por quê.
            const valor = MULTIPLOS.has(op)
              ? selecionados
              : (selecionados[0] ?? null)
            onChange({ operator: op, value: op === "is_set" ? null : valor })
          }}
          className={
            "crm-input text-[11px] " + (chipsDeOpcao ? "w-full" : "w-[132px] shrink-0")
          }
        >
          {OPERADORES.filter((o) => !soNumero || NUMERICOS.has(o.value)).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {cond.operator !== "is_set" && !chipsDeOpcao && (
          <div className="min-w-0 flex-1">
            {opcoes && !NUMERICOS.has(cond.operator) && !soNumero ? (
              <select
                value={selecionados[0] ?? ""}
                onChange={(e) => onChange({ value: e.target.value })}
                className="crm-input w-full text-[11px]"
              >
                <option value="">Escolha uma resposta…</option>
                {opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={NUMERICOS.has(cond.operator) || soNumero ? "number" : "text"}
                value={selecionados[0] ?? ""}
                onChange={(e) => onChange({ value: e.target.value })}
                className="crm-input w-full text-[11px]"
                placeholder={NUMERICOS.has(cond.operator) || soNumero ? "0" : "valor"}
              />
            )}
          </div>
        )}
      </div>

      {/*
        As respostas ficam numa linha PRÓPRIA, e não ao lado do operador.
        Espremidas na coluna que sobra, opções longas ("R$100.000 -
        R$199.000") saem uma por linha e a condição vira uma escada de
        seis degraus; na largura toda elas emparelham e dá para ler quais
        estão marcadas de um golpe de vista.
      */}
      {chipsDeOpcao && (
        <div className="flex flex-wrap gap-1 pl-[42px]">
          {opcoes!.map((o) => {
            const ativo = selecionados.includes(o)
            return (
              <button
                key={o}
                type="button"
                aria-pressed={ativo}
                onClick={() =>
                  onChange({
                    value: ativo ? selecionados.filter((x) => x !== o) : [...selecionados, o],
                  })
                }
                className={
                  "max-w-full truncate rounded-full border px-2 py-[3px] text-[10.5px] font-medium transition-colors " +
                  (ativo
                    ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900"
                    : "border-black/[0.10] text-slate-600 hover:border-black/25 dark:border-white/[0.14] dark:text-white/65 dark:hover:border-white/30")
                }
              >
                {o}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Um grupo do `select` de "SE …", omitido quando está vazio. */
function GrupoDeSujeitos({
  sujeitos,
  grupo,
  rotulo,
}: {
  sujeitos: SujeitoDaCondicao[]
  grupo: SujeitoDaCondicao["grupo"]
  rotulo: string
}) {
  const lista = sujeitos.filter((s) => s.grupo === grupo)
  if (lista.length === 0) return null
  return (
    <optgroup label={rotulo}>
      {lista.map((s) => (
        <option key={s.ref} value={s.ref}>
          {s.rotulo}
        </option>
      ))}
    </optgroup>
  )
}

// ───────────────────────────── finais ───────────────────────────────────

function FinalDoFluxo({
  fim,
  padrao,
  orfao,
  semMoldura,
  onChange,
  onRemove,
}: {
  fim: FormEnding
  padrao: boolean
  orfao: boolean
  /** No inspetor não há acordeão: o item já foi escolhido na espinha. */
  semMoldura?: boolean
  onChange: (patch: Partial<FormEnding>) => void
  onRemove: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const visivel = semMoldura || aberto
  return (
    <div
      className={
        semMoldura
          ? ""
          : "rounded-[6px] border border-slate-200 bg-white dark:border-white/[0.10] dark:bg-white/[0.02]"
      }
    >
      {!semMoldura && (
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <Flag className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-900 dark:text-white">
          {fim.title || fim.ref}
        </span>
        {padrao && (
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.07] dark:text-white/65">
            padrão
          </span>
        )}
        {fim.disqualified && (
          <span className="shrink-0 rounded-full bg-slate-900/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-white/[0.10] dark:text-white/70">
            desqualifica
          </span>
        )}
        {orfao && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
        <ChevronDown
          className={
            "h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40 transition-transform " +
            (aberto ? "rotate-180" : "")
          }
        />
      </button>
      )}

      {visivel && (
        <div
          className={
            semMoldura
              ? "space-y-2"
              : "space-y-2 border-t border-slate-100 px-2.5 pb-2.5 pt-2.5 dark:border-white/[0.06]"
          }
        >
          <Campo rotulo="Título">
            <input
              type="text"
              value={fim.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="crm-input w-full"
            />
          </Campo>
          <Campo rotulo="Texto de apoio" apoio="Aceita {{pergunta}} para repetir uma resposta.">
            <textarea
              rows={2}
              value={fim.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value || null })}
              className="crm-input w-full"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-1.5">
            <Campo rotulo="Botão (texto)">
              <input
                type="text"
                value={fim.button_label ?? ""}
                onChange={(e) => onChange({ button_label: e.target.value || null })}
                className="crm-input w-full"
                placeholder="Agendar conversa"
              />
            </Campo>
            <Campo rotulo="Botão (link)">
              <input
                type="url"
                value={fim.button_url ?? ""}
                onChange={(e) => onChange({ button_url: e.target.value || null })}
                className="crm-input w-full"
                placeholder="https://"
              />
            </Campo>
          </div>
          <DestinoEditor destino={fim.destino ?? null} onChange={(d) => onChange({ destino: d })} />
          {!fim.destino && (
            <Campo rotulo="Redirecionar" apoio="Em vez de mostrar a tela, leva para este endereço.">
              <input
                type="url"
                value={fim.redirect_url ?? ""}
                onChange={(e) => onChange({ redirect_url: e.target.value || null })}
                className="crm-input w-full"
                placeholder="https://"
              />
            </Campo>
          )}
          <LinhaDeChave
            rotulo="Marca como fora do perfil"
            apoio="Some o ✓ de sucesso e o negócio entra no CRM marcado — não conta como abandono."
            ligada={Boolean(fim.disqualified)}
            onChange={(v) => onChange({ disqualified: v })}
          />
          {!padrao && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline dark:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
              Remover esta tela
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── átomos ───────────────────────────────────

function Cabecalho({ titulo, apoio }: { titulo: string; apoio?: string }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-slate-900 dark:text-white">{titulo}</h3>
      {apoio && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-white/45">{apoio}</p>
      )}
    </div>
  )
}

function Campo({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string
  apoio?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-white/60">
        {rotulo}
      </span>
      {children}
      {apoio && (
        <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-500 dark:text-white/45">
          {apoio}
        </span>
      )}
    </label>
  )
}

function Vazio({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <div className="mt-2 rounded-[6px] border border-dashed border-slate-300 px-3 py-5 text-center dark:border-white/[0.12]">
      <p className="text-[12px] font-medium text-slate-700 dark:text-white/75">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45">{apoio}</p>
    </div>
  )
}

function Chave({
  ligada,
  onChange,
  rotulo,
}: {
  ligada: boolean
  onChange: (v: boolean) => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      onClick={() => onChange(!ligada)}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
        (ligada ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-300 dark:bg-white/[0.18]")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
          (ligada ? "translate-x-[18px]" : "translate-x-0.5")
        }
      />
    </button>
  )
}

function LinhaDeChave({
  rotulo,
  apoio,
  ligada,
  onChange,
}: {
  rotulo: string
  apoio?: string
  ligada: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-slate-800 dark:text-white/85">{rotulo}</p>
        {apoio && (
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500 dark:text-white/45">
            {apoio}
          </p>
        )}
      </div>
      <Chave ligada={ligada} onChange={onChange} rotulo={rotulo} />
    </div>
  )
}
