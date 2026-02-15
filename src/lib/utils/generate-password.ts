import { randomBytes } from "crypto"

/**
 * Generates a cryptographically secure temporary password.
 * Uses crypto.randomBytes() instead of Math.random().
 * Includes uppercase, lowercase, digits, and special characters.
 * Ambiguous characters (0, O, l, 1, I) are excluded for readability.
 */
export function generateTempPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghjkmnpqrstuvwxyz"
  const digits = "23456789"
  const special = "!@#$%&*-_=+"
  const allChars = upper + lower + digits + special

  const bytes = randomBytes(length)
  const passwordChars: string[] = []

  // Ensure at least one character from each category
  const required = [upper, lower, digits, special]
  for (let i = 0; i < required.length; i++) {
    const charSet = required[i]
    passwordChars.push(charSet[bytes[i] % charSet.length])
  }

  // Fill the rest with random characters from the full set
  for (let i = required.length; i < length; i++) {
    passwordChars.push(allChars[bytes[i] % allChars.length])
  }

  // Shuffle using Fisher-Yates with crypto random bytes
  const shuffleBytes = randomBytes(passwordChars.length)
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1)
    ;[passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]]
  }

  return passwordChars.join("")
}
