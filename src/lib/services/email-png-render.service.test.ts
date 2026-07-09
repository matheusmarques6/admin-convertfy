import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { launchMock, makeFakePage, makeFakeBrowser } = vi.hoisted(() => {
  function makeFakePage(overrides: Record<string, unknown> = {}) {
    return {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
      // 3 chamadas por render: fonts.ready, img.decode, scrollHeight
      evaluate: vi.fn().mockResolvedValue(1000),
      screenshot: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      close: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }
  function makeFakeBrowser(page: ReturnType<typeof makeFakePage>) {
    return {
      connected: true,
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    }
  }
  return { launchMock: vi.fn(), makeFakePage, makeFakeBrowser }
})

vi.mock("puppeteer-core", () => ({
  default: { launch: launchMock },
}))

async function loadService() {
  vi.resetModules()
  return import("./email-png-render.service")
}

describe("email-png-render.service", () => {
  beforeEach(() => {
    launchMock.mockReset()
    process.env.PUPPETEER_EXECUTABLE_PATH = "C:\\fake\\chrome.exe"
  })

  afterEach(() => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH
  })

  it("renderiza com viewport default 600x800 dsf 2 e retorna Buffer", async () => {
    const page = makeFakePage()
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    const buf = await svc.renderEmailHtmlToPng("<html><body>oi</body></html>")

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(page.setViewport).toHaveBeenCalledWith({
      width: 600,
      height: 800,
      deviceScaleFactor: 2,
    })
    expect(page.setContent).toHaveBeenCalledWith(
      "<html><body>oi</body></html>",
      { waitUntil: "load", timeout: 30_000 },
    )
    expect(page.waitForNetworkIdle).toHaveBeenCalledWith({
      idleTime: 500,
      timeout: 30_000,
    })
    expect(page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: true })
    expect(page.close).toHaveBeenCalled()
  })

  it("usa o executablePath do env PUPPETEER_EXECUTABLE_PATH", async () => {
    const page = makeFakePage()
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html></html>")

    expect(launchMock).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "C:\\fake\\chrome.exe" }),
    )
  })

  it("reusa o browser singleton entre renders (1 launch para 2 renders)", async () => {
    const page = makeFakePage()
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html>1</html>")
    await svc.renderEmailHtmlToPng("<html>2</html>")

    expect(launchMock).toHaveBeenCalledTimes(1)
  })

  it("relanca o browser se desconectou (lambda descongelada)", async () => {
    const page = makeFakePage()
    const dead = { ...makeFakeBrowser(page), connected: false }
    const alive = makeFakeBrowser(page)
    launchMock.mockResolvedValueOnce(dead).mockResolvedValueOnce(alive)
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html>1</html>")
    await svc.renderEmailHtmlToPng("<html>2</html>")

    expect(launchMock).toHaveBeenCalledTimes(2)
  })

  it("reduz o dsf (sem clip) quando a altura fisica excede o limite de textura", async () => {
    // Caso real de producao: 9614px css × dsf 2 = 19228px fisicos > 16384.
    // O render deve sair INTEIRO com dsf reduzido, nao cortado.
    const page = makeFakePage({ evaluate: vi.fn().mockResolvedValue(9_614) })
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html>longo</html>")

    expect(page.setViewport).toHaveBeenLastCalledWith({
      width: 600,
      height: 9_614,
      // floor(16384/9614*1000)/1000
      deviceScaleFactor: 1.704,
    })
    expect(page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: true })
  })

  it("clipa o screenshot quando scrollHeight excede maxHeightPx (16384)", async () => {
    const page = makeFakePage({ evaluate: vi.fn().mockResolvedValue(20_000) })
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html>longo</html>")

    expect(page.setViewport).toHaveBeenLastCalledWith({
      width: 600,
      height: 16_384,
      deviceScaleFactor: 1,
    })
    expect(page.screenshot).toHaveBeenCalledWith({
      type: "png",
      clip: { x: 0, y: 0, width: 600, height: 16_384 },
    })
  })

  it("segue best-effort quando setContent estoura timeout", async () => {
    const page = makeFakePage({
      setContent: vi.fn().mockRejectedValue(new Error("Navigation timeout")),
    })
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    const buf = await svc.renderEmailHtmlToPng("<html></html>")

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(page.screenshot).toHaveBeenCalled()
  })

  it("fecha a page mesmo quando o screenshot lanca", async () => {
    const page = makeFakePage({
      screenshot: vi.fn().mockRejectedValue(new Error("boom")),
    })
    launchMock.mockResolvedValue(makeFakeBrowser(page))
    const svc = await loadService()

    await expect(svc.renderEmailHtmlToPng("<html></html>")).rejects.toThrow(
      "boom",
    )
    expect(page.close).toHaveBeenCalled()
  })

  it("withRenderPage reusa 1 browser para N renders e page nova por render", async () => {
    const page = makeFakePage()
    const browser = makeFakeBrowser(page)
    launchMock.mockResolvedValue(browser)
    const svc = await loadService()

    const results = await svc.withRenderPage(async (render) => {
      const a = await render("<html>a</html>")
      const b = await render("<html>b</html>", { deviceScaleFactor: 1 })
      return [a, b]
    })

    expect(results).toHaveLength(2)
    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(browser.newPage).toHaveBeenCalledTimes(2)
    expect(page.setViewport).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceScaleFactor: 1 }),
    )
  })

  it("closeSharedBrowser fecha e zera o singleton", async () => {
    const page = makeFakePage()
    const browser = makeFakeBrowser(page)
    launchMock.mockResolvedValue(browser)
    const svc = await loadService()

    await svc.renderEmailHtmlToPng("<html></html>")
    await svc.closeSharedBrowser()
    await svc.renderEmailHtmlToPng("<html></html>")

    expect(browser.close).toHaveBeenCalledTimes(1)
    expect(launchMock).toHaveBeenCalledTimes(2)
  })
})
