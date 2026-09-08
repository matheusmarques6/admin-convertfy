/**
 * Moedas de loja aceitas no cadastro (`client_stores.currency`).
 *
 * A lista é FECHADA de propósito: moeda livre viraria "R$" num lugar e
 * "BRL " noutro, e o câmbio (`exchange-rate.service`) precisa de um
 * código ISO 4217 para achar a cotação.
 *
 * ── Ampliada em 08/09/2026 ───────────────────────────────────────────
 *
 * Ela tinha 11 moedas e ficou pequena: Lena Warszawa (lenawarszawa.pl)
 * estava em EUR porque **PLN não existia para escolher**, e Bryn Grill
 * (bryngrill-dk) idem sem DKK. Cadastro errado que a tela não permitia
 * consertar não é erro do operador.
 *
 * O critério para entrar: ser praça onde a casa opera ou pode operar
 * loja (Europa inteira, América, Ásia-Pacífico e Oriente Médio dos
 * marketplaces de dropshipping) E ser servida pelo open.er-api.com, que
 * é de onde vem a cotação. Códigos fora daqui continuam recusados no
 * PATCH — a moeda que a plataforma devolver e não estiver na lista vira
 * aviso, não gravação silenciosa (ver `isStoreCurrency`).
 */

export const STORE_CURRENCIES = [
  // América
  { value: "BRL", label: "Real (BRL)", symbol: "R$" },
  { value: "USD", label: "Dólar americano (USD)", symbol: "US$" },
  { value: "CAD", label: "Dólar canadense (CAD)", symbol: "CA$" },
  { value: "MXN", label: "Peso mexicano (MXN)", symbol: "MX$" },
  { value: "ARS", label: "Peso argentino (ARS)", symbol: "AR$" },
  { value: "CLP", label: "Peso chileno (CLP)", symbol: "CL$" },
  { value: "COP", label: "Peso colombiano (COP)", symbol: "CO$" },
  { value: "PEN", label: "Sol peruano (PEN)", symbol: "S/" },
  { value: "UYU", label: "Peso uruguaio (UYU)", symbol: "$U" },
  { value: "PYG", label: "Guarani paraguaio (PYG)", symbol: "₲" },
  // Europa — zona do euro e vizinhas
  { value: "EUR", label: "Euro (EUR)", symbol: "€" },
  { value: "GBP", label: "Libra esterlina (GBP)", symbol: "£" },
  { value: "CHF", label: "Franco suíço (CHF)", symbol: "CHF" },
  { value: "PLN", label: "Zloty polonês (PLN)", symbol: "zł" },
  { value: "DKK", label: "Coroa dinamarquesa (DKK)", symbol: "kr" },
  { value: "SEK", label: "Coroa sueca (SEK)", symbol: "kr" },
  { value: "NOK", label: "Coroa norueguesa (NOK)", symbol: "kr" },
  { value: "CZK", label: "Coroa tcheca (CZK)", symbol: "Kč" },
  { value: "HUF", label: "Forint húngaro (HUF)", symbol: "Ft" },
  { value: "RON", label: "Leu romeno (RON)", symbol: "lei" },
  { value: "BGN", label: "Lev búlgaro (BGN)", symbol: "лв" },
  { value: "TRY", label: "Lira turca (TRY)", symbol: "₺" },
  { value: "ISK", label: "Coroa islandesa (ISK)", symbol: "kr" },
  // Ásia-Pacífico, África e Oriente Médio
  { value: "AUD", label: "Dólar australiano (AUD)", symbol: "A$" },
  { value: "NZD", label: "Dólar neozelandês (NZD)", symbol: "NZ$" },
  { value: "JPY", label: "Iene japonês (JPY)", symbol: "¥" },
  { value: "CNY", label: "Yuan chinês (CNY)", symbol: "CN¥" },
  { value: "HKD", label: "Dólar de Hong Kong (HKD)", symbol: "HK$" },
  { value: "SGD", label: "Dólar de Singapura (SGD)", symbol: "S$" },
  { value: "INR", label: "Rupia indiana (INR)", symbol: "₹" },
  { value: "KRW", label: "Won sul-coreano (KRW)", symbol: "₩" },
  { value: "THB", label: "Baht tailandês (THB)", symbol: "฿" },
  { value: "AED", label: "Dirham dos Emirados (AED)", symbol: "AED" },
  { value: "SAR", label: "Rial saudita (SAR)", symbol: "SAR" },
  { value: "ILS", label: "Shekel israelense (ILS)", symbol: "₪" },
  { value: "ZAR", label: "Rand sul-africano (ZAR)", symbol: "R" },
] as const

export type StoreCurrency = (typeof STORE_CURRENCIES)[number]["value"]

export const STORE_CURRENCY_VALUES = STORE_CURRENCIES.map((c) => c.value) as unknown as [
  StoreCurrency,
  ...StoreCurrency[],
]

/**
 * A plataforma devolveu um código que a casa aceita?
 *
 * Existe para o sync: moeda vinda do Omnisend/Shopify passa por aqui
 * ANTES de gravar. Fora da lista o sync avisa em vez de gravar — um
 * código que o câmbio não converte estragaria o relatório em silêncio,
 * e o que falta é uma linha nesta lista, não um dado no banco.
 */
export function isStoreCurrency(code: string | null | undefined): code is StoreCurrency {
  if (!code) return false
  return STORE_CURRENCIES.some((c) => c.value === code.toUpperCase())
}

export function currencySymbol(code: string | null | undefined): string {
  return STORE_CURRENCIES.find((c) => c.value === code)?.symbol ?? (code ?? "")
}
