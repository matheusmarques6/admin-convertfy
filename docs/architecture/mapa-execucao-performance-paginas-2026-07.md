# Mapa de Execução — Performance das Páginas do Admin (M1–M6)

> Detalhamento de implementação do plano `plano-performance-paginas-admin-2026-07.md`.
> Gerado em 2026-07-06 por 6 auditorias paralelas de código (uma por mudança), com
> leitura integral dos arquivos-alvo. Para cada mudança: **área** (arquivos), **o que
> muda no código** (antes→depois), **riscos**, **testes a rodar**.
>
> Restrições globais (valem para tudo): não alterar testes existentes nem seus
> resultados; payload das rotas `/api` byte a byte idêntico; mesmos dados exibidos;
> mudanças só em QUANDO/COMO os dados são buscados e quanto JS é carregado.

## Correções ao plano original (descobertas no mapeamento)

| # | O plano dizia | O código mostrou |
|---|---|---|
| 1 | M1 poderia trocar a lista de lojas do layout por flag `hasAllAccess` | **NÃO é seguro**: 3 consumidores client usam `storeAccess.length` em caminhos alcançáveis (`use-permissions.tsx:183`, `sidebar.tsx:306-307`, `permission-gate.tsx:92`) para contas org-admin/dev não-globais. Fica para M6, junto com a mudança dos componentes. |
| 2 | M3 adicionaria `optimizePackageImports` para recharts/date-fns/lucide | O Next 15.5.14 **já otimiza os três por default** (`node_modules/next/dist/server/config.js:861-906`). Só vale adicionar `@hello-pangea/dnd`; react-markdown é default-export (no-op para essa otimização). |
| 3 | M5 trocaria `select('*')` por colunas explícitas em onboardings/reports | **Inviável sob "payload byte a byte idêntico"**: toda coluna removida muda o shape; e há drift comprovado entre migrations e schema real (`onboardings.referred_by_name` é gravada e tipada mas não existe em nenhuma migration). Recomendação: manter `'*'` + documentar candidatos para follow-up fora do M5. |
| 4 | M5 pausaria o poll do sino com aba oculta | **Já pausa por default**: `swr@2.4.1` só revalida `refreshInterval` se `refreshWhenHidden || isVisible()` (`node_modules/swr/dist/index/index.mjs:607-616`). Sub-item cortado — zero código. |
| 5 | — | Precedente para fire-and-forget: o repo já usa `after()` do `next/server` em 5+ pontos (ex.: `onboarding-pipeline.service.ts:1179`, `phase2-runner.service.ts:8` documenta que na Vercel ele executa pós-resposta). Usar `after()`, nunca promise solta. |

---

# M1 — Paralelizar waterfalls dos RSCs + dedupe por request (`React.cache`)

## Área

| Arquivo | Ação |
|---|---|
| `src/lib/services/admin-auth.service.ts` | **CRIAR** (modelado em `portal-auth.service.ts`) |
| `src/app/admin/stores/[id]/page.tsx` | alterar `getStore` + page |
| `src/app/admin/operacional/dashboard/page.tsx` | fundir batches + preâmbulo |
| `src/app/admin/board/page.tsx` | remover auth redundante dos fetchers |
| `src/app/admin/layout.tsx` | adotar helpers + paralelizar profiles∥org_members |
| `src/app/admin/pipeline/page.tsx` | paralelizar preâmbulo (escopo menor) |
| `src/app/admin/dashboard/operational/page.tsx` | adotar helpers |

## O que muda

### Helper novo (`admin-auth.service.ts`)

```ts
import { cache } from "react"
export const getSessionUser = cache(async () => { /* createClient → auth.getUser → user|null */ })
export const getProfileByUserId = cache(async (userId: string) => { /* profiles select("*") via client de sessão */ })
export const getActiveOrgMember = cache(async (userId: string) => { /* adminClient org_members id,org_id,role · profile_id=userId · is_active · limit(1).single() */ })
```

Decisões que preservam valores:
- `getProfileByUserId` usa `select("*")` (superset de todos os call sites: layout usa `*`, dashboards usam `role`/`name`).
- **NÃO unificar `resolveOrgId`** (`src/lib/api/resolve-org.ts`): ordena por `created_at asc` e lança `AppError(403)` — em multi-membership poderia escolher linha diferente das outras variantes. Fica intocado.
- A query de org_members do **layout** (com join `organizations` e order by role) também **não** migra para o helper — ordering diferente.
- Call sites seguros para `getActiveOrgMember` (filtros idênticos, verificados): `board/resolveCurrentUser`, `operacional/dashboard`, `dashboard/operational`.

### `stores/[id]` — de ~8 ondas seriais para 3

Grafo verificado: `client_stores`, `getStoreIntegrationStatus`, `store_onboarding_data`, `onboardings`, `store_briefings`, `store_revenue_summary(+retry)` dependem **só de `id`**; `convertToBRL` depende do resultado do revenue; `resolveOrgId` só de `user.id`.

```
DEPOIS: getSessionUser (cached — layout já pagou)
        → client_stores  ∥  resolveOrgId (especulativo, wrapper settled)
        → Promise.all[ integrationStatus, onboarding_data, onboardings, briefing, revenue(+retry interno) ]
        → convertToBRL (dependência real de dados; cache 1h já existente)
```

Preservações obrigatórias: retry omnisend vira função async única dentro do all (sequência interna intacta); `resolveOrgId` especulativo embrulhado em `.then/.catch → settled` e re-lançado **só** no ponto atual (`if (store.org_id)`) — evita unhandled rejection quando `org_id` é null e mantém o `AppError` no mesmo lugar do fluxo; `notFound()`/redirects nas mesmas condições. `getStore` passa a receber `userId` (função privada, sem consumidores externos — verificado).

### `operacional/dashboard` — de 6 ondas para 2

Batch 2 (contracts, low-health, charges, alerts) **não usa nada** do batch 1 (verificado; só usa `thirtyDaysFromNow`, derivado de `now` definido antes). Fusão: um único `Promise.all` de 13. Preâmbulo: `getSessionUser` → `Promise.all([getProfileByUserId, getActiveOrgMember, getDashboardData().catch(→EMPTY_DASHBOARD_DATA)])`. `redirect("/login")` continua antes de qualquer render.

### `board` — matar auth redundante

- `getTeamMembers()` refaz getUser+org_members só para obter `orgId` → nova assinatura `getTeamMembers(orgId)`.
- `getMeetings(orgId)` refaz getUser+org_members → `getMeetings(orgId, userId, orgMemberId)` (valores já existem em `currentUser`).
- Cadeia real `getAllowedSourceTypes→getTasks` encadeada via `.then` DENTRO do `Promise.all` (deixa de bloquear os outros 4 fetchers).
- **Nuance a documentar no PR**: a query interna atual de `getMeetings` usa `.single()` sem `.limit(1)` — em multi-membership (caso patológico, 0 usuários na prática) o comportamento muda marginalmente (correção de inconsistência interna). Alternativa zero-delta: manter lookup interno.

### `layout.tsx`

`getUser`→`getSessionUser`; `profiles(*)`→`getProfileByUserId`; paralelizar `profiles` com a query de org_members do `getPermissions` (5 ondas → 4). O atalho `adminStoresPromise` existente fica intacto. **`fetchAllStores` NÃO é tocado** (ver correção #1).

## Riscos (tabela completa no output do agente; principais)

1. `resolveOrgId` especulativo: log interno pode ocorrer em requests que antes não o executavam (delta aceitável ou cair para sequencial, perdendo ~65ms).
2. `Promise.all` rejeita se UMA promise lança — fetches PostgREST não rejeitam (`{data,error}`); os únicos throwers (`getStoreIntegrationStatus`, `resolveOrgId`, `getDashboardData`) mantêm seus try/catch atuais.
3. `getProfileByUserId` com `select("*")` onde antes era `select("role")`: payload RSC→client não muda (pages continuam repassando só o que repassavam).

## Testes

- Unit: nenhum teste cobre os RSCs alterados (verificado); `credentials.service.test.ts` não é afetado (só call site). Rodar `npm run test` inteiro (baseline: 7 falhas pré-existentes).
- E2E: `smoke-admin.spec.ts` completo (passa pelo layout alterado); `smoke-client`/`smoke-public` como regressão indireta.
- Manual: `stores/[id]` com (a) loja com org_id do usuário, (b) sem org_id, (c) id inexistente→404; dashboard com admin e com role de suporte; board com tarefas/reuniões; loja com moeda ≠ BRL.
- Gates: `lint` + `typecheck`.

---

# M2 — RSC prefetch + initialData/fallbackData nas páginas client

## Receita (extraída do portal, precedente medido −60%)

1. RSC busca com `try { initialData = await ... } catch { initialData = null }` — falha no prefetch nunca quebra (client volta ao comportamento atual).
2. Client recebe `initialData` por prop; `useState(initialData)` + `loading = !initialData`.
3. Skip do fetch de mount: `useRef(!!initialData)` consumido no primeiro efeito.
4. Variante SWR: `fallbackData` congelado em `useRef`, aplicado **só quando a key atual == key inicial**, + `revalidateOnMount: fallback ? false : undefined` (modelo: `use-portal-campaigns-calendar.ts:177-211`).
5. `initialData` deve ser o JSON **exato** da rota (incluindo `success: true` do `successResponse`).
6. Refreshes continuam batendo na rota `/api` — payload intocado.

## Decisão estrutural: invocar handlers in-process (não extrair services)

Precedente: `invokeJson` em `/api/admin/stores/[id]/overview/route.ts:27-37` (`new NextRequest(url)` → handler → `.json()`; `createClient()` lê cookies via `next/headers`, funciona em RSC). **Criar** `src/lib/api/invoke-route.ts` exportando `invokeRouteJson(handler, path)` (catch → null). Vantagens: zero duplicação, payload byte-idêntico por construção, mesmos side effects que o fetch do client dispararia. Custo aceito: cada handler repete `requireAuth`+`resolveOrgId` (~2 RTs) — invocar múltiplos via `Promise.all` (1 onda).

## Por página (ordem de risco crescente)

| # | Página | Mudanças | Risco-chave |
|---|---|---|---|
| 0 | — | criar `src/lib/api/invoke-route.ts` | zero |
| 1 | `/admin/comercial/pipelines` | vira RSC: query direta de `pipelines` (espelho exato do critério da rota + regra do client: `is_default` primeiro, senão primeiro por created_at) → `redirect()` **fora de try/catch** (NEXT_REDIRECT é throw); lista vazia → empty state (o `PipelinesEmptyHero` atual não tem handler). Remove o waterfall fetch→router.replace | manter critério de escolha idêntico |
| 2 | `/admin/comercial/dashboard` | conteúdo vai para `sales-dashboard-client.tsx` com prop `initialData`; RSC invoca `/api/crm/dashboard/sales?days=30`; SWR `fallbackData` só quando `days===30` | incluir `success: true` no fallback |
| 3 | `/admin/inbox` | `page.tsx` vira RSC; invoca `/api/crm/inbox/threads?status=open`; `InboxView` ganha prop `initialThreads`; fallback só na key inicial (`open`, `!mineOnly`, `!search`); `refreshInterval: 10000` permanece (frescor garantido). Detalhe da thread NÃO é prefetchado (seleção do usuário) | baixo |
| 4 | `/admin/onboarding` | RSC invoca os 3 handlers via `Promise.all` (`/api/onboardings`, `/api/admin/org-members`, `/api/me/tasks?status=pending`); `OnboardingKanban` ganha 3 props opcionais com fallbackData+revalidateOnMount:false. Keys estáticas (filtros são client-side em memória; **zero localStorage** no kanban — verificado) | bootstrap com TTL expirado entra no TTFB → exigir M4 (loading.tsx) antes; com M5.1b o custo some |
| 5 | `/admin/stores` | RSC invoca `/api/stores/control?page=1&per_page=15` + `/api/stores/alerts/summary`; `StoresPageTabs` ganha initialStores/initialAlertsSummary; skip do fetch só quando `page===1 && !search`; counts inicializados dos payloads (mesma fonte). **Zero localStorage** (verificado) | `/api/stores/control` tem live-fallback Klaviyo (fetch externo + upserts) que pode segurar o TTFB — mitigar com `Promise.race` timeout 2-3s → null (client busca como hoje). Decidir no PR |
| 6 | `/admin/productivity` | `productivity-store.ts`: extrair mapeamento de `fetchData` para função pura `buildStateFromApi(data)` + action `hydrate(json)`; RSC invoca `/api/productivity`; novo `productivity-page-client.tsx` hidrata **em render** (guardado por ref, antes do efeito do monolito — `isLoaded=true` faz o `fetchData` do mount não disparar; monolito de 2.045 linhas intocado) | contrato do payload protegido SÓ pelos e2e não-commitados → rodar `focus-timer`/`__repro-timer`/`__payload-debug` antes/depois; hidratar 1× por mount (store singleton); board compartilha o store (sem conflito — também gateia por `isLoaded`) |

## Testes

- Unit: nenhum teste importa os handlers/componentes-alvo (verificado). Refactor do productivity-store coberto por typecheck.
- E2E: `smoke-admin` antes/depois dos passos 4-5; specs de timer antes/depois do passo 6; `perf-baseline` como prova de ganho.
- Gates por passo: `lint` + `typecheck` + `test` + `test:e2e`.

---

# M3 — Dieta de bundle

## Área

| Arquivo | Ação |
|---|---|
| `src/components/ai/ai-chat-lazy.tsx` | **CRIAR** (wrapper client) |
| `src/app/admin/layout.tsx` | trocar 2 linhas (import + render) |
| `src/app/admin/financial/page.tsx` | recharts dinâmico |
| `src/components/ai-usage/ai-usage-cost-chart.tsx` | **CRIAR** (extração do bloco recharts) |
| `src/components/ai-usage/ai-usage-dashboard.tsx` | dinamizar só o chart |
| `next.config.mjs` | `experimental.optimizePackageImports: ["@hello-pangea/dnd"]` |

## O que muda

1. **AiChatLazy** (remove ~154 kB de react-markdown de TODAS as páginas admin): o layout é RSC → `ssr:false` não pode ser usado nele direto; wrapper client lê `useAiChatStore(s => s.open)` e usa padrão **"montou uma vez, fica montado"** (`everOpened`): preserva animação de saída do Sheet, estado de mensagens entre aberturas e Esc-to-close. Verificado: trigger e watcher só tocam o store (não importam o drawer); **nenhum atalho de teclado** abre o chat (grep `useAiChatStore` = só os 4 arquivos de `src/components/ai/`). Único delta: 1ª abertura espera o fetch do chunk (~150–300 ms); o trigger some no clique (feedback imediato).
2. **financial**: page é `"use client"` → padrão exato de `comercial/reports/page.tsx:11-17` (`dynamic(...ssr:false, loading: <PageSkeleton variant="chart"/>)`). `FinancialCharts` só é usado nessa página (verificado) → chunk recharts (326 kB) sai inteiro da rota.
3. **ai-usage**: page é RSC → dinamizar **só o card "Custo por dia"** (linhas 197-219 do dashboard, único uso de recharts): extrair `AiUsageCostChart` com prop `data: { day: string; cost_usd: number }[]` e `dynamic(...ssr:false, loading: <Skeleton h-[200px]/>)` dentro do dashboard (que já é client). Cards e tabelas continuam renderizando imediato — menor mudança visual.
4. **next.config.mjs**: só `@hello-pangea/dnd` (ver correção #2). Reversível em 1 linha; mitigação: testar drag-and-drop num kanban pós-build.

## Verificação

- `npm run build` antes/depois; diffar First Load JS: −154 kB no grupo `/admin/*` (item 1), −326 kB em financial/ai-usage (itens 2-3). Os chunks devem continuar existindo como **async** (sob demanda).
- Visual: chat abre com animação + markdown renderiza + conversa preservada ao reabrir + contexto "Loja em foco" (watcher); Network tab: chunk do drawer só baixa no 1º clique; charts renderizam após skeleton breve.
- Testes: **nenhum teste referencia** AiChatDrawer/FinancialCharts/AiUsageDashboard (verificado). Rodar suíte + gates + smoke-admin mesmo assim.

Ordem interna: financial → ai-usage → AiChatLazy → next.config (cada passo commitável isolado).

---

# M4 — `loading.tsx` nas rotas sem fallback

## Área — 7 arquivos a CRIAR (nenhum existente é alterado)

| Arquivo | Conteúdo |
|---|---|
| `src/app/admin/onboarding/loading.tsx` | `<PageSkeleton variant="kanban"/>` |
| `src/app/admin/onboarding/[id]/loading.tsx` | back-link + card hero h-36 + `variant="detail"` sem header |
| `src/app/admin/inbox/loading.tsx` | split view manual (coluna 320px com busca/chips/8 rows + painel com bolhas) |
| `src/app/admin/stores/[id]/loading.tsx` | breadcrumb + ações + hero h-28 + 4 `SkeletonMetric` + tabs + card h-96 |
| `src/app/admin/clients/[id]/loading.tsx` | breadcrumb + header com `SkeletonCircle 48` + tabs + 2 cards h-64 |
| `src/app/admin/settings/loading.tsx` | header + grid 3-col com 9 cards (cobre o hub + ~20 subrotas sem loading próprio) |
| `src/app/admin/loading.tsx` | **raiz, rede de segurança**: `<PageSkeleton variant="metrics"/>` — o loading mais específico vence, então as 13 rotas com loading próprio não são afetadas; cobre ~35 segmentos hoje sem fallback (crm, tools, automations, insights…) |

Padrão do projeto: `Skeleton` de `@/components/ui/skeleton` + presets `PageSkeleton` (`page-skeleton.tsx`, variantes `metrics|list|kanban|detail|chart`, com `role="status"`). Server components, sem `"use client"`.

## Onde ajuda de verdade vs. cosmético (dependência M4↔M2)

- **Ganho real hoje**: `stores/[id]` (6+ awaits force-dynamic), `clients/[id]`, `settings` — a navegação trava até o RSC resolver; o skeleton destrava.
- **Cosmético hoje, essencial pós-M2**: `onboarding`, `inbox` (wrappers client finos — quem demora é o fetch client). Quando M2 mover o fetch para o RSC, sem loading.tsx a navegação voltaria a congelar. **Criar ANTES de M2.**

## Regra de implementação + testes

- **Proibido heading (`h1-h6`) dentro dos skeletons**: `smoke-admin.spec.ts` valida `getByRole("heading")` visível — um heading no skeleton faria o teste passar falsamente no fallback. `Skeleton`/`PageSkeleton` são só divs + `sr-only` — manter assim.
- Nenhum teste referencia `loading.tsx` (grep confirmado). Playwright re-tenta locators → skeleton antes do conteúdo não quebra os waits.
- Gates: `lint` + `typecheck` + smoke e2e. Validar visualmente 2-3 rotas cobertas só pelo raiz (`/admin/crm`, `/admin/tools`).

---

# M5 — APIs quentes (payload byte a byte idêntico)

Reclassificação pós-mapeamento: os sub-itens de `select('*')` viram "documentar e manter" (correção #3) e o de poll oculto foi cortado (correção #4). O ganho real está em 5.1 (bootstrap), e a telemetria (5.3) é o alicerce de medição de tudo.

## 5.1 GET /api/onboardings

**(a) Bootstrap no primeiro `Promise.all`** — dependência verificada: a query principal NÃO depende do bootstrap (onboardings só existem se `createOnboarding` rodou, que bootstrapa internamente); quem depende é a query de `operational_pipelines`. Solução: 3 elementos no all (query principal, pipeline, bootstrap) + **fallback re-fetch do pipeline se vier null** (caso raro: primeiro GET de org nova — 1 RTT extra, payload idêntico ao atual). Bootstrap dentro do all → rejeição continua indo pro catch da rota (nunca promise fora do all sem await).

**(b) Re-sync fire-and-forget** em `ensureOnboardingBootstrapForRead` (`onboarding-bootstrap.service.ts:526-538`):
- Fast check passa + TTL expirado → `seedSyncAtByOrg.set` ANTES do dispatch (anti-stampede) + `after(() => ensureOnboardingBootstrap(...).catch(log.warn))`.
- Fast check falha (cold start, org sem pipeline) → bootstrap completo **continua síncrono** (o GET precisa das colunas).
- `after()` do `next/server` com precedente confirmado no repo (correção #5). Nunca promise solta (função serverless pode congelar).
- Caller único da função é o GET (verificado por grep); os re-syncs forçados (`onboarding-templates-resync`, `tasks-resync`, `tutorial-pages`, `productivity`) chamam `ensureOnboardingBootstrap` direto e ficam intactos.
- Risco aceito e documentado: janela de eventual consistency pós-deploy que mudou `SEED_COLUMNS` (primeiro GET serve nome/cor/SLA antigos de coluna; auto-corrige no request seguinte — estado que já existe hoje entre deploys).

**(c) `select('*')`: MANTER.** Inventário completo de uso feito (tabela no mapeamento): colunas JSONB não usadas = `briefing_ai_original`, `visual_assets`, `form_sections_completed`; `form_responses`/`briefing` usados só como truthiness (`onboarding-card.tsx:263,269`). Follow-up fora do M5 (mudaria payload). Motivo adicional: drift de schema (`referred_by_name` sem migration) impede provar a lista completa.

## 5.2 Sino de notificações

**(a) `select('*')` em report_jobs: MANTER** — o mesmo handler serve 3 consumidores (sino, `use-report-job`, `tab-jobs`); `progress`/`result` (os pesos) são consumidos pelo tab-jobs. Select por-filtro mudaria o shape do sino. Documentar follow-up.

**(b) Poll com aba oculta: CORTADO** — SWR já não revalida com aba oculta (default `refreshWhenHidden: false`, verificado no pacote instalado). Nenhum código.

## 5.3 `withTiming` em 10 rotas quentes

Diff mecânico idêntico nas 10 (`export async function GET` → `export const GET = withTiming("nome", handleGet)`); todas confirmadas com export function e **nenhuma importada por outro arquivo**:

`dashboard/stores-overview` · `dashboard/total-revenue` (**seguro**: o route.test.ts NÃO importa o handler — reimplementa helpers, admite no header) · `crm/dashboard/sales` · `crm/pipelines` (só GET) · `crm/inbox/threads` · `productivity` (só GET; payload-neutro) · `stores/control` (assinatura `Request` — generic cobre) · `me/tasks` (só GET) · `admin/org-members` (só GET) · `reports`.

## Garantia de payload idêntico (checklist)

1. Capturar antes/depois com cookie de sessão dev: `/api/onboardings`, `/api/reports?status={notifications,all,active}`.
2. `diff` de **bytes** (não só `jq -S`) — manter `'*'` preserva até ordem de chaves.
3. Caso raro 1a: org sem pipeline → primeiro GET já devolve 7 colunas (fallback re-fetch).
4. Caso 1b: TTL expirado → duração do `withTiming("onboardings")` cai; re-sync aparece no log em background.

**Interseção com testes de handler: apenas `dashboard/total-revenue`** (e é cópia stale — seguro). Sequência: (1) withTiming ×10 → baseline; (2) 1b; (3) 1a; (4) comentários 1c/2a/2b; (5) gates + diffs + `smoke-admin` (kanban) + suíte unit (baseline 7 falhas pré-existentes).

---

# M6 — Segunda onda (condicional à telemetria do M5.3)

## 6.1 Cache com tags (`unstable_cache` + `revalidateTag`)

- **Leituras-alvo**: as 5 queries do layout admin + a duplicata integral em `/api/me/permissions/route.ts:12-142` (bônus: consumir a mesma função cacheada elimina ~120 linhas duplicadas).
- **Complicação técnica central**: `createClient()` usa `cookies()` → **proibido dentro de `unstable_cache`**. Exige refactor para `createAdminClient()` (só env vars — funciona) com filtros explícitos reproduzindo a RLS (queries já filtram por id; revisão de segurança obrigatória). O `fetch: no-store` do admin client NÃO impede o cache (unstable_cache memoiza o retorno da função, não o fetch).
- **Pontos de escrita mapeados** (todos com arquivo:linha no mapeamento original): org_members/org_member_roles/agent_store_access concentrados em `admin/org-members/[id]/route.ts`, `admin/store-access/route.ts`, `org-member-invite.service.ts`; projeção de client_stores em ~12 pontos (create/delete/link/rename).
- **3 gaps que são PRÉ-REQUISITOS**:
  1. `profiles.role`/`tags` **não têm rota de escrita no app** (mutados via SQL/Studio) → sem ponto de invalidação; exige `revalidate` de segurança (3600s) ou não cachear profiles.
  2. `settings/team/page.tsx:398` desativa membro **direto do browser** (supabase client) — não há onde chamar revalidateTag; migrar esse write para a rota DELETE existente antes.
  3. Decisão tag fina vs grossa em client_stores (cron de sync muta a tabela várias vezes/dia sem afetar a projeção do layout — tag grossa mataria o hit rate). Recomendação: tag fina nos 12 pontos + revalidate de segurança.
- Desenho: `getCachedPermissions(userId)` com tags `["permissions", "permissions:${userId}", "stores-list"]` + `revalidate: 3600` (TTL de SEGURANÇA, não mecanismo primário — precisão preservada pela invalidação por evento).

## 6.2 Virtualização de kanbans

- Padrão a replicar: `data-table.tsx` (`useVirtualizer` com `VIRTUALIZE_THRESHOLD = 100` — abaixo do limiar, DOM atual intocado = zero risco nos boards pequenos).
- **dnd suporta oficialmente**: `@hello-pangea/dnd` v18 tem `mode="virtual"` + `renderClone` obrigatório (README linha 53: "10,000 items @ 60fps"; validação em `use-validation.ts:75-76`).
- Dificuldade por board: `logs-workspace` (SEM dnd, caso idêntico ao data-table) = **baixa, primeiro alvo**; `productivity-board` (dnd só de grupos; alternativa mais barata: lazy-render de grupos colapsados que já existem) = média; `onboarding-kanban`/`crm kanban-board`/`pipeline-board` (dnd por coluna, cards de altura variável → `measureElement`) = alta.

## 6.3 Timers de 1s → componentes-folha

- **task-detail-drawer.tsx:940-945**: tick dummy re-renderiza o drawer de 2.703 linhas a cada 1s. Solução: mover interval+formatação para dentro do `TimeTracking` (:465-516) trocando prop `spent: string` por dados brutos (`baseSeconds`, `startedAtMs`, `running`, `frozenSec`); pontos :1103/:1370 calculam `timerSec` on-demand no clique.
- **productivity-home.tsx:72-80**: `tickFocus` decrementa `focusTime` no zustand global → home de 2.045 linhas re-renderiza por segundo. Solução: extrair `FocusModeWidget` que se inscreve sozinho (`s => s.focusTime`) e hospeda o interval; a home se inscreve só em `focusRunning`.
- **NÃO mexer** em `productivity-focus.tsx` (rAF local, alvo do e2e `focus-timer`).
- **Contratos dos e2e a preservar** (extraídos dos specs): container `div.justify-between` com texto literal "Time tracking"; primeiro `button` do box = play/pause; `span.font-mono` visível e **avançando em ≤2.5s**; `getByTitle("Play/Pause (Espaco)")` e `getByTitle("Pular fase")`; `start_focus`→`session_id`, `end_focus` com o MESMO session_id + `actual_minutes`, nunca null.

## Ordem interna do M6

1. Pré-requisito: telemetria M5.3 provando o gargalo. 2. Timers (menor risco, e2e prontos como rede). 3. Virtualização: logs-workspace → productivity-board → kanbans dnd. 4. Cache com tags por último (exige refactor admin-client + migração do write client-side + decisão do gap de profiles.role).

---

# Ordem global de execução e matriz de testes

| Fase | Item | Pré-requisito | Gates obrigatórios |
|---|---|---|---|
| 1 | **M4** (7 loading.tsx) | — | lint · typecheck · smoke-admin |
| 1 | **M3** (bundle, 4 passos commitáveis) | — | lint · typecheck · **build antes/depois (diff de chunks)** · suíte unit · smoke-admin · dnd manual pós-optimizePackageImports |
| 2 | **M5.3** (withTiming ×10) | — | suíte unit (total-revenue verde) · smoke-admin · opcional `__payload-debug` |
| 2 | **M1** (waterfalls + React.cache) | — | lint · typecheck · suíte unit · smoke completo · validação manual (4 cenários stores/[id], 2 dashboards, board) |
| 3 | **M5.1** (bootstrap async/paralelo) | M5.3 (medir antes/depois) | diff JSON byte a byte · smoke-admin (kanban) · log do re-sync em bg |
| 4 | **M2** (initialData, 6 passos na ordem: pipelines-redirect → comercial/dashboard → inbox → onboarding → stores → productivity) | M4 (onboarding/inbox) e idealmente M5.1 (TTFB do kanban) | por passo: lint · typecheck · unit · smoke-admin; no passo 6: **focus-timer + __repro-timer + __payload-debug antes/depois** |
| 5 | **M6** (condicional) | telemetria M5.3 | por sub-item (ver seção M6) |

Baseline permanente: 7 falhas pré-existentes em `email-generation-notify.service.test.ts` + `email-task-sync.service.test.ts` (não são regressão). Credenciais e2e em `.env.e2e`; specs de timer exigem `E2E_ADMIN_EMAIL/PASSWORD` e têm efeito colateral (1 registro em `productivity_focus_sessions`, toggle do timer da task fixa).

---

*Gerado em 2026-07-06 por 6 agentes de mapeamento (leitura integral dos arquivos-alvo), consolidado a partir do plano `plano-performance-paginas-admin-2026-07.md`.*
