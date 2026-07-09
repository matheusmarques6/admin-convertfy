/**
 * Renderiza HTML de email em PNG via Chromium headless (puppeteer-core).
 *
 * Producao (Vercel/linux): binario do @sparticuz/chromium (descomprime em
 * /tmp no primeiro launch). Dev local: PUPPETEER_EXECUTABLE_PATH ou
 * deteccao automatica de Chrome/Edge instalado (win32).
 *
 * O browser e singleton por invocacao warm da lambda — `withRenderPage`
 * garante 1 browser para N renders (export em lote). Cada render usa uma
 * page nova e fecha ao final.
 */

import fs from "fs"
import path from "path"
import type { Browser, Page } from "puppeteer-core"
import puppeteer from "puppeteer-core"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailPngRender")

export interface RenderPngOptions {
  /** Largura CSS do viewport. Default 600 (largura do .wrap dos emails). */
  width?: number
  /** Fator retina. Default 2. */
  deviceScaleFactor?: number
  /** Timeout do setContent (networkidle0). Default 30s. */
  timeoutMs?: number
  /**
   * Altura maxima em px CSS. Acima disso o screenshot usa clip em vez de
   * fullPage (dsf 2 → 16000px fisicos, abaixo do limite de textura 16384
   * do Chromium). Default 8000.
   */
  maxHeightPx?: number
}

const DEFAULTS: Required<RenderPngOptions> = {
  width: 600,
  deviceScaleFactor: 2,
  timeoutMs: 30_000,
  maxHeightPx: 8_000,
}

// Caminhos comuns de Chrome/Edge no Windows (dev local). Edge e Chromium e
// existe em todo Windows 11 — fallback confiavel.
function win32Candidates(): string[] {
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files"
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
  const localAppData = process.env.LOCALAPPDATA || ""
  return [
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData &&
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean) as string[]
}

interface LaunchConfig {
  executablePath: string
  args: string[]
}

async function resolveLaunchConfig(): Promise<LaunchConfig> {
  // 1. Override explicito (dev/CI)
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH
  if (envPath) {
    return {
      executablePath: envPath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    }
  }

  // 2. Producao serverless: binario do Sparticuz
  if (process.env.VERCEL || process.platform === "linux") {
    // Import dinamico: o pacote descomprime ~150MB em /tmp ao resolver o
    // executablePath — nao pagar esse custo em dev Windows.
    const chromium = (await import("@sparticuz/chromium")).default
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
    }
  }

  // 3. Dev local: detectar Chrome/Edge instalado
  if (process.platform === "win32") {
    for (const candidate of win32Candidates()) {
      if (fs.existsSync(candidate)) {
        return {
          executablePath: candidate,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      }
    }
  }
  if (process.platform === "darwin") {
    const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if (fs.existsSync(mac)) {
      return {
        executablePath: mac,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }
    }
  }

  throw new AppError(
    "Chromium nao encontrado para gerar PNG. Defina PUPPETEER_EXECUTABLE_PATH " +
      "no .env.local apontando para o chrome.exe/msedge.exe local.",
    500,
    "chromium_not_found",
  )
}

// Singleton por invocacao warm. Checar `connected` antes de reusar — a
// lambda pode ter sido congelada/retomada com o processo do browser morto.
let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise
      if (existing.connected) return existing
    } catch {
      // launch anterior falhou — relancar abaixo
    }
    browserPromise = null
  }

  browserPromise = (async () => {
    const { executablePath, args } = await resolveLaunchConfig()
    log.info("launch", { executablePath })
    return puppeteer.launch({
      executablePath,
      args,
      headless: true,
      defaultViewport: {
        width: DEFAULTS.width,
        height: 800,
        deviceScaleFactor: DEFAULTS.deviceScaleFactor,
      },
    })
  })()
  return browserPromise
}

export async function closeSharedBrowser(): Promise<void> {
  if (!browserPromise) return
  const p = browserPromise
  browserPromise = null
  try {
    const browser = await p
    await browser.close()
  } catch {
    // ja morto — nada a fazer
  }
}

function raceMs<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ])
}

async function renderOnPage(
  page: Page,
  html: string,
  opts: Required<RenderPngOptions>,
): Promise<Buffer> {
  await page.setViewport({
    width: opts.width,
    height: 800,
    deviceScaleFactor: opts.deviceScaleFactor,
  })

  // Aguardar rede ociosa pode estourar com imagem morta/tracker pendurado —
  // nesse caso seguimos best-effort com o que carregou (warn, nao erro).
  try {
    await page.setContent(html, {
      waitUntil: "load",
      timeout: opts.timeoutMs,
    })
    await page.waitForNetworkIdle({ idleTime: 500, timeout: opts.timeoutMs })
  } catch (err) {
    log.warn("set_content_timeout", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Fontes web (o shell dos emails usa Inter via Google Fonts) e decode de
  // imagens — ambos com teto de 5s pra nao pendurar o export.
  await raceMs(
    page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready),
    5_000,
  )
  await raceMs(
    page.evaluate(() =>
      Promise.allSettled(
        Array.from(document.images).map((img) => img.decode().catch(() => {})),
      ),
    ),
    5_000,
  )
  // Settle de layout pos-fontes
  await new Promise((resolve) => setTimeout(resolve, 150))

  // Altura REAL do conteudo: documentElement.scrollHeight nunca fica menor
  // que o viewport, entao emails curtos sairiam com faixa morta no rodape.
  // O body (height auto) reflete o conteudo; bounding rect cobre margens.
  const scrollHeight = await page.evaluate(() => {
    const body = document.body
    if (!body) return document.documentElement.scrollHeight
    const rect = body.getBoundingClientRect()
    return Math.ceil(
      Math.max(body.scrollHeight, rect.bottom, 1),
    )
  })

  // Ajusta o viewport a altura real do conteudo: sem isso, emails mais
  // curtos que o viewport saem com faixa transparente/preta no fullPage.
  const clipped = scrollHeight > opts.maxHeightPx
  const targetHeight = Math.max(1, Math.min(scrollHeight, opts.maxHeightPx))
  await page.setViewport({
    width: opts.width,
    height: targetHeight,
    deviceScaleFactor: opts.deviceScaleFactor,
  })

  let shot: Uint8Array
  if (clipped) {
    log.warn("height_clipped", { scrollHeight, maxHeightPx: opts.maxHeightPx })
    shot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: opts.width, height: opts.maxHeightPx },
    })
  } else {
    shot = await page.screenshot({ type: "png", fullPage: true })
  }
  return Buffer.from(shot)
}

/** Renderiza 1 HTML em PNG. Abre/reusa o browser e fecha so a page. */
export async function renderEmailHtmlToPng(
  html: string,
  opts?: RenderPngOptions,
): Promise<Buffer> {
  const merged = { ...DEFAULTS, ...opts }
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    return await renderOnPage(page, html, merged)
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Export em lote: garante 1 browser vivo durante N renders sequenciais.
 * O callback recebe um `render(html, opts)` que abre uma page nova por
 * email (isolamento) reusando o mesmo browser.
 */
export async function withRenderPage<T>(
  fn: (
    render: (html: string, o?: RenderPngOptions) => Promise<Buffer>,
  ) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser()
  const render = async (html: string, o?: RenderPngOptions) => {
    const merged = { ...DEFAULTS, ...o }
    const page = await browser.newPage()
    try {
      return await renderOnPage(page, html, merged)
    } finally {
      await page.close().catch(() => {})
    }
  }
  return fn(render)
}
