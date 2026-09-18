-- Os quatro tipos do seletor "estilo Typeform" no CHECK de
-- crm_form_fields.field_type: yes_no (Sim/Não), nps (escala 0–10),
-- rating (estrelas) e schedule (agendar reunião na nossa agenda).
--
-- Mesma armadilha da 20261168: o tipo existe em `FormBlockType`, o
-- editor o oferece, o Zod aceita — e o INSERT morre em 23514 na
-- fronteira do banco, sem nada em tela. `tipos-no-check.test.ts` lê
-- esta migration e reprova o código que gravar tipo fora da lista.
--
-- Aditivo e reversível: a lista antiga é a nova menos os quatro.
alter table public.crm_form_fields
  drop constraint if exists crm_form_fields_field_type_check;

alter table public.crm_form_fields
  add constraint crm_form_fields_field_type_check check (
    field_type = any (array[
      'text', 'email', 'phone', 'number', 'textarea', 'select', 'multi_select',
      'radio', 'checkbox', 'date', 'url', 'cpf', 'cnpj', 'cep', 'hidden',
      'statement', 'yes_no', 'nps', 'rating', 'schedule'
    ]::text[])
  );
