/**
 * Módulo Conteúdo — tipos canônicos (Dashboard Social + Estúdio de Carrosséis).
 *
 * Duas famílias:
 *  - Dashboard: perfis, posts, KPIs, funil (lidos de `data.ts`).
 *  - Estúdio: TEMPLATE (definição fixa da casa) e DOCUMENTO (o carrossel do
 *    usuário). O documento CARREGA a própria estrutura de frames (tipo, slot,
 *    campos) copiada do template na criação — trocar, dividir, duplicar ou
 *    excluir um frame nunca mexe no template compartilhado.
 */

// ── Dashboard ───────────────────────────────────────────────────────────

/** Perfis reais (cada um publica) + o consolidado. */
export type PerfilId = "consolidado" | "bruno" | "convertfy" | "youtube"

/** Filtro do seletor: os perfis + o agrupador "instagram" (bruno + convertfy). */
export type PerfilFiltro = PerfilId | "instagram"

/** Perfis que criam carrossel no Estúdio (YouTube não publica carrossel). */
export type PerfilEditavel = "bruno" | "convertfy"

export type Canal = "instagram" | "youtube"

export type Formato = "Carrossel" | "Reels" | "Vídeo YT"

export type Pilar = "Case" | "Educacional" | "Bastidor" | "Benchmark"

export type MoldeKey = "Turbo" | "MEC" | "Benchmark" | "Lista" | "Bastidor"

export interface Perfil {
  id: PerfilId
  nome: string
  cor: string
  handle?: string
  canal: Canal | null
}

export interface Post {
  id: string
  /** Dia dentro da janela de 30 dias (0-based) — posição na série de seguidores. */
  dia: number
  data: string
  perfil: Exclude<PerfilId, "consolidado">
  head: string
  fmt: Formato
  pilar: Pilar
  molde: MoldeKey
  alc: number
  sav: number
  sh: number
  seg: number
  com: number
  leads: number
  kw: string
  slides: number
  cor: string
  /** Só YouTube */
  ctr?: number
  ret?: number
  thumbSeed?: string
}

export interface Kpi {
  label: string
  valor: string
  delta: string
  serie: number[]
  money?: boolean
}

export interface LeadDoPost {
  nome: string
  handle: string
  data: string
  estagio: string
}

export interface FunilEtapa {
  label: string
  valor: number
}

export interface PilarMix {
  alvo: Partial<Record<Pilar, number>>
  real: Partial<Record<Pilar, number>>
}

export interface Cadencia {
  perfil: Exclude<PerfilId, "consolidado">
  feitos: number
  meta: number
}

export interface SlotAgenda {
  quando: string
  perfil: Exclude<PerfilId, "consolidado">
  formato: string
}

export interface MoldeResumo {
  k: MoldeKey
  nome: string
  descricao: string
  slides: string
  leads: number
  posts: number
}

export interface Prova {
  t: string
  fonte: string
  data: string
}

export interface EstruturaSlide {
  tipo: string
  t: string
  b: string
}

export interface DashboardData {
  perfil: PerfilFiltro
  kpis: Kpi[]
  serieSeguidores: number[]
  posts: Post[]
  funil: FunilEtapa[]
  pilarMix: PilarMix
  cadencia: Cadencia[]
  slots: SlotAgenda[]
  moldes: MoldeResumo[]
  /** Métricas derivadas que o funil exibe ao lado do trapézio. */
  derivados: {
    postsPublicados: number
    comentariosChave: number
    alcanceParaLead: number
    cplOrganico: number
    ticketMedio: number
    diasComentarioFechamento: number
  }
  sincronizadoEm: string
}

// ── Estúdio: template ───────────────────────────────────────────────────

export type FrameTipo = "capa" | "dado" | "texto" | "prova" | "lista" | "mec" | "cta"

export type Campo = "titulo" | "subtitulo" | "corpo" | "botao"

export type EtapaFunil = "topo" | "meio" | "fundo"

export type VarianteLayout = "a" | "b" | "c"

export interface TemplateFrame {
  id: string
  tipo: FrameTipo
  label: string
  slotsImagem: 0 | 1
  campos: Campo[]
}

export interface Template {
  id: string
  nome: string
  etapaFunil: EtapaFunil
  descricao: string
  /** Média histórica de leads por post com este molde. */
  leads: number
  cor: string
  frames: TemplateFrame[]
}

/** Template criado pelo time a partir de inspiração. */
export interface MeuTemplate {
  id: string
  nome: string
  origem: "inspiração"
  frames: number
  usos: number
  seed: string
  /** Template base usado para materializar (a estrutura detectada). */
  templateId: string
  criadoEm: string
}

/** Limite confortável de caracteres por tipo de frame e campo. */
export type Limites = Partial<Record<FrameTipo, Partial<Record<Campo, number>>>>

// ── Estúdio: documento ──────────────────────────────────────────────────

export type DocStatus = "rascunho" | "pronto" | "agendado" | "publicado"

export type Proporcao = "4:5" | "9:16"

export interface ImagemSlot {
  url: string
  zoom: number
  x: number
  y: number
  larguraSlot: number
  alturaSlot: number
}

export interface EstiloTexto {
  dy?: number
  escala?: number
  lh?: number
  peso?: number
  align?: "left" | "center"
  /** Chave de `doc.cores` */
  cor?: string
}

export interface DocFrame {
  frameId: string
  tipo: FrameTipo
  label: string
  slotsImagem: 0 | 1
  campos: Campo[]
  textos: Partial<Record<Campo, string>>
  imagens: { slot1?: ImagemSlot }
  oculto?: boolean
  variante?: VarianteLayout
}

export interface BrandKit {
  brandName: string
  brandName2: string
  copyright: string
  avatar: string | null
  verificado: boolean
}

export type OcultavelGlobal = "brandName" | "brandName2" | "copyright" | "avatar" | "verificado"

export interface Gradiente {
  de: string
  meio: string
  ate: string
  angulo: number
}

export interface CtaConfig {
  mostrar: boolean
  texto: string
  fundo: string
  cor: string
}

export interface HistoricoItem {
  id: string
  label: string
  ts: string
}

export interface AgendaItem {
  perfil: PerfilEditavel
  data: string
  hora: string
}

export interface Documento {
  id: string
  nome: string
  projeto: string
  templateId: string
  perfil: PerfilEditavel
  proporcaoExport: Proporcao
  status: DocStatus
  versao: string
  /** Data curta exibida na biblioteca (dd/mm). */
  data: string
  brandKit: BrandKit
  ocultos: Partial<Record<OcultavelGlobal, boolean>>
  cores: Record<string, string>
  /** frameId → "#hex" | "gradiente" */
  fundoPorFrame: Record<string, string>
  gradiente: Gradiente
  cta: CtaConfig
  estilos: Record<string, Partial<Record<Campo, EstiloTexto>>>
  frames: DocFrame[]
  legenda: string
  palavraChave: string
  historico: HistoricoItem[]
  agenda?: AgendaItem
  criadoEm: string
  atualizadoEm: string
}

/** Proposta de conteúdo por slide (vinda de "colar texto" ou da IA). */
export interface PropostaSlide {
  frameId: string
  label: string
  titulo: string
  corpo?: string
}
