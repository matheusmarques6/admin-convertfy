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
