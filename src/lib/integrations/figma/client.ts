/**
 * Cliente HTTP mínimo da Figma REST API (somente o que a Tela 2 "Subir
 * Campanha por Loja" usa: ler frames de um arquivo + exportar PNGs).
 *
 * Token: env FIGMA_PERSONAL_TOKEN (Personal Access Token — figma.com →
 * Settings → Personal access tokens), lido A CADA chamada (Vercel pode
 * trocar env sem rebuild do módulo).
 *
 * Rate limit: a Figma responde 429 com Retry-After — honramos até 45s com
 * UM retry; acima disso lançamos FigmaError(429) e o caller degrada para
 * falha parcial (o modal oferece retry individual por loja).
 */

const FIGMA_API = "https://api.figma.com/v1"

export class FigmaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "FigmaError"
  }
}

export function isFigmaConfigured(): boolean {
  return Boolean(process.env.FIGMA_PERSONAL_TOKEN)
}

/**
 * Extrai file key (e node-id, se houver) de URLs figma.com/file/... ou
 * figma.com/design/... Retorna null quando a URL não é de arquivo Figma.
 */
export function parseFigmaUrl(
  url: string | null | undefined,
): { fileKey: string; nodeId: string | null } | null {
  if (!url) return null
  const m = url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]{10,})/)
  if (!m) return null
  let nodeId: string | null = null
  try {
    const parsed = new URL(url)
    const raw = parsed.searchParams.get("node-id")
    // Na URL o node vem como "1-23"; a API usa "1:23".
    nodeId = raw ? raw.replace(/-/g, ":") : null
  } catch {
    nodeId = null
  }
  return { fileKey: m[1], nodeId }
}

function figmaHeaders(): Record<string, string> {
  const token = process.env.FIGMA_PERSONAL_TOKEN
  if (!token) {
    throw new FigmaError(
      "FIGMA_PERSONAL_TOKEN não configurado no servidor",
      401,
    )
  }
  return { "X-Figma-Token": token }
}

async function figmaFetch(path: string, retried = false): Promise<unknown> {
  const res = await fetch(`${FIGMA_API}${path}`, { headers: figmaHeaders() })

  if (res.status === 429 && !retried) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "0")
    if (retryAfter > 0 && retryAfter <= 45) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      return figmaFetch(path, true)
    }
  }

  if (!res.ok) {
    const msgByStatus: Record<number, string> = {
      401: "Token do Figma inválido ou expirado (FIGMA_PERSONAL_TOKEN)",
      403: "Token do Figma sem acesso a este arquivo — peça acesso ao dono",
      404: "Arquivo do Figma não encontrado — confira o link",
      429: "Rate limit do Figma — tente de novo em alguns minutos",
    }
    // O Figma manda o motivo real no corpo ({ err } ou { message }) —
    // anexar em vez de engolir (ex.: 400 "Render request too large").
    let detail = ""
    try {
      const body = (await res.json()) as { err?: string; message?: string }
      detail = body.err || body.message || ""
    } catch {
      // corpo não-JSON — segue sem detalhe
    }
    const base = msgByStatus[res.status] ?? `Figma respondeu ${res.status}`
    throw new FigmaError(detail ? `${base}: ${detail}` : base, res.status)
  }
  return res.json()
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

export interface FigmaFile {
  name: string
  document: FigmaNode
}

/** GET /v1/files/:key — depth=2 traz páginas + frames top-level (suficiente). */
export async function figmaGetFile(
  fileKey: string,
  opts: { depth?: number } = {},
): Promise<FigmaFile> {
  const depth = opts.depth ?? 2
  return (await figmaFetch(`/files/${fileKey}?depth=${depth}`)) as FigmaFile
}

/**
 * GET /v1/images/:key — exporta nodes como PNG e devolve node_id → URL S3
 * temporária (ou null quando o node falhou ao renderizar). Chunk defensivo
 * de 50 ids por chamada.
 */
export async function figmaExportImages(
  fileKey: string,
  nodeIds: string[],
  opts: { scale?: number; format?: "png" | "jpg" } = {},
): Promise<Record<string, string | null>> {
  const scale = opts.scale ?? 2
  const format = opts.format ?? "png"
  const out: Record<string, string | null> = {}

  for (let i = 0; i < nodeIds.length; i += 50) {
    const chunk = nodeIds.slice(i, i + 50)
    const data = (await figmaFetch(
      `/images/${fileKey}?ids=${encodeURIComponent(chunk.join(","))}&format=${format}&scale=${scale}`,
    )) as { err?: string | null; images?: Record<string, string | null> }
    if (data.err) throw new FigmaError(`Figma export: ${data.err}`, 500)
    Object.assign(out, data.images ?? {})
  }
  return out
}
