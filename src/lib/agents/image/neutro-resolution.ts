/**
 * Helper niche-adaptive: resolve a variável {NEUTRO} (cor de fundo neutra
 * em hex) priorizando override manual da loja, depois a cor com
 * role='Fundo' do brand identity, e por fim uma heurística por
 * posicionamento.
 *
 * Story AE-10. Puro (zero dependência de DB).
 */

interface BrandColorLike {
  hex?: string | null
  role?: string | null
}

interface ResolveNeutroInput {
  colorsPrimary?: BrandColorLike[] | null
  colorsSecondary?: BrandColorLike[] | null
  posicionamento?: string | null
  override?: string | null
}

export function resolveNeutro(input: ResolveNeutroInput): string {
  if (input.override && input.override.trim() !== "") {
    return input.override
  }

  const all = [
    ...(input.colorsPrimary ?? []),
    ...(input.colorsSecondary ?? []),
  ]
  const fundo = all.find(
    (c) => (c.role ?? "").trim().toLowerCase() === "fundo" && c.hex,
  )
  if (fundo?.hex) return fundo.hex

  const p = (input.posicionamento ?? "").trim().toLowerCase()
  if (p === "premium") return "#0B0B0B"
  if (p === "popular") return "#F5F5F5"
  return "#FFFFFF"
}
