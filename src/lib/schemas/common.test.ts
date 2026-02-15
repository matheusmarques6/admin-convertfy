import { describe, it, expect } from "vitest"
import {
  emailSchema,
  passwordSchema,
  uuidSchema,
  paginationSchema,
  campaignCreateSchema,
  organizationCreateSchema,
  orgMemberCreateSchema,
  taskCreateSchema,
  portalUserCreateSchema,
  storeCredentialsSchema,
} from "./common"

describe("emailSchema", () => {
  it("should accept valid emails", () => {
    expect(emailSchema.parse("user@example.com")).toBe("user@example.com")
  })

  it("should lowercase and trim emails", () => {
    expect(emailSchema.parse("  User@Example.COM  ")).toBe("user@example.com")
  })

  it("should reject invalid emails", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow()
    expect(() => emailSchema.parse("")).toThrow()
  })
})

describe("passwordSchema", () => {
  it("should accept passwords with 6+ characters", () => {
    expect(passwordSchema.parse("123456")).toBe("123456")
  })

  it("should reject short passwords", () => {
    expect(() => passwordSchema.parse("12345")).toThrow()
  })
})

describe("uuidSchema", () => {
  it("should accept valid UUIDs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000"
    expect(uuidSchema.parse(uuid)).toBe(uuid)
  })

  it("should reject invalid UUIDs", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow()
    expect(() => uuidSchema.parse("")).toThrow()
  })
})

describe("paginationSchema", () => {
  it("should use defaults when no values provided", () => {
    const result = paginationSchema.parse({})
    expect(result.page).toBe(1)
    expect(result.per_page).toBe(20)
  })

  it("should coerce string numbers", () => {
    const result = paginationSchema.parse({ page: "3", per_page: "50" })
    expect(result.page).toBe(3)
    expect(result.per_page).toBe(50)
  })

  it("should reject per_page > 100", () => {
    expect(() => paginationSchema.parse({ per_page: 101 })).toThrow()
  })

  it("should reject page < 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow()
  })
})

describe("campaignCreateSchema", () => {
  const validCampaign = {
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Black Friday Campaign",
    scheduled_date: "2026-11-29",
    channel: "email" as const,
    campaign_type: "campaign" as const,
  }

  it("should accept valid campaign data", () => {
    const result = campaignCreateSchema.parse(validCampaign)
    expect(result.name).toBe("Black Friday Campaign")
  })

  it("should reject missing required fields", () => {
    expect(() => campaignCreateSchema.parse({ name: "Test" })).toThrow()
  })

  it("should reject invalid channel", () => {
    expect(() => campaignCreateSchema.parse({ ...validCampaign, channel: "fax" })).toThrow()
  })
})

describe("organizationCreateSchema", () => {
  it("should accept valid org data", () => {
    const result = organizationCreateSchema.parse({ name: "Convertfy", slug: "convertfy" })
    expect(result.name).toBe("Convertfy")
  })

  it("should reject slug with spaces", () => {
    expect(() => organizationCreateSchema.parse({ name: "Test", slug: "has spaces" })).toThrow()
  })

  it("should reject slug with uppercase", () => {
    expect(() => organizationCreateSchema.parse({ name: "Test", slug: "HasUpper" })).toThrow()
  })
})

describe("orgMemberCreateSchema", () => {
  it("should accept with profile_id", () => {
    const result = orgMemberCreateSchema.parse({
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      profile_id: "550e8400-e29b-41d4-a716-446655440001",
      role: "agent",
    })
    expect(result.role).toBe("agent")
  })

  it("should accept with email + name (no profile_id)", () => {
    const result = orgMemberCreateSchema.parse({
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@test.com",
      name: "John",
      role: "viewer",
    })
    expect(result.email).toBe("user@test.com")
  })

  it("should reject without profile_id and without email+name", () => {
    expect(() => orgMemberCreateSchema.parse({
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "agent",
    })).toThrow()
  })
})

describe("taskCreateSchema", () => {
  it("should accept minimal task data", () => {
    const result = taskCreateSchema.parse({ title: "Fix bug" })
    expect(result.title).toBe("Fix bug")
    expect(result.type).toBe("general")
    expect(result.priority).toBe("medium")
  })

  it("should reject empty title", () => {
    expect(() => taskCreateSchema.parse({ title: "" })).toThrow()
  })
})

describe("portalUserCreateSchema", () => {
  it("should accept valid portal user", () => {
    const result = portalUserCreateSchema.parse({
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@test.com",
      name: "Maria",
    })
    expect(result.is_primary).toBe(false)
  })

  it("should reject missing client_id", () => {
    expect(() => portalUserCreateSchema.parse({ email: "user@test.com", name: "Maria" })).toThrow()
  })
})

describe("storeCredentialsSchema", () => {
  it("should accept with at least one credential", () => {
    const result = storeCredentialsSchema.parse({
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      klaviyo_private_key: "pk_abc123",
    })
    expect(result.klaviyo_private_key).toBe("pk_abc123")
  })

  it("should reject without any credential", () => {
    expect(() => storeCredentialsSchema.parse({
      store_id: "550e8400-e29b-41d4-a716-446655440000",
    })).toThrow()
  })
})
