/**
 * Normalização de telefone pra lookup/roteamento de threads WhatsApp
 * no inbox CRM. Helper PURO (sem dependências) — diferente do
 * `normalizePhone` de cloud-api.ts, que usa libphonenumber pra envio.
 *
 * Regras (heurística BR-first, igual ao resto do CRM):
 *  - só dígitos contam; máscara/espacos/traços são descartados
 *  - `+` no início indica DDI explícito — não prefixa 55
 *  - 10-11 dígitos sem `+` = número BR sem DDI → prefixa 55
 *  - menos de 10 dígitos = inválido → null (rota responde 422)
 */
export function normalizePhone(raw: string): string | null {
  const hasExplicitDdi = raw.trim().startsWith("+")
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 10) return null
  // BR sem DDI: DDD (2) + assinante (8 ou 9). Com `+` a pessoa já
  // informou o país — respeitamos (ex.: +1 415... não vira 55...).
  if (!hasExplicitDdi && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`
  }
  return digits
}

/**
 * Variantes BR do nono dígito pra casar threads antigas: a Meta/WhatsApp
 * às vezes reporta o wa_id SEM o 9 (`551187654321`) e às vezes COM
 * (`5511987654321`). Gera as duas formas pra usar num `IN (...)`.
 *
 * Só se aplica a números BR (prefixo 55) com comprimento certo:
 *  - 13 dígitos (55 + DDD + 9 dígitos começando com 9) → variante sem o 9
 *  - 12 dígitos (55 + DDD + 8 dígitos) → variante com o 9
 * Internacional não-BR retorna só o próprio número.
 */
export function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone])
  if (phone.startsWith("55")) {
    if (phone.length === 13 && phone[4] === "9") {
      // 55 + DDD (idx 2-3) + assinante a partir do idx 4
      variants.add(phone.slice(0, 4) + phone.slice(5))
    } else if (phone.length === 12) {
      variants.add(phone.slice(0, 4) + "9" + phone.slice(4))
    }
  }
  return [...variants]
}
