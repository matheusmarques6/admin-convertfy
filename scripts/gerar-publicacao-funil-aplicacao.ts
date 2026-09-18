/**
 * Gera o SQL que PUBLICA a versão do funil de aplicação.
 *
 * O editor do admin publica por uma rota autenticada; este script existe
 * para o mesmo resultado sair da definição versionada em código, sem
 * ninguém digitar JSON à mão. O schema é o MESMO objeto que a rota
 * produziria — `schemaDoFunil` chama o `montarVersao` de produção.
 *
 * Uso: `node -r ./scripts/alias-arroba.cjs -r sucrase/register/ts scripts/gerar-publicacao-funil-aplicacao.ts <versao> > arquivo.sql`
 */

import { schemaDoFunil, FORM_ID } from "../src/lib/forms/funil-aplicacao"

const ORG_ID = "d1ae3cf9-558d-40cc-9272-4a5633894ef8"
const versao = Number(process.argv[2] ?? "1")
if (!Number.isInteger(versao) || versao < 1) {
  throw new Error("Passe o número da versão a publicar.")
}

const schema = schemaDoFunil(versao)
const json = `'${JSON.stringify(schema).replace(/'/g, "''")}'::jsonb`

process.stdout.write(`-- Publicação da versão ${versao} do funil de aplicação.
-- Gerado por scripts/gerar-publicacao-funil-aplicacao.ts — não edite à mão.
begin;

insert into public.form_versions (org_id, form_id, version, schema)
values ('${ORG_ID}', '${FORM_ID}', ${versao}, ${json})
on conflict (form_id, version) do update set schema = excluded.schema;

update public.crm_forms
set published_version_id = (
      select id from public.form_versions
      where form_id = '${FORM_ID}' and version = ${versao}
    ),
    has_unpublished_changes = false,
    status = 'published',
    updated_at = now()
where id = '${FORM_ID}';

commit;
`)
