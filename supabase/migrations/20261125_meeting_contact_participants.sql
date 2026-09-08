-- ===========================================
-- Contato do cliente como participante da reuniao
-- ===========================================
-- Ate aqui so MEMBROS entravam em meeting_participants ('profile' e
-- 'org_member'); o cliente so chegava ao evento por meetings.guest_emails,
-- uma lista de texto digitada a mao. Consequencia pratica: marcar uma
-- reuniao "com o cliente X" nao avisava o cliente, porque ninguem digitou
-- o email dele.
--
-- Com 'contact', o contato de crm_contacts vira participante de verdade:
--   - entra como attendee no evento do Google (recebe o convite nativo);
--   - o RSVP dele volta pelo syncRsvpFromGoogle, casado por email;
--   - a reuniao sabe QUEM do lado do cliente foi convidado (id, nao string).
--
-- participant_id passa a referenciar crm_contacts(id) quando
-- participant_type = 'contact'. A tabela nunca teve FK nessa coluna (ela
-- ja aponta para profiles OU org_members conforme o tipo), entao nao ha
-- constraint a criar aqui.
--
-- guest_emails continua existindo para convidado avulso que NAO e contato
-- cadastrado (um convidado do cliente, um parceiro pontual).
-- ===========================================

-- ALTER TYPE ... ADD VALUE roda dentro de transacao no PG12+ desde que o
-- valor novo nao seja USADO na mesma transacao — esta migration so o
-- declara. Mesmo padrao ja usado em 00002_meeting_participants.sql.
ALTER TYPE meeting_participant_type ADD VALUE IF NOT EXISTS 'contact';

COMMENT ON TABLE meeting_participants IS
  'Participantes da reuniao. participant_id referencia profiles.id (tipo profile), org_members.id (tipo org_member) ou crm_contacts.id (tipo contact — a pessoa do lado do cliente).';

NOTIFY pgrst, 'reload schema';
