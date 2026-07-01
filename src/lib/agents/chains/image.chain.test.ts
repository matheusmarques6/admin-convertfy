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
import {
  generateEmailImage,
  __buildMessagesForTest as buildMessages,
  __buildUserMessageForTest as buildUserMessage,
  __extractUsageForTest as extractUsage,
} from "./image.chain"

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

  it("fallback multimodal com N refs (base+logo+produto): o retry remove TODAS as imagens (text2img puro), não só uma", async () => {
    // Concern do review: o retry de "multimodal não suportado" deve reenviar
    // refs=[] (text2img PURO), não apenas dropar 1 imagem. Com 3 refs no 1º
    // request, a 2ª chamada tem que ser string content (zero image_url).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: { message: "does not support image input" } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: `data:image/png;base64,${TINY_PNG_B64}` } }],
          }),
      } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const onMeta = vi.fn()
    const url = await generateEmailImage("the prompt", "store-1", {
      mode: "product_ref",
      referenceImages: [
        { label: "Base reference:", url: "https://cdn/base.jpg" },
        { label: "Brand logo — match this exactly:", url: "https://cdn/logo.png" },
        { label: "Hero product — reproduce faithfully:", url: "https://cdn/prod.jpg" },
      ],
      onMeta,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 1ª chamada: 3 imagens + prompt (multimodal).
    const body1 = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    const imgs1 = (
      body1.messages[0].content as Array<{ image_url?: { url: string } }>
    ).filter((c) => c.image_url)
    expect(imgs1).toHaveLength(3)
    // 2ª chamada (retry): text2img PURO — string content, ZERO image_url.
    const body2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(body2.messages).toEqual([{ role: "user", content: "the prompt" }])
    expect(url).toBe("https://signed.example/img.png")
    // FIX: o fallback REMOVEU as imagens (retry text2img) → o refs_sent reportado
    // ao caller deve ser [] (não as 3 refs originais), senão a telemetria mentiria
    // que o modelo viu logo/produto quando foram removidos. refs_sent é a prova de
    // ingestão, então tem que refletir o que foi EFETIVAMENTE enviado.
    expect(onMeta).toHaveBeenCalledTimes(1)
    expect(onMeta.mock.calls[0][0].refsSent).toEqual([])
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

// ── Multi-ref: buildMessages / buildUserMessage (content array shape) ──
describe("buildUserMessage / buildMessages — refs interleaved+labeled", () => {
  it("0 refs: content é a string crua do prompt (body legacy)", () => {
    const msg = buildUserMessage("the prompt", [])
    expect(msg).toEqual({ role: "user", content: "the prompt" })
  })

  it("1 ref com label: [label, image, {text:prompt}] nessa ordem", () => {
    const msg = buildUserMessage("the prompt", [
      { label: "Base reference:", url: "https://cdn/base.jpg" },
    ])
    expect(msg).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Base reference:" },
        { type: "image_url", image_url: { url: "https://cdn/base.jpg" } },
        { type: "text", text: "the prompt" },
      ],
    })
  })

  it("1 ref SEM label: [image, {text:prompt}] (retrocompat referenceImageUrl)", () => {
    const msg = buildUserMessage("the prompt", [{ url: "https://cdn/x.jpg" }])
    expect(msg).toEqual({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "https://cdn/x.jpg" } },
        { type: "text", text: "the prompt" },
      ],
    })
  })

  it("3 refs labeled: [l,img,l,img,l,img,{text:prompt}] na ordem", () => {
    const msg = buildUserMessage("P", [
      { label: "Base reference:", url: "u-base" },
      { label: "Brand logo — match this exactly:", url: "u-logo" },
      { label: "Hero product — reproduce faithfully:", url: "u-prod" },
    ])
    expect(msg).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Base reference:" },
        { type: "image_url", image_url: { url: "u-base" } },
        { type: "text", text: "Brand logo — match this exactly:" },
        { type: "image_url", image_url: { url: "u-logo" } },
        { type: "text", text: "Hero product — reproduce faithfully:" },
        { type: "image_url", image_url: { url: "u-prod" } },
        { type: "text", text: "P" },
      ],
    })
  })

  it("buildMessages prepende system message quando systemPrompt setado", () => {
    const msgs = buildMessages("P", [{ url: "u" }], "SYS")
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "u" } },
          { type: "text", text: "P" },
        ],
      },
    ])
  })

  it("buildMessages sem systemPrompt: só a user message (0 refs)", () => {
    const msgs = buildMessages("P", [])
    expect(msgs).toEqual([{ role: "user", content: "P" }])
  })

  it("buildMessages: systemPrompt só de espaços não prepende system", () => {
    const msgs = buildMessages("P", [])
    expect(msgs).toEqual([{ role: "user", content: "P" }])
    const msgs2 = buildMessages("P", [], "   ")
    expect(msgs2).toEqual([{ role: "user", content: "P" }])
  })
})

// ── extractUsage: regex ancorado no bloco "usage" (sem JSON.parse) ─────
describe("extractUsage — usage do envelope OpenRouter", () => {
  it("extrai prompt_tokens/completion_tokens do bloco usage", () => {
    const raw = `{"choices":[{}],"usage":{"prompt_tokens":1234,"completion_tokens":7}}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 1234, tokensOutput: 7, costUsd: 0 })
  })

  it("sem bloco usage: retorna {0,0}", () => {
    const raw = `{"choices":[{"message":{"content":"data:image/png;base64,AAAA"}}]}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 0, tokensOutput: 0, costUsd: 0 })
  })

  it("base64 com dígitos ANTES do usage não quebra a âncora", () => {
    // Um blob base64 cheio de dígitos precede o bloco usage; o índice de
    // "usage" isola o envelope e o recorte de ~400 chars pega os tokens certos.
    const b64 = "iVBORw0KGgo1234567890ABCDEFmnopQRST0987654321xyz".repeat(50)
    const raw = `{"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,${b64}"}}]}}],"usage":{"prompt_tokens":4096,"completion_tokens":3}}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 4096, tokensOutput: 3, costUsd: 0 })
  })

  it("usage presente mas só prompt_tokens: completion = 0", () => {
    const raw = `...,"usage":{"prompt_tokens":50}}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 50, tokensOutput: 0, costUsd: 0 })
  })

  it("a palavra 'usage' SEM aspas (e dígitos) antes do envelope real não sequestra a âncora", () => {
    // O alvo do anchoring é a substring `"usage"` COM aspas — que o alfabeto
    // base64 (A-Za-z0-9+/=) não pode conter. Aqui um blob base64 inclui a
    // sequência crua `usage1234` (sem aspas) ANTES do envelope verdadeiro; a
    // âncora `indexOf('"usage"')` pula o lixo e isola os tokens reais.
    const noise = "ZGusage1234567890usagemnopQRSTusage0987".repeat(30)
    const raw =
      `{"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,${noise}"}}]}}],` +
      `"usage":{"prompt_tokens":2048,"completion_tokens":11}}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 2048, tokensOutput: 11, costUsd: 0 })
  })

  it("janela de ~400 chars cobre completion_tokens mesmo com *_details entre os campos", () => {
    // Pior caso realista de ordenação do provedor: prompt_tokens_details
    // (cached/audio/text/image) serializado ENTRE prompt_tokens e
    // completion_tokens. O prefixo do envelope até completion_tokens fica
    // ~160 chars (< 400), então o recorte ainda captura os dois campos. Guarda
    // a premissa do slice: se alguém encolher a janela, este teste quebra.
    const raw =
      `{"id":"x","usage":{"prompt_tokens":123456,` +
      `"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0,"text_tokens":99999,"image_tokens":123456},` +
      `"completion_tokens":654321,"total_tokens":777777}}`
    expect(extractUsage(raw)).toEqual({ tokensInput: 123456, tokensOutput: 654321, costUsd: 0 })
  })

  it("extrai o cost (USD real do usage accounting) quando presente", () => {
    // OpenRouter serializa o custo real em USD no bloco usage. O recorte de
    // ~600 chars cobre `cost` mesmo depois de *_details entre os campos.
    const raw =
      `{"choices":[{}],"usage":{"prompt_tokens":321,"completion_tokens":9,` +
      `"cost":0.0412,"total_tokens":330}}`
    expect(extractUsage(raw)).toEqual({
      tokensInput: 321,
      tokensOutput: 9,
      costUsd: 0.0412,
    })
  })
})

// ── onMeta: captura de usage + refsSent reportados ao caller ───────────
describe("generateEmailImage — onMeta (instrumentação opt-in)", () => {
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

  function okBodyWithUsage(): string {
    return JSON.stringify({
      choices: [{ message: { content: `data:image/png;base64,${TINY_PNG_B64}` } }],
      usage: { prompt_tokens: 321, completion_tokens: 9, cost: 0.0412 },
    })
  }

  it("multimodal + onMeta: reporta tokens e as refs anexadas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => okBodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const refs = [
      { label: "Base reference:", url: "https://cdn/base.jpg" },
      { label: "Brand logo — match this exactly:", url: "https://cdn/logo.png" },
    ]
    const onMeta = vi.fn()
    await generateEmailImage("the prompt", "store-1", {
      mode: "product_ref",
      referenceImages: refs,
      onMeta,
    })

    // body usa content array interleaved+labeled
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Base reference:" },
      { type: "image_url", image_url: { url: "https://cdn/base.jpg" } },
      { type: "text", text: "Brand logo — match this exactly:" },
      { type: "image_url", image_url: { url: "https://cdn/logo.png" } },
      { type: "text", text: "the prompt" },
    ])

    expect(onMeta).toHaveBeenCalledTimes(1)
    expect(onMeta).toHaveBeenCalledWith({
      tokensInput: 321,
      tokensOutput: 9,
      costCents: 4.12, // 0.0412 USD → centavos
      refsSent: refs,
    })
  })

  it("referenceImages supersede referenceImageUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => okBodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("P", "store-1", {
      mode: "product_ref",
      referenceImageUrl: "https://cdn/legacy.jpg",
      referenceImages: [{ label: "Hero:", url: "https://cdn/new.jpg" }],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Hero:" },
      { type: "image_url", image_url: { url: "https://cdn/new.jpg" } },
      { type: "text", text: "P" },
    ])
  })

  it("cap de 3 refs: a 4ª é descartada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => okBodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const onMeta = vi.fn()
    await generateEmailImage("P", "store-1", {
      mode: "product_ref",
      referenceImages: [
        { url: "u1" },
        { url: "u2" },
        { url: "u3" },
        { url: "u4" },
      ],
      onMeta,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    // 3 imagens + 1 text(prompt) = 4 entradas; u4 fora.
    const imageUrls = (
      body.messages[0].content as Array<{ image_url?: { url: string } }>
    )
      .filter((c) => c.image_url)
      .map((c) => c.image_url!.url)
    expect(imageUrls).toEqual(["u1", "u2", "u3"])
    expect(onMeta.mock.calls[0][0].refsSent).toHaveLength(3)
  })

  it("text2img (sem refs) + onMeta: refsSent vazio, tokens capturados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => okBodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const onMeta = vi.fn()
    await generateEmailImage("P", "store-1", { onMeta })

    expect(onMeta).toHaveBeenCalledWith({
      tokensInput: 321,
      tokensOutput: 9,
      costCents: 4.12, // 0.0412 USD → centavos
      refsSent: [],
    })
    // body legacy (string content)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([{ role: "user", content: "P" }])
  })

  it("sem onMeta: caminho de email intocado (string content, sem captura)", async () => {
    const fetchMock = mockFetchOk()
    global.fetch = fetchMock as unknown as typeof fetch

    // referenceImageUrl único, sem onMeta → 1 ref sem rótulo, igual a hoje.
    await generateEmailImage("P", "store-1", {
      mode: "product_ref",
      referenceImageUrl: "https://cdn/x.jpg",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://cdn/x.jpg" } },
          { type: "text", text: "P" },
        ],
      },
    ])
  })
})

// ── REGRESSÃO load-bearing: caminho de EMAIL (phase2-runner) intocado ──
// O phase2-runner/rotas de email chamam generateEmailImage com `referenceImageUrl`
// ÚNICO e SEM onMeta/referenceImages. Estes testes congelam: (a) a message shape
// é byte-idêntica ao baseline single-ref `[{image_url},{text:prompt}]` (nenhum
// texto de label injetado que mudaria o prompt que o modelo de email vê); (b) com
// usage no body mas SEM onMeta, nada de usage é reportado e o resultado é igual.
// Uma regressão aqui quebra a geração de imagem de email em produção.
describe("generateEmailImage — REGRESSÃO caminho de email (single ref, sem onMeta)", () => {
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

  // Body com usage propositalmente presente: se o caminho de email parseasse
  // usage sem onMeta, ainda assim NÃO há canal pra reportar — provamos que a
  // ausência de onMeta não muda NEM a shape NEM o resultado.
  function bodyWithUsage(): string {
    return JSON.stringify({
      choices: [{ message: { content: `data:image/png;base64,${TINY_PNG_B64}` } }],
      usage: { prompt_tokens: 5000, completion_tokens: 42 },
    })
  }

  it("referenceImageUrl único, SEM onMeta: shape == baseline [{image_url},{text:prompt}], NENHUM label injetado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => bodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("email prompt", "store-1", {
      aspect: "1:1",
      overlayReserveBottom: false,
      mode: "product_ref",
      referenceImageUrl: "https://cdn/hero-product.jpg",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    // shape EXATA do baseline: imagem primeiro, prompt depois, ZERO {type:text}
    // de label antes da imagem (o modelo de email vê o mesmo prompt de sempre).
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://cdn/hero-product.jpg" } },
          { type: "text", text: "email prompt" },
        ],
      },
    ])
    // nenhum content-part é um label de ref (Base/Brand/Hero) — defesa contra
    // vazamento dos labels de campanha no prompt do email.
    const textParts = (
      body.messages[0].content as Array<{ type: string; text?: string }>
    ).filter((c) => c.type === "text")
    expect(textParts).toEqual([{ type: "text", text: "email prompt" }])
    // resultado intacto apesar do usage no body (nenhum onMeta pra consumir).
    expect(url).toBe("https://signed.example/img.png")
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it("text2img puro (sem ref, sem onMeta): body legacy string, usage no body é ignorado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => bodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const url = await generateEmailImage("email prompt", "store-1", { aspect: "1:1" })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([{ role: "user", content: "email prompt" }])
    expect(url).toBe("https://signed.example/img.png")
  })

  it("systemPrompt + referenceImageUrl único, SEM onMeta: [system, user[image,text]] (shape baseline v2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => bodyWithUsage(),
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    await generateEmailImage("email prompt", "store-1", {
      mode: "product_ref",
      referenceImageUrl: "https://cdn/hero.jpg",
      systemPrompt: "Master prompt part A",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.messages).toEqual([
      { role: "system", content: "Master prompt part A" },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://cdn/hero.jpg" } },
          { type: "text", text: "email prompt" },
        ],
      },
    ])
  })
})
