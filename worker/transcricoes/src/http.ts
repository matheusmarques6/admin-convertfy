/**
 * Servidor HTTP mínimo do worker.
 *
 * Existe por um motivo só: a prévia do modal "Nova transcrição" precisa de
 * `yt-dlp --dump-json`, e o admin roda na Vercel, onde não há binário. O
 * admin chama aqui; sem `WORKER_URL` configurada ele cai no oEmbed da
 * própria plataforma (título, canal e capa reais, sem duração).
 *
 * Autenticação por segredo compartilhado: o endpoint faz o servidor buscar
 * uma URL arbitrária, então não pode ficar aberto.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { lerMetadados } from "./media.ts"

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }))

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto) })
  res.end(texto)
}

/** Comparação de tempo constante: o segredo não vaza por tempo de resposta. */
function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diff === 0
}

export function iniciarHttp(porta: number, estado: () => { emProcessamento: number }): void {
  const segredo = process.env.WORKER_SHARED_SECRET
  if (!segredo) {
    log("HTTP desligado: WORKER_SHARED_SECRET não definido")
    return
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost")

    // Saúde não pede segredo: é o que o orquestrador do container consulta.
    if (url.pathname === "/saude") {
      json(res, 200, { ok: true, ...estado() })
      return
    }

    if (!segredoConfere(req.headers["x-worker-secret"] as string | undefined, segredo)) {
      json(res, 401, { erro: "não autorizado" })
      return
    }

    if (url.pathname === "/previa" && req.method === "GET") {
      const alvo = url.searchParams.get("url")
      if (!alvo) {
        json(res, 400, { erro: "faltou a url" })
        return
      }
      lerMetadados(alvo)
        .then((m) => json(res, 200, { ok: true, ...m }))
        .catch((e) => json(res, 200, { ok: false, erro: e instanceof Error ? e.message : String(e) }))
      return
    }

    json(res, 404, { erro: "rota desconhecida" })
  })

  server.listen(porta, () => log("HTTP ouvindo", { porta }))
}
