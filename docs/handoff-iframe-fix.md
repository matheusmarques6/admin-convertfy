# Handoff: Fix X-Frame-Options Blocking Iframe no Portal

## Problema

No portal do cliente, ao acessar **Rastreio > Plugin de Rastreamento**, o formulário de preview mostrava o erro:
> "A conexão com app.convertfy.me foi recusada"

**Causa raiz:** O `next.config.mjs` tinha `X-Frame-Options: DENY` aplicado globalmente via `headers()` no catch-all `/(.*) `. Isso bloqueava o iframe do preview do widget (`/tracking/embed`) que é carregado dentro da própria aplicação.

## O que foi feito

### 1. `next.config.mjs` — Removido X-Frame-Options dos headers estáticos

**Antes:**
```js
headers: [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },        // ← PROBLEMA
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // ...
]
```

**Depois:** Removido `X-Frame-Options` daqui. Mantidos todos os outros headers de segurança (nosniff, XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS). Adicionado comentário explicando que frame headers são controlados no middleware.

**Motivo:** O catch-all `/(.*) ` do Next.js pode sobrescrever headers de rotas mais específicas (comportamento inconsistente entre versões). Mover para middleware garante controle confiável per-route.

### 2. `src/middleware.ts` — Adicionada lógica de frame headers

**Antes:** Middleware só fazia auth via `updateSession()`.

**Depois:** Adicionada lógica antes do `updateSession()`:

```typescript
// Rotas embeddable (widget preview + embed externo)
const EMBEDDABLE_ROUTES = ["/tracking/embed", "/api/script/"]

function isEmbeddableRoute(pathname: string): boolean {
  return EMBEDDABLE_ROUTES.some((route) => pathname.startsWith(route))
}
```

**Fluxo:**
- **Rotas embeddable** (`/tracking/embed`, `/api/script/*`):
  - Skipam `updateSession()` (sem auth, sem cookies de sessão)
  - Recebem `Content-Security-Policy: frame-ancestors *` (permite iframe em qualquer site)
  - NÃO recebem `X-Frame-Options` (não suporta wildcard)

- **Todas as outras rotas:**
  - Passam por `updateSession()` normalmente
  - Recebem `X-Frame-Options: DENY` (legacy browsers)
  - Recebem `Content-Security-Policy: frame-ancestors 'none'` (modern browsers)

**Matcher expandido** — adicionadas 3 rotas:
```
"/track/:path*",        // página pública de tracking (proteção contra clickjacking)
"/tracking/embed",      // embed do widget (embeddable)
"/api/script/:path*",   // script do widget (embeddable)
```

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `next.config.mjs` | Removido `X-Frame-Options: DENY` dos headers estáticos |
| `src/middleware.ts` | Adicionada lógica de frame headers per-route + matcher expandido |

## Status

- [x] Typecheck passando
- [x] Lint passando
- [x] QA review: PASS
- [ ] Deploy em produção
- [ ] Teste manual no portal (verificar iframe do preview carrega)

## Como continuar / próximos passos

### Deploy
1. Fazer commit das mudanças em `next.config.mjs` e `src/middleware.ts`
2. Fazer deploy normalmente (Vercel/plataforma atual)
3. Após deploy, testar no portal: **Rastreio > Plugin de Rastreamento** — o preview do widget deve carregar sem erro

### Verificação pós-deploy
1. Abrir DevTools > Network no browser
2. Acessar `/tracking/embed` diretamente — verificar que NÃO tem header `X-Frame-Options`
3. Acessar `/portal/tracking` — verificar que TEM header `X-Frame-Options: DENY`
4. No portal, aba "Plugin de Rastreamento" — iframe deve carregar preview do widget
5. No portal, aba "Instalação" — copiar script/iframe e testar embed em loja externa

### Concerns da QA para futuro
- **CSP parcial:** O middleware seta `Content-Security-Policy` apenas com `frame-ancestors`. Se no futuro precisar de CSP completa (default-src, script-src, etc.), a lógica deve ser ajustada para não sobrescrever.
- **Novas rotas embeddable:** Se criar novas rotas que precisem ser embeddáveis, adicionar ao array `EMBEDDABLE_ROUTES` no `src/middleware.ts`.
