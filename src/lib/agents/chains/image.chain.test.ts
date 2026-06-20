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

// ── AE-13: PRODUCT-REF multimodal ─────────────────────────────────────
describe("generateEmailImage — AE-13 multimodal (product_ref)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
    uploadMock.mockResolvedValue({ error: null })
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/img.png" },
      error: null,
    })
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://public.example/img.png" },
    })
    sharpToBufferMock.mockResolvedValue(Buffer.from("resized-bytes"))
  })

  it("mode='product_ref' + referenceImageUrl: body usa content array", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("the prompt", "store-1", {
      mode: "product_ref",
      referenceImageUrl: "https://cdn/capa.jpg",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://cdn/capa.jpg" } },
          { type: "text", text: "the prompt" },
        ],
      },
    ])
  })

  it("retry uma vez com text2img quando OpenRouter rejeita multimodal (4xx 'image input not supported')", async () => {
    const fetchMock = vi
      .fn()
      // 1a chamada: 400 multimodal nao suportado
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: { message: "Image input not supported by this model" },
          }),
      } as unknown as Response)
      // 2a chamada: sucesso text2img puro
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `data:image/png;base64,${TINY_PNG_B64}`,
                },
              },
            ],
          }),
      } as unknown as Response)

    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("the prompt", "store-1", {
      mode: "product_ref",
      referenceImageUrl: "https://cdn/capa.jpg",
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 2a chamada NAO usa content array (text2img puro)
    const [, init2] = fetchMock.mock.calls[1]
    const body2 = JSON.parse((init2 as RequestInit).body as string)
    expect(body2.messages).toEqual([
      { role: "user", content: "the prompt" },
    ])
    // pipeline segue normalmente apos retry
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(url).toBe("https://signed.example/img.png")
  })

  it("sem mode ou sem referenceImageUrl: body legacy (string content, sem array)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("the prompt", "store-1", { aspect: "4:5" })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([{ role: "user", content: "the prompt" }])
  })

  it("mode='product_ref' SEM referenceImageUrl: cai pro body legacy (defesa em profundidade)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("the prompt", "store-1", {
      mode: "product_ref",
      // referenceImageUrl ausente
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([{ role: "user", content: "the prompt" }])
  })

  it("4xx que NAO e 'unsupported': throw direto, sem retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(
      generateEmailImage("p", "store-1", {
        mode: "product_ref",
        referenceImageUrl: "https://cdn/x.jpg",
      }),
    ).rejects.toThrow(/OpenRouter 401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ── Extração via choices[].message.images[].image_url.url ──────────────
describe("generateEmailImage — extração do campo image_url.url", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
    uploadMock.mockResolvedValue({ error: null })
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/img.png" },
      error: null,
    })
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://public.example/img.png" },
    })
    sharpToBufferMock.mockResolvedValue(Buffer.from("resized-bytes"))
  })

  it("image_url.url = link http → baixa a imagem do link e re-hospeda", async () => {
    const fetchMock = vi
      .fn()
      // 1a: resposta do OpenRouter entregando a imagem por LINK
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { images: [{ image_url: { url: "https://prov/img.png" } }] } },
            ],
          }),
      } as unknown as Response)
      // 2a: download da imagem do link
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          Uint8Array.from(Buffer.from(TINY_PNG_B64, "base64")).buffer,
      } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("prompt", "store-1")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe("https://prov/img.png")
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(url).toBe("https://signed.example/img.png")
  })

  it("image_url.url = data URL base64 → decodifica e re-hospeda (sem download extra)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                images: [
                  { image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` } },
                ],
              },
            },
          ],
        }),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("prompt", "store-1")

    expect(fetchMock).toHaveBeenCalledTimes(1) // só OpenRouter, sem download
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(url).toBe("https://signed.example/img.png")
  })

  it("download do link falha → erro de extração", async () => {
    const body = JSON.stringify({
      choices: [{ message: { images: [{ image_url: { url: "https://prov/x.png" } }] } }],
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => body } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(generateEmailImage("prompt", "store-1")).rejects.toThrow(
      /Não foi possível extrair imagem/,
    )
  })

  it("sem imagem extraível → erro inclui o trecho da resposta crua", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "desculpe, nao posso gerar" } }],
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => body } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const err = await generateEmailImage("prompt", "store-1").catch(
      (e: unknown) => e,
    )
    expect(String(err)).toContain("Não foi possível extrair imagem")
    expect(String(err)).toContain("desculpe, nao posso gerar")
  })

  it("refusal textual NÃO é retryable: chama OpenRouter uma única vez", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "I can't generate that" } }],
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => body } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("prompt", "store-1").catch(() => {})
    // sem .retryable → withOpenRouterRetry não re-tenta
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("erro de parse rico inclui status/content-type/length (acionável)", async () => {
    const body = JSON.stringify({ choices: [{ message: { content: "nope" } }] })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => body,
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const err = await generateEmailImage("prompt", "store-1").catch(
      (e: unknown) => e,
    )
    expect(String(err)).toContain("status=200")
    expect(String(err)).toContain("content-type=application/json")
    expect(String(err)).toContain(`length=${body.length}`)
  })
})

// ── Resiliência: respostas transitórias do OpenRouter (200 OK enganoso) ──
describe("generateEmailImage — retry em falha transitória", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
    uploadMock.mockResolvedValue({ error: null })
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/img.png" },
      error: null,
    })
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://public.example/img.png" },
    })
    sharpToBufferMock.mockResolvedValue(Buffer.from("resized-bytes"))
  })

  function okImageBody() {
    return JSON.stringify({
      choices: [
        { message: { content: `data:image/png;base64,${TINY_PNG_B64}` } },
      ],
    })
  }

  it("200 OK + body vazio → retry e sucesso na 2a tentativa", async () => {
    const fetchMock = vi
      .fn()
      // 1a: body vazio (transitório)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "",
      } as unknown as Response)
      // 2a: imagem válida
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => okImageBody(),
      } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("prompt", "store-1")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(url).toBe("https://signed.example/img.png")
  })

  it("200 OK + body vazio nas 2 tentativas → erro diagnóstico (não snippet vazio)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const err = await generateEmailImage("prompt", "store-1").catch(
      (e: unknown) => e,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(err)).toContain("empty body")
    expect(String(err)).toContain("status=200")
    // a mensagem NÃO termina no antigo snippet vazio
    expect(String(err)).not.toMatch(/Resposta \(truncada\): $/)
  })

  it("200 OK + SSE com error-frame → retryable, sucesso na 2a tentativa", async () => {
    const sseError =
      ': OPENROUTER PROCESSING\n\ndata: {"error":{"message":"provider disconnected","metadata":{"error_type":"provider_error"}}}\n\n'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => sseError,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => okImageBody(),
      } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("prompt", "store-1")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(url).toBe("https://signed.example/img.png")
  })
})
