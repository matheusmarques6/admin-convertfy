import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { composeBackground } from "./compose-background"

async function solid(w: number, h: number, rgb: { r: number; g: number; b: number }) {
  return sharp({ create: { width: w, height: h, channels: 3, background: rgb } })
    .png()
    .toBuffer()
}

async function pixel(png: Buffer, x: number, y: number) {
  const { data } = await sharp(png)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { r: data[0], g: data[1], b: data[2] }
}

describe("composeBackground", () => {
  it("foto menor que o box: faixa em cima, foto encostada na base", async () => {
    // Proporção do caso real (598×632 num box de 598×1217), em escala 1/10.
    const photo = await solid(60, 63, { r: 200, g: 50, b: 50 })
    const r = await composeBackground({
      photo,
      width: 60,
      height: 122,
      color: "#034326",
      side: "bottom",
    })
    expect(r).not.toBeNull()
    expect(r!.band_height).toBe(122 - 63)
    expect(r!.photo).toEqual({ width: 60, height: 63 })
    const meta = await sharp(r!.png).metadata()
    expect([meta.width, meta.height]).toEqual([60, 122])
    // topo = faixa; base = foto
    expect(await pixel(r!.png, 5, 5)).toEqual({ r: 0x03, g: 0x43, b: 0x26 })
    expect(await pixel(r!.png, 5, 120)).toEqual({ r: 200, g: 50, b: 50 })
  })

  it("side=top inverte; foto mais larga que o box é ajustada à largura", async () => {
    const photo = await solid(120, 40, { r: 10, g: 200, b: 10 })
    const r = await composeBackground({
      photo,
      width: 60,
      height: 100,
      color: "#FFFFFF",
      side: "top",
    })
    expect(r!.photo).toEqual({ width: 60, height: 20 })
    expect(r!.band_height).toBe(80)
    expect(await pixel(r!.png, 5, 5)).toEqual({ r: 10, g: 200, b: 10 })
    expect(await pixel(r!.png, 5, 95)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it("foto que já cobre o box → null (idempotente num resume)", async () => {
    const photo = await solid(60, 122, { r: 1, g: 2, b: 3 })
    expect(
      await composeBackground({ photo, width: 60, height: 122, color: "#000000", side: "bottom" }),
    ).toBeNull()
    expect(
      await composeBackground({ photo, width: 60, height: 100, color: "#000000", side: "bottom" }),
    ).toBeNull()
  })

  it("cor inválida ou box inválido → null", async () => {
    const photo = await solid(10, 10, { r: 1, g: 2, b: 3 })
    expect(
      await composeBackground({ photo, width: 10, height: 20, color: "verde", side: "bottom" }),
    ).toBeNull()
    expect(
      await composeBackground({ photo, width: 0, height: 20, color: "#000000", side: "bottom" }),
    ).toBeNull()
  })
})
