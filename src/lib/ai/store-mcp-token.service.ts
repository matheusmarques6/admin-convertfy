/**
 * Tokens do servidor MCP por loja (/api/mcp/stores/[id]).
 *
 * Cada loja pode ter UM token ativo ("cfy_mcp_..."), mostrado uma única
 * vez na geração; só o SHA-256 fica guardado (tabela `settings`, chave
 * store_mcp_tokens — zero migration). Rotacionar = gerar de novo;
 * revogar = apagar o hash.
 */

import { createHash, randomBytes } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"

const SETTINGS_KEY = "store_mcp_tokens"

interface TokenEntry {
  hash: string
  created_at: string
}

type TokenMap = Record<string, TokenEntry>

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

async function readMap(): Promise<TokenMap> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle()
  return ((data?.value as TokenMap) ?? {}) as TokenMap
}

async function writeMap(map: TokenMap): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("settings")
    .upsert(
      { key: SETTINGS_KEY, value: map, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
  if (error) throw error
}

/** Gera (ou rotaciona) o token da loja. Devolve o valor em claro UMA vez. */
export async function generateStoreMcpToken(storeId: string): Promise<string> {
  const token = `cfy_mcp_${randomBytes(24).toString("base64url")}`
  const map = await readMap()
  map[storeId] = { hash: sha256(token), created_at: new Date().toISOString() }
  await writeMap(map)
  return token
}

export async function revokeStoreMcpToken(storeId: string): Promise<void> {
  const map = await readMap()
  if (map[storeId]) {
    delete map[storeId]
    await writeMap(map)
  }
}

export async function storeMcpTokenStatus(storeId: string): Promise<{ exists: boolean; created_at: string | null }> {
  const map = await readMap()
  const entry = map[storeId]
  return { exists: Boolean(entry), created_at: entry?.created_at ?? null }
}

/** Confere um Bearer token contra o hash da loja. */
export async function verifyStoreMcpToken(storeId: string, token: string): Promise<boolean> {
  if (!token.startsWith("cfy_mcp_")) return false
  const map = await readMap()
  const entry = map[storeId]
  if (!entry) return false
  return entry.hash === sha256(token)
}
