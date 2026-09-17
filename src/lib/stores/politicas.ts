/**
 * Políticas PÚBLICAS da loja — módulo PURO (client-safe). Passo 16, 14/09.
 *
 * O que é: troca/devolução e frete lidos das páginas públicas da loja
 * (`/policies/refund-policy`, `/policies/shipping-policy` no Shopify), com
 * a URL de onde cada fato saiu. A faixa de garantias da Hero Boxers foi
 * podada porque ninguém tinha o fato de troca — a página pública tem.
 *
 * Coluna SEPARADA da `ficha_operacional`, de propósito: a ficha é
 * VERIFICADA pelo time e carimba `lastro_operacional.verificado = true` no
 * catálogo; captura automática não pode ganhar esse selo. Precedência de
 * leitura, onde as duas existem: ficha > políticas. O que sai daqui vira
 * `insumos_permitidos` do Seletor com a URL entre parênteses (a régua de
 * `seletor-regras` exige origem declarada) e sugestão de ficha na tela.
 */

import type { FichaOperacional } from "./ficha-operacional"

export interface PoliticaDeTroca {
  dias: number | null
  texto: string | null
  url: string
}

export interface PoliticaDeFrete {
  gratis: boolean | null
  /** Condição do frete grátis, quando a página a declara ("acima de R$ 199"). */
  gratis_condicao: string | null
  prazo: string | null
  texto: string | null
  url: string
}

export type FontePolitica = "pagina_publica" | "llm" | "mista"

export interface ErroDeCaptura {
  url: string
  status?: number | null
  motivo: string
}

export interface PoliticasDaLoja {
  troca: PoliticaDeTroca | null
  frete: PoliticaDeFrete | null
  capturado_em: string
  fonte: FontePolitica
  erros: ErroDeCaptura[]
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Normaliza qualquer forma gravada. Fail-open: lixo vira null; nunca lança. */
export function normalizarPoliticas(raw: unknown): PoliticasDaLoja | null {
  const r = obj(raw)
  if (!r) return null
  const troca = obj(r.troca)
  const frete = obj(r.frete)
  const out: PoliticasDaLoja = {
    troca: troca && str(troca.url) ? { dias: num(troca.dias), texto: str(troca.texto), url: str(troca.url)! } : null,
    frete:
      frete && str(frete.url)
        ? {
            gratis: typeof frete.gratis === "boolean" ? frete.gratis : null,
            gratis_condicao: str(frete.gratis_condicao),
            prazo: str(frete.prazo),
            texto: str(frete.texto),
            url: str(frete.url)!,
          }
        : null,
    capturado_em: str(r.capturado_em) ?? "",
    fonte: r.fonte === "llm" || r.fonte === "mista" ? r.fonte : "pagina_publica",
    erros: Array.isArray(r.erros)
      ? r.erros
          .map((e) => obj(e))
          .filter((e): e is Record<string, unknown> => !!e && !!str(e.url))
          .map((e) => ({ url: str(e.url)!, status: num(e.status), motivo: str(e.motivo) ?? "" }))
      : [],
  }
  if (!out.troca && !out.frete && out.erros.length === 0) return null
  return out
}

export function politicasVazias(p: PoliticasDaLoja | null | undefined): boolean {
  return !p || (!p.troca && !p.frete)
}

/**
 * As URLs candidatas, na ordem de tentativa. As duas primeiras são o padrão
 * do Shopify (62 das 63 lojas da carteira); as demais cobrem loja com
 * página própria. Domínio próprio que redireciona é seguido pelo fetcher
 * (cada salto passa pela régua de SSRF).
 */
export function urlsDePolitica(storeUrl: string): { troca: string[]; frete: string[] } | null {
  const base = baseDaLoja(storeUrl)
  if (!base) return null
  return {
    troca: [
      `${base}/policies/refund-policy`,
      `${base}/pages/trocas-e-devolucoes`,
      `${base}/pages/troca-e-devolucao`,
      `${base}/pages/returns`,
      `${base}/pages/refund-policy`,
    ],
    frete: [
      `${base}/policies/shipping-policy`,
      `${base}/pages/frete-e-entrega`,
      `${base}/pages/entrega`,
      `${base}/pages/shipping`,
      `${base}/pages/shipping-policy`,
    ],
  }
}

export function baseDaLoja(storeUrl: string | null | undefined): string | null {
  const t = (storeUrl ?? "").trim()
  if (!t) return null
  const comProtocolo = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(comProtocolo)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

// ── Extração por regex (pt, en, pl, da — os idiomas da carteira) ───────

const DIAS_RE =
  /(\d{1,3})\s*(?:dias?|days?|dni|dzień|dage|dag)\b/i
const TROCA_ANCORA_RE =
  /\b(?:troca|trocas|devolu[cç][aã]o|devolu[cç][oõ]es|return|returns|refund|refunds|exchange|zwrot|zwroty|wymian|retur|refundering|bytte)\b/i
const GRATIS_RE =
  /\b(?:frete\s+gr[aá]tis|entrega\s+gr[aá]tis|free\s+shipping|free\s+delivery|darmowa\s+(?:dostawa|wysy[łl]ka)|gratis\s+fragt|fri\s+fragt|gratis\s+levering)\b/i
const GRATIS_CONDICAO_RE =
  /(?:frete\s+gr[aá]tis|free\s+shipping|free\s+delivery|darmowa\s+(?:dostawa|wysy[łl]ka)|gratis\s+fragt|fri\s+fragt)[^.\n]{0,60}?(?:acima\s+de|a\s+partir\s+de|em\s+compras\s+(?:acima|a\s+partir)\s+de|on\s+orders\s+over|over|above|for\s+orders\s+over|od|powy[żz]ej|over|ved\s+k[øo]b\s+over)\s*((?:R\$|US\$|\$|€|£|zł|kr\.?)\s?\d[\d.,]*|\d[\d.,]*\s?(?:R\$|USD|EUR|GBP|PLN|DKK|zł|kr))/i
const PRAZO_RE =
  /(\d{1,2}\s*(?:a|-|–|to|do|til)\s*\d{1,2}\s*(?:dias?\s*[uú]teis|dias?|business\s+days|working\s+days|days|dni\s+roboczych|dni|hverdage|dage))|(\d{1,2}\s*(?:dias?\s*[uú]teis|business\s+days|working\s+days|dni\s+roboczych|hverdage))/i

/** Uma janela de texto em volta de um match, limpa. */
function trecho(texto: string, indice: number, raio = 140): string {
  const inicio = Math.max(0, indice - raio)
  const fim = Math.min(texto.length, indice + raio)
  return texto.slice(inicio, fim).replace(/\s+/g, " ").trim()
}

export function extrairTroca(texto: string, url: string): PoliticaDeTroca | null {
  const t = (texto ?? "").replace(/\s+/g, " ")
  if (!t.trim()) return null
  // Só conta "N dias" quando a âncora de troca está perto (±200 chars):
  // "30 dias" solto numa página de frete é prazo de entrega, não de troca.
  let melhor: { dias: number; idx: number } | null = null
  for (const m of t.matchAll(new RegExp(DIAS_RE.source, "gi"))) {
    const idx = m.index ?? 0
    const janela = t.slice(Math.max(0, idx - 200), idx + 200)
    if (!TROCA_ANCORA_RE.test(janela)) continue
    const dias = Number(m[1])
    if (!Number.isFinite(dias) || dias <= 0 || dias > 365) continue
    if (!melhor) melhor = { dias, idx }
  }
  if (melhor) return { dias: melhor.dias, texto: trecho(t, melhor.idx), url }
  const ancora = TROCA_ANCORA_RE.exec(t)
  if (ancora) return { dias: null, texto: trecho(t, ancora.index ?? 0), url }
  return null
}

export function extrairFrete(texto: string, url: string): PoliticaDeFrete | null {
  const t = (texto ?? "").replace(/\s+/g, " ")
  if (!t.trim()) return null
  const gratis = GRATIS_RE.exec(t)
  const condicao = GRATIS_CONDICAO_RE.exec(t)
  const prazo = PRAZO_RE.exec(t)
  if (!gratis && !prazo) return null
  const idx = gratis?.index ?? prazo?.index ?? 0
  return {
    gratis: gratis ? true : null,
    gratis_condicao: condicao ? condicao[1].trim().replace(/[.,;:]+$/, "") : null,
    prazo: prazo ? (prazo[1] ?? prazo[2]).trim() : null,
    texto: trecho(t, idx),
    url,
  }
}

// ── Consumo ──────────────────────────────────────────────────────────────

/**
 * Insumos para o Seletor, no formato que `seletor-regras` exige: fato com
 * a origem entre parênteses. Sem número extraível o insumo ainda entra
 * (a página EXISTE), mas diz que o prazo não foi lido.
 */
export function montarInsumos(p: PoliticasDaLoja | null | undefined): string[] {
  if (!p) return []
  const out: string[] = []
  if (p.troca) {
    out.push(
      p.troca.dias != null
        ? `Política de troca/devolução de ${p.troca.dias} dias, publicada na loja (${p.troca.url})`
        : `A loja publica política de troca/devolução; prazo não lido automaticamente (${p.troca.url})`,
    )
  }
  if (p.frete) {
    const partes: string[] = []
    if (p.frete.gratis) partes.push(`frete grátis${p.frete.gratis_condicao ? ` acima de ${p.frete.gratis_condicao}` : ""}`)
    if (p.frete.prazo) partes.push(`prazo de entrega ${p.frete.prazo}`)
    out.push(
      partes.length > 0
        ? `Política de envio publicada na loja: ${partes.join("; ")} (${p.frete.url})`
        : `A loja publica política de envio; prazo/frete não lidos automaticamente (${p.frete.url})`,
    )
  }
  return out
}

/** Bloco `<politicas_publicas>` do Catalogador. Ausência declarada. */
export function politicasParaPrompt(p: PoliticasDaLoja | null | undefined): string {
  if (!p || politicasVazias(p)) {
    return "(nenhuma página de política pública lida — troca e frete só entram se estiverem na ficha operacional ou literalmente na pesquisa)"
  }
  const linhas: string[] = []
  if (p.troca) {
    linhas.push(`- troca/devolução: ${p.troca.dias != null ? `${p.troca.dias} dias` : "prazo não lido"} — fonte ${p.troca.url}`)
    if (p.troca.texto) linhas.push(`  trecho: "${p.troca.texto.slice(0, 280)}"`)
  }
  if (p.frete) {
    const partes: string[] = []
    if (p.frete.gratis) partes.push(`frete grátis${p.frete.gratis_condicao ? ` acima de ${p.frete.gratis_condicao}` : ""}`)
    if (p.frete.prazo) partes.push(`prazo ${p.frete.prazo}`)
    linhas.push(`- envio: ${partes.join("; ") || "detalhes não lidos"} — fonte ${p.frete.url}`)
    if (p.frete.texto) linhas.push(`  trecho: "${p.frete.texto.slice(0, 280)}"`)
  }
  linhas.push(`- capturado em ${p.capturado_em || "?"} (${p.fonte}). Lido da página pública: NÃO verificado pelo time — cite com a URL, não como fato confirmado.`)
  return linhas.join("\n")
}

/** Sugestão de ficha a partir das políticas (quem salva confirma). */
export function politicasParaFichaSugerida(p: PoliticasDaLoja | null | undefined): FichaOperacional | null {
  if (!p || politicasVazias(p)) return null
  const out: FichaOperacional = {
    troca: p.troca ? { prazo_dias: p.troca.dias, texto: p.troca.texto } : null,
    envio: p.frete
      ? { prazo: p.frete.prazo, frete_gratis_acima: p.frete.gratis ? p.frete.gratis_condicao ?? "sim" : null, texto: p.frete.texto }
      : null,
  }
  return out
}
