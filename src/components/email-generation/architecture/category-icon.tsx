"use client"

/**
 * Ícone por categoria de bloco — os traços da maquete "Régua da sequência",
 * um por seção da biblioteca. Ficam aqui porque a tabela, a paleta e o
 * esquema do e-mail à direita precisam do MESMO desenho: um bloco tem que
 * ser reconhecível nos três lugares.
 */

import { C } from "../ui/eg-theme"

/** Paths do `d` de cada categoria (viewBox 24, stroke currentColor). */
export const CATEGORY_ICON: Record<string, string[]> = {
  header: ["M4 6h16", "M4 11h7"],
  hero: ["M4 5h16v9H4z", "M4 18h10"],
  body: ["M5 6h14", "M5 11h14", "M5 16h9"],
  products: ["M4 8l8-4 8 4v8l-8 4-8-4z", "M4 8l8 4 8-4"],
  reviews: ["M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z"],
  cta: ["M4 9h16v6H4z", "M9 12h6"],
  offer: ["M4 8h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4z", "M14 8v11"],
  footer: ["M4 5h16v14H4z", "M4 15h16"],
}

export function CategoryIcon({
  category,
  size = 16,
  color = C.brand,
}: {
  category: string
  size?: number
  color?: string
}) {
  const paths = CATEGORY_ICON[category] ?? CATEGORY_ICON.body
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: `0 0 ${size}px` }}
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
