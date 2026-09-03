/**
 * Leitura do link do Fathom colado pelo operador (puro, client-safe).
 *
 * O Fathom expõe a mesma reunião por caminhos diferentes e só um deles
 * carrega o id numérico da gravação:
 *
 *   https://fathom.video/calls/123456789          → recording_id direto
 *   https://fathom.video/share/abc123xyz          → só o slug público
 *   https://fathom.video/share/abc123?timestamp=1 → idem, com query
 *
 * Quem tem id vai direto no endpoint da gravação; quem só tem slug
 * precisa ser casado contra a lista de meetings (o cliente da API faz
 * isso). Aceita link com ou sem protocolo e com espaços em volta —
 * campo colado à mão erra nessas duas coisas o tempo todo.
 */

export type FathomLink =
  | { kind: "recording"; recordingId: string; url: string }
  | { kind: "share"; slug: string; url: string }

const HOST_RE = /^(?:www\.)?fathom\.(?:video|ai)$/i

export function parseFathomUrl(input: string): FathomLink | null {
  const raw = (input ?? "").trim()
  if (!raw) return null
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return null
  }
  if (!HOST_RE.test(parsed.hostname)) return null

  const segments = parsed.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null

  const [head, value] = segments
  const url = `${parsed.origin}${parsed.pathname}`

  // /calls/123 e /recordings/123 carregam o id numérico
  if ((head === "calls" || head === "recordings") && /^\d+$/.test(value)) {
    return { kind: "recording", recordingId: value, url }
  }
  // /share/<slug> — slug alfanumérico do link público
  if (head === "share" && /^[A-Za-z0-9_-]{4,}$/.test(value)) {
    return { kind: "share", slug: value, url }
  }
  return null
}

/** Mensagem de erro para o operador quando o link não serve. */
export const FATHOM_LINK_HINT =
  "Link do Fathom inválido. Cole o link da gravação (fathom.video/calls/123456789) ou o link de compartilhamento (fathom.video/share/abc123)."
