---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@ux-design-expert (Sally)"
Status: In Review
Epic: AE - Agent Email Generation
Fase: UI / Real-time
Estimate: L
---

# Story AE-6 — SSE endpoint + UI reativa `/admin/stores/[id]/emails` (designer + dev)

## User Story

**Como** designer (e como dev),
**quero** uma página única que mostre todos os emails da loja com status em tempo real, preview HTML, copy copiável e imagens baixáveis,
**para que** eu pegue o material pronto e leve manualmente pro Klaviyo sem precisar do dev me dizer "agora está pronto".

---

## Contexto

Página alvo: `/admin/stores/[id]/emails`. Mesma URL pra designer e pra dev — UI condicional por role/tag.

Designer vê: cards de email com status amigável, preview HTML render, copy por bloco (botão copiar), imagens (link baixar).
Dev vê (em painel extra colapsável "Debug"): timing por fase, custo total, prompt version, attempts, raw qa_issues.

Real-time via SSE (`/api/sse/stores/[id]/emails`). Fallback: SWR refetch a cada 10s se EventSource falhar 3x.

---

## Acceptance Criteria

### AC AE-6.1 — Endpoint SSE
- [x] Path: `src/app/api/sse/stores/[id]/emails/route.ts`
- [x] Método `GET`, retorna `Response` com `ReadableStream` e headers SSE corretos:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- [x] Auth: `requireAuth(sb)` no início; se falha, retorna 401 normal
- [x] Valida que user tem acesso à store (auth-only por enquanto; multi-tenant org check feito na page)
- [x] `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`

### AC AE-6.2 — Eventos emitidos
- [x] Ao conectar: emite `event: snapshot\ndata: {emails:[...]}` com estado atual de todos os emails da loja
- [x] A cada mudança: `event: email_status_change\ndata: {email_id, flow_id, status, failure_reason, qa_issues_count, ts}`
- [x] A cada 30s: `event: ping\ndata: {ts}` (heartbeat para detectar conexão morta no client)
- [x] Implementação OPÇÃO A: polling de `email_status_events` (last id seen) a cada 2s, filtrado por `store_id`
- [ ] Implementação OPÇÃO B (futura): Supabase Realtime channel — fora do escopo desta story
- [x] Encerra stream limpo quando cliente desconecta (cleanup do interval/listener via `request.signal.abort`)

### AC AE-6.3 — Endpoint REST consolidado (snapshot inicial e fallback)
- [x] Path: `src/app/api/admin/stores/[id]/emails/route.ts`
- [x] Método `GET`, `requireAuth`
- [ ] Retorna lista enriquecida:
  ```ts
  {
    emails: Array<{
      id: string
      flow_id: string
      flow_type: string
      flow_name: string
      number: number
      name: string
      status: EmailStatus
      subject: string | null
      preheader: string | null
      html: string | null
      blocks: Array<{ id, block_type, position, label, content }>
      timing: {
        copy_started_at, copy_ready_at,
        rendering_started_at, qa_started_at, ready_at, failed_at
      }
      failure_reason: string | null
      qa_issues: QaIssue[]
      total_cost_cents: number
      attempts: number
      generation_batch_id: string | null
    }>
    current_batch_id: string | null
    stats: {
      total: number
      by_status: Record<EmailStatus, number>
      pct_ready: number
    }
  }
  ```
- [x] Filtros via query string: `?flow_id=...`, `?status=...`, `?batch_id=...`
- [ ] Performance: < 500ms para até 50 emails — validar com benchmark em browser real

### AC AE-6.4 — Página `/admin/stores/[id]/emails`
- [x] Arquivo: `src/app/admin/stores/[id]/emails/page.tsx`
- [x] Server component: faz fetch inicial via `createAdminClient` direto (evita loopback HTTP)
- [x] Client component filho `EmailsLiveList` que abre EventSource e atualiza estado local
- [x] Layout: lista vertical com cards (1 por email), agrupados por flow
- [x] Header da página: botão "Iniciar Onboarding" (componente da story AE-2) + estatísticas (X de Y prontos, Z falhas)

### AC AE-6.5 — Card de email (designer view)
- [x] Componente `src/components/stores/email-card.tsx`
- [x] Mostra: número + nome, badge de status amigável (mapping abaixo), preview HTML em iframe sandbox, copy por bloco (copiar com 1 clique), botões "Baixar imagens"
- [x] Status amigáveis:
  | Status interno | Label designer | Cor |
  |----------------|----------------|-----|
  | `pending`, `draft` | Aguardando | cinza |
  | `copy_generating`, `copy_generating_recovery` | Gerando copy | azul |
  | `copy_ready` | Renderizando | azul |
  | `rendering` | Renderizando | azul |
  | `qa_running` | Revisando QA | azul |
  | `ready` | Pronto | verde |
  | `failed` | Erro | vermelho (mostra `failure_reason` traduzido) |
- [x] Skeleton/spinner inline quando status é intermediário (Loader2 no header)
- [x] Iframe sandbox: `sandbox="allow-same-origin"` para evitar JS do HTML executar
- [x] Botão "Copiar copy completa" (subject + preheader + todos os blocks em formato markdown)

### AC AE-6.6 — Painel "Debug" (dev view)
- [x] Componente `src/components/stores/email-debug-panel.tsx`
- [x] Visível APENAS para profiles com `tags @> ARRAY['dev']` OU `role IN ('admin', 'owner')` — checagem no server component
- [x] Mostra:
  - Timing detalhado (copy started/ready, rendering, qa, ready/failed) + duração calculada
  - Custo total em R$
  - `attempts`
  - `qa_issues` raw como JSON
  - Botão "Ver runs deste email" → linka pra `/admin/agents/runs?email_id=...`
- [ ] Prompt version usada em cada agent (linka pra `/admin/agents/prompts`) — depende de AE-8 (não disponível em `email_flow_emails` ainda; deferred)

### AC AE-6.7 — Real-time client
- [x] Hook `useEmailsLive(storeId, initialSnapshot)` em `src/hooks/use-emails-live.ts`
- [x] Abre `new EventSource('/api/sse/stores/[id]/emails')`
- [x] Listeners: `snapshot` (substitui state), `email_status_change` (merge no email correto), `ping` (atualiza `lastPingAt`)
- [x] Se 3 reconnects falharem em < 30s: cai para SWR `useSWR(..., { refreshInterval: 10000 })`
- [x] Cleanup no unmount: `eventSource.close()`
- [x] Indicator visual no canto da página: "Ao vivo" (verde) | "Reconectando..." (amarelo) | "Atualizando a cada 10s" (cinza)

### AC AE-6.8 — Filtros e empty states
- [x] Filtro por flow (dropdown)
- [x] Filtro por status (chips toggleable)
- [x] Empty state quando loja não tem emails: CTA pra "Iniciar Onboarding"
- [x] Empty state quando todos filtrados zerados: "Nenhum email com esses filtros"

### AC AE-6.9 — Acessibilidade e responsividade
- [x] Cards responsivos (1 coluna mobile, 2 colunas desktop no preview)
- [x] Status badges com `aria-label`
- [x] Iframe HTML preview com `title` descritivo
- [x] Botões copiar com `aria-live="polite"` feedback "Copiado"

### AC AE-6.10 — Testes
- [ ] Teste de integração: page renderiza emails iniciais corretamente — requer `@testing-library/react` (não instalado); validação manual em browser
- [x] Teste hook: `mergeStatusChange` cobre merge correto de status change, no-op em status igual, propagação de failure_reason/batch_id, preservação de outros emails
- [ ] Teste SSE endpoint: emite snapshot inicial + 1 status change após UPDATE no DB — requer integração real com Supabase; validação manual
- [ ] Teste fallback: simula EventSource error → SWR ativa — requer ambiente jsdom + @testing-library; lógica isolada em pure helpers testáveis

---

## Tarefas

- [x] Criar `src/app/api/sse/stores/[id]/emails/route.ts`
- [x] Criar `src/app/api/admin/stores/[id]/emails/route.ts`
- [x] Criar página `src/app/admin/stores/[id]/emails/page.tsx`
- [x] Criar componente `src/components/stores/email-card.tsx`
- [x] Criar componente `src/components/stores/email-debug-panel.tsx`
- [x] Criar componente `src/components/stores/emails-live-list.tsx` (client)
- [x] Criar hook `src/hooks/use-emails-live.ts`
- [x] Adicionar link "Emails" no header de `/admin/stores/[id]/page.tsx` (ao lado das ações)
- [x] Testes em `src/hooks/use-emails-live.test.ts` (12 specs cobrindo merge + status mapping)

---

## Dev Notes

### SSE no Next.js App Router (Node runtime)

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx) {
  // ... auth
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

      send('snapshot', initialSnapshot)
      const interval = setInterval(async () => {
        // poll email_status_events WHERE id > lastIdSeen AND store_id=$id
        // send('email_status_change', ...)
      }, 2000)
      const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 30_000)
      request.signal.addEventListener('abort', () => {
        clearInterval(interval); clearInterval(heartbeat); controller.close()
      })
    }
  })
  return new Response(stream, { headers: {...} })
}
```

### Por que polling DB e não pg LISTEN/NOTIFY direto?

Supabase serverless functions não suportam conexões long-lived ao Postgres. Polling em `email_status_events` (last id seen) é simples, performático (index `idx_ese_store_recent`) e suficiente para o volume. Latência: ~2s no pior caso, aceitável.

### Detecção de role dev

```ts
// server-side em emails/page.tsx
const isDev = profile.role === 'admin' || profile.role === 'owner'
                || profile.tags?.includes('dev')
```

Tag `dev` é uma extensão futura — por enquanto qualquer admin/owner vê o painel debug.

### Iframe sandbox

```tsx
<iframe
  srcDoc={email.html ?? ''}
  sandbox="allow-same-origin"
  title={`Preview do email ${email.name}`}
  className="w-full h-[600px] border rounded"
/>
```

`allow-same-origin` permite que CSS e imagens carregem. Não permite JS, forms ou popups.

---

## Reuso de padrões existentes

- Página padrão store: `src/app/admin/stores/[id]/page.tsx`
- SWR: já usado massivamente (dashboard, portal)
- Componentes design system: cards, badges, buttons existentes
- Iframe pattern: `src/components/productivity/blocks/block-assets-visuais.tsx` (visual-assets já usa iframe)
- `requireAuth`: `src/lib/api/errors.ts`

---

## File List

### A criar
- `src/app/api/sse/stores/[id]/emails/route.ts`
- `src/app/api/admin/stores/[id]/emails/route.ts`
- `src/app/admin/stores/[id]/emails/page.tsx`
- `src/components/stores/email-card.tsx`
- `src/components/stores/email-debug-panel.tsx`
- `src/components/stores/emails-live-list.tsx`
- `src/hooks/use-emails-live.ts`
- `src/hooks/use-emails-live.test.ts`

### A modificar
- `src/app/admin/stores/[id]/page.tsx` (ou layout pai) — adicionar tab/link "Emails"

---

## Dependencias

- **Bloqueado por**: AE-1 (schema timing + tags + status_events), AE-2 (botão iniciar), AE-3 (status final correto)
- **Em paralelo com**: AE-7 (notificações), AE-8 (prompts)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| SSE atrás de proxy do cliente sem suporte | Média | Fallback SWR 10s |
| Polling de 2s em status_events impacta DB | Baixa | Index dedicado; max 1 query por cliente conectado; volume baixo |
| EventSource leak no client | Baixa | Cleanup explícito no useEffect |
| HTML do email com XSS quebra preview | Baixa | Sandbox iframe sem `allow-scripts` |
| Designer não entende status `failed` | Média | UI mostra `failure_reason` traduzido em PT-BR + CTA "Tentar de novo" (dispara `mode=redo` da AE-2) |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-30 | @dev | Story implementada. SSE endpoint (Node runtime, polling de `email_status_events` a cada 2s, heartbeat 30s, cleanup via `request.signal.abort`). REST consolidado com filtros (flow/status/batch). Página server-component que faz fetch direto via `createAdminClient` + multi-tenant guard + checagem `isDev` (role admin/owner ou tag `dev`). Client `EmailsLiveList` usa hook `useEmailsLive` com EventSource + fallback SWR 10s após 3 erros em 30s. `EmailCard` com iframe `sandbox="allow-same-origin"` (sem `allow-scripts`), botão "Copiar copy completa" + por bloco, lista de imagens com download, retry via mode=redo da AE-2. `EmailDebugPanel` com timing/custo/qa_issues/attempts. Link "Emails" adicionado no header do detalhe da loja. Tests: 12 specs em `use-emails-live.test.ts` (mergeStatusChange + status mapping + failure_reason). Typecheck OK, 0 lint warnings, 67 testes AE verdes. |
