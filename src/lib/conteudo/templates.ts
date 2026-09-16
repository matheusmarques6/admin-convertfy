/**
 * Templates (moldes) da casa — definição FIXA. O documento copia a estrutura
 * na criação e passa a ser dono dela; nada aqui é mutado em runtime.
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
    id: "molde-turbo",
    nome: "Turbo",
    etapaFunil: "topo",
    descricao: "Afirmação universal + multiplicador grande. Alcance e descoberta.",
    cor: "#2137B6",
    frames: [
      fr("f1", "capa", "Capa", 1, CAPA),
      fr("f2", "dado", "Slide 2", 0, TC),
      fr("f3", "texto", "Slide 3", 0, TC),
      fr("f4", "texto", "Slide 4", 1, TC),
      fr("f5", "prova", "Slide 5", 1, TC),
      fr("f6", "texto", "Slide 6", 0, TC),
      fr("f7", "cta", "CTA", 0, CTA),
    ],
  },
  {
    id: "molde-benchmark",
    nome: "Benchmark de marca",
    etapaFunil: "topo",
    descricao: "Case de marca conhecida com número forte, mecanismo e tradução para o leitor.",
    cor: "#0E7490",
    frames: [
      fr("f1", "capa", "Capa", 1, CAPA),
      fr("f2", "dado", "Slide 2", 0, TC),
      fr("f3", "texto", "Slide 3", 1, TC),
      fr("f4", "texto", "Slide 4", 0, TC),
      fr("f5", "prova", "Slide 5", 1, TC),
      fr("f6", "texto", "Slide 6", 0, TC),
      fr("f7", "texto", "Slide 7", 0, TC),
      fr("f8", "cta", "CTA", 0, CTA),
    ],
  },
  {
    id: "molde-lista",
    nome: "Lista prática",
    etapaFunil: "meio",
    descricao: "N coisas que você precisa entender sobre X. Um item por slide, CTA de salvar.",
    cor: "#B45309",
    frames: [
      fr("f1", "capa", "Capa", 1, CAPA),
      ...[2, 3, 4, 5, 6, 7, 8].map((i) =>
        fr(`f${i}`, "lista", `Item ${i - 1}`, i % 3 === 0 ? 1 : 0, TC),
      ),
      fr("f9", "cta", "CTA", 0, CTA),
    ],
  },
  {
    id: "molde-mec",
    nome: "MEC papel-por-papel",
    etapaFunil: "meio",
    descricao: "Série numerada com barra de progresso no topo. Um papel por slide.",
    cor: "#7C3AED",
    frames: [
      fr("f1", "capa", "Capa", 1, CAPA),
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => fr(`f${i}`, "mec", `Papel ${i - 1}`, 0, TC)),
      fr("f10", "cta", "CTA", 0, CTA),
    ],
  },
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
  {
    id: "molde-bastidor",
    nome: "Bastidor",
    etapaFunil: "fundo",
    descricao: "O que eu fiz por dentro, prova e convite para conversa.",
    cor: "#374151",
    frames: [
      fr("f1", "capa", "Capa", 1, CAPA),
      fr("f2", "texto", "Slide 2", 1, TC),
      fr("f3", "prova", "Slide 3", 1, TC),
      fr("f4", "texto", "Slide 4", 0, TC),
      fr("f5", "texto", "Slide 5", 1, TC),
      fr("f6", "cta", "CTA", 0, CTA),
    ],
  },
]

export const TEMPLATE_PADRAO_ID = "molde-turbo"

export function getTemplate(id: string): Template {
  return ST_TEMPLATES.find((t) => t.id === id) ?? ST_TEMPLATES[0]
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

/** Nome do template → chave curta do molde usada nos posts do dashboard. */
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
  return ST_MOLDE_KEY[t.nome] ?? "Turbo"
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
