import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  // Vite 8 transforma com OXC, não com esbuild — `esbuild.jsx` é ignorado
  // aqui (e nem existe no tipo ESBuildOptions desta versão, o que derrubava
  // `tsc --noEmit` e o `next build` junto). Sem a opção no lugar certo, o
  // vite:import-analysis não parseia JSX e o teste que importa .tsx quebra
  // na coleta.
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
