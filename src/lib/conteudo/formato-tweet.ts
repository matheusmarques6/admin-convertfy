/**
 * Família "Card do X" — o cartão COMPLETO, não o recorte.
 *
 * As duas famílias de print (`post` e `post-largo`) reproduzem uma CAPTURA
 * recortada: cabeçalho, texto e foto, sem moldura, sem hora e sem
 * contadores. Esta reproduz o cartão INTEIRO — a borda, o logo do X no
 * canto, a linha de `hora · data · visualizações` e a barra de contadores —
 * porque é isso que faz a peça ser lida como "um post do X" e não como um
 * card de citação.
 *
 * **A proporção é a da especificação pública**, não medida a olho. O embed
 * oficial (`react-tweet`, o que o componente Tweet do Spell UI usa por
 * baixo) declara suas medidas em `twitter-theme/theme.css` e nos módulos de
 * cada peça; foram lidas do pacote, e todo valor daqui é
 * `medida_do_embed × FATOR_DO_EMBED`. Guardar o número já convertido é o que
 * permite conferir a peça contra a especificação sem refazer a conta.
 *
 * | item                        | embed | base 1080 |
 * |-----------------------------|-------|-----------|
 * | largura do cartão           |   550 |      1000 |
 * | raio do cartão              |    12 |        22 |
 * | recuo lateral do conteúdo   |    16 |        29 |
 * | recuo vertical do conteúdo  |    12 |        22 |
 * | avatar ⌀                    |    48 |        87 |
 * | nome e `@handle`            |    15 |        27 |
 * | logo do X                   | 23,75 |        43 |
 * | texto do post               |    20 |        36 |
 * | entrelinha do texto         |    24 |     (1,20) |
 * | foto: recuo do topo e raio  |    12 |        22 |
 * | vão da colagem              |     2 |         4 |
 * | linha de hora/data          |    15 |        27 |
 * | contadores                  |    14 |        25 |
 * | ícone do contador           |  17,5 |        32 |
 *
 * **O que NÃO vem do embed**: a barra de baixo. O embed tem os botões dele
 * (Curtir · Responder · Copiar link); o aplicativo do X tem a fileira de
 * MÉTRICAS — resposta, repost, curtida, visualização, salvar, compartilhar
 * — distribuída na largura. Quem tira print de um post vê a segunda, e é a
 * segunda que tem número para o operador editar. A tipografia continua a do
 * embed, que é o mesmo sistema de design.
 *
 * **Nenhum contador nasce preenchido.** Um cartão sem número é o que o X
 * mostra num post recém-publicado, e é o único estado honesto: número
 * semeado por nós seria engajamento inventado impresso na peça. Quem
 * escreve é o operador, no painel — foi exatamente o que ele pediu poder
 * editar.
 *
 * Puro e testado: quem desenha é o `frame.tsx`, que não tem medida própria.
 */

import type { Campo, FrameTipo, TweetMeta } from "./types"

/** Largura do cartão no embed oficial (`tweet-container.module.css`). */
export const LARGURA_DO_EMBED = 550

/**
 * Largura do cartão na base do canvas (1080), com 40px de folga de cada
 * lado. A folga existe para o cartão LER como cartão: sangrando até a borda
 * ele vira o fundo do slide e a moldura desaparece.
 */
export const LARGURA_DO_CARTAO = 1000

export const FATOR_DO_EMBED = LARGURA_DO_CARTAO / LARGURA_DO_EMBED

/** Medida do embed (550 de largura) na base do canvas (1080). */
export function doEmbed(px: number): number {
  return Math.round(px * FATOR_DO_EMBED)
}

export interface MedidasTweet {
  /** Folga entre a borda do slide e o cartão. */
  margemDoSlide: number
  larguraDoCartao: number
  raioCartao: number
  /** Espessura da moldura — é ela que separa o cartão do fundo. */
  borda: number
  recuoLateral: number
  recuoVertical: number
  avatar: number
  /** Espaço entre o avatar e o bloco nome/`@handle`. */
  gapAutor: number
  /** Corpo do nome e do `@handle` (os dois têm o mesmo tamanho no X). */
  cabecalho: number
  cabecalhoEntrelinha: number
  /** Espaço entre o cabeçalho e o texto. */
  gapCabecalho: number
  selo: number
  logo: number
  texto: number
  textoEntrelinha: number
  /** Espaço entre o primeiro e o segundo parágrafo. */
  gapParagrafo: number
  gapImagem: number
  raioImagem: number
  gapGaleria: number
  /** Altura da área de foto quando o slide tem imagem. */
  alturaImagem: number
  info: number
  infoEntrelinha: number
  gapInfo: number
  contador: number
  contadorEntrelinha: number
  /** Espaço entre a linha de info e o filete da barra de contadores. */
  gapBarra: number
  /** Espaço entre o filete e os ícones. */
  recuoBarra: number
  iconeContador: number
  /** Espaço entre o ícone e o número. */
  gapIcone: number
}

export const TWEET: MedidasTweet = {
  margemDoSlide: (1080 - LARGURA_DO_CARTAO) / 2,
  larguraDoCartao: LARGURA_DO_CARTAO,
  raioCartao: doEmbed(12),
  borda: doEmbed(1),
  recuoLateral: doEmbed(16),
  recuoVertical: doEmbed(12),
  avatar: doEmbed(48),
  gapAutor: doEmbed(8),
  cabecalho: doEmbed(15),
  cabecalhoEntrelinha: 20 / 15,
  gapCabecalho: doEmbed(12),
  selo: doEmbed(18),
  logo: doEmbed(23.75),
  texto: doEmbed(20),
  textoEntrelinha: 24 / 20,
  gapParagrafo: doEmbed(20),
  gapImagem: doEmbed(12),
  raioImagem: doEmbed(12),
  gapGaleria: doEmbed(2),
  // 16:9 sobre a largura INTERNA do cartão — a proporção que o X entrega
  // no feed. Calculada em vez de escrita: mudar o recuo lateral sem mudar
  // esta linha deixaria a foto fora de proporção, e ninguém perceberia.
  alturaImagem: Math.round(((LARGURA_DO_CARTAO - 2 * doEmbed(16)) * 9) / 16),
  info: doEmbed(15),
  infoEntrelinha: 20 / 15,
  gapInfo: doEmbed(12),
  contador: doEmbed(14),
  contadorEntrelinha: 16 / 14,
  gapBarra: doEmbed(12),
  recuoBarra: doEmbed(12),
  iconeContador: doEmbed(17.5),
  gapIcone: doEmbed(6),
}

/**
 * Os contadores da barra, na ordem do aplicativo.
 *
 * Os cinco saem em CINZA e em contorno. No X, ícone colorido e preenchido
 * é o estado "eu interagi com este post" — rosa se eu curti, verde se eu
 * repostei —, não "o post tem muita curtida". A primeira versão pintava o
 * coração assim que um número era digitado, o que conflata as duas coisas;
 * o print que a peça imita é o de um post de terceiro, e nele os cinco
 * ficam neutros.
 */
export type ContadorDoTweet = "respostas" | "reposts" | "curtidas" | "visualizacoes" | "salvos"

export const CONTADORES: ContadorDoTweet[] = ["respostas", "reposts", "curtidas", "visualizacoes", "salvos"]

export const CONTADOR_LABEL: Record<ContadorDoTweet, string> = {
  respostas: "Respostas",
  reposts: "Reposts",
  curtidas: "Curtidas",
  visualizacoes: "Visualizações",
  salvos: "Salvos",
}

/** Exemplo mostrado no campo vazio — nunca gravado. */
export const CONTADOR_EXEMPLO: Record<ContadorDoTweet, string> = {
  respostas: "128",
  reposts: "1.204",
  curtidas: "8.932",
  visualizacoes: "412 mil",
  salvos: "312",
}

export interface LinhaDeContador {
  chave: ContadorDoTweet
  /** O que o renderer escreve; vazio = só o ícone, como num post novo. */
  valor: string
}

/**
 * A barra de contadores deste slide.
 *
 * Contador vazio entra com valor vazio em vez de sair da barra: no X os
 * cinco ícones estão sempre lá, e tirar um mudaria o espaçamento dos
 * outros — a barra deixaria de ser a do X justamente no slide sem número.
 */
export function contadoresDoTweet(meta: TweetMeta | undefined): LinhaDeContador[] {
  return CONTADORES.map((chave) => ({ chave, valor: (meta?.[chave] ?? "").trim() }))
}

export interface LinhaDeInfo {
  hora: string
  data: string
  visualizacoes: string
  /** Nada preenchido ⇒ a linha inteira sai do cartão. */
  vazia: boolean
}

/**
 * A linha `hora · data · N visualizações`.
 *
 * Cada pedaço é independente: quem preencher só a data recebe só a data,
 * sem o separador solto. Vazia por inteiro, a linha não é desenhada — um
 * "·" sozinho no meio do cartão é pior que a ausência.
 */
export function infoDoTweet(meta: TweetMeta | undefined): LinhaDeInfo {
  const hora = (meta?.hora ?? "").trim()
  const data = (meta?.data ?? "").trim()
  const visualizacoes = (meta?.visualizacoes ?? "").trim()
  return { hora, data, visualizacoes, vazia: !hora && !data && !visualizacoes }
}

/** A linha de info aparece neste slide? (padrão: sim, se houver o que dizer) */
export function mostrarInfo(meta: TweetMeta | undefined): boolean {
  if (meta?.mostrarInfo === false) return false
  return !infoDoTweet(meta).vazia
}

/** A barra de contadores aparece neste slide? (padrão: sim) */
export function mostrarMetricas(meta: TweetMeta | undefined): boolean {
  return meta?.mostrarMetricas !== false
}

/**
 * Hora e data de AGORA, no formato que o X escreve em pt-BR.
 *
 * Existe para o botão "usar agora" do painel: o operador clica e o cartão
 * passa a ter um carimbo plausível, escrito por ele. Nada preenche isto
 * sozinho — data semeada por nós é informação que ninguém decidiu.
 */
export function carimboDeAgora(agora: Date = new Date()): { hora: string; data: string } {
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(agora)
  const data = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" }).format(agora).replace(/\.$/, "")
  return { hora, data }
}

/**
 * Campos de texto que o cartão do X desenha.
 *
 * `titulo` é o primeiro parágrafo e `corpo` o segundo — os dois no MESMO
 * corpo e no MESMO peso, porque o X não tem negrito no texto do post. A
 * divisão existe pelo mesmo motivo do cartão de thread: é ela que permite a
 * foto entrar NO MEIO do texto, e é o que preserva a copy de quem chega de
 * uma identidade que tem os dois campos.
 *
 * Não há `botao`: o cartão do X não tem botão, e o fecho de um carrossel
 * aqui é o próprio texto do post ("comente MÉTODO").
 */
export function camposTweet(_tipo: FrameTipo): Campo[] {
  return ["titulo", "corpo"]
}

/**
 * Limites de texto do formato.
 *
 * O X corta o post em 280 caracteres na conta comum; os dois parágrafos
 * somados ficam perto disso de propósito — texto maior que o limite da
 * plataforma é a primeira coisa que denuncia a peça como montada.
 */
export const LIMITES_TWEET: Partial<Record<Campo, number>> = {
  titulo: 180,
  corpo: 180,
  subtitulo: 180,
  botao: 26,
}

export function limiteTweet(campo: Campo): number | null {
  return LIMITES_TWEET[campo] ?? null
}
