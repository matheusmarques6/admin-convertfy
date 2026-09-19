/**
 * O que a PRIMEIRA tela do formulário vai pedir ao navegador — para o
 * servidor avisar antes (`<link rel="preload">`).
 *
 * Só a primeira tela: o resto é pré-carregado pelo cliente conforme a
 * pessoa avança (`proximaMidia`, no renderizador). Pré-carregar as 21
 * telas de uma vez faria o celular baixar vinte imagens que a pessoa
 * talvez nunca veja, disputando banda com a que ela está olhando.
 *
 * Regras que erram em silêncio se ficarem na página:
 *
 * - **A fonte só entra quando é a do tema.** A Inter é o default; se a
 *   aba Design escolheu Georgia, pré-carregar 48 KB de Inter é custo sem
 *   uso. Barlow Condensed idem, pelo arquivo latin.
 * - **Vídeo pré-carrega o CARTAZ, não o vídeo.** `preload="metadata"` já
 *   é do `<video>`; o que aparece no primeiro quadro é o poster.
 * - **Imagem de fundo conta.** `layout: "fundo"` vira `background-image`
 *   do container — o navegador só a descobre depois do CSS, mais tarde
 *   que um `<img>`. É a que mais precisa do aviso.
 * - **Origem externa vira `preconnect`.** Mídia no Storage do Supabase
 *   mora noutro host; abrir a conexão antes poupa o DNS + TLS do
 *   primeiro byte.
 */

import type { FormSchema } from "@/types/forms-conversational"
import { acharBloco, primeiroBloco } from "./engine"
import { logoDoFormulario } from "./logo"
import type { MidiaDaTela } from "./midia"

export const FONTE_INTER = "/fonts/inter-variable.woff2"
export const FONTE_BARLOW = "/fonts/barlow-condensed-800-latin.woff2"

export interface RecursosDaPrimeiraTela {
  /** Imagens que a primeira tela desenha (logo, mídia, cartaz do vídeo). */
  imagens: string[]
  /** Arquivos de fonte que o tema usa. */
  fontes: string[]
  /** Origens externas de onde as imagens vêm. */
  preconnect: string[]
}

function imagemDaMidia(m: MidiaDaTela | null | undefined): string | null {
  if (!m || typeof m.url !== "string" || !m.url.trim()) return null
  if (m.tipo === "imagem") return m.url
  if (m.tipo === "video") return m.poster && m.poster.trim() ? m.poster : null
  return null
}

/** A mídia da primeira tela que a pessoa vê. */
export function midiaDaPrimeiraTela(schema: FormSchema): MidiaDaTela | null {
  if (schema.settings?.welcome) return schema.settings.welcome.midia ?? null
  const inicio = primeiroBloco(schema)
  if (inicio.tipo !== "bloco") return null
  return acharBloco(schema, inicio.ref)?.midia ?? null
}

function fonteDoTema(fontFamily: string | null | undefined): string | null {
  const f = (fontFamily ?? "Inter").trim().replace(/^['"]/, "").toLowerCase()
  if (f.startsWith("inter")) return FONTE_INTER
  if (f.startsWith("barlow")) return FONTE_BARLOW
  return null
}

function origemExterna(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    return u.origin
  } catch {
    return null // relativa: é do nosso host, já conectado
  }
}

export function recursosDaPrimeiraTela(args: {
  schema: FormSchema | null
  displayMode: "classic" | "conversational"
  theme: { mode?: string | null; fontFamily?: string | null; hideLogo?: boolean | null } | null | undefined
  logoUrl: string | null | undefined
}): RecursosDaPrimeiraTela {
  const { schema, displayMode, theme, logoUrl } = args
  const imagens: string[] = []

  const logo = logoDoFormulario({ logoUrl, ocultar: theme?.hideLogo, modo: theme?.mode })
  if (logo.url) imagens.push(logo.url)

  if (displayMode === "conversational" && schema) {
    const img = imagemDaMidia(midiaDaPrimeiraTela(schema))
    if (img) imagens.push(img)
  }

  const fonte = fonteDoTema(theme?.fontFamily)
  const preconnect = new Set<string>()
  for (const i of imagens) {
    const o = origemExterna(i)
    if (o) preconnect.add(o)
  }

  return {
    imagens: [...new Set(imagens)],
    fontes: fonte ? [fonte] : [],
    preconnect: [...preconnect],
  }
}
