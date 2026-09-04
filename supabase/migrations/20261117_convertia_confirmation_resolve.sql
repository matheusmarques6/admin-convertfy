-- ConvertIA: resolução ATÔMICA da confirmação de ação irreversível.
--
-- O gate era "ler resolved_at → gravar resolved_at" em duas requisições
-- separadas: dois cliques em "Confirmar" (ou duas abas) passavam os dois
-- pela leitura e a campanha era enviada duas vezes. Aqui é UM UPDATE
-- condicional: só vira quem encontrar a pendência ainda aberta.
CREATE OR REPLACE FUNCTION ai_chat_confirmation_resolve(
  p_message_id UUID,
  p_confirmation_id TEXT,
  p_resolution TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE ai_chat_messages
  SET meta = jsonb_set(
    meta,
    '{pending_confirmation}',
    (meta->'pending_confirmation')
      || jsonb_build_object('resolved_at', to_jsonb(NOW()), 'resolution', to_jsonb(p_resolution))
  )
  WHERE id = p_message_id
    AND meta->'pending_confirmation'->>'id' = p_confirmation_id
    AND (meta->'pending_confirmation'->>'resolved_at') IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION ai_chat_confirmation_resolve(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_chat_confirmation_resolve(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION ai_chat_confirmation_resolve(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION ai_chat_confirmation_resolve(UUID, TEXT, TEXT) TO service_role;
