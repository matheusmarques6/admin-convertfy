/**
 * Via B do Estúdio — o prompt de imagem de UM slide.
 *
 * O usuário faz hoje os slides que mais gosta direto no ChatGPT Image,
 * porque "um prompt sem estar engessado" rende algo mais personalizado do
 * que um template. Este módulo escreve esse prompt a partir do que o
 * documento JÁ sabe (copy do slide, papel narrativo, marca, fundo,
 * proporção), para o operador copiar no ChatGPT ou gerar pela API — e
 * editar o texto livremente antes de qualquer um dos dois.
 *
 * Dois modos, e o padrão é o HÍBRIDO: o modelo gera só o VISUAL (sem
 * letra nenhuma) e o renderer coloca a copy com a tipografia da casa.
 * Modelo de imagem erra texto em português (acento, palavra trocada) e
 * não repete a mesma fonte entre slides — no híbrido a copy continua
 * editável, a tipografia é consistente por construção e a "cara de
 * ChatGPT" fica na parte visual, onde ajuda. O modo COMPLETO (slide
 * inteiro pelo modelo, texto incluído) é opção explícita; nele o prompt
 * leva a copy EXATA entre aspas, as fontes por nome e a anatomia do tipo
 * de frame, para o resultado parecer da mesma família que os demais.
 *
 * Puro: nada de rede nem de React. Quem grava é o painel do editor.
 */

import { FONTE_APOIO, FONTE_META, FONTE_TITULO, fundoEscuro } from "./brand"
import type { PapelFrame } from "./editorial/papeis"
import { PAPEL_LABEL } from "./editorial/papeis"
import { limiteDe } from "./limites"
import type { Campo, DocFrame, Documento, FrameTipo, Gradiente, ModoImagem, VarianteLayout } from "./types"

/** Tipos cujo renderer tem lugar para uma imagem sem cobrir o texto. */
export const TIPOS_COM_LUGAR_PARA_IMAGEM: FrameTipo[] = ["capa", "texto", "prova", "lista", "mec"]

/** Abaixo disto o slide está "vazio" o bastante para pedir uma imagem. */
export const LIMIAR_PEDE_IMAGEM = 0.6

export function aceitaHibrido(tipo: FrameTipo): boolean {
  return TIPOS_COM_LUGAR_PARA_IMAGEM.includes(tipo)
}

/**
 * Modo sugerido para o frame: híbrido onde o renderer tem lugar para a
 * imagem; nos demais (número gigante, CTA) só o slide inteiro faz sentido
 * — o híbrido ali não teria onde aparecer.
 */
export function sugerirModo(frame: Pick<DocFrame, "tipo" | "imagemModo">): ModoImagem {
  if (frame.imagemModo) return frame.imagemModo
  return aceitaHibrido(frame.tipo) ? "hibrido" : "completo"
}

/**
 * Quanto do espaço de texto do frame está usado (0..1): soma dos
 * caracteres escritos sobre a soma dos limites confortáveis dos campos.
 * Campo sem limite declarado fica fora da conta. É o "preenchimento REAL"
 * que decide a sugestão automática — frame quase vazio fica feio sem
 * imagem, e ninguém precisa olhar slide a slide para perceber.
 */
export function preenchimento(frame: Pick<DocFrame, "tipo" | "campos" | "textos">): number {
  let usado = 0
  let limite = 0
  for (const c of frame.campos) {
    const lim = limiteDe(frame.tipo, c)
    if (lim == null) continue
    limite += lim
    usado += Math.min(lim, (frame.textos[c] ?? "").trim().length)
  }
  if (limite === 0) return 0
  return Math.min(1, usado / limite)
}

/** Frame visível, com lugar para imagem, sem imagem e com pouco texto. */
export function pedeImagem(frame: DocFrame): boolean {
  if (frame.oculto) return false
  if (!aceitaHibrido(frame.tipo)) return false
  if (frame.imagens.slot1) return false
  return preenchimento(frame) < LIMIAR_PEDE_IMAGEM
}

// ── Construção do prompt ────────────────────────────────────────────────

export interface ContextoPrompt {
  frame: DocFrame
  /** Posição 0-based entre os frames VISÍVEIS. */
  indice: number
  total: number
  papel?: PapelFrame | null
  doc: Pick<Documento, "cores" | "brandKit" | "proporcaoExport" | "fundoPorFrame" | "gradiente" | "cta" | "ocultos">
  templateNome?: string | null
  /** "Por que funciona" das referências mais afins (vira orientação de estilo). */
  porQueFunciona?: string[]
  modo: ModoImagem
}

function dimensoes(proporcao: Documento["proporcaoExport"]): string {
  return proporcao === "9:16" ? "1080×1920 px (9:16, vertical)" : "1080×1350 px (4:5, vertical)"
}

function nomeDaFonte(pilha: string): string {
  const primeira = pilha.split(",")[0]?.trim() ?? pilha
  return primeira.replace(/^['"]|['"]$/g, "")
}

function descreverFundo(fundo: string | undefined, g: Gradiente): string {
  if (!fundo || fundo === "gradiente") return `gradiente diagonal (${g.angulo}°) de ${g.de} passando por ${g.meio} até ${g.ate}`
  return `cor sólida ${fundo}${fundoEscuro(fundo) ? " (fundo escuro, texto claro)" : " (fundo claro, texto escuro)"}`
}

function texto(frame: DocFrame, campo: Campo): string {
  return (frame.textos[campo] ?? "").trim()
}

/** Cena sugerida pelo papel narrativo — o que a imagem tem de MOSTRAR. */
const CENA_POR_PAPEL: Record<PapelFrame, string> = {
  headline: "a tensão da headline em uma cena concreta: o momento em que o problema aparece, sem resolver",
  hook: "o problema acontecendo em uma cena real de loja ou operação — um detalhe, não um panorama",
  mecanismo: "o motor por trás do fenômeno traduzido em objeto ou composição fotográfica (engrenagem, fluxo, camadas), nunca em diagrama com texto",
  prova: "um painel de métricas ou uma tela de dashboard fora de foco, com a sensação de dado real — números ilegíveis de propósito",
  aplicacao: "mesa de trabalho com caderno e conta feita à mão (rabiscos e traços, sem números legíveis), calculadora, a decisão sendo tomada",
  direcao: "o próximo passo: caminho, porta se abrindo, mão que aponta — sem venda, sem produto em destaque",
  fechamento: "uma virada: o mesmo ambiente do início, agora em ordem, mais aberto e luminoso",
  cta: "convite direto: celular com a caixa de mensagens aberta, mão prestes a digitar, close",
}

/** Cena de fallback por tipo, quando o motor editorial não atribuiu papel. */
const CENA_POR_TIPO: Record<FrameTipo, string> = {
  capa: "a cena da tensão do título, com profundidade e um ponto focal claro",
  dado: "composição minimalista que sustente um número gigante por cima",
  texto: "um detalhe concreto do que o texto afirma — objeto, ambiente ou gesto, nunca ilustração genérica",
  prova: "textura ou ambiente escuro que sirva de fundo a uma citação",
  lista: "o item deste slide materializado em um objeto ou cena curta",
  mec: "o passo deste slide materializado em um objeto ou cena curta",
  cta: "convite direto: celular com a caixa de mensagens aberta, close",
}

/**
 * Onde o texto vai ficar por cima, no híbrido — o modelo precisa deixar
 * essa área calma (menos detalhe, contraste baixo), senão a copy some.
 */
function areaReservada(tipo: FrameTipo, variante: VarianteLayout): string {
  if (tipo === "capa") {
    if (variante === "b") return "A imagem ocupa o slide inteiro. O TÍTULO vai centralizado; deixe o centro do quadro calmo e escureça levemente da metade para baixo."
    if (variante === "c") return "A imagem ocupa o slide inteiro. O TÍTULO vai no terço SUPERIOR; deixe essa faixa calma e o assunto visual no terço inferior."
    return "A imagem ocupa o slide inteiro. O TÍTULO vai no terço INFERIOR; deixe essa faixa calma e mais escura, e o assunto visual no centro/terço superior."
  }
  if (tipo === "prova") return "A imagem ocupa o slide inteiro e recebe um véu azul-escuro por cima com a citação centralizada: textura e contraste valem mais que cor; sem ponto focal no centro."
  if (tipo === "texto") {
    if (variante === "b") return "A imagem entra em um card de cantos arredondados na METADE SUPERIOR do slide; o título e o corpo ficam embaixo dela. Assunto centralizado, sem elementos cortados nas bordas."
    return "A imagem entra em um card de cantos arredondados na METADE INFERIOR do slide, abaixo do título e do corpo. Assunto centralizado, sem elementos cortados nas bordas."
  }
  return "A imagem entra em um card de cantos arredondados no terço inferior do slide, abaixo do número da série, do título e do corpo."
}

function paleta(cores: Record<string, string>): string {
  const hook = cores.hook ?? "#2137B6"
  const destaque = cores.destaque ?? "#4E62D8"
  return `azul profundo ${hook} e ${destaque} como cores de marca, neutros quentes e brancos; nada saturado fora da paleta`
}

const ESTILO_BASE = "Estética editorial premium, fotografia real ou 3D fotorrealista, luz natural suave, profundidade de campo, sem cara de banco de imagens, sem pessoas olhando para a câmera, sem marca d'água."

function blocoReferencias(porQueFunciona?: string[]): string {
  const itens = (porQueFunciona ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (!itens.length) return ""
  return `\nO que funcionou nos carrosséis de referência da casa (use como direção de estilo, não copie):\n${itens.map((s) => `- ${s}`).join("\n")}\n`
}

function cabecalhoCopy(frame: DocFrame): string {
  const partes: string[] = []
  const t = texto(frame, "titulo")
  const s = texto(frame, "subtitulo")
  const c = texto(frame, "corpo")
  if (t) partes.push(`«${t}»`)
  if (s) partes.push(`«${s}»`)
  if (c) partes.push(`«${c}»`)
  return partes.join(" — ")
}

function promptHibrido(ctx: ContextoPrompt): string {
  const { frame, doc, indice, total } = ctx
  const variante = frame.variante ?? "a"
  const papel = ctx.papel ?? null
  const cena = papel ? CENA_POR_PAPEL[papel] : CENA_POR_TIPO[frame.tipo]
  const copy = cabecalhoCopy(frame)
  const linhas = [
    `Imagem para o slide ${indice + 1} de ${total} de um carrossel do Instagram, ${dimensoes(doc.proporcaoExport)}.`,
    ``,
    `Esta imagem é só o VISUAL do slide: o texto será colocado por cima depois, pelo nosso sistema. NÃO escreva nenhum texto, letra, número, logotipo, ícone de app ou marca d'água na imagem.`,
    ``,
    copy ? `O slide diz: ${copy}.` : `O slide ainda não tem texto; a imagem carrega a ideia sozinha.`,
    `${papel ? `Papel deste slide na narrativa: ${PAPEL_LABEL[papel].toLowerCase()}. ` : ""}Mostre ${cena}.`,
    ``,
    areaReservada(frame.tipo, variante),
    ``,
    `${ESTILO_BASE} Paleta: ${paleta(doc.cores)}.`,
  ]
  const refs = blocoReferencias(ctx.porQueFunciona)
  if (refs) linhas.push(refs.trimEnd())
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Anatomia do tipo de frame, para o modelo desenhar o slide como o renderer desenharia. */
function anatomia(ctx: ContextoPrompt): string[] {
  const { frame, doc, indice, total } = ctx
  const titulo = nomeDaFonte(FONTE_TITULO)
  const apoio = nomeDaFonte(FONTE_APOIO)
  const meta = nomeDaFonte(FONTE_META)
  const t = texto(frame, "titulo")
  const s = texto(frame, "subtitulo")
  const c = texto(frame, "corpo")
  const linhas: string[] = []
  const T = (rotulo: string, v: string) => (v ? `- ${rotulo}: "${v}"` : "")

  switch (frame.tipo) {
    case "capa":
      linhas.push(`Capa: fotografia ocupando o slide inteiro com um degradê azul-escuro (#041366) da metade para baixo.`)
      linhas.push(T(`Título em ${titulo}, peso 800, CAIXA ALTA, branco, ~104 px, alinhado à esquerda no terço inferior`, t))
      linhas.push(T(`Subtítulo em ${apoio} itálico, branco a 88%, ~40 px, logo abaixo do título`, s))
      break
    case "dado":
      linhas.push(`Slide de dado: um número gigante e uma frase de apoio, nada mais.`)
      linhas.push(T(`Número em ${titulo}, peso 800, ~360 px, cor ${fundoEscuro(doc.fundoPorFrame[frame.frameId] ?? "") ? "branca" : doc.cores.hook}`, t))
      linhas.push(`- Abaixo do número, um traço horizontal curto (120×10 px) na cor de destaque ${doc.cores.destaque}.`)
      linhas.push(T(`Frase de apoio em ${apoio} itálico, ~48 px, largura máxima 860 px`, c))
      break
    case "prova":
      linhas.push(`Slide de prova: fotografia de fundo coberta por um véu azul-escuro (#041366 a 75–92%), com uma citação centralizada.`)
      linhas.push(`- Aspas de abertura gigantes (~200 px) em ${apoio}, brancas a 35%, acima do texto.`)
      linhas.push(T(`Citação em ${titulo}, peso 800, CAIXA ALTA, branca, ~92 px`, t))
      linhas.push(T(`Fonte/atribuição em ${apoio} itálico, branca a 82%, ~40 px`, c))
      break
    case "lista":
    case "mec": {
      const meio = Math.max(1, total - 2)
      const n = Math.max(1, Math.min(meio, indice))
      linhas.push(`Slide de série numerada: barra de progresso no topo (${total} segmentos finos, os ${indice + 1} primeiros preenchidos), depois o número da série.`)
      linhas.push(`- Número "${String(n).padStart(2, "0")}" em ${titulo}, peso 800, ~140 px, na cor de destaque ${doc.cores.destaque}, com "${frame.tipo === "mec" ? "papel" : "item"} de ${meio}" ao lado em ${meta}, caixa alta, espaçado.`)
      linhas.push(T(`Título em ${titulo}, peso 800, CAIXA ALTA, ~88 px`, t))
      linhas.push(T(`Corpo em ${meta}, peso 500, ~40 px, entrelinha 1,4`, c))
      linhas.push(`- Abaixo do texto, um card de cantos arredondados (28 px) com a imagem da cena.`)
      break
    }
    case "cta": {
      const botao = texto(frame, "botao") || (doc.cta.mostrar ? doc.cta.texto.trim() : "")
      linhas.push(`Slide de chamada: tudo centralizado no meio do slide, fundo escuro.`)
      linhas.push(T(`Título em ${titulo}, peso 800, CAIXA ALTA, branco, ~112 px`, t))
      linhas.push(T(`Subtítulo em ${apoio} itálico, branco a 88%, ~42 px`, s))
      if (botao) linhas.push(`- Pílula (raio total, ${doc.cta.fundo} com texto ${doc.cta.cor}, ~34 px em ${meta} peso 700, ícone de caixa de mensagens à esquerda) com o texto "${botao}".`)
      break
    }
    default: {
      const variante = frame.variante ?? "a"
      linhas.push(`Slide de texto: margens de 80 px, conteúdo alinhado à ${variante === "c" ? "centro" : "esquerda"} a partir de 180 px do topo.`)
      linhas.push(T(`Título em ${titulo}, peso 800, CAIXA ALTA, ~96 px`, t))
      linhas.push(T(`Corpo em ${apoio} itálico, ~42 px, entrelinha 1,35`, c))
      if (variante !== "c") linhas.push(`- ${variante === "b" ? "Acima" : "Abaixo"} do texto, um card de cantos arredondados (28 px) com a imagem da cena.`)
    }
  }
  return linhas.filter(Boolean)
}

function rodapeDeMarca(ctx: ContextoPrompt): string {
  const { doc, indice, total } = ctx
  const bk = doc.brandKit
  const oc = doc.ocultos
  const partes: string[] = []
  if (!oc.avatar && bk.avatar) partes.push("foto de perfil redonda")
  if (!oc.brandName && bk.brandName) partes.push(`"${bk.brandName}"`)
  if (!oc.brandName2 && bk.brandName2) partes.push(`"${bk.brandName2}"`)
  const esquerda = partes.length ? `à esquerda ${partes.join(", ")} em ${nomeDaFonte(FONTE_META)}` : "à esquerda nada"
  return `Rodapé: ${esquerda}; à direita o contador "${indice + 1}/${total}"${!oc.copyright && bk.copyright ? ` e "${bk.copyright}"` : ""}, tudo pequeno (~26 px).`
}

function promptCompleto(ctx: ContextoPrompt): string {
  const { frame, doc, indice, total } = ctx
  const papel = ctx.papel ?? null
  const cena = papel ? CENA_POR_PAPEL[papel] : CENA_POR_TIPO[frame.tipo]
  const fundo = frame.tipo === "capa" || frame.tipo === "prova" || frame.tipo === "cta" ? "a fotografia descrita abaixo, escurecida" : descreverFundo(doc.fundoPorFrame[frame.frameId], doc.gradiente)
  const linhas = [
    `Desenhe o slide ${indice + 1} de ${total} de um carrossel do Instagram, INTEIRO, ${dimensoes(doc.proporcaoExport)}${ctx.templateNome ? `, molde "${ctx.templateNome}"` : ""}.`,
    ``,
    `O texto abaixo entra EXATAMENTE como está escrito — em português, com os acentos, sem traduzir, resumir, corrigir ou acrescentar uma palavra. Se não couber, reduza o tamanho da fonte, nunca o texto.`,
    ``,
    ...anatomia(ctx),
    `- Fundo: ${fundo}.`,
    `- ${rodapeDeMarca(ctx)}`,
    ``,
    `Imagem da cena: ${cena}. ${ESTILO_BASE} Paleta: ${paleta(doc.cores)}.`,
    ``,
    `Todo texto deve estar nítido e legível; nenhuma outra palavra, logotipo ou marca d'água além do que está listado.`,
  ]
  const refs = blocoReferencias(ctx.porQueFunciona)
  if (refs) linhas.push(refs.trimEnd())
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function construirPromptDeSlide(ctx: ContextoPrompt): string {
  return ctx.modo === "completo" ? promptCompleto(ctx) : promptHibrido(ctx)
}

/** O prompt que vale: o editado pelo humano, senão o sugerido. */
export function promptEfetivo(ctx: ContextoPrompt): { prompt: string; origem: "editado" | "sugerido" } {
  const editado = ctx.frame.promptImagem?.trim()
  if (editado) return { prompt: editado, origem: "editado" }
  return { prompt: construirPromptDeSlide(ctx), origem: "sugerido" }
}
