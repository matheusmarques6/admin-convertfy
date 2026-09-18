-- Mídia da tela do formulário: a imagem ou o vídeo acima do título.
--
-- Mora aqui, e não no rascunho do schema, porque é CONTEÚDO da tela —
-- como `description`. `montarVersao` reconstrói os blocos a partir desta
-- tabela: o que não está aqui só sobrevive enquanto ninguém publicar.
--
-- O `statement` (tela de conteúdo, sem resposta) passa a ser uma linha
-- desta tabela pelo MESMO motivo. `field_type` é TEXT livre neste schema,
-- então não há CHECK a alterar — a régua é o Zod da rota.
alter table public.crm_form_fields
  add column if not exists media jsonb;

comment on column public.crm_form_fields.media is
  'Imagem ou vídeo da tela: {tipo, url, alt, autoplay, poster}. Normalizada em lib/forms/midia (a URL vai para um src de página pública).';
