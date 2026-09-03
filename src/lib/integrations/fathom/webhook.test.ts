import crypto from "crypto"
import { describe, expect, it } from "vitest"
import { verifyFathomSignature } from "./verify-signature"
import { baseDomain, matchStoreForMeeting, type StoreForMatch } from "./match-store"

// Segredo de TESTE gerado aqui — nada de credencial real no repo.
const SECRET_RAW = Buffer.from("segredo-de-teste-para-hmac-32b!!").toString("base64")
const SECRET = `whsec_${SECRET_RAW}`

function sign(body: string, id: string, ts: string, secret = SECRET_RAW): string {
  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${ts}.${body}`, "utf8")
    .digest("base64")
  return `v1,${mac}`
}

describe("verifyFathomSignature", () => {
  const body = JSON.stringify({ recording_id: 1, title: "call" })
  const now = 1_756_900_000_000
  const ts = String(Math.floor(now / 1000))
  const id = "msg_2abc"

  it("aceita assinatura válida", () => {
    const r = verifyFathomSignature({
      rawBody: body,
      headers: { id, timestamp: ts, signature: sign(body, id, ts) },
      secret: SECRET,
      now,
    })
    expect(r.ok).toBe(true)
  })

  it("aceita segredo sem o prefixo whsec_", () => {
    const r = verifyFathomSignature({
      rawBody: body,
      headers: { id, timestamp: ts, signature: sign(body, id, ts) },
      secret: SECRET_RAW,
      now,
    })
    expect(r.ok).toBe(true)
  })

  it("aceita quando o header traz várias assinaturas (rotação)", () => {
    const outra = sign(body, id, ts, Buffer.from("outro-segredo-qualquer-32bytes!!").toString("base64"))
    const r = verifyFathomSignature({
      rawBody: body,
      headers: { id, timestamp: ts, signature: `${outra} ${sign(body, id, ts)}` },
      secret: SECRET,
      now,
    })
    expect(r.ok).toBe(true)
  })

  it("recusa corpo adulterado", () => {
    const r = verifyFathomSignature({
      rawBody: JSON.stringify({ recording_id: 999 }),
      headers: { id, timestamp: ts, signature: sign(body, id, ts) },
      secret: SECRET,
      now,
    })
    expect(r).toEqual({ ok: false, reason: "mismatch" })
  })

  it("recusa segredo errado", () => {
    const r = verifyFathomSignature({
      rawBody: body,
      headers: { id, timestamp: ts, signature: sign(body, id, ts) },
      secret: `whsec_${Buffer.from("outro-segredo-qualquer-32bytes!!").toString("base64")}`,
      now,
    })
    expect(r.ok).toBe(false)
  })

  it("recusa replay fora da janela de 5 minutos", () => {
    const velho = String(Math.floor(now / 1000) - 6 * 60)
    const r = verifyFathomSignature({
      rawBody: body,
      headers: { id, timestamp: velho, signature: sign(body, id, velho) },
      secret: SECRET,
      now,
    })
    expect(r).toEqual({ ok: false, reason: "expired" })
  })

  it("recusa headers ausentes e timestamp não numérico", () => {
    expect(
      verifyFathomSignature({
        rawBody: body,
        headers: { id: null, timestamp: ts, signature: "v1,x" },
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: false, reason: "missing_headers" })
    expect(
      verifyFathomSignature({
        rawBody: body,
        headers: { id, timestamp: "ontem", signature: "v1,x" },
        secret: SECRET,
        now,
      }),
    ).toEqual({ ok: false, reason: "bad_timestamp" })
  })
})

describe("baseDomain", () => {
  it("extrai o domínio de url e de email", () => {
    expect(baseDomain("https://www.lojax.com.br/produtos?a=1")).toBe("lojax.com.br")
    expect(baseDomain("dono@LojaX.com")).toBe("lojax.com")
    expect(baseDomain("lojax.com:443")).toBe("lojax.com")
    expect(baseDomain(null)).toBeNull()
    expect(baseDomain("  ")).toBeNull()
  })
})

describe("matchStoreForMeeting", () => {
  const stores: StoreForMatch[] = [
    { id: "s1", store_name: "Loja X", store_url: "https://lojax.com.br" },
    { id: "s2", store_name: "Boutique Verde", store_url: "https://boutiqueverde.com" },
    { id: "s3", store_name: "Vip", store_url: null },
  ]

  it("casa pelo domínio do convidado externo", () => {
    const m = matchStoreForMeeting(
      {
        title: "Alinhamento mensal",
        participants: [
          { email: "ana@convertfy.me", is_external: false },
          { email: "dono@lojax.com.br", is_external: true },
        ],
      },
      stores,
    )
    expect(m).toEqual({ store_id: "s1", reason: "domain", evidence: "lojax.com.br" })
  })

  it("ignora domínio de email genérico", () => {
    const m = matchStoreForMeeting(
      {
        title: "Reunião",
        participants: [{ email: "cliente@gmail.com", is_external: true }],
      },
      stores,
    )
    expect(m).toBeNull()
  })

  it("cai para o nome no título quando não há domínio", () => {
    const m = matchStoreForMeeting(
      {
        title: "Alinhamento — Boutique Verde (setembro)",
        participants: [{ email: "cliente@gmail.com", is_external: true }],
      },
      stores,
    )
    expect(m).toMatchObject({ store_id: "s2", reason: "title" })
  })

  it("nome curto demais não casa pelo título", () => {
    const m = matchStoreForMeeting(
      { title: "Call vip com o cliente", participants: [] },
      stores,
    )
    expect(m).toBeNull()
  })

  it("título casa ignorando acento e caixa", () => {
    const m = matchStoreForMeeting(
      { title: "REUNIÃO BOUTIQUE VERDE", participants: [] },
      stores,
    )
    expect(m).toMatchObject({ store_id: "s2" })
  })

  it("empate de domínio não chuta loja", () => {
    const duplicadas: StoreForMatch[] = [
      { id: "a", store_name: "Loja A", store_url: "https://mesmodominio.com" },
      { id: "b", store_name: "Loja B", store_url: "https://mesmodominio.com" },
    ]
    const m = matchStoreForMeeting(
      { title: "call", participants: [{ email: "x@mesmodominio.com", is_external: true }] },
      duplicadas,
    )
    expect(m).toBeNull()
  })

  it("no título, o nome mais específico vence", () => {
    const lojas: StoreForMatch[] = [
      { id: "a", store_name: "Loja", store_url: null },
      { id: "b", store_name: "Loja Premium", store_url: null },
    ]
    const m = matchStoreForMeeting({ title: "Call Loja Premium", participants: [] }, lojas)
    expect(m).toMatchObject({ store_id: "b" })
  })

  it("participante interno não conta como evidência", () => {
    const m = matchStoreForMeeting(
      {
        title: "sem nome de loja",
        participants: [{ email: "dono@lojax.com.br", is_external: false }],
      },
      stores,
    )
    expect(m).toBeNull()
  })
})
