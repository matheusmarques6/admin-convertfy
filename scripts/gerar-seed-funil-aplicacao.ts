/**
 * Gera o SQL que semeia o funil de aplicação no banco.
 *
 * A definição vive em `src/lib/forms/funil-aplicacao.ts` (é lá que os
 * caminhos são testados pela engine de produção); este script só a
 * traduz para INSERT. Gerar em vez de escrever o SQL à mão é o que
 * impede a definição testada e o dado do banco divergirem — e eles
 * divergiriam em silêncio, porque um SQL com um `goto` errado é um SQL
 * válido.
 *
 * Uso: `node -r ./scripts/alias-arroba.cjs -r sucrase/register/ts scripts/gerar-seed-funil-aplicacao.ts > arquivo.sql`
 */

import { camposDoFunil, rascunhoDoFunil, FORM_ID, FORM_NOME, FORM_SLUG } from "../src/lib/forms/funil-aplicacao"
import { AGENDA_PADRAO } from "../src/lib/meetings/disponibilidade"

const ORG_ID = "d1ae3cf9-558d-40cc-9272-4a5633894ef8"
const PIPELINE_ID = "217c6a20-668d-4592-aa1b-4555b35a19cc"
const STAGE_LEAD_NOVO = "10f65a24-e529-4761-b86b-afb2b207fe47"
const STAGE_ABANDONO = "96a73dec-b71c-498f-9d87-87f63fb0f484"
const PIXEL = "694200440166500"

/** Literal SQL de um JSON. Aspas simples dobradas; nada de concatenar. */
function j(v: unknown): string {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
}
function s(v: string | null): string {
  return v === null ? "null" : `'${v.replace(/'/g, "''")}'`
}

const rascunho = rascunhoDoFunil(1)
const campos = camposDoFunil()

const tema = {
  mode: "dark",
  fontSize: 15,
  hideTitle: true,
  textColor: "#F1F5F9",
  bgGradient: null,
  fontFamily: "Inter, system-ui, sans-serif",
  logoHeight: 75,
  headingSize: 30,
  borderRadius: 10,
  primaryColor: "#2137b6",
  hidePoweredBy: true,
  buttonGradient: { to: "#4e62d8", from: "#2137b6", angle: 90 },
  containerWidth: 720,
  backgroundColor: "#0B0B14",
  buttonTextColor: "#FFFFFF",
}

const tracking = {
  meta: {
    enabled: true,
    browser_pixel: true,
    // Um funil de 21 telas perde metade de quem começa. `form_step`
    // diz onde cada um parou (um evento só, parametrizado) e
    // `lead_no_parcial` manda o "Lead" na hora em que o contato é
    // capturado — sem ele a Meta só vê quem termina, e a campanha
    // otimiza para concluir o questionário em vez de deixar contato.
    // Os dois são opt-in justamente porque só fazem sentido aqui.
    form_step: true,
    lead_no_parcial: true,
  },
  google: { enabled: false },
  // O `LeadQualificado` é do FINAL aprovado, não de uma faixa de
  // faturamento: quem chega lá já passou pelos três cortes duros. Uma
  // régua por resposta aqui discordaria do desfecho que a pessoa viu.
  qualified_lead: {
    enabled: true,
    logic: "and",
    rules: [],
    endings: ["fim_aprovado"],
    event_name: "LeadQualificado",
  },
}

/**
 * A agenda que o final aprovado oferece.
 *
 * A regra vai ESCRITA no banco, e não implícita no padrão do código,
 * para ser ajustada sem deploy — janela, duração e antecedência são
 * decisões de operação, não de engenharia. `organizador_id` fica de
 * fora de propósito: sem ele a cascata do serviço resolve (dono do
 * formulário → dono da org), e um id fixo aqui envelheceria calado no
 * dia em que essa pessoa saísse.
 */
const agenda = {
  titulo: "Diagnóstico de retenção · {{nome}}",
  regra: AGENDA_PADRAO,
}

const out: string[] = []
out.push(`-- Semeado por scripts/gerar-seed-funil-aplicacao.ts — não edite à mão.`)
out.push(`-- A definição vive em src/lib/forms/funil-aplicacao.ts (testada em funil-aplicacao.test.ts).`)
out.push(`begin;`)
out.push(`
insert into public.crm_forms
  (id, org_id, pipeline_id, stage_id, name, slug, description, status, scope,
   display_mode, locale, theme, tracking_config, settings, draft_schema,
   facebook_pixel_id, success_message)
values (
  '${FORM_ID}', '${ORG_ID}', '${PIPELINE_ID}', '${STAGE_LEAD_NOVO}',
  ${s(FORM_NOME)}, '${FORM_SLUG}',
  ${s("Funil de aplicação que recebe tráfego pago direto do anúncio. 21 telas, duas trilhas, cinco finais.")},
  'draft', 'sales', 'conversational', 'pt-BR',
  ${j(tema)}, ${j(tracking)},
  ${j({ abandono_stage_id: STAGE_ABANDONO, agenda })},
  ${j(rascunho)},
  '${PIXEL}',
  ${s("Aplicação recebida. Eu leio e te respondo em até 2 horas úteis.")}
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  display_mode = excluded.display_mode,
  theme = excluded.theme,
  tracking_config = excluded.tracking_config,
  settings = excluded.settings,
  draft_schema = excluded.draft_schema,
  facebook_pixel_id = excluded.facebook_pixel_id,
  pipeline_id = excluded.pipeline_id,
  stage_id = excluded.stage_id,
  updated_at = now();`)

out.push(`
-- Campos que saíram da definição são removidos; os demais são reescritos.
delete from public.crm_form_fields
where form_id = '${FORM_ID}'
  and id not in (${campos.map((c) => `'${c.id}'`).join(", ")});`)

// Um INSERT só, com todos os campos: 24 blocos `on conflict do update`
// idênticos seriam 24 cópias da mesma lista de colunas, e a próxima
// coluna teria de ser acrescentada em 24 lugares.
const COLUNAS =
  "(id, form_id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field, media)"
const linhas = campos.map(
  (c) =>
    `  ('${c.id}', '${FORM_ID}', ${s(c.field_type)}, ${s(c.label)}, ${s(c.placeholder ?? null)}, ${s(
      c.description ?? null,
    )}, ${c.required ? "true" : "false"}, ${c.position}, ${j(c.options ?? [])}, ${j(
      c.validation ?? {},
    )}, ${s(c.map_to_lead_field ?? null)}, ${c.media ? j(c.media) : "null"})`,
)
out.push(`
insert into public.crm_form_fields
  ${COLUNAS}
values
${linhas.join(",\n")}
on conflict (id) do update set
  field_type = excluded.field_type,
  label = excluded.label,
  placeholder = excluded.placeholder,
  description = excluded.description,
  required = excluded.required,
  position = excluded.position,
  options = excluded.options,
  validation = excluded.validation,
  map_to_lead_field = excluded.map_to_lead_field,
  media = excluded.media;`)

out.push(`
commit;`)

process.stdout.write(out.join("\n") + "\n")
