# Epic 28 — Fix React Hydration Mismatch (#418)

## Contexto

Erro grave em producao: React error #418 ("Hydration failed because the initial UI does not match what was rendered on the server") acompanhado de erro de Server Components no ErrorBoundary e favicon.ico 404.

Investigacao identificou **7 causas** com severidades variadas, todas relacionadas a divergencia entre HTML renderizado no servidor vs cliente.

## Causas Identificadas

| # | Causa | Severidade | Arquivo Principal |
|---|-------|-----------|-------------------|
| 28.1 | Zustand `persist` rehidrata sidebar do localStorage antes do React | CRITICAL | `src/lib/store/index.ts` |
| 28.2 | `useState` le `window.location.search` no portal login | HIGH | `src/app/portal/login/page.tsx` |
| 28.3 | `useTheme()` renderiza condicionalmente Sun/Moon sem mounted guard | HIGH | `src/components/layout/sidebar.tsx` |
| 28.4 | `window.location.origin` com fallback vazio em render path | MEDIUM | `onboarding-tabs.tsx`, `store-form-tab.tsx` |
| 28.5 | `global-error.tsx` ausente — erros de layout nao capturados | MEDIUM | `src/app/` (ausente) |
| 28.6 | `getPermissions()` sem try/catch robusto — 6 queries sequenciais | MEDIUM | `src/app/(dashboard)/layout.tsx` |
| 28.7 | `favicon.ico` ausente — 404 em toda navegacao | LOW | `public/` (ausente) |

## Stories

- [28.1 — Zustand persist deferred hydration](./28.1.fix-zustand-persist-hydration.md)
- [28.2 — Portal login window.location fix](./28.2.fix-portal-login-window-location.md)
- [28.3 — Theme toggle mounted guard](./28.3.fix-theme-toggle-mounted-guard.md)
- [28.4 — Window.location.origin em render path](./28.4.fix-window-origin-render-path.md)
- [28.5 — Criar global-error.tsx](./28.5.create-global-error-boundary.md)
- [28.6 — getPermissions resilience](./28.6.fix-get-permissions-resilience.md)
- [28.7 — Adicionar favicon.ico](./28.7.add-favicon-ico.md)

## Ordem de Implementacao

1. **28.1** (P0) — Elimina causa principal do #418 no dashboard
2. **28.2** (P1) — Elimina causa no portal login
3. **28.3** (P1) — Elimina mismatch do theme toggle
4. **28.4** (P2) — Corrige origin em onboarding/stores
5. **28.5** (P2) — Captura erros de layout adequadamente
6. **28.6** (P2) — Resiliencia no carregamento de permissoes
7. **28.7** (P3) — Elimina 404 do favicon
