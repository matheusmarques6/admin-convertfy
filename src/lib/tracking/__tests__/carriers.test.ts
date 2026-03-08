import { describe, expect, it } from "vitest"
import { detectCarrierProvider, type CarrierInfo } from "../carriers"

// Helper to assert carrier detection results
function expectCarrier(
  trackingNumber: string,
  expected: { code: string; provider: string; isUpu?: boolean }
) {
  const result = detectCarrierProvider(trackingNumber)
  expect(result.code).toBe(expected.code)
  expect(result.provider).toBe(expected.provider)
  if (expected.isUpu !== undefined) {
    expect(result.isUpu).toBe(expected.isUpu)
  } else {
    // isUpu should be falsy (undefined or false)
    expect(result.isUpu).toBeFalsy()
  }
}

describe("detectCarrierProvider", () => {
  // ── Correios (Brazil) ──────────────────────────────────────────────────
  describe("Correios - BR codes", () => {
    it("detects standard BR tracking code", () => {
      expectCarrier("AB123456789BR", { code: "correios", provider: "correios", isUpu: true })
    })

    it("detects various BR prefixes", () => {
      expectCarrier("NX123456789BR", { code: "correios", provider: "correios", isUpu: true })
      expectCarrier("SS123456789BR", { code: "correios", provider: "correios", isUpu: true })
      expectCarrier("RR123456789BR", { code: "correios", provider: "correios", isUpu: true })
    })

    it("trims and uppercases input", () => {
      expectCarrier("  ab123456789br  ", { code: "correios", provider: "correios", isUpu: true })
    })
  })

  // ── China Post ─────────────────────────────────────────────────────────
  describe("China Post - CN codes", () => {
    it("detects standard CN tracking code", () => {
      expectCarrier("RB123456789CN", { code: "chinapost", provider: "cainiao", isUpu: true })
    })

    it("detects ePacket CN codes", () => {
      expectCarrier("LX123456789CN", { code: "chinapost", provider: "cainiao", isUpu: true })
    })
  })

  // ── Yanwen ─────────────────────────────────────────────────────────────
  describe("Yanwen", () => {
    it("detects LP prefix with YP suffix", () => {
      expectCarrier("LP123456789YP", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("detects YT prefix with CN suffix", () => {
      expectCarrier("YT123456789CN", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("detects LV prefix with YP suffix", () => {
      expectCarrier("LV123456789YP", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("detects UG prefix with CN suffix", () => {
      expectCarrier("UG123456789CN", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("detects YW prefix with YP suffix", () => {
      expectCarrier("YW123456789YP", { code: "yanwen", provider: "cainiao", isUpu: true })
    })
  })

  // ── PostNL ─────────────────────────────────────────────────────────────
  describe("PostNL", () => {
    it("detects UPU NL code with isUpu true", () => {
      expectCarrier("AB123456789NL", { code: "postnl", provider: "postnl", isUpu: true })
    })

    it("detects 3S proprietary code without isUpu", () => {
      expectCarrier("3SABCDEFGHIJK", { code: "postnl", provider: "postnl" })
    })

    it("detects JVGL proprietary code without isUpu", () => {
      expectCarrier("JVGL1234567890", { code: "postnl", provider: "postnl" })
    })

    it("3S codes of various lengths", () => {
      // 3S + 11 chars
      expectCarrier("3SABCDEFGHIJK", { code: "postnl", provider: "postnl" })
      // 3S + 15 chars
      expectCarrier("3SABCDEFGHIJKLMNO", { code: "postnl", provider: "postnl" })
    })
  })

  // ── Cainiao (long numeric / LP long / CAINIAO prefix) ─────────────────
  describe("Cainiao - long codes", () => {
    it("detects long numeric (17+ digits, AliExpress)", () => {
      expectCarrier("12345678901234567", { code: "cainiao", provider: "cainiao" })
    })

    it("detects LP + 15+ digits", () => {
      expectCarrier("LP123456789012345", { code: "cainiao", provider: "cainiao" })
    })

    it("detects CAINIAO prefix", () => {
      expectCarrier("CAINIAO123456", { code: "cainiao", provider: "cainiao" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("12345678901234567")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── Jadlog ─────────────────────────────────────────────────────────────
  describe("Jadlog - 14 digits", () => {
    it("detects 14-digit code", () => {
      expectCarrier("12345678901234", { code: "jadlog", provider: "trackingmore" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("12345678901234")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── Total Express ──────────────────────────────────────────────────────
  describe("TotalExpress", () => {
    it("detects TE prefix", () => {
      expectCarrier("TE123456789", { code: "totalexpress", provider: "trackingmore" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("TE123456789")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── WanbExpress ────────────────────────────────────────────────────────
  describe("WanbExpress", () => {
    it("detects WB prefix", () => {
      expectCarrier("WB123456789", { code: "wanbexpress", provider: "cainiao" })
    })

    it("detects WANB prefix", () => {
      expectCarrier("WANB123456789", { code: "wanbexpress", provider: "cainiao" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("WB123456789")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── SDH Express ────────────────────────────────────────────────────────
  describe("SDH Express", () => {
    it("detects SDH prefix", () => {
      expectCarrier("SDH123456789", { code: "sdhexpress", provider: "cainiao" })
    })

    it("detects SH prefix", () => {
      expectCarrier("SH123456789", { code: "sdhexpress", provider: "cainiao" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("SDH123456789")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── Catch-all UPU (countries not explicitly mapped) ────────────────────
  describe("Catch-all UPU", () => {
    it("detects AR (Argentina) as post_ar with isUpu", () => {
      expectCarrier("RR123456789AR", { code: "post_ar", provider: "cainiao", isUpu: true })
    })

    it("detects JP (Japan) as post_jp with isUpu", () => {
      expectCarrier("EJ123456789JP", { code: "post_jp", provider: "cainiao", isUpu: true })
    })

    it("detects SG (Singapore) as post_sg with isUpu", () => {
      expectCarrier("RS123456789SG", { code: "post_sg", provider: "cainiao", isUpu: true })
    })

    it("detects HK (Hong Kong) as post_hk with isUpu", () => {
      expectCarrier("CP123456789HK", { code: "post_hk", provider: "cainiao", isUpu: true })
    })

    it("detects DE (Germany) as post_de with isUpu", () => {
      expectCarrier("RR123456789DE", { code: "post_de", provider: "cainiao", isUpu: true })
    })

    it("detects US (United States) as post_us with isUpu", () => {
      expectCarrier("LZ123456789US", { code: "post_us", provider: "cainiao", isUpu: true })
    })

    it("country code is lowercase in result code", () => {
      const result = detectCarrierProvider("AB123456789FR")
      expect(result.code).toBe("post_fr")
    })
  })

  // ── Unknown (not UPU, not matching any pattern) ────────────────────────
  describe("Unknown codes", () => {
    it("returns unknown for random alphanumeric", () => {
      expectCarrier("XYZABC123", { code: "unknown", provider: "unknown" })
    })

    it("returns unknown for short numeric", () => {
      expectCarrier("12345", { code: "unknown", provider: "unknown" })
    })

    it("returns unknown for empty-ish input", () => {
      expectCarrier("A", { code: "unknown", provider: "unknown" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("XYZABC123")
      expect(result.isUpu).toBeFalsy()
    })
  })

  // ── Correios canRun logic (via PROVIDER_REGISTRY) ──────────────────────
  // We test the canRun behavior indirectly through the carrier detection
  // since the PROVIDER_REGISTRY is not exported. The key rule is:
  // canRun = (c.code === "correios" || c.isUpu === true)
  describe("Correios fallback eligibility (isUpu flag)", () => {
    it("BR codes are eligible (code=correios)", () => {
      const result = detectCarrierProvider("AB123456789BR")
      expect(result.code === "correios" || result.isUpu === true).toBe(true)
    })

    it("CN codes are eligible (isUpu=true)", () => {
      const result = detectCarrierProvider("RB123456789CN")
      expect(result.code === "correios" || result.isUpu === true).toBe(true)
    })

    it("UPU catch-all codes are eligible (isUpu=true)", () => {
      const result = detectCarrierProvider("RR123456789AR")
      expect(result.code === "correios" || result.isUpu === true).toBe(true)
    })

    it("PostNL UPU codes are eligible (isUpu=true)", () => {
      const result = detectCarrierProvider("AB123456789NL")
      expect(result.code === "correios" || result.isUpu === true).toBe(true)
    })

    it("WanbExpress is NOT eligible", () => {
      const result = detectCarrierProvider("WB123456789")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("SDH Express is NOT eligible", () => {
      const result = detectCarrierProvider("SDH123456789")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("Cainiao long is NOT eligible", () => {
      const result = detectCarrierProvider("12345678901234567")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("Jadlog is NOT eligible", () => {
      const result = detectCarrierProvider("12345678901234")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("TotalExpress is NOT eligible", () => {
      const result = detectCarrierProvider("TE123456789")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("Unknown is NOT eligible", () => {
      const result = detectCarrierProvider("XYZABC123")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("PostNL 3S proprietary is NOT eligible", () => {
      const result = detectCarrierProvider("3SABCDEFGHIJK")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })

    it("YunExpress is NOT eligible", () => {
      const result = detectCarrierProvider("YT2024030700001234")
      expect(result.code === "correios" || result.isUpu === true).toBe(false)
    })
  })

  // ── YunExpress ─────────────────────────────────────────────────────────
  describe("YunExpress", () => {
    it("detects YT + 16 digits as yunexpress", () => {
      expectCarrier("YT2024030700001234", { code: "yunexpress", provider: "yunexpress" })
    })

    it("detects YT + 17 digits as yunexpress", () => {
      expectCarrier("YT20240307000012345", { code: "yunexpress", provider: "yunexpress" })
    })

    it("detects YT + 20 digits as yunexpress", () => {
      expectCarrier("YT12345678901234567890", { code: "yunexpress", provider: "yunexpress" })
    })

    it("does NOT match Yanwen (YT + 9 digits + YP)", () => {
      expectCarrier("YT123456789YP", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("does NOT match Yanwen (YT + 9 digits + CN)", () => {
      expectCarrier("YT123456789CN", { code: "yanwen", provider: "cainiao", isUpu: true })
    })

    it("intermediate YT (13 chars, no suffix) falls to unknown", () => {
      expectCarrier("YT12345678901", { code: "unknown", provider: "unknown" })
    })

    it("intermediate YT (15 digits) falls to unknown", () => {
      expectCarrier("YT123456789012345", { code: "unknown", provider: "unknown" })
    })

    it("does NOT have isUpu", () => {
      const result = detectCarrierProvider("YT2024030700001234")
      expect(result.isUpu).toBeFalsy()
    })
  })
})
