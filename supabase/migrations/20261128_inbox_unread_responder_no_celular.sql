-- ============================================================
-- Inbox — responder pelo celular também marca a conversa como lida
-- ============================================================
-- Sintoma: o atendente responde o cliente pelo WhatsApp do CELULAR e a
-- conversa continua marcada como não lida no admin. Em produção,
-- "Breno Neves" estava com unread_count = 14 e "Lucas" com 3, ambos com
-- a ÚLTIMA mensagem outbound e `sent_by_kind = 'system'` (a marca da
-- resposta pelo aparelho, que chega pelo webhook da Evolution com
-- fromMe=true).
--
-- A causa estava aqui: o CASE do unread_count incrementa no inbound e,
-- em qualquer outro caso, MANTÉM o valor. Quem zerava era só o
-- `POST /threads/[id]/read`, ou seja, abrir a conversa no admin —
-- caminho que responder pelo celular nunca percorre.
--
-- O webhook já tratava metade do problema: `clearCrmThreadNotifications`
-- limpa o sino quando chega um fromMe. Ficavam divergentes justamente as
-- duas coisas que a documentação diz espelharem uma à outra (a
-- notificação some, o contador fica) — sino limpo e badge acesso na
-- mesma conversa.
--
-- Três condições, e cada uma existe por um motivo:
--
--  * `sent_by_kind IN ('agent','system')` — responder É ler: quem
--    escreveu a resposta viu a conversa, pelo admin ('agent') ou pelo
--    aparelho ('system'). AUTOMAÇÃO ficou de fora de propósito: um
--    fluxo automático responder não significa que alguém leu, e zerar
--    ali esconderia do atendente que ainda há mensagem para olhar.
--
--  * `NOT is_historical` — a importação de histórico traz outbound
--    antigo aos milhares; ela não é atendimento e não pode limpar nada.
--
--  * `NEW.created_at >= last_message_at` — a MESMA guarda que o
--    GREATEST acima usa. Mensagem que chega fora de ordem (reprocesso
--    da fila, importação) não pode apagar não-lidas mais recentes que
--    ela.
--
-- Custo: zero escrita nova. O trigger já faz este UPDATE; muda só o
-- valor de uma coluna — nenhum evento de realtime a mais (crm_threads
-- está na publication, e é a regra que a recuperação de custo fixou).
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_messages_update_thread()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE crm_threads
  SET
    last_message_at = GREATEST(last_message_at, NEW.created_at),
    last_message_preview = CASE
      WHEN NEW.created_at >= last_message_at
        THEN LEFT(COALESCE(NEW.body, '[' || NEW.content_type || ']'), 200)
      ELSE last_message_preview
    END,
    last_message_direction = CASE
      WHEN NEW.created_at >= last_message_at THEN NEW.direction
      ELSE last_message_direction
    END,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' AND NOT COALESCE(NEW.is_historical, FALSE)
        THEN unread_count + 1
      -- Resposta humana (admin ou celular) conta como leitura.
      WHEN NEW.direction = 'outbound'
       AND COALESCE(NEW.sent_by_kind, '') IN ('agent', 'system')
       AND NOT COALESCE(NEW.is_historical, FALSE)
       AND NEW.created_at >= last_message_at
        THEN 0
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$function$;

-- Backfill do que ficou preso: conversa cuja mensagem MAIS RECENTE é
-- uma resposta humana e que mesmo assim conta não-lidas. Escrito pela
-- última mensagem real (não por last_message_direction) porque é esse o
-- fato que decide, e a coluna é derivada.
UPDATE crm_threads t
SET unread_count = 0, updated_at = NOW()
WHERE t.unread_count > 0
  AND (
    SELECT m.direction = 'outbound'
       AND COALESCE(m.sent_by_kind, '') IN ('agent', 'system')
       AND NOT COALESCE(m.is_historical, FALSE)
    FROM crm_messages m
    WHERE m.thread_id = t.id
    ORDER BY m.created_at DESC
    LIMIT 1
  );
