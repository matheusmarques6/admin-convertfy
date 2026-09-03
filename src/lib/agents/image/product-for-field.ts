/**
 * Qual produto da loja um campo de imagem mostra.
 *
 * Até 03/09 toda geração do email anexava `store_top_products[0]`: as 4
 * imagens do painel 2 de "produtos 7 - dois produtos" saíram com a foto do
 * EnergySave Pro enquanto a copy do painel falava do OBD CarScan Pro
 * (Innova Bay, Welcome 1). O schema já diz de qual produto o campo é — o
 * índice está no key (`panel_2_main_photo`, `product_3_image`); só faltava
 * ler.
 *
 * Puro — testável. Sem índice no key (hero, reviews, body) → produto 1.
 * Índice maior que a lista → produto 1 (a loja tem menos produtos que o
 * componente tem painéis; melhor repetir o principal que inventar).
 */

const INDICE_NO_KEY = /(?:^|_)(?:panel|product|produto|item|card|col|column|slot)_(\d{1,2})(?:_|$)/i

export function productIndexForField(fieldKey: string | null | undefined): number | null {
  const m = INDICE_NO_KEY.exec((fieldKey ?? "").trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function pickProductForField<T>(
  products: readonly T[],
  fieldKey: string | null | undefined,
): { product: T | null; index: number } {
  if (products.length === 0) return { product: null, index: 0 }
  const n = productIndexForField(fieldKey)
  if (n != null && n <= products.length) return { product: products[n - 1], index: n }
  return { product: products[0], index: 1 }
}
