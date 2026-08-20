import { test, expect } from "@playwright/test"

/**
 * Smoke da aba Componentes (endereçamento por example, F5) — exige:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *
 * Fluxo: login → Componentes → seleciona uma variante → salva → espera o
 * toast ("Variante salva" OU o aviso novo de example sem âncora). Nenhum
 * LLM é pago: salvar variante é CRUD puro; a auditoria roda no client.
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

test.describe("Componentes — coerência example × HTML", () => {
  test.skip(!email || !password, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD não definidos")

  test("salvar variante mostra o veredito da âncora (salva OU aviso)", async ({ page }) => {
    await loginAdmin(page)
    const response = await page.goto(
      "/admin/settings/email-generation?tab=components",
    )
    expect(response?.status(), "página respondeu com erro").toBeLessThan(400)
    await page.waitForLoadState("domcontentloaded")
    expect(page.url()).not.toContain("/login")

    // Uma variante existente na lista da categoria ativa.
    const card = page
      .locator("button, [role='button']")
      .filter({ hasText: /hero|body|footer|section/i })
      .first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.click()

    const salvar = page.getByRole("button", { name: /salvar/i }).first()
    await expect(salvar).toBeVisible({ timeout: 15_000 })
    await salvar.click()

    // O toast novo: sucesso limpo OU o aviso de example sem âncora.
    await expect(
      page
        .getByText("Variante salva")
        .or(page.getByText("Salva, mas o schema não ancora no HTML")),
    ).toBeVisible({ timeout: 20_000 })
  })
})
