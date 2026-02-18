/**
 * One-time script to encrypt existing plain-text credentials in client_stores.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ENCRYPTION_KEY=... node scripts/encrypt-existing-credentials.mjs
 *
 * Or if your .env has all three vars:
 *   node --env-file=.env scripts/encrypt-existing-credentials.mjs
 *
 * What it does:
 *   1. Reads all client_stores rows
 *   2. For each credential field NOT starting with "enc:v1:", encrypts it
 *   3. Updates the row with encrypted values
 *   4. Prints a summary of what was changed
 */

import crypto from "crypto"

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
  console.error("❌ Missing required env vars:")
  if (!SUPABASE_URL) console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  if (!SERVICE_ROLE_KEY) console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  if (!ENCRYPTION_KEY) console.error("   - ENCRYPTION_KEY")
  process.exit(1)
}

// ─── Crypto (same logic as src/lib/crypto.ts) ───────────────────────────────

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const PREFIX = "enc:v1:"

function encrypt(plaintext) {
  if (!plaintext) return plaintext
  if (plaintext.startsWith(PREFIX)) return plaintext // already encrypted
  const key = Buffer.from(ENCRYPTION_KEY, "hex")
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  return PREFIX + combined.toString("base64")
}

// ─── Supabase REST helpers ──────────────────────────────────────────────────

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
}

async function supabaseSelect(table, select = "*") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`SELECT ${table} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function supabaseUpdate(table, id, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`UPDATE ${table} id=${id} failed: ${res.status} ${await res.text()}`)
}

// ─── Fields to encrypt ──────────────────────────────────────────────────────

const CREDENTIAL_FIELDS = [
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
  "meta_access_token",
]

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔐 Encrypt Existing Credentials")
  console.log("================================\n")

  // 1. Fetch all stores
  const stores = await supabaseSelect("client_stores", "id,store_name," + CREDENTIAL_FIELDS.join(","))
  console.log(`📦 Found ${stores.length} store(s)\n`)

  let totalEncrypted = 0
  let storesUpdated = 0

  for (const store of stores) {
    const updates = {}
    const fieldsToEncrypt = []

    for (const field of CREDENTIAL_FIELDS) {
      const value = store[field]
      if (typeof value === "string" && value && !value.startsWith(PREFIX)) {
        updates[field] = encrypt(value)
        fieldsToEncrypt.push(field)
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log(`  🔒 ${store.store_name} (${store.id})`)
      for (const f of fieldsToEncrypt) {
        console.log(`     ├─ ${f}: ${store[f].substring(0, 8)}... → enc:v1:...`)
      }

      await supabaseUpdate("client_stores", store.id, updates)
      console.log(`     └─ ✅ Updated ${fieldsToEncrypt.length} field(s)\n`)

      totalEncrypted += fieldsToEncrypt.length
      storesUpdated++
    } else {
      console.log(`  ⏭️  ${store.store_name} — already encrypted or empty\n`)
    }
  }

  console.log("================================")
  console.log(`✅ Done! ${totalEncrypted} field(s) encrypted across ${storesUpdated} store(s)`)
  console.log("\n⚠️  IMPORTANT: Add the same ENCRYPTION_KEY to your Vercel environment variables!")
  console.log(`   Key: ${ENCRYPTION_KEY.substring(0, 8)}...${ENCRYPTION_KEY.substring(56)}`)
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message)
  process.exit(1)
})
