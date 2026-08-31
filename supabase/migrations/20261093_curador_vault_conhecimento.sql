-- =============================================================================
-- Curador com o cérebro do vault — FASE 0: infraestrutura (31/08/2026)
--
-- Decisão (plano em docs/email-generation/plano-curador-cerebro-vault.md,
-- desenho recomendado pelo agente do vault): o Estruturador sai de cena e o
-- conhecimento robusto de seleção passa a viver no VAULT DE COMPONENTES
-- (Obsidian → All-for-Eficiencia/Admin Convertfy/Emails/componentes/**),
-- consumido diretamente pelo Curador (assembler_chooser) — que, no fim do
-- rollout, absorve também a decisão de ESTRUTURA (um call só).
--
-- Esta migration é a fase 0 (comportamento vivo INALTERADO):
--
--   1. Estruturador DESATIVADO: estruturador_mode='off' em todas as orgs.
--      A config fica (kill-switch de graça); nenhuma org segue ligada.
--   2. Nova coluna email_generation_settings.curador_vault_mode
--      ('off'|'shadow'|'on', default 'off') — a alavanca do rollout:
--      off = Curador atual intocado; shadow = roda sonnet-4.6 com o
--      protocolo EM PARALELO ao kimi vivo (run gravada, pipeline segue no
--      kimi); on = flip (prompt novo + eixos no catálogo no call vivo).
--   3. Nova tabela email_vault_docs: as notas de componentes/** do vault
--      (protocolo de seleção em 9 passos, notas de variante com eixos
--      momento/objecao/registro/paleta/papel + exige/peso/convivencia,
--      notas de seção com chave de desempate, glossário de requisitos,
--      regras de convivência, eixos e lacunas), sincronizadas pelo
--      vault-sync. O runtime NUNCA lê o Obsidian nem o Git — lê esta
--      tabela (mesma regra de email_intents/refs/learnings, 20261081).
--
-- O flip do modelo do assembler_chooser para anthropic/claude-sonnet-4.6 é
-- DELIBERADAMENTE adiado para a migration do flip (fase 3 do plano), depois
-- do shadow validar goldens e métricas de veto.
-- =============================================================================

-- 1. Estruturador off em todas as orgs (o default da coluna já é 'off').
update email_generation_settings
   set estruturador_mode = 'off'
 where estruturador_mode is distinct from 'off';

-- 2. Alavanca do rollout do Curador.
alter table email_generation_settings
  add column if not exists curador_vault_mode text not null default 'off'
  check (curador_vault_mode in ('off','shadow','on'));

-- 3. Notas do vault de componentes.
create table if not exists email_vault_docs (
  id uuid primary key default gen_random_uuid(),
  -- Categoria da nota no vault (espelha a árvore componentes/**).
  kind text not null check (kind in (
    'protocolo','catalogo','inventario','parametros','casos',
    'secao','variante','eixo','requisito','convivencia','lacuna','outro'
  )),
  -- Subgrupo: seção da variante/nota de seção (hero, body, …) ou o eixo
  -- (momento, objecao, …). NULL para notas sem subgrupo.
  grupo text,
  -- Nome do arquivo sem extensão — o identificador dos wikilinks.
  slug text not null,
  -- Vínculo com email_component_variants (frontmatter variant_id das notas
  -- kind='variante'). Sem FK de propósito: a nota pode chegar antes da
  -- variante e o vault nunca pode quebrar por ordem de sync.
  variant_id uuid,
  status text not null default 'pendente',
  is_active boolean not null default false,
  frontmatter jsonb not null default '{}'::jsonb,
  body_md text not null default '',
  file_path text not null,
  synced_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);

create index if not exists idx_evd_kind_active
  on email_vault_docs(kind) where is_active;
create index if not exists idx_evd_variant
  on email_vault_docs(variant_id) where variant_id is not null;

-- RLS: habilitado SEM policies — acesso só pelo service role (as rotas usam
-- createAdminClient). Mesmo padrão das demais tabelas do vault (20261081):
-- a anon/authenticated key não lê nem escreve via /rest/v1.
alter table email_vault_docs enable row level security;

comment on table email_vault_docs is
  'Notas de componentes/** do vault de conhecimento (Obsidian), sincronizadas pelo vault-sync. Fonte do protocolo de seleção e dos eixos que o Curador consome.';
