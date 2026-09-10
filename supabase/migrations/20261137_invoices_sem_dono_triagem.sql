-- ============================================================================
-- Fatura do Asaas sem dono entra no espelho e vai para TRIAGEM (set/2026).
--
-- Medido em 10/09/2026, logs do Postgres: 167 erros
-- `null value in column "client_id" of relation "invoices"` numa única
-- rodada do cron, e ZERO faturas criadas na janela. O sync resolve o dono
-- por `externalReference` ou por `custom_fields.asaas_customer_id`, e quem
-- nunca foi vinculado NUNCA é achado — o pagamento dele simplesmente não
-- entra. A carteira existe para mostrar esse dinheiro, então perder a
-- cobrança é ferir a regra de negócio; pular o INSERT seria a mesma perda
-- com log mais limpo.
--
-- A decisão: a fatura entra SEM dono e aparece numa lista
-- "Sem cliente — vincular" no Financeiro, no mesmo padrão do "Classificar"
-- que já existe para loja. Três mudanças, e nenhuma é opcional:
--
-- 1. `client_id` anulável. A FK ON DELETE CASCADE continua válida.
-- 2. `asaas_customer_id`: sem ele a linha é INACIONÁVEL — a tela precisa
--    dizer de quem é o pagamento no Asaas para alguém decidir.
-- 3. `org_id`: hoje a org de uma fatura vem PELO CLIENTE. Sem cliente, a
--    linha ficaria sem org nenhuma — fora de todo escopo, em toda tela.
--
-- E a policy: `can_access_client(NULL)` é FALSO para quem não é admin
-- (a função faz EXISTS contra client_stores.client_id). Sem mexer nela, as
-- linhas órfãs nasceriam invisíveis justamente para quem tem de resolvê-las
-- e a lista de triagem abriria vazia — a mesma perda de dinheiro, agora com
-- uma tela que jura estar tudo certo.
--
-- O escopo usa `is_org_member()` (sem argumento), o helper do round 5B:
-- há UMA org e ninguém em duas, e é ele que mantém o portal do cliente de
-- fora — usuário de portal não é membro da org, e cliente nenhum pode ver
-- pagamento que talvez não seja dele.
-- ============================================================================

-- ── 1. As colunas ──────────────────────────────────────────────────────────

ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN invoices.client_id IS
  'Dono da fatura. NULL = ainda não identificado; a linha aparece na triagem "Sem cliente" do Financeiro.';
COMMENT ON COLUMN invoices.asaas_customer_id IS
  'Pagador no Asaas (cus_...). É o que torna a fatura sem dono acionável na triagem.';
COMMENT ON COLUMN invoices.org_id IS
  'Org da fatura. Redundante com clients.org_id quando há dono, e a ÚNICA fonte de escopo quando não há.';

-- Backfill: a org de quem já tem dono vem do cliente.
UPDATE invoices i
   SET org_id = c.org_id
  FROM clients c
 WHERE c.id = i.client_id
   AND i.org_id IS DISTINCT FROM c.org_id;

-- A triagem é lida por org + "sem dono"; sem índice ela varre a tabela toda
-- a cada abertura do Financeiro. Parcial porque a pergunta é sempre a mesma
-- e o conjunto é pequeno perto do total.
CREATE INDEX IF NOT EXISTS idx_invoices_sem_dono
  ON invoices (org_id, due_date DESC)
  WHERE client_id IS NULL;

-- Casar o pagador do Asaas de volta para o cliente, quando alguém vincular.
CREATE INDEX IF NOT EXISTS idx_invoices_asaas_customer
  ON invoices (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

-- ── 2. A policy que faz a triagem existir na tela ──────────────────────────
--
-- Cria a nova ANTES de dropar a antiga: policies permissivas são OR, então
-- entre os dois passos a cobertura só aumenta e não há janela sem acesso
-- (mesma ordem do round 5B do RLS).

DROP POLICY IF EXISTS "Ver faturas, inclusive as sem dono" ON invoices;
CREATE POLICY "Ver faturas, inclusive as sem dono" ON invoices
  FOR SELECT TO authenticated
  USING (
    can_access_client(client_id)
    OR (client_id IS NULL AND is_org_member())
  );

DROP POLICY IF EXISTS "Users can view invoices" ON invoices;

-- Vincular a fatura órfã é escrita: quem enxerga a triagem tem de poder
-- resolvê-la. O ALL de admin/owner que já existe cobre o resto.
DROP POLICY IF EXISTS "Vincular fatura sem dono" ON invoices;
CREATE POLICY "Vincular fatura sem dono" ON invoices
  FOR UPDATE TO authenticated
  USING (client_id IS NULL AND is_org_member())
  WITH CHECK (is_org_member());

-- ── Verificação ────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE client_id IS NULL) AS sem_dono,
--        count(*) FILTER (WHERE org_id IS NULL)    AS sem_org,
--        count(*)                                   AS total
--   FROM invoices;
-- Depois da primeira varredura, `sem_dono` é o tamanho da fila de triagem e
-- `sem_org` tem de ser ZERO — linha sem org não aparece para ninguém.

-- ── Rollback ───────────────────────────────────────────────────────────────
-- Só é possível com a triagem VAZIA (a coluna volta a ser NOT NULL):
--   DELETE FROM invoices WHERE client_id IS NULL;  -- perde o que não foi vinculado
--   ALTER TABLE invoices ALTER COLUMN client_id SET NOT NULL;
--   DROP POLICY IF EXISTS "Ver faturas, inclusive as sem dono" ON invoices;
--   DROP POLICY IF EXISTS "Vincular fatura sem dono" ON invoices;
--   CREATE POLICY "Users can view invoices" ON invoices FOR SELECT
--     USING (is_admin() OR can_access_client(client_id));
