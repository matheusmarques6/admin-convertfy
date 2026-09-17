/**
 * baixarPagina — o fetch de página pública com a régua de SSRF aplicada a
 * CADA salto. Extraído do conector "Internet" (Passo 16) para a captura de
 * políticas da loja reusar o mesmo caminho: um segundo fetcher divergiria
 * na primeira mudança, e a régua é a parte que não pode divergir.
 *
 *  - `redirect: "manual"`: o `fetch` seguiria o 302 sozinho e a URL final
 *    nunca passaria pelo guard — é exatamente por onde o SSRF entraria.
 *  - 401/403 é dito como recusa do site, não como "página vazia".
 *  - PDF/imagem/vídeo ficam de fora; dizer isso é melhor que devolver lixo.
 */

import { checarRedirecionamento } from "./web-guard"

export const TIMEOUT_MS = 20_000
export const MAX_BYTES = 3_000_000
export const MAX_REDIRECIONAMENTOS = 4

/** Tipos que viram texto. */
export function tipoLegivel(contentType: string): "html" | "texto" | "json" | null {
  const t = contentType.toLowerCase()
  if (t.includes("html") || t.includes("xhtml")) return "html"
  if (t.includes("json")) return "json"
  if (t.startsWith("text/") || t.includes("xml")) return "texto"
  return null
}

export type PaginaBaixada =
  | { ok: true; url: string; status: number; tipo: string; corpo: string }
  | { ok: false; motivo: string; status?: number }

export async function baixarPagina(alvo: URL, opts: { timeoutMs?: number } = {}): Promise<PaginaBaixada> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  let atual = alvo
  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let resp: Response
    try {
      resp = await fetch(atual.toString(), {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          // User-agent honesto: muitos sites recusam o default do runtime,
          // e mentir sobre ser um navegador é o começo de outro problema.
          "User-Agent": "ConvertfyBot/1.0 (+https://convertfy.com.br; leitura para assistente interno)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.5",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        motivo: msg.includes("abort")
          ? `A página não respondeu em ${timeoutMs / 1000}s.`
          : `Não consegui acessar: ${msg}`,
      }
    } finally {
      clearTimeout(timer)
    }

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location")
      if (!location) return { ok: false, motivo: `Redirecionamento ${resp.status} sem destino.`, status: resp.status }
      const check = checarRedirecionamento(location, atual)
      if (!check.ok) return { ok: false, motivo: `Redirecionamento recusado: ${check.motivo}`, status: resp.status }
      atual = check.url
      continue
    }

    if (resp.status === 403 || resp.status === 401) {
      return {
        ok: false,
        status: resp.status,
        motivo: `O site recusou o acesso (HTTP ${resp.status}) — provavelmente exige login ou bloqueia leitura automática. Diga isso ao usuário em vez de descrever a página de memória.`,
      }
    }
    if (!resp.ok) return { ok: false, motivo: `A página respondeu HTTP ${resp.status}.`, status: resp.status }

    const contentType = resp.headers.get("content-type") ?? ""
    const tipo = tipoLegivel(contentType)
    if (!tipo) {
      return {
        ok: false,
        status: resp.status,
        motivo: `O conteúdo é ${contentType.split(";")[0] || "de tipo desconhecido"}, que não dá para ler como texto (PDF, imagem e vídeo ficam de fora).`,
      }
    }

    const tamanho = Number(resp.headers.get("content-length") ?? 0)
    if (tamanho > MAX_BYTES) {
      return { ok: false, status: resp.status, motivo: `A página tem ${Math.round(tamanho / 1e6)} MB — grande demais para ler.` }
    }

    const bruto = await resp.text()
    return {
      ok: true,
      url: atual.toString(),
      status: resp.status,
      tipo,
      corpo: bruto.slice(0, MAX_BYTES),
    }
  }
  return { ok: false, motivo: `Mais de ${MAX_REDIRECIONAMENTOS} redirecionamentos — desisti.` }
}
