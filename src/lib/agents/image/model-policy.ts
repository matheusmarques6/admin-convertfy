/**
 * Qual modelo gera a imagem — PURO, sem I/O.
 *
 * Decisão (set/2026): o **GPT Image 2** volta a ser o primário em toda a
 * geração, e o **Nano Banana 2** (Gemini) é o segundo. Numa peça com DUAS
 * variações, sai uma de cada — é comparação lado a lado do mesmo prompt,
 * não duas tentativas do mesmo modelo.
 *
 * ## O que precisou existir para isso ser seguro
 *
 * O GPT Image 2 já foi primário e foi REVERTIDO em ago/2026 (migration
 * 20261072): ele entra em **loop de whitespace** — responde 200 OK e fica
 * pingando espaço por minutos, sem imagem. Na Luxe Lift (10/08) duas
 * tentativas queimaram 455 s do orçamento da fase 2 e **o email saiu sem a
 * imagem da hero**, porque o agente de hero recebeu `<hero_image url="" />`
 * e removeu a linha.
 *
 * Duas coisas mudaram desde então:
 *
 * 1. `OPENROUTER_IMAGE_BODY_TIMEOUT_MS` (300 s) corta o corpo que não
 *    termina — o `fetch` resolve nos HEADERS, então sem esse teto a leitura
 *    seguia sem relógio nenhum. Limita o desperdício.
 * 2. **Este módulo**: falha de PROVEDOR troca de modelo em vez de devolver
 *    imagem nenhuma. É o que faltava — o teto encurta o prejuízo, mas quem
 *    evita o email sem hero é o fallback.
 *
 * A falha continua sendo do provedor. O que muda é o custo dela: antes,
 * um bloco sem imagem; agora, uma imagem do Gemini e uma linha no log.
 */

/** GPT Image 2 — o primário. Slug do OpenRouter. */
export const IMAGE_MODEL_PRIMARIO = "openai/gpt-5.4-image-2"

/** Nano Banana 2 — o segundo, e o destino do fallback. */
export const IMAGE_MODEL_SECUNDARIO = "google/gemini-3.1-flash-image"

/**
 * A ordem dos modelos para N variações do MESMO prompt.
 *
 * Com `n = 2` o pedido é explícito: uma do GPT Image 2 e a melhor do
 * Gemini, para comparar. Com `n = 1` só o primário — pedir uma imagem não
 * é pedir um teste. Acima de 2 alterna, começando no primário, porque
 * quatro imagens do mesmo modelo respondem menos que duas de cada.
 */
export function modelosParaVariacoes(n: number): string[] {
  const total = Math.max(1, Math.floor(n) || 1)
  if (total === 1) return [IMAGE_MODEL_PRIMARIO]
  const alternando = [IMAGE_MODEL_PRIMARIO, IMAGE_MODEL_SECUNDARIO]
  return Array.from({ length: total }, (_, i) => alternando[i % 2])
}

/**
 * Para onde cai quando o modelo atual falha por culpa do provedor.
 *
 * Só existe UM salto: primário → secundário. O secundário não volta para o
 * primário — dois modelos falhando no mesmo prompt é sinal de que o
 * problema é o pedido (recusa por política de conteúdo, por exemplo), e
 * insistir só gastaria mais orçamento antes de dizer a mesma coisa.
 * Modelo desconhecido (alguém trocou a config no banco) não tem fallback:
 * escolher um substituto que o operador não pediu é pior que falhar claro.
 */
export function modeloDeFallback(atual: string): string | null {
  return atual.trim() === IMAGE_MODEL_PRIMARIO ? IMAGE_MODEL_SECUNDARIO : null
}

/**
 * A falha é DO PROVEDOR (vale trocar de modelo) ou DO PEDIDO (não vale)?
 *
 * Trocar de modelo numa recusa de política de conteúdo só faz o segundo
 * modelo recusar também, depois de cobrar o tempo — e some com a mensagem
 * que explicava o motivo real. Por isso a lista é fechada e reconhece as
 * assinaturas que o `image.chain` já produz:
 *
 *   - `whitespace_body` — o loop do GPT Image 2, exatamente o caso
 *   - `image_timeout` / `aborted` — não terminou
 *   - 5xx e 429 do OpenRouter — indisponibilidade
 *   - corpo vazio
 *
 * "Não foi possível extrair imagem" com corpo em PROSA fica de fora: é
 * recusa do modelo, e a mensagem dele é o que o operador precisa ler.
 */
export function ehFalhaDeProvedor(erro: unknown): boolean {
  // O NOME da classe vem primeiro: casar texto de mensagem é frágil, e o
  // teste do fallback provou por quê — `OpenRouterEmptyBodyError` diz
  // "empty body", com espaço, e a régua procurava "empty_body".
  const nome = erro instanceof Error ? erro.name : ""
  if (nome === "OpenRouterEmptyBodyError" || nome === "OpenRouterMidStreamError") return true

  const msg = (erro instanceof Error ? erro.message : String(erro ?? "")).toLowerCase()
  if (!msg) return false
  return (
    msg.includes("whitespace_body") ||
    msg.includes("image_timeout") ||
    msg.includes("aborted") ||
    // `OpenRouterHttpError` só entra em 429/5xx: um 400 dele é pedido
    // malformado, e o segundo modelo receberia o mesmo pedido.
    /\b(429|500|502|503|504)\b/.test(msg)
  )
}
