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
  /**
   * Dias da semana em que ESTE perfil publica (0 = domingo), definidos por
   * alguém. Vazio = ninguém definiu, e o calendário deriva da meta — a
   * diferença aparece na tela como "sugerido", nunca como promessa.
   */
  cadenciaDias: number[]
  /** HH:MM do slot; null = padrão da casa. */
  cadenciaHora: string | null
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
  /**
   * Tempo médio assistido, em SEGUNDOS (a API entrega milissegundos).
   * É o sinal nº 1 de ranking do Instagram em 2026. `null` quando a
   * mídia não é Reel ou a métrica não foi entregue.
   */
  watchTimeS: number | null
  /**
   * Sends ÷ alcance, em percentual — o 2º sinal, e o que mais pesa para
   * alcançar quem não segue. `null` sem alcance: 0% se leria como
   * "ninguém compartilhou".
   */
  sendsPorAlc: number | null
  /** Likes ÷ alcance, em percentual — o 3º sinal. */
  curtidasPorAlc: number | null
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
  /**
   * A lista CRESCE (os sinais de ranking entraram no meio dela), então a
   * tela endereça por `label`, nunca por índice — endereçar por posição faz
   * o card mostrar outra métrica em silêncio.
   */
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

export type Campo = "titulo" | "subtitulo" | "corpo" | "botao" | "gancho" | "anotacao"

/**
 * Identidade visual do documento (paleta, tipografia, forma do CTA). O
 * molde decide a sequência dos slides; a família decide como eles são
 * desenhados. Ausente = "padrao" (a identidade azul da casa).
 */
export type FamiliaVisual = "padrao" | "editorial" | "alternado"

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
  /**
   * Via B — prompt de imagem deste slide, editável. Ausente = o construtor
   * (`prompt-slide.ts`) sugere um a partir da copy, do papel e da marca.
   */
  promptImagem?: string
  /**
   * `hibrido` (padrão): a imagem é só o visual e o renderer coloca a copy.
   * `completo`: o modelo desenhou o slide inteiro, texto incluído — o
   * renderer mostra a imagem full-bleed e não escreve nada por cima.
   */
  imagemModo?: ModoImagem
}

/** Como a imagem gerada entra no slide (via B). */
export type ModoImagem = "hibrido" | "completo"

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
  /** Triagem, headlines, espinha e revisão (motor editorial). */
  editorial?: Editorial
  /** Identidade visual (paleta + tipografia). Ausente = "padrao". */
  familia?: FamiliaVisual
  /**
   * Cor da marca da qual a paleta da família Alternado é derivada. Fica
   * gravada porque é ela que permite trocar de cor DE NOVO sem que a
   * segunda troca confunda o que era padrão com o que o usuário escolheu
   * a dedo. Ausente = a cor da casa.
   */
  corPrimaria?: string
  criadoEm: string
  atualizadoEm: string
}

// ── Estúdio: motor editorial ────────────────────────────────────────────

// ── Banco de ideias, pipeline de Reels e assuntos em alta ───────────────
// (migration 20261136). Os tipos do domínio moram nos módulos puros
// `ideias/banco.ts`, `reels/pipeline.ts` e `calendario/slots.ts`; aqui
// ficam só as formas que atravessam a rota.

export interface ReelRoteiroBloco {
  /** gancho | contexto | virada | prova | cta */
  papel: string
  texto: string
  segundos?: number | null
}

export interface Reel {
  id: string
  titulo: string
  funil: EtapaFunil
  etapa: import("./reels/pipeline").EtapaReel
  tema: string | null
  formato: string | null
  duracaoS: number | null
  score: number | null
  roteiro: ReelRoteiroBloco[]
  responsavelId: string | null
  responsavelNome: string | null
  canalId: string | null
  agendadoPara: string | null
  publicadoEm: string | null
  /**
   * Métricas do post real quando publicado (nunca digitadas). `views` e
   * `alcance` são medidas diferentes e cada uma pode faltar sozinha — a
   * Meta não entrega o mesmo conjunto para todo tipo de mídia.
   */
  metricas: { views: number | null; alcance: number | null; permalink: string | null } | null
  /**
   * Mídia do Instagram correspondente. O calendário usa isto para NÃO
   * mostrar a mesma publicação duas vezes (uma como post da conta, outra
   * como card do pipeline) — o post real vence, porque tem métrica.
   */
  igMediaId: string | null
  posicao: number
  ideiaId: string | null
  criadoEm: string
}

export interface Trend {
  id: string
  titulo: string
  score: number
  dificuldade: "facil" | "medio" | "dificil"
  categoria: "viral" | "venda" | "educativo"
  comoUsar: string
  fonte: "web" | "manual"
  fonteUrl: string | null
  fonteTitulo: string | null
  geradoEm: string
}

/** O estado da fonte de trends — a tela DIZ de onde o painel veio. */
export interface TrendsStatus {
  /** Nunca gerado = null. */
  geradoEm: string | null
  /** Provedor de busca configurado no ambiente (null = não configurado). */
  buscaConfigurada: boolean
  total: number
}

export type EixoNarrativo = "mercado" | "cases" | "noticias" | "cultura" | "produto"

export interface Evidencia {
  /** "A", "B", "C"… */
  rotulo: string
  texto: string
  /** Fonte + ano quando o insumo trouxe; sem fonte o dado sai como [confirmar]. */
  fonte?: string
}

/** Leitura do insumo ANTES de qualquer headline — é o contexto que toda ação seguinte recebe. */
export interface Triagem {
  transformacao: string
  friccaoCentral: string
  anguloDominante: string
  evidencias: Evidencia[]
  eixo: EixoNarrativo
  funil: EtapaFunil
  /** O que o hook promete e a peça tem de cumprir antes do CTA. */
  promessa: string
}

export type VereditoHeadline = "aprovada" | "ressalva" | "reprovada"

export interface HeadlineOpcao {
  texto: string
  /** Sub-hook da capa: aprofunda ou tensiona, independente do texto 1. */
  subtitulo?: string
  /** id em `PADROES_HEADLINE`. */
  padrao: string
  /** ids em `GATILHOS`. */
  gatilhos: string[]
  veredito: VereditoHeadline
  motivo?: string
}

/** Estrutura narrativa aprovada antes da copy — a copy dos frames é derivada daqui. */
export interface Espinha {
  headline: string
  subtitulo?: string
  hook: string
  mecanismo: string
  prova: string[]
  aplicacao: string
  direcao: string
  /** Virada temática, nunca resumo. */
  fechamento: string
}

export type SeveridadeEditorial = "erro" | "aviso"

export interface ViolacaoEditorial {
  regra: string
  nome: string
  trecho: string
  sugestao: string
  severidade: SeveridadeEditorial
  onde: "slide" | "legenda" | "headline"
  frameId?: string
  campo?: Campo
}

export interface NotaParametro {
  id: string
  nota: number
  problemas: string[]
}

export interface RevisaoSlide {
  frameId: string
  nota: number
  problemas: string[]
  /** Reescrita proposta pela IA (aplicada só com um clique do humano). */
  reescrita?: Partial<Record<Campo, string>>
}

export interface RevisaoEditorial {
  /** ISO de quando rodou. */
  em: string
  parametros: NotaParametro[]
  slides: RevisaoSlide[]
  /** Violações detectadas por CÓDIGO (filtro anti-slop), com trecho. */
  violacoes: ViolacaoEditorial[]
  aprovado: boolean
  resumo: string
}

/** Estado do motor editorial de um carrossel (persistido no documento). */
export interface Editorial {
  insumo: string
  voz: "marca" | "pessoal"
  /** "você" liberado — regra por PERFIL, nunca global. */
  segundaPessoa: boolean
  triagem?: Triagem
  headlines?: HeadlineOpcao[]
  headlineEscolhida?: number | null
  espinha?: Espinha
  revisao?: RevisaoEditorial
}

/** Proposta de conteúdo por slide (vinda de "colar texto" ou da IA). */
export interface PropostaSlide {
  frameId: string
  label: string
  titulo: string
  corpo?: string
}

// ── Estúdio: referências (exemplos que a ConvertIA lê) ──────────────────

export type ReferenciaOrigem = "instagram" | "upload"

export type ReferenciaTranscricao = "pendente" | "lida" | "erro"

/** Um slide da referência: a imagem (Storage) e a copy lida dele. */
export interface ReferenciaSlide {
  ordem: number
  imagemUrl: string
  tipo?: FrameTipo
  titulo?: string
  corpo?: string
}

/** Métricas do post real (null quando a referência veio por upload). */
export interface ReferenciaMetricas {
  reach: number | null
  saved: number | null
  shares: number | null
  follows: number | null
  comments: number | null
}

/**
 * Carrossel-exemplo. É o que separa "escrever pela regra" de "escrever
 * como a casa escreve": a IA recebe a copy por slide, a legenda e o
 * porquê — nunca a imagem, que só serve à tela.
 */
export interface Referencia {
  id: string
  nome: string
  origem: ReferenciaOrigem
  igMediaId: string | null
  permalink: string | null
  slides: ReferenciaSlide[]
  legenda: string | null
  palavraChave: string | null
  pilar: Pilar | null
  molde: MoldeKey | null
  porQueFunciona: string[]
  metricas: ReferenciaMetricas | null
  /** 1..3 — quais entram primeiro quando há mais referências do que cabe. */
  peso: 1 | 2 | 3
  ativa: boolean
  transcricao: ReferenciaTranscricao
  transcricaoErro: string | null
  criadoEm: string
  atualizadoEm: string
}

/** Carrossel real do Instagram ainda não importado como referência. */
export interface ReferenciaCandidata {
  igMediaId: string
  perfil: string
  headline: string
  slides: number | null
  thumb: string | null
  permalink: string | null
  publicadoEm: string
  metricas: ReferenciaMetricas
}
