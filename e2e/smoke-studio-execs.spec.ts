import { test, expect } from "@playwright/test"

/**
 * Smoke do Estúdio de Agentes (F5) — exige:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *
 * Verifica o grafo NOVO (merge por example antes da hero; verificador de
 * merge fora do canvas) e, quando há execução com run de copy_merge, a
 * tabela campo a campo na aba Saída. Nenhum LLM é pago: tudo é leitura.
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

test.describe("Estúdio — grafo e execuções", () => {
  test.skip(!email || !password, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD não definidos")

  test("canvas carrega SEM o nó Verificador de Merge e COM o Merge de Copy", async ({ page }) => {
    await loginAdmin(page)
    const response = await page.goto("/admin/agents/studio")
    expect(response?.status(), "página respondeu com erro").toBeLessThan(400)
    await page.waitForLoadState("domcontentloaded")
    expect(page.url()).not.toContain("/login")

    await expect(page.getByText("Merge de Copy").first()).toBeVisible({
      timeout: 30_000,
    })
    // O verificador morreu com a fila de exceção (20/08) — só apareceria
    // como run histórica no drill-down, nunca como nó do pipeline.
    await expect(page.getByText("Verificador de Merge")).toHaveCount(0)
  })

  test("aba Execuções abre e o painel de nó mostra a Saída", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/agents/studio")
    await page.waitForLoadState("domcontentloaded")

    const execTab = page.getByRole("button", { name: /execu/i }).first()
    if (!(await execTab.isVisible().catch(() => false))) {
      test.skip(true, "aba Execuções não visível neste ambiente")
    }
    await execTab.click()

    // Sem execuções no ambiente → nada a validar (não é falha).
    const mergeNode = page.getByText("Merge de Copy").first()
    if (!(await mergeNode.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "sem execuções registradas neste ambiente")
    }
    await mergeNode.click()
    await page.getByRole("button", { name: "Saída" }).click()
    // A tabela campo a campo (quando a run tem `campos`) OU o JSON bruto.
    await expect(
      page.getByText("Desfecho").or(page.locator("pre").first()),
    ).toBeVisible({ timeout: 20_000 })
  })
})
