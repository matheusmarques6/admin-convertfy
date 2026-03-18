---
Prioridade: Medium
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "4 - Historico + Export (Polish)"
Esforco: MEDIUM
Dependencias: "RG-4 (job queue + list endpoint), RG-6 (notification patterns)"
---

# Story RG-7 — Pagina Historico de Relatorios

## Story

**Como** operador do admin panel,
**Quero** uma pagina dedicada para ver o historico de todos os relatorios gerados,
**Para que** eu possa acessar relatorios anteriores, acompanhar os pendentes, retomar os que falharam, e gerar novos relatorios.

## Contexto

### Problema

Relatorios gerados em background ficam salvos no banco (tabela `report_jobs`), mas nao ha uma pagina dedicada para listar, acessar, e gerenciar esses relatorios. O operador precisa de um hub centralizado.

### Solucao

Criar uma pagina `/report-jobs` acessivel via sidebar que mostra relatorios agrupados em 3 secoes: PENDENTES (com progress bar), CONCLUIDOS (com botoes Abrir/CSV), e COM FALHAS (com opcoes Ver parcial/Retry). Cada relatorio pode ser expandido para ver detalhes completos.

**Nota:** Usa rota `/report-jobs` (nao `/reports`) para evitar conflito com `src/app/admin/reports/` existente (feature client_reports).

**Nota:** A pagina de detalhe le dados de `report_jobs.result` JSONB (snapshot populado por RG-5), NAO de `store_revenue_summary` diretamente. Isso garante que relatorios antigos continuem visiveis apos TTL do cache expirar.

**Nota:** Depende de `GET /api/reports` list endpoint adicionado em RG-4.

### Layout da Pagina

```
[+ Gerar novo relatorio]

PENDENTES (2)
  ├── Report Card: 20 jan - 18 fev 2026 | 3/8 lojas | [===---] 37%
  └── Report Card: 01 mar - 18 mar 2026 | Na fila...

CONCLUIDOS (5)
  ├── Report Card: 01-31 dez 2025 | 8/8 lojas | [Abrir] [CSV]
  └── ...

COM FALHAS (1)
  └── Report Card: 15-28 fev 2026 | 5/8 lojas | [Ver parcial] [Tentar novamente]
```

### Report Detail View

Ao clicar em "Abrir" em um relatorio concluido:
- Banner: datas do range, horario de geracao, contagem de lojas
- Secao "Resumo Geral": cards KPI (receita total, atribuida, recovery rate, breakdown flows/campaigns/SMS)
- Secao "Breakdown por Loja": tabela ordenavel com metricas por loja
- Secao "Metricas de Engajamento": open rate, click rate, leads por loja
- Lojas com erro: inline com warning + motivo + [Tentar novamente]
- Botoes: [Copiar link] [Baixar CSV] [Voltar ao live]

## Tasks

### Task 1 — Criar pagina de listagem
- [ ] Criar `src/app/(dashboard)/report-jobs/page.tsx`
- [ ] Fetch de relatorios via `GET /api/reports` (criado em RG-4) com SWR
- [ ] Suportar paginacao cursor-based (20 por pagina)
- [ ] Agrupar relatorios em 3 secoes: pendentes, concluidos, com falhas
- [ ] Pendentes = status `queued` + `processing` + `paused`
- [ ] Concluidos = status `completed` + `partial`
- [ ] Com falhas = status `failed`
- [ ] Ordenar por `created_at DESC` dentro de cada secao
- [ ] Botao `[+ Gerar novo relatorio]` no topo que abre dialog de geracao
- [ ] Nota: sidebar link deve apontar para `/report-jobs`
- [ ] Nota: adicionar em `ROUTES.ADMIN`: `REPORT_JOBS: { LIST: '/report-jobs', DETAIL: (id: string) => \`/report-jobs/${id}\` }`

### Task 2 — Criar ReportHistoryList (Organism)
- [ ] Criar `src/components/reports/report-history-list.tsx`
- [ ] Recebe lista de relatorios e agrupa por secao
- [ ] Cada secao tem titulo com contagem: "PENDENTES (2)", "CONCLUIDOS (5)", "COM FALHAS (1)"
- [ ] Secoes vazias nao renderizam
- [ ] Estado vazio (nenhum relatorio): mensagem + CTA para gerar primeiro relatorio

### Task 3 — Criar ReportHistoryCard (Molecule)
- [ ] Criar `src/components/reports/report-history-card.tsx`
- [ ] Props: report job data (id, dates, status, progress, store count)
- [ ] Pendentes: mostrar Progress bar do shadcn/ui com contagem "3/8 lojas"
- [ ] Concluidos: mostrar botoes [Abrir] e [CSV]
- [ ] Parciais: mostrar "7/8 lojas" com warning icon + [Ver parcial] [CSV]
- [ ] Falhas: mostrar motivo resumido + [Ver parcial] (se ha dados) + [Tentar novamente]
- [ ] Pausados: mostrar "Pausado" + motivo + [Retomar]
- [ ] Todos: mostrar data de criacao em formato relativo (ex: "ha 2 horas")

### Task 4 — Criar report detail view
- [ ] Criar `src/app/(dashboard)/report-jobs/[id]/page.tsx`
- [ ] Fetch do job e ler dados de `report_jobs.result` JSONB (snapshot de RG-5), NAO de `store_revenue_summary`
- [ ] Se `result` estiver vazio/null (relatorio expirado ou incompleto): mostrar mensagem "Relatorio expirado" + botao [Gerar novamente] que pre-preenche os mesmos parametros
- [ ] Banner informativo: "Relatorio: {start} — {end} | Gerado {date} as {time} | {n}/{total} lojas"
- [ ] Secao "Resumo Geral": cards com receita total, receita atribuida, flows revenue, campaigns revenue
- [ ] Secao "Breakdown por Loja": tabela ordenavel (store name, revenue, flows, campaigns, % do total)
- [ ] Secao "Metricas de Engajamento": open rate, click rate por loja
- [ ] Lojas com erro: linha inline com warning icon + motivo do erro + [Tentar novamente] individual
- [ ] Botoes no topo: [Copiar link] [Baixar CSV] [Voltar ao live]

### Task 5 — Dialog para gerar novo relatorio
- [ ] Reusar logica de geracao de RG-4 (POST /api/reports/generate)
- [ ] Dialog com: date range picker, selecao de lojas (todas ou especificas), botao [Gerar]
- [ ] Apos gerar: fechar dialog e mostrar novo relatorio na secao PENDENTES
- [ ] Deduplicacao: se ja existe job para mesmo range + lojas, mostrar aviso e link para o existente

### Task 6 — Retry individual de loja com falha
- [ ] Botao [Tentar novamente] por loja com erro no detail view
- [ ] Retry cria um NOVO mini-job via `POST /api/reports/generate` com apenas aquele `store_id` e mesmo date range — reutiliza pipeline inteiro (generate → process)
- [ ] Mini-job aparece na secao PENDENTES (novo job, nao modifica o original)
- [ ] Feedback visual: spinner na loja durante reprocessamento
- [ ] Apos conclusao do mini-job, resultado visivel como job separado no historico

### Task 7 — Paginacao na listagem
- [ ] Implementar paginacao cursor-based no fetch de relatorios (20 por pagina)
- [ ] Botao "Carregar mais" ou infinite scroll no final da lista
- [ ] Cursor passado via query param `?cursor=xxx` para `GET /api/reports`

### Task 8 — Testes
- [ ] Teste: pagina renderiza 3 secoes corretamente agrupadas
- [ ] Teste: secoes vazias nao aparecem
- [ ] Teste: estado vazio mostra mensagem + CTA
- [ ] Teste: ReportHistoryCard renderiza corretamente para cada status
- [ ] Teste: click em [Abrir] navega para `/report-jobs/{id}`
- [ ] Teste: detail view renderiza dados de `report_jobs.result` (nao de cache tables)
- [ ] Teste: detail view mostra "Relatorio expirado" + [Gerar novamente] quando result e null
- [ ] Teste: lojas com erro mostram warning inline + botao retry
- [ ] Teste: [Tentar novamente] cria mini-job e mostra spinner
- [ ] Teste: dialog de gerar novo relatorio abre e submete corretamente
- [ ] Teste: paginacao carrega proxima pagina corretamente

## Acceptance Criteria

### RG-7.1 — Pagina acessivel via sidebar
- [ ] Link "Relatorios" na sidebar navega para `/report-jobs`
- [ ] Pagina carrega e mostra relatorios do usuario autenticado
- [ ] Paginacao cursor-based com 20 itens por pagina

### RG-7.2 — Secoes agrupadas corretamente
- [ ] PENDENTES mostra relatorios queued/processing/paused com progress bar
- [ ] CONCLUIDOS mostra relatorios completed/partial com botoes Abrir/CSV
- [ ] COM FALHAS mostra relatorios failed com Ver parcial/Tentar novamente
- [ ] Secoes vazias nao renderizam
- [ ] Contagem correta no titulo de cada secao

### RG-7.3 — Report detail view renderiza completo (lendo de result JSONB)
- [ ] Dados lidos de `report_jobs.result` JSONB (snapshot de RG-5), NAO de `store_revenue_summary`
- [ ] Banner com datas, horario de geracao, contagem de lojas
- [ ] Resumo Geral com cards KPI
- [ ] Breakdown por Loja com tabela ordenavel
- [ ] Metricas de Engajamento por loja
- [ ] Lojas com erro inline com warning + motivo + retry
- [ ] Botoes: Copiar link, Baixar CSV, Voltar ao live
- [ ] Relatorio expirado (result null): mostra "Relatorio expirado" + [Gerar novamente] com mesmos parametros

### RG-7.4 — Retry de loja individual funciona
- [ ] Click em [Tentar novamente] cria novo mini-job via generate com apenas aquele store_id e mesmo date range
- [ ] Reutiliza pipeline inteiro (generate → process), nao endpoint dedicado de retry
- [ ] Feedback visual durante reprocessamento (spinner)
- [ ] Mini-job aparece como job separado no historico

### RG-7.5 — Gerar novo relatorio via dialog
- [ ] Botao [+ Gerar novo relatorio] abre dialog
- [ ] Dialog permite selecionar date range e lojas
- [ ] Submit cria job e mostra na secao PENDENTES

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/app/(dashboard)/report-jobs/page.tsx` | CREATE | Pagina de listagem/historico de relatorios |
| `src/app/(dashboard)/report-jobs/[id]/page.tsx` | CREATE | Pagina de detalhe de relatorio individual |
| `src/components/reports/report-history-list.tsx` | CREATE | Organism: lista agrupada de relatorios |
| `src/components/reports/report-history-card.tsx` | CREATE | Molecule: card individual de relatorio |
| `src/components/reports/report-history-list.test.tsx` | CREATE | Testes do ReportHistoryList |
| `src/components/reports/report-history-card.test.tsx` | CREATE | Testes do ReportHistoryCard |

## Testing Notes

- Mockar dados de `report_jobs` para simular os diferentes status
- Testar agrupamento com combinacoes: so pendentes, so concluidos, mix de todos
- Testar detail view com relatorio parcial (algumas lojas OK, algumas com erro)
- Testar retry individual mockando endpoint de reprocessamento
- Verificar que tabela de breakdown e ordenavel (click no header)
- Testar responsividade em telas menores

## Technical Notes

- A pagina de listagem usa `GET /api/reports` (RG-4) — verificar que retorna todos os campos necessarios
- O detail view le dados de `report_jobs.result` JSONB (snapshot populado por RG-5), NAO de `store_revenue_summary` — isso garante que relatorios antigos continuam visiveis apos TTL do cache expirar
- Retry de loja individual cria novo mini-job via `POST /api/reports/generate` com 1 store_id + mesmo date range — reutiliza pipeline inteiro
- Botao [Baixar CSV] link para endpoint de export (RG-8) — pode ser implementado como disabled ate RG-8
- Botao [Copiar link] copia URL da pagina de detalhe para clipboard
- [Voltar ao live] navega para o dashboard principal com periodo padrao
- Reusar componentes shadcn/ui: Card, Progress, Badge, Table, Dialog, Button, ScrollArea, Skeleton
- Usar `date-fns` para formatacao de datas e tempos relativos
- Rota `/report-jobs` (nao `/reports`) para evitar conflito com `src/app/admin/reports/` existente
- Adicionar `ROUTES.ADMIN.REPORT_JOBS: { LIST: '/report-jobs', DETAIL: (id: string) => \`/report-jobs/${id}\` }`

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Detail view pesado com muitas lojas | Paginacao ou virtual scroll na tabela de breakdown. Limitar a 50 lojas inicialmente |
| Retry de loja individual | Cria novo mini-job (nao modifica original). Reutiliza pipeline generate→process inteiro |
| Reports expirados (result null) | Mostrar "Relatorio expirado" + botao [Gerar novamente] que pre-preenche mesmos parametros |
| Dialog de geracao duplica job existente | Verificar deduplicacao antes de criar (mesmo range + mesmas lojas = retornar existente) |
| Conflito de rota com /reports existente | Usar `/report-jobs` para evitar conflito com `src/app/admin/reports/` |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
| 2026-03-18 | @review | Rotas alteradas de /reports para /report-jobs (conflito com admin/reports). Detail le de result JSONB (nao cache). Retry cria mini-job (nao endpoint dedicado). Paginacao cursor-based adicionada. Handle relatorios expirados. Dependencia explicitada: RG-4 + RG-6 |
