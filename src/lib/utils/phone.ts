/**
 * Strip Brazil country code (+55 / 55) from phone numbers before sending to Asaas.
 *
 * Asaas expects Brazilian phone numbers WITHOUT the country code prefix:
 * - Mobile: 11 digits (e.g. 11999999999)
 * - Landline: 10 digits (e.g. 1133334444)
 *
 * This function handles:
 * - "+5511999999999" → "11999999999"
 * - "5511999999999"  → "11999999999"
 * - "11999999999"    → "11999999999" (no change)
 * - "+551133334444"  → "1133334444"
 * - "999999999"      → "999999999" (unexpected format, let Asaas validate)
 */
export function stripBrazilCountryCode(
  phone: string | null | undefined
): string | undefined {
  if (!phone) return undefined

  const digits = phone.replace(/\D/g, "")

  // 12-13 digits starting with 55 → strip country code
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    return digits.slice(2)
  }

  // 10-11 digits → already in correct format
  if (digits.length >= 10 && digits.length <= 11) {
    return digits
  }

  // Unexpected format — return digits as-is (let Asaas validate)
  return digits || undefined
}
