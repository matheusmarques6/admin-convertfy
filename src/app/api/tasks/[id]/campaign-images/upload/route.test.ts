/**
 * Tests for POST /api/tasks/[id]/campaign-images/upload (imagem-base do lote).
 *
 * Mocka requireTaskAccess e o storage admin. Foco: guard de source_type,
 * validação de upload (tipo/tamanho), caminho feliz (signed URL + path).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

let mockTaskCtx: {
  task: { source_type: string; source_id: string | null }
  member: { orgId: string }
}

const uploadMock = vi.hoisted(() => vi.fn())
const createSignedUrlMock = vi.hoisted(() => vi.fn())
const getPublicUrlMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  })),
  createAdminClient: vi.fn(() => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  })),
}))

vi.mock("@/lib/api/onboarding-task-access", () => ({
  requireTaskAccess: vi.fn(async () => mockTaskCtx),
}))

vi.mock("@/lib/logger", () => ({
  // errorResponse usa o logger top-level (logger.error) em erros 5xx; o service
  // usa logger.child. Mockamos ambos.
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(() => new Response(null, { status: 204 })),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  mockTaskCtx = {
    task: { source_type: "campaign_suggestion", source_id: SUG },
    member: { orgId: ORG },
  }
  uploadMock.mockResolvedValue({ data: { path: "x" }, error: null })
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://signed/ref.png" }, error: null })
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://public/ref.png" } })
  const mod = await import("./route")
  POST = mod.POST
})

const params = { params: Promise.resolve({ id: "task-1" }) }

function uploadReq(file: File | null): Request {
  const fd = new FormData()
  if (file) fd.append("file", file)
  return new Request("http://localhost/api/tasks/task-1/campaign-images/upload", {
    method: "POST",
    body: fd,
  })
}

function makeFile(opts: { type?: string; size?: number; name?: string } = {}): File {
  const size = opts.size ?? 1024
  const blob = new Blob([new Uint8Array(size)], { type: opts.type ?? "image/png" })
  return new File([blob], opts.name ?? "ref.png", { type: opts.type ?? "image/png" })
}

describe("POST /api/tasks/[id]/campaign-images/upload", () => {
  it("caminho feliz -> 200 com url assinada + path", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(uploadReq(makeFile()) as any, params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe("https://signed/ref.png")
    expect(json.path).toContain(`campaigns/${SUG}/image-refs/`)
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it("sem arquivo -> 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(uploadReq(null) as any, params)
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("tipo não permitido (pdf) -> 400", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uploadReq(makeFile({ type: "application/pdf", name: "x.pdf" })) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("arquivo > 10MB -> 400", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uploadReq(makeFile({ size: 11 * 1024 * 1024 })) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("task não-campanha -> 400 (antes do upload)", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(uploadReq(makeFile()) as any, params)
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("erro no upload -> 500", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "storage down" } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(uploadReq(makeFile()) as any, params)
    expect(res.status).toBe(500)
  })

  it("sem signed URL -> fallback public URL (200)", async () => {
    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: "no sign" } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(uploadReq(makeFile()) as any, params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe("https://public/ref.png")
  })
})
