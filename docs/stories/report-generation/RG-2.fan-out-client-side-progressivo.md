---
Prioridade: High
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "2 - Progressive Loading (UX)"
Esforco: MEDIUM
Dependencias: RG-1
---

# Story RG-2 — Fan-out Client-side Progressivo

## Story

**Como** operador do admin panel que gera relatorios de multiplas lojas,
**Quero** que cada loja carregue independentemente e exiba dados conforme resolve,
**Para que** eu veja resultados parciais imediatamente sem esperar a loja mais lenta.

## Contexto

### Problema

Atualmente, o dashboard faz uma unica chamada que busca dados de TODAS as lojas e so renderiza quando tudo completa. Com 10+ lojas a ~12s cada, o operador fica olhando um spinner por 1-2 minutos sem feedback.

### Solucao

Mudar para fan-out client-side: o frontend dispara 1 fetch por loja com concurrency limitada (semaphore de 5). Cada card/row preenche individualmente conforme sua resposta chega. Lojas com cache (via RG-1) aparecem instantaneamente, lojas sem cache carregam em ~12s cada.

Fan-out client-side e usado para **<=5 lojas**. Para 6+ lojas, o sistema usa job queue em background (RG-4/RG-5). O componente detecta a quantidade de lojas e chama o endpoint apropriado.

### Pagina alvo

O fan-out aplica-se a pagina admin de overview de lojas (`store-control-panel.tsx`), onde o operador ve TODAS as lojas simultaneamente. O componente `store-performance-kpis.tsx` exibe KPIs agregados de UMA unica loja e NAO usa fan-out.

### UX Flow

1. Operador seleciona custom range e clica "Gerar Relatorio"
2. Dashboard mostra skeleton cards para todas as lojas
3. Conforme cada fetch resolve: skeleton → dados reais (com animacao suave)
4. Lojas com cache aparecem em <100ms, lojas sem cache em ~12s
5. Se uma loja falha: card mostra estado de erro com motivo

### Dependencia de RG-1

O fan-out se beneficia do write-through cache (RG-1). Lojas ja consultadas retornam instantaneamente do cache. Sem RG-1, TODAS as lojas fariam API calls e o fan-out seria apenas visual.

### Relacao com RG-4 (Job Queue)

Resultados do fan-out sao persistidos via write-through cache (RG-1). Se o usuario solicitar relatorio para 6+ lojas, o sistema cria um job (RG-4) em vez de usar fan-out.

## Tasks

### Task 1 — Refatorar store-performance-kpis.tsx para fetch individual
- [ ] Substituir fetch unico (todas as lojas) por array de fetches individuais
- [ ] Cada fetch chama a API de summary para 1 loja + custom range
- [ ] Usar `Promise.allSettled()` para nao bloquear em falhas individuais
- [ ] Manter estado por loja: `loading | success | error`
- [ ] Renderizar skeleton enquanto `loading`, dados reais quando `success`, erro quando `error`

### Task 2 — Atualizar store-control-panel.tsx para loading progressivo
- [ ] Tabela de lojas mostra skeleton row para cada loja inicialmente
- [ ] Conforme fetch de cada loja resolve: substituir skeleton pela row com dados
- [ ] Manter ordenacao estavel (nao reordenar conforme chegam)
- [ ] Row com erro mostra icone de warning + tooltip com motivo
- [ ] Totais (footer) atualizam progressivamente conforme lojas carregam

### Task 3 — State management para fan-out
- [ ] Criar hook `useStoresFanOut(storeIds: string[], range: DateRange)` que gerencia o fan-out
- [ ] Hook retorna: `{ stores: Map<string, StoreLoadState>, completedCount: number, totalCount: number, isAllDone: boolean }`
- [ ] `StoreLoadState = { status: 'queued' | 'loading' | 'success' | 'error', data?: StoreSummary, error?: string }`
- [ ] Hook dispara fetches com concurrency limitada ao montar (ou quando range muda)
- [ ] Hook suporta abort via AbortController quando componente desmonta ou range muda

### Task 3.1 — Implementar semaphore de 5 fetches concorrentes no hook `useStoresFanOut`
- [ ] Implementar simple queue/semaphore pattern: processar 5 lojas por vez, enfileirar o restante
- [ ] Lojas aguardando na fila tem status `queued`, lojas em fetch ativo tem status `loading`
- [ ] Conforme um fetch completa (success ou error), a proxima loja na fila inicia automaticamente
- [ ] Limite de 5 concorrentes respeita limite de 6 conexoes por origin do browser e mitiga rate limits compostos da Klaviyo API
- [ ] Cada fetch individual chama o endpoint existente de report com `storeId` + custom date range params (ex: `GET /api/integrations/klaviyo/report?storeId={id}&start={start}&end={end}`)

### Task 4 — Skeleton components
- [ ] Criar skeleton variant para revenue cards (mantendo layout identico)
- [ ] Criar skeleton variant para table rows
- [ ] Transicao suave skeleton → dados reais (fade-in, sem layout shift)
- [ ] Skeleton usa shadcn/ui `<Skeleton>` component existente

### Task 5 — Testes
- [ ] Teste: 3 lojas, todas resolvem → todos cards preenchidos
- [ ] Teste: 1 loja falha, 2 resolvem → 2 cards ok, 1 card erro
- [ ] Teste: loja com cache retorna antes de loja sem cache
- [ ] Teste: abort ao desmontar componente cancela fetches pendentes
- [ ] Teste: mudar range cancela fetches anteriores e inicia novos
- [ ] Teste: totais atualizam corretamente conforme lojas carregam

## Acceptance Criteria

### RG-2.1 — Cada loja carrega independentemente
- [ ] Cada loja faz seu proprio fetch (1 request por loja)
- [ ] Loja com cache (RG-1) aparece em <200ms
- [ ] Loja sem cache aparece em ~12s (tempo da API Klaviyo)
- [ ] Uma loja lenta NAO bloqueia as outras

### RG-2.2 — Resultados parciais exibidos
- [ ] Cards de receita mostram dados conforme chegam (nao esperam todas)
- [ ] Tabela de lojas preenche progressivamente
- [ ] Totais (receita agregada) atualizam conforme mais lojas completam
- [ ] Nao ha reordenacao visual durante carregamento

### RG-2.3 — Skeleton → dados reais
- [ ] Skeleton cards exibidos durante loading
- [ ] Transicao skeleton → dados sem layout shift
- [ ] Skeleton tem dimensoes identicas aos cards reais

### RG-2.4 — Error handling por loja
- [ ] Loja com erro mostra estado de erro no card e na tabela
- [ ] Tooltip com motivo do erro (permissao, key invalida, timeout)
- [ ] Lojas com erro nao impedem exibicao das lojas OK
- [ ] Totais calculados apenas com lojas que completaram com sucesso

### RG-2.5 — Cleanup e abort
- [ ] Sair da pagina cancela fetches pendentes (sem memory leak)
- [ ] Mudar date range cancela fetches do range anterior
- [ ] AbortController usado em todos os fetches

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/stores/store-performance-kpis.tsx` | MODIFY | Refatorar para fan-out: 1 fetch por loja, skeleton → dados |
| `src/components/stores/store-control-panel.tsx` | MODIFY | Loading progressivo na tabela, totais incrementais |
| `src/hooks/use-stores-fan-out.ts` | CREATE | Hook para gerenciar fan-out: fetches paralelos, state por loja, abort |
| `src/hooks/use-stores-fan-out.test.ts` | CREATE | Testes do hook: resolve, falha parcial, abort, re-fetch |
| `src/types/report.ts` | CREATE | Types: StoreLoadState, FanOutResult |

## Testing Notes

- Simular latencia variavel entre lojas para verificar progressive loading
- Testar com 1 loja, 5 lojas, e 15+ lojas
- Verificar que abort funciona (sem console errors de "state update on unmounted component")
- Testar transicao skeleton → dados em tela pequena e grande
- Performance: verificar que 15 fetches simultaneos nao causam problemas no browser

## Technical Notes

- `Promise.allSettled` e preferivel a `Promise.all` — nao rejeita se uma loja falha
- AbortController: criar 1 controller por "batch" de fetches, abort all on cleanup
- Skeleton: usar `<Skeleton>` do shadcn/ui, nao criar custom
- Nao alterar a API route — cada fetch individual chama o endpoint existente de report (ex: `GET /api/integrations/klaviyo/report?storeId={id}&start={start}&end={end}`)
- Considerar usar `useSWR` com key por loja para deduplicacao automatica e revalidation

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Muitos fetches simultaneos causam rate limit no server | Limitar a 5 fetches concorrentes com semaphore/queue |
| Layout instavel durante carregamento progressivo | Skeleton com dimensoes fixas, sem reordenacao |
| Memory leak se componente desmonta durante fetch | AbortController em todos os fetches + cleanup no useEffect |
| Totais parciais confundem o operador | Badge "(parcial)" nos totais enquanto nem todas carregaram (RG-3 detalha) |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
