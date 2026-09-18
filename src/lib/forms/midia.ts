/**
 * A mídia de uma tela — a imagem ou o vídeo acima do título.
 *
 * É o que separa um funil que parece feito por gente de um formulário
 * genérico: o rosto de quem fala na abertura, o print do dashboard
 * embaixo da conta que o formulário acabou de fazer, a cláusula do
 * contrato ao lado da garantia.
 *
 * ## A URL é a parte perigosa
 *
 * Ela é gravada por quem edita e vai parar num `src` de uma página
 * PÚBLICA. É o segundo lugar do módulo onde um endereço digitado entra
 * no navegador de um visitante — o primeiro é o destino do final, e a
 * régua aqui é a mesma: `javascript:` e `data:` fora, `http`/`https`
 * dentro. `data:` fica de fora também por tamanho: um vídeo embutido em
 * base64 no schema publicado é um documento de megabytes servido em
 * toda visita.
 *
 * ## Vídeo é ARQUIVO, não player de terceiro
 *
 * `<video src>` toca mp4/webm servido por nós. Embutir YouTube ou Vimeo
 * exigiria `<iframe>`, e um iframe de terceiro numa página que carrega o
 * pixel e coleta contato é outra decisão de privacidade — e outra
 * conversa com o CSP. Quem quiser o vídeo do YouTube na abertura sobe o
 * arquivo; é o que mantém a página inteira sob o nosso domínio.
 */

export const TIPOS_DE_MIDIA = ["imagem", "video"] as const
export type TipoDeMidia = (typeof TIPOS_DE_MIDIA)[number]

export interface MidiaDaTela {
  tipo: TipoDeMidia
  url: string
  /**
   * Texto alternativo da imagem. Ausente vira string vazia, que é o
   * certo para imagem DECORATIVA — o leitor de tela pula em vez de ler
   * o nome do arquivo. Print que carrega informação deve ter alt.
   */
  alt?: string | null
  /**
   * Vídeo: começa sozinho, sem som. É o padrão de vídeo de abertura —
   * som automático faz a pessoa fechar a aba. O controle continua na
   * tela para quem quiser ouvir.
   */
  autoplay?: boolean
  /** Cartaz do vídeo enquanto ele não carrega. */
  poster?: string | null
}

const ESQUEMAS_PERMITIDOS = new Set(["http:", "https:"])

/**
 * Endereço utilizável numa página pública.
 *
 * Caminho relativo (`/uploads/x.png`) passa: é arquivo do nosso próprio
 * domínio, que é o caso mais comum depois do upload. O que não passa é
 * esquema executável, e a checagem é pelo ESQUEMA resolvido, não por
 * prefixo de texto — `JaVaScRiPt:` e `java\nscript:` escapariam de um
 * `startsWith`.
 */
export function urlDeMidiaUtil(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false
  const limpo = url.trim()
  if (!limpo) return false
  if (limpo.startsWith("/") && !limpo.startsWith("//")) return true
  try {
    return ESQUEMAS_PERMITIDOS.has(new URL(limpo).protocol)
  } catch {
    return false
  }
}

/**
 * Normaliza o que veio do banco ou do editor. Devolve `null` quando não
 * dá para exibir — mídia recusada some da tela, e a tela continua
 * funcionando, porque a pergunta nunca dependeu dela.
 */
export function normalizarMidia(raw: unknown): MidiaDaTela | null {
  if (!raw || typeof raw !== "object") return null
  const m = raw as Record<string, unknown>
  const url = typeof m.url === "string" ? m.url.trim() : ""
  if (!urlDeMidiaUtil(url)) return null

  const tipoBruto = typeof m.tipo === "string" ? m.tipo : ""
  const tipo: TipoDeMidia = (TIPOS_DE_MIDIA as readonly string[]).includes(tipoBruto)
    ? (tipoBruto as TipoDeMidia)
    : tipoDaExtensao(url)

  const poster = typeof m.poster === "string" ? m.poster.trim() : ""

  return {
    tipo,
    url,
    alt: typeof m.alt === "string" ? m.alt : null,
    ...(m.autoplay === true ? { autoplay: true } : {}),
    ...(poster && urlDeMidiaUtil(poster) ? { poster } : {}),
  }
}

const EXTENSOES_DE_VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i

/**
 * Tipo omitido é deduzido da extensão, e a dúvida cai em IMAGEM: uma
 * imagem dentro de `<video>` não aparece, enquanto um vídeo dentro de
 * `<img>` ao menos mostra o poster do navegador — errar para o lado que
 * some é pior.
 */
function tipoDaExtensao(url: string): TipoDeMidia {
  return EXTENSOES_DE_VIDEO.test(url) ? "video" : "imagem"
}
