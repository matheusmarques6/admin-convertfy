import { test, expect } from "@playwright/test"

/**
 * Smoke do admin — exige credenciais reais via env:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *
 * Protege as telas cujo backend será otimizado (kanban de onboarding,
 * lista/detalhe de lojas): login → dashboard → kanban → stores.
 */

const email = process.env.E2E_ADMIN_EMAIL
const password = process.env.E2E_ADMIN_PASSWORD

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByPlaceholder("seu@email.com").fill(email!)
  await page.getByPlaceholder("••••••••").fill(password!)
  await page.getByRole("button", { name: "Entrar" }).click()
  await page.waitForURL(/\/admin\//, { timeout: 45_000 })
}

test.describe("Admin (autenticado)", () => {
  test.skip(!email || !password, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD não definidos")

  test("login → dashboard admin carrega", async ({ page }) => {
    await loginAdmin(page)
    await expect(
      page.getByRole("navigation").or(page.getByRole("heading").first())
    ).toBeVisible({ timeout: 30_000 })
  })

  test("kanban de onboarding carrega colunas", async ({ page }) => {
    await loginAdmin(page)
    const response = await page.goto("/admin/onboarding")
    expect(response?.status(), "página respondeu com erro").toBeLessThan(400)
    await page.waitForLoadState("domcontentloaded")
    expect(page.url()).not.toContain("/login")
    // A tela do kanban renderiza algo além do skeleton
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 })
  })

  test("lista de lojas carrega", async ({ page }) => {
    await loginAdmin(page)
    const response = await page.goto("/admin/stores")
    expect(response?.status(), "página respondeu com erro").toBeLessThan(400)
    await page.waitForLoadState("domcontentloaded")
    expect(page.url()).not.toContain("/login")
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 })
  })
})
