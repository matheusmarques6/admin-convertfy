/**
 * Módulo Transcrições — tipos canônicos.
 *
 * Vocabulário único em pt-BR camelCase do lado do TS; o mapeamento para
 * snake_case acontece SÓ na camada de acesso ao banco (`mapper.ts`).
 * Traduzir nome no meio do caminho é como o admin perdeu campo antes.
 *
 * Não existe campo de confiança de propósito: ver o cabeçalho da migration
 * 20261121. Métrica de confiança inventada é pior que nenhuma.
 */

export type Plataforma = "youtube" | "instagram" | "tiktok" | "upload"

export type StatusTranscricao = "aguardando" | "processando" | "pronta" | "erro"

/** 0 baixando · 1 extraindo áudio · 2 transcrevendo · 3 indexando. */
export type EtapaPipeline = 0 | 1 | 2 | 3

export const ETAPAS: ReadonlyArray<{ i: EtapaPipeline; nome: string; mensuravel: boolean }> = [
  { i: 0, nome: "Baixando", mensuravel: true },
  { i: 1, nome: "Extraindo áudio", mensuravel: true },
  // A transcrição é UMA chamada ao provedor: não há porcentagem real para
  // mostrar, e inventar uma é a mentira que o design proíbe.
  { i: 2, nome: "Transcrevendo", mensuravel: false },
  { i: 3, nome: "Indexando", mensuravel: true },
]

export const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  upload: "Upload",
}

// ── Coleção ─────────────────────────────────────────────────────────────

export interface Colecao {
  id: string
  nome: string
  paiId: string | null
  /** Faísca: entra na recuperação da ConvertIA. */
  naBaseDeConhecimento: boolean
  /** Jargão do curso — vira `phraseList` na transcrição. */
  phraseList: string[]
  modelo: string
  /** "inbox" = a coleção reservada "Não organizadas". */
  reservada: "inbox" | null
  ordem: number
  /** Transcrições diretamente nesta coleção. */
  total: number
  /** Total incluindo as coleções filhas (o número da árvore). */
  totalRecursivo: number
  /** Filhas já aninhadas (a árvore vem montada do servidor). */
  filhas: Colecao[]
  /** Transcrições da coleção ainda sem embedding — a faísca em andamento. */
  indexacaoPendente: number
}

// ── Transcrição ─────────────────────────────────────────────────────────

export interface TopicoDetectado {
  /** Início em segundos. */
  s: number
  titulo: string
}

export interface Locutor {
  id: number
  /** O rótulo que o provedor devolveu (speaker_0) — nunca é reescrito. */
  rotuloOriginal: string
  nome: string
  cor: number
  /** Quantas falas deste locutor na transcrição. */
  falas: number
}

export interface Bloco {
  id: number
  /** Início em segundos. */
  s: number
  fim: number
  /** Rótulo original; o nome de exibição sai de `Locutor`. */
  locutor: string | null
  texto: string
  editado: boolean
}

/** O que a biblioteca precisa por card — sem o texto inteiro. */
export interface TranscricaoResumo {
  id: string
  titulo: string
  plataforma: Plataforma
  canal: string | null
  urlOriginal: string | null
  publicadoEm: string | null
  duracaoSeg: number | null
  thumbUrl: string | null
  colecaoId: string | null
  colecaoNome: string | null
  status: StatusTranscricao
  etapa: EtapaPipeline
  /** null quando a etapa não é mensurável. */
  progresso: number | null
  erroMsg: string | null
  erroCodigo: string | null
  tentativas: number
  locutoresQtd: number | null
  tags: string[]
  criadoEm: string
  naBaseDeConhecimento: boolean
}

/** O detalhe: tudo do resumo + o conteúdo. */
export interface TranscricaoDetalhe extends TranscricaoResumo {
  idioma: string
  /** O modelo REALMENTE usado. null enquanto não transcreveu. */
  modelo: string | null
  textoCompleto: string | null
  topicos: TopicoDetectado[]
  blocos: Bloco[]
  locutores: Locutor[]
  custoUsd: number | null
  tempoProcessamentoSeg: number | null
  concluidoEm: string | null
  indexadoEm: string | null
  /** URL assinada da mídia para o player (expira). */
  mediaUrl: string | null
  /** Chunks pendentes de (re)indexação nesta transcrição. */
  chunksDesatualizados: number
}

// ── Busca ───────────────────────────────────────────────────────────────

export interface TrechoEncontrado {
  transcricaoId: string
  titulo: string
  plataforma: Plataforma
  thumbUrl: string | null
  /** Início em segundos — é o que faz o clique cair no ponto certo. */
  s: number
  /** Texto do trecho, com o termo entre <mark> quando o match foi exato. */
  trecho: string
  locutor: string | null
  /** "exata" = full-text no bloco; "semantica" = vizinhança no chunk. */
  origem: "exata" | "semantica"
  similaridade: number | null
}

export interface ResultadoBusca {
  termo: string
  transcricoes: TranscricaoResumo[]
  trechos: TrechoEncontrado[]
  /** Contadores REAIS da query, não contagem de array no cliente. */
  totalTranscricoes: number
  totalTrechos: number
  /** Busca semântica indisponível (sem chave do OpenRouter, por exemplo). */
  semanticaIndisponivel: boolean
}

// ── Biblioteca ──────────────────────────────────────────────────────────

export type OrdemBiblioteca = "recentes" | "antigas" | "duracao" | "titulo"

export interface FiltroBiblioteca {
  colecaoId: string | null
  /** true = a coleção reservada "Não organizadas". */
  semColecao: boolean
  plataforma: Plataforma | null
  status: StatusTranscricao | null
  ordem: OrdemBiblioteca
  termo: string
  pagina: number
}

export interface BibliotecaPagina {
  itens: TranscricaoResumo[]
  /** Total do FILTRO ativo (o contador do cabeçalho sai daqui). */
  total: number
  /** Soma de duracao_seg do filtro; null se nenhum item tem duração. */
  duracaoTotalSeg: number | null
  temMais: boolean
}

// ── Fila e worker ───────────────────────────────────────────────────────

export interface EstadoDaFila {
  /** Último heartbeat do worker; null = nunca reportou. */
  sincronizadoEm: string | null
  emProcessamento: number
  /** Heartbeat velho: o rodapé avisa em vez de mentir "sincronizado". */
  workerOffline: boolean
}

// ── Prévia de link ──────────────────────────────────────────────────────

export interface PreviaLink {
  url: string
  ok: boolean
  plataforma: Plataforma | null
  titulo: string | null
  canal: string | null
  duracaoSeg: number | null
  thumbUrl: string | null
  urlNormalizada: string | null
  /** Já existe na org: a prévia mostra o aviso e o item não entra na fila. */
  duplicadaDe: { id: string; titulo: string } | null
  /** Coleção sugerida pelas regras da org. */
  colecaoSugeridaId: string | null
  erro: string | null
}
