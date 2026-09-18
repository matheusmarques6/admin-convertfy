"use client"

/**
 * A coluna da esquerda: a espinha do formulário.
 *
 * É a lista do que o visitante percorre, na ordem em que ele percorre —
 * abertura, telas com as perguntas dentro, finais. Clicar seleciona, e a
 * seleção manda nas outras duas colunas: a prévia pousa naquela tela e o
 * painel da direita mostra as propriedades daquele item.
 *
 * O que ela lista vem de `montarEspinha`, que deriva do FORMATO. É por
 * isso que não existe aqui um `if (conversacional)` decidindo esconder
 * campo: o formato de página única simplesmente não tem telas nem
 * finais, e o conversacional não tem cabeçalho nem botão de envio.
 */

import { useState } from "react"
import type { FormBlockType } from "@/types/forms-conversational"
import { SeletorDeTipos } from "./seletor-de-tipos"
import { TipoIcone } from "./tipo-icone"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CornerDownRight,
  Flag,
  GripVertical,
  Info,
  MessageCircle,
  Play,
  Plus,
  Send,
  Type as TypeIcon,
} from "lucide-react"
import {
  ehSelecaoIgual,
  rotuloDoTipo,
  type Espinha,
  type ModoDoFormulario,
  type PerguntaNaEspinha,
  type Selecao,
} from "@/lib/forms/estrutura-do-editor"

/** Onde uma pergunta arrastada pode cair. */
export type AlvoDoArrasto =
  | { tipo: "pergunta"; ref: string }
  | { tipo: "faixa"; antesDe: string | null }

export function EditorEstrutura({
  espinha,
  selecao,
  modo,
  problemas,
  onSelecionar,
  onAdicionarPergunta,
  onAdicionarFinal,
  onArrastar,
}: {
  espinha: Espinha
  selecao: Selecao
  modo: ModoDoFormulario
  /** Quantos erros o fluxo tem — acende o aviso na seção dos finais. */
  problemas: number
  onSelecionar: (s: Selecao) => void
  /** Recebe o TIPO escolhido no seletor. */
  onAdicionarPergunta: (tipo: FormBlockType) => void
  onAdicionarFinal: () => void
  onArrastar: (ref: string, alvo: AlvoDoArrasto) => void
}) {
  const [arrastado, setArrastado] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const limpar = () => {
    setArrastado(null)
    setAlvo(null)
  }
  const conversa = modo === "conversational"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 px-3 py-2 dark:border-white/[0.07]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
          {conversa ? "Telas" : "Perguntas"}
        </span>
        <SeletorDeTipos modo={modo} onEscolher={onAdicionarPergunta}>
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-[#1F1F1F] px-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#333] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-white dark:text-black dark:hover:bg-white/85"
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </button>
        </SeletorDeTipos>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {espinha.abre && (
          <ItemSolto
            icone={espinha.abre.tipo === "abertura" ? Play : TypeIcon}
            rotulo={espinha.abre.rotulo}
            apoio={
              espinha.abre.tipo === "abertura"
                ? espinha.abre.preenchido
                  ? "Ligada"
                  : "Desligada — começa na 1ª pergunta"
                : "Título, subtítulo e badge da página"
            }
            ativo={ehSelecaoIgual(selecao, { tipo: espinha.abre.tipo })}
            onClick={() => onSelecionar({ tipo: espinha.abre!.tipo })}
          />
        )}

        {espinha.telas.length === 0 ? (
          <div className="mt-2 rounded-[6px] border border-dashed border-slate-300 px-3 py-6 text-center dark:border-white/[0.12]">
            <p className="text-[12px] font-medium text-slate-700 dark:text-white/75">
              Nenhuma pergunta ainda
            </p>
            <p className="mx-auto mt-1 max-w-[30ch] text-[11px] leading-relaxed text-slate-500 dark:text-white/45">
              Comece por uma: nome e contato costumam vir primeiro.
            </p>
            <SeletorDeTipos modo={modo} onEscolher={onAdicionarPergunta} align="center">
              <button
                type="button"
                className="mt-3 inline-flex h-7 items-center gap-1 rounded-[5px] bg-[#1F1F1F] px-2.5 text-[11px] font-semibold text-white dark:bg-white dark:text-black"
              >
                <Plus className="h-3 w-3" />
                Primeira pergunta
              </button>
            </SeletorDeTipos>
          </div>
        ) : (
          <div className="mt-1">
            {espinha.telas.map((tela, i) => (
              <div key={tela.ref}>
                {conversa && (
                  <FaixaDeSolta
                    ativa={alvo === `faixa:${tela.ref}`}
                    visivel={Boolean(arrastado)}
                    onEntrar={() => setAlvo(`faixa:${tela.ref}`)}
                    onSair={() => setAlvo(null)}
                    onSoltar={() => {
                      if (arrastado) onArrastar(arrastado, { tipo: "faixa", antesDe: tela.ref })
                      limpar()
                    }}
                  />
                )}
                {/*
                  A linha da TELA só existe quando ela agrupa alguma
                  coisa — várias perguntas ou um título próprio.
                  Numa tela de pergunta única a pergunta É a tela, e uma
                  linha "Tela" por cima de cada uma delas seria uma
                  segunda lista falando da primeira.
                */}
                {conversa && agrupada(tela) && (
                  <button
                    type="button"
                    onClick={() => onSelecionar({ tipo: "tela", ref: tela.ref })}
                    className={
                      "mt-1 flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-left transition-colors " +
                      (ehSelecaoIgual(selecao, { tipo: "tela", ref: tela.ref })
                        ? "bg-blue-600/[0.10] dark:bg-blue-400/[0.14]"
                        : "hover:bg-slate-100 dark:hover:bg-white/[0.04]")
                    }
                  >
                    <NumeroDaTela n={tela.numero} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-600 dark:text-white/60">
                      {tela.titulo || `${tela.perguntas.length} perguntas juntas`}
                    </span>
                    {tela.desvios > 0 && <ChipDeDesvio n={tela.desvios} />}
                  </button>
                )}
                <div
                  className={
                    conversa && agrupada(tela)
                      ? "ml-2 border-l border-slate-200 pl-2 dark:border-white/[0.08]"
                      : ""
                  }
                >
                  {tela.perguntas.map((p) => (
                    <LinhaDePergunta
                      key={p.ref}
                      pergunta={p}
                      numero={conversa && !agrupada(tela) ? tela.numero : null}
                      desvios={conversa && !agrupada(tela) ? tela.desvios : 0}
                      onAbrirTela={() => onSelecionar({ tipo: "tela", ref: tela.ref })}
                      ativa={ehSelecaoIgual(selecao, { tipo: "pergunta", ref: p.ref })}
                      alvo={alvo === `pergunta:${p.ref}`}
                      arrastando={Boolean(arrastado) && arrastado !== p.ref}
                      onClick={() => onSelecionar({ tipo: "pergunta", ref: p.ref })}
                      onArrastarInicio={() => setArrastado(p.ref)}
                      onArrastarFim={limpar}
                      onEntrar={() => setAlvo(`pergunta:${p.ref}`)}
                      onSair={() => setAlvo(null)}
                      onSoltar={() => {
                        if (arrastado) onArrastar(arrastado, { tipo: "pergunta", ref: p.ref })
                        limpar()
                      }}
                    />
                  ))}
                </div>
                {conversa && i === espinha.telas.length - 1 && (
                  <FaixaDeSolta
                    ativa={alvo === "faixa:fim"}
                    visivel={Boolean(arrastado)}
                    onEntrar={() => setAlvo("faixa:fim")}
                    onSair={() => setAlvo(null)}
                    onSoltar={() => {
                      if (arrastado) onArrastar(arrastado, { tipo: "faixa", antesDe: null })
                      limpar()
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {espinha.fecha && (
          <div className="mt-2">
            <ItemSolto
              icone={Send}
              rotulo={espinha.fecha.rotulo}
              apoio="O que acontece depois do envio"
              ativo={ehSelecaoIgual(selecao, { tipo: "envio" })}
              onClick={() => onSelecionar({ tipo: "envio" })}
            />
          </div>
        )}

        {conversa && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
                Finais
                {problemas > 0 && (
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
                )}
              </span>
              <button
                type="button"
                onClick={onAdicionarFinal}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
              >
                <Plus className="h-3 w-3" />
                Final
              </button>
            </div>
            {/*
              Sem nenhum final, a prévia ainda mostra um desfecho — o
              fallback da mensagem de sucesso. Uma lista muda ao lado de
              uma prévia que mostra algo faz o operador procurar onde
              editar aquilo que ele está vendo.
            */}
            {espinha.finais.length === 0 && (
              <p className="px-2 pb-1 text-[11px] leading-relaxed text-slate-500 dark:text-white/50">
                Sem tela final, quem terminar vê a mensagem de sucesso — ela fica em Configurar.
              </p>
            )}
            {espinha.finais.map((f) => {
              const ativo = ehSelecaoIgual(selecao, { tipo: "final", ref: f.ref })
              return (
                <button
                  key={f.ref}
                  type="button"
                  onClick={() => onSelecionar({ tipo: "final", ref: f.ref })}
                  className={
                    "flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition-colors " +
                    (ativo
                      ? "bg-blue-600/[0.10] dark:bg-blue-400/[0.14]"
                      : "hover:bg-slate-100 dark:hover:bg-white/[0.04]")
                  }
                >
                  {f.desqualifica ? (
                    <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
                  ) : (
                    <Flag className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-white/55" />
                  )}
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[12px] " +
                      (ativo
                        ? "font-semibold text-slate-900 dark:text-white"
                        : "font-medium text-slate-700 dark:text-white/75")
                    }
                  >
                    {f.titulo}
                  </span>
                  {f.temDestino && (
                    <MessageCircle
                      className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-label="leva a um destino"
                    />
                  )}
                  {f.padrao && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[9.5px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-white/60">
                      padrão
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200/70 px-3 py-1.5 text-[10px] text-slate-400 dark:border-white/[0.07] dark:text-white/35">
        Arraste para reordenar · ⌘D duplica
      </div>
    </div>
  )
}

/** Tela que agrupa: mais de uma pergunta, ou um título só dela. */
function agrupada(tela: { titulo: string; perguntas: unknown[] }): boolean {
  return tela.perguntas.length > 1 || Boolean(tela.titulo)
}

function NumeroDaTela({ n }: { n: number }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9.5px] font-bold tabular-nums text-slate-700 dark:bg-white/[0.14] dark:text-white/80">
      {n}
    </span>
  )
}

function ChipDeDesvio({ n }: { n: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
      title={n === 1 ? "1 desvio parte desta tela" : `${n} desvios partem desta tela`}
    >
      <CornerDownRight className="h-2.5 w-2.5" />
      {n}
    </span>
  )
}

function LinhaDePergunta({
  pergunta,
  numero,
  desvios,
  onAbrirTela,
  ativa,
  alvo,
  arrastando,
  onClick,
  onArrastarInicio,
  onArrastarFim,
  onEntrar,
  onSair,
  onSoltar,
}: {
  pergunta: PerguntaNaEspinha
  /** O número da tela, quando ela não tem cabeçalho próprio. */
  numero: number | null
  desvios: number
  onAbrirTela: () => void
  ativa: boolean
  alvo: boolean
  arrastando: boolean
  onClick: () => void
  onArrastarInicio: () => void
  onArrastarFim: () => void
  onEntrar: () => void
  onSair: () => void
  onSoltar: () => void
}) {
  /**
   * `draggable` só liga enquanto a ALÇA está pressionada — a mesma regra
   * da lista antiga. Sempre ligado, arrastar a partir do rótulo moveria
   * a pergunta em vez de deixar o clique selecionar.
   */
  const [pelaAlca, setPelaAlca] = useState(false)
  return (
    <div
      draggable={pelaAlca}
      onDragStart={(e) => {
        // `setData` é obrigatório no Firefox: sem ele o arrasto nem começa.
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", pergunta.ref)
        onArrastarInicio()
      }}
      onDragEnd={() => {
        setPelaAlca(false)
        onArrastarFim()
      }}
      onDragOver={(e) => {
        if (!arrastando) return
        e.preventDefault()
        onEntrar()
      }}
      onDragLeave={onSair}
      onDrop={(e) => {
        e.preventDefault()
        onSoltar()
      }}
      className={
        "group flex items-center gap-1.5 rounded-[5px] pr-2 transition-colors " +
        (alvo
          ? "bg-blue-600/[0.16] dark:bg-blue-400/20"
          : ativa
            ? "bg-blue-600/[0.10] dark:bg-blue-400/[0.14]"
            : "hover:bg-slate-100 dark:hover:bg-white/[0.04]")
      }
    >
      <span
        onMouseDown={() => setPelaAlca(true)}
        onMouseUp={() => setPelaAlca(false)}
        className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-white/25"
        aria-hidden
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        title={rotuloDoTipo(pergunta.tipo)}
      >
        <span className="relative shrink-0">
          <TipoIcone tipo={pergunta.tipo} tamanho={numero !== null ? 24 : 20} />
          {numero !== null && (
            <span className="absolute -bottom-1 -right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border border-white bg-slate-200 px-[3px] text-[9px] font-bold tabular-nums text-slate-700 dark:border-[#0F1117] dark:bg-white/[0.18] dark:text-white/85">
              {numero}
            </span>
          )}
        </span>
        <span
          className={
            "min-w-0 flex-1 truncate text-[12px] " +
            (ativa
              ? "font-semibold text-slate-900 dark:text-white"
              : "font-medium text-slate-700 dark:text-white/75")
          }
        >
          {pergunta.rotulo || "Sem pergunta"}
          {pergunta.obrigatoria && (
            <span className="ml-1 text-red-500 dark:text-red-400" aria-label="obrigatória">
              *
            </span>
          )}
        </span>
      </button>
      {desvios > 0 && (
        <button
          type="button"
          onClick={onAbrirTela}
          className="shrink-0 rounded-[4px] px-0.5 py-1 transition-colors hover:bg-blue-600/10"
          aria-label={`Ver ${desvios === 1 ? "o desvio" : "os desvios"} desta tela`}
        >
          <ChipDeDesvio n={desvios} />
        </button>
      )}
    </div>
  )
}

function ItemSolto({
  icone: Icone,
  rotulo,
  apoio,
  ativo,
  onClick,
}: {
  icone: typeof Play
  rotulo: string
  apoio: string
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition-colors " +
        (ativo ? "bg-blue-600/[0.10] dark:bg-blue-400/[0.14]" : "hover:bg-slate-100 dark:hover:bg-white/[0.04]")
      }
    >
      <Icone className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-white/55" />
      <span className="min-w-0 flex-1">
        <span
          className={
            "block truncate text-[12px] " +
            (ativo ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-white/75")
          }
        >
          {rotulo}
        </span>
        <span className="block truncate text-[10.5px] text-slate-500 dark:text-white/45">{apoio}</span>
      </span>
    </button>
  )
}

/** O alvo de "tirar da tela": soltar aqui abre uma tela nova. */
function FaixaDeSolta({
  ativa,
  visivel,
  onEntrar,
  onSair,
  onSoltar,
}: {
  ativa: boolean
  visivel: boolean
  onEntrar: () => void
  onSair: () => void
  onSoltar: () => void
}) {
  if (!visivel) return <div className="h-1" />
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        onEntrar()
      }}
      onDragLeave={onSair}
      onDrop={(e) => {
        e.preventDefault()
        onSoltar()
      }}
      className={
        "my-0.5 flex h-5 items-center justify-center rounded-[4px] border border-dashed text-[10px] font-medium transition-colors " +
        (ativa
          ? "border-blue-500 bg-blue-600/10 text-blue-700 dark:border-blue-400 dark:text-blue-300"
          : "border-slate-300 text-slate-400 dark:border-white/[0.14] dark:text-white/30")
      }
    >
      {ativa ? (
        <span className="inline-flex items-center gap-1">
          <ArrowRight className="h-2.5 w-2.5" />
          tela própria
        </span>
      ) : (
        <Check className="h-2.5 w-2.5 opacity-0" />
      )}
    </div>
  )
}
