import { test, expect } from "@playwright/test"

/**
 * Medição de tempos do portal — NÃO é teste de asserção de performance;
 * apenas cronometra e imprime, para comparar antes/depois de refatorações.
 * Exige E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD.
 *
 * Rodar: npx playwright test perf-baseline --reporter=list
 */

const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

const s = (ms: number) => `${(ms / 1000).toFixed(2)}s`

test.describe("Baseline de tempos do portal", () => {
  test.skip(!email || !password, "E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD não definidos")
  test.setTimeout(180_000)

  test("login → dashboard → navegações", async ({ page }) => {
    const results: string[] = []

    // ── Login ──
    await page.goto("/client/login")
    await page.getByPlaceholder("seu@email.com").fill(email!)
    await page.getByPlaceholder("••••••••").fill(password!)

    const tLogin = Date.now()
    await page.getByRole("button", { name: "Entrar" }).click()
    await page.waitForURL(/\/client\/(dashboard|onboarding)/, { timeout: 60_000 })
    results.push(`login (clique → URL do dashboard): ${s(Date.now() - tLogin)}`)

    await expect(
      page.getByRole("navigation").or(page.getByRole("heading").first())
    ).toBeVisible({ timeout: 30_000 })
    results.push(`login (clique → primeiro conteúdo visível): ${s(Date.now() - tLogin)}`)

    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => results.push("(networkidle do dashboard não estabilizou em 30s — polling ativo)"))
    results.push(`login (clique → rede ociosa/dados carregados): ${s(Date.now() - tLogin)}`)

    // ── Navegações (full load, como um usuário chegando pela URL) ──
    for (const path of ["/client/campaigns", "/client/analytics", "/client/settings"]) {
      const t0 = Date.now()
      await page.goto(path, { waitUntil: "domcontentloaded" })
      const tDom = Date.now() - t0
      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => {})
      results.push(`goto ${path}: DOM ${s(tDom)} · rede ociosa ${s(Date.now() - t0)}`)
      expect(page.url()).not.toContain("/login")
    }

    // ── Navegação SPA (clique na sidebar, como troca de página real) ──
    const dashLink = page.getByRole("link", { name: /dashboard|início|inicio/i }).first()
    if (await dashLink.isVisible().catch(() => false)) {
      const t0 = Date.now()
      await dashLink.click()
      await page.waitForURL(/\/client\/dashboard/, { timeout: 30_000 })
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
      results.push(`SPA sidebar → dashboard: ${s(Date.now() - t0)}`)
    }

    console.log("\n===== BASELINE PORTAL =====")
    for (const r of results) console.log("  " + r)
    console.log("===========================\n")
  })
})
