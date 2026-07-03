/**
 * Fontes compartilhadas via next/font (self-hosted, sem FOUT/race condition).
 *
 * next/font registra as famílias com nome interno hasheado — o nome literal
 * ("Inter", "Playfair Display") NÃO resolve em font-family. Consumir sempre
 * pelas variáveis CSS (--font-inter / --font-playfair), aplicadas via
 * `.variable` no <body> de cada layout root (app raiz e print do relatório).
 */

import localFont from "next/font/local"
import { Playfair_Display } from "next/font/google"

export const inter = localFont({
  src: "../app/fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
})

export const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
})
