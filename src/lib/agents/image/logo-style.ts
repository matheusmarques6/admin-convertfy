/**
 * Helper niche-adaptive: deriva a variável {LOGO_STYLE} a partir da
 * família tipográfica do heading. Override sempre vence.
 *
 * Story AE-10. Puro (zero dependência de DB).
 */

interface DeriveLogoStyleInput {
  fontHeading?: string | null
  override?: string | null
}

export function deriveLogoStyle(input: DeriveLogoStyleInput): string {
  if (input.override && input.override.trim() !== "") {
    return input.override
  }
  const f = (input.fontHeading ?? "").toLowerCase()
  if (/serif|slab|old style|mincho/.test(f)) return "classic monogram"
  if (/mono|courier|consolas/.test(f)) return "tech monospace"
  if (/display|bold|impact|black/.test(f)) return "bold display lettering"
  return "modern wordmark"
}
