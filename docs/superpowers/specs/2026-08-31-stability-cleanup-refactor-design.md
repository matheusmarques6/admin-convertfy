# Estabilidade, Limpeza e Refactors — Design

**Objetivo:** recuperar gates confiáveis, eliminar código comprovadamente morto e reduzir o primeiro hotspot sem alterar comportamento de produto.

## Ordem aprovada

1. Estabilidade técnica.
2. Cortes seguros.
3. Refactor de um componente por vez.

Não misturar as fases: um refactor não corrige testes preexistentes e uma remoção não altera regras de negócio.

## Escopo

### Estabilidade

- `npm run lint` deve executar em Windows e encerrar sem erros.
- A suíte Vitest deve carregar TSX corretamente e os nove testes falhos da auditoria devem ter causa resolvida, não timeout aumentado.
- A sincronização task↔email segue `TASK_SLUG_MAP` como fonte de verdade.

### Cortes seguros

- Remover somente artefatos com consumidor zero confirmado por busca e análise estática: `google-calendar-card.tsx`, `portal-account.service.ts` e `MOCK_BLOCKS`.
- Criar um índice de documentação e backlog canônico por links; não mover os 483 documentos existentes.

### Refactor

- Começar exclusivamente por `email-detail-view.tsx`.
- Manter `EmailDetailViewProps`, URLs, payloads HTTP e comportamento de cada aba inalterados.
- Parar após a extração das abas/editores; reavaliar tamanho e testes antes de escolher o próximo arquivo.

## Fora de escopo

- Remoção de rotas API baseada apenas em ausência de import interno.
- Alterar banco/migrations, dependências ou RLS.
- Decidir o produto de preferências de notificações do portal: a tela chama uma rota cuja tabela declarada não existe; isto requer decisão explícita de produto.
- Refactors nos demais arquivos grandes.

## Regras globais

- Sem dependências novas.
- Não tocar em mudanças preexistentes do checkout principal; executar somente neste worktree.
- Typecheck, lint e testes relevantes são gates de cada tarefa. A suíte total é gate de cada fase.
- Não elevar timeouts para mascarar import lento: mover/importar uma vez apenas se o handler não mantiver estado por teste; caso contrário instrumentar e corrigir a dependência lenta.
- Toda exclusão precisa de busca de consumidores antes e depois.

## Orquestração e revisão

Investigação pode usar até três agentes em paralelo, somente leitura e por domínio independente. Edição é sequencial: um implementador por tarefa, seguido por dois veredictos independentes — conformidade com o plano e qualidade/regressão. Achado importante volta ao implementador e recebe re-revisão; ao fechar cada plano, um revisor de branch analisa o diff acumulado.

O coordenador registra base SHA, decisões e resultados no ledger do plano. Merge, push e remoção de worktree exigem decisão humana.
