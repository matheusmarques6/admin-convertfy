-- `statement` no CHECK de crm_form_fields.field_type.
--
-- O tipo existe no código desde o conversacional (`FormBlockType`), o
-- editor o oferece e o Zod da rota passou a aceitá-lo — e o CHECK ficou
-- para trás. É a armadilha do `copy_fit` e do `typography` de novo: o
-- tipo roda no código inteiro e o INSERT morre em 23514 na fronteira do
-- banco, então a tela de conteúdo simplesmente não existe e ninguém vê
-- por quê. O `multi_select` já estava aqui; só o `statement` faltava.
--
-- Aditivo e reversível: a lista antiga é a nova menos 'statement'.
alter table public.crm_form_fields
  drop constraint if exists crm_form_fields_field_type_check;

alter table public.crm_form_fields
  add constraint crm_form_fields_field_type_check check (
    field_type = any (array[
      'text', 'email', 'phone', 'number', 'textarea', 'select', 'multi_select',
      'radio', 'checkbox', 'date', 'url', 'cpf', 'cnpj', 'cep', 'hidden',
      'statement'
    ]::text[])
  );
