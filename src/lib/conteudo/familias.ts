/**
 * Famílias visuais do Estúdio — a "cara" do carrossel, separada da estrutura.
 *
 * O molde (Turbo, Benchmark…) decide a SEQUÊNCIA de slides; a família decide
 * como eles são desenhados: paleta, tipografia, forma do CTA, raio dos
 * cartões. Trocar de família não mexe em uma palavra da copy.
 *
 * `padrao` é a identidade azul da casa, que já existia. `editorial` é o
 * formato que o time mais gosta, medido slide a slide em
 * `docs/conteudo/formatos/editorial-convertfy.md`: fundo bege quente, tinta
 * marrom-preta, destaque marrom queimado, título em PAR (gancho em serif
 * itálica + afirmação em sans pesada) e pílula no lugar do botão sólido.
 *
 * Puro e testado: quem grava é a UI, quem desenha é o `frame.tsx`.
 */

import { CORES_PADRAO, GRADIENTE_PADRAO, SLIDE } from "./brand"
import { POST_CORES, type EstiloPost } from "./formato-post"
import { paletaDeUmaCor, tintaSobre, type Paleta } from "./paleta"
import type { Documento, FamiliaVisual, FrameTipo, Gradiente } from "./types"

export type { FamiliaVisual }

export const FAMILIA_PADRAO: FamiliaVisual = "padrao"

/** Como a família desenha; o renderer não tem constante própria. */
export interface TracoFamilia {
  fonteTitulo: string
  /** Serif itálica da linha de gancho (o "par" do título). */
  fonteGancho: string
  fonteCorpo: string
  fonteMeta: string
  /** Manuscrita da anotação à mão. */
  fonteAnotacao: string
  tituloCaixaAlta: boolean
  tituloPeso: number
  tituloTracking: string
  tituloEntrelinha: number
  /** O corpo é itálico serif (padrão) ou sans regular (editorial)? */
  corpoItalico: boolean
  /**
   * Botão sólido com sombra, pílula clara com borda, ou BLOCO: retângulo
   * sólido de canto quase reto com o texto condensado em caixa alta — o
   * "caixa azul" da identidade Neon, que é parte do desenho e não um botão
   * de interface.
   */
  cta: "botao" | "pilula" | "bloco"
  /**
   * Brilho em volta da foto, na cor de destaque, em px da base 1080 (0 =
   * sem brilho). É o que faz a imagem "acender" sobre o preto na Neon; nas
   * outras famílias a foto é chapada e o brilho seria enfeite.
   */
  brilhoImagem: number
  /**
   * Régua curta entre o título e o corpo nos slides de texto. Separa a
   * afirmação do argumento quando não há foto para fazer esse corte — é o
   * filete do slide de respiro da Neon.
   */
  reguaSobCorpo: boolean
  /**
   * A peça inteira é escura, com UM slide claro de respiro no meio. Não é
   * a alternância do Alternado (claro/escuro a cada passo): aqui o claro é
   * o corte único que dá fôlego antes do fecho, e o resto é bloco preto.
   */
  respiroClaro: boolean
  /**
   * Cada slide repete avatar + nome acima do título. É a assinatura das
   * famílias da casa; na Neon o rodapé de marca já carrega o handle, e
   * repeti-lo colado no título só duplica a mesma informação.
   */
  assinaturaNoSlide: boolean
  /** Raio do slot de imagem e dos cartões, na base 1080. */
  raio: number
  /** Inclinação da anotação manuscrita, em graus. */
  anotacaoRotacao: number
  /**
   * Quanto o gancho cresce sobre o tamanho base. Na Editorial ele é quase
   * do tamanho do título — as duas linhas formam UM par, e um gancho
   * pequeno vira legenda, que é outra coisa.
   */
  ganchoFator: number
  /** O gancho sai na tinta do texto ou na cor de destaque. */
  ganchoCor: "tinta" | "destaque"
  /** Filete de cor no topo de todo slide (a "accent bar" do Alternado). */
  barraTopo: boolean
  /**
   * Barra de progresso no rodapé no lugar do "N/M" solto. É o elemento que
   * diz, no primeiro slide, que existe um caminho até o fim — e por isso
   * ela substitui o contador, nunca convive com ele.
   */
  barraProgresso: boolean
  /**
   * A sequência alterna claro e escuro slide a slide. No `padrao` e na
   * `editorial` o fundo vem do TIPO do slide (capa/prova/CTA no gradiente);
   * aqui vem da POSIÇÃO, que é o que dá o ritmo do formato.
   */
  alternaFundo: boolean
  /**
   * O slide é um CARTÃO DE PERFIL (o print de tweet): avatar, nome com
   * selo, `@handle` e o texto embaixo — um desenho só, para todo tipo de
   * frame. Ligada, ela também tira o rodapé de marca, o contador e o
   * filete: a peça imita uma captura de tela, e enfeite da casa denuncia
   * que não é uma. Medidas em `formato-post.ts`.
   */
  cartaoPerfil: boolean
  /**
   * Qual dos dois desenhos do print de tweet a família usa. Só vale com
   * `cartaoPerfil`; as medidas moram em `formato-post.ts`.
   */
  estiloPost?: EstiloPost
}

export interface Familia {
  key: FamiliaVisual
  nome: string
  descricao: string
  /** Cores nomeadas do documento (`doc.cores`). */
  cores: Record<string, string>
  gradiente: Gradiente
  fundoClaro: string
  fundoEscuro: string
  cta: { fundo: string; cor: string }
  traco: TracoFamilia
}

const FONTE_CONDENSADA = "'Barlow Condensed', 'Inter Slides', Inter, sans-serif"
const FONTE_SERIF = "Georgia, 'Times New Roman', serif"
const FONTE_SANS = "'Inter Slides', Inter, -apple-system, BlinkMacSystemFont, sans-serif"
const FONTE_SERIF_DISPLAY = "'Instrument Serif', Georgia, 'Times New Roman', serif"
const FONTE_MANUSCRITA = "'Caveat', 'Segoe Script', cursive"
/**
 * A fonte de quem SIMULA um post é a da plataforma — pesquisada, não
 * escolhida por gosto.
 *
 * O X usa a **Chirp** (Grilli Type, 2021) e cai, quando ela não carrega,
 * nesta pilha exata: Segoe UI, Roboto, Helvetica, Arial, sans-serif. Chirp é
 * proprietária e não pode ser embarcada; **Inter** é o substituto livre
 * apontado em toda comparação séria — grotesca de tela, x-height alta,
 * proporções muito próximas. É também o que os aplicativos nativos entregam
 * na prática (SF Pro no iOS, Roboto no Android), todos grotescos.
 *
 * O primeiro desenho desta família usava Poppins, e isso era o defeito que
 * o usuário nomeou como "cara de feito com IA": Poppins é GEOMÉTRICA
 * (derivada de Futura) — `a` de um andar só, bojos circulares. Nenhuma
 * interface social usa geométrica no corpo do post, e esse `a` é o detalhe
 * que denuncia a peça como card de Canva em vez de captura de tela.
 *
 * Inter fica antes da pilha da plataforma porque a EXPORTAÇÃO precisa de
 * fonte determinística: com fonte de sistema o PNG mudaria de máquina para
 * máquina.
 */
const FONTE_POST = "'Inter Slides', Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
/**
 * O formato largo usa a MESMA pilha, e isso é o certo: os dois simulam a
 * mesma interface, e o que os separa é a métrica (margem, avatar,
 * entrelinha, colagem), não o tipo. A referência do largo foi capturada num
 * Windows, onde a pilha do X cai justamente em Segoe UI.
 */
const FONTE_POST_LARGO = FONTE_POST

/**
 * Paleta da identidade Neon.
 *
 * O preto não é `#000`: preto puro chapa e come o brilho da foto, que é o
 * elemento do formato. O claro não é `#FFF` pelo motivo simétrico — o
 * slide de respiro tem de parecer papel ao lado do bloco preto, não um
 * furo de luz.
 */
const NEON = {
  preto: "#0A0A0A",
  claro: "#F2F2F2",
  eletrico: "#3B5BFD",
  tinta: "#FFFFFF",
} as const

/**
 * A família Alternado inteira sai de UMA cor: é o que permite a mesma peça
 * ficar com a cara de cada cliente sem pedir sete campos de cor a quem só
 * sabe a cor do logo. A primária nunca vira fundo de texto — ela é accent,
 * filete do topo e preenchimento da barra de progresso.
 */
export const COR_PRIMARIA_PADRAO = "#2C6BED"

export function alternadoDaPaleta(p: Paleta): Omit<Familia, "key" | "nome" | "descricao"> {
  return {
    cores: {
      hook: tintaSobre(p.fundoClaro),
      destaque: p.primaria,
      metadado: "#8A8F98",
      "fundo-bloco": "#FFFFFF",
    },
    gradiente: p.gradiente,
    fundoClaro: p.fundoClaro,
    fundoEscuro: p.fundoEscuro,
    cta: { fundo: p.primaria, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_CONDENSADA,
      fonteGancho: FONTE_SERIF_DISPLAY,
      fonteCorpo: FONTE_SANS,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: true,
      tituloPeso: 800,
      tituloTracking: "-0.015em",
      tituloEntrelinha: 0.94,
      corpoItalico: false,
      cta: "botao",
      // Cartão de canto quase reto: o formato é editorial-técnico, e raio
      // grande o empurra para "app".
      raio: 12,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "destaque",
      barraTopo: true,
      barraProgresso: true,
      alternaFundo: true,
      cartaoPerfil: false,
      assinaturaNoSlide: true,
      brilhoImagem: 0,
      reguaSobCorpo: false,
      respiroClaro: false,
    },
  }
}

export const FAMILIAS: Record<FamiliaVisual, Familia> = {
  padrao: {
    key: "padrao",
    nome: "Convertfy",
    descricao: "Azul profundo, título condensado em caixa alta, apoio em serif itálica.",
    cores: { ...CORES_PADRAO },
    gradiente: { ...GRADIENTE_PADRAO },
    fundoClaro: SLIDE.fundoClaro,
    fundoEscuro: SLIDE.escuro,
    cta: { fundo: SLIDE.escuro, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_CONDENSADA,
      fonteGancho: FONTE_SERIF,
      fonteCorpo: FONTE_SERIF,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: true,
      tituloPeso: 800,
      tituloTracking: "-0.01em",
      tituloEntrelinha: 0.96,
      corpoItalico: true,
      cta: "botao",
      raio: 28,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "destaque",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: false,
      assinaturaNoSlide: true,
      brilhoImagem: 0,
      reguaSobCorpo: false,
      respiroClaro: false,
    },
  },
  editorial: {
    key: "editorial",
    nome: "Editorial",
    descricao: "Bege quente e tinta marrom; título em par (gancho itálico + afirmação) e pílula no lugar do botão.",
    cores: {
      hook: "#2A2320",
      destaque: "#8C5A2B",
      metadado: "#8A7A6A",
      "fundo-bloco": "#FBF9F6",
    },
    // O "escuro" da editorial é marrom torrado, não azul: o gradiente é o
    // fundo de capa, prova e CTA.
    gradiente: { de: "#4A3A30", meio: "#2A2320", ate: "#181310", angulo: 160 },
    fundoClaro: "#F1EBE3",
    fundoEscuro: "#2A2320",
    cta: { fundo: "#F7F3EE", cor: "#2A2320" },
    traco: {
      fonteTitulo: FONTE_SANS,
      fonteGancho: FONTE_SERIF_DISPLAY,
      fonteCorpo: FONTE_SANS,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      // A afirmação é sans pesada em caixa NORMAL — a caixa alta é o que
      // faz a peça parecer anúncio em vez de matéria.
      tituloCaixaAlta: false,
      tituloPeso: 800,
      tituloTracking: "-0.02em",
      tituloEntrelinha: 1.02,
      corpoItalico: false,
      cta: "pilula",
      raio: 24,
      anotacaoRotacao: -4,
      ganchoFator: 1.35,
      ganchoCor: "tinta",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: false,
      assinaturaNoSlide: true,
      brilhoImagem: 0,
      reguaSobCorpo: false,
      respiroClaro: false,
    },
  },
  alternado: {
    key: "alternado",
    nome: "Alternado",
    descricao: "Claro e escuro alternados, filete no topo e barra de progresso; paleta derivada de uma cor só.",
    ...alternadoDaPaleta(paletaDeUmaCor(COR_PRIMARIA_PADRAO)),
  },
  post: {
    key: "post",
    nome: "Post",
    descricao: "Print de tweet: fundo quase preto, avatar com nome e @handle, texto grande. Sem contador nem rodapé.",
    cores: {
      hook: POST_CORES.texto,
      destaque: POST_CORES.selo,
      metadado: POST_CORES.handle,
      "fundo-bloco": "#1A1A1A",
    },
    // O gradiente existe porque o tipo pede, mas o formato não o usa: todo
    // slide é o mesmo preto, que é o que faz os quatro parecerem a mesma
    // captura de tela.
    gradiente: { de: "#1A1A1A", meio: "#131313", ate: POST_CORES.fundo, angulo: 160 },
    fundoClaro: POST_CORES.fundo,
    fundoEscuro: POST_CORES.fundo,
    cta: { fundo: "#FFFFFF", cor: POST_CORES.fundo },
    traco: {
      fonteTitulo: FONTE_POST,
      fonteGancho: FONTE_POST,
      fonteCorpo: FONTE_POST,
      fonteMeta: FONTE_POST,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: false,
      tituloPeso: 700,
      tituloTracking: "0",
      tituloEntrelinha: 1.32,
      corpoItalico: false,
      cta: "pilula",
      raio: 10,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "tinta",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: true,
      assinaturaNoSlide: true,
      brilhoImagem: 0,
      reguaSobCorpo: false,
      respiroClaro: false,
      estiloPost: "post",
    },
  },
  "post-largo": {
    key: "post-largo",
    nome: "Post largo",
    descricao: "Print de post com margem estreita, fonte neutra e colagem de duas fotos — a cara de uma captura crua.",
    cores: {
      hook: POST_CORES.texto,
      destaque: POST_CORES.selo,
      metadado: POST_CORES.handle,
      "fundo-bloco": "#1A1A1A",
    },
    gradiente: { de: "#151515", meio: "#101010", ate: POST_CORES.fundo, angulo: 160 },
    fundoClaro: POST_CORES.fundo,
    fundoEscuro: POST_CORES.fundo,
    cta: { fundo: "#FFFFFF", cor: POST_CORES.fundo },
    traco: {
      fonteTitulo: FONTE_POST_LARGO,
      fonteGancho: FONTE_POST_LARGO,
      fonteCorpo: FONTE_POST_LARGO,
      fonteMeta: FONTE_POST_LARGO,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: false,
      tituloPeso: 700,
      tituloTracking: "0",
      tituloEntrelinha: 1.37,
      corpoItalico: false,
      cta: "pilula",
      raio: 15,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "tinta",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: true,
      assinaturaNoSlide: true,
      brilhoImagem: 0,
      reguaSobCorpo: false,
      respiroClaro: false,
      estiloPost: "post-largo",
    },
  },
  neon: {
    key: "neon",
    nome: "Neon",
    descricao: "Bloco preto, título condensado em caixa alta alternando azul elétrico e branco, foto com brilho e caixa sólida no fecho.",
    cores: {
      // `hook` é a TINTA sobre o claro (no escuro o renderer usa branco).
      // Com branco aqui, o título do slide de respiro sumia no fundo claro
      // — o mesmo defeito que a Alternado pagou, achado renderizando.
      hook: NEON.preto,
      destaque: NEON.eletrico,
      apoio: "#2E2E2E",
      metadado: "#8A8A8A",
      "fundo-bloco": "#141414",
    },
    // Um azul muito escuro entrando no preto: é o fundo da capa quando
    // alguém pede gradiente, e continua lendo como bloco preto de longe.
    gradiente: { de: "#0E1330", meio: "#080A18", ate: NEON.preto, angulo: 165 },
    // O CLARO aqui é o slide de respiro, não o fundo dominante — quem
    // decide o ritmo é `respiroClaro` em `fundoPadraoDaFamilia`.
    fundoClaro: NEON.claro,
    fundoEscuro: NEON.preto,
    cta: { fundo: NEON.eletrico, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_CONDENSADA,
      fonteGancho: FONTE_SANS,
      fonteCorpo: FONTE_SANS,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: true,
      // Mais pesada e mais fechada que a da casa: o título é um bloco de
      // massa, e é o espaço APERTADO entre as linhas que faz a massa.
      tituloPeso: 800,
      tituloTracking: "-0.005em",
      tituloEntrelinha: 0.88,
      corpoItalico: false,
      cta: "bloco",
      // Canto arredondado da foto, não do cartão: a peça é chapada e o
      // único elemento com raio é a imagem.
      raio: 28,
      anotacaoRotacao: -3,
      ganchoFator: 0.9,
      ganchoCor: "destaque",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: false,
      assinaturaNoSlide: false,
      brilhoImagem: 90,
      reguaSobCorpo: true,
      respiroClaro: true,
    },
  },
}

export const FAMILIA_OPCOES: Array<[FamiliaVisual, string]> = [
  ["padrao", FAMILIAS.padrao.nome],
  ["editorial", FAMILIAS.editorial.nome],
  ["alternado", FAMILIAS.alternado.nome],
  ["post", FAMILIAS.post.nome],
  ["post-largo", FAMILIAS["post-largo"].nome],
  ["neon", FAMILIAS.neon.nome],
]

export function ehFamilia(v: unknown): v is FamiliaVisual {
  return v === "padrao" || v === "editorial" || v === "alternado" || v === "post" || v === "post-largo" || v === "neon"
}

export function familiaDe(doc: Pick<Documento, "familia">): FamiliaVisual {
  return ehFamilia(doc.familia) ? doc.familia : FAMILIA_PADRAO
}

export function tracoDe(familia: FamiliaVisual): TracoFamilia {
  return FAMILIAS[familia].traco
}

/**
 * Fundo padrão de um frame na família.
 *
 * Nas famílias sem alternância, o fundo vem do TIPO do slide: capa, prova e
 * CTA no gradiente, o resto claro com um escuro de três em três.
 *
 * Na Alternado ele vem da POSIÇÃO, que é o ritmo do formato: capa,
 * escuro, claro, escuro, claro… O CTA fecha no CLARO (é onde a caixa da
 * palavra tem contraste) e o slide ANTES dele vai no gradiente — o
 * respiro de cor antes da chamada. Sem saber o total não dá para achar
 * esse penúltimo, e aí ele simplesmente não acontece: alternância certa
 * vale mais que um gradiente no slide errado.
 */
export function fundoPadraoDaFamilia(
  familia: FamiliaVisual,
  tipo: FrameTipo,
  indice: number,
  total?: number,
): string {
  const f = FAMILIAS[familia]
  // No print de tweet TODO slide tem o mesmo preto: é isso que faz os
  // quatro parecerem capturas da mesma tela. Gradiente na capa quebraria a
  // ilusão no primeiro slide.
  if (f.traco.cartaoPerfil) return f.fundoClaro
  // Neon: bloco preto do começo ao fim, com UM slide claro de respiro no
  // meio. Sem saber o total não dá para achar o meio — e aí a peça fica
  // toda escura, que é o certo: inventar a posição do respiro colocaria o
  // corte no lugar errado, e um corte no lugar errado é pior que nenhum.
  if (f.traco.respiroClaro) {
    if (total !== undefined && total >= 4 && indice === Math.floor(total / 2)) return f.fundoClaro
    return f.fundoEscuro
  }
  if (f.traco.alternaFundo) {
    if (tipo === "capa") return "gradiente"
    if (tipo === "cta") return f.fundoClaro
    if (total !== undefined && total >= 3 && indice === total - 2) return "gradiente"
    return indice % 2 === 1 ? f.fundoEscuro : f.fundoClaro
  }
  if (tipo === "capa" || tipo === "cta" || tipo === "prova") return "gradiente"
  return indice % 3 === 0 ? f.fundoEscuro : f.fundoClaro
}

/**
 * Reaplica o ritmo de fundos da família que ALTERNA.
 *
 * Na Alternado o fundo é função da POSIÇÃO. Quem insere um slide no meio
 * desloca todos os seguintes, e sem recalcular a peça fica com dois
 * escuros colados e o gradiente no slide errado — o ritmo, que é a
 * identidade do formato, some no primeiro slide adicionado.
 *
 * Só o que ainda está num valor PADRÃO da família é recalculado: fundo
 * pintado à mão continua onde o usuário pôs. Nas outras famílias devolve
 * o documento intocado (o fundo lá vem do tipo, não da posição), e a
 * comparação por referência evita re-render à toa.
 */
export function ritmoDeFundos(doc: Documento): Documento {
  const fam = familiaDe(doc)
  const f = FAMILIAS[fam]
  // Vale para toda família cujo fundo é função da POSIÇÃO — a alternância
  // do Alternado e o respiro único da Neon. Inserir um slide no meio
  // desloca os seguintes nas duas.
  if (!f.traco.alternaFundo && !f.traco.respiroClaro) return doc

  const ehPadrao = (v: string) => v === f.fundoClaro || v === f.fundoEscuro || v === "gradiente"
  let mudou = false
  const fundoPorFrame: Record<string, string> = { ...doc.fundoPorFrame }
  doc.frames.forEach((fr, i) => {
    const atual = doc.fundoPorFrame[fr.frameId]
    if (atual !== undefined && !ehPadrao(atual)) return
    const alvo = fundoPadraoDaFamilia(fam, fr.tipo, i, doc.frames.length)
    if (alvo !== atual) {
      fundoPorFrame[fr.frameId] = alvo
      mudou = true
    }
  })
  return mudou ? { ...doc, fundoPorFrame } : doc
}

/** A cor de onde a paleta da Alternado é derivada neste documento. */
export function corPrimariaDe(doc: Pick<Documento, "corPrimaria">): string {
  return doc.corPrimaria ?? COR_PRIMARIA_PADRAO
}

/**
 * Troca a cor da marca (família Alternado): tudo que ainda é derivado da
 * cor ANTERIOR passa a ser derivado da nova; o que o usuário escolheu a
 * dedo fica. Sem `doc.corPrimaria` gravada não haveria como saber o que
 * era derivado na segunda troca — daí o campo existir.
 */
export function aplicarCorPrimaria(doc: Documento, cor: string): Documento {
  const de = alternadoDaPaleta(paletaDeUmaCor(corPrimariaDe(doc)))
  const p = paletaDeUmaCor(cor)
  const para = alternadoDaPaleta(p)

  const cores: Record<string, string> = { ...doc.cores }
  for (const [chave, valorNovo] of Object.entries(para.cores)) {
    if (doc.cores[chave] === undefined || doc.cores[chave] === de.cores[chave]) cores[chave] = valorNovo
  }

  const gradiente = mesmoGradiente(doc.gradiente, de.gradiente)
    ? { ...para.gradiente, angulo: doc.gradiente.angulo }
    : doc.gradiente

  const fundoPorFrame: Record<string, string> = {}
  for (const [id, valor] of Object.entries(doc.fundoPorFrame)) {
    fundoPorFrame[id] = valor === de.fundoClaro ? para.fundoClaro : valor === de.fundoEscuro ? para.fundoEscuro : valor
  }

  const cta =
    doc.cta.fundo === de.cta.fundo && doc.cta.cor === de.cta.cor
      ? { ...doc.cta, fundo: para.cta.fundo, cor: para.cta.cor }
      : doc.cta

  return { ...doc, corPrimaria: p.primaria, cores, gradiente, fundoPorFrame, cta }
}

const mesmoGradiente = (a: Gradiente, b: Gradiente): boolean => a.de === b.de && a.meio === b.meio && a.ate === b.ate

/**
 * Troca a família preservando o que o usuário mexeu à mão.
 *
 * Só o valor que ainda é o DEFAULT da família atual é substituído pelo
 * equivalente da nova. Cor escolhida a dedo, fundo trocado num slide e CTA
 * repintado sobrevivem à troca — a família é uma base, não um rolo de tinta.
 * O ângulo do gradiente é do usuário (ele o edita num slider) e nunca muda.
 */
export function aplicarFamilia(doc: Documento, nova: FamiliaVisual): Documento {
  const atual = familiaDe(doc)
  if (atual === nova) return { ...doc, familia: nova }
  const de = FAMILIAS[atual]
  const para = FAMILIAS[nova]

  const cores: Record<string, string> = { ...doc.cores }
  for (const [chave, valorNovo] of Object.entries(para.cores)) {
    if (doc.cores[chave] === undefined || doc.cores[chave] === de.cores[chave]) cores[chave] = valorNovo
  }
  // Cor que só a família ANTERIOR declara tem de SAIR, senão ela sobrevive
  // à troca e pinta na identidade seguinte: o `apoio` cinza da Neon ficaria
  // no corpo dos slides claros da casa, sem ninguém ter escolhido isso.
  // Só o que ainda é o padrão da antiga — cor posta à mão continua.
  for (const [chave, valorAntigo] of Object.entries(de.cores)) {
    if (para.cores[chave] === undefined && doc.cores[chave] === valorAntigo) delete cores[chave]
  }

  const gradiente = mesmoGradiente(doc.gradiente, de.gradiente) ? { ...para.gradiente, angulo: doc.gradiente.angulo } : doc.gradiente

  // O fundo escolhido a dedo sobrevive; o que ainda é padrão da família
  // antiga vira o padrão da nova. Quando a alternância entra ou sai de
  // cena, "o padrão da nova" depende da POSIÇÃO — daí recalcular pela
  // lista de frames em vez de trocar cor por cor.
  // Recalcular também ao entrar ou sair do print de tweet: lá o fundo é o
  // MESMO preto em todo slide, e trocar cor por cor deixaria o "gradiente"
  // da capa intacto — o degradê sutil que denuncia que não é uma captura.
  const recalcula = de.traco.alternaFundo !== para.traco.alternaFundo || de.traco.cartaoPerfil !== para.traco.cartaoPerfil || de.traco.respiroClaro !== para.traco.respiroClaro
  const ehPadraoDaAntiga = (v: string) => v === de.fundoClaro || v === de.fundoEscuro || v === "gradiente"
  const fundoPorFrame: Record<string, string> = { ...doc.fundoPorFrame }
  doc.frames.forEach((f, i) => {
    const valor = doc.fundoPorFrame[f.frameId]
    if (valor === undefined) return
    if (recalcula) {
      if (ehPadraoDaAntiga(valor)) fundoPorFrame[f.frameId] = fundoPadraoDaFamilia(nova, f.tipo, i, doc.frames.length)
      return
    }
    fundoPorFrame[f.frameId] = valor === de.fundoClaro ? para.fundoClaro : valor === de.fundoEscuro ? para.fundoEscuro : valor
  })

  const cta =
    doc.cta.fundo === de.cta.fundo && doc.cta.cor === de.cta.cor
      ? { ...doc.cta, fundo: para.cta.fundo, cor: para.cta.cor }
      : doc.cta

  return { ...doc, familia: nova, cores, gradiente, fundoPorFrame, cta }
}
