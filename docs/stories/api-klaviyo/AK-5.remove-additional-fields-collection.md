---
Prioridade: High
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "2 - High Priority"
Esforco: LOW
Dependencias: "Nenhuma (mas validar profile_count empiricamente antes)"
---

# Story AK-5 — Remover additional-fields de Collection + Fallback Individual

## Story

**Como** operador do sistema,
**Quero** remover o parametro `additional-fields[list]=profile_count` do endpoint de collection `/lists/` e implementar fallback via endpoints individuais,
**Para que** nao degrademos o rate limit tier de L para XS desnecessariamente.

## Contexto

### Problema

`metrics/route.ts:95` faz:
```typescript
klaviyoRequest(apiKey, "/lists/?additional-fields[list]=profile_count", ...)
```

Segundo a documentacao da Klaviyo:
1. `additional-fields` **NAO funciona** em collection endpoints (`/lists/`)
2. Usar `additional-fields` em collections **degrada o tier** de L para XS (penalidade)
3. Funciona apenas em endpoints individuais (`/lists/{id}/`)

### BLOCKER da Revisao: profile_count E USADO downstream

A revisao multi-agente identificou que `profile_count` **e usado** no response processing:

```typescript
// metrics/route.ts:106
const totalProfiles = lists.data.reduce((sum, list) => sum + (list.attributes.profile_count || 0), 0)

// metrics/route.ts:140-141
profileCount: l.attributes.profile_count
```

Portanto, remover `additional-fields` sem fallback **zeraria totalProfiles** no admin dashboard.

### Comportamento Existente

O codebase ja tem padrao de fallback individual em:
- `klaviyo-sync.service.ts:243-251` — busca individual quando collection nao tem profile_count
- `report/route.ts:155` — individual fetch para detalhes

### Verificacao PRE-DEV Necessaria

**Antes de implementar**, testar empiricamente:
```
GET /api/lists/ (SEM additional-fields)
→ Verificar se profile_count vem no response ou nao
```
Se vier: remocao simples, sem fallback necessario.
Se nao vier: implementar fallback individual.

## Acceptance Criteria

### AK-5.1 — Remover additional-fields da collection

- [ ] Em `src/app/api/integrations/klaviyo/metrics/route.ts:95`, alterar:
  - De: `"/lists/?additional-fields[list]=profile_count"`
  - Para: `"/lists/"`

### AK-5.2 — Implementar fallback para profile_count (se necessario)

- [ ] Se a verificacao pre-dev confirmar que `profile_count` desaparece sem `additional-fields`:
  - [ ] Apos obter a collection de lists, buscar `profile_count` via endpoints individuais
  - [ ] Usar `withConcurrencyLimit()` do `rate-limiter.ts` para limitar chamadas paralelas
  - [ ] Para cada list: `GET /lists/{id}/?additional-fields[list]=profile_count`
  - [ ] Mesclar `profile_count` no response antes do processing downstream
- [ ] Se a verificacao confirmar que `profile_count` ja vem sem `additional-fields`: skip este AC

### AK-5.3 — Ajustar tipo TypeScript

- [ ] Alterar `KlaviyoListResponse` para `profile_count?: number` (opcional) se nao vier na collection
- [ ] Garantir que `totalProfiles` calculo usa `?? 0` em vez de `|| 0` (para nao conflitar com 0 real)

### AK-5.4 — Testes

- [ ] Verificar que a rota metrics retorna `totalProfiles` correto (nao zero)
- [ ] Verificar que `profileCount` por lista esta preenchido no response
- [ ] Verificar que nao ha regressao nos dados exibidos no admin dashboard
- [ ] Se fallback implementado: testar que chamadas individuais respeitam rate limiter

## Impacto Esperado

- Elimina penalidade silenciosa de tier (L → XS) para chamadas de lists
- Libera throughput para outros endpoints na mesma fila
- Mantem `totalProfiles` e `profileCount` por lista no dashboard

## Riscos

- Se fallback individual for necessario: N chamadas individuais adicionais (1 por lista)
- Mitigacao: usar `withConcurrencyLimit(lists, 3, ...)` para nao sobrecarregar
- Maioria das contas tem <10 listas — overhead aceitavel

## Arquivos Afetados

- `src/app/api/integrations/klaviyo/metrics/route.ts` — linha 95 + potencial fallback
- Tipo `KlaviyoListResponse` (no mesmo arquivo ou types)

---

## Revisao Multi-Agente (Atualizada pos-revisao)

### @dev — Anotacoes de Implementacao

- **Complexidade revisada: LOW** (nao TRIVIAL). Se fallback for necessario, envolve loop com chamadas individuais.
- O padrao ja existe em `klaviyo-sync.service.ts:243-251` — reusar logica.
- **IMPORTANTE**: Validar empiricamente ANTES de implementar. Se `profile_count` vem sem `additional-fields`, a story volta a ser TRIVIAL.

### @qa — Anotacoes de Qualidade (Revisao 2)

- **BLOCKER RESOLVIDO**: A story agora contempla fallback para `profile_count`. O risco de zerar `totalProfiles` esta mitigado.
- **Teste pre-dev**: Chamar `/lists/` sem `additional-fields` e verificar response. Documentar resultado.
- **Regressao**: Comparar `totalProfiles` e `profileCount` por lista antes e depois do deploy.

### @data-engineer — Anotacoes de Dados

- **Sem impacto em dados persistidos**. O `additional-fields` so afeta o response da API Klaviyo em memoria.
- Se fallback individual for implementado: N chamadas extras por request ao endpoint metrics. Para contas com <10 listas, overhead < 1s com rate limiter tier S.

### @architect — Anotacoes Arquiteturais

- **Padrao correto**: Collection leve + individual fetches para dados extras. Consistente com o codebase.
- Usar `withConcurrencyLimit()` existente — NAO criar novo mecanismo de concurrency.

### @analyst — Anotacoes de Impacto

- **Risco funcional mitigado** com fallback. Dashboard mantem dados de profile_count.
- **Beneficio indireto**: Menos pressao no rate limiter = mais throughput para reports.