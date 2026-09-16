/**
 * Famílias visuais do Estúdio — a "cara" do carrossel, separada da estrutura.
 *
 * O molde (Print de post, Tese em manchete…) decide a SEQUÊNCIA de slides; a
 * família decide
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
import { THREAD_CORES } from "./formato-thread"
import { MANCHETE_CORES } from "./formato-manchete"
import { paletaDeUmaCor, tintaSobre, type Paleta } from "./paleta"
import type { Documento, FamiliaVisual, FrameTipo, Gradiente } from "./types"
import { camposDaIdentidade, reconciliarCampos } from "./campos-da-identidade"

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
   * "caixa azul" da identidade Manchete, que é parte do desenho e não um
   * botão de interface.
   */
  cta: "botao" | "pilula" | "bloco"
  /**
   * Régua curta entre o título e o corpo nos slides de texto. Separa a
   * afirmação do argumento quando não há foto para fazer esse corte.
   */
  reguaSobCorpo: boolean
  /**
   * A peça inteira é CLARA, com a capa escura e UM escuro no meio. Não é a
   * alternância do Alternado (claro/escuro a cada passo): aqui o preto
   * marca a tensão (o slide do problema) e o branco carrega o argumento.
   * Lido dos cinco slides da referência da Manchete.
   */
  respiroEscuro: boolean
  /**
   * O título quebrado em linhas sai em ESCADA decrescente, e **só na
   * capa**: na referência o slide preto da pergunta tem as duas linhas do
   * mesmo corpo. A escada é o gesto de ABRIR a peça, não um traço do fundo
   * escuro — amarrá-la ao fundo (a primeira versão) errava o slide do
   * problema.
   */
  escadaNoTitulo: boolean
  /**
   * Retângulo sólido na cor de destaque com o texto do campo `destaque`
   * dentro. Não é o CTA: é o callout no meio da peça, e sem esta flag o
   * campo nem é oferecido no painel.
   */
  caixaDeDestaque: boolean
  /**
   * O TÍTULO não sai na tinta do corpo: no fundo claro ele usa a cor de
   * destaque e no escuro o creme. Medido na referência da Manchete, onde o
   * título do slide do erro é um bloco AZUL que ocupa um terço da peça —
   * com a tinta do corpo ele saía preto e a peça deixava de ser a mesma.
   */
  tituloDestacado: boolean
  /**
   * Só o ÍCONE da marca, pequeno, no topo — sem nome e sem `@handle`. É o
   * que a Manchete usa no lugar da assinatura completa; sem avatar no
   * brand kit nada é desenhado, porque inventar marca é pior que o vazio.
   */
  logoNoTopo: boolean
  /**
   * Cada slide repete avatar + nome acima do título. É a assinatura das
   * famílias da casa; na Manchete quem carrega a marca é o `logoNoTopo`, e
   * repetir o nome colado no título só duplica a mesma informação.
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
  /**
   * O slide é um CARTÃO DE THREAD: barra de metadados no topo, bloco de
   * autoria e um FIO de parágrafos com foto no meio. É primo do
   * `cartaoPerfil` (os dois simulam a mesma rede) e igualmente exclusivo
   * com ele — um slide não pode ser captura de post E peça editorial ao
   * mesmo tempo. Medidas em `formato-thread.ts`.
   */
  cartaoThread: boolean
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
      cartaoThread: false,
      assinaturaNoSlide: true,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
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
      cartaoThread: false,
      assinaturaNoSlide: true,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
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
      cartaoThread: false,
      assinaturaNoSlide: true,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
    },
  },
  alternado: {
    key: "alternado",
    nome: "Alternado",
    descricao: "Claro e escuro alternados, filete no topo e barra de progresso; paleta derivada de uma cor só.",
    ...alternadoDaPaleta(paletaDeUmaCor(COR_PRIMARIA_PADRAO)),
  },
  thread: {
    key: "thread",
    nome: "Thread",
    descricao: "Cartão de thread: barra de metadados no topo, autoria com avatar e um fio de parágrafos com foto no meio. Fecho preto.",
    cores: {
      hook: THREAD_CORES.tinta,
      destaque: THREAD_CORES.tinta,
      metadado: THREAD_CORES.metadado,
      "fundo-bloco": "#F1F2F4",
    },
    // Como na `post`, o gradiente existe porque o tipo pede e o formato
    // não o usa: o cartão é branco chapado e o fecho é preto chapado.
    gradiente: { de: THREAD_CORES.cartao, meio: THREAD_CORES.cartao, ate: THREAD_CORES.cartao, angulo: 160 },
    fundoClaro: THREAD_CORES.cartao,
    fundoEscuro: THREAD_CORES.preto,
    cta: { fundo: THREAD_CORES.preto, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_POST,
      fonteGancho: FONTE_POST,
      fonteCorpo: FONTE_POST,
      fonteMeta: FONTE_POST,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: false,
      tituloPeso: 700,
      tituloTracking: "-0.01em",
      tituloEntrelinha: 1.28,
      corpoItalico: false,
      cta: "pilula",
      raio: 10,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "tinta",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: false,
      cartaoThread: true,
      assinaturaNoSlide: false,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
    },
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
      cartaoThread: false,
      assinaturaNoSlide: true,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
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
      cartaoThread: false,
      assinaturaNoSlide: true,
      reguaSobCorpo: false,
      respiroEscuro: false,
      escadaNoTitulo: false,
      caixaDeDestaque: false,
      tituloDestacado: false,
      logoNoTopo: false,
      estiloPost: "post-largo",
    },
  },
  manchete: {
    key: "manchete",
    nome: "Manchete",
    descricao: "Título condensado em caixa alta, azul elétrico como acento e caixa sólida de destaque. Peça clara com a capa e o slide do problema em preto.",
    cores: {
      // `hook` é a TINTA sobre o claro (no escuro o renderer usa branco).
      hook: MANCHETE_CORES.tinta,
      destaque: MANCHETE_CORES.azul,
      apoio: MANCHETE_CORES.tinta,
      metadado: "#8A8A8A",
      "fundo-bloco": "#F2F2F2",
    },
    // A capa da referência é FOTO, não degradê. Este gradiente existe só
    // para quem pedir "gradiente" num slide: um azul muito escuro entrando
    // no preto, que de longe continua lendo como bloco preto.
    gradiente: { de: "#0E1330", meio: "#080A18", ate: MANCHETE_CORES.preto, angulo: 165 },
    fundoClaro: MANCHETE_CORES.claro,
    fundoEscuro: MANCHETE_CORES.preto,
    cta: { fundo: MANCHETE_CORES.azul, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_CONDENSADA,
      fonteGancho: FONTE_SANS,
      fonteCorpo: FONTE_SANS,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: true,
      // Pesada e fechada: o título é a massa da peça, e o que faz a massa
      // é o espaço APERTADO entre as linhas.
      tituloPeso: 800,
      tituloTracking: "-0.01em",
      tituloEntrelinha: 0.92,
      corpoItalico: false,
      // A caixa sólida do fecho é o MESMO elemento do callout do meio —
      // um retângulo de canto quase reto, não um botão de interface.
      cta: "bloco",
      // Só a foto tem canto redondo; o resto da peça é chapado.
      raio: 18,
      anotacaoRotacao: -3,
      ganchoFator: 0.9,
      ganchoCor: "destaque",
      barraTopo: false,
      barraProgresso: false,
      alternaFundo: false,
      cartaoPerfil: false,
      cartaoThread: false,
      // O ícone pequeno no topo substitui a assinatura completa: a peça
      // parece um editorial, e avatar com nome e handle a devolveria para
      // a cara de post de rede social.
      assinaturaNoSlide: false,
      logoNoTopo: true,
      reguaSobCorpo: false,
      respiroEscuro: true,
      escadaNoTitulo: true,
      caixaDeDestaque: true,
      tituloDestacado: true,
    },
  },
}

/**
 * As identidades que o seletor oferece — derivadas de `FAMILIAS`, na ordem
 * em que elas são declaradas lá.
 *
 * Era a TERCEIRA lista escrita à mão da mesma família de defeito (as outras
 * duas: `ehFamilia` e o `recalcula` de `aplicarFamilia`). Aqui o preço era
 * peculiar: a identidade nova existia no tipo, no mapa e no molde — a peça
 * nascia certa ao escolher o molde — e simplesmente **não podia ser
 * escolhida** em Marca → Identidade visual nem no diálogo de criação, sem
 * erro nenhum e sem nada na tela dizendo que faltava uma opção.
 */
export const FAMILIA_OPCOES: Array<[FamiliaVisual, string]> = (Object.keys(FAMILIAS) as FamiliaVisual[]).map((k) => [k, FAMILIAS[k].nome])

/**
 * Deriva de `FAMILIAS`, nunca de uma lista escrita à mão.
 *
 * A versão anterior enumerava os nomes num `||` encadeado, e uma família
 * nova ficava de fora dele: `familiaDe` caía no padrão **em silêncio**, o
 * documento nascia com a identidade errada e nada em teste ou tela dizia
 * por quê. Foi o que aconteceu ao acrescentar a Thread, que já existia no
 * tipo, no mapa e no molde.
 */
export function ehFamilia(v: unknown): v is FamiliaVisual {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FAMILIAS, v)
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
  // Cartão de thread: todo slide é o MESMO branco — é o que faz os oito
  // parecerem a mesma peça — e o FECHO é preto. Na referência ele é o
  // único slide escuro, e é o contraste que o marca como fim do fio.
  if (f.traco.cartaoThread) return tipo === "cta" ? f.fundoEscuro : f.fundoClaro
  // Manchete: peça CLARA com a capa preta e UM preto no meio — o slide do
  // problema, onde a tensão mora. Lido dos cinco slides da referência.
  // Sem saber o total não dá para achar o meio, e aí só a capa é escura:
  // inventar a posição do corte o põe no slide errado, e um corte no lugar
  // errado é pior que nenhum.
  if (f.traco.respiroEscuro) {
    if (indice === 0) return f.fundoEscuro
    if (total !== undefined && total >= 4 && indice === Math.floor(total / 2)) return f.fundoEscuro
    return f.fundoClaro
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
  // do Alternado e o corte único da Manchete. Inserir um slide no meio
  // desloca os seguintes nas duas.
  if (!f.traco.alternaFundo && !f.traco.respiroEscuro) return doc

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
  // à troca e pinta na identidade seguinte: uma cor de apoio que só a
  // família anterior declarava ficaria
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
  // Quem decide se recalcula é o RESULTADO, não uma lista de traços.
  // A versão anterior enumerava `alternaFundo`/`cartaoPerfil`/
  // `respiroEscuro`, e uma família nova ficava de fora dela: o cartão de
  // thread herdava o "gradiente" que a casa põe na capa e no fecho, então
  // o fecho preto da referência nascia BRANCO com texto branco — invisível,
  // sem erro nenhum. Comparar os dois padrões não tem como envelhecer.
  const fundoPorFrame: Record<string, string> = { ...doc.fundoPorFrame }
  doc.frames.forEach((f, i) => {
    const valor = doc.fundoPorFrame[f.frameId]
    if (valor === undefined) return
    const padraoAntigo = fundoPadraoDaFamilia(atual, f.tipo, i, doc.frames.length)
    const padraoNovo = fundoPadraoDaFamilia(nova, f.tipo, i, doc.frames.length)
    // Fundo que ainda é o padrão da antiga vira o padrão da nova.
    if (valor === padraoAntigo) {
      fundoPorFrame[f.frameId] = padraoNovo
      return
    }
    // Fora do padrão POSICIONAL, a cor chapada ainda pode ser a paleta da
    // antiga (documento montado por outro caminho): claro vira claro,
    // escuro vira escuro. O que não é nem um nem outro foi pintado à mão
    // e continua onde o usuário o pôs.
    fundoPorFrame[f.frameId] = valor === de.fundoClaro ? para.fundoClaro : valor === de.fundoEscuro ? para.fundoEscuro : valor
  })

  const cta =
    doc.cta.fundo === de.cta.fundo && doc.cta.cor === de.cta.cor
      ? { ...doc.cta, fundo: para.cta.fundo, cor: para.cta.cor }
      : doc.cta

  // O conjunto de CAMPOS também é da identidade: o cartão de perfil desenha
  // título e corpo, a casa desenha o conjunto do tipo (capa com subtítulo,
  // CTA com botão). Sem reconciliar, trocar de identidade deixava o
  // parágrafo num campo que a nova não desenha — presente no documento,
  // invisível na tela, sem erro nenhum. A migração é simétrica: voltar à
  // identidade anterior devolve o texto ao campo de origem.
  // A caixa de destaque entra na mesma conta: ela é opcional e só UMA
  // família a desenha, então trocar de identidade pode ter de tirá-la (ou
  // devolvê-la) mesmo quando o cartão de perfil não muda.
  const desenho = { caixaDeDestaque: para.traco.caixaDeDestaque }
  const mesmoConjunto =
    de.traco.cartaoPerfil === para.traco.cartaoPerfil && de.traco.cartaoThread === para.traco.cartaoThread && de.traco.caixaDeDestaque === para.traco.caixaDeDestaque
  const frames = mesmoConjunto
    ? doc.frames
    : doc.frames.map((f) => ({ ...f, ...reconciliarCampos(f, camposDaIdentidade(para.traco, f.tipo), desenho) }))

  return { ...doc, familia: nova, cores, gradiente, fundoPorFrame, cta, frames }
}
