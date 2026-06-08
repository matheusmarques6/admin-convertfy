-- Blindar handle_new_user: o trigger nunca deve abortar a criacao do auth user
--
-- Sintoma: convidar membro / criar usuario falha com
--   "Database error creating new user"
-- Causa: handle_new_user() roda AFTER INSERT em auth.users e faz INSERT em
-- public.profiles dentro da MESMA transacao do GoTrue. Se esse INSERT levanta
-- qualquer excecao (drift de schema, coluna NOT NULL nova, constraint, versao
-- antiga do trigger, etc.), o GoTrue desfaz tudo e retorna o erro generico
-- acima — quebrando convites (/api/team/invite, /api/admin/org-members) e
-- signup publico.
--
-- O app ja cria/reconcilia o profile explicitamente logo apos o createUser
-- (ver src/lib/services/org-member-invite.service.ts: checa profile por id e
-- insere se faltar). Portanto o trigger e apenas uma conveniencia e NUNCA deve
-- ser fatal. Esta migration:
--   1. Mantem o skip de portal users (geridos em client_portal_users).
--   2. Usa ON CONFLICT (id) DO NOTHING para idempotencia.
--   3. Envolve em EXCEPTION WHEN OTHERS -> RETURN NEW, garantindo que qualquer
--      falha ao semear o profile NAO bloqueie a criacao do auth user.
-- Idempotente (CREATE OR REPLACE) e seguro de reaplicar.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Portal users sao geridos via client_portal_users, nao em profiles
  IF (NEW.raw_user_meta_data->>'is_portal_user')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'sdr')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloquear a criacao do auth user por falha ao semear o profile.
  -- O app reconcilia o profile logo em seguida.
  RAISE WARNING 'handle_new_user falhou para % (%): %', NEW.id, NEW.email, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
