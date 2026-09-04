/**
 * Moedas de loja aceitas no cadastro (client_stores.currency).
 *
 * Em uso hoje: BRL, EUR, GBP, USD. As demais são as praças em que a
 * casa opera loja internacional — lista fechada de propósito: moeda
 * livre viraria "R$" num lugar e "BRL " noutro e o câmbio
 * (exchange-rate.service) não saberia converter.
 */

export const STORE_CURRENCIES = [
  { value: "BRL", label: "Real (BRL)", symbol: "R$" },
  { value: "USD", label: "Dólar americano (USD)", symbol: "US$" },
  { value: "EUR", label: "Euro (EUR)", symbol: "€" },
  { value: "GBP", label: "Libra esterlina (GBP)", symbol: "£" },
  { value: "CAD", label: "Dólar canadense (CAD)", symbol: "CA$" },
  { value: "AUD", label: "Dólar australiano (AUD)", symbol: "A$" },
  { value: "MXN", label: "Peso mexicano (MXN)", symbol: "MX$" },
  { value: "ARS", label: "Peso argentino (ARS)", symbol: "AR$" },
  { value: "CLP", label: "Peso chileno (CLP)", symbol: "CL$" },
  { value: "COP", label: "Peso colombiano (COP)", symbol: "CO$" },
  { value: "CHF", label: "Franco suíço (CHF)", symbol: "CHF" },
] as const

export type StoreCurrency = (typeof STORE_CURRENCIES)[number]["value"]

export const STORE_CURRENCY_VALUES = STORE_CURRENCIES.map((c) => c.value) as unknown as [
  StoreCurrency,
  ...StoreCurrency[],
]

export function currencySymbol(code: string | null | undefined): string {
  return STORE_CURRENCIES.find((c) => c.value === code)?.symbol ?? (code ?? "")
}
