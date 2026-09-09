-- Vault de e-mail: dois kinds novos em email_vault_docs (09/09).
--
--   julgamento — `componentes/_julgamento.md`: a régua da casa para o
--                Curador e o Estruturador (o que é veto, o que é desempate,
--                o que pesa contra). Uma nota só, servida INTEIRA.
--   doutrina   — `componentes/doutrina/<slug>.md`: a doutrina de curso
--                (fonte declarada em `fonte:`), roteada por `secao` no
--                frontmatter para hero/assunto/copy na fase 2.
--
-- Contexto: docs/email-generation/diagnostico-vault-vs-advisor-max.md.
-- O CHECK nasceu inline na 20261093, então o nome da constraint é o que o
-- Postgres derivou; o bloco abaixo o encontra em vez de supor.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'email_vault_docs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table email_vault_docs drop constraint %I', c.conname);
  end loop;
end $$;

alter table email_vault_docs
  add constraint email_vault_docs_kind_check check (kind in (
    'protocolo','catalogo','inventario','parametros','casos',
    'secao','variante','eixo','requisito','convivencia','lacuna',
    'julgamento','doutrina','outro'
  ));

comment on column email_vault_docs.kind is
  'Categoria da nota no vault (espelha componentes/**). A lista é a mesma de VAULT_DOC_KINDS em src/lib/vault/vault-parser.ts — um teste compara as duas.';
