import { test, expect } from "@playwright/test"

/**
 * Smoke do portal do cliente — exige credenciais reais via env:
 *   E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD
 *
 * Protege o fluxo que será refatorado nas Fases 1-2 (auth do layout,
 * migração para Server Components): login → dashboard → navegação.
 */

const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

test.describe("Portal do cliente (autenticado)", () => {
  test.skip(!email || !password, "E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD não definidos")

  test("login → dashboard carrega conteúdo", async ({ page }) => {
    await page.goto("/client/login")
    await page.getByPlaceholder("seu@email.com").fill(email!)
    await page.getByPlaceholder("••••••••").fill(password!)
    await page.getByRole("button", { name: "Entrar" }).click()

    // O fluxo atual usa window.location.href → aguardar a navegação completa
    await page.waitForURL(/\/client\/(dashboard|onboarding)/, { timeout: 45_000 })

    // Conteúdo real do portal visível (sidebar ou heading), não só spinner
    await expect(
      page.getByRole("navigation").or(page.getByRole("heading").first())
    ).toBeVisible({ timeout: 30_000 })
  })

  test("navegação entre páginas do portal mantém sessão", async ({ page }) => {
    await page.goto("/client/login")
    await page.getByPlaceholder("seu@email.com").fill(email!)
    await page.getByPlaceholder("••••••••").fill(password!)
    await page.getByRole("button", { name: "Entrar" }).click()
    await page.waitForURL(/\/client\//, { timeout: 45_000 })

    for (const path of ["/client/campaigns", "/client/analytics", "/client/settings"]) {
      await page.goto(path)
      await page.waitForLoadState("domcontentloaded")
      // Não pode ter caído para o login
      expect(page.url(), `sessão perdida ao navegar para ${path}`).not.toContain("/login")
    }
  })
})
