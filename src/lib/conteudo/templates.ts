/**
 * Templates (moldes) da casa — definição FIXA. O documento copia a estrutura
 * na criação e passa a ser dono dela; nada aqui é mutado em runtime.
 *
 * **Todo molde declara a identidade que pressupõe** (`familia`). Os cinco
 * moldes originais (Turbo, Benchmark, Lista prática, MEC e Bastidor) foram
 * APOSENTADOS em set/2026: eram sequências diferentes desenhadas todas na
 * mesma identidade azul, então a prateleira mostrava cinco cartões iguais e
 * a escolha não mudava a peça. O vocabulário de CLASSIFICAÇÃO dos posts
 * publicados (`MoldeKey`) não foi mexido — ele é outro eixo, e apagá-lo
 * levaria junto o histórico de quem já foi classificado.
 */

import type {
  Campo,
  EtapaFunil,
  FrameTipo,
  MoldeKey,
  Template,
  TemplateFrame,
  VarianteLayout,
} from "./types"

export const ST_FUNIL: Record<EtapaFunil, { n: string; d: string; cor: string }> = {
  topo: {
    n: "Topo de funil",
    d: "Conteúdo para quem ainda não te conhece. Ganchos curtos, afirmações fortes, dados de impacto. Foco em alcance e descoberta.",
    cor: "#2563EB",
  },
  meio: {
    n: "Meio de funil",
    d: "Conteúdo para quem já te segue ou chegou pelo topo. Listas, comparações, mecanismo. Foco em aprofundar e gerar confiança.",
    cor: "#7C3AED",
  },
  fundo: {
    n: "Fundo de funil",
    d: "Conteúdo para quem já confia. Prova, case, oferta. Foco em virar conversa e cliente.",
    cor: "#047857",
  },
}

const fr = (
  id: string,
  tipo: FrameTipo,
  label: string,
  slotsImagem: 0 | 1,
  campos: Campo[],
): TemplateFrame => ({ id, tipo, label, slotsImagem, campos })

const TC: Campo[] = ["titulo", "corpo"]
const CAPA: Campo[] = ["titulo", "subtitulo"]
const CTA: Campo[] = ["titulo", "subtitulo", "botao"]

export const ST_TEMPLATES: Template[] = [
  {
    id: "molde-post",
    nome: "Print de post",
    etapaFunil: "topo",
    descricao: "Sequência da referência: gancho, print comentado, por que funciona e chamada. Use com a identidade Post.",
    cor: "#0D0D0D",
    familia: "post",
    frames: [
      // A capa é o gancho solto ("New Ecom Website Hack…"): só a linha em
      // negrito, sem imagem — é o slide que para o dedo.
      fr("f1", "capa", "Gancho", 0, TC),
      // O slide do print: texto curto em cima e a captura embaixo. É o
      // único com slot de imagem, e é ele que abre no topo do slide.
      fr("f2", "texto", "Print", 1, TC),
      fr("f3", "texto", "Por que funciona", 0, TC),
      fr("f4", "cta", "Chamada", 0, CTA),
    ],
  },
  {
    id: "molde-historia",
    nome: "História em posts",
    etapaFunil: "topo",
    descricao: "A narrativa em capítulos curtos, um por slide, abrindo com a colagem de fotos. Use com a identidade Post largo.",
    cor: "#111111",
    familia: "post-largo",
    frames: [
      // O primeiro slide traz a prova visual (a colagem) e o começo da
      // história; os capítulos seguintes são só texto, como na referência.
      fr("f1", "texto", "Abertura", 1, TC),
      ...[2, 3, 4, 5].map((i) => fr(`f${i}`, "texto", `Capítulo ${i - 1}`, 0, TC)),
      fr("f6", "cta", "Chamada", 0, CTA),
    ],
  },
  {
    id: "molde-tweet",
    nome: "Card do X",
    etapaFunil: "topo",
    descricao: "O cartão completo do X em cada slide — moldura, logo, hora e contadores. Edite foto, texto e as informações. Use com a identidade Card do X.",
    cor: "#1D9BF0",
    familia: "tweet",
    frames: [
      // Cada slide é UM cartão, como quem tira print de cada post de um
      // fio. O primeiro carrega o anexo (a captura que o post comenta);
      // os demais são só texto, que é o mais comum.
      fr("f1", "capa", "Post de abertura", 1, TC),
      fr("f2", "texto", "Post 2", 0, TC),
      fr("f3", "texto", "Post 3", 0, TC),
      fr("f4", "texto", "Post 4", 0, TC),
      // O fecho é o próprio texto do post: o cartão do X não tem botão, e
      // um botão ali seria o primeiro elemento a denunciar a peça.
      fr("f5", "cta", "Post de fecho", 0, TC),
    ],
  },
  {
    id: "molde-thread",
    nome: "Thread comentada",
    etapaFunil: "meio",
    descricao: "Nove cartões de thread: capa, sete passos do fio com foto no meio e o fecho preto. Use com a identidade Thread.",
    cor: "#111111",
    familia: "thread",
    frames: [
      // Nove slides, como a referência: a capa abre o fio, sete passos o
      // desenvolvem e o fecho preto deixa uma frase sozinha. Cada passo é
      // `titulo` (o que vem antes da foto) + `corpo` (o que vem depois) —
      // é assim que o cartão de thread quebra o parágrafo em volta da
      // imagem, e é o que o renderer desenha.
      fr("f1", "capa", "Capa", 1, TC),
      fr("f2", "texto", "Slide 2", 1, TC),
      fr("f3", "texto", "Slide 3", 1, TC),
      fr("f4", "texto", "Slide 4", 1, TC),
      fr("f5", "texto", "Slide 5", 1, TC),
      fr("f6", "texto", "Slide 6", 1, TC),
      fr("f7", "texto", "Slide 7", 1, TC),
      fr("f8", "texto", "Slide 8", 1, TC),
      // O fecho NÃO tem slot de imagem: na referência ele é preto com uma
      // frase e mais nada, e o painel de Mídia diz isso ("o frame 9 não
      // tem slot de imagem neste template").
      fr("f9", "cta", "CTA", 0, ["titulo"]),
    ],
  },
  {
    id: "molde-manchete",
    nome: "Tese em manchete",
    etapaFunil: "meio",
    descricao: "A sequência da referência: capa de impacto sobre foto, o erro, o problema, a virada e a chamada. Use com a identidade Manchete.",
    cor: "#3355FF",
    familia: "manchete",
    frames: [
      // A capa é a tese em ESCADA sobre a foto: a primeira linha é a
      // maior, e a linha em caixa mista embaixo prepara o resto.
      fr("f1", "capa", "Tese", 1, CAPA),
      // O erro: título grande (na referência, todo em azul pelo realce),
      // a foto do contexto e o parágrafo curto.
      fr("f2", "texto", "O erro", 1, TC),
      // O PROBLEMA é o único slide preto do meio — é ali que a caixa de
      // destaque aparece pela primeira vez. A posição importa: quem acha
      // o escuro é `fundoPadraoDaFamilia`, pelo meio da sequência.
      fr("f3", "texto", "O problema", 1, TC),
      fr("f4", "texto", "A virada", 1, TC),
      fr("f5", "cta", "Chamada", 0, CTA),
    ],
  },
]

export const TEMPLATE_PADRAO_ID = ST_TEMPLATES[0].id

export function getTemplate(id: string): Template {
  return ST_TEMPLATES.find((t) => t.id === id) ?? ST_TEMPLATES[0]
}

/**
 * O molde que o caminho "100% com IA" usa para cada etapa do funil.
 *
 * Deriva de `etapaFunil` em vez de um id escrito à mão: com ids fixos,
 * aposentar um molde deixava a IA apontando para um id inexistente, e
 * `getTemplate` caía no primeiro da lista SEM erro nenhum — a peça nascia
 * com outra sequência e outra identidade, em silêncio.
 */
export function templatePorFunil(etapa: EtapaFunil): Template {
  return ST_TEMPLATES.find((t) => t.etapaFunil === etapa) ?? ST_TEMPLATES[0]
}

/** Tipos que um frame do meio pode virar (capa e CTA são fixos). */
export const ST_TIPOS_TROCA: FrameTipo[] = ["texto", "dado", "prova", "lista", "mec"]

/** Variações de layout por tipo (só capa e texto têm). */
export const ST_VARIANTES: Partial<Record<FrameTipo, Array<[VarianteLayout, string]>>> = {
  capa: [
    ["a", "Texto embaixo"],
    ["b", "Texto no centro"],
    ["c", "Texto em cima"],
  ],
  texto: [
    ["a", "Título em cima, imagem embaixo"],
    ["b", "Imagem em cima, título embaixo"],
    ["c", "Só texto, centralizado"],
  ],
}

/**
 * As MESMAS variantes, com o nome do que a identidade desenha.
 *
 * No cartão de perfil (as duas famílias de print) a variante não move texto
 * dentro do slide: ela escolhe a POSE (`posePost`) — cabeçalho colado no
 * topo ou bloco no centro óptico —, e o padrão é decidido pela foto. Os
 * rótulos da casa ("Texto embaixo") descreviam um desenho que ali não
 * existe, então o operador escolhia no escuro.
 *
 * O booleano é a assinatura antiga (`cartaoPerfil`) e continua valendo,
 * pela mesma razão do `limiteDe`: trocar os dois sentidos de uma vez faria
 * um chamador esquecido passar `true` e receber outra lista, em silêncio.
 */
export interface DesenhoDasVariantes {
  cartaoPerfil: boolean
  cartaoTweet: boolean
}

export function variantesDoTipo(tipo: FrameTipo, desenho: boolean | DesenhoDasVariantes = false): Array<[VarianteLayout, string]> | undefined {
  const d: DesenhoDasVariantes = typeof desenho === "boolean" ? { cartaoPerfil: desenho, cartaoTweet: false } : desenho
  // O cartão COMPLETO do X não tem variante: ele cresce com o conteúdo e
  // fica centrado, sempre. Oferecer o seletor da casa ali é controle que o
  // operador mexe e não muda nada na tela.
  if (d.cartaoTweet) return undefined
  if (!d.cartaoPerfil) return ST_VARIANTES[tipo]
  if (tipo === "capa" || tipo === "texto" || tipo === "prova" || tipo === "lista" || tipo === "mec") {
    return [
      ["a", "Automático (pela foto)"],
      ["b", "Cabeçalho no topo"],
      ["c", "Bloco no centro"],
    ]
  }
  return undefined
}

/**
 * Nome do template → chave curta do molde usada nos posts do dashboard.
 *
 * As chaves dos moldes aposentados continuam aqui **de propósito**: elas
 * classificam posts já publicados, e o `MoldeKey` é a coluna que o
 * dashboard lê. Tirá-las apagaria o histórico junto com a prateleira.
 */
export const ST_MOLDE_KEY: Record<string, MoldeKey> = {
  "Thread comentada": "Thread",
  Turbo: "Turbo",
  "MEC papel-por-papel": "MEC",
  "Benchmark de marca": "Benchmark",
  "Lista prática": "Lista",
  Bastidor: "Bastidor",
  "Print de post": "Post",
  "História em posts": "Post",
  "Card do X": "Post",
  "Tese em manchete": "Manchete",
}

export function moldeKeyDoTemplate(t: Template): MoldeKey {
  return ST_MOLDE_KEY[t.nome] ?? "Post"
}

/** O molde da prateleira que realiza esta chave de classificação, se houver. */
export function templateDaMoldeKey(k: MoldeKey): Template | undefined {
  return ST_TEMPLATES.find((t) => moldeKeyDoTemplate(t) === k)
}

/** Campos que cada tipo de frame usa (ao trocar o tipo de um frame). */
export function camposDoTipo(tipo: FrameTipo): Campo[] {
  if (tipo === "capa") return CAPA
  if (tipo === "cta") return CTA
  return TC
}

export const FRAME_TIPO_LABEL: Record<FrameTipo, string> = {
  capa: "capa",
  dado: "dado",
  texto: "texto",
  prova: "prova",
  lista: "lista",
  mec: "mec",
  cta: "cta",
}
