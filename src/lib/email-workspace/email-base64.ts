/**
 * email-base64 — imagem embutida no HTML do e-mail é dívida, e ela entra
 * pela BIBLIOTECA.
 *
 * Medido em 10/09 (Boxer Shop, welcome 1): 4 data URIs no documento, o maior
 * com 8.766 chars. Nenhum veio da geração — o mesmo conteúdo estava no
 * backup de três dias antes. A origem são 9 variantes ATIVAS de
 * `email_component_variants` cujo `html` traz o ícone/logo embutido, e a
 * montagem as copia para todo e-mail que as usa (11 referências já
 * carregavam). O pior caso é a `review 8`: 61.312 chars de base64, 77% do
 * bloco.
 *
 * Por que isso quebra o e-mail, e não só o incomoda:
 *
 *  1. **O Gmail corta a mensagem acima de ~102 KB** e mostra "mensagem
 *     truncada" com um link. O que fica depois do corte — quase sempre o
 *     rodapé, com descadastro — some. Base64 infla o documento em ~33%
 *     sobre o tamanho do arquivo, então três ícones já pesam mais que a
 *     copy inteira.
 *  2. **O Outlook (Word engine) não renderiza `src="data:"`** — em nenhum
 *     tamanho. O bloco sai com o ícone quebrado no cliente que mais importa
 *     em e-mail corporativo. Não é degradação: é ausência.
 *
 * Este módulo é PURO: encontra, decide e troca. Quem sobe ao Storage é o
 * serviço — a separação existe para a régua de decisão ser testável sem I/O.
 */

/** Data URI de imagem encontrado no documento. */
export interface DataUriAchado {
  /** O texto completo, como aparece no HTML (é o que será substituído). */
  uri: string
  /** `image/png`, `image/svg+xml`… */
  mime: string
  /** Payload em base64, sem o prefixo. */
  base64: string
  /** Tamanho do arquivo depois de decodificado, em bytes. */
  bytes: number
}

/**
 * Piso para extrair.
 *
 * Abaixo dele, trocar o embutido por uma URL piora: acrescenta uma
 * requisição por abertura para economizar algumas centenas de bytes, e
 * espaçador de 1px inline é padrão antigo e deliberado em e-mail. O corte
 * do Gmail não se decide nessa faixa.
 *
 * Em base64, ~512 chars ≈ 384 bytes de arquivo.
 */
export const PISO_PARA_EXTRAIR_CHARS = 512

const DATA_URI_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi

/** Extensão de arquivo a partir do mime, para o nome no Storage. */
export function extensaoDoMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m === "image/svg+xml") return "svg"
  if (m === "image/jpeg" || m === "image/jpg") return "jpg"
  const sub = m.split("/")[1] ?? "png"
  // `image/vnd.microsoft.icon` e afins: fica o último segmento utilizável.
  return (sub.split("+")[0] || "png").replace(/[^a-z0-9]/g, "") || "png"
}

/** Bytes reais do arquivo a partir do comprimento em base64 (com padding). */
export function bytesDeBase64(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

/**
 * Todos os data URIs de imagem do documento, deduplicados pelo conteúdo.
 *
 * A deduplicação é o que faz o mesmo logo repetido em quatro células virar
 * UM arquivo — e, com o path por hash lá no serviço, um arquivo para a
 * biblioteca inteira.
 */
export function encontrarDataUris(html: string): DataUriAchado[] {
  const vistos = new Map<string, DataUriAchado>()
  for (const m of html.matchAll(DATA_URI_RE)) {
    const [uri, mime, base64] = m
    if (!mime || !base64) continue
    if (vistos.has(base64)) continue
    vistos.set(base64, {
      uri,
      mime: mime.toLowerCase(),
      base64,
      bytes: bytesDeBase64(base64),
    })
  }
  return [...vistos.values()]
}

/**
 * Base64 que é PLACEHOLDER de slot, não arte — e por isso não pode sair.
 *
 * A `review 8` traz `<img src="data:image/png;base64,…" alt="ALT_FOTO_1A">`
 * cinco vezes: o base64 é o xadrez cinza de espera e o `alt` é o endereço
 * onde a imagem GERADA vai entrar. É assim que aquela variante ancora as
 * cinco fotos mesmo sem um único `src="URL_…"` — `slotsFromBase64Placeholder`
 * (slot-finder) reconhece o par e promove a `<img>` a slot.
 *
 * Extrair esse base64 para o Storage destruiria o par: o `src` viraria uma
 * URL http real, que o vocabulário lê como ASSET EXTERNO, e os cinco campos
 * cairiam em `sem_lugar`. Trocaríamos 61 KB de peso por cinco imagens
 * geradas, pagas e descartadas — e o e-mail passaria a exibir o xadrez
 * hospedado no nosso Storage como se fosse a foto final.
 *
 * A régua é a mesma do slot-finder (`ALT_` prefixado), de propósito: se as
 * duas divergirem, uma extrai o que a outra precisava.
 */
export function base64DeSlot(html: string): Set<string> {
  const protegidos = new Set<string>()
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const alt = /\balt\s*=\s*"([^"]*)"/i.exec(tag[0])?.[1]?.trim()
    if (!alt || !/^ALT_/.test(alt)) continue
    const b64 = /src\s*=\s*"data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)"/i
      .exec(tag[0])?.[1]
    if (b64) protegidos.add(b64)
  }
  return protegidos
}

export function extraiveis(
  achados: DataUriAchado[],
  /** O documento, para reconhecer os placeholders de slot. */
  html?: string,
): DataUriAchado[] {
  const protegidos = html ? base64DeSlot(html) : new Set<string>()
  return achados.filter(
    (a) =>
      a.base64.length >= PISO_PARA_EXTRAIR_CHARS && !protegidos.has(a.base64),
  )
}

export interface AuditoriaBase64 {
  /** Quantos data URIs distintos existem no documento. */
  total: number
  /** Quantos passam do piso e serão extraídos. */
  extraiveis: number
  /** Soma dos bytes de arquivo dos extraíveis. */
  bytesExtraiveis: number
  /** Quantos chars o HTML perde com a troca (o que sai menos o que entra). */
  charsEconomizados: number
  ok: boolean
}

/**
 * O que a extração faria neste HTML, sem tocar em nada.
 *
 * `charsEconomizados` é estimado com um comprimento típico de URL do
 * Storage (~120 chars): é ordem de grandeza para a prévia, não contrato.
 */
export function auditarBase64(html: string, urlChars = 120): AuditoriaBase64 {
  const achados = encontrarDataUris(html)
  const alvos = extraiveis(achados, html)
  const economizados = alvos.reduce(
    (s, a) => s + Math.max(0, a.uri.length - urlChars),
    0,
  )
  return {
    total: achados.length,
    extraiveis: alvos.length,
    bytesExtraiveis: alvos.reduce((s, a) => s + a.bytes, 0),
    charsEconomizados: economizados,
    ok: alvos.length === 0,
  }
}

/**
 * Troca cada data URI pela URL correspondente.
 *
 * O mapa é indexado pelo BASE64, não pelo URI inteiro: o mesmo payload pode
 * aparecer com `image/png` e `image/PNG`, e são o mesmo arquivo.
 *
 * Data URI sem entrada no mapa fica INTACTO — extração parcial (uma imagem
 * falhou no upload) não pode devolver `src=""`, que é pior que o base64: o
 * base64 ao menos renderiza fora do Outlook.
 */
export function trocarDataUris(
  html: string,
  urlPorBase64: Map<string, string>,
): { html: string; trocados: number } {
  let trocados = 0
  const out = html.replace(DATA_URI_RE, (uri, _mime: string, b64: string) => {
    const url = urlPorBase64.get(b64)
    if (!url) return uri
    trocados += 1
    return url
  })
  return { html: out, trocados }
}
