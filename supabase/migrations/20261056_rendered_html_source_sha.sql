-- ============================================================
-- Story CM-6 — o exemplo renderizado da variante ganha hash de origem.
--
-- O campo `rendered_html` foi criado como "exemplo real do email
-- renderizado, colado manualmente" — a intenção é ser o PADRÃO DE ACABAMENTO
-- da variante. Mas não havia como saber se ele ainda corresponde ao `html`:
-- existe um único `updated_at` por linha, então salvar só a descrição já o
-- move sem invalidar o exemplo, e editar o `html` por SQL não move nada.
--
-- O hash responde exatamente a pergunta certa: "este renderizado foi feito a
-- partir DESTE html?". Gravado com sha256(html) no momento em que o
-- renderizado é salvo (rotas POST/PATCH de componentes).
--
-- Backfill deliberadamente NÃO calcula o hash das linhas existentes: não há
-- como saber de qual versão do `html` cada exemplo veio. NULL significa
-- "validade desconhecida" e é tratado como desatualizado pelo
-- `resolveRenderedReference` — o exemplo só volta a ser usado quando alguém
-- regravar, o que é o comportamento seguro.
--
-- Idempotente. Rollback: DROP COLUMN.
-- ============================================================

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS rendered_html_source_sha TEXT;

COMMENT ON COLUMN email_component_variants.rendered_html_source_sha IS
  'sha256 do `html` no momento em que `rendered_html` foi salvo (story CM-6). Hash diferente do html atual = exemplo desatualizado, não é enviado ao agente. NULL = cadastrado antes do hash existir (validade desconhecida, tratado como desatualizado).';

-- Verificação: quantas variantes têm exemplo renderizado e quantas já têm
-- hash. A diferença é a fila de recadastro.
SELECT
  COUNT(*)                                             AS total_ativas,
  COUNT(*) FILTER (WHERE COALESCE(rendered_html, '') <> '')      AS com_renderizado,
  COUNT(*) FILTER (WHERE rendered_html_source_sha IS NOT NULL)   AS com_hash
FROM email_component_variants
WHERE is_active = true;
