# Plano de Performance — Carregamento das Páginas do Admin (Julho 2026)

> **Objetivo:** melhorar o tempo de carregamento das páginas do sistema (foco no admin,
> já que o portal foi otimizado na Fase 2), **sem alterar testes existentes nem seus
> resultados** e **sem mudar a qualidade/precisão dos dados** exibidos.
>
> **Método:** 4 auditorias paralelas sobre o código atual (2026-07-06) — páginas/layouts,
> rotas de API, bundle client-side, rede de testes — **+ build de produção real** para
> medir o JavaScript por rota (números extraídos de `.next/app-build-manifest.json`
> somando os bytes reais dos chunks de layout raiz + layout admin + página).
>
> **Contexto:** Fases 0–2 do plano anterior (`diagnostico-performance-2026-07.md`) já
> entregues e medidas em produção: região pdx1, portal RSC (−60% dados-na-tela),
> overview agregado da loja, loading.tsx + prefetch na troca de workspace.

---

## Parte 1 — Onde o tempo é gasto HOJE (evidências medidas)

### 1.1 JavaScript por rota (build de produção de 2026-07-06, bytes reais não-comprimidos)

Custo de **First Load** = layout raiz + layout admin + página (o que o browser baixa,
parseia e executa no primeiro acesso; na rede vai gzipado ≈ 1/3–1/4 disso, mas o custo
de parse/execução — que trava a hidratação — é o valor cheio):

| Rota | First Load JS |
|---|---|
| `/admin/financial` | **2.041 kB** |
| `/admin/productivity` | 1.984 kB |
| `/admin/productivity/board` | 1.962 kB |
| `/admin/board` | 1.802 kB |
| `/admin/ai-usage` | 1.774 kB |
| `/admin/stores/[id]` | 1.734 kB |
| `/admin/operacional/dashboard` | 1.726 kB |
| `/admin/onboarding` | 1.602 kB |
| `/admin/stores` | 1.579 kB |
| `/admin/clients` | 1.507 kB |
| `/admin/inbox` | 1.410 kB |
| (referência) `/login` | 1.191 kB |

**Baseline fixo de TODO `/admin/*`: ~1.390 kB** (layout raiz 661 kB, sendo ~217 kB CSS
e ~338 kB framework React/Next — inevitável — **+ 729 kB adicionados pelo layout
admin**). Composição do custo do layout admin (chunks medidos):

| Chunk | Tamanho | Conteúdo (assinatura verificada no chunk) |
|---|---|---|
| `16010-*.js` | 197 kB | `@supabase/supabase-js` client-side (GoTrueClient) |
| `28626-*.js` | **154 kB** | **react-markdown/micromark — vem do `AiChatDrawer`** importado estático em `src/app/admin/layout.tsx:13` e montado na linha 232. Pago por TODAS as páginas admin, mesmo sem nunca abrir o chat. |
| `31529-*.js` | 129 kB | Radix UI |
| `app/admin/layout-*.js` | 63 kB | código do próprio layout (sidebar, palette, tour, atalhos) |

Culpados por rota (verificado por presença do chunk no manifest):
- **recharts (326 kB, chunk `43951`)** entra estático em exatamente 2 páginas:
  `/admin/financial` (via `src/components/dashboard/financial-charts.tsx:16`, importado
  estático em `src/app/admin/financial/page.tsx:11`) e `/admin/ai-usage`
  (via `src/components/ai-usage/ai-usage-dashboard.tsx:24`). As outras 5 áreas de chart
  do sistema já usam `next/dynamic` (analytics-charts, crm-reports-charts,
  cs-reports-charts, client-financial, dashboard-layout com React.lazy).
- **@hello-pangea/dnd (80 kB, chunk `602dbae6`)** estático em 12 páginas de board.
- Chunks de código de app de 221 kB (`19892`) e 146 kB (`71289`) em productivity =
  os monolitos client (`productivity-home.tsx` 2.045 linhas, `task-detail-drawer.tsx`
  2.703 linhas, `productivity-board.tsx` 1.816 linhas).

### 1.2 Data-fetching das páginas (o custo dominante percebido)

**Grupo A — páginas client sem initialData** (a tela monta vazia e só então busca):

| Página | Padrão hoje | Evidência |
|---|---|---|
| `/admin/onboarding` (Kanban) | wrapper server fino → 3 `useSWR` disparam no mount: `/api/onboardings`, `/api/admin/org-members`, `/api/me/tasks?status=pending` | `onboarding-kanban.tsx:82,91,98` |
| `/admin/stores` (lista) | `fetchStores()` no mount + 2 fetch de alertas | `stores-page-tabs.tsx:135,152,165-170` |
| `/admin/productivity` | `fetch("/api/productivity")` no mount via zustand | `productivity-store.ts:211` |
| `/admin/comercial/dashboard` | 1 `useSWR` no mount | `comercial/dashboard/page.tsx:34` |
| `/admin/inbox` | `useSWR` threads no mount; detalhe em waterfall (só busca após selecionar) | `inbox-view.tsx:75,81` |
| `/admin/comercial/pipelines` | client busca lista → `router.replace` para `[id]` → nova página busca de novo (**waterfall de navegação**) | `comercial/pipelines/page.tsx:34,46` |

Ao todo, **45 páginas admin são Client Components inteiros**; nas principais, o RSC não
pré-carrega nada.

**Grupo B — RSCs com waterfall serial** (o servidor busca, mas em fila indiana):

| Página | Waterfall | Evidência |
|---|---|---|
| `/admin/stores/[id]` | `getUser` → `client_stores` → `getStoreIntegrationStatus` → `store_onboarding_data` → `onboardings` → `store_briefings` → `store_revenue_summary` (+retry) → `resolveOrgId` → `convertToBRL` (rede externa) = **~7–9 round-trips 100% seriais** | `stores/[id]/page.tsx:25-189` (awaits individuais, zero `Promise.all` em `getStore`) |
| `/admin/operacional/dashboard` | `getUser` → `profiles` → `org_members` → batch de 9 queries → batch de 4 queries = **~16 round-trips em 5 ondas seriais** | `operacional/dashboard/page.tsx:46-135, 262-293` |
| `/admin/board` | `resolveCurrentUser` → `getAllowedSourceTypes` → `Promise.all` de 5 fetchers, **mas fetchers refazem `auth.getUser()` + `org_members` internamente** | `board/page.tsx:116-127, 199-211, 301-315` |
| Layout admin (toda página) | `getUser` → `profiles` → `getPermissions` (org_members → org_member_roles), série; para admin **materializa TODAS as `client_stores` ativas com join de clients, sem paginação, a cada request** | `admin/layout.tsx:29-41, 99, 172-185` |

Agravante: layout e página **repetem** `auth.getUser()`/`profiles`/`org_members` no
mesmo request sem dedupe — não há `React.cache()` em nenhum service do admin
(única ocorrência no projeto: `portal-auth.service.ts:1`, do portal).

Física do problema: com o Supabase a ~65 ms de round-trip (medido na Fase 0), cada
onda serial custa no mínimo isso. `stores/[id]` paga ~500–900 ms só de fila, antes de
qualquer byte de HTML.

### 1.3 Cache: continua zero em todas as camadas (reconfirmado hoje)

- `unstable_cache` / `revalidateTag` / `revalidatePath`: **0 ocorrências** em `src/`.
- Redis (`@upstash/redis`, já contratado): usado **só** para rate-limit (`rate-limit.ts`).
- `Cache-Control` em rotas de dados do admin: **nenhuma** (só tracking/widget/SSE/zips).
- `force-dynamic` em 38 páginas admin; nenhum `revalidate`.

### 1.4 Rotas de API quentes

- `GET /api/onboardings` (`route.ts:35-93`): `requireAuth` (getUser **remoto**) →
  `resolveOrgId` → `ensureOnboardingBootstrapForRead` → `Promise.all` #1 → `Promise.all`
  #2 = ~5 ondas seriais. Com TTL de 5 min expirado, o bootstrap completo roda **UPDATEs
  de re-sync de colunas dentro do GET** (`onboarding-bootstrap.service.ts:616-637`).
  Query principal com `select("*", …, tasks(...))` sem paginação (`route.ts:52`).
- Preâmbulo fixo de ~2 round-trips (getUser remoto + `org_members`) em ~78 rotas
  (`errors.ts:195`, `resolve-org.ts:15`); rotas CRM/productivity repetem a query de org
  inline (`productivity/route.ts:39-44`, `crm/leads/route.ts:25-31`).
- `GET /api/productivity`: 6× `select('*')` com joins aninhados + bootstrap com TTL +
  projeção de onboardings — sem paginação.
- **Sino de notificações**: `sidebar.tsx:289` → `useReportNotifications` faz poll de
  `GET /api/reports?status=notifications&limit=15` a cada **5 s (job ativo) / 30 s
  (ocioso)** por aba aberta (`use-report-notifications.ts:37-55`); a rota faz getUser
  remoto + `select("*")` em `report_jobs` (`api/reports/route.ts:20-42`). Mobile:
  +1 count no Supabase a cada 30 s (`mobile-top-bar.tsx:55`).
- `withTiming` está em apenas 7 rotas; dashboard/crm/productivity/reports não têm
  instrumentação.

### 1.5 Outros

- **`loading.tsx` ausente** em: `onboarding/` (e `[id]`), `inbox/`, `stores/[id]`,
  `clients/[id]`, `settings/*`, e não existe `admin/loading.tsx` raiz. Rotas RSC
  pesadas sem fallback = tela congelada durante a navegação.
- Timers de 1 s vivos: `task-detail-drawer.tsx:943`, `productivity-home.tsx:75`
  (re-render do monolito inteiro a cada segundo enquanto aberto).
- Virtualização: só `data-table.tsx`; kanbans (onboarding, productivity, CRM) renderizam
  todos os cards no DOM.
- `next.config.mjs`: sem `optimizePackageImports`/`experimental`.

---

## Parte 2 — Restrições (o que NÃO pode mudar)

Mapeado da suíte real:

1. **19 rotas de API têm teste direto de handler** (email-blocks, campaigns generate,
   webhooks n8n, cron, tasks/[id]/campaign-*, internal/run-phase2*) — nenhuma é rota de
   página quente deste plano, mas **não tocar nos shapes** delas.
2. `/api/dashboard/total-revenue` tem teste que é **cópia stale** dos helpers — o shape
   documentado no teste é o contrato; mudanças no route.ts real não são detectadas pelo
   teste (cuidado redobrado se mexer).
3. `/api/productivity` e `/api/tasks/[id]/timer`: contrato coberto **só pelos e2e
   não-commitados** (`focus-timer`, `__repro-timer`, `__payload-debug`) — payload
   (`groups[].items[].{id,name,timer_started_at,time_spent_seconds}`, `session_id`,
   `actual_minutes`) é intocável.
4. e2e smoke commitados: login admin → dashboard, `/admin/onboarding` com colunas,
   `/admin/stores` carrega; portal completo. Qualquer proposta abaixo mantém esses
   fluxos idênticos.
5. Vitest roda em `environment: node`, **zero testes de componente/DOM** — refatorações
   de página não quebram testes unitários por construção, desde que os payloads das
   rotas consumidas não mudem.
6. Falhas pré-existentes (não relacionadas): `email-generation-notify.service.test.ts` e
   `email-task-sync.service.test.ts` (7 asserts, verificado no HEAD limpo em 2026-07-02).

**Regra de todas as propostas:** nenhuma altera a fonte dos dados, o payload das rotas
ou o resultado exibido — só QUANDO/COMO os mesmos dados são buscados e quanto JS é
carregado.

---

## Parte 3 — Propostas (ranqueadas por ganho ÷ esforço ÷ risco)

### 🥇 M1 — Paralelizar os waterfalls dos RSCs + dedupe por request (`React.cache`)

**O quê:**
1. `stores/[id]/page.tsx`: agrupar as ~7 queries de `getStore` em 2 ondas de
   `Promise.all` (a 1ª busca `client_stores`; a 2ª roda status/onboarding/briefing/
   revenue/orgId em paralelo — todas dependem só do `id`/`user`, não umas das outras).
   `convertToBRL` junto na 2ª onda.
2. `operacional/dashboard/page.tsx`: fundir batch 1 (9 queries) + batch 2 (4 queries)
   num único `Promise.all` de 13 (batch 2 não usa nada do batch 1 — verificado) e
   paralelizar `profiles`+`org_members`.
3. Criar helpers com `React.cache()` — `getSessionUser()`, `getProfile(userId)`,
   `getOrgId(userId)` — e usar no layout admin E nas páginas. O React deduplica por
   request: layout e página passam a compartilhar o resultado em vez de repetir
   `getUser`/`profiles`/`org_members` (hoje repetidos em `board`, `operacional/
   dashboard`, `stores/[id]`, `pipeline`).
4. Layout admin: parar de materializar todas as `client_stores` para admin/dev
   (`layout.tsx:29-41,99`) **somente se** nenhum consumidor do objeto de permissões usar
   a lista — verificar consumidores antes; senão, adiar para M6.

**Comprovação de que funciona:**
- Mesma técnica já aplicada e medida neste repo: `requireStoreAccess` foi paralelizado
  na Fase 1 (P7) e `portal-auth.service` usa `React.cache()` desde a Fase 2 — o portal
  mediu **−60% no tempo até dados na tela** em produção com esse pacote.
- Aritmética direta: round-trip à base ≈ 65 ms (medido, mesma região pdx1). 7–9 RTs
  seriais ≈ 500–900 ms; em 2–3 ondas ≈ 130–200 ms. **Ganho de ~400–700 ms por navegação
  em `stores/[id]`**, ~300–500 ms no dashboard operacional. É física de rede, não
  aposta.

**Dados/testes:** mesmas queries, mesmos filtros, mesmo resultado — muda só o
paralelismo. Nenhuma rota de API tocada. RSCs não têm teste unitário; e2e smoke passa
inalterado.

**Esforço:** baixo (2–3 arquivos por página). **Risco:** baixo (atenção apenas a
queries que realmente dependem de resultado anterior — ex.: retry do
`store_revenue_summary`).

### 🥈 M2 — RSC prefetch + `fallbackData` nas páginas client principais do admin
*(o playbook exato da Fase 2 do portal)*

**O quê:** para `/admin/onboarding`, `/admin/stores`, `/admin/productivity`,
`/admin/comercial/dashboard`, `/admin/inbox` (threads): o `page.tsx` (server) chama o
mesmo service/handler in-process, e passa o resultado como `fallbackData`/`initialData`
para o componente client — que continua com os mesmos `useSWR`/fetch para refreshes.
O usuário vê os dados **no HTML da primeira resposta**, em vez de esperar
hidratação → fetch → render.

Bônus específico: `/admin/comercial/pipelines` elimina o waterfall de navegação —
o RSC resolve o pipeline default e faz `redirect()` server-side em vez de
client-fetch + `router.replace` (`comercial/pipelines/page.tsx:34-46`).

**Comprovação de que funciona:**
- **Medido em produção neste mesmo sistema**: as 9 páginas do portal migradas com esse
  padrão em 2026-07-02 saíram de ~3,0–3,5 s para **~1,0–1,4 s** de dados-na-tela (−60%)
  e navegação SPA de 0,87 s → 0,04 s (prefetch do Next entrega o RSC já com dados).
  A sidebar do admin usa `<Link>` com prefetch automático (verificado,
  `sidebar-item.tsx:51`) — o mesmo efeito de navegação instantânea se aplica.
- O padrão in-process já existe no admin: `/api/admin/stores/[id]/overview` invoca
  handlers internamente (`invokeJson`).

**Dados/testes:** payload das rotas `/api` **não muda** (continuam sendo usadas pelos
refreshes client) — é o requisito que o portal já cumpriu. e2e smoke do kanban/stores
continua verde (mesma UI, só carrega antes). Ordem recomendada: onboarding → stores →
productivity (productivity por último: contrato do payload protegido só pelos e2e
não-commitados; rodá-los antes/depois).

**Esforço:** médio (1 service extraído + initialData por página — receita conhecida).
**Risco:** médio-baixo (executado 9× no portal sem regressão).

### 🥉 M3 — Dieta de bundle: AiChatDrawer dinâmico + recharts dinâmico nas 2 páginas restantes

**O quê:**
1. `AiChatDrawer` com `next/dynamic` (`ssr: false`), carregado **quando o usuário abre
   o chat** (o estado já vive em `useAiChatStore` — o trigger continua estático, é um
   botão). Remove o chunk de 154 kB (react-markdown) do caminho crítico de **todas** as
   ~141 páginas admin.
2. `financial-charts.tsx` e `ai-usage-dashboard.tsx` atrás de `next/dynamic` com
   skeleton — remove o chunk recharts de 326 kB do First Load de `/admin/financial`
   (2.041 kB → ~1.715 kB) e `/admin/ai-usage`.
3. `next.config.mjs`: adicionar `experimental.optimizePackageImports` para
   `["recharts", "@hello-pangea/dnd", "react-markdown", "date-fns"]` (lucide-react já é
   otimizado por default no Next 15).

**Comprovação de que funciona:**
- Números medidos no build desta análise (tabela 1.1): os chunks existem, têm esses
  tamanhos e estão nessas rotas — a remoção é determinística, não estimativa.
- O padrão é o mesmo já aplicado com sucesso em 5 áreas de chart deste repo (P12,
  Fase 1) e no reactflow (`automacoes/[id]`, `automations/new`) — zero regressão
  registrada.

**Dados/testes:** zero impacto em dados (é só code-splitting); nenhum teste referencia
esses componentes.

**Esforço:** baixo (3 arquivos + config). **Risco:** baixo.

### M4 — `loading.tsx` nas rotas sem fallback + skeletons

**O quê:** criar `loading.tsx` para `admin/onboarding/`, `admin/inbox/`,
`admin/stores/[id]/`, `admin/clients/[id]/`, `admin/settings/` (e opcionalmente um
`admin/loading.tsx` raiz como rede de segurança). Com M1/M2 aumentando o trabalho
server-side, o fallback instantâneo é o que mantém a navegação "viva".

**Comprovação:** foi exatamente o fix da troca de workspace (commit `10685515`) — as
homes sem `loading.tsx` seguravam o `router.push` até o RSC inteiro resolver; com o
fallback o feedback é imediato. Confirmado pelo usuário na época.

**Esforço:** trivial. **Risco:** zero (não toca em dados).

### M5 — Tirar custo morto do caminho de leitura das APIs quentes

**O quê (mantendo payload byte a byte idêntico):**
1. `GET /api/onboardings`: mover a checagem `isOnboardingBootstrapped` para dentro do
   primeiro `Promise.all` (é independente); quando o TTL de 5 min expira, disparar o
   re-sync **fire-and-forget** (sem `await`) em vez de bloquear o GET com UPDATEs
   (`onboarding-bootstrap.service.ts:616-637`) — a semântica não muda: o re-sync é
   idempotente e o dado servido é o mesmo (ele só propaga templates novos pós-deploy).
2. Trocar `select('*')` por colunas explícitas **apenas** nas rotas quentes cujo
   consumo é conhecido (`/api/onboardings`, `/api/reports` do sino) — listar as chaves
   que o client usa e mantê-las todas; isso reduz payload sem mudar nenhum valor.
3. Sino de notificações: pausar o poll quando `document.visibilityState === "hidden"`
   (SWR `isPaused`) — dado idêntico, só não busca com a aba invisível.
4. Aplicar `withTiming` nas rotas quentes ainda sem instrumentação (dashboard, crm,
   productivity, reports) — é o que prova o antes/depois de tudo acima.

**Comprovação:** o padrão TTL+fire-and-forget já opera no próprio bootstrap
(`SEED_SYNC_TTL_MS`) sem incidentes; a redução de payload do `/api/onboardings` na
Fase 2.5 (remoção dos JSONB de template) foi deployada sem regressão — este é o mesmo
movimento na dimensão colunas.

**Cuidados:** `/api/onboardings` alimenta o kanban do e2e smoke — rodar
`test:e2e` antes/depois; em `select` explícito, diff do JSON de resposta em dev
(mesma loja, mesmas chaves) como gate de "dados idênticos".

**Esforço:** baixo-médio. **Risco:** médio-baixo (o único ponto com juízo de valor é o
re-sync assíncrono).

### M6 — (Segunda onda, opcional) Cache de leitura com invalidação por evento

Deixado explicitamente **fora do pacote imediato** porque o requisito é não mudar a
precisão dos dados: qualquer cache por TTL pode servir dado até N segundos velho.
Quando/se for aceitável: `unstable_cache` + `revalidateTag` nas leituras quase-estáticas
(permissões, org, lista de lojas do layout) com invalidação nos pontos de escrita —
correção preservada por construção (tag derruba o cache na mutação). O Redis já pago
entra como cache de agregações do dashboard **somente** com invalidação por
evento/cron, não TTL cego. Pré-requisito: telemetria do M5.4 para provar necessidade.

Mesma lógica para: virtualizar kanbans com >50 cards (`useVirtualizer` já usado em
`data-table.tsx`), isolar os timers de 1 s em componentes-folha
(`task-detail-drawer.tsx:943`, `productivity-home.tsx:75`) e quebrar os monolitos —
ganhos reais, mas de interação/CPU, não de carregamento de página; ficam para depois
das medições.

---

## Parte 4 — Ordem de execução e prova antes/depois

| Ordem | Item | Ganho esperado | Como provar |
|---|---|---|---|
| 1 | M4 (loading.tsx) + M3 (bundle) | feedback imediato na navegação; −154 kB em todo admin, −326 kB em financial/ai-usage | re-rodar o build e diffar a tabela 1.1; Speed Insights (LCP/INP) |
| 2 | M1 (waterfalls + React.cache) | −400–700 ms em `stores/[id]`; −300–500 ms no dashboard operacional | `withTiming` + spec estilo `perf-baseline` para admin (só cronometra, não asserta) |
| 3 | M5 (APIs quentes + telemetria) | kanban: 5 ondas → ~3; payloads menores | logs `withTiming` antes/depois; diff de JSON das rotas alteradas |
| 4 | M2 (initialData página a página) | dados-na-tela −50–60% nas páginas migradas (precedente medido do portal) | mesma métrica "conteúdo visível" usada na Fase 2 |
| 5 | M6 (cache/virtualização/monolitos) | condicional às medições | Speed Insights + withTiming |

**Gate de segurança em todo passo:** `npm run lint` + `npm run typecheck` +
`npm run test` (ignorando as 7 falhas pré-existentes documentadas) + `npm run test:e2e`
com `.env.e2e`. Nenhum teste é alterado; nenhum payload muda de shape ou de valor.

---

*Gerado em 2026-07-06 a partir de auditoria multi-agente (4 frentes) + build de
produção local na branch `claude/resume-previous-session-UvATK`.*
