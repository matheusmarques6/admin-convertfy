/**
 * Shared avatar validation utilities used by both admin and portal avatar upload routes.
 */

export const AVATAR_BUCKET = "avatars"
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024 // 2MB
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type AvatarMimeType = (typeof AVATAR_ALLOWED_TYPES)[number]

// Magic bytes for server-side file validation
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }> = {
  "image/jpeg": { bytes: [0xff, 0xd8, 0xff] },
  "image/png": { bytes: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
}

// WebP has additional signature at offset 8
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] // "WEBP"

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const spec = MAGIC_BYTES[mimeType]
  if (!spec) return false

  const offset = spec.offset ?? 0
  if (buffer.length < offset + spec.bytes.length) return false

  for (let i = 0; i < spec.bytes.length; i++) {
    if (buffer[offset + i] !== spec.bytes[i]) return false
  }

  // Extra validation for WebP: check "WEBP" at offset 8
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false
    for (let i = 0; i < WEBP_SIGNATURE.length; i++) {
      if (buffer[8 + i] !== WEBP_SIGNATURE[i]) return false
    }
  }

  return true
}

export function getAvatarExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg": return "jpg"
    case "image/png": return "png"
    case "image/webp": return "webp"
    default: return "jpg"
  }
}
