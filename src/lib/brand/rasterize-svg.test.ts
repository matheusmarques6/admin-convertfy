import { describe, it, expect, vi, beforeEach } from "vitest"

// Mocka o sharp (nativo) — só verificamos o encadeamento factory→resize→png→toBuffer.
const { sharpFactoryMock, sharpResizeMock, sharpPngMock, sharpToBufferMock } = vi.hoisted(
  () => {
    const sharpToBufferMock = vi.fn()
    const sharpPngMock = vi.fn(() => ({ toBuffer: sharpToBufferMock }))
    const sharpResizeMock = vi.fn(() => ({ png: sharpPngMock }))
    const sharpFactoryMock = vi.fn(() => ({ resize: sharpResizeMock }))
    return { sharpFactoryMock, sharpResizeMock, sharpPngMock, sharpToBufferMock }
  },
)
vi.mock("sharp", () => ({ default: sharpFactoryMock }))

import { rasterizeSvgToPng } from "./rasterize-svg"

describe("rasterizeSvgToPng", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sharpToBufferMock.mockResolvedValue(Buffer.from("png-bytes"))
  })

  it("rasteriza o SVG em PNG via sharp (density + resize inside + png)", async () => {
    const svg = Buffer.from("<svg/>")
    const out = await rasterizeSvgToPng(svg)
    expect(out).toEqual(Buffer.from("png-bytes"))
    expect(sharpFactoryMock).toHaveBeenCalledWith(svg, { density: 384 })
    expect(sharpResizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, fit: "inside" }),
    )
    expect(sharpPngMock).toHaveBeenCalled()
    expect(sharpToBufferMock).toHaveBeenCalled()
  })

  it("respeita width/density customizados", async () => {
    await rasterizeSvgToPng(Buffer.from("<svg/>"), { width: 512, density: 200 })
    expect(sharpFactoryMock).toHaveBeenCalledWith(expect.any(Buffer), { density: 200 })
    expect(sharpResizeMock).toHaveBeenCalledWith(expect.objectContaining({ width: 512 }))
  })
})
