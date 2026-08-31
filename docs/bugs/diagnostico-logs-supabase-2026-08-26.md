# Diagnóstico — logs do Supabase, 26/08/2026 (00:00–00:59 UTC)

**Fonte:** export `supabase_logs_4.csv` do projeto `ppygkfeffknypfncsnlv` (admin convertfy),
183 eventos de uma hora. Cada erro foi rastreado até a linha de código e conferido contra o
schema real do banco em 31/08/2026.

## Resumo executivo

São **sete causas distintas**, não ruído aleatório. A leitura que importa:

- **65% do volume vem de um cron que reporta sucesso.** A tabela que ele consulta não existe, o
  `error` é descartado no destructuring, e a resposta é `200 {idle:true}` a cada minuto.
- **Três achados custam funcionalidade em silêncio.** Histórico de saúde do cliente (8.343 linhas
  no banco) nunca chega à tela; comentários de produtividade nunca carregam; a importação de
  histórico do WhatsApp está morta desde que foi escrita.
- **Nenhum dispara alerta hoje.** Todos degradam para lista vazia, `data: null` ou `error`
  ignorado. É o mesmo padrão de falha três vezes — ver a seção final.

| # | Achado | Eventos | Severidade |
|---|---|---|---|
| 1 | `crm_history_import_jobs` não existe — migration não aplicada | 120 | **Alta** |
| 2 | `crm_health_history.created_at` não existe (é `computed_at`) | 10 | **Alta** |
| 3 | Embed `productivity_comments → profiles` sem FK | 6 | **Média** |
| 4 | `.single()` onde zero linha é normal | 35 | Baixa (ruído) |
| 5 | `tutorial_pages` 406 no upsert idempotente | 8 | Nenhuma (esperado) |
| 6 | `avatar_url` aponta para `.png`; o arquivo é `.jpg` | 3 | Baixa |
| 7 | Realtime `Disconnecting broadcast changes handler` | 1 | Nenhuma |
| | **Total** | **183** | |

Contagem bruta por rota, como sai do CSV:

| Status | Método | Rota | Eventos |
|---|---|---|---|
| 404 | GET | `/rest/v1/crm_history_import_jobs` | 120 |
| 406 | GET | `/rest/v1/store_onboarding_data` | 17 |
| 406 | GET | `/rest/v1/store_briefings` | 17 |
| 406 | POST | `/rest/v1/tutorial_pages` | 8 |
| 400 | GET | `/rest/v1/productivity_comments` | 6 |
| 42703 | — | Postgres | 5 |
| 400 | GET | `/rest/v1/crm_health_history` | 5 |
| 200 | — | storage (2) + realtime (1) | 3 |
| 406 | GET | `/rest/v1/onboardings` | 1 |
| 400 | GET | `/storage/v1/object/public/avatars/…` | 1 |

---

## 1. Importação de histórico do WhatsApp está morta — e o cron reporta sucesso

**120 de 183 eventos (65%)** · `404 GET /rest/v1/crm_history_import_jobs`, duas por minuto:
uma com `status=eq.pending`, outra com `status=eq.running&last_progress_at=lt.…`

### O quê
A tabela `crm_history_import_jobs` **não existe no banco**. Confirmado:
`information_schema.tables` no schema `public` só devolve `figma_import_jobs` para o padrão
`%import_job%`.

### Por quê
A migration `supabase/migrations/20261065_whatsapp_history_import.sql` nunca foi aplicada em
produção. Existem **duas migrations com o prefixo `20261065`**:

```
20261065_email_blocks_sao_o_schema.sql      ← aplicada
20261065_whatsapp_history_import.sql        ← NÃO aplicada
```

A colisão de numeração é a explicação mais provável: uma ferramenta que resolve o estado por
prefixo/timestamp vê o `20261065` como já aplicado e pula a segunda.

O que transforma isso em falha invisível é o claim do job —
`src/lib/services/crm-history-import.service.ts:106` e `:119`:

```ts
const { data: pending } = await admin        // ← o `error` não é lido
  .from("crm_history_import_jobs")
  .select("id")
  .eq("status", "pending")
  …
  .maybeSingle<{ id: string }>()

if (pending) { … }
```

Sem tabela, o PostgREST responde 404, `data` vem `null`, `pending` é falsy — e isso é
indistinguível de "não há fila". O cron `/api/cron/crm-history-import` (schedule `* * * * *` em
`vercel.json`) responde `200 {success:true, idle:true}` e segue a vida.

### Como resolver
1. Aplicar a migration (SQL na seção **Para aplicar no banco**). Ela é aditiva: `CREATE TABLE
   IF NOT EXISTS crm_history_import_jobs`, três índices, um trigger de `updated_at`, RLS +
   policy, mais `ALTER TABLE crm_messages ADD COLUMN is_historical` e a função de reconciliação
   de timestamps das threads.
2. Renumerar uma das duas migrations `20261065` para a próxima não colidir.
3. Ler o `error` no claim e logar — a correção que impede o próximo problema de schema de se
   esconder do mesmo jeito:

```ts
const { data: pending, error } = await admin…
if (error) { log.error("claim falhou", { error }); throw error }
```

### Implicações
- Quem pedir importação de histórico pelo painel de canais não recebe nada e **não vê erro**.
- Some 65% do volume de erro do projeto. Enquanto estiver aí, qualquer monitoria por taxa de
  erro está cega para incidentes reais — 4.400 eventos/dia de um alarme que não significa nada.
- O cron ocupa um slot por minuto para não fazer nada.

---

## 2. Histórico de saúde do cliente nunca aparece — a coluna do `order` não existe

**10 eventos:** 5 × `400 GET /rest/v1/crm_health_history` + 5 × erro Postgres `42703`
`column crm_health_history.created_at does not exist`

### O quê
A tabela tem `computed_at`. As duas rotas que a consultam pedem `created_at` — no `select` **e**
no `order`:

- `src/app/api/admin/stores/[id]/overview/route.ts:71-75`
- `src/app/api/admin/stores/[id]/health-history/route.ts:36-40`

```ts
.from("crm_health_history")
.select("health_score, components, created_at")   // ← não existe
.eq("store_id", storeId)
.order("created_at", { ascending: false })        // ← não existe
```

Colunas reais: `id`, `store_id`, `health_score`, `components`, `computed_at`. Quem escreve é
`src/lib/services/crm-health.service.ts:272`, que insere sem informar a data — o default da
coluna preenche `computed_at`.

### Por quê
Renomeação de coluna (ou divergência entre a migration e o código) que passou porque **as duas
rotas engolem o erro**:

```ts
healthHistory: healthRes.error ? [] : (healthRes.data ?? []),   // overview:126
```

```ts
if (error) {
  // Se a tabela nao existe ainda em ambientes legados, devolve vazio
  // ao inves de 500 pra UI nao quebrar.
  return successResponse(request, { history: [] })              // health-history:45
}
```

O fallback foi escrito para cobrir *tabela ausente* e acabou cobrindo *query inválida*. São
coisas diferentes: a primeira é ambiente legado, a segunda é bug.

### Como resolver
Alias no `select`, coluna real no `order` — assim o contrato da API não muda:

```ts
.select("health_score, components, created_at:computed_at")
.order("computed_at", { ascending: false })
```

O alias é obrigatório: `StoreOverviewHealthRow` (`src/lib/hooks/use-store-overview.ts:25-29`) e
`HealthHistoryRow` (`src/components/stores/v2/tab-visao.tsx:76`) esperam `created_at`. Trocar só
o backend quebraria o front.

Recomendado junto: estreitar o fallback para só cobrir `42P01` (tabela ausente) e deixar o resto
falhar visivelmente.

### Implicações
- **A tabela tem 8.343 linhas.** O score de saúde, o delta contra o período anterior
  (`latestHealth`/`prevHealth` em `tab-visao.tsx:133-134`) e a sparkline estão vazios na tela
  desde que esse código existe. O cron `crm-health-compute` roda todo dia às 05h10 e escreve
  dados que ninguém lê.
- É um recurso de produto pago que parece "ainda não ter dado" para quem olha.

---

## 3. Comentários de produtividade nunca carregam — embed sem FK

**6 eventos** · `400 GET /rest/v1/productivity_comments?select=*,profiles(name,avatar_url)`

### O quê
`src/app/api/productivity/route.ts:135-138` pede o embed de `profiles`:

```ts
.from("productivity_comments")
.select("*, profiles(name, avatar_url)")
```

`productivity_comments` **não tem FK para `profiles`**. A única FK da tabela é
`task_id → productivity_tasks`. O autor está em `user_id`, coluna solta. O PostgREST não
consegue inferir a relação e recusa a query (PGRST200).

O contraste está sete linhas acima, no mesmo `Promise.all` — `org_members` faz o mesmo embed e
funciona, porque tem FK `profile_id → profiles`:

```ts
.from("org_members")
.select("id, profile_id, profiles(name, avatar_url)")   // :130 — funciona
```

### Por quê
O embed foi escrito assumindo uma FK que a migration da tabela não criou.

### Como resolver
Duas saídas — a primeira é a que o código já pressupõe:

**(a) criar a FK** (migration nova; SQL na seção final):
```sql
ALTER TABLE productivity_comments
  ADD CONSTRAINT productivity_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
```
Cuidado: se houver `user_id` órfão a constraint falha — a tabela hoje tem **0 linhas**, então a
janela para fazer isso sem dor é agora.

**(b) parar de embutir** e resolver os autores numa segunda query, ou nomear a constraint
explicitamente como faz `/api/crm/deals/[id]/files`
(`uploader:profiles!crm_deal_files_uploaded_by_fkey (…)`).

### Implicações
- O resultado vira `(commentsRes.data || [])` na linha 594: **lista vazia, sem erro**.
- A tabela está zerada, então ninguém notou. No dia em que alguém comentar, o comentário grava
  no banco e **some da tela** — o formato de bug mais caro de depurar depois, porque o dado
  existe e a tela mente.
- O `POST` de comentário (linha 911) funciona normalmente: só a leitura está quebrada.

---

## 4. `.single()` onde a ausência é normal

**35 eventos** · `store_onboarding_data` (17), `store_briefings` (17), `onboardings` (1) — todos
`406`

### O quê
`src/app/admin/stores/[id]/page.tsx` usa `.single()` em três consultas (linhas 118, 128 e 135)
que legitimamente podem não ter linha nenhuma: loja sem formulário preenchido, sem briefing
`current`, sem onboarding `in_progress`.

`.single()` exige exatamente uma linha. Com zero, o PostgREST responde **406** (PGRST116).

Na mesma função, a consulta de receita logo acima já usa `.maybeSingle()` — a inconsistência é
interna ao arquivo.

### Por quê
`.single()` é o default mental de quem espera um registro; `.maybeSingle()` é o correto quando
"nenhum" é um estado válido do negócio.

### Como resolver
Trocar as três por `.maybeSingle()`. O resto do código não muda: ele já lê apenas `.data`
(`onboardingDataRes.data`, `briefingRes.data`, `onboardingRes.data`).

### Implicações
- **Não quebra nada hoje** — a página renderiza certo, com os campos como `false`/`null`.
- Mas o `error` nunca é inspecionado nessas três chamadas. Uma falha real (RLS mudada, coluna
  renomeada, tabela fora do ar) ficaria exatamente tão invisível quanto este ruído.
- São 35 eventos por hora treinando quem olha o log a ignorar 406 — e o achado 5 é um 406 que
  de fato deve ser ignorado. Misturar os dois é como o próximo incidente passa batido.

---

## 5. `tutorial_pages` 406 — esperado, não mexer

**8 eventos** · `406 POST /rest/v1/tutorial_pages?on_conflict=org_id,slug&select=id`

### O quê
`src/lib/services/onboarding-bootstrap.service.ts:673-688` faz upsert idempotente:

```ts
.upsert({ … }, { onConflict: "org_id,slug", ignoreDuplicates: true })
.select("id")
.maybeSingle()
```

Quando a linha já existe, o `ON CONFLICT DO NOTHING` não retorna nada; o PostgREST responde 406
e o supabase-js converte em `data: null` **sem erro**. O código trata isso explicitamente: se
veio `id`, semeia os blocos default; se não veio, relê a linha existente (`else`, linha 706).

### Por quê
É o desenho pretendido, e está comentado no próprio código: o bootstrap roda em caminhos
concorrentes para a mesma org (request síncrono + re-sync em background via `after()`), e o
antigo SELECT-depois-INSERT estourava `23505` em `tutorial_pages_org_id_slug_key`. O
`ON CONFLICT DO NOTHING` resolve a corrida.

### Como resolver
**Nada.** Este achado está no catálogo justamente para não ser "consertado". Trocar por
SELECT-depois-INSERT para calar o 406 reintroduz a corrida que já foi corrigida uma vez.

### Implicações
Ruído benigno, 8 eventos/hora. Se incomodar no dashboard, o caminho é filtrar `tutorial_pages`
no alerta — não mudar o código.

---

## 6. Avatar quebrado — o perfil aponta para `.png`, o arquivo é `.jpg`

**3 eventos** · 1 × `400 GET /storage/v1/object/public/avatars/62decdad-…/avatar.png` +
2 linhas de log do storage (`/object/info/public/…`)

### O quê
| | |
|---|---|
| `profiles.avatar_url` | `…/storage/v1/object/public/avatars/62decdad-…/avatar.png` |
| Objeto real no bucket | `62decdad-…/avatar.jpg` — `image/jpeg`, 46.011 bytes, criado em 01/03/2026 |

O bucket `avatars` é público e tem **um único objeto**, o `.jpg`. O `.png` referenciado no
perfil não existe.

### Por quê
A rota atual está correta: `src/app/api/settings/avatar/route.ts:46-85` remove as outras
extensões, faz upload e atualiza o `avatar_url` na mesma execução — não é ela que produz esse
estado. A divergência é histórica. O suspeito principal é upload pelo portal
(`/api/portal/settings/avatar`), que grava em `client_portal_users` e **não toca em
`profiles`**; um `.jpg` enviado por lá sobre um `.png` antigo deixa exatamente este par.

### Como resolver
`UPDATE` de uma linha (SQL na seção final), ou pedir ao usuário que reenvie a foto pelo painel.

Endurecimento opcional: `onError` no `<img>` do avatar caindo para as iniciais — hoje uma URL
morta deixa o espaço quebrado e gera um 400 a cada render.

### Implicações
Um usuário com avatar quebrado e um 400 por render de tela dele. Se o palpite do portal estiver
certo, o problema volta no próximo upload por lá — vale conferir se as duas rotas deveriam
sincronizar `profiles.avatar_url` e `client_portal_users.avatar_url`.

---

## 7. Realtime — `Disconnecting broadcast changes handler in the step : :streaming`

**1 evento**, `warning`, status 200.

Desconexão normal de canal realtime (aba fechada, navegação, reconexão). Não é erro. Está no
catálogo para não virar caça-fantasma na próxima leitura de log.

---

## Para aplicar no banco

**Nada disto foi executado.** São os três comandos que fecham os achados 1, 3 e 6, em ordem de
impacto.

### 1. Migration do histórico do WhatsApp (achado 1 — mata 65% do ruído)

Aplicar `supabase/migrations/20261065_whatsapp_history_import.sql` inteira. É aditiva e
idempotente (`IF NOT EXISTS` em tabela e índices).

```bash
# via CLI, contra o projeto de produção
supabase db push --db-url "$SUPABASE_DB_URL"

# ou, direto:
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261065_whatsapp_history_import.sql
```

Ou colar o conteúdo no SQL Editor do Studio. Conferir depois:

```sql
select count(*) from crm_history_import_jobs;                      -- 0, sem erro
select column_name from information_schema.columns
 where table_name = 'crm_messages' and column_name = 'is_historical';
```

Renomear uma das duas migrations `20261065_*` na sequência, para a colisão não se repetir.

### 2. FK dos comentários de produtividade (achado 3 — opção (a))

A tabela está vazia hoje; é a janela sem dor. Conferir antes, por segurança:

```sql
-- deve retornar 0
select count(*) from productivity_comments c
 where c.user_id is not null
   and not exists (select 1 from profiles p where p.id = c.user_id);

alter table productivity_comments
  add constraint productivity_comments_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;
```

Depois disso o embed `profiles(name, avatar_url)` passa a resolver sozinho — o PostgREST
recarrega o schema cache automaticamente.

### 3. Avatar divergente (achado 6 — uma linha)

```sql
update profiles
   set avatar_url = replace(avatar_url, '/avatar.png', '/avatar.jpg'),
       updated_at = now()
 where id = '62decdad-1a88-414f-a16e-54290a052064'
   and avatar_url like '%/avatar.png';
```

Varredura para achar outros casos do mesmo tipo, se houver:

```sql
select p.id, p.avatar_url
  from profiles p
 where p.avatar_url is not null
   and not exists (
     select 1 from storage.objects o
      where o.bucket_id = 'avatars'
        and p.avatar_url like '%' || o.name
   );
```

---

## Padrão de falha — a conclusão que vale mais que os patches

Os sete achados são três formas do mesmo hábito. Corrigir as colunas e deixar o hábito é
garantir que o próximo problema também vai levar meses para aparecer.

**1. `error` descartado no destructuring.**
`const { data } = await …` sem ler o `error` transforma "a tabela não existe" em "não há nada
para fazer". É o que mantém a importação de histórico morta com o cron verde
(`crm-history-import.service.ts:106`, `:119`). Onde o resultado decide um caminho, o `error`
precisa ser lido e logado.

**2. Fallback `[]` que cobre mais do que deveria.**
O `catch` que devolve lista vazia foi escrito para *tabela ausente em ambiente legado* e acabou
cobrindo *query inválida em produção* — 8.343 linhas de histórico de saúde invisíveis, sem um
erro sequer. Fallback de compatibilidade deve casar o código do erro (`42P01`) e deixar o resto
estourar.

**3. `.single()` onde zero linha é um estado válido.**
Gera 35 eventos/hora de 406 legítimo e ensina o time a ignorar a classe inteira — inclusive
quando ela significar algo. `.maybeSingle()` quando "nenhum" é normal; `.single()` só quando a
ausência é, de fato, um erro.

Uma consequência prática dos três juntos: **a taxa de erro deste projeto não serve como sinal
hoje**. Depois do achado 1 resolvido, o volume cai para ~60 eventos/hora, e aí vale a pena
ligar alerta em cima dela.
