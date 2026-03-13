# Epic 39 - Separar Credenciais do Card de Lojas (Admin/Agencia)

## Contexto

Na aba **Clientes > Detalhes > Lojas**, o card de cada loja e o dialog de "Editar/Nova Loja" acumulam duas responsabilidades:
- **Metadados da loja** (nome, URL, plataforma, moeda)
- **Credenciais de integracao** (Shopify token, Klaviyo keys, GA4 JSON)

O objetivo e separar essas responsabilidades: credenciais devem ser gerenciadas **exclusivamente** na pagina de detalhe da loja (`/admin/stores/{id}`), na aba Settings/Configuracoes.

**Escopo**: Apenas telas admin/agencia. Portal do cliente NAO muda.

## Achado Critico

A aba Settings em `store-detail-tabs.tsx` (linhas 415-429) e atualmente um **placeholder vazio** que diz "acesse a aba de lojas do cliente". Se removermos credenciais do dialog primeiro, ficamos sem nenhum lugar para configurar credenciais. **Fase A deve vir PRIMEIRO.**

---

## Story 39.1 - Construir Form de Credenciais na Aba Settings (Fase A)

### Descricao
Substituir o placeholder da aba Settings/Configuracoes em `store-detail-tabs.tsx` por um form completo de gerenciamento de credenciais, incluindo Shopify, Klaviyo e Google Analytics.

### Arquivos Impactados
| Arquivo | Mudanca |
|---------|---------|
| `src/components/stores/store-detail-tabs.tsx` | Substituir placeholder (linhas 415-429) por form de credenciais; adicionar suporte a `?tab=` query param |

### Acceptance Criteria

- [ ] **AC 39.1.1**: A aba Settings exibe form com 3 secoes: Shopify (domain + access token), Klaviyo (public key + private key + list ID), GA4 (property ID + service account JSON)
- [ ] **AC 39.1.2**: Campos sensiveis (tokens, private keys) sao do tipo `password`
- [ ] **AC 39.1.3**: Form chama `PUT /api/client-stores/credentials` com `store_id` + campos preenchidos
- [ ] **AC 39.1.4**: Campos nao preenchidos NAO sao enviados no payload (para nao apagar credenciais existentes)
- [ ] **AC 39.1.5**: Apos salvar com sucesso, exibe toast de confirmacao e revalida o IntegrationStatusCard
- [ ] **AC 39.1.6**: O IntegrationStatusCard existente (linhas 676-831) e exibido acima ou ao lado do form, mostrando status atual das integracoes
- [ ] **AC 39.1.7**: Quando credenciais Klaviyo ou Shopify sao salvas, `markOnboardingStepCompleted` e chamado (manter logica client-side por enquanto, Fase C migra pro backend)
- [ ] **AC 39.1.8**: Validacao de JSON para GA4 credentials (igual ao atual em client-stores.tsx linhas 261-272)
- [ ] **AC 39.1.9**: Texto placeholder do Settings tab e removido completamente
- [ ] **AC 39.1.10**: `StoreDetailTabs` suporta query param `?tab=settings` para abrir diretamente na aba Settings (usar `useSearchParams` + controlled `<Tabs value={}>`)
- [ ] **AC 39.1.11**: Campos de credencial aparecem sempre vazios (API nao retorna credentials). Exibir indicador "Configurado" ou "Nao configurado" ao lado de cada secao, baseado nos flags `has_*_credentials`
- [ ] **AC 39.1.12**: Mecanismo de refresh apos salvar: usar `router.refresh()` ou atualizar estado local para que o IntegrationStatusCard reflita as novas credenciais

### Referencia de Implementacao
- Reutilizar campos de credencial de `client-stores.tsx` linhas 662-779 (Shopify, Klaviyo, GA4 sections)
- Reutilizar `markOnboardingStepCompleted` de `client-stores.tsx` linhas 82-122
- API endpoint: `PUT /api/client-stores/credentials` (ja existe, aceita campos parciais)
- IntegrationStatusCard: `store-detail-tabs.tsx` linhas 676-831

### Estimativa: MEDIUM (~2-3h)

---

## Story 39.2 - Simplificar Card e Dialog de Lojas (Fase B)

### Descricao
Remover campos de credenciais do card de loja e do dialog Add/Edit em `client-stores.tsx`. O card fica mais compacto com indicadores inline de status das integracoes. O dialog fica com apenas 4 campos.

### Dependencia: Story 39.1 CONCLUIDA

### Arquivos Impactados
| Arquivo | Mudanca |
|---------|---------|
| `src/components/clients/client-stores.tsx` | Simplificar card + dialog |

### Acceptance Criteria

**Card:**
- [ ] **AC 39.2.1**: Remover os 3 paineis de integracao (Shopify/Klaviyo/GA4) expandidos do card
- [ ] **AC 39.2.2**: Substituir por linha compacta de status: `● Shopify  ● Klaviyo  ○ GA4` (dot verde = configurado, dot cinza = pendente)
- [ ] **AC 39.2.3**: Quando ha integracoes pendentes, exibir link "Configurar" que navega para `/admin/stores/{id}?tab=settings`
- [ ] **AC 39.2.4**: Exibir plataforma e moeda na mesma linha (ex: `shopify · BRL`)

**Dialog Editar/Nova Loja:**
- [ ] **AC 39.2.5**: Dialog contem APENAS: Nome da Loja*, URL, Plataforma (select), Moeda (select)
- [ ] **AC 39.2.6**: Remover todas as secoes de credenciais do dialog (Shopify, Klaviyo, GA4)
- [ ] **AC 39.2.7**: Adicionar banner informativo no dialog: "Para configurar credenciais (Shopify, Klaviyo, GA4), acesse a pagina da loja > Configuracoes" com link direto
- [ ] **AC 39.2.8**: Descricao do dialog muda de "Configure os dados da loja e integracoes" para "Altere as informacoes basicas da loja"

**Fluxo Nova Loja:**
- [ ] **AC 39.2.9**: Apos criar nova loja com sucesso, redirecionar automaticamente para `/admin/stores/{newId}?tab=settings` (para o admin configurar credenciais)
- [ ] **AC 39.2.10**: Exibir toast: "Loja criada! Configure as integracoes."

**Cleanup:**
- [ ] **AC 39.2.11**: Remover do `form` state os campos: `shopify_store_domain`, `shopify_access_token`, `klaviyo_public_key`, `klaviyo_private_key`, `klaviyo_list_id`, `ga4_property_id`, `ga4_credentials_json`
- [ ] **AC 39.2.12**: Remover imports nao utilizados: `Key`, `FileJson`, `BarChart3` (todos usados apenas nas secoes de credenciais removidas)
- [ ] **AC 39.2.13**: Remover chamadas a `markOnboardingStepCompleted` do `handleSave` (ja migrado para 39.1)
- [ ] **AC 39.2.14**: Cards de loja continuam exibindo badges `has_shopify_credentials`, `has_klaviyo_credentials`, `has_ga4_credentials` (read-only, vem do GET)

### Estimativa: LOW (~1h)

---

## Story 39.3 - Migrar markOnboardingStepCompleted para o Backend (Fase C)

### Descricao
Mover a logica de auto-complete de onboarding para o endpoint de credenciais no backend, eliminando a implementacao client-side. Consolidar com a implementacao que ja existe no portal (`/api/portal/stores/route.ts`).

### Dependencia: Stories 39.1 e 39.2 CONCLUIDAS

### Arquivos Impactados
| Arquivo | Mudanca |
|---------|---------|
| `src/app/api/client-stores/credentials/route.ts` | Adicionar auto-complete de onboarding apos salvar credenciais |
| `src/components/stores/store-detail-tabs.tsx` | Remover chamadas client-side a markOnboardingStepCompleted |
| `src/components/clients/client-stores.tsx` | Remover funcao markOnboardingStepCompleted (se ainda existir) |

### Acceptance Criteria

- [x] **AC 39.3.1**: Quando `PUT /api/client-stores/credentials` recebe `klaviyo_private_key`, o backend marca o step "Klaviyo Conectado" como completed
- [x] **AC 39.3.2**: Quando `PUT /api/client-stores/credentials` recebe `shopify_access_token`, o backend marca o step "Acesso a Loja Configurado" como completed
- [x] **AC 39.3.3**: A logica usa `adminClient` direto (padrao do portal em `/api/portal/stores/route.ts` linhas 158-227), NAO fetch chain
- [x] **AC 39.3.4**: Funcao `markOnboardingStepCompleted` client-side e removida de `client-stores.tsx`
- [x] **AC 39.3.5**: Funcao `markOnboardingStepCompleted` client-side e removida de `store-detail-tabs.tsx` (se adicionada na 39.1)
- [x] **AC 39.3.6**: Auto-complete funciona independente de qual tela salva as credenciais (admin, portal, API direta)
- [x] **AC 39.3.7**: Falha no auto-complete NAO impede o save de credenciais (try-catch silencioso, igual ao atual)

### Notas de Implementacao
- O handler PUT de `/api/client-stores/credentials` recebe `store_id` mas NAO `client_id`. O backend precisara fazer lookup de `client_id` na tabela `client_stores` para passar ao `markStep`.
- Padrao server-side existente: `/api/portal/stores/route.ts` linhas 158-227 (funcao `markStep`)
- TODO no codigo: `client-stores.tsx` linhas 78-81 ja reconhece a necessidade de migrar

### Estimativa: LOW (~1h)

---

## Validacao QA (Cross-Agent)

### Riscos Mitigados
| Risco | Mitigacao |
|-------|-----------|
| Tab Settings placeholder vazio | Fase A resolve ANTES de remover credenciais |
| Onboarding auto-complete quebra | Fase A mantem client-side, Fase C migra pro backend |
| PUT apaga credenciais existentes | API ja ignora campos ausentes (verificado pelo QA) |
| Admin nao sabe onde configurar | Redirect apos criar loja + banner no dialog |
| Portal diverge | Fora do escopo (portal NAO muda) |

### Seguranca
- Credenciais saem do DOM da pagina de clientes
- React state nao carrega mais API keys
- Ponto unico de entrada de credenciais (mais facil de auditar)

### Tech Debt (fora do escopo, follow-up)
- `checkDatabaseStatus()` em `client-stores.tsx` (linhas 343-369) e o botao "Verificar BD" no empty state sao legado de debug. Considerar remocao futura.
- Portal tem fluxo proprio de credenciais (`/api/portal/stores` PUT + wizard). Alinhar UX no futuro se necessario.

### Arquivos NAO Impactados
- `/api/portal/*` - Portal nao muda
- `/api/stores/route.ts` (GET) - Ja retorna flags corretos
- `store.schemas.ts` - Vazio, nada para mudar
