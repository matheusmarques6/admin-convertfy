---
Prioridade: Medium
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "3 - Background Jobs (Core)"
Esforco: MEDIUM
Dependencias: "RG-4 (report_jobs table + GET /api/reports list endpoint + viewed_at column)"
---

# Story RG-6 — NotificationBell + Polling

## Story

**Como** operador do admin panel que gerou um relatorio em background,
**Quero** ver um sino de notificacao na sidebar com badge indicando relatorios prontos,
**Para que** eu saiba quando meus relatorios completaram sem precisar ficar na pagina de geracao.

## Contexto

### Problema

Relatorios processados em background (via job queue) podem levar varios minutos. O operador pode navegar para outras paginas ou ate fechar o browser. Ao retornar, precisa de um indicador claro de que relatorios estao prontos, em andamento, ou falharam.

### Solucao

Criar um componente `NotificationBell` (Molecule) na sidebar, acima do avatar do usuario. O sino mostra um badge vermelho com contagem de relatorios que precisam de atencao. Um popover lista os relatorios agrupados por status. Polling via SWR ajusta o intervalo: 3s durante geracao ativa, 30s quando idle.

### Componentes

```
NotificationBell (Molecule)
  ├── Bell icon (lucide-react)
  ├── Badge count (red dot)
  └── Popover
       └── ScrollArea
            ├── Section: Em andamento (spinner + progress)
            ├── Section: Prontos (check + link)
            └── Section: Com falha (warning + link)
```

## Tasks

### Task 1 — Criar componente NotificationBell
- [ ] Criar `src/components/layout/notification-bell.tsx`
- [ ] Bell icon usando `lucide-react` (Bell ou BellRing)
- [ ] Badge vermelho com contagem no canto superior direito do icone
- [ ] Badge so aparece quando contagem > 0
- [ ] Usar Popover do shadcn/ui para o dropdown
- [ ] Componente aceita props minimas (dados vem de SWR interno)

### Task 2 — Popover com lista de relatorios
- [ ] Dentro do Popover: ScrollArea com max-height
- [ ] Agrupar relatorios por status: em andamento, prontos, com falha
- [ ] Cada item mostra: titulo (range de datas), status icon, tempo relativo (ex: "ha 5 min")
- [ ] Items "prontos": click navega para `/reports/{id}` (ou pagina de relatorios)
- [ ] Items "em andamento": mostrar mini progress (ex: "3/8 lojas")
- [ ] Items "com falha": mostrar motivo resumido + link para detalhes
- [ ] Se nenhum relatorio: mostrar "Nenhuma notificacao"

### Task 3 — Polling com SWR adaptativo
- [ ] Usar `useSWR` para buscar status dos relatorios do usuario via `GET /api/reports?status=active`
- [ ] Interval adaptativo: `refreshInterval` = 5000ms se ha jobs `queued` ou `processing`, 30000ms caso contrario
- [ ] Recalcular intervalo a cada fetch com base nos dados retornados
- [ ] `revalidateOnFocus: true` para atualizar quando usuario volta a tab
- [ ] Badge count = jobs com `status IN ('completed','partial','failed') AND viewed_at IS NULL` + jobs `processing`/`queued`
- [ ] Multi-tab: SWR deduplication funciona apenas dentro da mesma tab. Usar interval de 5s (em vez de 3s) para mitigar polling excessivo com multiplas tabs abertas. Alternativa futura: `BroadcastChannel` API para coordenar entre tabs

### Task 3.1 — Marcar jobs como vistos (`viewed_at`)
- [ ] Ao abrir o popover: marcar todos os jobs visiveis como vistos via `PATCH /api/reports/[id]` com `{ viewed_at: new Date().toISOString() }`
- [ ] Badge count recalcula apos marcar como visto (refetch SWR)
- [ ] A coluna `viewed_at TIMESTAMPTZ` ja existe na tabela `report_jobs` (adicionada em RG-4)

### Task 3.2 — Toast notification para transicoes de status
- [ ] Mostrar toast via `sonner` quando job transiciona para `completed` ou `failed` durante polling
- [ ] Usar `usePrevious` (ou ref) para comparar status anterior com atual em cada poll response
- [ ] Toast de completed: "Relatorio pronto: {range}" com acao de click para navegar
- [ ] Toast de failed: "Relatorio falhou: {range}" com motivo resumido

### Task 4 — Integrar na sidebar
- [ ] Modificar `src/components/layout/sidebar.tsx`
- [ ] NotificationBell e inserido no bottom section da sidebar, entre o ultimo nav item e o UserDropdown/collapse button. Usar o mesmo container flex do bottom section
- [ ] Posicionar de forma consistente com o design existente da sidebar
- [ ] NotificationBell so renderiza quando usuario esta autenticado
- [ ] Responsivo: funciona em sidebar expandida e colapsada

### Task 5 — Testes
- [ ] Teste: badge mostra contagem correta de relatorios ativos (baseado em `viewed_at IS NULL`)
- [ ] Teste: badge oculto quando contagem = 0
- [ ] Teste: popover lista relatorios agrupados por status
- [ ] Teste: click em relatorio pronto navega para a pagina correta
- [ ] Teste: polling interval = 5s quando ha jobs em andamento
- [ ] Teste: polling interval = 30s quando nenhum job ativo
- [ ] Teste: "Nenhuma notificacao" renderiza quando lista vazia
- [ ] Teste: abrir popover marca jobs como vistos (PATCH viewed_at)
- [ ] Teste: toast aparece quando job transiciona para completed/failed

## Acceptance Criteria

### RG-6.1 — Bell com badge na sidebar
- [ ] Bell icon visivel na sidebar acima do avatar
- [ ] Badge vermelho com numero aparece quando ha notificacoes
- [ ] Badge oculto quando nao ha notificacoes

### RG-6.2 — Popover lista relatorios por status
- [ ] Relatorios em andamento mostram progresso (ex: "3/8 lojas")
- [ ] Relatorios prontos mostram check e sao clicaveis
- [ ] Relatorios com falha mostram warning e motivo resumido
- [ ] Mensagem "Nenhuma notificacao" quando lista vazia

### RG-6.3 — Click navega para relatorio
- [ ] Click em relatorio pronto navega para a pagina do relatorio
- [ ] Popover fecha apos navegacao

### RG-6.4 — Polling adaptativo
- [ ] Intervalo de 5s quando ha jobs `queued` ou `processing`
- [ ] Intervalo de 30s quando nenhum job ativo
- [ ] Transicao de intervalo ocorre automaticamente conforme status muda

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/layout/notification-bell.tsx` | CREATE | Componente NotificationBell (Molecule) com badge + popover |
| `src/components/layout/notification-bell.test.tsx` | CREATE | Testes do NotificationBell |
| `src/components/layout/sidebar.tsx` | MODIFY | Adicionar NotificationBell acima do avatar |

## Testing Notes

- Mockar SWR para simular diferentes estados de relatorios
- Testar transicao de polling interval (3s → 30s e vice-versa)
- Testar renderizacao com 0, 1, e muitos relatorios
- Verificar acessibilidade: aria-label no bell, role no popover
- Testar em sidebar expandida e colapsada

## Technical Notes

- Usar `useSWR` com `refreshInterval` dinamico (recalculado a cada fetch)
- O endpoint `GET /api/reports` (criado em RG-4) deve suportar filtro `?status=active` que retorna jobs nao-terminais + completed recentes (ultimas 24h)
- Badge count = jobs com `status IN ('completed','partial','failed') AND viewed_at IS NULL` + jobs `processing`/`queued`
- Toast via `sonner` para notificacao instantanea quando job transiciona para `completed` ou `failed`
- Popover deve usar `ScrollArea` do shadcn/ui para listas longas
- Tempo relativo pode usar `date-fns/formatDistanceToNow` (ja instalado no projeto)

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Polling frequente (5s) gera muitas requests | Endpoint leve (apenas status/count, sem dados completos). SWR deduplica requests. Interval de 5s mitiga multi-tab |
| Badge count incorreto apos navegacao | `revalidateOnFocus: true` garante refresh ao voltar a tab |
| Popover quebra layout da sidebar | Usar `side="right"` e `align="end"` no Popover para posicionar fora da sidebar |
| Muitos relatorios no popover (scroll infinito) | Limitar a 10 mais recentes no popover. Link "Ver todos" para pagina de historico |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
