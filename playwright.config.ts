import { defineConfig, devices } from "@playwright/test"

/**
 * Smoke E2E — rede de proteção mínima para a refatoração de performance.
 *
 * Alvo configurável via env:
 *   E2E_BASE_URL       — URL do app (default: http://localhost:3000)
 *   E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD — credenciais de um usuário do portal (opcional)
 *   E2E_ADMIN_EMAIL  / E2E_ADMIN_PASSWORD  — credenciais de um usuário admin (opcional)
 *
 * Sem credenciais, rodam apenas os testes públicos (login pages + redirects).
 * Rodar: npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
