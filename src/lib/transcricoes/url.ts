/**
 * Normalização de URL e detecção de plataforma — puro, sem rede.
 *
 * A URL normalizada é a CHAVE DE DEDUPLICAÇÃO (índice único por org). Se
 * ela variar com rastreador, o mesmo vídeo entra duas vezes e a biblioteca
 * passa a mentir a contagem; se ela colapsar vídeos diferentes, o segundo
 * é recusado como duplicado e nunca é transcrito. Os dois erros são
 * silenciosos, e é por isso que este módulo é testado à parte.
 */

import type { Plataforma } from "./types"

/**
 * Parâmetros que NÃO mudam qual vídeo é. `si` (share id do YouTube),
 * `feature`, `igsh`/`igshid` (Instagram), `is_from_webapp`/`sender_device`
 * (TikTok) e toda a família utm_*.
 */
const PARAMS_RASTREIO = new Set([
  "si", "feature", "app", "pp", "ab_channel", "kw", "source",
  "igsh", "igshid", "img_index",
  "is_from_webapp", "sender_device", "sender_web_id", "web_id", "_r", "_t",
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "ref_url",
])

const isRastreio = (k: string) => PARAMS_RASTREIO.has(k) || k.toLowerCase().startsWith("utm_")

export function detectarPlataforma(raw: string): Plataforma | null {
  const u = parseUrl(raw)
  if (!u) return null
  const h = u.hostname.replace(/^www\./, "").toLowerCase()
  if (h === "youtu.be" || h.endsWith("youtube.com") || h.endsWith("youtube-nocookie.com")) return "youtube"
  if (h.endsWith("instagram.com") || h === "instagr.am") return "instagram"
  if (h.endsWith("tiktok.com")) return "tiktok"
  return null
}

function parseUrl(raw: string): URL | null {
  const s = raw.trim()
  if (!s) return null
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
}

/**
 * Forma canônica para deduplicação. Devolve null quando não é uma URL de
 * plataforma reconhecida — sem chave, o dedupe não opina (é melhor deixar
 * entrar duas vezes do que recusar um vídeo legítimo por palpite).
 */
export function normalizarUrl(raw: string): string | null {
  const u = parseUrl(raw)
  if (!u) return null
  const plataforma = detectarPlataforma(raw)
  if (!plataforma) return null

  const host = u.hostname.replace(/^www\./, "").toLowerCase()
  const path = u.pathname.replace(/\/+$/, "")
  const params = new URLSearchParams()

  if (plataforma === "youtube") {
    // youtu.be/<id>, /shorts/<id>, /live/<id> e /embed/<id> são o MESMO
    // vídeo que /watch?v=<id>. Sem colapsar, o mesmo link compartilhado de
    // duas formas entra duas vezes.
    let id: string | null = null
    if (host === "youtu.be") id = path.slice(1).split("/")[0] || null
    else if (path === "/watch") id = u.searchParams.get("v")
    else {
      const m = path.match(/^\/(?:shorts|live|embed|v)\/([^/]+)/)
      if (m) id = m[1]
    }
    if (id) return `https://youtube.com/watch?v=${id}`
    // Playlist e outros caminhos: mantém o path e só o que identifica.
    const list = u.searchParams.get("list")
    if (list) params.set("list", list)
    return `https://youtube.com${path}${params.size ? `?${params}` : ""}`
  }

  if (plataforma === "instagram") {
    // /reel/<code>, /reels/<code> e /p/<code> apontam para a mesma mídia.
    const m = path.match(/\/(?:reel|reels|p|tv)\/([^/]+)/)
    if (m) return `https://instagram.com/p/${m[1]}`
    return `https://instagram.com${path}`
  }

  // TikTok: /@perfil/video/<id> é a forma longa; vm.tiktok.com/<code> é um
  // encurtador que só o yt-dlp resolve — aqui fica como está.
  const m = path.match(/\/video\/(\d+)/)
  if (m) {
    const perfil = path.match(/^\/(@[^/]+)/)?.[1]
    return perfil ? `https://tiktok.com/${perfil}/video/${m[1]}` : `https://tiktok.com/video/${m[1]}`
  }
  return `https://${host}${path}`
}

/** Remove só o ruído, preservando o resto — o que vai para o yt-dlp. */
export function limparUrl(raw: string): string | null {
  const u = parseUrl(raw)
  if (!u) return null
  u.hash = ""
  for (const k of [...u.searchParams.keys()]) if (isRastreio(k)) u.searchParams.delete(k)
  return u.toString()
}

/**
 * Quebra o textarea "vários links, um por linha" em URLs únicas, na ordem
 * digitada. Duplicata dentro do próprio texto some aqui: a fila não deve
 * mostrar a mesma linha duas vezes antes mesmo de chamar o servidor.
 */
export function extrairLinks(texto: string): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const linha of texto.split(/[\n\r]+/)) {
    for (const pedaco of linha.split(/\s+/)) {
      const limpa = limparUrl(pedaco)
      if (!limpa || !detectarPlataforma(pedaco)) continue
      const chave = normalizarUrl(pedaco) ?? limpa
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push(limpa)
    }
  }
  return out
}

/** Texto tem algo que PARECE link mas não é plataforma suportada. */
export function linksNaoSuportados(texto: string): string[] {
  const out: string[] = []
  for (const pedaco of texto.split(/\s+/)) {
    if (!/^(https?:\/\/|www\.)/i.test(pedaco.trim())) continue
    if (detectarPlataforma(pedaco)) continue
    out.push(pedaco.trim())
  }
  return out
}
