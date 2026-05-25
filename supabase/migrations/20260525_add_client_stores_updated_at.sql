-- Adiciona updated_at a client_stores caso esteja ausente.
-- A coluna constava no CREATE TABLE original (20241212) mas não existe
-- no banco de produção — provável criação manual sem ela.

alter table client_stores
  add column if not exists updated_at timestamptz default now();

-- Backfill: preenche linhas antigas com created_at
update client_stores
   set updated_at = created_at
 where updated_at is null;

-- Trigger para manter updated_at sincronizado em todo UPDATE
create or replace function trg_client_stores_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_client_stores_updated_at on client_stores;

create trigger set_client_stores_updated_at
  before update on client_stores
  for each row
  execute function trg_client_stores_set_updated_at();
