---
Prioridade: Critical
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "1 - Critical Fixes"
Esforco: TRIVIAL
Dependencias: "Nenhuma"
Deploy: "Pode ir independente OU como parte do bloco atomico AK-1+AK-3+AK-6"
Nota: "Promovido de P1 para P0 — pre-requisito pratico para viabilizar AK-1 no timeout 240s"
---

# Story AK-6 — Freshness Threshold 7d: 0 → 1h

## Story

**Como** operador do sistema,
**Quero** que o periodo de 7 dias tenha um freshness threshold de 1 hora em vez de 0 (sempre sync),
**Para que** o cron nao re-sincronize dados de 7d a cada invocacao quando os dados mal mudaram.

## Contexto

### Problema

`data-status.ts:57` define:
```typescript
export const PERIOD_FRESHNESS_THRESHOLDS: Record<CachedPeriod, number> = {
  "7d":  0,                  // always sync — recent orders change fast
  "15d": 2 * 60 * 60_000,   // 2 hours
  "30d": 4 * 60 * 60_000,   // 4 hours
  "90d": 8 * 60 * 60_000,   // 8 hours
}
```

O `7d: 0` (sempre sync) foi definido conservadoramente na epoca do Epic 10. Com 42 lojas, isso significa que TODA invocacao do cron re-sincroniza 7d para TODAS as lojas — o periodo mais custoso em chamadas de API.

### Calculo

- Com `0` (sempre sync): 42 lojas x ~48 cron runs/dia x 2-3 calls = ~4,000-6,000 report calls/dia so para 7d
- Com `1h`: 42 lojas x 24 syncs/dia x 2-3 calls = ~2,000-3,000 report calls/dia para 7d (50% reducao)

### Justificativa para 1h

- Dados de 7 dias mudam significativamente a cada hora (novos pedidos, atribuicoes)
- 1h e conservador o suficiente para capturar mudancas relevantes
- Dashboard do portal atualiza a cada few minutes — mas mostra cache, nao live data
- O cron roda a cada 5 minutos, mas com 1h threshold, so re-synca 7d 24x/dia por loja

## Acceptance Criteria

### AK-6.1 — Alterar threshold

- [ ] Em `src/lib/shared/data-status.ts:57`, alterar:
  - De: `"7d": 0`
  - Para: `"7d": 1 * 60 * 60_000  // 1 hour`
- [ ] Atualizar comentario para refletir a mudanca

### AK-6.2 — Teste

- [ ] Verificar que `isFresh("7d", fetchedAt)` retorna `true` quando fetchedAt < 1h atras
- [ ] Verificar que `isFresh("7d", fetchedAt)` retorna `false` quando fetchedAt > 1h atras
- [ ] Outros periodos nao afetados

## Impacto Esperado

- 50% menos report calls para periodo 7d
- Cron processa mais lojas por invocacao (menos trabalho redundante)
- Dados de 7d atualizados a cada hora (suficiente para dashboard)

## Riscos

- Dados de 7d ficam ate 1h desatualizados. Para o dashboard do portal (refresh visual a cada 5min), o usuario vera dados de ate 1h atras. Aceitavel.
- Live fallback no admin panel continua funcionando independente do threshold.
- **Cross-epic**: Epic 55 story 55.1 tambem lida com freshness thresholds. Se ambos estiverem em progresso, potencial conflito no mesmo arquivo/linha. Coordenar.

## Arquivos Afetados

- `src/lib/shared/data-status.ts` — linha 57

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade: TRIVIAL**. Uma linha de mudanca + comentario.
- O `PERIOD_FRESHNESS_THRESHOLDS` e consumido pelo cron via `isCacheFresh()` ou similar. Verificar que a funcao que consome esse valor existe e funciona corretamente.
- NAO precisa de feature flag — se 1h for muito, basta mudar o valor.

### @qa — Anotacoes de Qualidade

- **Teste**: Simular cron run com dados de 7d fetchados ha 30min — deve skippar. Fetchados ha 2h — deve re-syncar.
- **Regressao**: Verificar que o cron summary mostra "skipped (fresh)" para 7d quando dentro da janela.
- **Monitoramento**: Apos deploy, verificar que o numero de report calls/dia cai ~50% para periodo 7d.

### @data-engineer — Anotacoes de Dados

- **Impacto aceitavel**: Dados de 7d com ate 1h de atraso e normal para dashboards. A maioria das plataformas de analytics tem atraso similar.
- **Consistencia**: O `fetched_at` em `store_revenue_summary` continua refletindo o momento real do fetch. O frontend mostra "atualizado ha X min" baseado nesse campo.

### @architect — Anotacoes Arquiteturais

- **Aprovado**. O design do freshness system (Epic 55) foi feito exatamente para esse tipo de ajuste. A constante e o unico ponto de mudanca — clean design.
- **Evolucao**: Se necessario, podemos tornar esse valor configuravel por loja (ex: lojas VIP com threshold menor). Mas NAO agora.

### @analyst — Anotacoes de Impacto

- **Quick win**: Reducao de 50% em report calls para o periodo mais chamado. Contribui significativamente para ficar dentro do cap de 225/dia.
- **UX**: Usuarios do portal nao perceberao diferenca. O cache ja adiciona latencia — 1h a mais e imperceptivel para analises de 7 dias.