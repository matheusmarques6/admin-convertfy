/**
 * Matching conservador nome→loja, usado pelo import do Figma (nome do
 * frame) e pela dropzone em massa (nome do arquivo sem extensão).
 *
 * Regras, nesta ordem:
 *  1. Igualdade exata de chave normalizada (normalizeText + só alfanumérico).
 *  2. Substring ÚNICA (chave do nome contém a da loja ou vice-versa) —
 *     se mais de uma loja casar, vira ambíguo. NUNCA chuta.
 *
 * Nomes duplicados (duas lojas ou dois frames com a mesma chave) também
 * viram ambíguos — atribuição manual resolve.
 */

import { normalizeText } from "./detect"

export interface StoreRef {
  store_id: string
  store_name: string
}

export interface StoreMatchResult {
  /** nome de entrada → loja casada. */
  matched: Array<{ name: string; store: StoreRef }>
  /** Nomes com mais de um candidato (ou chave duplicada) — decisão manual. */
  ambiguous: Array<{ name: string; candidates: StoreRef[] }>
  unmatchedNames: string[]
  unmatchedStores: StoreRef[]
}

/** Chave de comparação: minúsculas, sem acento, só [a-z0-9]. */
export function normalizeKey(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]/g, "")
}

export function matchNamesToStores(
  names: string[],
  stores: StoreRef[],
): StoreMatchResult {
  const matched: StoreMatchResult["matched"] = []
  const ambiguous: StoreMatchResult["ambiguous"] = []
  const unmatchedNames: string[] = []

  const storeKeys = stores.map((s) => ({ store: s, key: normalizeKey(s.store_name) }))
  const takenStoreIds = new Set<string>()

  // Chaves de loja duplicadas nunca casam sozinhas (ex.: 2 lojas "Rock BR").
  const keyCount = new Map<string, number>()
  for (const { key } of storeKeys) {
    if (key) keyCount.set(key, (keyCount.get(key) ?? 0) + 1)
  }

  for (const rawName of names) {
    const nameKey = normalizeKey(rawName)
    if (!nameKey) {
      unmatchedNames.push(rawName)
      continue
    }

    // 1. Igualdade exata.
    const exact = storeKeys.filter(
      (s) => s.key && s.key === nameKey && !takenStoreIds.has(s.store.store_id),
    )
    if (exact.length === 1 && keyCount.get(nameKey) === 1) {
      matched.push({ name: rawName, store: exact[0].store })
      takenStoreIds.add(exact[0].store.store_id)
      continue
    }
    if (exact.length >= 1) {
      ambiguous.push({ name: rawName, candidates: exact.map((s) => s.store) })
      continue
    }

    // 2. Substring única (qualquer direção), só entre lojas ainda livres.
    const partial = storeKeys.filter(
      (s) =>
        s.key &&
        !takenStoreIds.has(s.store.store_id) &&
        (nameKey.includes(s.key) || s.key.includes(nameKey)),
    )
    if (partial.length === 1) {
      matched.push({ name: rawName, store: partial[0].store })
      takenStoreIds.add(partial[0].store.store_id)
    } else if (partial.length > 1) {
      ambiguous.push({ name: rawName, candidates: partial.map((s) => s.store) })
    } else {
      unmatchedNames.push(rawName)
    }
  }

  const unmatchedStores = stores.filter((s) => !takenStoreIds.has(s.store_id))
  return { matched, ambiguous, unmatchedNames, unmatchedStores }
}
