# Relatório de Performance — Diagnóstico Completo (Julho 2026)

> **Objetivo:** identificar as causas-raiz da lentidão percebida no sistema (carregamento
> inicial, troca de páginas e execução de ações), especialmente no portal do cliente.
> Para cada problema: **o que é**, **como acontece**, **o que impacta**, **onde foi
> encontrado** (arquivo:linha) e **qual é a melhor solução e por quê**.
>
> **Metodologia:** auditoria paralela em 5 frentes — arquitetura geral, data-fetching e
> caching, bundle/hidratação client-side, backend/APIs/banco, e suíte de testes — sobre a
> branch `claude/resume-previous-session-UvATK` em 2026-07-02.

---

## Sumário executivo

| # | Problema | Camada | Impacto | Esforço da correção |
|---|----------|--------|---------|---------------------|
| P1 | Auth client-side no layout do portal (tripla verificação por navegação) | Portal | 🔴 Crítico | Médio |
| P2 | `getUser()` remoto no middleware a cada navegação | Navegação | 🔴 Alto | Baixo |
| P3 | `window.location.href` força full reload (32 usos) | Portal | 🔴 Alto | Baixo |
| P4 | Portal 100% client-side, sem streaming/loading.tsx | Portal | 🔴 Crítico | Alto |
| P5 | Zero cache server-side em todo o sistema | Dados | 🔴 Alto | Médio |
| P6 | Região Vercel × Supabase não configurada (multiplicador) | Infra | 🔴 Potencialmente crítico | Trivial |
| P7 | Cadeias de auth sequenciais no backend (até 5 round-trips antes da query) | API | 🟠 Alto | Baixo |
| P8 | `ensureOnboardingBootstrap` em todo GET do Kanban (~20 round-trips) | API | 🟠 Alto | Baixo |
| P9 | Fan-out de ~10 chamadas com waterfall na tela de loja | Dados | 🟠 Alto | Médio |
| P10 | Sem `SWRConfig` global; fetch manual em 255 arquivos | Dados | 🟠 Médio | Baixo |
| P11 | `select('*')` sem paginação em ~98 rotas | API/DB | 🟠 Médio | Médio |
| P12 | recharts/reactflow estáticos no bundle inicial | Bundle | 🟠 Médio | Baixo |
| P13 | 81% client components + monolitos de 2k–4.4k linhas | Bundle | 🟠 Médio | Alto |
| P14 | Polling agressivo (4s–30s) em toda sessão | Rede | 🟡 Médio | Baixo |
| P15 | `getPermissions` do admin: 4 queries seriais + query sem paginação | Admin | 🟡 Médio | Baixo |
| P16 | Índice ausente em `contracts.client_id`; `unified_invoices` é VIEW | DB | 🟡 Médio | Trivial |
| P17 | Chamadas externas (Shopify/Anthropic) inline no request | API | 🟡 Médio | Médio |
| P18 | SSE com poll de banco a cada 2s por conexão | API | 🟡 Baixo-Médio | Médio |
| P19 | Virtualização ausente em kanbans/listas grandes | UI | 🟡 Médio | Médio |
| P20 | Zero telemetria de duração de request | Observabilidade | 🔴 Bloqueador de decisão | Baixo |
| P21 | Rede de testes insuficiente para refatorar UI/fetching com segurança | Qualidade | 🔴 Bloqueador de execução | Médio |

**Números da base:** 151 páginas (`page.tsx`), 14 layouts, 467 route handlers em
`src/app/api`, 624 arquivos `.tsx` (508 com `"use client"` ≈ 81%), 274 migrations,
~1.658 casos de teste.

---

# PARTE 1 — Navegação e Autenticação (a queixa "troca de página lenta")

## P1 — Autenticação client-side no layout do portal: tripla verificação por navegação

**O que é.** O layout do portal do cliente é um Client Component que refaz a
autenticação **dentro de um `useEffect` com dependência `[pathname]`** — ou seja, roda
de novo a cada troca de rota.

**Como acontece (a mecânica exata).** Uma navegação em `/client/*` executa esta cadeia
sequencial, cada passo esperando o anterior:

1. **Middleware** — `src/lib/supabase/middleware.ts:72`: `supabase.auth.getUser()` →
   requisição de rede ao servidor de auth do Supabase (GoTrue). *Round-trip 1.*
2. **Layout do portal** — `src/app/client/layout.tsx:39-94`: `useEffect` dispara
   `supabase.auth.getUser()` **de novo** no browser. *Round-trip 2.*
3. **Ainda no layout** — `fetch("/api/portal/auth/verify", { method: "POST" })`,
   dependente do resultado do passo 2. *Round-trip 3.*
4. Durante os passos 2–3, o usuário vê um **spinner full-screen "Carregando..."**
   (`src/app/client/layout.tsx:112-121`) — nenhum conteúdo é renderizado.
5. Só então a página monta e começa a buscar os próprios dados (ver P4).

Além disso, o `InvoiceBanner` montado no layout faz mais um fetch no mount
(`src/components/portal/invoice-banner.tsx:48`).

**O que impacta.** 100% das navegações do portal. É a causa mais direta do sintoma
"troca de página lenta pelo lado do cliente": mesmo com tudo cacheado no browser, o
usuário paga 2–3 idas à rede + um spinner **antes de qualquer pixel útil**, em toda
mudança de página.

**Onde encontrei.**
- `src/app/client/layout.tsx:39-94` (useEffect de auth com dep `[pathname]`)
- `src/app/client/layout.tsx:112-121` (spinner bloqueante)
- `src/lib/supabase/middleware.ts:69-72` (getUser no middleware — duplicação)

**Melhor solução e por quê.** Mover a verificação "é usuário do portal?" para o
servidor — ou no próprio middleware (checando um claim/flag no JWT), ou convertendo o
layout do portal para Server Component async que valida e redireciona no servidor,
**exatamente como o admin já faz** (`src/app/admin/layout.tsx:163-168` chama `getUser()`
e `redirect()` server-side, sem flash).

*Por que é a melhor:* (a) elimina 2 dos 3 round-trips e o spinner; (b) o padrão já
existe, testado e funcionando, no admin — é replicação, não invenção; (c) a verificação
no servidor acontece **antes** do HTML ser enviado, então some o "flash de loading";
(d) alternativa rejeitada: cachear o resultado do verify no client (sessionStorage) —
mitigaria, mas manteria a arquitetura errada e o problema do primeiro load.

---

## P2 — `getUser()` remoto no middleware a cada navegação

**O que é.** O middleware roda em toda navegação de página (`/admin/*`, `/client/*`,
`/`, `/login`...) e usa `supabase.auth.getUser()`, que **não valida o JWT localmente**
— faz uma chamada HTTP ao servidor de auth do Supabase para confirmar o token.

**Como acontece.** Next.js executa o middleware antes de qualquer renderização. O
matcher (`src/middleware.ts:34-51`) cobre todas as áreas logadas. Para cada request de
página, `updateSession` chama `getUser()` (`src/lib/supabase/middleware.ts:72`). Isso
adiciona a latência de uma ida ao GoTrue (tipicamente 50–300ms, dependendo de região)
**em série**, antes do Next sequer começar a renderizar a página.

**O que impacta.** Toda navegação de página do sistema inteiro (admin e portal). É um
"pedágio" fixo somado a cada troca de rota.

**Onde encontrei.**
- `src/lib/supabase/middleware.ts:69-72`
- `src/middleware.ts:34-51` (matcher abrangente)

**Melhor solução e por quê.** Validar o JWT **localmente** no middleware usando
verificação assimétrica de assinatura (o Supabase moderno suporta JWT signing keys
assimétricas + `getClaims()`, que verifica a assinatura sem ida à rede). O middleware
passa a: ler o cookie → verificar assinatura/expiração localmente (sub-milissegundo) →
deixar o refresh do token acontecer só quando estiver perto de expirar.

*Por que é a melhor:* (a) remove um round-trip de rede de TODAS as navegações com
mudança mínima de código; (b) mantém a segurança — a assinatura continua sendo
verificada criptograficamente; (c) alternativa rejeitada: remover o middleware — perderia
o redirect de não-autenticado e o refresh de sessão; (d) alternativa rejeitada: cachear o
getUser em memória do middleware — edge/serverless não garante memória compartilhada e
cria janela de sessão inválida aceita.

---

## P3 — `window.location.href` força reload completo da aplicação (32 usos)

**O que é.** Em vez de navegação SPA (`router.push`), o fluxo do cliente usa
atribuição direta a `window.location.href`, que descarta a aplicação carregada e
re-baixa/re-executa/re-hidrata todo o JavaScript.

**Como acontece.** Após o login do cliente, após troca de senha, em falhas de auth do
layout e no menu do usuário, o código faz `window.location.href = "/client/..."`. O
browser trata como navegação de documento completa: novo HTML, novo bundle, nova
hidratação, novo boot de auth (P1) — tudo do zero.

**O que impacta.** Login do cliente (primeira impressão do produto!), troca de senha,
logout — os momentos em que o cliente mais percebe "o sistema é pesado". Cada ocorrência
custa o equivalente a um primeiro carregamento inteiro.

**Onde encontrei.** 32 ocorrências concentradas no fluxo do cliente:
- `src/app/client/login/page.tsx:98,109,117` (pós-login → dashboard via reload total)
- `src/app/client/layout.tsx:53,65,87` (falhas de auth)
- `src/app/client/change-password/*`, `src/components/portal/client-sidebar-user.tsx`
- Contraste: o admin usa `router.push("/admin/dashboard")` (`src/app/(auth)/login/page.tsx:79`) — sem reload.

**Melhor solução e por quê.** Substituir por `router.push()`/`router.replace()` do
`next/navigation`. Nos casos pós-login em que os cookies de sessão precisam ser relidos
pelo servidor, usar `router.refresh()` após o push (re-renderiza os Server Components
sem jogar fora o bundle).

*Por que é a melhor:* preserva o runtime já carregado (navegação em dezenas de ms em vez
de segundos), é mudança mecânica de baixo risco, e o padrão correto já é usado no admin.
*Exceção legítima:* logout pode manter reload completo para garantir limpeza de estado.

---

## P4 — Portal 100% client-side: fetch após hidratação, hop extra de API, sem streaming

**O que é.** As **18 páginas** de `/client/*` são Client Components inteiras. Nenhum
dado é buscado no servidor: tudo acontece via `useEffect`/`fetch` **depois** que o JS
baixa, executa e hidrata. Não existe nenhum `loading.tsx` nem `<Suspense>` na área do
cliente (os 10 `loading.tsx` do projeto são todos do admin).

**Como acontece (dashboard do cliente como exemplo).**
`src/app/client/dashboard/page.tsx`:
1. `useEffect` #1 (linhas 68–91): `fetch("/api/portal/onboarding")` — gate que bloqueia
   a renderização (`onboardingChecked`).
2. `useEffect` #2 (linha 170): `fetchDashboard()` → `fetch("/api/portal/dashboard")`
   (linha 109) — só dispara após o mount, não paralelizado com o gate.
3. `useEffect` #3 (linhas 163–168): auto-retry a cada **5 segundos** refazendo o
   dashboard inteiro enquanto o Shopify está `syncing`.

Somado ao P1, o caminho completo até o conteúdo é: middleware → spinner de auth →
verify → skeleton → onboarding → dashboard = **~5 round-trips sequenciais**, nenhum
começando no servidor. E cada dado passa pelo hop browser → `/api/portal/*` → Supabase,
quando um Server Component poderia consultar o Supabase diretamente.

**O que impacta.** Todo o portal: tempo até conteúdo (LCP) alto, tela em
skeleton/spinner prolongada, sensação de "sistema lento" mesmo quando o backend responde
rápido — porque a sequência é serial e começa tarde (só após hidratação).

**Onde encontrei.**
- Todas as 18 `page.tsx` de `src/app/client/*` com `"use client"` na linha 1
- `src/app/client/dashboard/page.tsx:68-91,93-172` (waterfall descrito)
- Zero `loading.tsx` sob `src/app/client/` (verificado); apenas 13 `<Suspense>` no projeto todo

**Melhor solução e por quê.** Migrar o portal para o padrão do admin: páginas como
**Server Components async** que consultam o Supabase direto (sem hop de `/api`), com
`loading.tsx` por rota e `<Suspense>` para streaming — o servidor envia o shell
imediatamente e os dados fluem conforme resolvem. Interatividade fica em ilhas client
pequenas.

*Por que é a melhor:* (a) o fetch começa **no servidor, imediatamente**, em vez de
esperar download+hidratação do JS; (b) elimina o hop `/api` (o RSC fala com o Supabase
na mesma região); (c) streaming dá percepção de velocidade (conteúdo progressivo em vez
de spinner binário); (d) reduz o bundle (páginas server não embarcam no JS);
(e) alternativa rejeitada: manter client-side e só otimizar os fetches (BFF agregador +
SWR) — melhora, mas nunca elimina o custo estrutural "JS primeiro, dados depois", e o
projeto já demonstra o padrão RSC funcionando no admin. Migração pode (e deve) ser
página a página, começando por dashboard e analytics.

---

# PARTE 2 — Dados e Cache

## P5 — Zero camada de cache em todos os níveis

**O que é.** O sistema não cacheia **nenhuma leitura**, em nenhum nível: sem cache de
RSC, sem cache HTTP, sem cache Redis de dados.

**Como acontece / evidências.**
- `unstable_cache`, `cache()` do React, `revalidateTag`, `revalidatePath`: **0 ocorrências** no projeto.
- `Cache-Control` em rotas de dados: **0** (só existe em 9 rotas não-dados: downloads zip, widget.js, tracking, SSE).
- Upstash Redis: usado **exclusivamente** para rate-limit (`src/lib/rate-limit.ts`); `redis.get/set` como cache = 0.
- `src/lib/supabase/admin.ts:24`: o client admin força `cache: 'no-store'` em todo fetch.
- `export const dynamic = "force-dynamic"` em 42 páginas/layouts e ~272 rotas; `revalidate` real em apenas 2 páginas.

**O que impacta.** Dados que quase nunca mudam — permissões, perfil, lista de lojas,
organização, configurações — são recomputados contra o Supabase **em toda navegação de
todo usuário**. Latência repetida e carga desnecessária no banco. Também anula qualquer
benefício de CDN: toda resposta é dinâmica.

**Onde encontrei.** Buscas exaustivas por `unstable_cache|revalidateTag|Cache-Control`
em `src/`; `src/lib/supabase/admin.ts:24`; contagem de `force-dynamic`.

**Melhor solução e por quê.** Introduzir cache em camadas, começando pelo dado mais
estável: (1) `unstable_cache`/`"use cache"` com tags para leituras quase-estáticas
(permissões, lojas, org) e `revalidateTag` nos pontos de escrita correspondentes;
(2) `Cache-Control: private, max-age=30, stale-while-revalidate=300` nas rotas `/api`
de leitura tolerantes a 30s de atraso; (3) Redis (já contratado!) como cache de
agregações caras (dashboards) com TTL curto.

*Por que é a melhor:* invalidação por tag mantém a correção (cache não fica obsoleto em
mutações), o Redis já está pago e integrado, e cache por camadas permite adotar
incrementalmente sem risco de servir dado errado. *Alternativa rejeitada:* cache
agressivo por tempo em tudo — risco de dados obsoletos em telas operacionais (kanban,
inbox) que exigem frescor.

## P6 — Região Vercel × Supabase não configurada (multiplicador de TODAS as latências)

**O que é.** Nenhuma rota define `preferredRegion` e o `vercel.json` não tem a chave
`regions` (só `crons`). As funções rodam na região default da Vercel (`iad1`,
Washington). Se o projeto Supabase estiver em outra região (ex.: `sa-east-1`, São
Paulo), **cada round-trip de query cruza continentes**.

**Como acontece.** Todo acesso a dados é via HTTP (PostgREST/GoTrue). Uma rota típica
faz 3–20 round-trips **sequenciais** (ver P7/P8). Com funções longe do banco, cada um
custa +100–150ms → uma rota de 10 round-trips paga 1–1,5s só de distância geográfica.

**O que impacta.** TUDO: toda rota de API, todo RSC, todo middleware. É multiplicador
das demais causas — por isso deve ser verificado **primeiro**.

**Onde encontrei.** `preferredRegion`: 0 ocorrências em `src/`; `vercel.json` sem
`regions`; runtime 100% Node.

**Melhor solução e por quê.** Verificar a região do projeto Supabase e fixar a mesma
região (ou a mais próxima) nas funções Vercel (`regions` no `vercel.json`).
É mudança de configuração pura, sem tocar em código, potencialmente o maior ganho
por esforço de todo o relatório. *Por que primeiro:* se as regiões estiverem
desalinhadas, qualquer medição de otimização de código feita antes fica contaminada.

## P7 — Cadeias de autenticação/autorização sequenciais no backend

**O que é.** Os helpers de auth das rotas de API fazem várias queries **em série** antes
da query de negócio, e o `getUser()` remoto (mesmo problema do P2) roda em **348 rotas**.

**Como acontece.**
- `requireAuth` (`src/lib/api/errors.ts:192`) → `getUser()` = 1 round-trip de rede ao GoTrue.
- `requireRole` (`errors.ts:202`) → getUser + query em `profiles` = 2.
- `requireAuth` + `resolveOrgId` (padrão de 79 rotas) = 2.
- `requireStoreAccess` (`src/lib/api/require-store-access.ts:50,71,80,118`) = **4 queries
  sequenciais** (`client_stores` → `profiles` → `org_members` → `agent_store_access`),
  todas independentes entre si, nenhuma em `Promise.all`. Rota store-scoped completa =
  **5 round-trips antes da primeira query útil**.
- Agravante: os helpers criam múltiplas instâncias de `createAdminClient` por request
  (`resolve-org.ts:13`, `require-store-access.ts:47,186`, `require-org-admin.ts:22`).

**O que impacta.** Latência de base de praticamente toda chamada de API que as telas
fazem — e as telas client-side fazem muitas (P4/P9). Com região errada (P6), esses 5
round-trips viram ~750ms de puro overhead de autorização.

**Onde encontrei.** `src/lib/api/errors.ts:192,202`; `src/lib/api/require-store-access.ts:50,71,80,118`;
`src/lib/api/resolve-org.ts:13`; uso de `createAdminClient` em 343/467 rotas.

**Melhor solução e por quê.** (1) Paralelizar os lookups independentes com
`Promise.all` dentro de `requireStoreAccess` (4 round-trips → ~1 de tempo);
(2) substituir a validação remota `getUser()` por verificação local de claims do JWT
nas rotas (mesma técnica do P2) — o `user.id` sai do token verificado, sem rede;
(3) opcionalmente, consolidar perfil+org+acesso numa única RPC/função SQL do Postgres
(1 round-trip em vez de 4).

*Por que é a melhor:* mexe em 2–3 arquivos helper e beneficia centenas de rotas de uma
vez (alavancagem máxima); a RPC é o passo seguinte se a medição (P20) mostrar que ainda
vale. *Alternativa rejeitada:* cachear autorização em memória do processo — serverless
não garante o processo, e autorização obsoleta é risco de segurança.

## P8 — `ensureOnboardingBootstrap` roda em todo GET do Kanban (~20 round-trips)

**O que é.** A rota que alimenta o Kanban de onboarding do admin executa uma rotina de
"bootstrap" (criação/verificação de pipeline e colunas-semente) **em toda leitura**,
incluindo um loop de UPDATEs.

**Como acontece.** `GET /api/onboardings` (`src/app/api/onboardings/route.ts:29-90`)
executa em série: requireAuth (1) → resolveOrgId (2) → `ensureOnboardingBootstrap`
(`src/lib/services/onboarding-bootstrap.service.ts:477`) com ~12 queries, entre elas um
`for (const seed of SEED_COLUMNS)` com **1 UPDATE por coluna** (~7 escritas!) em
`onboarding-bootstrap.service.ts:549-569` → query principal com `select('*')` + 4 joins
aninhados e sem paginação (`route.ts:41`) → `operational_pipelines` (`route.ts:57`) →
`operational_pipeline_columns` (`route.ts:64`) → `resolveEffectiveStatuses` (+3 queries).
**Total: ~20 round-trips sequenciais para abrir a tela.**

**O que impacta.** A tela principal da operação do admin (Kanban de projetos/onboarding)
— abre lenta sempre, e escreve no banco em um caminho de leitura (anti-padrão que ainda
atrapalha réplicas/cache futuros).

**Onde encontrei.** `src/app/api/onboardings/route.ts:29-90`;
`src/lib/services/onboarding-bootstrap.service.ts:477-590` (loop em 549-569).

**Melhor solução e por quê.** (1) Tirar o bootstrap do GET: rodar via migration/seed ou
num endpoint explícito de setup chamado quando uma org é criada; se precisar de
segurança extra, um check barato de 1 query ("pipeline existe?") com early-return;
(2) paralelizar query principal + pipelines + colunas + effective-status com `Promise.all`;
(3) trocar `select('*')` por colunas explícitas.

*Por que é a melhor:* bootstrap é idempotente e raro por natureza — pagar 12 queries em
toda leitura é puro desperdício; a paralelização não muda semântica (queries
independentes); resultado esperado: ~20 round-trips → ~3-4.

## P9 — Fan-out de ~10 chamadas com waterfall na tela de loja

**O que é.** A aba "Visão" do detalhe de loja dispara ~10 requisições `/api` em duas
ondas, porque 8 delas esperam a resposta de `credentials` para decidir suas URLs.

**Como acontece.** `src/components/stores/v2/tab-visao.tsx:125-160`: 9 `useSWR` na
mesma aba; `credentials` (linha 125) resolve → computa `emailPlatformConnected`/
`shopifyConnected` → esses booleans **gateiam** os SWR de report, campaigns, flows,
shopify (linhas 140–154, padrão `connected ? url : null`). Onda 1 (1 request) → Onda 2
(4–8 requests). O wrapper `store-detail-tabs-v2.tsx:110` soma mais 1 (`activity`).

Duplicações: `/api/client-stores/credentials` é buscada de forma independente por
`tab-visao.tsx:125`, `tab-setup.tsx:62` e `tab-performance.tsx:157`;
`/api/client-stores/{id}` por `tab-visao.tsx:133` e `tab-atividade.tsx:77`;
`activity` com URLs diferentes (limit=20 vs limit=5) sem dedupe.

**O que impacta.** Uma das telas mais usadas do admin: latência = credenciais + a mais
lenta das 8 seguintes; e cada troca de aba re-busca dados que outra aba acabou de buscar.

**Onde encontrei.** `src/components/stores/v2/tab-visao.tsx:125-160`;
`tab-setup.tsx:62`; `tab-performance.tsx:157`; `store-detail-tabs-v2.tsx:110`.

**Melhor solução e por quê.** (1) Um endpoint agregador (`GET /api/admin/stores/[id]/overview`)
que resolve credenciais e faz o fan-out **no servidor** com `Promise.all` — o browser
faz 1 request em vez de 10 e o waterfall vira paralelo do lado de baixa latência;
(2) içar os dados compartilhados (credentials, store) para o componente-pai das abas
via um hook único, para as abas consumirem o mesmo cache SWR.

*Por que é a melhor:* o gate por credenciais é lógica de negócio que pertence ao
servidor; agregação server-side elimina N× (latência browser→servidor). *Alternativa
rejeitada:* apenas aumentar dedupe do SWR — resolve a duplicação entre abas, mas não o
waterfall de 2 ondas.

## P10 — Sem `SWRConfig` global; fetch manual espalhado; dedupe de 2s

**O que é.** Não existe `<SWRConfig>` global. **255 arquivos** fazem `fetch("/api/...")`
manual (vs 104 com `useSWR`), cada um redefinindo fetcher e opções à mão; a maioria dos
`useSWR` fica com o `dedupingInterval` default de **2s**, que não deduplica remounts de
abas.

**Como acontece / onde.** Nenhum provider SWR em `src/app/layout.tsx`. Existe uma
camada boa mas subutilizada (`src/lib/hooks/use-api-data.ts`, com `apiFetcher` e
defaults sensatos), usada só para integrações (Klaviyo/Shopify/Asaas). `dedupingInterval`
customizado aparece em ~20 chamadas apenas.

**O que impacta.** Requisições repetidas para os mesmos dados na mesma sessão (ver P9),
comportamento inconsistente de revalidação, e nenhum ponto único para ajustar política
de cache client-side.

**Melhor solução e por quê.** Adicionar `<SWRConfig>` no layout raiz com `apiFetcher`,
`dedupingInterval: 30_000`, `revalidateOnFocus: false`, `keepPreviousData: true` — e
migrar gradualmente os `fetch` manuais de leitura para `useSWR`/hooks de domínio
(`useStore(id)`, `useCredentials(storeId)`). *Por que é a melhor:* uma mudança de ~10
linhas melhora imediatamente os 104 usos existentes de `useSWR`; hooks de domínio
eliminam a duplicação estrutural. *Nota:* isso complementa (não substitui) a migração
RSC do P4 — SWR continua certo para dados interativos/polling.

## P11 — `select('*')` sem paginação em ~98 rotas

**O que é.** 98 arquivos de rota usam `.select('*')`; apenas **6** usam `.range()`
(paginação real). Muitas rotas de lista retornam a coleção inteira com joins aninhados.

**Como acontece / onde.**
- `GET /api/onboardings` (`route.ts:41`): `select('*')` + joins de `clients`,
  `client_stores`, `operational_pipeline_columns` (inteira) e **todas as tasks** de cada
  onboarding, sem paginação.
- `clients/manage`, `clients/contracts`, `clients/search`, `client-stores`: `select('*')`.
- `client-stores/credentials/route.ts`: 4× `select('*')` retornando colunas
  pesadas/sensíveis.
- Admin clients (RSC) puxa `clients + contracts + owner + client_stores` num `*` único.

**O que impacta.** Payloads grandes = queries mais lentas no Postgres, mais bytes na
rede, mais tempo de parse no client — cresce linearmente com a base de clientes (fica
pior a cada mês).

**Melhor solução e por quê.** Nas rotas das telas principais: colunas explícitas no
`select` + `.range()` com paginação server-side (o padrão já existe em
`src/app/admin/clients/page.tsx`, PAGE_SIZE=50 + counts com `head:true`). *Por que:*
é a única solução que escala com o crescimento da base; colunas explícitas também
evitam vazar campos sensíveis (credenciais).

---

# PARTE 3 — Bundle e Hidratação

## P12 — recharts e reactflow estáticos no bundle inicial de rotas

**O que é.** Bibliotecas pesadas de visualização entram no JavaScript inicial de
algumas rotas por serem importadas estaticamente no topo de componentes client.

**Onde encontrei.**
- recharts estático: `src/app/client/analytics/page.tsx:29` (página client de 783
  linhas), `src/app/admin/operacional/reports/page.tsx:16`,
  `src/app/admin/comercial/reports/page.tsx:16`,
  `src/components/clients/client-financial.tsx:13` (2.282 linhas).
- reactflow estático: `src/components/crm/automation-builder.tsx:17`, consumido sem
  dynamic em `src/app/admin/operacional/automacoes/[id]/page.tsx:8`.
- **O padrão correto já existe no projeto**: `src/components/dashboard/dashboard-layout.tsx:16-40`
  usa `React.lazy` para 9 seções de charts; `src/app/admin/automations/new/page.tsx:22`
  carrega o builder com `next/dynamic` + `ssr:false` + skeleton.

**O que impacta.** Download, parse e hidratação maiores no primeiro acesso a essas
rotas — inclusive `client/analytics`, que é área do cliente final.

**Melhor solução e por quê.** Replicar o padrão que o próprio projeto já usa:
`next/dynamic`/`React.lazy` com skeleton para os componentes de chart/builder. *Por
que:* risco quase zero (padrão comprovado internamente), ganho imediato de bundle nas
rotas afetadas. Complemento: verificar `optimizePackageImports` para libs fora da lista
default do Next 15 (reactflow, @hello-pangea/dnd, react-markdown).

## P13 — 81% de client components e monolitos de 2.000–4.400 linhas

**O que é.** 508 dos 624 `.tsx` têm `"use client"`; 70 das 151 páginas são client
inteiras. Os maiores componentes são monolitos client:

| Linhas | Arquivo |
|---|---|
| 4.366 | `src/components/stores/producao/email-detail-view.tsx` |
| 3.009 | `src/components/onboarding-v2/form-tela1-client.tsx` |
| 2.914 | `src/components/stores/producao/brand-resource-view.tsx` |
| 2.635 | `src/components/crm/deal-drawer.tsx` |
| 2.577 | `src/components/productivity/task-detail-drawer.tsx` |
| 2.365 | `src/app/admin/comercial/forms/[id]/page.tsx` |
| 2.282 | `src/components/clients/client-financial.tsx` |

**Como acontece / agravante.** Um `setState` no topo de um monolito re-renderiza a
árvore inteira. Vários têm **timers de 1 segundo** dentro
(`diagnostic-modal.tsx:143`, `task-detail-drawer.tsx:914`, `productivity-home.tsx:75`)
→ re-render do monolito **a cada segundo** enquanto aberto.

**O que impacta.** Hidratação lenta na abertura, interações que "engasgam" (digitar,
arrastar), consumo de CPU contínuo com os timers.

**Melhor solução e por quê.** (1) Isolar os timers em componentes-folha minúsculos
(um `<ElapsedTime>` que re-renderiza sozinho); (2) quebrar os monolitos por seção com
`memo` nas fronteiras; (3) nas páginas client que só leem dados, converter o casco para
RSC e manter ilhas client. *Por que nessa ordem:* isolar timers é cirúrgico e resolve o
sintoma de CPU já; a quebra completa é investimento maior e deve ser guiada por medição
(React Profiler) e protegida por testes (P21).

## P14 — Polling agressivo mantendo rede/CPU ocupadas a sessão inteira

**O que é / onde.**
- `src/components/layout/header.tsx:117` e `mobile-top-bar.tsx:55`: fetch de
  notificações a cada **30s em toda página logada**.
- `campaign-copy-handoff.tsx:161` e `campaign-image-handoff.tsx:222`: poll a cada **4s**.
- Dashboard do cliente: retry a cada **5s** refazendo o dashboard inteiro durante sync
  (`client/dashboard/page.tsx:163-168`).
- ~20 `setInterval` no total + `refreshInterval` SWR de 5–15s em inbox/reports.
- Hooks `use-realtime-*` fazem polling **em paralelo** ao canal realtime do Supabase.

**O que impacta.** Requisições competindo com a navegação, re-renders periódicos,
bateria/CPU — e cada poll paga o pedágio de auth do P7.

**Melhor solução e por quê.** Padronizar em cima do que já existe: o projeto já usa
Supabase Realtime e SSE — notificações e status de jobs devem ser push, não poll; onde
poll for inevitável, centralizar via `refreshInterval` do SWR com backoff e pausa quando
a aba está oculta (`document.visibilityState`). *Por que:* elimina a maior parte do
tráfego de fundo sem perder atualização em tempo real.

## P15 — `getPermissions` do admin: cascata sequencial + query sem paginação

**O que é.** O layout do admin (RSC, padrão correto) tem duas ineficiências: queries em
série e uma query que cresce com a base.

**Como acontece / onde.** `src/app/admin/layout.tsx:17-156`: `profiles` → `org_members`
→ `org_member_roles` → `client_stores` **sequenciais**; para admin/dev, busca **todas**
as `client_stores` ativas com join aninhado de `clients` (`layout.tsx:83-106`), sem
paginação; e `profiles` é buscado 2× (linha 171 e de novo dentro de `getPermissions`
na linha 22). Roda em **toda página admin**.

**Melhor solução e por quê.** `Promise.all` nos independentes; passar o `profiles` já
buscado como parâmetro; para admin/dev, não materializar a lista de lojas no layout
(um flag `hasAllAccess` basta — a lista é responsabilidade das telas, paginada). Depois,
cachear o resultado com `unstable_cache` por usuário + `revalidateTag` em mudanças de
permissão (P5). *Por que:* é o custo fixo de TODAS as páginas admin; reduzir aqui
melhora tudo.

## P19 — Virtualização ausente em kanbans e listas grandes

**O que é.** `@tanstack/react-virtual` está instalado, mas é usado em **um único
lugar** (`src/components/ui/data-table.tsx:4`). Kanbans e listas grandes renderizam
todos os itens no DOM.

**Onde encontrei.** `onboarding-kanban.tsx` (1.801 linhas), `productivity-board.tsx`,
`logs-workspace.tsx` (1.825 linhas), boards de campanha — nenhum virtualizado.

**O que impacta.** Telas de board/lista ficam mais lentas conforme o volume de dados
cresce: mais nós no DOM = render inicial, re-render e scroll mais caros. Combina mal
com P11 (rotas que retornam a coleção inteira).

**Melhor solução e por quê.** Aplicar o `useVirtualizer` (já instalado e já usado no
`data-table`) nas colunas de kanban e listas com mais de ~50 itens, renderizando só o
visível. *Por que:* a dependência e o padrão interno já existem; junto com a paginação
server-side (P11), mantém as telas com custo constante independentemente do tamanho da
base.

---

# PARTE 4 — Banco e Integrações

## P16 — Índice ausente em `contracts.client_id`; `unified_invoices` é VIEW no caminho quente

**O que é / onde.** Nas 274 migrations há 580 índices (cobertura geral boa — `store_id`
e afins bem cobertos), mas: **`contracts` não tem índice em `client_id`**, e é
consultada com `.in('client_id', ...)` + `.order('start_date')` no caminho do Kanban
(`src/lib/services/onboarding-effective-status.service.ts:186-190`) — provável seq scan.
**`unified_invoices`** é uma VIEW (`supabase/migrations/20260307_unified_invoices_view.sql`)
consultada com `.in('client_id')` no mesmo caminho (`:118`) — a performance depende do
plano das tabelas subjacentes.

**Melhor solução e por quê.** Migration com `CREATE INDEX ON contracts (client_id, start_date)`
— trivial, sem risco, ganho direto no Kanban. Para a view, rodar `EXPLAIN ANALYZE` na
query real (via Supabase) e indexar as tabelas-base conforme o plano; se continuar
cara, materializar o resultado no snapshot diário que já existe no projeto.

## P17 — Chamadas externas síncronas dentro do request-response

**O que é.** A arquitetura geral é correta (Shopify/Klaviyo/Omnisend vão para cron que
popula tabelas de cache, e as telas leem do cache), mas restam exceções onde o usuário
espera uma API externa responder:

- **Shopify inline**: `src/app/api/clients/[id]/performance/route.ts:412` chama
  `getShopifyReportForStore` por loja dentro de loop (concorrência 2, `maxDuration=30`).
- **Anthropic inline**: `ai/chat/route.ts` (`maxDuration=120`),
  `admin/campaign-central/suggestions/[id]/generate-*`,
  `acompanhamento/pipeline/[stateId]/generate-message` (`maxDuration=60`).

**O que impacta.** Telas que travam por segundos (até timeout) na dependência de
terceiros; funções serverless longas custam mais.

**Melhor solução e por quê.** Para o performance de clientes: cair 100% no padrão
cache-first que a própria rota já usa em parte (comentário "pure cache read" em
`route.ts:43-70`), com o refresh do Shopify sempre via job. Para IA interativa (chat),
streaming é aceitável e esperado; para geração de conteúdo, padrão job + poll/SSE que o
projeto já usa no pipeline de emails. *Por que:* consistência com a arquitetura que o
projeto já escolheu (cron + cache tables) — as exceções são dívida, não design.

## P18 — SSE do email workspace: poll de banco a cada 2s por conexão

**O que é / onde.** `src/app/api/sse/stores/[id]/emails/route.ts:31`
(`POLL_INTERVAL_MS = 2_000`): cada admin com o workspace aberto gera uma conexão SSE
que consulta o banco a cada 2s. A tabela é indexada (`idx_ese_store_recent`), mas a
carga escala com o número de conexões abertas.

**Melhor solução e por quê.** Trocar o poll interno por escuta real:
Supabase Realtime na tabela `email_status_events` (o trigger
`fn_log_email_status_change` já grava os eventos — a infraestrutura de push já existe)
ou LISTEN/NOTIFY. O SSE passa a repassar eventos em vez de perguntar. *Por que:* remove
carga contínua de banco proporcional a usuários abertos; baixa urgência (afeta admins,
não clientes), mas entra no plano.

---

# PARTE 5 — Observabilidade e Segurança de Refatoração

## P20 — Zero telemetria de duração: otimização às cegas

**O que é.** Não existe nenhuma medição de duração de request: `src/lib/logger.ts` não
tem timing, não há `instrumentation.ts`, nenhum wrapper de rota mede, e não há Speed
Insights/Web Vitals nas páginas.

**O que impacta.** É impossível (a) confirmar quais rotas são lentas em produção,
(b) priorizar com dados, (c) provar que uma otimização funcionou. **Este relatório
aponta as causas estruturais; a telemetria é o que valida e ordena o ataque.**

**Melhor solução e por quê.** (1) Wrapper `withTiming` nos handlers `/api` (ou
`instrumentation.ts`) logando rota+status+duração — ~1 arquivo, aplicado nos helpers já
centralizados; (2) `@vercel/speed-insights` para Web Vitals reais (LCP/INP/TTFB) por
página; (3) dashboards do Supabase para query time. *Por que primeiro:* toda decisão
das outras fases deve ser medida antes/depois; sem isso, o risco é otimizar o que não
dói.

## P21 — Rede de testes insuficiente para refatorar UI/data-fetching com segurança

**O que é.** A suíte existente é boa onde existe: **~1.658 casos** em 126 arquivos,
determinísticos, bem mockados (66 com `vi.mock`, 62 mockam Supabase), cobrindo
`lib/services` (33 arquivos), `lib/agents` (28), integrações, permissões. CI sólido
(lint + typecheck + vitest + build em toda PR). **Mas:**

- **0 testes de componente/DOM** — `@testing-library`/`jsdom` nem instalados; vitest em
  `environment: node` (`vitest.config.ts`); os 5 "testes de componente" testam apenas
  funções puras exportadas.
- **447 das 467 rotas de API sem teste** (~4% cobertas) — incluindo dashboards, stores,
  CRM, portal.
- **0 E2E/smoke** — sem Playwright/Cypress; o único "smoke" é o `next build`.
- Coverage exclui deliberadamente `src/components/**` e `src/hooks/**`.

**O que impacta.** Exatamente as camadas que a refatoração de performance vai tocar
(layouts, páginas, hooks de fetch, rotas de dados) não têm proteção: uma regressão de
"dados errados na tela" ou "loading quebrado" **passa verde no CI**.

**Melhor solução e por quê.** Antes de refatorar: (1) **Playwright com smoke E2E** dos
fluxos críticos — login cliente → dashboard, login admin → kanban, store detail →
abas — porque E2E é o único teste que sobrevive a uma mudança de arquitetura
(client→server) sem reescrita, validando o comportamento, não a implementação;
(2) `@testing-library/react` + `jsdom` para as telas que forem sendo migradas;
(3) testes de contrato (shape do JSON) para as rotas que as telas consomem, para o
refactor de rotas não quebrar consumidores silenciosamente. *Por que E2E primeiro:*
testes unitários de UI acoplados à implementação atual seriam jogados fora na migração;
o smoke E2E protege a migração inteira.

---

# Mapa sintoma → causa

| Sintoma relatado | Causas responsáveis |
|---|---|
| Troca de páginas lenta (cliente) | **P1** (tripla auth + spinner) + **P2** (getUser no middleware) + **P4** (fetch só após hidratação) + P6 |
| Carregamento inicial lento | **P4** + **P13** (bundle/hidratação) + P12 + P3 (reload total pós-login) |
| Execução/ações lentas | **P7** (pedágio de auth por chamada) + **P6** (região) + P5 (nada cacheado) + P11 (payloads) |
| Telas admin pesadas | **P8** (Kanban ~20 RTs) + P15 + P9 + P19 |
| Sensação de "recarrega tudo" | **P3** (`window.location.href` ×32) |

# O que está BOM (não mexer / usar como referência)

- **Admin layout** com auth server-side (`src/app/admin/layout.tsx`) — é o template da migração do portal.
- **Nenhum vazamento server→client**: SDKs de IA, sharp, resend isolados em `api/`/`lib`; client usa `import type`.
- lucide-react 100% named imports; fontes via `next/font`; html2pdf/jszip/xlsx corretamente isolados.
- Padrão cron + tabelas de cache para integrações externas (Shopify/Klaviyo).
- Zustand enxuto, sem hidratação gigante no boot; contexts sem `value={{...}}` inline.
- 580 índices no banco (cobertura geral boa); suíte de ~1.658 testes sólida na camada de lógica; CI completo.

# Plano de execução recomendado

**Fase 0 — Enxergar e proteger (pré-requisito)**
1. Verificar/fixar região Vercel × Supabase (P6) — config pura, possível maior ganho unitário.
2. Telemetria de duração + Speed Insights (P20) — baseline para medir tudo.
3. Playwright smoke E2E dos fluxos críticos (P21).

**Fase 1 — Quick wins (dias, risco baixo)**
4. Matar a tripla auth do portal (P1) e validar JWT localmente no middleware (P2).
5. `router.push` no lugar de `window.location.href` (P3).
6. Bootstrap fora do GET + `Promise.all` no Kanban (P8).
7. `Promise.all` em `requireStoreAccess`/`getPermissions` (P7, P15).
8. `next/dynamic` para recharts/reactflow (P12).
9. `<SWRConfig>` global (P10). Índice em `contracts.client_id` (P16).

**Fase 2 — Migração estrutural (semanas, risco médio — protegida pela Fase 0)**
10. Portal página a página para RSC + streaming (P4), começando por dashboard/analytics.
11. Endpoint agregador da tela de loja (P9).
12. Colunas explícitas + paginação nas rotas de lista (P11).

**Fase 3 — Cache e peso (contínuo)**
13. Camada de cache com tags + Redis (P5).
14. Quebrar monolitos / isolar timers / virtualizar listas (P13, P19).
15. Polling → push (P14, P18); externas inline → job (P17).

**Regra de ouro:** cada mudança medida antes/depois (Fase 0.2), coberta por smoke E2E
(Fase 0.3), em PR pequeno e reversível.

---

*Gerado em 2026-07-02 a partir de auditoria multi-agente (5 frentes) do código na
branch `claude/resume-previous-session-UvATK`.*
