/**
 * Revisão editorial: os 7 parâmetros (nota 0–10, mínimo 8) que a IA
 * atribui por peça + as violações que o CÓDIGO acha (anti-slop). Um
 * parâmetro abaixo de 8 ou uma violação `erro` reprova — é a régua do
 * manual, com a segunda pessoa decidida pelo perfil e não pela régua.
 */

import { contarErros } from "./anti-slop"
import type { NotaParametro, RevisaoEditorial, RevisaoSlide, ViolacaoEditorial } from "../types"

export const NOTA_MINIMA = 8

export interface ParametroEditorial {
  id: string
  nome: string
  /** O que a IA avalia — vai literalmente no prompt. */
  criterio: string
}

export const PARAMETROS: ParametroEditorial[] = [
  { id: "gramatica", nome: "Gramática", criterio: "Artigos presentes em todos os substantivos, sem fragmento sem verbo, concordância correta. Artigo omitido: nota máxima 7." },
  { id: "fluidez", nome: "Fluidez", criterio: "Lido em voz alta soa como parágrafo de reportagem, com conectivos naturais (porque, só que, por isso, enquanto, mas, aí). Texto picotado em frases-lista: nota máxima 5." },
  { id: "ai_slop", nome: "AI slop", criterio: "Zero estrutura binária (não é X, é Y; menos X, mais Y), zero cacoete (e isso muda tudo, no fim das contas, a pergunta que fica), zero jargão. Um binário: nota máxima 6. Um cacoete: nota máxima 5." },
  { id: "fatos", nome: "Fatos verificados", criterio: "Todo número, data, valor ou citação tem fonte na pauta ou está marcado [confirmar]. Dado sem fonte: nota máxima 6." },
  { id: "estrutura", nome: "Estrutura", criterio: "A promessa do hook é cumprida antes do CTA; um slide, uma ideia; máximo de 2 blocos por slide; o fechamento faz virada, não resumo." },
  { id: "densidade", nome: "Densidade", criterio: "Tirando artigos, conectivos e adjetivos sobra substância (nome, número, mecanismo). Se o bloco funciona com outro sujeito no lugar, é genérico." },
  { id: "tom", nome: "Tom editorial", criterio: "Duas frases curtas com ponto valem mais que uma longa com vírgula. Sem metalinguagem (\"este carrossel mostra\"). Voz do perfil respeitada." },
]

const PARAMETRO_IDS = new Set(PARAMETROS.map((p) => p.id))

export function normalizarNota(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(10, Math.round(v)))
}

/**
 * Junta a avaliação da IA com as violações do código. Parâmetro que a IA
 * não devolveu entra com nota 0 (ausência não é aprovação). O AI slop
 * vindo da IA é rebaixado pelo código: violação `erro` de slop limita a
 * nota a 5, como manda o manual.
 */
export function consolidarRevisao(
  saida: { parametros: Array<{ id: string; nota: number; problemas?: string[] }>; slides: Array<{ frameId: string; nota: number; problemas?: string[]; reescrita?: RevisaoSlide["reescrita"] }>; resumo?: string },
  violacoes: ViolacaoEditorial[],
  agora = new Date(),
): RevisaoEditorial {
  const daIa = new Map(saida.parametros.filter((p) => PARAMETRO_IDS.has(p.id)).map((p) => [p.id, p]))
  const errosSlop = violacoes.filter((v) => v.severidade === "erro" && ["nao_e_x_e_y", "menos_x_mais_y", "sem_x_sem_y", "deixa_de_ser", "antes_agora", "paralelismo", "muda_tudo", "fim_das_contas", "pergunta_que_fica", "funciona_assim", "mundo_onde"].includes(v.regra))
  const errosFonte = violacoes.filter((v) => v.regra === "dado_sem_fonte")
  const parametros: NotaParametro[] = PARAMETROS.map((p) => {
    const x = daIa.get(p.id)
    let nota = x ? normalizarNota(x.nota) : 0
    const problemas = [...(x?.problemas ?? [])]
    if (!x) problemas.push("A IA não avaliou este parâmetro.")
    if (p.id === "ai_slop" && errosSlop.length) {
      nota = Math.min(nota, 5)
      problemas.push(...errosSlop.map((v) => `${v.nome}: "${v.trecho}"`))
    }
    if (p.id === "fatos" && errosFonte.length) {
      nota = Math.min(nota, 6)
      problemas.push(...errosFonte.map((v) => `${v.nome}: "${v.trecho}"`))
    }
    return { id: p.id, nota, problemas }
  })
  const slides: RevisaoSlide[] = saida.slides.map((s) => ({ frameId: s.frameId, nota: normalizarNota(s.nota), problemas: s.problemas ?? [], reescrita: s.reescrita }))
  const reprovados = parametros.filter((p) => p.nota < NOTA_MINIMA)
  const erros = contarErros(violacoes)
  const aprovado = reprovados.length === 0 && erros === 0
  const resumo = aprovado
    ? "Aprovado nos 7 parâmetros, sem violação do filtro editorial."
    : [
        reprovados.length ? `${reprovados.length} parâmetro${reprovados.length > 1 ? "s" : ""} abaixo de ${NOTA_MINIMA} (${reprovados.map((p) => PARAMETROS.find((x) => x.id === p.id)?.nome ?? p.id).join(", ")})` : null,
        erros ? `${erros} violaç${erros > 1 ? "ões" : "ão"} do filtro editorial` : null,
      ]
        .filter(Boolean)
        .join(" · ")
  return { em: agora.toISOString(), parametros, slides, violacoes, aprovado, resumo }
}
