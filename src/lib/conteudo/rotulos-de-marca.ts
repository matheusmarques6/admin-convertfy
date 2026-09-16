/**
 * Os campos de marca, nomeados pelo que a IDENTIDADE desenha.
 *
 * O brand kit tem três campos de texto com nomes internos (`brandName`,
 * `brandName2`, `copyright`) e o painel os mostrava com esses nomes crus.
 * Num carrossel da casa eles são as duas linhas da assinatura e o
 * copyright; nas famílias de print (`cartaoPerfil`) o primeiro é o
 * **@handle** e o segundo é o **nome exibido** — e ninguém descobre isso
 * olhando para um rótulo escrito "brand-name".
 *
 * A outra metade do problema é o campo que a identidade NÃO desenha: o
 * cartão de perfil não tem rodapé de marca, então o copyright ficava na
 * tela como um controle que não muda nada. Campo que não aparece é pior
 * que campo ausente — o operador edita, não vê efeito e conclui que o
 * editor está quebrado.
 *
 * Puro: quem desenha é o `frame.tsx`; aqui só mora a correspondência.
 */

import type { TracoFamilia } from "./familias"

/** O que o rótulo precisa saber da identidade. */
export type TracoDeMarca = Pick<TracoFamilia, "cartaoPerfil" | "assinaturaNoSlide">

export type CampoDeMarca = "brandName" | "brandName2" | "copyright"

export interface RotuloDeMarca {
  campo: CampoDeMarca
  rotulo: string
  /** Onde ele aparece no slide — some da tela quando não há o que dizer. */
  dica?: string
  /** O valor é um `@handle` e ganha a arroba sozinho. */
  arroba?: boolean
}

const CARTAO: RotuloDeMarca[] = [
  { campo: "brandName2", rotulo: "Nome exibido", dica: "a linha em negrito, ao lado da foto" },
  { campo: "brandName", rotulo: "@ (arroba)", dica: "logo abaixo do nome, em cinza", arroba: true },
]

const CASA: RotuloDeMarca[] = [
  { campo: "brandName", rotulo: "Assinatura", dica: "o @ ou a marca, no rodapé e ao lado da foto" },
  { campo: "brandName2", rotulo: "Nome da marca", dica: "no rodapé, à direita" },
  { campo: "copyright", rotulo: "Copyright", dica: "no rodapé, ao lado do nome" },
]

/**
 * Os campos de marca que ESTA identidade desenha, na ordem em que aparecem
 * no slide. O que ela não desenha fica fora da lista.
 */
export function camposDeMarca(traco: TracoDeMarca): RotuloDeMarca[] {
  return traco.cartaoPerfil ? CARTAO : CASA
}

export interface SeloDeVerificado {
  desenha: boolean
  /** Frase para a tela: onde o selo aparece, ou por que não aparece. */
  onde: string
}

/**
 * O selo azul só existe onde há um nome para ele acompanhar: ao lado do
 * nome exibido no cartão de perfil, ou ao lado da assinatura nas famílias
 * que a desenham. Na Neon não há assinatura no slide — o interruptor
 * continua na tela, dizendo que ali não muda nada, em vez de sumir sem
 * explicação quando alguém troca de identidade.
 */
export function seloDeVerificado(traco: TracoDeMarca): SeloDeVerificado {
  if (traco.cartaoPerfil) return { desenha: true, onde: "ao lado do nome exibido" }
  if (traco.assinaturaNoSlide) return { desenha: true, onde: "ao lado da assinatura, no topo do slide" }
  return { desenha: false, onde: "esta identidade não desenha assinatura no slide" }
}

/**
 * Garante a arroba no handle sem atrapalhar quem está digitando.
 *
 * Só a arroba faz a linha ser lida como perfil — nas quatro referências
 * ela está lá. Mas uma arroba sozinha não é handle nenhum: apagar o texto
 * tem de esvaziar o campo, senão o slide fica com um "@" solto que o
 * operador não consegue remover.
 */
export function handleComArroba(valor: string): string {
  const v = valor.trim()
  if (!v || v === "@") return ""
  return v.startsWith("@") ? v : `@${v}`
}
