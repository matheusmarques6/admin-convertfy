import crypto from "crypto"
import { logger } from "@/lib/logger"
import { ENCRYPTED_FIELDS } from "@/lib/constants/credentials"

const log = logger.child("Crypto")

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const PREFIX = "enc:v1:"

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set")
  }
  return Buffer.from(key, "hex")
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  // Don't double-encrypt
  if (plaintext.startsWith(PREFIX)) return plaintext
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  return PREFIX + combined.toString("base64")
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext
  // If not encrypted, return as-is (backward compat)
  if (!ciphertext.startsWith(PREFIX)) return ciphertext
  try {
    const key = getKey()
    const combined = Buffer.from(ciphertext.slice(PREFIX.length), "base64")
    const iv = combined.subarray(0, IV_LENGTH)
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
  } catch (error) {
    log.error("Failed to decrypt value", { error })
    throw new Error("Failed to decrypt credential")
  }
}

export function encryptStoreCredentials<T extends Record<string, unknown>>(store: T): T {
  const result = { ...store }
  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field]
    if (typeof value === "string" && value) {
      (result as Record<string, unknown>)[field] = encrypt(value)
    }
  }
  return result
}

export function decryptStoreCredentials<T extends Record<string, unknown>>(store: T): T {
  const result = { ...store }
  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field]
    if (typeof value === "string" && value) {
      try {
        (result as Record<string, unknown>)[field] = decrypt(value)
      } catch {
        log.error(`Failed to decrypt field: ${field}`)
        ;(result as Record<string, unknown>)[field] = null
      }
    }
  }
  return result
}

// For integrations table - encrypt entire credentials object as JSON string
export function encryptCredentialsJson(credentials: Record<string, unknown>): string {
  return encrypt(JSON.stringify(credentials))
}

// For integrations table - decrypt string back to object, or return object if not encrypted
export function decryptCredentialsJson(value: unknown): Record<string, string> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, string>
  }
  if (typeof value === "string") {
    const decrypted = decrypt(value)
    return JSON.parse(decrypted)
  }
  return {}
}
