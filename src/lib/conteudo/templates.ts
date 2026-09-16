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
    id: "molde-neon",
    nome: "Oferta em neon",
    etapaFunil: "fundo",
    descricao: "Bloco preto com título condensado, foto acesa e caixa sólida no fecho. Use com a identidade Neon.",
    cor: "#3B5BFD",
    familia: "neon",
    frames: [
      // A capa é a afirmação em massa condensada sobre a foto acesa: o
      // slide inteiro é título, e a foto entra como luz, não como ilustração.
      fr("f1", "capa", "Afirmação", 1, CAPA),
      fr("f2", "texto", "Promessa", 1, TC),
      fr("f3", "texto", "Prova", 1, TC),
      // O RESPIRO: o único slide claro da peça. A posição importa — é
      // `fundoPadraoDaFamilia` que o acha pelo meio da sequência, então
      // mover este frame muda qual slide respira.
      fr("f4", "texto", "Respiro", 0, TC),
      fr("f5", "texto", "Oferta", 1, TC),
      fr("f6", "cta", "Chamada", 0, CTA),
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
 */
export function variantesDoTipo(tipo: FrameTipo, cartaoPerfil = false): Array<[VarianteLayout, string]> | undefined {
  if (!cartaoPerfil) return ST_VARIANTES[tipo]
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
  Turbo: "Turbo",
  "MEC papel-por-papel": "MEC",
  "Benchmark de marca": "Benchmark",
  "Lista prática": "Lista",
  Bastidor: "Bastidor",
  "Print de post": "Post",
  "História em posts": "Post",
  "Oferta em neon": "Neon",
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
