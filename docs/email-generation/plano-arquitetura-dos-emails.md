# Plano — aba "Arquitetura dos Emails"

Substituir as abas **Blueprints** e **Estrutura geral** do hub
`/admin/settings/email-generation` por uma única tela, conforme a maquete
`Blueprints - Regua da Sequencia.dc.html`.

Documento de planejamento. Nada foi executado ainda.

---

## Resumo executivo

**Fundir as duas telas: sim, e a maquete já está certa.** Elas editam o MESMO
par `(flow_type, email_number)` em duas abas diferentes, com dois vocabulários
de bloco e quatro campos de texto que dizem quase a mesma coisa. É a fonte de
metade da confusão do pipeline.

**Apagar os dados: não como parte disso.** As duas tabelas não são telas — são
entrada de produção do pipeline AE, lidas em runtime por seis módulos. Zerá-las
não limpa uma tela: muda o email que sai para o cliente. Detalhe em
[O que quebra se apagar](#o-que-quebra-se-apagar).

Recomendação: **excluir as telas, preservar as tabelas**, e fazer a tela nova
escrever nas duas por uma rota só. Zero mudança em consumidor, ganho total de
usabilidade. Se depois quiser reescrever o conteúdo do zero, isso vira uma
curadoria por flow — com a tela nova já no ar e um backup — não um passo desta
refatoração.

---

## Parte 1 — O que existe hoje

### Arquivos das duas telas

| Arquivo | Linhas | Papel |
|---|---|---|
| `src/components/email-blueprints/blueprints-workspace.tsx` | 99 | root da aba Blueprints |
| `src/components/email-blueprints/blueprint-list.tsx` | 94 | lista de emails do flow |
| `src/components/email-blueprints/blueprint-editor.tsx` | 317 | form + save/delete |
| `src/components/email-blueprints/blueprint-blocks-editor.tsx` | 252 | linhas de bloco |
| `src/components/email-blueprints/blueprint-reference-preview.tsx` | 117 | painel direito (HTML de referência) |
| `src/components/email-outlines/outlines-workspace.tsx` | 565 | aba Estrutura geral inteira |
| `src/app/admin/email-blueprints/page.tsx` | 15 | redirect legado |
| `src/app/admin/outlines/page.tsx` | 12 | redirect legado |
| `src/app/api/admin/email-blueprints/route.ts` | — | GET/POST |
| `src/app/api/admin/email-blueprints/[id]/route.ts` | — | PATCH/DELETE |
| `src/app/api/admin/email-blueprints/text-only/route.ts` | — | PATCH da flag (usado pelas DUAS abas) |
| `src/app/api/admin/outlines/route.ts` | 83 | GET/POST |
| `src/app/api/admin/outlines/[id]/route.ts` | — | PATCH/DELETE |
| `src/lib/services/blueprint-management.service.ts` | — | `listBlueprintsWithDefaults` (RSC) |
| `src/lib/email-blueprints/types.ts` | 55 | `BlueprintRow` + `BLOCK_TYPE_OPTIONS` |

Total: ~1.450 linhas de componente + 5 rotas.

### As duas tabelas e quem as lê

Ambas têm **34 linhas**, uma por `(flow_type, email_number)` — batendo 1:1 com
os 34 emails default do seed (`DEFAULT_EMAILS`) e com `DEFAULT_BLUEPRINTS`.
Não há linha órfã nem lacuna dos dois lados.

**`email_blueprints`** — 16 colunas:

| Consumidor | O que lê | Se sumir |
|---|---|---|
| `seed-blocks.ts` | `blocks[]` | cai em `DEFAULT_BLUEPRINTS` (código) — sobrevive |
| `blueprint-loader.ts` → Montador/Curador | `objective`, `messaging`, `subject_hint` | idem |
| `email-copy-webhook.service.ts` | tudo acima → payload do n8n | idem |
| `phase2-runner.service.ts`, `webhooks/n8n/email-copy` | `text_only` | **8 emails voltam a gerar imagem e HTML** |
| `build-vars.ts`, `resolve-block-prompt.service.ts` | `image_aspect` | volta ao default `4:5` |
| `prompt-vars-builder.ts` | `image_produto_heroi_hint`, `image_overlay_reserve_bottom` | perde o direcionamento de imagem |
| `image/mode-resolution.ts` | `image_mode` | perde o override |

As cinco colunas de imagem **não têm editor em lugar nenhum** — nenhum
componente em `src/components/` as escreve. São dado invisível hoje.

**`email_outline_templates`** — 13 colunas:

| Consumidor | O que lê | Se sumir |
|---|---|---|
| `architect/generate.service.ts` | linha inteira | vira `null` |
| `architect/outline-sections.ts` | `suggested_blocks` | **cai no `FALLBACK_SECTIONS`**: header/hero/body/products/footer para TODO email |
| `blueprint-generator.service.ts`, `deterministic-blueprint.builder.ts` | `objective`, `guidance` | perde a intenção de partida |
| `email-copy-webhook.service.ts` | `estrutura_geral` do payload | chega `null` no n8n |
| bloco `coupon` no seed | `coupon_code` | emails com cupom nascem sem código |

### O Estruturador não torna isso descartável

`email_generation_settings.estruturador_mode = 'on'` em produção. Pelo ADR
(`adr-estruturador-adaptativo.md`), o agente **substitui o papel estrutural**
do outline quando a run valida — mas o próprio ADR mantém o outline como
fallback e como fonte da intenção de partida, e o código confirma:
`estruturador.on_fallback_outline` roda em `sem_material`, `falhou` e
`text_only`.

Telemetria dos 2 primeiros dias (27–28/08): **11 success, 2 error**. O fallback
não é teórico — ele rodou. Com o outline vazio, esses 2 emails teriam saído com
a estrutura genérica de 5 blocos.

### O que quebra se apagar

Somando: 8 emails perdem `text_only` e voltam a gerar imagem/HTML; o
direcionamento de imagem some sem UI que o recupere; e todo email cujo
Estruturador falhe passa a sair com header/hero/body/products/footer,
independente do flow. Nada disso aparece como erro — sai email plausível e
errado, que é o modo de falha caro deste pipeline.

Se ainda assim quiser zerar, o caminho seguro está na [Fase 6](#fase-6--reset-de-conteúdo-opcional-e-separado).

---

## Parte 2 — De-para da maquete

### O que a maquete cobre

| Elemento da maquete | Origem hoje | Situação |
|---|---|---|
| Dropdown de flow com nome PT | `EGFlowPills` com a chave crua (`abandoned_cart`) | melhora — falta um catálogo de rótulos |
| "dispara em {trigger}" | não existe (só `description` em `DEFAULT_FLOWS`) | **novo** — campo curto por flow |
| "N e-mails" no subtítulo | contagem da lista | pronto |
| Chip de e-mail: nº + delay | `DEFAULT_EMAILS[].delay_hours` (código) | existe, nunca foi exibido |
| Chip: nome ("Lembrete Suave") | `DEFAULT_EMAILS[].name` ("Carrinho Abandonado 1") | existe, genérico — nomear é curadoria |
| Chip: "N blocos · montado/texto" | `blocks.length` + `text_only` | pronto |
| Guia "Intenção do e-mail" | `outline.objective` **e** `blueprint.objective` | dois campos para um |
| Guia "O e-mail deve" | `outline.guidance` **e** `blueprint.messaging` (texto corrido) | dois campos para um, sem quebra por linha |
| Guia "O e-mail não deve" | — | **novo** |
| Tabela de blocos: Nº / Tipo / O que entra / ordem | `blueprint.blocks[]` `{type,label,purpose}` | pronto (`purpose` = "o que entra nele") |
| Paleta "Adicionar:" (7 tipos) | 18 tipos técnicos (blueprint) **ou** 8 categorias (outline) | ver decisão 2 |
| Sidebar "Como fica o e-mail" | `blueprint-reference-preview.tsx` mostra o HTML real | a maquete mostra esquema — é uma troca, não um ganho |
| "Salvar sequência" | dois saves, em duas abas | pronto ao unificar |
| "Testar" | aba Testar separada | link, não reimplementar |

### O que a maquete pede e não existe

1. **Adicionar / remover e-mail da sequência.** Hoje a régua é fixa em
   `DEFAULT_EMAILS` (código) e no `flow-seed.service`. Tornar isso editável
   significa mover a régua para o banco — é a maior peça deste plano e a única
   que toca o seed de lojas novas.
2. **"O e-mail não deve"** — coluna nova.
3. **Gatilho e rótulo PT por flow** — catálogo novo (código ou tabela).
4. **Delay editável** — hoje é constante de código.

### O que a maquete NÃO cobre (e o pipeline lê)

Isto é o risco silencioso da troca: campos que hoje têm editor e sumiriam.

| Campo | Quem lê | Destino proposto |
|---|---|---|
| `blueprint.subject_hint` | payload de copy do n8n | "Mais opções" (accordion no fim) |
| `blueprint.tone_override` / `outline.tone_hint` | Montador / payload | "Mais opções" |
| `outline.coupon_code` | semeia o bloco `coupon` | "Mais opções" |
| `blocks[].needs_image` + `blocks[].image_brief` | pipeline de imagem inteiro | popover na linha do bloco (como hoje) |
| `blueprint.text_only` | pula fase 2 | toggle no cabeçalho do e-mail |
| `outline.is_active` | filtro do `generate.service` | derivar de "remover e-mail" |
| `image_mode`, `image_aspect`, `image_produto_heroi_hint`, `image_overlay_reserve_bottom` | imagem | continuam sem UI (fora de escopo) |
| "Resetar p/ Default" (`source: db\|default`) | — | perde sentido: as 34 linhas existem no DB |

---

## Parte 3 — Decisões abertas

### Decisão 1 — o que fazer com os dados

| Opção | Consequência |
|---|---|
| **A (recomendada)** Preserva as duas tabelas; a tela nova escreve nas duas por uma rota | Zero mudança em consumidor. Refatoração só de UI. |
| B Funde numa tabela `email_architecture` e migra os 6 consumidores | Mais limpo no fim; 6 pontos de leitura em produção para reescrever |
| C Apaga os dados | Ver [O que quebra](#o-que-quebra-se-apagar) |

A opção A não impede a B depois — ela deixa a tela pronta e um único ponto de
escrita, que é justamente o que falta hoje para fazer a fusão com segurança.

### Decisão 2 — vocabulário do bloco

A paleta da maquete (Hero, Body, Produtos, Prova Social, CTA, Oferta, Footer)
é **exatamente 7 das 8 categorias canônicas** de `COMPONENT_CATEGORIES` — só
falta Header. Ou seja: a maquete já fala o vocabulário do Curador e do
Estruturador, não os 18 tipos técnicos do blueprint.

Proposta: **a lista visível é de categorias (8)**; cada linha guarda também o
`type` técnico, derivado por `blockTypeToCategory` na leitura e preservado na
escrita quando o usuário não trocar o tipo. Assim `suggested_blocks` e
`blocks[]` deixam de poder divergir — hoje divergem (`abandoned_cart` #1 tem 6
blocos no blueprint e 7 no outline).

**Armadilha concreta:** `ALLOWED_BLOCK_TYPES` do `seed-blocks.ts` aceita 7 das
8 categorias como `block_type` — **`offer` não está lá**. Gravar `offer` cru
faria o `sanitizeBlockType` degradar para `text` com `log.error`. A categoria
`offer` precisa mapear para `coupon` na escrita (ou entrar no CHECK da
migration 20261074).

### Decisão 3 — os três guias × os quatro campos de texto

Hoje: `outline.objective`, `outline.guidance`, `blueprint.objective`,
`blueprint.messaging`. A maquete pede: intenção, deve, não deve.

Proposta:

| Guia da maquete | Grava em | Observação |
|---|---|---|
| Intenção do e-mail | `outline.objective` **e** `blueprint.objective` | mesma string nos dois; o payload já resolve `bp ?? outline` |
| O e-mail deve | `outline.guidance` **e** `blueprint.messaging` | uma diretriz por linha; junta com `\n` |
| O e-mail não deve | coluna nova `outline.restrictions` | aditiva; entra no payload e no prompt do Montador |

Escrever a mesma string em dois lugares é feio, e é o preço de não mexer nos
consumidores agora (opção A). Some sozinho na opção B.

### Decisão 4 — a régua vira editável?

"Adicionar/Remover e-mail" só faz sentido se a régua sair do código. São dois
tamanhos de trabalho bem diferentes:

- **Sem régua editável:** os botões ficam de fora; a tela edita os 34 emails
  que existem. Escopo: UI + 1 coluna.
- **Com régua editável:** nova tabela `email_flow_templates` (flow, número,
  nome, delay, trigger), `flow-seed.service` passa a ler dela com os
  `DEFAULT_EMAILS` como seed inicial, e todo store novo herda a régua editada.
  Escopo: +1 migration, +1 rota, e uma mudança no caminho de criação de loja.

Recomendo **fatiar**: entregar a tela unificada primeiro (fases 1–4) e a régua
editável como fase 5, depois de a tela estar em uso.

---

## Parte 4 — Plano de exclusão

Ordem importa: só apagar depois que a tela nova cobrir o campo.

### Fase E1 — desligar as abas (reversível, 1 commit)

- `email-generation-workspace.tsx`: remover `"blueprints"` e `"outlines"` de
  `TABS`, os dois rótulos de `TAB_LABELS` e as duas linhas de render.
- Adicionar `"architecture"` → "Arquitetura dos Emails" na posição das
  removidas (3ª, depois de Conhecimento).
- `page.tsx` do hub: trocar as duas chaves no `initialTab` por `architecture`
  e manter `blueprints`/`outlines` como **alias** que resolvem para a nova —
  há links salvos e o redirect legado aponta para lá.
- `app/admin/email-blueprints/page.tsx` e `app/admin/outlines/page.tsx`:
  apontar o redirect para `?tab=architecture`.

Neste ponto a UI antiga está inacessível mas o código ainda compila.

### Fase E2 — apagar os componentes (depois de E1 validado)

```
src/components/email-blueprints/          (5 arquivos, 879 linhas)
src/components/email-outlines/            (1 arquivo, 565 linhas)
```

Antes de apagar, **portar** para a tela nova:

- `blueprint-blocks-editor.tsx` → o popover de `image_brief` e o checkbox
  `needs_image` (nada mais os edita).
- `blueprint-reference-preview.tsx` → decidir: manter o preview do HTML real
  como terceira coluna opcional, ou aceitar o esquema da maquete no lugar.
  Recomendo manter — é o único lugar que mostra o template que o Montador usa.
- `outlines-workspace.tsx` → o drag-and-drop de blocos (`@hello-pangea/dnd`)
  e o `normalizeSuggestedBlocks` no save.

Verificar que `@hello-pangea/dnd` continua usado (o CRM usa) antes de mexer em
`package.json`.

### Fase E3 — consolidar as rotas

| Rota | Destino |
|---|---|
| `POST/GET /api/admin/email-blueprints` | absorvida por `/api/admin/email-architecture` |
| `PATCH/DELETE /api/admin/email-blueprints/[id]` | idem |
| `PATCH /api/admin/email-blueprints/text-only` | **manter** — é a fonte única da flag |
| `GET/POST /api/admin/outlines` | absorvida |
| `PATCH/DELETE /api/admin/outlines/[id]` | absorvida |

`listBlueprintsWithDefaults` e `BlueprintRow` continuam vivos: o RSC do hub
pré-carrega por eles. `canManageEmailBlueprints` é o gate de auth — preservar.

### Fase E4 — limpeza de referências

- `outlines-workspace.tsx:263,521,536` e `blueprint-editor.tsx:283` citam "a
  aba Blueprints"/"a aba Estrutura geral" em texto de UI — some junto.
- `email-blueprints/text-only/route.ts:73` cita "crie o blueprint na aba
  Blueprints" numa mensagem de erro — reescrever.
- `settings-sections.ts:131` descreve a seção como "Blueprints, prompts…" —
  atualizar.
- `CLAUDE.md`: a seção do hub lista 8 abas — passa a 8 com nome novo.

---

## Parte 5 — Plano de integração

### Fase I1 — fundação (sem UI)

1. **Migration** (ver Parte 6): `outline.restrictions`, e o catálogo de flows.
2. **`src/lib/email-architecture/types.ts`** — client-safe, no molde de
   `email-blueprints/types.ts` (o service importa `next/headers`; tipo em
   client component quebra o build). Contém:
   - `EmailArchitectureRow` — a linha unificada (flow, número, nome, delay,
     intenção, deve, não deve, blocos, text_only, e o bloco "Mais opções").
   - `ArchBlock` — `{ id, category, type, label, purpose, needs_image, image_brief }`.
   - `FLOW_CATALOG` — chave, rótulo PT, gatilho. Fonte única para a tela e
     para o payload.
3. **`src/lib/email-architecture/merge.ts`** — módulo **puro**, testado:
   - `mergeRows(blueprints, outlines, seedEmails)` → `EmailArchitectureRow[]`,
     resolvendo a divergência entre `blocks[]` e `suggested_blocks[]` (o
     blueprint vence na forma; o outline entra como categoria quando o
     blueprint não tem a posição).
   - `splitRow(row)` → `{ blueprintPayload, outlinePayload }`, incluindo o
     `offer → coupon` da decisão 2.
   - `guidesToText(lines)` / `textToGuides(str)` — a quebra por linha.

   Isto é o coração e é onde os testes moram. Mesma régua do
   `crm-performance.ts`/`anchor-match.ts`: lógica pura fora do componente.

### Fase I2 — rota única

`src/app/api/admin/email-architecture/route.ts`

- `GET` → `{ rows, flows }`, já mesclado por `mergeRows`.
- `PUT` → recebe a linha inteira, chama `splitRow`, grava
  `email_blueprints` e `email_outline_templates` em sequência, e **devolve a
  linha remontada**. Se a segunda escrita falhar, desfaz a primeira ao estado
  lido — sem isso a tela salva metade e as duas tabelas divergem em silêncio.
- Auth: `assertCanManagePrompts` (admin/owner ou tag `dev`) — mesmo gate do
  resto do hub.
- Zod no shape dos blocos, como o `blueprint-editor` já faz no client: o
  endpoint aceita JSONB livre e um bloco torto passaria direto para o
  `seedBlocksFromBlueprint`.

### Fase I3 — a tela

`src/components/email-generation/architecture-tab.tsx` + subcomponentes.

Fiel à maquete, usando `C`/`F` de `eg-theme.ts` — que já tem exatamente a
paleta do arquivo exportado (`#4E62D8`, `#2137B6`, `#EEF0FB`, `#F8FAFC`,
`rgba(0,0,0,0.08)`), então nenhum token novo é preciso.

Ordem de montagem:

1. Cabeçalho: dropdown de flow (`fm` da maquete) + contagem + gatilho.
2. Régua de chips de e-mail. Sem a fase 5, os botões Adicionar/Remover ficam
   ocultos — não desabilitados: botão morto na tela é pior que ausente.
3. Acordeão dos três guias (`GUIDE_DEFS`), com o status resumido fechado —
   é o detalhe que faz a tela funcionar sem rolar.
4. Tabela de blocos + paleta.
5. Coluna direita: esquema de blocos + (recomendado) o preview do template
   de referência portado.
6. Rodapé "Mais opções": subject hint, tom, cupom, somente-texto.
7. "Testar" → link para a aba Testar com `?flow=&email=` pré-selecionados.

Estados que a maquete não tem e a tela precisa: carregando, erro de GET
(lançar no fetcher — a lição do `funnel-data.ts`: `r => r.json()` devolve o
corpo de erro como dado válido), salvando, e "salvo há X".

### Fase I4 — corte

Executar E1 → validar em staging → E2/E3/E4.

### Fase I5 — régua editável (opcional, ver decisão 4)

Tabela `email_flow_templates` + `flow-seed.service` lendo dela. Só depois de
I4 no ar.

---

## Parte 6 — Migration

```sql
-- 2026xxxx_email_architecture.sql

-- 1. "O e-mail não deve" — aditiva, default vazio.
ALTER TABLE email_outline_templates
  ADD COLUMN IF NOT EXISTS restrictions text;

COMMENT ON COLUMN email_outline_templates.restrictions IS
  'Restrições editoriais do email, uma por linha ("O e-mail não deve").
   Entra no estrutura_geral do payload de copy e no prompt do Montador.';

-- 2. Catálogo de flows: rótulo PT + gatilho.
--    Alternativa em código (FLOW_CATALOG) se não quiser tabela — a régua
--    hoje já vive em código (DEFAULT_FLOWS/DEFAULT_EMAILS) e seguir o
--    mesmo padrão evita uma tabela de 7 linhas que ninguém edita.
```

**Não** faz parte desta migration: fundir as tabelas, apagar coluna, mexer no
CHECK de `email_blocks.block_type`. Se a decisão 2 escolher gravar `offer`
cru, aí sim entra um `ALTER ... DROP CONSTRAINT / ADD CONSTRAINT` — mas a
opção `offer → coupon` no `splitRow` evita isso e é reversível.

---

## Parte 7 — Riscos e verificação

| Risco | Mitigação |
|---|---|
| Salvar em duas tabelas e uma falhar | `PUT` desfaz a primeira; a tela relê a linha do servidor após salvar |
| Campo órfão (subject_hint, cupom, image_brief) sumir com a tela antiga | tabela da Parte 2 é checklist de aceite — nenhum campo sai sem destino |
| `offer` degradar para `text` no seed | `splitRow` mapeia; teste unitário cobre |
| Divergência `blocks[]` × `suggested_blocks[]` ao unificar | `mergeRows` testado com as 34 linhas reais como fixture |
| Perder o preview do HTML de referência | portar `blueprint-reference-preview.tsx` (recomendado) |
| Link salvo em `?tab=blueprints` dar 404 | alias no `parseTab` |
| Estruturador falhar e cair num outline vazio | os dados ficam — é a razão principal de não apagar |

**Verificação antes do merge:**

- `npm run lint`, `npm run typecheck`, `npx vitest run` (1.493 testes hoje).
- Testes novos: `merge.test.ts` com as 34 linhas de produção como fixture,
  provando `splitRow(mergeRows(x)) ≡ x` (ida e volta sem perda).
- Manual: abrir cada um dos 7 flows, salvar sem alterar nada, e conferir por
  SQL que nenhuma das 34 linhas mudou de conteúdo.

**Rollback:** E1 é um commit de ~15 linhas; reverter devolve as duas abas
intactas enquanto os componentes existirem (ou seja: até E2). A janela segura
está entre E1 e E2 — vale deixar E2 para um segundo deploy.

---

## Fase 6 — reset de conteúdo (opcional e separado)

Se depois de tudo no ar quiser mesmo reescrever o conteúdo:

1. `CREATE TABLE email_blueprints_bkp_2026xx AS SELECT * FROM email_blueprints;`
   (idem outline) — backup na mesma base, não em arquivo.
2. Reescrever **por flow**, na tela nova, com o `VERIFICAR_pronto_para_gerar.sql`
   rodando entre um flow e outro.
3. Nunca por `TRUNCATE`: sem linha, o `text_only` de 8 emails some e o
   fallback do Estruturador vira estrutura genérica.

---

*Escrito em 29/08/2026. Base: 34 linhas em cada tabela, estruturador_mode=on,
11 success / 2 error nos 2 primeiros dias do Estruturador.*
