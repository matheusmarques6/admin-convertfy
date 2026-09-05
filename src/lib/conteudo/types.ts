/**
 * Módulo Conteúdo — tipos canônicos (Dashboard Social + Estúdio de Carrosséis).
 *
 * Duas famílias:
 *  - Dashboard: perfis (= canais Instagram da org), posts (mídias reais da
 *    Graph API), KPIs e funil derivados do CRM.
 *  - Estúdio: TEMPLATE (definição fixa da casa) e DOCUMENTO (o carrossel do
 *    usuário). O documento CARREGA a própria estrutura de frames (tipo, slot,
 *    campos) copiada do template na criação — trocar, dividir, duplicar ou
 *    excluir um frame nunca mexe no template compartilhado.
 */

// ── Dashboard ───────────────────────────────────────────────────────────

/** Filtro do seletor: id de um canal Instagram ou o consolidado. */
export const PERFIL_CONSOLIDADO = "consolidado"
export type PerfilFiltro = string

/** Perfil que cria carrossel = id de um canal Instagram (`crm_channels.id`). */
export type PerfilEditavel = string

export type Canal = "instagram"

export type Formato = "Carrossel" | "Reels" | "Imagem" | "Vídeo"

export type Pilar = "Case" | "Educacional" | "Bastidor" | "Benchmark"

export type MoldeKey = "Turbo" | "MEC" | "Benchmark" | "Lista" | "Bastidor"

export interface Perfil {
  /** id do canal (`crm_channels.id`). */
  id: string
  nome: string
  /** @username do Instagram (null enquanto o perfil não foi lido). */
  handle: string | null
  /** Cor de marcador (derivada da posição do canal na org). */
  cor: string
  /** Foto do perfil servida pelo admin (null se ainda não baixada). */
  avatar: string | null
  canal: Canal
  ativo: boolean
  /** Meta de publicações por semana (config do canal). */
  metaSemanal: number
  seguidores: number | null
  /** Erro da última leitura da Graph API (token expirado etc.). */
  erro: string | null
}

export interface Post {
  /** id da mídia no Instagram. */
  id: string
  perfil: string
  /** ISO da publicação. */
  publicadoEm: string
  /** dd/mm para exibição. */
  data: string
  /** Primeira linha da legenda (ou o nome do documento do Estúdio). */
  head: string
  fmt: Formato
  pilar: Pilar | null
  molde: MoldeKey | null
  /** Palavra-chave do comment gate (classificação). */
  kw: string | null
  permalink: string | null
  thumb: string | null
  /** Métricas da Graph API (null = insight indisponível para a mídia). */
  alc: number | null
  sav: number | null
  sh: number | null
  /** Seguidores ganhos a partir do post (`follows`). */
  seg: number | null
  com: number
  curtidas: number | null
  interacoes: number | null
  visitasPerfil: number | null
  views: number | null
  /** Contatos que comentaram e depois abriram conversa no direct. */
  leads: number
  /** Slides do carrossel (null quando não é carrossel). */
  slides: number | null
  legenda: string | null
  documentoId: string | null
}

export interface Kpi {
  label: string
  /** Formatado para exibição; "—" quando não há dado. */
  valor: string
  /** Variação vs. período anterior ("+6,2%"), null sem base de comparação. */
  delta: string | null
  serie: number[]
  money?: boolean
  /** Origem/observação curta exibida embaixo do valor. */
  nota?: string
}

export interface LeadDoPost {
  threadId: string
  nome: string
  handle: string | null
  avatar: string | null
  /** ISO da conversa. */
  data: string
  estagio: string
  dealId: string | null
  leadId: string | null
}

export interface FunilEtapa {
  label: string
  /** null = fonte indisponível (a UI mostra "sem dado", não zero). */
  valor: number | null
  nota?: string
}

export interface PilarMix {
  alvo: Partial<Record<Pilar, number>>
  real: Partial<Record<Pilar, number>>
  /** Posts do período sem classificação de pilar. */
  semClassificacao: number
  classificados: number
}

export interface Cadencia {
  perfil: string
  feitos: number
  meta: number
}

export interface Agendado {
  id: string
  documentoId: string
  nome: string
  perfil: string | null
  /** YYYY-MM-DD */
  data: string
  /** HH:MM */
  hora: string
  status: DocStatus
}

export interface MoldeResumo {
  k: MoldeKey
  nome: string
  descricao: string
  slides: string
  /** Média de leads por post publicado com este molde (null sem posts). */
  leads: number | null
  posts: number
  alcanceMedio: number | null
}

export interface SerieSeguidores {
  /** YYYY-MM-DD por ponto. */
  dias: string[]
  /** Total de seguidores no dia (null = sem snapshot). */
  valores: Array<number | null>
}

export interface DashboardData {
  perfil: PerfilFiltro
  periodo: { start: string; end: string }
  perfis: Perfil[]
  /** Ordem fixa: seguidores, alcance, interações, salvamentos, leads, receita. */
  kpis: Kpi[]
  serieSeguidores: SerieSeguidores
  posts: Post[]
  funil: FunilEtapa[]
  pilarMix: PilarMix
  cadencia: Cadencia[]
  agendados: Agendado[]
  moldes: MoldeResumo[]
  derivados: {
    postsPublicados: number
    comentarios: number
    comentariosChave: number
    alcanceParaLead: number | null
    ticketMedio: number | null
    negocios: number
    clientes: number
    receita: number
  }
  /** ISO da sincronização mais antiga entre os canais (null = nunca). */
  sincronizadoEm: string | null
  /**
   * O que existe no banco INDEPENDENTE do período — é o que distingue
   * "nenhum post neste período" de "nada sincronizado ainda".
   */
  cobertura: {
    totalPosts: number
    ultimoPostEm: string | null
    primeiroPostEm: string | null
    /** Histórico do perfil ainda sendo trazido da Graph API. */
    backfillPendente: boolean
  }
  avisos: string[]
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
  cor: string
  frames: TemplateFrame[]
}

export interface EstruturaDetectada {
  tipo: FrameTipo
  slotImagem?: boolean
  descricao?: string
}

/** Template criado pelo time a partir de inspiração (persistido). */
export interface MeuTemplate {
  id: string
  nome: string
  origem: "inspiração"
  frames: number
  usos: number
  /** Template base usado para materializar (a estrutura detectada). */
  templateId: string
  estrutura: EstruturaDetectada[]
  fidelidade: number | null
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
  /** dd/mm */
  data: string
  /** YYYY-MM-DD */
  dataIso?: string
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
  /** Mídia do Instagram vinculada quando publicado. */
  publicacao?: { mediaId: string; permalink: string | null; perfil: string }
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
