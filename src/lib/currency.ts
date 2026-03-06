/**
 * Currency conversion helpers.
 * All monetary values in forms are stored as centavos (integer).
 * API/database expect reais (decimal).
 */

/** Convert centavos (integer) to reais (decimal). Ex: 600000 -> 6000.00 */
export const centsToReais = (cents: number): number => cents / 100

/** Convert reais (decimal) to centavos (integer). Ex: 6000.00 -> 600000 */
export const reaisToCents = (reais: number): number => Math.round(reais * 100)
