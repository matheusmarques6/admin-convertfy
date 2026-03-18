# Feature Spec: Geracao de Relatorios Personalizados (Background Reports)

## Resumo
O admin panel permite gerar relatorios com datas personalizadas para multiplas lojas. O processamento ocorre em background (server-side), sobrevive a fechamento de browser, e notifica o operador quando completo. Resultados ficam salvos no banco para acesso posterior.

## Problema
- Custom date ranges para multi-store = ~12s por loja (3 XS-tier API calls)
- 10+ lojas = 30-60s+ (excede timeout do Vercel de 60s)
- Resultados nao sao cacheados — mesmo request = mesmas API calls

## Arquitetura

### Opcao Escolhida: Cache Inteligente + Fan-Out + Job Queue

1. **Write-through cache** em `store_revenue_summary` para custom ranges
2. **Fan-out client-side**: 1 fetch por loja, card preenche conforme resolve
3. **Job queue** no Supabase para multi-store: function processa 4-5 lojas por invocacao, chaining para continuar
4. **Notificacao in-app** quando relatorio completa

### Schema Migration
```sql
ALTER TABLE store_revenue_summary
  ADD COLUMN range_start date,
  ADD COLUMN range_end date;

ALTER TABLE store_revenue_summary
  ADD CONSTRAINT chk_custom_range_dates CHECK (
    (period_label = 'custom' AND range_start IS NOT NULL AND range_end IS NOT NULL)
    OR (period_label != 'custom' AND range_start IS NULL AND range_end IS NULL)
  );

CREATE UNIQUE INDEX uq_store_custom_range
  ON store_revenue_summary (store_id, range_start, range_end)
  WHERE period_label = 'custom';
```

### Nova Tabela: report_jobs
```sql
CREATE TABLE report_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  store_ids UUID[] NOT NULL,
  period TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'queued',
  progress JSONB DEFAULT '{}',
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days'
);
```

### TTL Strategy
| Condicao | TTL |
|----------|-----|
| end_date < hoje - 7 dias (historico) | 30 dias |
| end_date < hoje (recente) | 6 horas |
| end_date >= hoje, range > 30 dias | 2 horas |
| end_date >= hoje, range <= 30 dias | 30 minutos |

## Integracao no Codigo (arquivos existentes)

| Componente | Arquivo | Linhas | Mudanca |
|-----------|---------|--------|---------|
| Period picker + "Gerar Relatorio" | `src/components/stores/store-performance-kpis.tsx` | 62-100 | Botao muda quando custom |
| DateRangePicker | `src/components/ui/date-range-picker.tsx` | 66-115 | Nenhuma (ja funciona) |
| Revenue cards (admin) | `src/components/stores/store-performance-kpis.tsx` | 128-208 | Badge "(parcial)" durante geracao |
| Revenue cards (portal) | `src/app/client/dashboard/hero-section.tsx` | 22-60 | Idem |
| Store breakdown table | `src/components/stores/store-control-panel.tsx` | 69-99 | Coluna status com icones |
| Sidebar + notificacao | `src/components/layout/sidebar.tsx` | 279-353 | NotificationBell acima do avatar |
| Tab "Relatorio" (loja) | `src/components/stores/store-detail-tabs.tsx` | 250 | Ja existe — conectar ao historico |
| Pagina Relatorios | sidebar.tsx linha 84 | Ja existe no menu | Criar page em `src/app/admin/reports/` |

## UX Wireframes

### Period Picker com "Gerar Relatorio"
Quando o operador seleciona "Personalizado" no date picker:
- Botao "Aplicar" muda para "Gerar Relatorio ->"
- Info text: "Periodos personalizados sao processados em segundo plano (~12s por loja)"

### Dashboard durante geracao (Progressive Loading)
- Banner no topo: "Gerando relatorio: 20 jan — 18 fev 2026 | 3 de 8 lojas | ~1 min restante | [barra progresso 37%]"
- Hint: "Voce pode sair. Avisaremos quando concluir."
- Revenue cards mostram dados parciais com badge "(parcial)"
- Tabela de lojas: check (OK), spinner (processando), clock (fila), warning (erro)

### Notificacao (sino na sidebar)
- Bell icon com badge vermelho na sidebar (acima do avatar)
- Popover mostra: relatorios prontos, em andamento, e com falha
- Click no pronto -> navega direto para o relatorio

### Relatorio completo
- Banner informativo: "Relatorio: 20 jan — 18 fev 2026 | Gerado 18 mar as 14:32 | 7/8 lojas"
- Botoes: [Copiar link] [Baixar CSV] [Voltar ao live]
- Secao "Resumo Geral": cards de receita total, atribuido, recovery rate, breakdown flows/campaigns/SMS
- Secao "Breakdown por Loja": tabela ordenavel com receita, flows, campaigns, % do total
- Secao "Metricas de Engajamento": open rate, click rate, leads, engajamento por loja
- Lojas com erro: inline com warning + motivo + [Tentar novamente]

### Pagina Historico de Relatorios
- Acessivel via sidebar -> Relatorios
- Secoes: PENDENTES (com progress bar), CONCLUIDOS (com Abrir/Baixar CSV), COM FALHAS (com Ver parcial/Tentar novamente)
- Botao [+ Gerar novo relatorio]

## Tratamento de Erros

### 1. Loja individual falha
- Outras lojas continuam normalmente
- Relatorio fica "parcial" (7/8 lojas)
- Motivo especifico mostrado (permissao, key invalida, timeout)
- [Tentar novamente] so para aquela loja

### 2. Rate limit Klaviyo (429)
- Job pausa (nao descarta o que ja fez)
- Lojas processadas ficam salvas
- Operador pode ver resultado parcial
- "Continuar amanha" quando quota resetar

### 3. Timeout Vercel (60s)
- Function processa 4-5 lojas por invocacao
- Salva progresso antes de 55s e dispara proxima invocacao (chaining)
- Cleanup job detecta jobs "stuck" (>5min sem update)

### 4. Browser fecha durante geracao
- Job continua server-side (desacoplado)
- Ao reabrir: notificacao se completou, ou progress bar retoma

### 5. Double-click / 2 tabs
- Deduplicacao: verifica se ja existe job para mesmo cliente + range
- Retorna job existente, ambos tabs veem mesmo progresso

### 6. Supabase fora do ar
- Loja marcada como "erro temporario"
- Job continua com proximas lojas
- Retry na proxima tentativa

### 7. Todas as lojas falham
- Status "failed" com mensagem explicativa
- [Tentar novamente] + [Ver detalhes dos erros]
- Detalhes: cada loja com seu motivo especifico

## Status do Job

| Status | Quando | UX |
|--------|--------|-----|
| queued | Criado, aguardando | spinner "Na fila..." |
| processing | Function rodando | Progress bar + lojas completando |
| completed | Todas OK | check "Pronto" + notificacao |
| partial | Algumas falharam | warning "7/8 lojas" + dados parciais |
| paused | Rate limit/timeout | pause "Pausado" + [Retomar] |
| failed | Todas falharam | x "Falhou" + [Tentar novamente] |
| cancelled | Operador cancelou | cancel "Cancelado" |
| expired | TTL venceu (7d) | clock "Expirado" + [Gerar novamente] |

## Componentes Novos

| Componente | Tipo | Descricao |
|-----------|------|-----------|
| ReportGenerationBanner | Molecule | Banner de progresso no dashboard |
| NotificationBell | Molecule | Sino + badge + popover na sidebar |
| NotificationItem | Atom | Linha individual de notificacao |
| ReportHistoryList | Organism | Lista agrupada de relatorios |
| ReportHistoryCard | Molecule | Card individual de relatorio |
| StoreProcessingRow | Molecule | Linha da tabela com status em tempo real |
| ReportConfirmDialog | Molecule | Dialog de confirmacao antes de gerar |

## Componentes shadcn/ui Reutilizados
Dialog, Calendar, Progress, Badge, Card, Popover, ScrollArea, Tooltip, Button, Table, Skeleton

## Microcopy (Portugues BR)
- Botao: "Gerar Relatorio"
- Confirmacao: "O processamento ocorre em segundo plano. Voce pode fechar esta pagina."
- Banner loading: "Gerando relatorio: {start} — {end} | {n} de {total} lojas | ~{time} restante"
- Notificacao: "Relatorio pronto" / "Gerando relatorio..." / "Relatorio falhou"
- Historico: "PENDENTES" / "CONCLUIDOS" / "COM FALHAS"

## Fases de Implementacao

### Fase 1 — Write-through cache (story RG-1)
- Persistir resultados de custom ranges em store_revenue_summary
- Migration: range_start + range_end columns
- TTL tiered por tipo de range
- 2o acesso = instantaneo

### Fase 2 — Fan-out progressivo + Progress (stories RG-2, RG-3)
- Frontend: fetch individual por loja, card preenche conforme resolve
- Progress bar deterministico: "8/12 lojas carregadas"
- Skeleton -> dados reais por loja

### Fase 3 — Job Queue + Notificacao (stories RG-4, RG-5, RG-6)
- Tabela report_jobs no Supabase
- API: POST /api/reports/generate, GET /api/reports/{id}
- Function chaining (4-5 lojas por invocacao)
- NotificationBell na sidebar
- Polling com SWR (3s durante geracao)

### Fase 4 — Historico + Export (stories RG-7, RG-8)
- Pagina /admin/reports com historico agrupado
- Baixar CSV
- Cleanup de reports expirados
