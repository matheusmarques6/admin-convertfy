/**
 * Carrossel pronto → template reutilizável.
 *
 * Medido em 16/09, em produção: **0 templates do time**, 3 documentos e 1
 * referência. O motivo não era falta de vontade — era que só existia UM
 * caminho para cadastrar template, o "a partir de inspiração": subir os
 * slides como imagem, esperar uma chamada de VISÃO ler a estrutura,
 * revisar e nomear. Quem acabou de montar um carrossel bom no próprio
 * Estúdio tinha de exportar a peça em PNG e subir de volta para que um
 * modelo adivinhasse a sequência que o editor já conhece campo a campo.
 *
 * A conversão inversa (estrutura → documento, `documentoDeEstrutura`) e a
 * de referência (`estruturaDaReferencia`) já existiam; esta faltava, e com
 * ela o caminho mais rápido de todos: um clique no carrossel que está na
 * tela.
 *
 * Três regras que erram em silêncio se ficarem na UI:
 *
 * 1. **Slide oculto não entra.** `oculto` é o que o operador tirou da peça;
 *    trazê-lo de volta pelo template devolveria, na próxima criação, o
 *    slide que ele acabou de esconder.
 * 2. **Só é "com foto" o slot que o renderer DESENHA.** `dado` e `cta` não
 *    têm lugar para imagem (`TIPOS_COM_SLOT`), então marcar foto neles
 *    grava uma promessa que nenhuma peça cumpre — e nada avisa.
 * 3. **O nome do template descreve a FORMA, não a pauta.** O nome do
 *    carrossel é a headline ("8% dos clientes fazem 41% do faturamento");
 *    como template ele reaparece na hora de escolher a sequência, onde a
 *    headline de outra peça não ajuda a decidir. O nome é sugerido e
 *    EDITÁVEL — inventar um aqui seria adivinhar a intenção.
 *
 * Puro e testado.
 */

import { familiaDe, tracoDe } from "./familias"
import { tipoDesenhaImagem } from "./referencia-para-documento"
import { FRAME_TIPO_LABEL, variantesDoTipo, type DesenhoDasVariantes } from "./templates"
import type { DocFrame, Documento, EstruturaDetectada, MeuTemplate } from "./types"

/** Teto do `descricao` no schema da rota (`estruturaSchema`). */
const DESCRICAO_MAX = 200

/**
 * Descrição curta da FORMA do frame: tipo, variação de layout e se ele
 * depende de foto. É o texto que aparece na revisão da estrutura, então
 * ele fala de desenho — nunca da copy, que muda a cada peça.
 */
export function descricaoDoFrame(f: DocFrame, desenho: boolean | DesenhoDasVariantes = false): string {
  const partes: string[] = [FRAME_TIPO_LABEL[f.tipo]]
  // O nome da variação é o da IDENTIDADE: no cartão de perfil "a" é uma
  // POSE, e gravar "texto embaixo" na estrutura descreveria um desenho que
  // aquela família não tem.
  const variante = f.variante ? variantesDoTipo(f.tipo, desenho)?.find(([k]) => k === f.variante)?.[1] : undefined
  if (variante) partes.push(variante.toLowerCase())
  if (temFoto(f)) partes.push("com foto")
  return partes.join(" · ").slice(0, DESCRICAO_MAX)
}

/** O frame tem imagem que o renderer realmente desenha? */
export function temFoto(f: DocFrame): boolean {
  return f.slotsImagem > 0 && tipoDesenhaImagem(f.tipo)
}

/**
 * A sequência do documento como estrutura de template: um item por slide
 * visível, na ordem da peça.
 */
export function estruturaDoDocumento(doc: Pick<Documento, "frames" | "familia">): EstruturaDetectada[] {
  const tracoDoDoc = tracoDe(familiaDe(doc))
  return doc.frames
    .filter((f) => !f.oculto)
    .map((f) => ({ tipo: f.tipo, slotImagem: temFoto(f), descricao: descricaoDoFrame(f, tracoDoDoc) }))
}

/**
 * Tira da estrutura a foto que o renderer não desenha.
 *
 * Roda nos dois lados do mesmo problema: na leitura de uma inspiração (o
 * modelo marca `slotImagem` num slide de número porque ele viu uma arte) e
 * na troca manual do tipo na revisão (quem marca foto num `texto` e depois
 * o transforma em `dado` deixa para trás um slot que some do slide sem
 * dizer nada).
 */
export function normalizarEstrutura(estrutura: readonly EstruturaDetectada[]): EstruturaDetectada[] {
  return estrutura.map((e) => (e.slotImagem && !tipoDesenhaImagem(e.tipo) ? { ...e, slotImagem: false } : { ...e }))
}

/** Minúsculas, sem acento, sem espaço sobrando — só para COMPARAR nomes. */
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

/**
 * Já existe template com este nome?
 *
 * O dedupe é por nome porque é o nome que o operador lê na prateleira —
 * dois "Benchmark com número gigante" são indistinguíveis na hora de
 * escolher, mesmo com estruturas diferentes. Quem decide o que fazer com
 * o conflito é a tela (atualizar o existente ou renomear): substituir
 * sozinho apagaria a forma de outra peça, e criar o segundo em silêncio é
 * o que enche a prateleira de duplicatas.
 */
export function templateComMesmoNome(nome: string, lista: readonly MeuTemplate[]): MeuTemplate | null {
  const k = chaveDeNome(nome)
  if (!k) return null
  return lista.find((t) => chaveDeNome(t.nome) === k) ?? null
}

/**
 * O que o template NÃO leva do carrossel, para a tela poder dizer. Nada
 * aqui é defeito: template é a forma, e copy, imagem e cores são da peça.
 */
export interface ResumoDoTemplate {
  frames: number
  ocultos: number
  comFoto: number
}

export function resumoDoTemplate(doc: Pick<Documento, "frames">): ResumoDoTemplate {
  const visiveis = doc.frames.filter((f) => !f.oculto)
  return {
    frames: visiveis.length,
    ocultos: doc.frames.length - visiveis.length,
    comFoto: visiveis.filter(temFoto).length,
  }
}
