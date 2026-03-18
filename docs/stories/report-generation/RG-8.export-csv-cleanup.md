---
Prioridade: Low
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "4 - Historico + Export (Polish)"
Esforco: LOW
Dependencias: RG-7
---

# Story RG-8 — Export CSV + Cleanup

## Story

**Como** operador do admin panel que gerou um relatorio,
**Quero** baixar os dados como CSV e que relatorios expirados sejam automaticamente removidos,
**Para que** eu possa analisar dados offline no Excel e o banco nao acumule relatorios obsoletos.

## Contexto

### Problema

Relatorios gerados ficam apenas no admin panel. Operadores precisam compartilhar dados com clientes ou analisar em planilhas. Alem disso, relatorios tem TTL de 7 dias (`expires_at`) mas nao ha mecanismo para limpar os expirados.

### Solucao

1. **Export CSV**: Endpoint que gera CSV com dados completos do relatorio (todas as lojas, todas as metricas). Encoding UTF-8 BOM para compatibilidade com Excel.
2. **Cleanup**: Funcao que remove `report_jobs` expirados e entradas orfas em `store_revenue_summary` com custom ranges expirados.

### CSV Format

```csv
Loja,Receita Total,Receita Atribuida,Receita Flows,Receita Campaigns,Open Rate,Click Rate,Leads,Status
Loja ABC,R$ 15.200,R$ 12.300,R$ 8.100,R$ 4.200,22.5%,3.8%,145,OK
Loja XYZ,R$ 8.900,R$ 6.700,R$ 4.500,R$ 2.200,18.3%,2.9%,89,OK
Loja DEF,—,—,—,—,—,—,—,Erro: API key invalida
```

## Tasks

### Task 1 — Criar endpoint de export CSV
- [ ] Criar `src/app/api/reports/export/route.ts`
- [ ] GET handler que recebe `?jobId={id}` como query param
- [ ] Validar que job pertence ao usuario autenticado (via org_id)
- [ ] Buscar dados de `report_jobs.result` JSONB (snapshot dos dados no momento da geracao), NAO de `store_revenue_summary` diretamente
- [ ] Buscar progress do job para identificar lojas com erro

### Task 2 — Gerar CSV com encoding correto
- [ ] Gerar conteudo CSV com colunas: Loja, Receita Total, Receita Atribuida, Receita Flows, Receita Campaigns, Open Rate, Click Rate, Leads, Status
- [ ] Formatar valores monetarios usando `storeCurrencyMap` (ja implementado no Epic 45.3 via `resolvePortalClient()`) para currency correto de cada loja — NAO usar "R$" hardcoded
- [ ] Formatar percentuais com 1 casa decimal (ex: "22.5%")
- [ ] Lojas com erro: preencher metricas com "—" e Status com "Erro: {motivo}"
- [ ] Adicionar UTF-8 BOM (`\uFEFF`) no inicio do arquivo para compatibilidade Excel
- [ ] Headers de resposta: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="relatorio-{start}-{end}.csv"`

### Task 2.1 — Sanitizar valores CSV contra injection
- [ ] Extrair utility `sanitizeCsvValue(value: string): string` reutilizavel em `src/lib/utils/csv.ts`
- [ ] Escapar celulas que comecam com `=`, `+`, `-`, `@` prefixando com `'` (single quote)
- [ ] Aplicar `sanitizeCsvValue()` em TODOS os valores antes de escrever no CSV
- [ ] Testar com valores maliciosos: `=CMD('calc')`, `+cmd|' /C calc'!A0`, `-1+1`, `@SUM(A1)`

### Task 3 — Linha de resumo no CSV
- [ ] Adicionar linha em branco apos os dados
- [ ] Linha de totais: "TOTAL", soma receita total, soma receita atribuida, soma flows, soma campaigns, media ponderada rates, soma leads, "{n}/{total} lojas"
- [ ] Linha de metadados: "Gerado em: {date}", "Periodo: {start} a {end}"

### Task 4 — Cleanup de reports expirados
- [ ] Criar `src/app/api/reports/cleanup/route.ts`
- [ ] Endpoint usa `requireCronAuth()` com `CRON_SECRET` header (mesmo padrao do cron sync existente)
- [ ] DELETE de `report_jobs` em batches de 100 com `FOR UPDATE SKIP LOCKED` para evitar long locks:
```sql
WITH expired AS (
  SELECT id FROM report_jobs
  WHERE expires_at < NOW() AND status NOT IN ('processing')
  LIMIT 100
  FOR UPDATE SKIP LOCKED
)
DELETE FROM report_jobs WHERE id IN (SELECT id FROM expired);
```
- [ ] Repetir batch delete em loop ate 0 rows affected
- [ ] Retornar contagem total de registros removidos

### Task 4.1 — Configurar Vercel cron para cleanup
- [ ] Adicionar cleanup job ao `vercel.json` crons array:
```json
{ "path": "/api/reports/cleanup", "schedule": "0 3 * * *" }
```

### Task 5 — Cleanup de cache orfao em store_revenue_summary
- [ ] Deletar custom range rows baseado em idade: `WHERE period_label = 'custom' AND fetched_at < NOW() - INTERVAL '30 days'`
- [ ] Custom ranges criados pelo write-through (RG-1) sao validos independente de ter job associado — usar idade como criterio, NAO presenca de job
- [ ] Deletar orfaos no mesmo batch do cleanup de jobs
- [ ] Log da quantidade de orfaos removidos

### Task 6 — Conectar botao [Baixar CSV] na UI
- [ ] No `report-history-card.tsx` (RG-7): botao [CSV] faz download via `window.open()` ou `fetch()` + blob
- [ ] No detail view `reports/[id]/page.tsx` (RG-7): botao [Baixar CSV] faz o mesmo
- [ ] Mostrar loading state durante download
- [ ] Tratar erro: se export falha, mostrar toast com mensagem

### Task 7 — Testes
- [ ] Teste: CSV gerado com colunas corretas e dados formatados
- [ ] Teste: UTF-8 BOM presente no inicio do arquivo
- [ ] Teste: Content-Disposition tem filename correto com datas do range
- [ ] Teste: lojas com erro mostram "—" nas metricas e motivo no Status
- [ ] Teste: linha de totais com somas corretas
- [ ] Teste: cleanup remove jobs expirados
- [ ] Teste: cleanup remove orfaos em store_revenue_summary
- [ ] Teste: cleanup nao remove jobs/cache validos
- [ ] Teste: endpoint de cleanup rejeita chamadas nao autorizadas

## Acceptance Criteria

### RG-8.1 — CSV baixa corretamente
- [ ] Click em [Baixar CSV] faz download de arquivo .csv
- [ ] Arquivo contem todas as lojas com todas as metricas
- [ ] Valores monetarios e percentuais formatados corretamente
- [ ] Lojas com erro aparecem com "—" e motivo

### RG-8.2 — CSV abre no Excel sem problemas de encoding
- [ ] Arquivo tem UTF-8 BOM
- [ ] Caracteres acentuados (portugues) renderizam corretamente no Excel
- [ ] Separador de colunas e virgula (CSV padrao)

### RG-8.3 — Cleanup remove reports expirados
- [ ] Jobs com `expires_at < now()` sao deletados
- [ ] Dados associados em `store_revenue_summary` (custom ranges) sao limpos
- [ ] Registros validos nao sao afetados

### RG-8.4 — Cleanup remove cache orfao
- [ ] Rows em `store_revenue_summary` com `period_label = 'custom'` sem job associado e TTL expirado sao removidos
- [ ] Cache de periodos padrao (7d, 30d, etc.) nao e afetado

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/app/api/reports/export/route.ts` | CREATE | Endpoint de export CSV (le de report_jobs.result JSONB) |
| `src/app/api/reports/cleanup/route.ts` | CREATE | Endpoint de cleanup de expirados e orfaos (requireCronAuth) |
| `src/app/api/reports/export/route.test.ts` | CREATE | Testes do export CSV |
| `src/app/api/reports/cleanup/route.test.ts` | CREATE | Testes do cleanup |
| `src/lib/utils/csv.ts` | CREATE | Utility: sanitizeCsvValue() contra CSV injection |
| `src/components/reports/report-history-card.tsx` | MODIFY | Conectar botao [CSV] ao endpoint de export |
| `src/app/(dashboard)/reports/[id]/page.tsx` | MODIFY | Conectar botao [Baixar CSV] ao endpoint de export |
| `vercel.json` | MODIFY | Adicionar cron cleanup schedule |

## Testing Notes

- Testar CSV abrindo no Excel e no Google Sheets (verificar encoding)
- Testar cleanup com mix de jobs expirados e validos
- Testar cleanup com orfaos em store_revenue_summary
- Verificar que cleanup nao deleta cache do cron sync (period_label != 'custom')
- Testar export com relatorio parcial (lojas OK + lojas com erro)
- Testar export com relatorio vazio (todas lojas falharam)

## Technical Notes

- UTF-8 BOM: `\uFEFF` deve ser o primeiro caractere do response body
- Para download no browser: retornar Response com headers corretos, ou usar blob + URL.createObjectURL no client
- Cleanup executado via Vercel Cron (`vercel.json`, daily 3am UTC) e autenticado via `requireCronAuth()` com `CRON_SECRET`
- Cleanup usa batch delete com `FOR UPDATE SKIP LOCKED` para evitar long locks em tabelas grandes
- O cleanup deve ser idempotente (rodar multiplas vezes sem efeito colateral)
- Formatar moeda usando `storeCurrencyMap` do Epic 45.3 (`resolvePortalClient()`) — NAO hardcoded "R$"
- Para stores com moedas diferentes: coluna mostra valor na moeda original de cada loja
- Export CSV le dados de `report_jobs.result` JSONB (snapshot), NAO de `store_revenue_summary` diretamente
- Orfaos em `store_revenue_summary` sao identificados por idade (`fetched_at < NOW() - 30 days`), NAO por ausencia de job

## Riscos

| Risco | Mitigacao |
|-------|----------|
| CSV muito grande (100+ lojas) impacta memoria | Stream response em vez de gerar string completa. Na pratica, 100 lojas = ~50KB — nao e risco real |
| Cleanup deleta dados ainda em uso | WHERE clause restritiva: apenas `expires_at < now()` e TTL expirado. Nunca deleta jobs com status `processing` |
| Excel interpreta dados como formula (CSV injection) | Task 2.1: `sanitizeCsvValue()` utility escapando `=`, `+`, `-`, `@` com prefixo `'` |
| Cron de cleanup nao executa (Vercel cron falha) | Endpoint pode ser chamado manualmente. Dados expirados nao causam problemas — apenas ocupam espaco |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
