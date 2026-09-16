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

import { SLIDE, fundoEscuro } from "./brand"
import { POST_CORES, medidasPost, posePost } from "./formato-post"
import { MANCHETE } from "./formato-manchete"
import { FAMILIAS, familiaDe, tracoDe, type TracoFamilia } from "./familias"
import type { PapelFrame } from "./editorial/papeis"
import { PAPEL_LABEL } from "./editorial/papeis"
import { limiteDe } from "./limites"
import { partesDestacadas, textoLimpo } from "./rich"
import type { Campo, DocFrame, Documento, FamiliaVisual, FrameTipo, Gradiente, ModoImagem, VarianteLayout } from "./types"

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
  doc: Pick<Documento, "cores" | "brandKit" | "proporcaoExport" | "fundoPorFrame" | "gradiente" | "cta" | "ocultos" | "familia">
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

/**
 * O fundo como o RENDERER o resolve: frame sem entrada no mapa cai no
 * claro da casa (`doc.fundoPorFrame[id] ?? SLIDE.fundoClaro`), não em
 * gradiente — o prompt descrevia um fundo que a peça não teria.
 */
function descreverFundo(fundo: string | undefined, g: Gradiente): string {
  if (fundo === undefined) return descreverFundo(SLIDE.fundoClaro, g)
  if (fundo === "gradiente") return `gradiente diagonal (${g.angulo}°) de ${g.de} passando por ${g.meio} até ${g.ate}`
  return `cor sólida ${fundo}${fundoEscuro(fundo) ? " (fundo escuro, texto claro)" : " (fundo claro, texto escuro)"}`
}

/**
 * A copy do campo SEM os marcadores de realce.
 *
 * `**palavra**` é notação NOSSA: o renderer a desenha na cor de destaque,
 * e mandá-la crua ao modelo faria ele escrever os asteriscos dentro da
 * imagem. O realce vira instrução própria (`notaDeDestaque`).
 */
function texto(frame: DocFrame, campo: Campo): string {
  return textoLimpo((frame.textos[campo] ?? "").trim())
}

/** As palavras marcadas com `**`, para o modelo pintá-las. */
function notaDeDestaque(frame: DocFrame, campos: Campo[], cor: string): string {
  const marcadas = campos.flatMap((c) =>
    partesDestacadas((frame.textos[c] ?? "").trim())
      .filter((p) => p.destaque)
      .map((p) => p.texto.trim())
      .filter(Boolean),
  )
  if (!marcadas.length) return ""
  return `- ${marcadas.length === 1 ? "A palavra" : "As palavras"} ${marcadas.map((m) => `«${m}»`).join(", ")} ${marcadas.length === 1 ? "sai" : "saem"} na cor de destaque ${cor}, no MESMO tamanho e peso do resto da linha — o restante do texto na cor indicada acima.`
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
function areaReservada(tipo: FrameTipo, variante: VarianteLayout, tr?: TracoFamilia): string {
  // O cartão de perfil (print de post) não tem foto de fundo: a imagem é
  // uma peça RECORTADA embaixo do texto, com margem própria. Pedir foto
  // sangrada aqui devolveria justamente o que o formato não usa.
  if (tr?.cartaoPerfil) {
    return "A imagem entra como uma peça recortada de cantos levemente arredondados ABAIXO do texto, com margem lateral própria — ela não ocupa o slide inteiro nem fica atrás de letra nenhuma. Assunto centralizado, bordas retas, nada cortado."
  }
  if (tipo === "capa") {
    if (variante === "b") return "A imagem ocupa o slide inteiro. O TÍTULO vai centralizado; deixe o centro do quadro calmo e escureça levemente da metade para baixo."
    if (variante === "c") return "A imagem ocupa o slide inteiro. O TÍTULO vai no terço SUPERIOR; deixe essa faixa calma e o assunto visual no terço inferior."
    return "A imagem ocupa o slide inteiro. O TÍTULO vai no terço INFERIOR; deixe essa faixa calma e mais escura, e o assunto visual no centro/terço superior."
  }
  if (tipo === "prova") return "A imagem ocupa o slide inteiro e recebe um véu escuro por cima com a citação centralizada: textura e contraste valem mais que cor; sem ponto focal no centro."
  if (tipo === "texto") {
    if (variante === "b") return "A imagem entra em um card de cantos arredondados na METADE SUPERIOR do slide; o título e o corpo ficam embaixo dela. Assunto centralizado, sem elementos cortados nas bordas."
    return "A imagem entra em um card de cantos arredondados na METADE INFERIOR do slide, abaixo do título e do corpo. Assunto centralizado, sem elementos cortados nas bordas."
  }
  return "A imagem entra em um card de cantos arredondados no terço inferior do slide, abaixo do número da série, do título e do corpo."
}

function paleta(cores: Record<string, string>): string {
  const hook = cores.hook ?? "#2137B6"
  const destaque = cores.destaque ?? "#4E62D8"
  return `${hook} e ${destaque} como cores de marca, neutros e brancos; nada saturado fora da paleta`
}

const ESTILO_BASE = "Estética editorial premium, fotografia real ou 3D fotorrealista, luz natural suave, profundidade de campo, sem cara de banco de imagens, sem pessoas olhando para a câmera, sem marca d'água."

/**
 * Famílias cuja direção de arte SUBSTITUI a base em vez de somar a ela.
 *
 * O `ESTILO_BASE` abre com "fotografia real"; a direção da Post diz "não é
 * fotografia, é uma captura de tela". As duas no mesmo prompt são uma
 * contradição direta, e o modelo obedece a uma das duas ao acaso.
 */
const ESTILO_SUBSTITUI: Partial<Record<FamiliaVisual, true>> = { post: true }

/**
 * Cena PRÓPRIA da família, quando o meio dela não é fotografia.
 *
 * As cenas da casa (por papel ou por tipo) descrevem objeto, ambiente e
 * gesto — na Post isso contradiz a própria direção ("sem cena, sem objeto
 * físico"), e o papel narrativo não tem como mudar o que uma captura de
 * tela é. Só a família que declara aqui ignora a cena da casa; nas demais
 * o papel continua mandando.
 */
const CENA_DA_FAMILIA: Partial<Record<FamiliaVisual, string>> = {
  post: "a tela que o post comenta — uma página, um painel ou um app, enquadrado de frente, nítido e com o conteúdo plausível",
}

export function cenaDoSlide(familia: FamiliaVisual, papel: PapelFrame | null, tipo: FrameTipo): string {
  return CENA_DA_FAMILIA[familia] ?? (papel ? CENA_POR_PAPEL[papel] : CENA_POR_TIPO[tipo])
}

/** A direção de arte da cena: base da casa + família, ou só a família. */
function estiloDaCena(familia: FamiliaVisual): string {
  const dela = ESTILO_POR_FAMILIA[familia]
  return ESTILO_SUBSTITUI[familia] ? dela : `${ESTILO_BASE} ${dela}`
}

/**
 * A identidade visual muda a direção de arte, não só a paleta: a família
 * Editorial imita papel impresso (bege, grão, sombra curta) e uma foto
 * fria de estúdio brigaria com o resto da peça.
 */
const ESTILO_POR_FAMILIA: Record<FamiliaVisual, string> = {
  padrao: "",
  editorial: "Direção de matéria impressa: luz quente e lateral, fundo bege claro com leve grão de papel, sombras curtas e suaves, objetos reais sobre superfície fosca. Nada de brilho digital, nada de fundo preto.",
  alternado:
    "Direção editorial-técnica: luz de estúdio direcional e limpa, fundo liso (off-white ou quase-preto, conforme o slide), contraste alto, geometria evidente, uma cor de destaque só. Nada de textura de papel, nada de cena quente de casa.",
  // O slide da família Post é um print de tweet: a "imagem" dele é uma
  // CAPTURA DE TELA, não uma cena fotografada. Pedir foto de estúdio ali
  // devolveria justamente o que o formato não usa.
  post: "A imagem é uma CAPTURA DE TELA nítida (página, painel ou app) sobre fundo claro, com as bordas retas e o conteúdo legível — não é fotografia. Sem cena, sem pessoas, sem objeto físico.",
  // O formato largo mostra FOTO de bastidor (o lugar, o evento, a pessoa),
  // não captura de tela: é a prova de que a história aconteceu.
  "post-largo":
    "Foto real de bastidor, como quem registrou o momento com o celular: luz do ambiente, enquadramento espontâneo, nada de estúdio nem de banco de imagens. É a prova visual da história que o texto conta.",
  // A peça alterna preto e branco e a foto é um CARD entre margens largas,
  // nunca o fundo do slide. Na referência ela é editorial: uma pessoa real
  // em cena, alto contraste, sem cara de banco de imagens.
  manchete:
    "Foto editorial de alto contraste, pessoa ou objeto real em cena, luz dura e recorte limpo — ela entra como um card entre margens largas, não como fundo do slide. Nada de moldura desenhada, nada de texto na imagem, nada de colagem de banco de imagens.",
}

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
  const cena = cenaDoSlide(familiaDe(doc), papel, frame.tipo)
  const copy = cabecalhoCopy(frame)
  const linhas = [
    `Imagem para o slide ${indice + 1} de ${total} de um carrossel do Instagram, ${dimensoes(doc.proporcaoExport)}.`,
    ``,
    `Esta imagem é só o VISUAL do slide: o texto será colocado por cima depois, pelo nosso sistema. NÃO escreva nenhum texto, letra, número, logotipo, ícone de app ou marca d'água na imagem.`,
    ``,
    copy ? `O slide diz: ${copy}.` : `O slide ainda não tem texto; a imagem carrega a ideia sozinha.`,
    `${papel ? `Papel deste slide na narrativa: ${PAPEL_LABEL[papel].toLowerCase()}. ` : ""}Mostre ${cena}.`,
    ``,
    areaReservada(frame.tipo, variante, tracoDe(familiaDe(doc))),
    ``,
    `${estiloDaCena(familiaDe(doc))} Paleta: ${paleta(doc.cores)}.`.replace(/\s+/g, " "),
  ]
  const refs = blocoReferencias(ctx.porQueFunciona)
  if (refs) linhas.push(refs.trimEnd())
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Anatomia do cartão de perfil (o print de post): UM desenho para todo
 * tipo de frame, com as medidas da referência convertidas para a base do
 * canvas. Descrever aqui a anatomia da casa faria o modelo desenhar
 * cabeçalho de marca e contador — justamente o que denuncia que a peça
 * não é uma captura de tela.
 */
function anatomiaCartaoPerfil(ctx: ContextoPrompt, tr: TracoFamilia): string[] {
  const { frame, doc } = ctx
  const comImagem = Boolean(frame.imagens.slot1) || frame.slotsImagem > 0
  const m = medidasPost(posePost(comImagem, frame.variante), frame.tipo, tr.estiloPost)
  const bk = doc.brandKit
  const fonte = nomeDaFonte(tr.fonteCorpo)
  const t = texto(frame, "titulo")
  const c = texto(frame, "corpo")
  const linhas: string[] = [
    `Captura de tela de um post: fundo ${POST_CORES.fundo} (quase preto) do topo ao rodapé, margem lateral de ${m.margem} px, nada de moldura nem de sombra.`,
    `- Cabeçalho: foto de perfil redonda de ${m.avatar} px${bk.brandName2 ? `, e ao lado "${bk.brandName2}"` : ""} em ${fonte} peso 700, ${m.nome} px, branco${bk.verificado ? `, com um selo verificado azul (${POST_CORES.selo}) de ${m.selo} px ao lado do nome` : ""}${bk.brandName ? `; logo abaixo "${bk.brandName}" no MESMO corpo, peso normal, em cinza ${POST_CORES.handle}` : ""}.`,
  ]
  if (t) linhas.push(`- ${m.gapCabecalho} px abaixo do cabeçalho, uma linha em NEGRITO: "${t}"`)
  if (c) linhas.push(`- ${t ? `${m.gapTitulo} px abaixo dela` : `${m.gapCabecalho} px abaixo do cabeçalho`}, o texto do post em ${fonte} peso normal, ${m.texto} px, entrelinha ${m.entrelinha.toFixed(2).replace(".", ",")}, branco, alinhado à esquerda: "${c}"`)
  if (comImagem) {
    linhas.push(
      m.gapGaleria > 0
        ? `- Embaixo, uma colagem de DUAS fotos lado a lado, cantos de ${m.raioImagem} px e ${m.gapGaleria} px entre elas, ocupando da margem de ${m.margemImagem} px até a outra.`
        : `- Embaixo, a captura em si: cantos de ${m.raioImagem} px, margem lateral de ${m.margemImagem} px, descendo até quase a borda inferior (${m.rodape} px).`,
    )
  }
  // O botão é a ÚNICA coisa que o último slide tem a mais no formato
  // (`camposPost`): sem esta linha o modelo desenharia a chamada sem ela.
  const botao = texto(frame, "botao") || (doc.cta.mostrar ? doc.cta.texto.trim() : "")
  if (frame.tipo === "cta" && botao) {
    linhas.push(`- ${m.gapCabecalho} px abaixo do texto, uma pílula clara (${doc.cta.fundo} com texto ${doc.cta.cor}, ~${Math.round(m.texto * 0.78)} px, ícone de caixa de mensagens à esquerda) com o texto "${botao}".`)
  }
  linhas.push(`- SEM rodapé de marca, SEM contador de slides, SEM filete: a peça imita uma captura de tela.`)
  const destaque = notaDeDestaque(frame, ["titulo", "corpo"], doc.cores.destaque ?? POST_CORES.selo)
  if (destaque) linhas.push(destaque)
  return linhas
}

/** Anatomia do tipo de frame, para o modelo desenhar o slide como o renderer desenharia. */
function anatomia(ctx: ContextoPrompt): string[] {
  const { frame, doc, indice, total } = ctx
  const tr = tracoDe(familiaDe(doc))
  if (tr.cartaoPerfil) return anatomiaCartaoPerfil(ctx, tr)
  const titulo = `${nomeDaFonte(tr.fonteTitulo)}${tr.tituloCaixaAlta ? "" : " (caixa normal, não caixa alta)"}`
  const apoio = nomeDaFonte(tr.fonteGancho)
  const meta = nomeDaFonte(tr.fonteMeta)
  const t = texto(frame, "titulo")
  const s = texto(frame, "subtitulo")
  const c = texto(frame, "corpo")
  const linhas: string[] = []
  const T = (rotulo: string, v: string) => (v ? `- ${rotulo}: "${v}"` : "")

  switch (frame.tipo) {
    case "capa":
      linhas.push(`Capa: fotografia ocupando o slide inteiro com um degradê ${doc.gradiente.ate} da metade para baixo.`)
      linhas.push(T(`Título em ${titulo}, peso ${tr.tituloPeso}, ${tr.tituloCaixaAlta ? "CAIXA ALTA, " : ""}branco, ~104 px, alinhado à esquerda no terço inferior`, t))
      linhas.push(T(`Subtítulo em ${apoio} itálico, branco a 88%, ~40 px, logo abaixo do título`, s))
      break
    case "dado":
      linhas.push(`Slide de dado: um número gigante e uma frase de apoio, nada mais.`)
      linhas.push(T(`Número em ${titulo}, peso 800, ~360 px, cor ${fundoEscuro(doc.fundoPorFrame[frame.frameId] ?? "") ? "branca" : doc.cores.hook}`, t))
      linhas.push(`- Abaixo do número, um traço horizontal curto (120×10 px) na cor de destaque ${doc.cores.destaque}.`)
      linhas.push(T(`Frase de apoio em ${apoio} itálico, ~48 px, largura máxima 860 px`, c))
      break
    case "prova":
      linhas.push(`Slide de prova: fotografia de fundo coberta por um véu ${doc.gradiente.ate} a 75–92%, com uma citação centralizada.`)
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
      linhas.push(`- Abaixo do texto, um card de cantos arredondados (${tr.raio} px) com a imagem da cena.`)
      break
    }
    case "cta": {
      const botao = texto(frame, "botao") || (doc.cta.mostrar ? doc.cta.texto.trim() : "")
      linhas.push(`Slide de chamada: tudo centralizado no meio do slide, fundo escuro.`)
      linhas.push(T(`Título em ${titulo}, peso 800, CAIXA ALTA, branco, ~112 px`, t))
      linhas.push(T(`Subtítulo em ${apoio} itálico, branco a 88%, ~42 px`, s))
      if (botao) {
        const forma =
          tr.cta === "bloco"
            ? `Caixa sólida de cantos quase retos (${doc.cta.fundo} com texto ${doc.cta.cor}, ~46 px em ${titulo}, CAIXA ALTA`
            : tr.cta === "pilula"
              ? `Pílula clara de borda fina (${doc.cta.fundo} com texto ${doc.cta.cor}, ~34 px em ${meta} peso 700`
              : `Pílula sólida com sombra (${doc.cta.fundo} com texto ${doc.cta.cor}, ~34 px em ${meta} peso 700`
        linhas.push(`- ${forma}, ícone de caixa de mensagens à esquerda) com o texto "${botao}".`)
      }
      break
    }
    default: {
      const variante = frame.variante ?? "a"
      const margem = tr.logoNoTopo ? MANCHETE.margem : 80
      linhas.push(`Slide de texto: margens de ${margem} px, conteúdo alinhado à ${variante === "c" ? "centro" : "esquerda"} a partir de ${tr.logoNoTopo ? 230 : 180} px do topo.`)
      linhas.push(T(`Título em ${titulo}, peso ${tr.tituloPeso}, ${tr.tituloCaixaAlta ? "CAIXA ALTA, " : ""}~${tr.logoNoTopo ? MANCHETE.titulo : 96} px`, t))
      if (tr.reguaSobCorpo && c) linhas.push(`- Entre o título e o corpo, uma régua horizontal curta (140×8 px) na cor de destaque ${doc.cores.destaque}.`)
      linhas.push(T(`Corpo em ${apoio}${tr.corpoItalico ? " itálico" : ""}, ~${tr.logoNoTopo ? MANCHETE.texto : 42} px, entrelinha ${tr.logoNoTopo ? "1,38" : "1,35"}`, c))
      if (variante !== "c") linhas.push(`- ${variante === "b" ? "Acima" : "Abaixo"} do texto, um card de cantos arredondados (${tr.raio} px) com a imagem da cena.`)
      // A caixa sólida é a assinatura da identidade: ela fecha o argumento
      // do slide, e sem descrevê-la o modelo desenha o retângulo vazio.
      const cx = tr.caixaDeDestaque ? texto(frame, "destaque") : ""
      if (cx) linhas.push(`- Abaixo de tudo, uma CAIXA SÓLIDA na cor ${doc.cores.destaque} (canto ${MANCHETE.destaqueRaio} px, respiro ${MANCHETE.destaquePadY}/${MANCHETE.destaquePadX} px) com o texto "${cx}" em branco, ~${MANCHETE.destaqueTexto} px.`)
    }
  }
  const destaque = notaDeDestaque(frame, ["titulo", "subtitulo", "corpo"], doc.cores.destaque ?? "#4E62D8")
  if (destaque) linhas.push(destaque)
  return linhas.filter(Boolean)
}

/**
 * Rodapé de marca + contador — quando a família desenha um.
 *
 * Vazio no cartão de perfil (a peça imita uma captura, e o rodapé da casa
 * é o que denuncia que não é uma) e barra no lugar do "N/M" nas famílias
 * que a declaram: pedir as duas coisas faria o modelo desenhar o número
 * duas vezes.
 */
function rodapeDeMarca(ctx: ContextoPrompt): string {
  const { doc, indice, total } = ctx
  const tr = tracoDe(familiaDe(doc))
  if (tr.cartaoPerfil) return ""
  const bk = doc.brandKit
  const oc = doc.ocultos
  const partes: string[] = []
  if (!oc.avatar && bk.avatar) partes.push("foto de perfil redonda")
  if (!oc.brandName && bk.brandName) partes.push(`"${bk.brandName}"`)
  if (!oc.brandName2 && bk.brandName2) partes.push(`"${bk.brandName2}"`)
  const esquerda = partes.length ? `à esquerda ${partes.join(", ")} em ${nomeDaFonte(tracoDe(familiaDe(doc)).fonteMeta)}` : "à esquerda nada"
  const direita = tr.barraProgresso
    ? `à direita uma barra de progresso fina com ${Math.round(((indice + 1) / Math.max(1, total)) * 100)}% preenchida e o contador "${indice + 1}/${total}" ao lado`
    : `à direita o contador "${indice + 1}/${total}"`
  return `Rodapé: ${esquerda}; ${direita}${!oc.copyright && bk.copyright ? ` e "${bk.copyright}"` : ""}, tudo pequeno (~26 px).`
}

function promptCompleto(ctx: ContextoPrompt): string {
  const { frame, doc, indice, total } = ctx
  const papel = ctx.papel ?? null
  const cena = cenaDoSlide(familiaDe(doc), papel, frame.tipo)
  const fam = FAMILIAS[familiaDe(doc)]
  const rodape = rodapeDeMarca(ctx)
  const tr = tracoDe(familiaDe(doc))
  // Só nas famílias em que a foto SANGRA o fundo é a própria fotografia.
  // No cartão de perfil a foto é um bloco recortado e o fundo continua
  // sendo o do slide — dizer o contrário faria o modelo cobrir o slide
  // inteiro com a imagem.
  const fotoDeFundo = !tr.cartaoPerfil && (frame.tipo === "capa" || frame.tipo === "prova" || frame.tipo === "cta")
  const fundo = fotoDeFundo
    ? "a fotografia descrita abaixo, escurecida"
    : `${descreverFundo(doc.fundoPorFrame[frame.frameId], doc.gradiente)} (identidade "${fam.nome}")`
  const linhas = [
    `Desenhe o slide ${indice + 1} de ${total} de um carrossel do Instagram, INTEIRO, ${dimensoes(doc.proporcaoExport)}${ctx.templateNome ? `, molde "${ctx.templateNome}"` : ""}.`,
    ``,
    `O texto abaixo entra EXATAMENTE como está escrito — em português, com os acentos, sem traduzir, resumir, corrigir ou acrescentar uma palavra. Se não couber, reduza o tamanho da fonte, nunca o texto.`,
    ``,
    ...anatomia(ctx),
    // O cartão de perfil já abre declarando o fundo da captura; repetir
    // aqui manda DUAS cores de fundo no mesmo prompt.
    ...(tr.cartaoPerfil ? [] : [`- Fundo: ${fundo}.`]),
    ...(rodape ? [`- ${rodape}`] : []),
    ``,
    `Imagem da cena: ${cena}. ${estiloDaCena(familiaDe(doc))} Paleta: ${paleta(doc.cores)}.`.replace(/\s+/g, " "),
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
