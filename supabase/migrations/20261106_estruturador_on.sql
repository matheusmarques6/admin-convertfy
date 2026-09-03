-- 20261106 — Estruturador de volta ao pipeline (reversão da 20261093)
--
-- 31/08 (20261093) desligou o Estruturador em todas as orgs: a tese era o
-- Curador do vault absorver estrutura + variantes num call só. Em 02/09 o
-- owner decidiu religar — e com a SEQUÊNCIA de seções voltando a ser dele
-- (a aba Arquitetura fica como intenção por bloco, que o Curador lê quando
-- o Estruturador está desligado).
--
-- O que muda junto, no código do mesmo commit: o Curador do vault passa a
-- receber a saída COMPLETA do Estruturador (o template dele não tinha o
-- bloco — só o Curador legado tinha), as lacunas do vault e o índice de
-- pastas do Obsidian com consulta sob demanda; o Estruturador perde o
-- validador de conteúdo (o que ele devolver vale) e recebe o perfil da
-- marca inteiro em vez de campos soltos.
--
-- Efeito operacional: com `on`, o reuso da fase 1 é desligado (ADR
-- adr-estruturador-adaptativo, decisão 6) — toda geração refaz
-- Estruturador + Curador + Montador + blueprint.
--
-- Idempotente. Rollback sem deploy: voltar a coluna para 'off'.

UPDATE email_generation_settings
   SET estruturador_mode = 'on'
 WHERE estruturador_mode IS DISTINCT FROM 'on';

SELECT org_id, estruturador_mode, curador_vault_mode
  FROM email_generation_settings;
