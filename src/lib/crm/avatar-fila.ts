/**
 * Regras da fila de fotos de perfil do inbox (puro, sem I/O).
 *
 * Existe porque o desfecho de uma tentativa não é binário, e tratar
 * tudo como "deu ou não deu" foi o que travou a fila em produção:
 *
 *  - A origem RESPONDEU e não há foto (perfil privado, contato sem
 *    imagem) → não adianta voltar amanhã: janela longa.
 *  - A origem FALHOU (timeout, 5xx, número inexistente no WhatsApp) →
 *    é transitório, mas não pode ser "de graça": sem carimbo nenhum, o
 *    mesmo lote do topo volta em toda rodada e a cauda da lista nunca é
 *    alcançada. Janela curta, do tamanho do intervalo do cron.
 *  - NÃO DEU PARA TENTAR (canal deslogado, sem credencial, cooldown) →
 *    aí sim nada é carimbado: a foto tem de aparecer na primeira rodada
 *    depois de o canal voltar, não uma semana depois.
 */

/** Desfecho de uma tentativa de buscar a foto do contato. */
export type AvatarMotivo =
  /** A origem devolveu foto (espelhada por nós, ou a URL externa). */
  | "preenchido"
  /** A origem respondeu: este contato não tem foto visível. */
  | "sem_foto"
  /** O canal não tem API de foto de contato (WhatsApp Cloud). */
  | "sem_caminho"
  /** A origem foi chamada e falhou — transitório. */
  | "erro_provedor"
  /** Já temos a nossa cópia; não há o que buscar. */
  | "ja_espelhado"
  /** Canal deslogado, inativo ou inexistente. */
  | "canal_indisponivel"
  /** Integração sem config/instância utilizável. */
  | "sem_credencial"
  /** Tentado há pouco neste mesmo runtime. */
  | "cooldown"
  /** O "contato" não é uma pessoa (comentário de post) ou não tem id. */
  | "sem_contato"

/**
 * A origem respondeu — o resultado vale pela janela longa.
 * `sem_caminho` entra aqui de propósito: não existe caminho, voltar
 * amanhã não muda nada.
 */
const RESPONDERAM: ReadonlySet<AvatarMotivo> = new Set<AvatarMotivo>([
  "preenchido",
  "sem_foto",
  "sem_caminho",
])

export function origemRespondeu(motivo: AvatarMotivo): boolean {
  return RESPONDERAM.has(motivo)
}

/** Dias até re-perguntar por um contato que respondeu "sem foto". */
export const JANELA_RESPOSTA_DIAS = 7

/**
 * Horas até re-tentar depois de um erro do provedor. Curta de propósito
 * — o erro é transitório e a foto tem de aparecer no mesmo dia. Quem
 * segura o martelo não é esta janela e sim a ORDEM da fila: quem falhou
 * vai para trás de quem nunca falhou (ver `ORDEM_DA_FILA`).
 */
export const JANELA_ERRO_HORAS = 1

/** Cortes que o cron manda ao PostgREST (ISO 8601). */
export interface JanelasDaFila {
  /** `contact_avatar_checked_at` mais antigo que isto volta à fila. */
  checadoAntesDe: string
  /** `contact_avatar_failed_at` mais antigo que isto volta à fila. */
  falhouAntesDe: string
}

export function janelasDaFila(agora: Date): JanelasDaFila {
  const ms = agora.getTime()
  return {
    checadoAntesDe: new Date(ms - JANELA_RESPOSTA_DIAS * 24 * 60 * 60 * 1000).toISOString(),
    falhouAntesDe: new Date(ms - JANELA_ERRO_HORAS * 60 * 60 * 1000).toISOString(),
  }
}

/**
 * Breakdown da rodada. Agregado ("filled: 0") não diz nada a quem abre
 * o inbox sem fotos; o motivo dominante diz exatamente o que consertar.
 */
export function contarMotivos(motivos: readonly AvatarMotivo[]): Record<string, number> {
  const contagem: Record<string, number> = {}
  for (const m of motivos) contagem[m] = (contagem[m] ?? 0) + 1
  return contagem
}

/**
 * A ordem do lote, em uma decisão só e no lugar em que ela é explicada.
 *
 * `failed_at` vem PRIMEIRO porque carimbar a falha não basta: quem
 * falhou continua com `checked_at` nulo e, ordenando só por ele,
 * voltaria ao topo junto de quem nunca foi tentado — a fila travaria
 * do mesmo jeito. Nulo primeiro = quem nunca falhou tem a vez; entre os
 * que falharam, o mais antigo. Depois quem nunca foi checado, e o
 * desempate é a conversa mais recente, que é a que o operador olha.
 */
export const ORDEM_DA_FILA = [
  { coluna: "contact_avatar_failed_at", ascendente: true, nulosPrimeiro: true },
  { coluna: "contact_avatar_checked_at", ascendente: true, nulosPrimeiro: true },
  { coluna: "last_message_at", ascendente: false, nulosPrimeiro: false },
] as const

/**
 * Ainda cabe mais uma tentativa no orçamento? A chamada externa é lenta
 * e imprevisível (Evolution faz retry interno), então a rodada para
 * antes do teto da função em vez de ser cortada no meio de um espelho.
 */
export function cabeMaisUma(inicioMs: number, agoraMs: number, orcamentoMs: number): boolean {
  return agoraMs - inicioMs < orcamentoMs
}
