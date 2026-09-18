-- Bucket público da mídia dos formulários.
--
-- A imagem de uma tela é servida ao VISITANTE do formulário, que é
-- anônimo — não tem sessão no admin e nunca terá. O upload que já existe
-- (o do Estúdio) devolve uma URL da rota `/api/ai/convertia/imagem`, que
-- exige `requireAuth`: a prova da tela 9 abriria perfeitamente para quem
-- está logado e apareceria QUEBRADA para todo lead, sem nada em tela
-- dizendo por quê. Daí um bucket próprio e público.
--
-- Só imagem e vídeo curto. PDF e documento ficam de fora de propósito:
-- o renderizador desenha `<img>` ou `<video>`, e um PDF aqui viraria um
-- retângulo vazio na tela do lead.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-media',
  'form-media',
  true,
  26214400, -- 25 MB: o vídeo de abertura é curto, mas não cabe em 15
  array[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura por QUALQUER UM: é o visitante do formulário quem carrega a
-- imagem, e ele não é `authenticated`. O bucket guarda material de
-- divulgação (print de dashboard, cláusula de contrato) já escolhido
-- para ser mostrado a estranhos — é o mesmo grau de exposição da página
-- pública que o exibe.
drop policy if exists "form_media_leitura_publica" on storage.objects;
create policy "form_media_leitura_publica" on storage.objects
  for select to public
  using (bucket_id = 'form-media');

-- Escrita só de dentro: quem sobe é o editor, com sessão, e o caminho
-- começa pela org. Sem o escopo por pasta, um membro de uma org poderia
-- sobrescrever a prova de outra.
drop policy if exists "form_media_escrita_da_org" on storage.objects;
create policy "form_media_escrita_da_org" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'form-media'
    and (storage.foldername(name))[1] in (
      select 'org-' || om.org_id::text
      from public.org_members om
      where om.profile_id = auth.uid() and om.is_active
    )
  );

drop policy if exists "form_media_remocao_da_org" on storage.objects;
create policy "form_media_remocao_da_org" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'form-media'
    and (storage.foldername(name))[1] in (
      select 'org-' || om.org_id::text
      from public.org_members om
      where om.profile_id = auth.uid() and om.is_active
    )
  );
