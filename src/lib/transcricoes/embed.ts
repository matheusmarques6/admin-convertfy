/**
 * Player embutido da própria plataforma — puro, sem rede.
 *
 * A mídia NÃO é guardada: depois que a transcrição fica pronta o vídeo e o
 * áudio são apagados do Storage e sobra a capa. Quem toca o vídeo é o
 * YouTube/Instagram/TikTok, do CDN deles.
 *
 * O motivo é custo, e a conta que morde é o EGRESS: guardar 500 MB é
 * barato, servir 500 MB a cada play não é. Como o produto do módulo é o
 * texto com timestamp, o vídeo é meio — e o meio já está publicado na
 * plataforma de origem.
 *
 * A diferença que a UI precisa respeitar: só o YouTube deixa PULAR para um
 * tempo. Instagram e TikTok embutem o vídeo e ponto — clicar num timestamp
 * rola o texto, não move o player. Fingir que move é pior que dizer que não.
 */

import type { Plataforma } from "./types"

export interface Embed {
  /** `src` do iframe. */
  url: string
  plataforma: Plataforma
  /** O player aceita pular para um segundo específico? Só o YouTube. */
  aceitaTempo: boolean
  /** Proporção do iframe — vertical no Instagram e TikTok. */
  proporcao: "16/9" | "9/16"
}

/** `https://youtube.com/watch?v=ID` → ID. Aceita as formas curtas também. */
export function idDoYoutube(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "").toLowerCase()
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null
    if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) return null
    if (u.pathname === "/watch") return u.searchParams.get("v")
    const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/]+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** `https://instagram.com/p/CODE` → CODE. */
export function codigoDoInstagram(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.replace(/^www\./, "").toLowerCase().endsWith("instagram.com")) return null
    const m = u.pathname.match(/\/(?:reel|reels|p|tv)\/([^/]+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** `https://tiktok.com/@perfil/video/ID` → ID. */
export function idDoTiktok(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.replace(/^www\./, "").toLowerCase().endsWith("tiktok.com")) return null
    const m = u.pathname.match(/\/video\/(\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/**
 * Monta o embed a partir da URL original. Devolve null quando não dá para
 * embutir — a tela então mostra o link para abrir na plataforma, em vez de
 * um iframe quebrado.
 *
 * `inicioSeg` só entra no YouTube; nos outros o parâmetro seria ignorado
 * pelo player e daria a impressão falsa de que funcionou.
 */
export function montarEmbed(
  urlOriginal: string | null | undefined,
  plataforma: Plataforma,
  inicioSeg?: number | null,
): Embed | null {
  if (!urlOriginal) return null

  if (plataforma === "youtube") {
    const id = idDoYoutube(urlOriginal)
    if (!id) return null
    const params = new URLSearchParams({
      // Habilita o `postMessage` de seekTo: é o que faz o clique no
      // timestamp mover o player sem recarregar o iframe.
      enablejsapi: "1",
      rel: "0",
      modestbranding: "1",
    })
    const inicio = Math.max(0, Math.floor(inicioSeg ?? 0))
    if (inicio > 0) params.set("start", String(inicio))
    // `youtube-nocookie` não planta cookie de rastreio antes do play.
    return {
      url: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
      plataforma,
      aceitaTempo: true,
      proporcao: "16/9",
    }
  }

  if (plataforma === "instagram") {
    const codigo = codigoDoInstagram(urlOriginal)
    if (!codigo) return null
    return {
      url: `https://www.instagram.com/p/${codigo}/embed`,
      plataforma,
      aceitaTempo: false,
      proporcao: "9/16",
    }
  }

  if (plataforma === "tiktok") {
    const id = idDoTiktok(urlOriginal)
    if (!id) return null
    return {
      url: `https://www.tiktok.com/embed/v2/${id}`,
      plataforma,
      aceitaTempo: false,
      proporcao: "9/16",
    }
  }

  // Upload não tem plataforma para embutir: o arquivo foi descartado depois
  // da transcrição e o que resta é o texto (e a capa no card).
  return null
}

/**
 * Comando de `seekTo` da IFrame API do YouTube.
 *
 * Recarregar o `src` com `?start=` também funcionaria, mas custa um reload
 * inteiro — anúncio e buffer — a cada clique num trecho. O postMessage move
 * o player que já está tocando.
 */
export function comandoSeek(segundos: number): string {
  return JSON.stringify({
    event: "command",
    func: "seekTo",
    args: [Math.max(0, Math.floor(segundos)), true],
  })
}
