/**
 * Vocabulário fechado das objeções (módulo PURO, client-safe).
 *
 * Spec "Objeções: catalogação macro e seleção micro — v2" (set/2026). É o
 * que liga as duas camadas sem duplicá-las: a loja traz a INSTÂNCIA (a
 * objeção na voz da pessoa), o toque traz a CLASSE (tipo de risco). Tudo
 * que o Catalogador e o Seletor devolvem passa por estes domínios — valor
 * fora deles reprova por código, não por confiança no modelo.
 *
 * Taxonomia de risco: Jacoby & Kaplan (1972) + tempo (Roselius, 1971) +
 * segurança (e-commerce) + adequação (vestuário/beleza — não colapsa em
 * desempenho). Aliviadores: Roselius (1971). Dimensões de confiança:
 * McKnight, Choudhury & Kacmar (2002). Profundidade: Schwartz (1966).
 */

export const TIPOS_DE_RISCO = [
  "financeiro",
  "desempenho",
  "tempo",
  "psicologico",
  "social",
  "seguranca",
  "adequacao",
] as const
export type TipoDeRisco = (typeof TIPOS_DE_RISCO)[number]

export const ALIVIADORES = [
  "garantia_de_devolucao",
  "prova_de_terceiro",
  "prova_por_volume",
  "demonstracao_de_mecanismo",
  "transparencia_de_politica",
  "amostra_ou_teste",
  "dado_de_adequacao",
  "comparacao_de_categoria",
  "seguranca_de_pagamento",
  "reputacao_da_loja",
] as const
export type Aliviador = (typeof ALIVIADORES)[number]

/**
 * Tabela §1.3 da spec: o tipo de risco restringe quais aliviadores
 * funcionam. Prova social não resolve medo de pagamento; garantia sozinha
 * não resolve dúvida de desempenho. Tratamento que não aterrissa aqui é
 * adjetivo, não mecanismo.
 */
export const ALIVIADOR_SERVE_A: Record<Aliviador, readonly TipoDeRisco[]> = {
  garantia_de_devolucao: ["financeiro", "adequacao", "psicologico"],
  prova_de_terceiro: ["desempenho", "psicologico", "social"],
  prova_por_volume: ["psicologico", "seguranca"],
  demonstracao_de_mecanismo: ["desempenho", "financeiro"],
  transparencia_de_politica: ["tempo", "seguranca", "psicologico"],
  amostra_ou_teste: ["financeiro", "adequacao"],
  dado_de_adequacao: ["adequacao"],
  comparacao_de_categoria: ["financeiro", "desempenho"],
  seguranca_de_pagamento: ["seguranca"],
  reputacao_da_loja: ["psicologico", "seguranca"],
}

export function aliviadorServe(aliviador: Aliviador, risco: TipoDeRisco): boolean {
  return ALIVIADOR_SERVE_A[aliviador].includes(risco)
}

export const DIMENSOES_CONFIANCA = ["competencia", "integridade", "benevolencia"] as const
export type DimensaoConfianca = (typeof DIMENSOES_CONFIANCA)[number]

/** Ordenada: a profundidade nunca DESCE dentro do mesmo flow para a mesma objeção. */
export const PROFUNDIDADES = ["afirmacao", "mecanismo", "prova_de_terceiro", "garantia"] as const
export type Profundidade = (typeof PROFUNDIDADES)[number]

export function profundidadeIndex(p: Profundidade): number {
  return PROFUNDIDADES.indexOf(p)
}

export const FLOWS_ELEGIVEIS = [
  "welcome",
  "abandoned_cart",
  "browse_abandonment",
  "site_abandoned",
  "upsell",
  "win_back",
  "shipping_stages",
] as const
export type FlowElegivel = (typeof FLOWS_ELEGIVEIS)[number]

export const MODOS = [
  "quebra_de_objecao",
  "varredura_de_objecoes",
  "confirmacao_por_terceiros",
  "varredura_de_canal",
  "fechamento_de_ciclo",
  "manutencao_de_confianca",
] as const
export type ModoDoToque = (typeof MODOS)[number]

/** Modos em que NÃO há objeção a atacar (os 5 de shipping_stages rodam assim). */
export const MODOS_SEM_OBJECAO: readonly ModoDoToque[] = [
  "fechamento_de_ciclo",
  "manutencao_de_confianca",
]

export const TRABALHOS_FIXOS = [
  "entrega_de_incentivo",
  "lembrete_de_incentivo_vivo",
  "prazo_com_hora",
  "custo_de_adiar_sem_hora",
  "prova_secundaria",
  "remocao_de_risco",
  "espelho_do_cetico",
] as const
export type TrabalhoFixo = (typeof TRABALHOS_FIXOS)[number]

export const VEICULOS = [
  "origem_da_marca",
  "economia_do_preco",
  "operacao_por_pedido",
  "mecanismo_unico",
] as const
export type Veiculo = (typeof VEICULOS)[number]

export const FONTES_DAS_OBJECOES = ["nao_atacadas", "ja_atacadas", "medos_de_categoria"] as const
export type FonteDasObjecoes = (typeof FONTES_DAS_OBJECOES)[number]

export const CONFIANCAS = ["alta", "media", "baixa"] as const
export type Confianca = (typeof CONFIANCAS)[number]

export const MOTIVOS_DESCARTE = ["dor", "historico", "fora_do_ciclo"] as const
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]

// ── Catálogo (saída do Catalogador — spec §2.2) ─────────────────────────

export interface LastroOperacional {
  afirmacao: string
  campo_de_origem: string | null
  verificado: boolean
}

export interface ObjecaoCatalogada {
  id: string
  /** Voz da pessoa, 1ª pessoa, uma frase. */
  objecao: string
  /** null só no catálogo importado do legado (sem tipagem). */
  tipo_de_risco: TipoDeRisco | null
  dimensao_confianca: DimensaoConfianca | null
  aliviador: Aliviador | null
  /** Mecanismo concreto — não adjetivo. */
  tratamento: string
  dominante_da_categoria: boolean
  flows_elegiveis: FlowElegivel[]
  lastro_operacional: LastroOperacional
  /** 1–5: quantas pessoas trava, não quão difícil é responder. */
  severidade: number
  evidencia: string | null
  confianca: Confianca
}

export interface VeiculoDeArgumento {
  texto: string | null
  /** false = o campo nunca vai existir para esta loja (revenda, p.ex.). */
  aplicavel: boolean
  campo_de_origem: string | null
  verificado: boolean
  alerta: string | null
}

export interface MedoDeCategoria {
  medo: string
  marca_esta_fora_porque: string | null
  verificado: boolean
  alerta: string | null
}

export interface ConcorrenteNomeavel {
  existe: boolean
  nome: string | null
  eixo_de_diferenca: string | null
  observacao: string | null
}

export interface Incentivo {
  /** null = não dá para saber pelo contexto (nunca inventar). */
  existe: boolean | null
  valor: string | null
  codigo: string | null
  condicoes: string | null
  prazo: string | null
  campo_de_origem: string | null
  alerta: string | null
}

export interface CatalogoDeObjecoes {
  objecoes: ObjecaoCatalogada[]
  veiculos_de_argumento: Record<Veiculo, VeiculoDeArgumento>
  medos_de_categoria: MedoDeCategoria[]
  concorrente_nomeavel: ConcorrenteNomeavel
  incentivo: Incentivo
  cobertura: { tipos_cobertos: TipoDeRisco[]; lacunas: string[] }
  descartadas: Array<{ texto: string; motivo: MotivoDescarte }>
}

// ── Alvo (saída do Seletor — spec §3.2) ─────────────────────────────────

export interface AlvoObjecao {
  ordem: number
  primaria: boolean
  id: string
  objecao: string
  tipo_de_risco: TipoDeRisco | null
  tratamento: string
  aliviador_pedido: Aliviador | null
  profundidade_de_prova: Profundidade
}

export interface AnguloDoTratamento {
  ordem: number
  veiculo: Veiculo
  papel: string
  insumo_disponivel: boolean | "parcial"
}

export interface JaAtacada {
  id: string
  email_number: number
  profundidade: Profundidade
  via: "primaria" | "varredura"
}

export interface LacunaDoSeletor {
  motivo: string
  detalhe?: string | null
}

export interface AlvoDoEmail {
  modo: ModoDoToque
  trabalhos_fixos: TrabalhoFixo[]
  alvos: AlvoObjecao[]
  medos_alvo: string[]
  promessa_a_pagar: string | null
  criterio_de_selecao: string
  dimensao_confianca: DimensaoConfianca | null
  angulo_do_tratamento: AnguloDoTratamento[]
  suspeita_a_antecipar: string | null
  ja_atacadas: JaAtacada[]
  proibido_neste_toque: string[]
  alerta_de_lastro: string | null
  razao: string
  lacuna: LacunaDoSeletor | null
}

// ── Helpers de domínio ──────────────────────────────────────────────────

export function isTipoDeRisco(v: unknown): v is TipoDeRisco {
  return typeof v === "string" && (TIPOS_DE_RISCO as readonly string[]).includes(v)
}
export function isAliviador(v: unknown): v is Aliviador {
  return typeof v === "string" && (ALIVIADORES as readonly string[]).includes(v)
}
export function isDimensao(v: unknown): v is DimensaoConfianca {
  return typeof v === "string" && (DIMENSOES_CONFIANCA as readonly string[]).includes(v)
}
export function isProfundidade(v: unknown): v is Profundidade {
  return typeof v === "string" && (PROFUNDIDADES as readonly string[]).includes(v)
}
export function isFlowElegivel(v: unknown): v is FlowElegivel {
  return typeof v === "string" && (FLOWS_ELEGIVEIS as readonly string[]).includes(v)
}
export function isModo(v: unknown): v is ModoDoToque {
  return typeof v === "string" && (MODOS as readonly string[]).includes(v)
}
export function isTrabalhoFixo(v: unknown): v is TrabalhoFixo {
  return typeof v === "string" && (TRABALHOS_FIXOS as readonly string[]).includes(v)
}
export function isVeiculo(v: unknown): v is Veiculo {
  return typeof v === "string" && (VEICULOS as readonly string[]).includes(v)
}
export function isFonte(v: unknown): v is FonteDasObjecoes {
  return typeof v === "string" && (FONTES_DAS_OBJECOES as readonly string[]).includes(v)
}
