/**
 * Portuguese → English normalization for Correios tracking events.
 * Normalizes PT-source events to English canonical form
 * before translating to any target language.
 */

/** Exact match PT→EN (case-insensitive key lookup) */
export const ptToEnExact: Record<string, string> = {
  // ─── Standard Correios event descriptions ──────────────────────────────────
  "objeto postado": "Object posted",
  "objeto postado após o horário limite da unidade": "Object posted after unit deadline",
  "objeto encaminhado": "Forwarded",
  "objeto em trânsito - por favor aguarde": "In transit",
  "objeto saiu para entrega ao destinatário": "Out for delivery",
  "objeto saiu para entrega": "Out for delivery",
  "objeto entregue ao destinatário": "Delivered to recipient",
  "objeto entregue": "Delivered",
  "entrega efetuada": "Delivered",
  "tentativa de entrega não efetuada": "Delivery attempt failed",
  "não foi possível entregar o objeto": "Could not deliver the object",
  "objeto devolvido ao remetente": "Returned to sender",
  "objeto aguardando retirada no endereço indicado": "Waiting for pickup at indicated address",
  "aguardando retirada": "Waiting for pickup",
  "objeto recebido pelos correios do brasil": "Received by carrier",
  "objeto recebido na unidade de exportação no país de origem": "Received at export unit",
  "fiscalização aduaneira finalizada": "Customs clearance completed",
  "objeto encaminhado para fiscalização aduaneira": "Forwarded to customs inspection",
  "aguardando pagamento do despacho postal": "Awaiting postal dispatch payment",
  "objeto tributado": "Object taxed",
  "objeto apreendido por órgão de fiscalização": "Object seized by inspection authority",
  "objeto roubado": "Object stolen",
  "objeto extraviado": "Object lost",
  "objeto não localizado no fluxo postal": "Object not found in postal flow",
  "objeto não localizado": "Object not found",
  "objeto recebido na unidade de distribuição": "Received at distribution unit",
  "objeto em transferência - Loss & Found": "In transfer - Lost & Found",
}

/**
 * Pattern-based PT→EN fallback (contains matching, order matters - first match wins).
 * Used when exact match fails. Strips accents before matching.
 */
export const ptToEnPatterns: Array<{ contains: string; en: string }> = [
  // More specific patterns first
  { contains: "entrega efetuada", en: "Delivered" },
  { contains: "saiu para entrega", en: "Out for delivery" },
  { contains: "tentativa de entrega", en: "Delivery attempt failed" },
  { contains: "nao foi possivel", en: "Could not deliver" },
  { contains: "aguardando retirada", en: "Waiting for pickup" },
  { contains: "aguardando pagamento", en: "Awaiting payment" },
  { contains: "recebido pelos correios", en: "Received by carrier" },
  { contains: "fiscalizacao aduaneira", en: "Customs inspection" },
  { contains: "objeto nao localizado", en: "Object not found" },
  // General patterns (less specific)
  { contains: "entregue", en: "Delivered" },
  { contains: "devolvido", en: "Returned to sender" },
  { contains: "retornado", en: "Returned to sender" },
  { contains: "apreendido", en: "Object seized" },
  { contains: "roubado", en: "Object stolen" },
  { contains: "extraviado", en: "Object lost" },
  { contains: "tributado", en: "Object taxed" },
  { contains: "em transito", en: "In transit" },
  { contains: "encaminhado", en: "Forwarded" },
  { contains: "postado", en: "Posted" },
  { contains: "coletado", en: "Collected" },
]

/** PT marker words for language detection (accent-stripped, lowercase) */
export const PT_MARKERS = [
  "objeto", "entregue", "encaminhado", "postado",
  "coletado", "aguardando", "destinatario",
  "remetente", "fiscalizacao", "aduaneira",
  "tributado", "transito", "retirada",
  "efetuada", "apreendido", "devolvido", "retornado",
  "correios", "extraviado",
]
