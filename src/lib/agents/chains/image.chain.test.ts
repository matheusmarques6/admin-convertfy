import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────

// vi.hoisted garante que estes mocks existem antes dos vi.mock factories
const {
  sharpToBufferMock,
  sharpResizeMock,
  sharpPngMock,
  sharpFactoryMock,
  uploadMock,
  createSignedUrlMock,
  getPublicUrlMock,
} = vi.hoisted(() => {
  const sharpToBufferMock = vi.fn()
  const sharpPngMock = vi.fn(() => ({ toBuffer: sharpToBufferMock }))
  const sharpResizeMock = vi.fn(() => ({ png: sharpPngMock }))
  const sharpFactoryMock = vi.fn(() => ({ resize: sharpResizeMock }))
  const uploadMock = vi.fn()
  const createSignedUrlMock = vi.fn()
  const getPublicUrlMock = vi.fn()
  return {
    sharpToBufferMock,
    sharpResizeMock,
    sharpPngMock,
    sharpFactoryMock,
    uploadMock,
    createSignedUrlMock,
    getPublicUrlMock,
  }
})

vi.mock("sharp", () => ({
  default: sharpFactoryMock,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// PNG 1x1 valido em base64 (transparente)
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

function mockFetchOk() {
  // OpenRouter retorna o b64 dentro de uma data: URI
  const fakeBody = JSON.stringify({
    choices: [
      {
        message: {
          content: `Here is your image: data:image/png;base64,${TINY_PNG_B64}`,
        },
      },
    ],
  })
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => fakeBody,
  } as unknown as Response)
}

// Imports DEPOIS dos mocks
import { generateEmailImage } from "./image.chain"

describe("generateEmailImage — resize via sharp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
    global.fetch = mockFetchOk() as unknown as typeof fetch

    uploadMock.mockResolvedValue({ error: null })
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/img.png" },
      error: null,
    })
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://public.example/img.png" },
    })

    // Por padrao sharp retorna o buffer "resized" simulado
    sharpToBufferMock.mockResolvedValue(Buffer.from("resized-bytes"))
  })

  it("sem options.aspect: NAO chama sharp e faz upload do buffer original", async () => {
    const url = await generateEmailImage("prompt", "store-1")

    expect(sharpFactoryMock).not.toHaveBeenCalled()
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(url).toBe("https://signed.example/img.png")
  })

  it("com options.aspect='4:5' chama sharp.resize(1200, 1500, fit:cover, position:center)", async () => {
    await generateEmailImage("prompt", "store-1", { aspect: "4:5" })

    expect(sharpFactoryMock).toHaveBeenCalledTimes(1)
    expect(sharpResizeMock).toHaveBeenCalledWith(1200, 1500, {
      fit: "cover",
      position: "center",
    })
    expect(sharpPngMock).toHaveBeenCalledTimes(1)
    expect(sharpToBufferMock).toHaveBeenCalledTimes(1)
    // upload recebe o buffer resized
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const uploadedBuffer = uploadMock.mock.calls[0][1] as Buffer
    expect(uploadedBuffer.toString()).toBe("resized-bytes")
  })

  it("com options.aspect='3:5' usa dimensoes 720x1200", async () => {
    await generateEmailImage("prompt", "store-1", { aspect: "3:5" })
    expect(sharpResizeMock).toHaveBeenCalledWith(720, 1200, {
      fit: "cover",
      position: "center",
    })
  })

  it("com options.aspect='4:3' usa dimensoes 1200x900", async () => {
    await generateEmailImage("prompt", "store-1", { aspect: "4:3" })
    expect(sharpResizeMock).toHaveBeenCalledWith(1200, 900, {
      fit: "cover",
      position: "center",
    })
  })

  it("sharp throw: fallback pro buffer original (sem quebrar pipeline)", async () => {
    sharpToBufferMock.mockRejectedValueOnce(new Error("decode failed"))

    const url = await generateEmailImage("prompt", "store-1", {
      aspect: "4:5",
    })

    // upload ainda foi chamado (com buffer original)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const uploadedBuffer = uploadMock.mock.calls[0][1] as Buffer
    // buffer original e o decode do PNG base64, nao "resized-bytes"
    expect(uploadedBuffer.toString()).not.toBe("resized-bytes")
    expect(url).toBe("https://signed.example/img.png")
  })

  it("overlayReserveBottom apenas e informativo (nao afeta resize)", async () => {
    await generateEmailImage("prompt", "store-1", {
      aspect: "4:5",
      overlayReserveBottom: true,
    })
    // resize foi chamado normalmente, sem mudar dims
    expect(sharpResizeMock).toHaveBeenCalledWith(1200, 1500, {
      fit: "cover",
      position: "center",
    })
  })
})
