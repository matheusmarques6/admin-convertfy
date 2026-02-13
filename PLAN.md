# Plano Completo: Refatoração do Módulo Pipeline

## Diagnóstico Atual (Problemas Identificados)

### Problemas Críticos
1. **Não é possível criar novas pipelines** — Só existe a "Pipeline Principal" seed. O header tem dropdown mas sem funcionalidade de criação.
2. **Pipeline switching quebrado** — O dropdown do `pipeline-header.tsx` não tem `onClick` handler, não muda a pipeline visualizada.
3. **Sem atribuição de pipelines a usuários/agentes** — Não existe relação pipeline↔usuário no banco. Qualquer um vê tudo.
4. **Sem importação automática de clientes** — Não existe nenhum mecanismo de regras para colocar clientes automaticamente em stages.
5. **Delete de deal não implementado** — Botão existe mas sem handler.
6. **Zustand store do pipeline criado mas NUNCA usado** — Componentes fazem queries diretas ao Supabase.
7. **RLS fraco** — Qualquer usuário autenticado pode modificar qualquer deal/pipeline.

### Problemas Secundários
- `expected_close_date` definido no schema mas não editável no form
- `custom_fields` definido mas sem UI
- Sem histórico de movimentação de deals
- Sem analytics do pipeline (win rate, tempo médio, etc.)

---

## Escopo das Mudanças

### Feature 1: Gestão Completa de Pipelines (CRUD)
### Feature 2: Atribuição de Pipelines a Agentes (Usuários)
### Feature 3: Importação Automática de Clientes com Regras Configuráveis
### Feature 4: Correções e Melhorias Gerais do Pipeline

---

## FEATURE 1: Gestão Completa de Pipelines (CRUD)

### 1.1 Banco de Dados — Sem alterações na tabela `pipelines`

A tabela `pipelines` atual já suporta CRUD:
```sql
-- Já existe:
CREATE TABLE pipelines (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Nova migration necessária:** Adicionar `created_by` para saber quem criou a pipeline.

```sql
-- Nova migration: 00002_pipeline_enhancements.sql

-- Quem criou a pipeline
ALTER TABLE pipelines ADD COLUMN created_by UUID REFERENCES profiles(id);

-- Atualizar pipelines existentes com o primeiro admin
UPDATE pipelines SET created_by = (
  SELECT id FROM profiles WHERE role = 'admin' LIMIT 1
);
```

### 1.2 Types — `src/types/index.ts`

```typescript
// Atualizar Pipeline interface
export interface Pipeline {
  id: string
  name: string
  description?: string
  is_default: boolean
  created_by?: string       // NOVO
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}

// NOVO: Para criação de pipeline com stages
export interface CreatePipelineInput {
  name: string
  description?: string
  is_default?: boolean
  stages: CreateStageInput[]
}

export interface CreateStageInput {
  name: string
  color: string
  order: number
}
```

### 1.3 Componentes Novos

#### `src/components/pipeline/pipeline-create-dialog.tsx` (NOVO)
- Dialog modal para criar nova pipeline
- Form com: nome, descrição, marcar como padrão
- Seção de stages com drag-and-drop para reordenar
- Botão "Adicionar Stage" com campos: nome e cor (color picker)
- Stages padrão pré-populadas (Lead, Qualificação, Proposta, Negociação, Ganho, Perdido)
- Possibilidade de remover/editar stages antes de criar
- Validação: mínimo 2 stages, nome obrigatório

#### `src/components/pipeline/pipeline-settings-dialog.tsx` (NOVO)
- Dialog para editar pipeline existente
- Editar nome, descrição
- Gerenciar stages (adicionar, remover, reordenar, renomear, mudar cor)
- Opção de deletar pipeline (com confirmação e migração de deals)
- Se deletar pipeline com deals: perguntar para qual pipeline mover os deals

### 1.4 Alterações em Componentes Existentes

#### `src/components/pipeline/pipeline-header.tsx`
- **Corrigir** dropdown de seleção de pipeline (adicionar `onClick` handler)
- **Adicionar** botão "Nova Pipeline" no dropdown
- **Adicionar** botão "Configurações" funcional (abre settings dialog)
- **Adicionar** indicador visual da pipeline selecionada
- Passar callback `onPipelineChange` para trocar pipeline no page

#### `src/app/(dashboard)/pipeline/page.tsx`
- Converter para client component (ou usar searchParams) para suportar troca de pipeline
- Usar `searchParams.pipeline` para determinar qual pipeline mostrar
- Fetch de todas as pipelines para o dropdown
- Re-fetch stages e deals quando pipeline muda

---

## FEATURE 2: Atribuição de Pipelines a Agentes

### 2.1 Banco de Dados — Nova tabela de relação

```sql
-- Nova migration: 00002_pipeline_enhancements.sql (continuação)

-- Tabela de membros da pipeline (N:N entre pipelines e profiles)
CREATE TABLE pipeline_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role pipeline_member_role NOT NULL DEFAULT 'viewer',
  added_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pipeline_id, user_id)  -- Um usuário só aparece uma vez por pipeline
);

CREATE TYPE pipeline_member_role AS ENUM ('owner', 'editor', 'viewer');

CREATE INDEX idx_pipeline_members_pipeline ON pipeline_members(pipeline_id);
CREATE INDEX idx_pipeline_members_user ON pipeline_members(user_id);
```

**Roles da pipeline:**
- `owner` — Criador ou admin. Pode editar pipeline, stages, gerenciar membros, deletar.
- `editor` — Pode criar/editar/mover deals, mas não pode alterar estrutura da pipeline ou membros.
- `viewer` — Pode apenas visualizar o board e deals. Sem edição.

**RLS Policies atualizadas:**
```sql
-- Pipelines: usuário vê apenas pipelines onde é membro OU é admin do sistema
CREATE POLICY "Users see own pipelines" ON pipelines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members WHERE pipeline_members.pipeline_id = id AND pipeline_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Deals: usuário vê deals de pipelines onde é membro
CREATE POLICY "Users see deals in their pipelines" ON deals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members
      WHERE pipeline_members.pipeline_id = deals.pipeline_id
      AND pipeline_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Deals: apenas editors e owners podem modificar
CREATE POLICY "Editors can manage deals" ON deals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipeline_members
      WHERE pipeline_members.pipeline_id = deals.pipeline_id
      AND pipeline_members.user_id = auth.uid()
      AND pipeline_members.role IN ('owner', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Pipeline Members: owners e admins podem gerenciar
CREATE POLICY "Owners manage members" ON pipeline_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
```

### 2.2 Types — `src/types/index.ts`

```typescript
// NOVO
export type PipelineMemberRole = "owner" | "editor" | "viewer"

export interface PipelineMember {
  id: string
  pipeline_id: string
  user_id: string
  role: PipelineMemberRole
  added_by?: string
  created_at: string
  // Relações populadas
  user?: User
}

// Atualizar Pipeline interface
export interface Pipeline {
  id: string
  name: string
  description?: string
  is_default: boolean
  created_by?: string
  members?: PipelineMember[]  // NOVO
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}
```

### 2.3 Componentes Novos

#### `src/components/pipeline/pipeline-members-dialog.tsx` (NOVO)
- Dialog para gerenciar membros de uma pipeline
- Lista de membros atuais com avatar, nome, role
- Dropdown para mudar role (owner/editor/viewer)
- Botão para remover membro (com confirmação)
- Seção "Adicionar Membro":
  - Combobox com busca de usuários (profiles)
  - Seleção de role ao adicionar
- Indicador visual: quem é owner, editor, viewer
- Só visível para owners da pipeline e admins do sistema

### 2.4 Alterações em Componentes Existentes

#### `src/components/pipeline/pipeline-header.tsx`
- Adicionar botão "Membros" (ícone Users) que abre o members dialog
- Mostrar avatares dos membros no header (mini avatar stack)
- Indicar role do usuário atual na pipeline (badge "Editor", "Viewer", etc.)

#### `src/components/pipeline/pipeline-board.tsx`
- Verificar role do usuário antes de permitir drag & drop
- `viewer` não pode arrastar deals
- `viewer` não vê botões de "Novo Deal", "Editar", "Excluir"
- Mostrar badge com role do usuário no board

#### `src/app/(dashboard)/pipeline/page.tsx`
- Filtrar pipelines visíveis baseado em membership
- Passar role do usuário para componentes filhos
- Mostrar mensagem se usuário não tem nenhuma pipeline atribuída

---

## FEATURE 3: Importação Automática de Clientes com Regras

### 3.1 Conceito

O agente (usuário com acesso à pipeline) pode configurar **regras de importação** que automaticamente:
1. Monitoram novos clientes criados no sistema
2. Avaliam as regras configuradas (condições)
3. Criam deals automaticamente na pipeline e stage correta
4. Regras são por pipeline e configuráveis pelo agente que tem permissão

### 3.2 Banco de Dados — Novas tabelas

```sql
-- Nova migration: 00002_pipeline_enhancements.sql (continuação)

-- Regras de importação automática
CREATE TABLE pipeline_import_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,  -- Maior = mais prioridade (avaliada primeiro)
  conditions JSONB NOT NULL DEFAULT '[]',
  -- Configuração do deal criado automaticamente
  deal_defaults JSONB DEFAULT '{}',  -- { title_template, value, probability, owner_id }
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_rules_pipeline ON pipeline_import_rules(pipeline_id);
CREATE INDEX idx_import_rules_active ON pipeline_import_rules(is_active) WHERE is_active = true;

-- Log de importações realizadas
CREATE TABLE pipeline_import_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  rule_id UUID REFERENCES pipeline_import_rules(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  status import_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE import_status AS ENUM ('success', 'failed', 'skipped');
CREATE INDEX idx_import_logs_rule ON pipeline_import_logs(rule_id);
CREATE INDEX idx_import_logs_client ON pipeline_import_logs(client_id);
```

**Estrutura do campo `conditions` (JSONB):**
```json
[
  {
    "field": "status",
    "operator": "equals",
    "value": "prospect"
  },
  {
    "field": "tags",
    "operator": "contains",
    "value": "ecommerce"
  },
  {
    "field": "company",
    "operator": "is_not_empty",
    "value": null
  }
]
```

**Operadores suportados:**
- `equals` — Valor exato
- `not_equals` — Diferente de
- `contains` — Contém (para strings e arrays)
- `not_contains` — Não contém
- `starts_with` — Começa com
- `ends_with` — Termina com
- `is_empty` — Campo vazio/null
- `is_not_empty` — Campo preenchido
- `greater_than` — Maior que (para números como health_score)
- `less_than` — Menor que
- `in` — Está na lista (ex: status IN ['prospect', 'onboarding'])

**Campos disponíveis para condições:**
- `status` — Status do cliente (prospect, active, onboarding, etc.)
- `tags` — Tags do cliente
- `health_score` — Score de saúde (0-100)
- `company` — Nome da empresa
- `email` — Email (domínio, etc.)
- `phone` — Telefone
- `website` — Website
- `owner_id` — Dono do cliente
- `custom_fields.*` — Campos customizados (ex: `custom_fields.segmento`)

**Estrutura do campo `deal_defaults` (JSONB):**
```json
{
  "title_template": "{{client.name}} - Novo Lead",
  "value": 0,
  "probability": 10,
  "owner_id": "uuid-do-agente-ou-null",
  "notes": "Importado automaticamente pela regra: {{rule.name}}"
}
```

### 3.3 Trigger de Importação (Database Function)

```sql
-- Função executada quando um cliente é criado ou atualizado
CREATE OR REPLACE FUNCTION process_pipeline_import_rules()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
  conditions_met BOOLEAN;
  deal_title TEXT;
  deal_owner UUID;
  new_deal_id UUID;
BEGIN
  -- Iterar sobre regras ativas ordenadas por prioridade
  FOR rule IN
    SELECT pir.*, ps.pipeline_id as rule_pipeline_id
    FROM pipeline_import_rules pir
    JOIN pipeline_stages ps ON ps.id = pir.target_stage_id
    WHERE pir.is_active = true
    ORDER BY pir.priority DESC
  LOOP
    -- Verificar se já existe deal para este cliente nesta pipeline
    IF EXISTS (
      SELECT 1 FROM deals
      WHERE client_id = NEW.id AND pipeline_id = rule.pipeline_id
    ) THEN
      CONTINUE;
    END IF;

    -- Avaliar condições (implementado via função auxiliar)
    conditions_met := evaluate_import_conditions(NEW, rule.conditions);

    IF conditions_met THEN
      -- Gerar título do deal
      deal_title := COALESCE(
        replace(
          replace(rule.deal_defaults->>'title_template', '{{client.name}}', NEW.name),
          '{{client.company}}', COALESCE(NEW.company, '')
        ),
        NEW.name || ' - Novo Deal'
      );

      deal_owner := COALESCE(
        (rule.deal_defaults->>'owner_id')::UUID,
        NEW.owner_id,
        rule.created_by
      );

      -- Criar deal
      new_deal_id := uuid_generate_v4();
      INSERT INTO deals (id, pipeline_id, stage_id, client_id, title, value, probability, owner_id, notes)
      VALUES (
        new_deal_id,
        rule.pipeline_id,
        rule.target_stage_id,
        NEW.id,
        deal_title,
        COALESCE((rule.deal_defaults->>'value')::DECIMAL, 0),
        COALESCE((rule.deal_defaults->>'probability')::INTEGER, 10),
        deal_owner,
        'Importado automaticamente pela regra: ' || rule.name
      );

      -- Registrar log de importação
      INSERT INTO pipeline_import_logs (rule_id, pipeline_id, stage_id, client_id, deal_id, status)
      VALUES (rule.id, rule.pipeline_id, rule.target_stage_id, NEW.id, new_deal_id, 'success');

      -- Registrar atividade
      INSERT INTO activities (client_id, deal_id, user_id, type, description, metadata)
      VALUES (
        NEW.id, new_deal_id, deal_owner, 'deal_created',
        'Deal criado automaticamente pela regra: ' || rule.name,
        jsonb_build_object('rule_id', rule.id, 'auto_import', true)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: executar quando cliente é criado OU atualizado
CREATE TRIGGER on_client_import_rules
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION process_pipeline_import_rules();
```

### 3.4 Types — `src/types/index.ts`

```typescript
// NOVO: Regras de importação
export type ImportConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "in"

export type ImportConditionField =
  | "status"
  | "tags"
  | "health_score"
  | "company"
  | "email"
  | "phone"
  | "website"
  | "owner_id"
  | `custom_fields.${string}`

export interface ImportCondition {
  field: ImportConditionField
  operator: ImportConditionOperator
  value: string | number | string[] | null
}

export interface DealDefaults {
  title_template?: string    // Suporta {{client.name}}, {{client.company}}
  value?: number
  probability?: number
  owner_id?: string
  notes?: string
}

export interface PipelineImportRule {
  id: string
  pipeline_id: string
  target_stage_id: string
  name: string
  description?: string
  is_active: boolean
  priority: number
  conditions: ImportCondition[]
  deal_defaults: DealDefaults
  created_by?: string
  created_at: string
  updated_at: string
  // Relações
  target_stage?: PipelineStage
}

export type ImportStatus = "success" | "failed" | "skipped"

export interface PipelineImportLog {
  id: string
  rule_id?: string
  pipeline_id: string
  stage_id?: string
  client_id: string
  deal_id?: string
  status: ImportStatus
  error_message?: string
  metadata: Record<string, unknown>
  created_at: string
  // Relações
  client?: Client
  deal?: Deal
  rule?: PipelineImportRule
}
```

### 3.5 Componentes Novos

#### `src/components/pipeline/import-rules-dialog.tsx` (NOVO)
- Dialog principal para gerenciar regras de importação
- Lista de regras existentes com toggle ativo/inativo
- Indicador de prioridade (drag-and-drop para reordenar)
- Botão para criar nova regra
- Botão para ver logs de importação
- Preview: "Esta regra afetaria X clientes existentes" (count query)

#### `src/components/pipeline/import-rule-form.tsx` (NOVO)
- Form completo para criar/editar uma regra:
  - **Nome da regra** (ex: "Prospects de E-commerce")
  - **Stage destino** — Dropdown com stages da pipeline atual
  - **Prioridade** — Input numérico
  - **Condições** — Builder visual:
    - Botão "Adicionar Condição"
    - Cada condição: [Campo] [Operador] [Valor]
    - Campo = dropdown (status, tags, health_score, company, etc.)
    - Operador = dropdown dinâmico baseado no tipo do campo
    - Valor = input dinâmico (text, number, select, multi-select)
    - Botão remover condição (X)
    - Label "TODAS as condições devem ser verdadeiras" (lógica AND)
  - **Configuração do Deal criado:**
    - Template do título (com variáveis {{client.name}}, {{client.company}})
    - Valor inicial do deal
    - Probabilidade inicial
    - Responsável (dropdown de membros da pipeline)
    - Notas padrão
  - **Preview em tempo real:**
    - Mostra quantos clientes existentes seriam afetados
    - Mostra lista dos primeiros 5 clientes que casam com as condições
  - Botão "Testar Regra" — Executa dry-run e mostra resultados
  - Botão "Aplicar a Clientes Existentes" — Executa a regra retroativamente

#### `src/components/pipeline/import-logs-dialog.tsx` (NOVO)
- Dialog com tabela de logs de importação
- Filtros: por regra, por status (success/failed/skipped), por data
- Cada log mostra: cliente, deal criado, regra aplicada, timestamp, status
- Link para o deal criado
- Paginação

### 3.6 Alterações em Componentes Existentes

#### `src/components/pipeline/pipeline-header.tsx`
- Adicionar botão "Regras de Importação" (ícone Import/Download)
- Mostrar badge com número de regras ativas

#### `src/app/(dashboard)/pipeline/page.tsx`
- Fetch das regras de importação junto com dados da pipeline
- Passar regras para os componentes de configuração

---

## FEATURE 4: Correções e Melhorias Gerais

### 4.1 Fix: Delete Deal
**Arquivo:** `src/components/pipeline/pipeline-board.tsx`
- Implementar handler `handleDeleteDeal` com confirmação (AlertDialog)
- Deletar do Supabase e atualizar estado local
- Registrar atividade

### 4.2 Fix: Pipeline Store (Zustand)
**Arquivo:** `src/lib/store/index.ts`
- Atualizar store para refletir novas features
- Integrar store nos componentes (ao invés de queries diretas)
- Adicionar ações: `createPipeline`, `deletePipeline`, `addMember`, `removeMember`

```typescript
interface PipelineState {
  // Estado
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  stages: PipelineStage[]
  deals: DealWithRelations[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
  isLoading: boolean

  // Pipelines
  fetchPipelines: () => Promise<void>
  createPipeline: (input: CreatePipelineInput) => Promise<Pipeline>
  updatePipeline: (id: string, updates: Partial<Pipeline>) => Promise<void>
  deletePipeline: (id: string) => Promise<void>
  setSelectedPipeline: (pipeline: Pipeline) => Promise<void>

  // Stages
  addStage: (stage: CreateStageInput) => Promise<void>
  updateStage: (id: string, updates: Partial<PipelineStage>) => Promise<void>
  removeStage: (id: string) => Promise<void>
  reorderStages: (stageIds: string[]) => Promise<void>

  // Deals
  fetchDeals: () => Promise<void>
  addDeal: (deal: Partial<Deal>) => Promise<void>
  updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>
  moveDeal: (dealId: string, stageId: string) => Promise<void>
  removeDeal: (id: string) => Promise<void>

  // Members
  fetchMembers: () => Promise<void>
  addMember: (userId: string, role: PipelineMemberRole) => Promise<void>
  updateMemberRole: (memberId: string, role: PipelineMemberRole) => Promise<void>
  removeMember: (memberId: string) => Promise<void>

  // Import Rules
  fetchImportRules: () => Promise<void>
  createImportRule: (rule: Partial<PipelineImportRule>) => Promise<void>
  updateImportRule: (id: string, updates: Partial<PipelineImportRule>) => Promise<void>
  deleteImportRule: (id: string) => Promise<void>
  toggleImportRule: (id: string) => Promise<void>
  testImportRule: (conditions: ImportCondition[]) => Promise<Client[]>
  applyImportRuleToExisting: (ruleId: string) => Promise<number>
}
```

### 4.3 Melhoria: Deal Dialog
**Arquivo:** `src/components/pipeline/deal-dialog.tsx`
- Adicionar campo `expected_close_date` (date picker)
- Adicionar campo `owner_id` (dropdown de membros da pipeline)
- Slider para probabilidade ao invés de input text
- Mostrar campos customizados se existirem

---

## IMPACTO NO CÓDIGO POR ARQUIVO

### Arquivos NOVOS (a criar):

| Arquivo | Propósito |
|---------|-----------|
| `supabase/migrations/00002_pipeline_enhancements.sql` | Migration com todas alterações de banco |
| `src/components/pipeline/pipeline-create-dialog.tsx` | Dialog de criação de pipeline com stages |
| `src/components/pipeline/pipeline-settings-dialog.tsx` | Dialog de edição/configuração de pipeline |
| `src/components/pipeline/pipeline-members-dialog.tsx` | Dialog de gestão de membros |
| `src/components/pipeline/import-rules-dialog.tsx` | Dialog de listagem de regras de importação |
| `src/components/pipeline/import-rule-form.tsx` | Form de criação/edição de regra |
| `src/components/pipeline/import-logs-dialog.tsx` | Dialog de logs de importação |

**Total: 7 novos arquivos**

### Arquivos MODIFICADOS:

| Arquivo | Mudanças |
|---------|----------|
| `src/types/index.ts` | +~80 linhas: novos types (PipelineMember, ImportRule, ImportCondition, DealDefaults, etc.) |
| `src/lib/store/index.ts` | Refatorar `usePipelineStore` completamente (~200 linhas) |
| `src/app/(dashboard)/pipeline/page.tsx` | Converter para suportar pipeline switching, fetch members, passar roles |
| `src/components/pipeline/pipeline-header.tsx` | Corrigir switching, adicionar botões (membros, importação, criar, config) |
| `src/components/pipeline/pipeline-board.tsx` | Verificação de permissões por role, fix delete, melhorias visuais |
| `src/components/pipeline/deal-dialog.tsx` | Novos campos (date, owner, slider prob), validações |

**Total: 6 arquivos modificados**

### Arquivos NÃO modificados (sem impacto):

- `src/components/ui/*` — Componentes base reutilizáveis, já suportam tudo necessário
- `src/lib/supabase/*` — Clients já funcionam para as novas queries
- `src/app/(auth)/*` — Autenticação não muda
- `src/components/layout/*` — Sidebar e Header não precisam mudar
- `src/components/dashboard/*` — Dashboard pode ser atualizado depois (fora do escopo)
- `src/components/clients/*` — Clientes existentes não precisam mudar (trigger é no banco)

---

## FLUXO DE DADOS COMPLETO (Novo)

```
                    ┌─────────────────────────────┐
                    │     Pipeline Page (SSR)      │
                    │  - Fetch pipelines do user   │
                    │  - Fetch membership/role     │
                    │  - Fetch stages & deals      │
                    └──────────┬──────────────────┘
                               │
               ┌───────────────┼───────────────────┐
               │               │                   │
    ┌──────────▼──┐   ┌───────▼──────┐   ┌───────▼─────────┐
    │   Pipeline   │   │  Pipeline    │   │   Import Rules   │
    │   Header     │   │  Board       │   │   (Config)       │
    │              │   │              │   │                   │
    │ - Switch     │   │ - Kanban     │   │ - Regras ativas  │
    │ - Create     │   │ - DnD deals  │   │ - Conditions     │
    │ - Members    │   │ - CRUD deals │   │ - Preview        │
    │ - Settings   │   │ - Permissões │   │ - Logs           │
    │ - Import     │   │              │   │                   │
    └──────┬───┬──┘   └──────────────┘   └──────────────────┘
           │   │
    ┌──────▼┐ ┌▼──────────┐
    │Create │ │ Members   │
    │Dialog │ │ Dialog    │
    │       │ │           │
    │-Nome  │ │-Lista     │
    │-Stages│ │-Adicionar │
    │-Desc  │ │-Role      │
    └───────┘ └───────────┘

                    ┌─────────────────────────────┐
                    │  Trigger Automático (DB)     │
                    │                              │
                    │  Cliente criado/atualizado   │
                    │         ↓                    │
                    │  Avaliar regras ativas       │
                    │         ↓                    │
                    │  Condições casam?            │
                    │    Sim → Criar deal          │
                    │    Não → Próxima regra       │
                    │         ↓                    │
                    │  Registrar log               │
                    └─────────────────────────────┘
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Fase 1: Banco de Dados (Migration)
1. Criar migration `00002_pipeline_enhancements.sql`
2. Adicionar `created_by` em pipelines
3. Criar tabela `pipeline_members`
4. Criar tabela `pipeline_import_rules`
5. Criar tabela `pipeline_import_logs`
6. Criar enums (`pipeline_member_role`, `import_status`)
7. Criar triggers e functions
8. Atualizar RLS policies
9. Seed: adicionar membership para user existente na pipeline padrão

### Fase 2: Types e Store
1. Atualizar `src/types/index.ts` com novos types
2. Refatorar `usePipelineStore` em `src/lib/store/index.ts`

### Fase 3: CRUD de Pipeline
1. Criar `pipeline-create-dialog.tsx`
2. Criar `pipeline-settings-dialog.tsx`
3. Atualizar `pipeline-header.tsx` (switching + botões)
4. Atualizar `pipeline/page.tsx` (suporte multi-pipeline)

### Fase 4: Membros/Agentes
1. Criar `pipeline-members-dialog.tsx`
2. Atualizar `pipeline-board.tsx` (verificação de permissões)
3. Atualizar `pipeline-header.tsx` (botão membros + avatares)
4. Atualizar `deal-dialog.tsx` (owner dropdown)

### Fase 5: Importação Automática
1. Criar `import-rules-dialog.tsx`
2. Criar `import-rule-form.tsx` (builder de condições)
3. Criar `import-logs-dialog.tsx`
4. Atualizar `pipeline-header.tsx` (botão importação)

### Fase 6: Correções Gerais
1. Fix delete deal no `pipeline-board.tsx`
2. Adicionar campos no `deal-dialog.tsx`
3. Testes e ajustes finais

---

## ESTIMATIVA DE COMPLEXIDADE

| Item | Arquivos | Impacto |
|------|----------|---------|
| Migration SQL | 1 novo | ~200 linhas SQL |
| Types | 1 modificado | +~80 linhas |
| Store | 1 modificado | ~200 linhas refatoradas |
| Pipeline CRUD | 2 novos + 2 mod | ~600 linhas novas |
| Members | 1 novo + 2 mod | ~400 linhas novas |
| Import Rules | 3 novos + 1 mod | ~800 linhas novas |
| Fixes | 2 mod | ~100 linhas |
| **TOTAL** | **7 novos + 6 mod** | **~2400 linhas** |
