---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
Epic: CM - Curador, Montador e Hero
Fase: Biblioteca / Componentes
Estimate: M
---

# Story CM-6 — `rendered_html`: auditar os dados e garantir que não envelheça

## User Story

**Como** curador da biblioteca de componentes,
**quero** saber quais variantes têm um exemplo renderizado que serve de
referência de acabamento, e ser avisado quando ele ficar desatualizado,
**para que** o agente de hero possa voltar a usá-lo com segurança.

---

## Contexto

O campo `rendered_html` foi criado como "exemplo real do email
renderizado, colado manualmente" — a intenção é ser o **padrão de
acabamento** da variante: como ela fica quando bem executada.

Na prática, o que está cadastrado não corresponde a isso. O comentário em
`html/hero-graft.ts` registra a constatação de quem implementou o enxerto:

> `rendered_html` das variantes é um mockup-imagem de ~1.7KB, não HTML
> estrutural

Por isso o modo `library` do agente de hero manda `hero_variant_rendered`
**vazio de propósito**. Decisão de 30/jul: a intenção do campo está certa,
os **dados** estão errados. Antes de reintroduzir o renderizado como
insumo de agente, é preciso saber o que existe.

Segundo problema, independente do primeiro: não há como saber se o
renderizado corresponde ao `html` atual. Existe um único `updated_at` na
linha — editar o `html` sem regravar o renderizado não deixa rastro. Um
exemplo de acabamento que descreve uma versão antiga da variante é pior
que exemplo nenhum.

---

## Acceptance Criteria

### AC CM-6.1 — Classificador de renderizado
- [x] Função pura `classifyRenderedHtml(html, renderedHtml)` retornando
      `'structural' | 'mockup' | 'empty'`
- [x] Critérios de `mockup` (qualquer um basta): tamanho muito abaixo do
      `html` da variante; conteúdo é essencialmente uma única `<img>`;
      ausência de `<table>` com mais de uma `<tr>`; densidade de tags por
      caractere muito baixa
- [x] Thresholds em constantes nomeadas, com comentário justificando cada
      número. Nenhum número solto no meio da lógica
- [x] Testes com casos reais: mockup de ~1.7KB, HTML estrutural completo,
      renderizado vazio, HTML só com `<img>` grande

### AC CM-6.2 — Relatório na aba Componentes
- [x] `GET /api/admin/components` retorna `rendered_status` por variante
      (`kind`, `usable`, `reason`, `stale`)
- [x] O editor da variante mostra, na aba "HTML renderizado", o estado do
      exemplo e **o que fazer**: utilizável, print embrulhado em HTML,
      desatualizado ou validade desconhecida
- [ ] ~~Contador no topo da aba~~ — **não implementado.** A medida agregada
      do trabalho pendente sai da própria migration (o `SELECT` de
      verificação conta ativas × com exemplo × com hash) e do selo dos logs.
      Um contador na UI exigiria carregar a biblioteca inteira só para somar;
      se a curadoria pedir, vira story própria
- [x] Auth pelo mesmo gate das demais rotas do hub
      (`assertCanManagePrompts`)

### AC CM-6.3 — Hash de origem
- [x] Migration: coluna `rendered_html_source_sha TEXT` em
      `email_component_variants`, com `COMMENT` explicando
- [x] Gravada com o SHA do `html` **no momento em que o renderizado é
      salvo** — nas rotas `POST /api/admin/components` e
      `PATCH /api/admin/components/[id]`
- [x] Renderizado salvo sem `html` presente no payload → SHA calculado
      sobre o `html` que está no banco
- [x] Backfill: variantes existentes com `rendered_html` ficam com
      `rendered_html_source_sha = NULL` — estado "desconhecido", tratado
      como desatualizado até alguém regravar

### AC CM-6.4 — Gate de envio ao agente
- [x] Helper `resolveRenderedReference(variant)` retornando o HTML ou
      `null` com a razão
- [x] Envia o renderizado **só** quando: classificação `structural`
      **e** `rendered_html_source_sha === sha(html atual)`
- [x] `null` com razão `mockup`, `stale`, `unknown_sha` ou `empty` →
      registrado no run em `parsed_output.rendered_reference`
- [x] `format-context.ts` usa o helper ao montar `hero_variant_rendered_html`

### AC CM-6.5 — Aviso de desatualizado
- [x] O editor avisa quando o hash não casa, explicando a causa (o HTML
      mudou depois que o exemplo foi salvo) e a ação (recolar)
- [x] O aviso é **não bloqueante**: salvar a variante continua permitido
- [x] `parsed_output.rendered_reference.stale` no run da hero alimenta o
      selo "Renderizado desatualizado" do CM-7

### AC CM-6.6 — Reintrodução no prompt da hero
- [x] O gate vale no modo **`montador`**: quando o helper devolve HTML, o
      exemplo chega ao agente como espelho de acabamento; quando devolve
      `null`, o `html` da variante é a única referência
- [ ] ~~Preencher também no modo `library`~~ — **adiado, deliberadamente.**
      Nesse modo a região JÁ é a variante canônica, enxertada por código, e o
      prompt manda fazer substituição pura; o `hero_source_modes` diz
      explicitamente que os dois campos "arrive EMPTY in this mode on
      purpose". Reintroduzir o exemplo ali muda o que o agente pode fazer com
      uma região que é estruturalmente final — mudança de comportamento que
      merece ser validada com dados reais. E hoje não há dados: praticamente
      nenhuma variante tem renderizado estrutural. Quando a curadoria
      produzir alguns, vale medir antes de soltar
- [x] Teste dos dois caminhos (com hash válido → chega; divergente → não)

### AC CM-6.7 — Testes
- [x] Classificador, com os quatro casos
- [x] Gravação do SHA nas duas rotas
- [x] Gate: `structural` + hash igual → envia; `structural` + hash
      diferente → não envia, razão `stale`; `mockup` → não envia; `NULL`
      → não envia, razão `unknown_sha`
- [x] Backfill não quebra variantes existentes

---

## Tarefas

- [x] Classificador + testes
- [x] Migration: coluna + comentário
- [x] Gravação do SHA nas rotas de componentes
- [x] Helper de resolução + uso no `format-context`
- [x] Indicadores na aba Componentes
- [x] Prompt da hero: instrução de acabamento condicional
- [x] Testes

---

## Dev Notes

### Por que hash e não timestamp

Existe um único `updated_at` por linha. Salvar só a descrição de uma
variante já move o timestamp sem invalidar o renderizado; editar o `html`
por SQL não move nada. O hash responde exatamente à pergunta certa: "este
renderizado foi feito a partir deste HTML?"

### Ordem de trabalho na curadoria

O classificador não corrige dados — ele mede. A expectativa é que a maior
parte das variantes apareça como `mockup`, e que a curadoria vá
substituindo por HTML de verdade ao longo do tempo. O progresso é visível
pelo `SELECT` de verificação da migration (ativas × com exemplo × com hash)
e, por variante, pelo aviso no editor. O agente de hero passa a melhorar
variante por variante, conforme a biblioteca é arrumada — não num corte
único.

### Por que não gerar o renderizado automaticamente

Foi considerado: renderizar a variante com dados de exemplo e salvar como
`rendered_html`. Rejeitado por circularidade — o renderizado serviria de
espelho de acabamento para o agente, mas seria produzido pelo mesmo
pipeline que ele deve espelhar. O exemplo precisa vir de fora, de um email
que alguém aprovou.

---

## File List

### A criar
- `src/lib/agents/shared/rendered-reference.ts`
- `src/lib/agents/shared/rendered-reference.test.ts`
- `supabase/migrations/20261056_rendered_html_source_sha.sql`

### A modificar
- `src/app/api/admin/components/route.ts`
- `src/app/api/admin/components/[id]/route.ts`
- `src/lib/agents/html/format-context.ts`
- `src/components/email-components/components-workspace.tsx`
- `src/components/email-components/variant-editor.tsx`
- `src/lib/agents/phase2-runner.service.ts` — `rendered_reference` no run
- `src/types/email-generation.ts` — campo novo na variante

---

## Dependencias

- **Bloqueado por**: CM-5 (o prompt da hero é tocado nas duas; fazer junto
  evita duas migrations no mesmo texto)
- **Bloqueia**: nada

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| O classificador erra e marca HTML bom como mockup | Média | Thresholds nomeados e ajustáveis; o indicador é informativo, e o pior caso é o comportamento de hoje (não enviar) |
| Quase toda a biblioteca é mockup e a story não muda nada na prática | **Alta** | É o resultado esperado e útil: a story entrega a **medida** do problema e o mecanismo. O ganho vem com a curadoria |
| Renderizado estrutural faz o agente reestruturar a hero no modo `library` | Média | O prompt autoriza acabamento, não estrutura; o modo `library` continua dizendo "substituição pura". Comparar antes/depois nas primeiras variantes arrumadas |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada após constatar que os dados de `rendered_html` não correspondem à intenção do campo |
| 2026-07-30 | @dev (Dex) | `shared/rendered-reference.ts`: classificador com 4 thresholds nomeados + hash de origem + gate único (`resolveRenderedReference`). Migration `20261056` sem backfill de hash — NULL é "validade desconhecida", tratada como velha. Regra do PATCH: o hash só é regravado quando o EXEMPLO muda; editar só o `html` deixa o descasamento de propósito, que é o sinal. Aviso no editor com causa e ação. 16 testes no módulo + 3 nas vars da hero; 942/942. Status → In Review |
