import { describe, it, expect } from "vitest"
import {
  avatarPath,
  avatarPathsToClean,
  avatarPathsAll,
  getAvatarExtension,
} from "./avatar-validation"

const UID = "62decdad-1a88-414f-a16e-54290a052064"

describe("caminhos do avatar", () => {
  it("o primeiro segmento é SEMPRE o uid — é o que a policy de Storage exige", () => {
    for (const scope of ["admin", "portal"] as const) {
      expect(avatarPath(UID, "jpg", scope).split("/")[0]).toBe(UID)
    }
  })

  it("admin e portal nunca colidem", () => {
    expect(avatarPath(UID, "jpg", "admin")).toBe(`${UID}/avatar.jpg`)
    expect(avatarPath(UID, "jpg", "portal")).toBe(`${UID}/portal/avatar.jpg`)
  })

  it("a limpeza só alcança o PRÓPRIO escopo", () => {
    const admin = avatarPathsToClean(UID, "jpg", "admin")
    const portal = avatarPathsToClean(UID, "jpg", "portal")
    expect(admin).toEqual([`${UID}/avatar.png`, `${UID}/avatar.webp`])
    // O caminho do portal não pode aparecer na limpeza do admin (e vice-versa):
    // foi essa sobreposição que invalidava a URL da outra tabela.
    expect(admin.some((p) => p.includes("/portal/"))).toBe(false)
    expect(portal.every((p) => p.includes("/portal/"))).toBe(true)
  })

  it("a extensão mantida fica de fora da limpeza", () => {
    expect(avatarPathsToClean(UID, "webp")).not.toContain(`${UID}/avatar.webp`)
    expect(avatarPathsToClean(UID, "webp")).toHaveLength(2)
  })

  it("o DELETE alcança as três extensões do escopo", () => {
    expect(avatarPathsAll(UID)).toHaveLength(3)
    expect(avatarPathsAll(UID, "portal")).toEqual([
      `${UID}/portal/avatar.jpg`,
      `${UID}/portal/avatar.png`,
      `${UID}/portal/avatar.webp`,
    ])
  })

  it("toda extensão derivada de mime aceito tem caminho de limpeza", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
      const ext = getAvatarExtension(mime)
      expect(avatarPathsToClean(UID, ext)).toHaveLength(2)
    }
  })
})
