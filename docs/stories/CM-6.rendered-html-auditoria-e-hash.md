---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
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
- [ ] Função pura `classifyRenderedHtml(html, renderedHtml)` retornando
      `'structural' | 'mockup' | 'empty'`
- [ ] Critérios de `mockup` (qualquer um basta): tamanho muito abaixo do
      `html` da variante; conteúdo é essencialmente uma única `<img>`;
      ausência de `<table>` com mais de uma `<tr>`; densidade de tags por
      caractere muito baixa
- [ ] Thresholds em constantes nomeadas, com comentário justificando cada
      número. Nenhum número solto no meio da lógica
- [ ] Testes com casos reais: mockup de ~1.7KB, HTML estrutural completo,
      renderizado vazio, HTML só com `<img>` grande

### AC CM-6.2 — Relatório na aba Componentes
- [ ] `GET /api/admin/components` retorna a classificação por variante
- [ ] A aba Componentes mostra, por variante, um indicador do estado do
      renderizado: **estrutural**, **mockup** ou **ausente**
- [ ] Contador no topo: quantas variantes têm renderizado estrutural, de
      quantas ativas. É a medida do trabalho de curadoria pendente
- [ ] Auth pelo mesmo gate das demais rotas do hub
      (`assertCanManagePrompts`)

### AC CM-6.3 — Hash de origem
- [ ] Migration: coluna `rendered_html_source_sha TEXT` em
      `email_component_variants`, com `COMMENT` explicando
- [ ] Gravada com o SHA do `html` **no momento em que o renderizado é
      salvo** — nas rotas `POST /api/admin/components` e
      `PATCH /api/admin/components/[id]`
- [ ] Renderizado salvo sem `html` presente no payload → SHA calculado
      sobre o `html` que está no banco
- [ ] Backfill: variantes existentes com `rendered_html` ficam com
      `rendered_html_source_sha = NULL` — estado "desconhecido", tratado
      como desatualizado até alguém regravar

### AC CM-6.4 — Gate de envio ao agente
- [ ] Helper `resolveRenderedReference(variant)` retornando o HTML ou
      `null` com a razão
- [ ] Envia o renderizado **só** quando: classificação `structural`
      **e** `rendered_html_source_sha === sha(html atual)`
- [ ] `null` com razão `mockup`, `stale`, `unknown_sha` ou `empty` →
      registrado no run em `parsed_output.rendered_reference`
- [ ] `format-context.ts` usa o helper ao montar `hero_variant_rendered_html`

### AC CM-6.5 — Aviso de desatualizado
- [ ] Aba Componentes marca a variante quando o hash não casa:
      "renderizado desatualizado — atualize o exemplo"
- [ ] O aviso é **não bloqueante**: salvar a variante continua permitido
- [ ] Selo correspondente nos logs de geração (CM-7)

### AC CM-6.6 — Reintrodução no prompt da hero
- [ ] Quando o helper devolve HTML, o modo `library` passa a receber
      `hero_variant_rendered` preenchido, e o prompt ganha a instrução de
      usá-lo como **padrão de acabamento** — sem autorizar mudança
      estrutural, que segue proibida no modo `library`
- [ ] Quando o helper devolve `null`, o comportamento é o de hoje: vazio,
      e a região enxertada é a única referência
- [ ] Teste dos dois caminhos

### AC CM-6.7 — Testes
- [ ] Classificador, com os quatro casos
- [ ] Gravação do SHA nas duas rotas
- [ ] Gate: `structural` + hash igual → envia; `structural` + hash
      diferente → não envia, razão `stale`; `mockup` → não envia; `NULL`
      → não envia, razão `unknown_sha`
- [ ] Backfill não quebra variantes existentes

---

## Tarefas

- [ ] Classificador + testes
- [ ] Migration: coluna + comentário
- [ ] Gravação do SHA nas rotas de componentes
- [ ] Helper de resolução + uso no `format-context`
- [ ] Indicadores na aba Componentes
- [ ] Prompt da hero: instrução de acabamento condicional
- [ ] Testes

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
substituindo por HTML de verdade ao longo do tempo. O contador da AC
CM-6.2 é o que torna esse progresso visível. O agente de hero passa a
melhorar variante por variante, conforme a biblioteca é arrumada — não
num corte único.

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
- `supabase/migrations/2026XXXX_rendered_html_source_sha.sql`

### A modificar
- `src/app/api/admin/components/route.ts`
- `src/app/api/admin/components/[id]/route.ts`
- `src/lib/agents/html/format-context.ts`
- `src/components/email-components/components-workspace.tsx`
- `src/components/email-components/variant-editor.tsx`
- `src/lib/agents/chains/hero.chain.ts` — prompt condicional

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
