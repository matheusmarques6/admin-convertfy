---
Prioridade: Medium
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "2 - Progressive Loading (UX)"
Esforco: LOW
Dependencias: RG-2
---

# Story RG-3 — Progress Bar Deterministico

## Story

**Como** operador do admin panel que esta aguardando a geracao de relatorio de multiplas lojas,
**Quero** ver um indicador de progresso claro mostrando quantas lojas ja carregaram e quanto falta,
**Para que** eu saiba exatamente o estado da geracao sem ficar ansioso ou achar que travou.

## Contexto

### Problema

Com o fan-out progressivo (RG-2), lojas carregam independentemente. Porem, sem feedback explicito o operador nao sabe:
- Quantas lojas ja completaram
- Quanto tempo falta
- Se pode sair da pagina

### Solucao

Criar um `ReportGenerationBanner` (molecule) que aparece no topo do dashboard durante a geracao. O progresso e deterministico: N de M lojas, com estimativa de tempo baseada na media de tempo das lojas ja completadas.

### UX (da spec)

Banner no topo: "Gerando relatorio: 20 jan — 18 fev 2026 | 3 de 8 lojas | ~1 min restante | [barra progresso 37%]"
Hint: "Voce pode sair. Avisaremos quando concluir."

Revenue cards durante geracao: badge "(parcial)" enquanto nem todas as lojas completaram.
Tabela de lojas: icones de status por loja.

## Tasks

### Task 1 — Componente ReportGenerationBanner
- [ ] Criar `src/components/reports/report-generation-banner.tsx`
- [ ] Props: `{ startDate: string, endDate: string, completedCount: number, totalCount: number, failedCount: number, estimatedTimeRemaining: number | null, onDismiss: () => void }`
- [ ] Layout: texto informativo + barra de progresso + botao dismiss (X)
- [ ] Texto: "Gerando relatorio: {startDate} — {endDate} | {n} de {total} lojas | ~{time} restante"
- [ ] Usar shadcn/ui `<Progress>` para barra de progresso
- [ ] Incluir `role='status'`, `aria-live='polite'`, `aria-label='Progresso da geracao de relatorio'`, `aria-valuenow` no `<Progress>`
- [ ] Hint abaixo: "Voce pode sair. Avisaremos quando concluir."
- [ ] Banner dismissivel (X) — nao interrompe geracao, so esconde o banner
- [ ] Quando `completedCount === totalCount` e `failedCount === 0`: banner muda para estado "concluido" com check verde, auto-dismiss apos 3s
- [ ] Quando `completedCount === totalCount` e `failedCount > 0`: banner persiste com estado "parcial" (warning icon), NAO aplica auto-dismiss

### Task 2 — Badge "(parcial)" nos revenue cards
- [ ] Em `store-performance-kpis.tsx`: quando fan-out em progresso, mostrar badge "(parcial)" nos cards de receita
- [ ] Badge usa shadcn/ui `<Badge variant="secondary">` com texto "(parcial)"
- [ ] Badge posicionado ao lado do valor no card
- [ ] Badge desaparece quando todas as lojas completaram
- [ ] Badge tambem aparece se resultado final e parcial (lojas com erro)

### Task 3 — Icones de status na tabela de lojas
- [ ] Em `store-control-panel.tsx`: coluna de status com icones por loja
- [ ] Status `success`: check verde (Lucide `CheckCircle2`)
- [ ] Status `loading`: spinner animado (Lucide `Loader2` com animate-spin)
- [ ] Status `queued`: relogio cinza (Lucide `Clock`) — corresponde a lojas aguardando no semaphore queue do fan-out (RG-2 Task 3.1), ainda nao iniciaram fetch
- [ ] Status `error`: triangulo amarelo (Lucide `AlertTriangle`) + tooltip com motivo
- [ ] Icones com tooltip descritivo ("Carregado", "Processando...", "Na fila", "Erro: {motivo}")
- [ ] Incluir `aria-label` descritivo em cada icone de status (ex: `aria-label="Loja carregada com sucesso"`, `aria-label="Aguardando na fila"`)

### Task 4 — Estimativa de tempo restante
- [ ] Calcular media de tempo das lojas ja completadas
- [ ] Multiplicar pela quantidade restante: `avgTime * (total - completed)`
- [ ] Formatar: "<1 min", "~1 min", "~2 min", etc
- [ ] Se nenhuma loja completou ainda: mostrar "calculando..."
- [ ] Se todas completaram: nao mostrar tempo

### Task 5 — Integracao com fan-out hook (RG-2)
- [ ] Conectar `ReportGenerationBanner` ao `useStoresFanOut` hook
- [ ] Banner aparece automaticamente quando fan-out inicia (custom range selecionado)
- [ ] Banner recebe dados em tempo real do hook (completedCount atualiza)
- [ ] Auto-dismiss de 3s so aplica quando resultado e `completed` (todas lojas OK, zero falhas)
- [ ] Banner persiste indefinidamente se resultado e `partial` (algumas lojas falharam) — requer dismiss manual

### Task 6 — Testes
- [ ] Teste: banner exibe contagem correta "3 de 8 lojas"
- [ ] Teste: progress bar width = (completed / total) * 100
- [ ] Teste: estimativa de tempo calculada corretamente
- [ ] Teste: badge "(parcial)" aparece durante loading, desaparece ao completar
- [ ] Teste: dismiss esconde banner sem interromper geracao
- [ ] Teste: icones corretos para cada status na tabela
- [ ] Teste: banner estado "concluido" quando todas lojas OK

## Acceptance Criteria

### RG-3.1 — Progress bar mostra contagem correta
- [ ] Banner exibe "{n} de {total} lojas" em tempo real
- [ ] Barra de progresso reflete percentual correto
- [ ] Contagem atualiza conforme cada loja completa

### RG-3.2 — Banner dismissivel
- [ ] Botao X esconde o banner
- [ ] Geracao continua normalmente apos dismiss
- [ ] Banner nao reaparece sozinho apos dismiss (nesta sessao)

### RG-3.3 — Badge "(parcial)" exibido durante geracao
- [ ] Revenue cards mostram "(parcial)" enquanto fan-out esta em progresso
- [ ] Badge desaparece quando todas as lojas completaram com sucesso
- [ ] Badge permanece se resultado final e parcial (lojas com erro)

### RG-3.4 — Icones de status na tabela
- [ ] Check verde para lojas carregadas com sucesso
- [ ] Spinner para lojas em processamento
- [ ] Relogio para lojas na fila
- [ ] Warning para lojas com erro + tooltip com motivo
- [ ] Icones atualizam em tempo real conforme status muda

### RG-3.5 — Estimativa de tempo
- [ ] Tempo restante calculado com base na media das lojas ja completadas
- [ ] Formato legivel: "calculando...", "<1 min", "~1 min", "~2 min"
- [ ] Tempo desaparece quando geracao completa

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/reports/report-generation-banner.tsx` | CREATE | Molecule: banner de progresso com barra, contagem, tempo estimado, dismiss |
| `src/components/reports/report-generation-banner.test.tsx` | CREATE | Testes do banner: contagem, progress bar, dismiss, estados |
| `src/components/stores/store-performance-kpis.tsx` | MODIFY | Badge "(parcial)" nos revenue cards durante fan-out |
| `src/components/stores/store-control-panel.tsx` | MODIFY | Coluna de status com icones (check, spinner, clock, warning) |

## Testing Notes

- Testar banner com 0/8, 4/8, 8/8 lojas para verificar todos os estados
- Testar estimativa de tempo com lojas que levam tempos diferentes
- Verificar que dismiss nao causa side effects no fan-out
- Testar icones na tabela com todas as combinacoes de status
- Verificar acessibilidade: icones devem ter aria-label, progress bar aria-valuenow

## Technical Notes

- `ReportGenerationBanner` e um molecule (componente composto de atoms shadcn/ui)
- Usar Lucide icons (ja instalado no projeto) para icones de status
- Estimativa de tempo e heuristica — nao precisa ser exata, so informativa
- O banner so aparece para custom ranges (periodos padrao carregam do cache instantaneamente)
- Posicionar banner abaixo do header e acima dos revenue cards (fixed position relativo ao container)

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Estimativa de tempo imprecisa se lojas tem latencia muito variavel | Usar media movel e prefixar com "~" (aproximado) |
| Badge "(parcial)" confunde operador | Tooltip explicativo: "Dados parciais — aguardando {n} lojas" |
| Muitos re-renders conforme lojas completam | Usar React.memo no banner, atualizar state com batch |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
