import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  // Vite 8 transforma com OXC (o Vite 7 usava esbuild). Sem a opção no lugar
  // certo, o vite:import-analysis não parseia JSX — o tsconfig declara
  // `jsx: "preserve"` — e todo teste que importa um .tsx quebra na COLETA.
  //
  // Por que este arquivo está no `exclude` do tsconfig: o repo tem DOIS
  // lockfiles que discordam. `package-lock.json` (CI e dev) resolve
  // vite 8.0.2 / vitest 4.1.1 → a chave é `oxc`; `pnpm-lock.yaml` (Vercel)
  // resolve vite 7.3.1 / vitest 4.0.18 → seria `esbuild`. Typecheckar este
  // arquivo fazia um ambiente quebrar sempre que o outro era consertado —
  // aconteceu duas vezes em 01/09. Config de teste não é código de app: o
  // `next build` não tem por que validá-lo.
  //
  // A chave abaixo segue o lockfile de QUEM RODA OS TESTES (npm/vite 8). No
  // Vercel ela é inerte — lá não se roda vitest.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
