/**
 * Captura das políticas PÚBLICAS da loja (Passo 16) — o I/O em volta de
 * `politicas.ts`. Lê `/policies/refund-policy` e `/policies/shipping-policy`
 * (e alternativas) pelo MESMO fetcher do conector "Internet" — a régua de
 * SSRF é a parte que não pode divergir —, extrai por regex e, quando a
 * página existe mas o número não sai, faz UMA chamada ao modelo que cita o
 * trecho literal. Grava em `client_stores.politicas`.
 *
 * Degradação declarada: coluna ausente (migration 20261153 não aplicada) →
 * não grava e loga `politicas.coluna_ausente`; loja sem URL → `sem_url`;
 * página que não existe → status em `erros[]`. Nunca lança — roda dentro
 * do orçamento da fase 1 antes do Catalogador.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { invokeAgent } from "@/lib/agents/architect/llm-invoke"
import { baixarPagina } from "@/lib/ai/web/baixar-pagina"
import { extrairPagina } from "@/lib/ai/web/web-extract"
import { checarUrlPublica } from "@/lib/ai/web/web-guard"
import { logger } from "@/lib/logger"

import {
  extrairFrete,
  extrairTroca,
  urlsDePolitica,
  type ErroDeCaptura,
  type PoliticaDeFrete,
  type PoliticaDeTroca,
  type PoliticasDaLoja,
} from "./politicas"

const log = logger.child("Politicas")
const MISSING = new Set(["42703", "PGRST204", "PGRST205"])
const TIMEOUT_PAGINA_MS = 8_000
const MAX_CHARS_PAGINA = 12_000
const MODELO_PADRAO = process.env.POLITICAS_MODELO?.trim() || "anthropic/claude-sonnet-4.6"

export type CapturaResultado =
  | { status: "ok"; politicas: PoliticasDaLoja; gravado: boolean }
  | { status: "sem_url" }
  | { status: "nada_encontrado"; politicas: PoliticasDaLoja; gravado: boolean }
  | { status: "falhou"; motivo: string }

export interface CapturaDeps {
  /** Injetável nos testes. */
  baixar?: typeof baixarPagina
  /** Injetável nos testes; `null` desliga a chamada ao modelo. */
  lerComModelo?: ((texto: string, tipo: "troca" | "frete") => Promise<Record<string, unknown> | null>) | null
  agora?: () => Date
}

async function lerPagina(
  url: string,
  deps: Required<Pick<CapturaDeps, "baixar">>,
  erros: ErroDeCaptura[],
): Promise<{ url: string; texto: string } | null> {
  const check = checarUrlPublica(url)
  if (!check.ok) {
    erros.push({ url, motivo: check.motivo })
    return null
  }
  const r = await deps.baixar(check.url, { timeoutMs: TIMEOUT_PAGINA_MS })
  if (!r.ok) {
    erros.push({ url, status: r.status ?? null, motivo: r.motivo })
    return null
  }
  const pagina = extrairPagina(r.corpo, { maxChars: MAX_CHARS_PAGINA, baseUrl: r.url })
  const texto = (pagina.texto ?? "").trim()
  if (texto.length < 40) {
    erros.push({ url, status: r.status, motivo: "página sem texto legível" })
    return null
  }
  return { url: r.url, texto }
}

/**
 * Leitura por MODELO quando a regex não extraiu número de uma página que
 * existe. Devolve só o que consegue citar; sem chave/erro → null.
 */
async function lerComModeloPadrao(texto: string, tipo: "troca" | "frete"): Promise<Record<string, unknown> | null> {
  try {
    const res = await invokeAgent(
      {
        model: MODELO_PADRAO,
        temperature: 0,
        max_tokens: 600,
        system_prompt:
          "Você lê a página de política de uma loja e devolve APENAS JSON com o que está LITERALMENTE escrito. Nunca invente número. Sem o dado, devolva null no campo.",
        user_template:
          tipo === "troca"
            ? 'Página de troca/devolução:\n<pagina>\n{{texto}}\n</pagina>\n\nResponda {"dias": <número inteiro ou null>, "trecho": "<a frase literal que diz o prazo, ou null>"}'
            : 'Página de envio:\n<pagina>\n{{texto}}\n</pagina>\n\nResponda {"gratis": <true|false|null>, "gratis_condicao": "<condição literal, ex. \\"acima de R$ 199\\", ou null>", "prazo": "<prazo literal, ex. \\"5 a 10 dias úteis\\", ou null>", "trecho": "<a frase literal, ou null>"}',
      },
      { texto: texto.slice(0, 6000) },
    )
    const inicio = res.raw.indexOf("{")
    const fim = res.raw.lastIndexOf("}")
    if (inicio < 0 || fim <= inicio) return null
    const parsed = JSON.parse(res.raw.slice(inicio, fim + 1)) as Record<string, unknown>
    return parsed && typeof parsed === "object" ? parsed : null
  } catch (err) {
    log.warn("modelo_falhou", { tipo, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

export async function capturarPoliticas(
  admin: SupabaseClient,
  storeId: string,
  deps: CapturaDeps = {},
): Promise<CapturaResultado> {
  const baixar = deps.baixar ?? baixarPagina
  const lerComModelo = deps.lerComModelo === undefined ? lerComModeloPadrao : deps.lerComModelo
  const agora = deps.agora ?? (() => new Date())
  try {
    const { data: store, error } = await admin.from("client_stores").select("id, store_url").eq("id", storeId).maybeSingle()
    if (error) return { status: "falhou", motivo: error.message }
    const storeUrl = (store as { store_url?: string | null } | null)?.store_url ?? null
    const urls = storeUrl ? urlsDePolitica(storeUrl) : null
    if (!urls) return { status: "sem_url" }

    const erros: ErroDeCaptura[] = []
    let fonte: PoliticasDaLoja["fonte"] = "pagina_publica"
    let usouModelo = false
    let regexAchou = false

    let troca: PoliticaDeTroca | null = null
    for (const url of urls.troca) {
      const pagina = await lerPagina(url, { baixar }, erros)
      if (!pagina) continue
      troca = extrairTroca(pagina.texto, pagina.url) ?? { dias: null, texto: null, url: pagina.url }
      if (troca.dias != null) regexAchou = true
      if (troca.dias == null && lerComModelo) {
        const lido = await lerComModelo(pagina.texto, "troca")
        const dias = typeof lido?.dias === "number" && Number.isFinite(lido.dias) && lido.dias > 0 ? Math.round(lido.dias) : null
        if (dias != null) {
          troca = { dias, texto: typeof lido?.trecho === "string" ? lido.trecho : troca.texto, url: pagina.url }
          usouModelo = true
        }
      }
      break
    }

    let frete: PoliticaDeFrete | null = null
    for (const url of urls.frete) {
      const pagina = await lerPagina(url, { baixar }, erros)
      if (!pagina) continue
      frete = extrairFrete(pagina.texto, pagina.url) ?? { gratis: null, gratis_condicao: null, prazo: null, texto: null, url: pagina.url }
      if (frete.gratis != null || frete.prazo != null) regexAchou = true
      if (frete.gratis == null && frete.prazo == null && lerComModelo) {
        const lido = await lerComModelo(pagina.texto, "frete")
        if (lido) {
          const gratis = typeof lido.gratis === "boolean" ? lido.gratis : null
          const prazo = typeof lido.prazo === "string" && lido.prazo.trim() ? lido.prazo.trim() : null
          if (gratis != null || prazo) {
            frete = {
              gratis,
              gratis_condicao: typeof lido.gratis_condicao === "string" && lido.gratis_condicao.trim() ? lido.gratis_condicao.trim() : null,
              prazo,
              texto: typeof lido.trecho === "string" ? lido.trecho : frete.texto,
              url: pagina.url,
            }
            usouModelo = true
          }
        }
      }
      break
    }

    // `llm` = todo número veio do modelo; `mista` = regex e modelo; senão página.
    if (usouModelo) fonte = regexAchou ? "mista" : "llm"
    const politicas: PoliticasDaLoja = { troca, frete, capturado_em: agora().toISOString(), fonte, erros }

    const gravado = await gravar(admin, storeId, politicas)
    const status = troca || frete ? "ok" : "nada_encontrado"
    log.info("captura", { storeId, status, troca_dias: troca?.dias ?? null, frete_gratis: frete?.gratis ?? null, erros: erros.length, fonte, gravado })
    return { status, politicas, gravado }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    log.warn("captura_falhou", { storeId, motivo })
    return { status: "falhou", motivo }
  }
}

async function gravar(admin: SupabaseClient, storeId: string, politicas: PoliticasDaLoja): Promise<boolean> {
  const { error } = await admin.from("client_stores").update({ politicas }).eq("id", storeId)
  if (!error) return true
  if (MISSING.has(error.code ?? "")) {
    log.warn("politicas.coluna_ausente", { storeId, hint: "aplicar a migration 20261153_client_stores_politicas" })
    return false
  }
  log.warn("gravar_falhou", { storeId, error: error.message })
  return false
}
