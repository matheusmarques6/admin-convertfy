import { describe, expect, it } from "vitest"
import {
  buildRotatedValue,
  isWebhookSecretValidFor,
  maskLast4,
  resolveEvolutionRuntimeConfig,
  type EvolutionSettingsValue,
} from "./evolution-settings"

// decryptFn fake: "enc(x)" → "x" (nunca chama o crypto real nos puros)
const fakeDecrypt = (s: string): string => {
  const m = /^enc\((.*)\)$/.exec(s)
  if (!m) throw new Error("ciphertext inválido")
  return m[1]
}

describe("maskLast4", () => {
  it("mascara mantendo os últimos 4", () => {
    expect(maskLast4("sk-abcdef1234")).toBe("•••• 1234")
    expect(maskLast4("a1b2")).toBe("•••• a1b2")
  })
})

describe("resolveEvolutionRuntimeConfig", () => {
  const env = { baseUrl: "https://evo.test/", apiKey: "env-key", webhookSecret: "env-secret" }

  it("banco vence env (key e secret) e marca source db", () => {
    const value: EvolutionSettingsValue = {
      api_key_enc: "enc(db-key)",
      webhook_secret_enc: "enc(db-secret)",
    }
    const cfg = resolveEvolutionRuntimeConfig(env, value, fakeDecrypt)
    expect(cfg).not.toBeNull()
    expect(cfg!.baseUrl).toBe("https://evo.test") // trailing slash removida
    expect(cfg!.apiKey).toBe("db-key")
    expect(cfg!.webhookSecret).toBe("db-secret")
    expect(cfg!.apiKeySource).toBe("db")
    expect(cfg!.webhookSecretSource).toBe("db")
  })

  it("fallback env quando a row está vazia/null", () => {
    const cfg = resolveEvolutionRuntimeConfig(env, null, fakeDecrypt)
    expect(cfg).not.toBeNull()
    expect(cfg!.apiKey).toBe("env-key")
    expect(cfg!.webhookSecret).toBe("env-secret")
    expect(cfg!.apiKeySource).toBe("env")
    expect(cfg!.webhookSecretSource).toBe("env")
  })

  it("mistura: key do banco + secret da env", () => {
    const cfg = resolveEvolutionRuntimeConfig(env, { api_key_enc: "enc(db-key)" }, fakeDecrypt)
    expect(cfg!.apiKey).toBe("db-key")
    expect(cfg!.apiKeySource).toBe("db")
    expect(cfg!.webhookSecret).toBe("env-secret")
    expect(cfg!.webhookSecretSource).toBe("env")
  })

  it("sem baseUrl na env → null (URL é SEMPRE da env)", () => {
    const cfg = resolveEvolutionRuntimeConfig(
      { baseUrl: null, apiKey: "k", webhookSecret: "s" },
      { api_key_enc: "enc(db-key)", webhook_secret_enc: "enc(db-secret)" },
      fakeDecrypt,
    )
    expect(cfg).toBeNull()
  })

  it("faltando QUALQUER um dos 3 em todo lugar → null (decisão documentada)", () => {
    // sem key
    expect(
      resolveEvolutionRuntimeConfig({ baseUrl: "https://evo.test", webhookSecret: "s" }, null, fakeDecrypt),
    ).toBeNull()
    // sem secret
    expect(
      resolveEvolutionRuntimeConfig({ baseUrl: "https://evo.test", apiKey: "k" }, null, fakeDecrypt),
    ).toBeNull()
  })

  it("expõe previous secret decifrado + until como Date", () => {
    const until = new Date(Date.now() + 3600_000).toISOString()
    const cfg = resolveEvolutionRuntimeConfig(
      env,
      {
        webhook_secret_enc: "enc(new-secret)",
        previous_webhook_secret_enc: "enc(old-secret)",
        previous_secret_until: until,
      },
      fakeDecrypt,
    )
    expect(cfg!.previousWebhookSecret).toBe("old-secret")
    expect(cfg!.previousSecretUntil?.toISOString()).toBe(until)
  })

  it("decrypt que falha num campo cai no fallback env (não derruba tudo)", () => {
    const cfg = resolveEvolutionRuntimeConfig(env, { api_key_enc: "corrompido" }, fakeDecrypt)
    expect(cfg).not.toBeNull()
    expect(cfg!.apiKey).toBe("env-key")
    expect(cfg!.apiKeySource).toBe("env")
  })
})

describe("buildRotatedValue", () => {
  const NOW = "2026-07-12T12:00:00.000Z"
  const USER = "user-1"

  it("rotação de secret move o atual pra previous com until = now+24h", () => {
    const current: EvolutionSettingsValue = { webhook_secret_enc: "enc(old)" }
    const next = buildRotatedValue(current, { webhookSecretEnc: "enc(new)" }, NOW, USER)
    expect(next.webhook_secret_enc).toBe("enc(new)")
    expect(next.previous_webhook_secret_enc).toBe("enc(old)")
    expect(next.previous_secret_until).toBe("2026-07-13T12:00:00.000Z")
    expect(next.updated_at).toBe(NOW)
    expect(next.updated_by).toBe(USER)
  })

  it("primeiro secret (sem atual) não cria previous", () => {
    const next = buildRotatedValue(null, { webhookSecretEnc: "enc(first)" }, NOW, USER)
    expect(next.webhook_secret_enc).toBe("enc(first)")
    expect(next.previous_webhook_secret_enc).toBeUndefined()
    expect(next.previous_secret_until).toBeUndefined()
  })

  it("update só de api_key não mexe em previous nem no secret", () => {
    const current: EvolutionSettingsValue = {
      webhook_secret_enc: "enc(keep)",
      previous_webhook_secret_enc: "enc(older)",
      previous_secret_until: "2026-07-10T00:00:00.000Z",
    }
    const next = buildRotatedValue(current, { apiKeyEnc: "enc(k2)", apiKeyLast4: "•••• k2k2" }, NOW, USER)
    expect(next.api_key_enc).toBe("enc(k2)")
    expect(next.api_key_last4).toBe("•••• k2k2")
    expect(next.webhook_secret_enc).toBe("enc(keep)")
    expect(next.previous_webhook_secret_enc).toBe("enc(older)")
    expect(next.previous_secret_until).toBe("2026-07-10T00:00:00.000Z")
  })

  it("secret igual (caller NÃO passa webhookSecretEnc) preserva rotação em andamento", () => {
    // Ciphertext AES-GCM tem IV aleatório — a decisão "mudou?" é do
    // caller, por plaintext. Re-submeter o mesmo secret NÃO pode renovar
    // a janela nem sobrescrever o previous de uma rotação em curso.
    const current: EvolutionSettingsValue = {
      webhook_secret_enc: "enc(B)",
      previous_webhook_secret_enc: "enc(A)",
      previous_secret_until: "2026-07-13T00:00:00.000Z",
    }
    const next = buildRotatedValue(current, {}, NOW, USER)
    expect(next.webhook_secret_enc).toBe("enc(B)")
    expect(next.previous_webhook_secret_enc).toBe("enc(A)")
    expect(next.previous_secret_until).toBe("2026-07-13T00:00:00.000Z")
    expect(next.updated_at).toBe(NOW)
    expect(next.updated_by).toBe(USER)
  })

  it("migração env→db: rotation.previousSecretEnc dá janela de graça ao secret da env", () => {
    // Antes da feature o secret vinha só da env — a primeira gravação no
    // banco precisa manter o secret da env válido por 24h (rewire falho
    // não pode quebrar canais na hora).
    const next = buildRotatedValue(
      null,
      { webhookSecretEnc: "enc(new)" },
      NOW,
      USER,
      { previousSecretEnc: "enc(env-secret)" },
    )
    expect(next.webhook_secret_enc).toBe("enc(new)")
    expect(next.previous_webhook_secret_enc).toBe("enc(env-secret)")
    expect(next.previous_secret_until).toBe("2026-07-13T12:00:00.000Z")
  })

  it("rotation.previousSecretEnc null (nunca houve secret) não cria previous", () => {
    const next = buildRotatedValue(null, { webhookSecretEnc: "enc(first)" }, NOW, USER, {
      previousSecretEnc: null,
    })
    expect(next.previous_webhook_secret_enc).toBeUndefined()
    expect(next.previous_secret_until).toBeUndefined()
  })
})

describe("isWebhookSecretValidFor", () => {
  const now = new Date("2026-07-12T12:00:00Z")
  const future = new Date("2026-07-13T00:00:00Z")
  const past = new Date("2026-07-11T00:00:00Z")

  it("secret atual válido", () => {
    expect(
      isWebhookSecretValidFor(
        "current-secret",
        { webhookSecret: "current-secret", previousWebhookSecret: null, previousSecretUntil: null },
        now,
      ),
    ).toBe(true)
  })

  it("secret anterior DENTRO da janela é aceito", () => {
    expect(
      isWebhookSecretValidFor(
        "old-secret",
        { webhookSecret: "current-secret", previousWebhookSecret: "old-secret", previousSecretUntil: future },
        now,
      ),
    ).toBe(true)
  })

  it("secret anterior FORA da janela é recusado", () => {
    expect(
      isWebhookSecretValidFor(
        "old-secret",
        { webhookSecret: "current-secret", previousWebhookSecret: "old-secret", previousSecretUntil: past },
        now,
      ),
    ).toBe(false)
  })

  it("anterior sem until é recusado", () => {
    expect(
      isWebhookSecretValidFor(
        "old-secret",
        { webhookSecret: "current-secret", previousWebhookSecret: "old-secret", previousSecretUntil: null },
        now,
      ),
    ).toBe(false)
  })

  it("ambos null → inválido (e string errada também)", () => {
    expect(
      isWebhookSecretValidFor("x", { webhookSecret: null, previousWebhookSecret: null, previousSecretUntil: null }, now),
    ).toBe(false)
    expect(
      isWebhookSecretValidFor(
        "wrong-secret1",
        { webhookSecret: "right-secret", previousWebhookSecret: null, previousSecretUntil: null },
        now,
      ),
    ).toBe(false)
  })
})
