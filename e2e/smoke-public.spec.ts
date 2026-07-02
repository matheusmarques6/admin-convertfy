import { test, expect } from "@playwright/test"

/**
 * Smoke público — roda sem credenciais.
 * Garante que as portas de entrada do sistema continuam de pé:
 * páginas de login renderizam e rotas protegidas redirecionam.
 */

test.describe("Login admin", () => {
  test("página /login renderiza o formulário", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByPlaceholder("seu@email.com")).toBeVisible()
    await expect(page.getByPlaceholder("••••••••")).toBeVisible()
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible()
  })
})

test.describe("Login do portal do cliente", () => {
  test("página /client/login renderiza o formulário", async ({ page }) => {
    await page.goto("/client/login")
    await expect(page.getByPlaceholder("seu@email.com")).toBeVisible()
    await expect(page.getByPlaceholder("••••••••")).toBeVisible()
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible()
  })
})

test.describe("Proteção de rotas", () => {
  test("/ sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain("/login")
  })

  test("/admin/dashboard sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/admin/dashboard")
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain("/login")
  })

  test("/client/dashboard sem sessão não expõe conteúdo do portal", async ({ page }) => {
    await page.goto("/client/dashboard")
    // O portal hoje faz a checagem client-side: aceita tanto redirect quanto
    // spinner de auth, mas nunca pode renderizar dados do dashboard.
    await page.waitForLoadState("networkidle")
    const url = page.url()
    const redirected = url.includes("/login")
    if (!redirected) {
      // Se não redirecionou, não pode haver conteúdo autenticado visível
      await expect(page.getByText(/receita|revenue|pedidos/i)).toHaveCount(0)
    }
  })
})
