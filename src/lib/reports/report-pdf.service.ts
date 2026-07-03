/**
 * Geração server-side do PDF do relatório mensal.
 *
 * Renderiza a página /admin/stores/relatorios/[id]/print (acessada com
 * pdf_token — ver print-token.ts) num Chromium headless e devolve o PDF
 * no formato do deck (297×167mm, 1 slide por página — o CSS de @page da
 * própria página de print manda via preferCSSPageSize).
 *
 * Binário do Chromium:
 *  - Vercel/lambda: @sparticuz/chromium (empacotado pra serverless).
 *  - Dev/local: defina PUPPETEER_EXECUTABLE_PATH apontando pro Chrome/
 *    Chromium local (ex.: /Applications/Google Chrome.app/... ou
 *    /usr/bin/chromium) — evita carregar o binário do sparticuz fora da
 *    lambda.
 */

import { logger } from "@/lib/logger"

const log = logger.child("ReportPdf")

const NAV_TIMEOUT_MS = 60_000
const RENDER_TIMEOUT_MS = 30_000

export async function renderReportPdf(printUrl: string): Promise<Buffer> {
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ])

  const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
  const executablePath = localExecutable || (await chromium.executablePath())

  const browser = await puppeteer.launch({
    executablePath,
    // Args do sparticuz são obrigatórios na lambda (single-process, no-zygote
    // etc.); local, um set mínimo estável pra ambientes containerizados.
    args: localExecutable
      ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
      : chromium.args,
    headless: true,
    defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 2 },
  })

  try {
    const page = await browser.newPage()
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: NAV_TIMEOUT_MS,
    })
    // Slides são client component ([data-slide] só existe pós-hidratação)
    // e as fontes vêm do Google Fonts — espera os dois antes do snapshot.
    await page.waitForSelector("[data-slide]", { timeout: RENDER_TIMEOUT_MS })
    await page.evaluateHandle("document.fonts.ready")

    const pdf = await page.pdf({
      // Mesmo tamanho do @page da print page; preferCSSPageSize deixa o
      // CSS mandar caso o deck mude de proporção no futuro.
      width: "297mm",
      height: "167mm",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: RENDER_TIMEOUT_MS,
    })

    return Buffer.from(pdf)
  } catch (err) {
    log.error("render_failed", {
      printUrl: printUrl.split("?")[0], // sem o token
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  } finally {
    await browser.close().catch(() => {})
  }
}
