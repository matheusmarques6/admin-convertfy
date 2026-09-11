-- Bucket PÚBLICO para os assets extraídos do HTML da biblioteca de e-mail.
--
-- Por que um bucket novo, e não o `onboarding-visual-assets`:
--
--  1. Aquele é PRIVADO (`public = false`), e a URL que este caminho precisa
--     é pública e eterna. `getPublicUrl` num bucket privado devolve um
--     endereço que responde 403 — trocaria o base64 por imagem quebrada em
--     TODO cliente de e-mail, que é pior que o defeito que se foi corrigir.
--  2. Torná-lo público não é opção: ele guarda gerações e assets por LOJA,
--     e abrir tudo para resolver ícone de rodapé é desproporcional.
--
-- O conteúdo aqui é o oposto de sensível: ícone de rede social, logo e
-- selo que hoje viajam embutidos em `email_component_variants.html`, ou
-- seja, dentro de e-mails já enviados a milhares de pessoas.
--
-- A URL precisa durar: o e-mail vai ao Klaviyo/Omnisend e pode ser aberto
-- anos depois, num arquivo de newsletter ou num encaminhamento. URL
-- assinada transformaria o ícone de hoje na imagem quebrada de amanhã.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-library-assets',
  'email-library-assets',
  true,
  5242880,                                  -- 5 MB: são ícones, não fotos
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: pública, é o ponto do bucket.
drop policy if exists "email_library_assets_public_read" on storage.objects;
create policy "email_library_assets_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'email-library-assets');

-- Escrita: só quem administra a biblioteca. O service role bypassa RLS e é
-- por ele que a varredura sobe; a policy existe para que a anon key, que
-- está no JS do browser, não possa escrever aqui.
drop policy if exists "email_library_assets_write" on storage.objects;
create policy "email_library_assets_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-library-assets' and is_org_member());
