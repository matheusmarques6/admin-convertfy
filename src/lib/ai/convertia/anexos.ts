/**
 * Regras dos anexos da ConvertIA — PURO, sem DOM e sem I/O.
 *
 * O limite que o usuário via ("imagem acima de 2MB", "máximo de 3 anexos")
 * não era uma regra de produto: era o **corpo da requisição**. A imagem
 * viaja em base64 dentro do JSON do POST, base64 infla ~33%, e a Vercel
 * corta o corpo em 4,5 MB — devolvendo 413 ANTES do nosso código, sem log
 * e sem retry (a mesma armadilha do `MESSAGES_SET` do WhatsApp).
 *
 * A saída não é afrouxar o número e torcer: é **fazer o tamanho parar de
 * importar**. O navegador reduz a imagem antes de enviar (ver
 * `anexo-preparar.ts`), então o usuário anexa a foto de 12 MB do celular e
 * o que sai daqui tem algumas centenas de KB. O que resta é o orçamento
 * do payload, medido aqui — e ele é do CONJUNTO, não de cada arquivo:
 * dez imagens de 400 KB estouram o que uma de 3 MB não estoura.
 *
 * `LADO_MAXIMO_PX` não é chute de compressão: acima de ~1568px no lado
 * maior os modelos de visão reduzem a imagem no servidor deles de
 * qualquer jeito. Mandar mais que isso é pagar tráfego por pixel que o
 * modelo descarta.
 */

/** Quantos arquivos por mensagem. O freio de verdade é o orçamento abaixo. */
export const MAX_ANEXOS = 10

/** Lado maior de uma imagem depois da redução (ver nota acima). */
export const LADO_MAXIMO_PX = 1568

/**
 * Teto do CONJUNTO de anexos, em caracteres da data URL — que é
 * exatamente o que ocupa no JSON. 3,6 MB deixa folga para a mensagem, o
 * histórico e os cabeçalhos dentro dos 4,5 MB da Vercel.
 */
export const ORCAMENTO_PAYLOAD = 3_600_000

/** Alvo por imagem depois da redução. Não é limite: é o que a busca de qualidade persegue. */
export const ALVO_POR_IMAGEM = 600_000

/** Teto por imagem. Acima disto a redução desiste e o arquivo é recusado. */
export const TETO_POR_IMAGEM = 1_400_000

/**
 * Texto extraído (de .txt, .csv, .docx, .pdf…) que entra INLINE no
 * histórico. 300 mil caracteres já são ~75 mil tokens — o limite aqui é o
 * contexto do modelo, não o transporte.
 */
export const MAX_TEXTO_CHARS = 300_000

export type TipoAnexo = "imagem" | "texto" | "planilha" | "documento" | "pdf"

/** Extensões lidas como texto cru (código e configuração incluídos). */
export const EXTENSOES_TEXTO = [
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yml", "yaml",
  "html", "htm", "css", "scss", "less", "svg",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt",
  "php", "sh", "bash", "zsh", "sql", "graphql", "gql", "toml", "ini", "conf",
  "env", "log", "srt", "vtt",
] as const

/**
 * Imagens por EXTENSÃO — o mime sozinho não basta: arrastar de alguns
 * aplicativos entrega o arquivo com `type` vazio, e aí `foto.png` caía em
 * "formato não suportado".
 */
const EXTENSOES_IMAGEM = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "heif"] as const
const EXTENSOES_PLANILHA = ["xlsx", "xlsm", "xls", "ods"] as const
const EXTENSOES_DOCUMENTO = ["docx"] as const

function extensao(nome: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nome.trim())
  return m ? m[1].toLowerCase() : ""
}

/**
 * O que sabemos fazer com este arquivo. `null` = não sabemos — e aí a UI
 * diz o formato pelo nome, em vez de "arquivo inválido".
 *
 * A EXTENSÃO decide antes do mime: navegador e sistema operacional
 * discordam demais sobre o mime de .csv, .md e .ts (esse último costuma
 * vir como `video/mp2t`, do MPEG transport stream — classificar por mime
 * recusaria todo arquivo TypeScript).
 */
export function classificarArquivo(nome: string, mime = ""): TipoAnexo | null {
  const ext = extensao(nome)
  if ((EXTENSOES_IMAGEM as readonly string[]).includes(ext)) return "imagem"
  if ((EXTENSOES_PLANILHA as readonly string[]).includes(ext)) return "planilha"
  if ((EXTENSOES_DOCUMENTO as readonly string[]).includes(ext)) return "documento"
  if (ext === "pdf") return "pdf"
  if ((EXTENSOES_TEXTO as readonly string[]).includes(ext)) return "texto"
  // Sem extensão conhecida, o mime decide — é o caso do "Colar" (a imagem
  // da área de transferência chega como `image.png` genérico) e o do
  // arquivo baixado sem extensão.
  if (mime.startsWith("image/")) return "imagem"
  if (mime === "application/pdf") return "pdf"
  if (mime.startsWith("text/") || /^application\/(json|xml|x-yaml|javascript)/.test(mime)) return "texto"
  if (/spreadsheet|excel/.test(mime)) return "planilha"
  if (/wordprocessingml/.test(mime)) return "documento"
  return null
}

/** O `accept` do <input type="file">, derivado da mesma lista — nunca à mão. */
export const ACCEPT_ANEXOS = [
  "image/*",
  "application/pdf",
  ".xlsx", ".xlsm", ".xls", ".ods", ".docx",
  ...EXTENSOES_TEXTO.map((e) => `.${e}`),
].join(",")

/**
 * Quanto o anexo ocupa no corpo da requisição.
 *
 * Para imagem é o comprimento da data URL: ela é ASCII e vai literalmente
 * assim dentro do JSON. Medir os bytes do arquivo ORIGINAL subestimaria
 * em 33% e é como se estoura o limite sem perceber.
 */
export function pesoDoAnexo(a: { data_url?: string; text?: string }): number {
  return (a.data_url?.length ?? 0) + (a.text?.length ?? 0)
}

export function pesoTotal(anexos: Array<{ data_url?: string; text?: string }>): number {
  return anexos.reduce((s, a) => s + pesoDoAnexo(a), 0)
}

export function cabeNoOrcamento(
  atuais: Array<{ data_url?: string; text?: string }>,
  novoPeso: number,
): boolean {
  return pesoTotal(atuais) + novoPeso <= ORCAMENTO_PAYLOAD
}

/** "1,4 MB" — para a mensagem de erro dizer o tamanho de verdade. */
export function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}

/**
 * Corta o texto no limite do contexto e DIZ que cortou.
 *
 * Sem a marca, o modelo conclui a partir de metade da planilha achando
 * que leu tudo — o mesmo motivo do `truncado` no `web_abrir`.
 */
export function limitarTexto(texto: string, max = MAX_TEXTO_CHARS): string {
  if (texto.length <= max) return texto
  return (
    texto.slice(0, max) +
    `\n\n[… cortado: o arquivo tem ${texto.length.toLocaleString("pt-BR")} caracteres e ` +
    `só os primeiros ${max.toLocaleString("pt-BR")} couberam. Diga isso se a resposta ` +
    `depender do trecho que ficou de fora.]`
  )
}

/** Lado da imagem depois de caber em `LADO_MAXIMO_PX`, preservando a proporção. */
export function dimensaoReduzida(
  largura: number,
  altura: number,
  ladoMax = LADO_MAXIMO_PX,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura)
  if (maior <= ladoMax || maior === 0) return { largura, altura }
  const f = ladoMax / maior
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) }
}
