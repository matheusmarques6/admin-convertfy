/**
 * Busca na web para a ConvertIA — provedor PLUGÁVEL.
 *
 * Nenhum dos provedores decentes é grátis sem cadastro, e amarrar o
 * código a um deles obrigaria a trocar código para trocar de conta. A
 * escolha aqui é por VARIÁVEL: o primeiro provedor com chave vence, na
 * ordem abaixo, e trocar de fornecedor é trocar a variável no Vercel.
 *
 *   1. TAVILY_API_KEY   — feito para LLM: devolve o conteúdo já extraído
 *                         junto do resultado (1.000 buscas/mês grátis).
 *   2. BRAVE_SEARCH_API_KEY — índice próprio, 2.000 buscas/mês grátis.
 *   3. SERPER_API_KEY   — resultados do Google (2.500 grátis na entrada).
 *
 * Sem nenhuma chave a tool NÃO devolve lista vazia: diz que a busca não
 * está configurada e qual variável criar. Vazio silencioso seria lido
 * pelo modelo como "a internet não tem nada sobre isso".
 */

import { logger } from "@/lib/logger"

const log = logger.child("WebSearch")

const TIMEOUT_MS = 15_000

export type ProvedorBusca = "tavily" | "brave" | "serper"

export interface ResultadoBusca {
  titulo: string
  url: string
  trecho: string
  publicadoEm?: string | null
}

export interface RespostaBusca {
  ok: true
  provedor: ProvedorBusca
  resultados: ResultadoBusca[]
}
export interface FalhaBusca {
  ok: false
  motivo: string
  /** true = falta configurar (ação humana), não falha transitória. */
  naoConfigurado?: boolean
}

/** PURA. Qual provedor está de fato utilizável, na ordem de preferência. */
export function escolherProvedor(env: NodeJS.ProcessEnv = process.env): ProvedorBusca | null {
  if (env.TAVILY_API_KEY?.trim()) return "tavily"
  if (env.BRAVE_SEARCH_API_KEY?.trim()) return "brave"
  if (env.SERPER_API_KEY?.trim()) return "serper"
  return null
}

function texto(v: unknown, max = 600): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** PURA. Normaliza as três formas de resposta para o mesmo formato. */
export function normalizarResultados(provedor: ProvedorBusca, json: unknown, limite: number): ResultadoBusca[] {
  const raiz = (json ?? {}) as Record<string, unknown>
  let cru: unknown[] = []
  if (provedor === "tavily") cru = Array.isArray(raiz.results) ? raiz.results : []
  else if (provedor === "brave") {
    const web = raiz.web as Record<string, unknown> | undefined
    cru = Array.isArray(web?.results) ? (web!.results as unknown[]) : []
  } else {
    cru = Array.isArray(raiz.organic) ? (raiz.organic as unknown[]) : []
  }

  const out: ResultadoBusca[] = []
  for (const item of cru) {
    const r = (item ?? {}) as Record<string, unknown>
    const url = texto(r.url ?? r.link, 500)
    if (!url) continue
    out.push({
      titulo: texto(r.title, 200) || url,
      url,
      // Tavily manda `content` (extraído da página), Brave `description`,
      // Serper `snippet`. É o mesmo papel com três nomes.
      trecho: texto(r.content ?? r.description ?? r.snippet, 800),
      publicadoEm: texto(r.published_date ?? r.page_age ?? r.date, 40) || null,
    })
    if (out.length >= limite) break
  }
  return out
}

async function chamar(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
    if (!resp.ok) {
      const corpo = (await resp.text().catch(() => "")).slice(0, 200)
      throw new Error(`HTTP ${resp.status}${corpo ? `: ${corpo}` : ""}`)
    }
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function buscarNaWeb(
  query: string,
  opts: { limite?: number; idioma?: string } = {},
): Promise<RespostaBusca | FalhaBusca> {
  const q = query.trim()
  if (!q) return { ok: false, motivo: "Consulta vazia." }
  const limite = Math.min(Math.max(opts.limite ?? 5, 1), 10)
  const provedor = escolherProvedor()

  if (!provedor) {
    return {
      ok: false,
      naoConfigurado: true,
      motivo:
        "A busca na web ainda não está configurada nesta instalação. Um administrador precisa criar " +
        "uma das variáveis no Vercel: TAVILY_API_KEY (recomendada, 1.000 buscas/mês grátis), " +
        "BRAVE_SEARCH_API_KEY (2.000/mês) ou SERPER_API_KEY. Diga isso ao usuário — a ferramenta de " +
        "abrir página (web_abrir) continua funcionando com uma URL conhecida.",
    }
  }

  try {
    let json: unknown
    if (provedor === "tavily") {
      json = await chamar("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        },
        body: JSON.stringify({ query: q, max_results: limite, search_depth: "basic" }),
      })
    } else if (provedor === "brave") {
      const u = new URL("https://api.search.brave.com/res/v1/web/search")
      u.searchParams.set("q", q)
      u.searchParams.set("count", String(limite))
      if (opts.idioma) u.searchParams.set("search_lang", opts.idioma)
      json = await chamar(u.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY as string,
        },
      })
    } else {
      json = await chamar("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": process.env.SERPER_API_KEY as string,
        },
        body: JSON.stringify({ q, num: limite, hl: opts.idioma ?? "pt-br" }),
      })
    }
    return { ok: true, provedor, resultados: normalizarResultados(provedor, json, limite) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("busca na web falhou", { provedor, error: msg })
    return {
      ok: false,
      motivo: msg.includes("abort") ? `A busca demorou mais de ${TIMEOUT_MS / 1000}s.` : `Busca falhou (${provedor}): ${msg}`,
    }
  }
}
