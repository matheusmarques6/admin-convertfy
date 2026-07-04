/**
 * Geometria pura do mapa de cortes — operações sobre a lista de portas
 * (fatias horizontais contíguas cobrindo 0..1 da altura da imagem).
 *
 * Invariante mantido por TODAS as funções: portas ordenadas por y0,
 * portas[0].y0 === 0, última.y1 === 1, contíguas (y1[i] === y0[i+1]).
 *
 * Sem dependências de DOM/React — testável em node.
 */

import type { CutPort } from "@/types/campaign-cuts"

/** Altura mínima absoluta de uma porta em fração (guard do servidor). */
export const MIN_PORT_FRACTION = 0.002

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function newPortId(): string {
  // crypto.randomUUID existe em browser moderno e node 19+; fallback simples.
  try {
    return crypto.randomUUID()
  } catch {
    return "p" + Math.random().toString(36).slice(2, 10)
  }
}

/**
 * Divide a porta que contém yFrac em duas. A porta original mantém o topo
 * (y0..yFrac); a nova (type "texto", label numérica) fica com yFrac..y1.
 * Retorna null se yFrac não respeitar o gap mínimo dos dois lados.
 */
export function splitPortAt(
  ports: CutPort[],
  yFrac: number,
  minGap: number,
): CutPort[] | null {
  const y = clamp01(yFrac)
  const k = ports.findIndex((p) => y > p.y0 + minGap && y < p.y1 - minGap)
  if (k === -1) return null
  const next = ports.map((p) => ({ ...p }))
  const nova: CutPort = {
    id: newPortId(),
    label: `Porta ${next.length + 1}`,
    type: "texto",
    y0: y,
    y1: next[k].y1,
  }
  next[k].y1 = y
  next.splice(k + 1, 0, nova)
  return next
}

/**
 * Move a fronteira entre ports[idx] e ports[idx+1] para yFrac, clampada
 * para preservar o gap mínimo dos dois lados. No-op se idx inválido.
 */
export function movePortBoundary(
  ports: CutPort[],
  idx: number,
  yFrac: number,
  minGap: number,
): CutPort[] {
  if (idx < 0 || idx >= ports.length - 1) return ports
  const next = ports.map((p) => ({ ...p }))
  const lo = next[idx].y0 + minGap
  const hi = next[idx + 1].y1 - minGap
  if (lo >= hi) return ports
  const y = Math.max(lo, Math.min(hi, clamp01(yFrac)))
  next[idx].y1 = y
  next[idx + 1].y0 = y
  return next
}

/**
 * Remove a porta mesclando com a ANTERIOR (que absorve o y1). A primeira
 * porta mescla com a seguinte (a seguinte absorve o y0). Com 1 porta só,
 * no-op.
 */
export function mergePortWithPrevious(
  ports: CutPort[],
  portId: string,
): CutPort[] {
  if (ports.length <= 1) return ports
  const k = ports.findIndex((p) => p.id === portId)
  if (k === -1) return ports
  const next = ports.map((p) => ({ ...p }))
  if (k === 0) {
    next[1].y0 = next[0].y0
    next.splice(0, 1)
  } else {
    next[k - 1].y1 = next[k].y1
    next.splice(k, 1)
  }
  return next
}

/** Porta única inicial cobrindo a imagem inteira (estado pós-upload). */
export function initialPorts(): CutPort[] {
  return [{ id: newPortId(), label: "Porta 1", type: "hero", y0: 0, y1: 1 }]
}

/**
 * True se as portas mantêm o invariante (ordenadas, contíguas, 0..1).
 * Usado como cinto de segurança no client; a validação com erros
 * detalhados vive no service (validateCutMap).
 */
export function portsAreContiguous(ports: CutPort[], eps = 1e-4): boolean {
  if (ports.length === 0) return false
  if (Math.abs(ports[0].y0) > eps) return false
  if (Math.abs(ports[ports.length - 1].y1 - 1) > eps) return false
  for (let i = 0; i < ports.length; i++) {
    if (ports[i].y1 - ports[i].y0 <= 0) return false
    if (i > 0 && Math.abs(ports[i - 1].y1 - ports[i].y0) > eps) return false
  }
  return true
}

/**
 * Converte a fração de uma porta em retângulo de recorte em pixels para
 * uma imagem de altura `imageH` (a altura da imagem de CADA loja — não a
 * do modelo). Garante height >= 1 e top dentro da imagem, mesmo com
 * arredondamento em portas muito finas.
 */
export function portPixelRect(
  port: Pick<CutPort, "y0" | "y1">,
  imageH: number,
): { top: number; height: number } {
  const top = Math.min(Math.max(0, Math.round(clamp01(port.y0) * imageH)), imageH - 1)
  const bottom = Math.min(Math.max(top + 1, Math.round(clamp01(port.y1) * imageH)), imageH)
  return { top, height: bottom - top }
}

/**
 * Recorte com ESCALA POR LARGURA: converte a fração da porta em pixels
 * DO MODELO (y × altura_modelo) e escala por (largura_loja ÷
 * largura_modelo). Exato quando o email da loja é o mesmo layout do
 * modelo em outra resolução (ex.: export 2x do Figma) — a fração da
 * altura total falha nesse caso quando as alturas totais divergem.
 *
 * A última porta (y1 ≈ 1) absorve o resto da imagem da loja (rodapé mais
 * alto/baixo não desloca os cortes anteriores). Sem dimensões do modelo
 * (mapas antigos), cai no portPixelRect por fração da altura.
 */
export function portPixelRectWidthScaled(
  port: Pick<CutPort, "y0" | "y1">,
  model: { w: number | null; h: number | null },
  store: { w: number; h: number },
): { top: number; height: number } {
  if (!model.w || !model.h || !store.w || model.w <= 0) {
    return portPixelRect(port, store.h)
  }
  const scale = store.w / model.w
  const isLast = port.y1 >= 1 - 1e-4
  let top = Math.round(clamp01(port.y0) * model.h * scale)
  let bottom = isLast ? store.h : Math.round(clamp01(port.y1) * model.h * scale)
  top = Math.min(Math.max(0, top), store.h - 1)
  bottom = Math.min(Math.max(top + 1, bottom), store.h)
  return { top, height: bottom - top }
}

/**
 * Converte as portas do MAPA (frações do modelo) para frações da imagem
 * DA LOJA usando a escala por largura — é o estado inicial do editor de
 * ajuste fino por loja. Normaliza para manter o invariante (contíguas,
 * 0..1) mesmo com arredondamento/clamp nas extremidades.
 */
export function widthScaledPortsToStoreFractions(
  ports: CutPort[],
  model: { w: number | null; h: number | null },
  store: { w: number; h: number },
): CutPort[] {
  const out = ports.map((p) => {
    const r = portPixelRectWidthScaled(p, model, store)
    return { ...p, y0: r.top / store.h, y1: (r.top + r.height) / store.h }
  })
  for (let i = 0; i < out.length; i++) {
    out[i].y0 = i === 0 ? 0 : out[i - 1].y1
    if (i === out.length - 1) out[i].y1 = 1
    if (out[i].y1 < out[i].y0 + MIN_PORT_FRACTION) {
      out[i].y1 = Math.min(1, out[i].y0 + MIN_PORT_FRACTION)
    }
  }
  return out
}
