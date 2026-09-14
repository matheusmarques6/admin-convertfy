-- DADOS (não é migration de schema) — 14/09/2026
--
-- O `profiles.avatar_url` do único perfil com avatar na base aponta para
-- `.../avatars/<uid>/avatar.png`, e o bucket `avatars` tem UM objeto:
-- `<uid>/avatar.jpg` (46.011 bytes, image/jpeg, criado em 01/03/2026).
-- O Storage responde 400 para objeto ausente, e a página de Configurações
-- pedia esse PNG quatro vezes por carregamento (sidebar, drawer mobile,
-- top bar e a seção Conta). A UI degradava bem — o Radix cai nas iniciais —,
-- então durou meses sem ninguém ver.
--
-- A causa de código (a limpeza das outras extensões acontecia ANTES do
-- upload e do update) foi corrigida na rota; isto conserta o dado que ficou.
--
-- Idempotente: só toca a linha que ainda aponta para o .png.

update profiles
set avatar_url = regexp_replace(avatar_url, '\.png$', '.jpg'),
    updated_at = now()
where id = '62decdad-1a88-414f-a16e-54290a052064'
  and avatar_url like '%/avatar.png';

-- Conferência: a URL tem de casar com um objeto que existe.
select p.id, p.avatar_url,
       exists (
         select 1 from storage.objects o
         where o.bucket_id = 'avatars'
           and p.avatar_url like '%' || o.name
       ) as arquivo_existe
from profiles p
where p.avatar_url is not null;
