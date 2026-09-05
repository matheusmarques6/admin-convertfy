/**
 * Identidade dos SLIDES e marcadores de perfil/molde/pilar. Estas cores são
 * a exceção consciente à regra "zero cor fora do token": elas só aparecem
 * dentro do canvas (o carrossel exportado) e em marcadores do dashboard. A
 * interface em volta usa os tokens --ops-*.
 *
 * Não existe perfil fixo: o perfil é o canal Instagram conectado na org, e
 * o brand kit padrão nasce do que a Graph API devolve (username, nome, foto).
 */

import type { BrandKit, Gradiente, MoldeKey, Perfil, Pilar } from "./types"

export const SLIDE = {
  primaria: "#2137B6",
  destaque: "#4E62D8",
  escuro: "#041366",
  fundoClaro: "#F6F8FE",
  metadado: "#8892B0",
  textoApoioClaro: "#1F2A5A",
  verificado: "#3B82F6",
  /** Cor da seleção/alças no canvas (sempre visível sobre qualquer fundo). */
  selecao: "#4E62D8",
  /** Zonas seguras do Instagram (overlay de aviso). */
  zona: "rgba(220,38,38,0.22)",
  zonaLinha: "rgba(220,38,38,0.8)",
  zonaEtiqueta: "rgba(220,38,38,0.9)",
} as const

export const GRADIENTE_PADRAO: Gradiente = { de: "#4E62D8", meio: "#2137B6", ate: "#041366", angulo: 160 }

export const CORES_PADRAO: Record<string, string> = {
  hook: "#2137B6",
  destaque: "#4E62D8",
  metadado: "#8892B0",
  "fundo-bloco": "#F6F8FE",
}

export const FONTE_TITULO = "'Barlow Condensed', 'Inter Slides', Inter, sans-serif"
export const FONTE_APOIO = "Georgia, 'Times New Roman', serif"
export const FONTE_META = "'Inter Slides', Inter, -apple-system, BlinkMacSystemFont, sans-serif"

/** Cores de marcador dos perfis, pela posição do canal na org. */
export const PERFIL_CORES = ["#2137B6", "#7C3AED", "#0E7490", "#B45309", "#047857", "#DB2777"]

export const COR_CONSOLIDADO = "#4E62D8"

export function corDoPerfil(indice: number): string {
  return PERFIL_CORES[indice % PERFIL_CORES.length]
}

export const CT_MOLDE_COR: Record<MoldeKey, string> = {
  Turbo: "#2137B6",
  MEC: "#7C3AED",
  Benchmark: "#0E7490",
  Lista: "#B45309",
  Bastidor: "#374151",
}

export const CT_PILAR_COR: Record<Pilar, string> = {
  Case: "#047857",
  Educacional: "#2563EB",
  Bastidor: "#6B7280",
  Benchmark: "#0E7490",
}

/** Cores das etapas do funil de conteúdo (trapézio), de cima para baixo. */
export const FUNIL_CORES = ["#475569", "#4E62D8", "#2563EB", "#7C3AED", "#D97706", "#047857"]

/**
 * Brand kit padrão de um perfil: handle e nome do Instagram, foto servida
 * pelo admin. Sem perfil (documento órfão) nasce vazio — nada inventado.
 */
export function brandKitPadrao(perfil?: Pick<Perfil, "handle" | "nome" | "avatar"> | null, ano = new Date().getFullYear()): BrandKit {
  return {
    brandName: perfil?.handle ? (perfil.handle.startsWith("@") ? perfil.handle : `@${perfil.handle}`) : "",
    brandName2: perfil?.nome ?? "",
    copyright: `© ${ano}`,
    avatar: perfil?.avatar ?? null,
    verificado: false,
  }
}

// ── Utilitários de cor ──────────────────────────────────────────────────

export function hex6(c: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((c ?? "").trim())
  return m ? m[1] : null
}

/** Fundo escuro? (gradiente da marca é sempre escuro). */
export function fundoEscuro(fundo: string): boolean {
  if (fundo === "gradiente") return true
  const h = hex6(fundo)
  let r: number, g: number, b: number
  if (h) {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(fundo)
    if (!m) return false
    r = +m[1]
    g = +m[2]
    b = +m[3]
  }
  return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

export function gradienteCss(g: Gradiente): string {
  return `linear-gradient(${g.angulo}deg, ${g.de} 0%, ${g.meio} 55%, ${g.ate} 100%)`
}

/** Valor aceitável para um fundo: "gradiente", #hex (3/6/8) ou rgb(a). */
export function fundoValido(v: string): boolean {
  const s = v.trim()
  if (s === "gradiente") return true
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true
  return /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/i.test(s)
}
