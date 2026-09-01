-- =============================================================
-- O encurtador também tira o travessão.
--
-- A copy do n8n volta cheia de travessão para emendar frase: "ready to
-- send it back — but…", "lifetime guarantee — if it does not deliver…".
-- Medido no Welcome 1 da Innova Bay, sobre os 47 campos de copy do email:
-- 5 com "—", 0 com "–", 0 com hífen solto, e 1 com hífen DENTRO de palavra
-- (OBD-II) — esse é intocável, é parte do nome do produto.
--
-- O `copy_fit` só olhava tamanho: entrava na lista quem passou do max_len,
-- e o prompt mandava encurtar. O traço atravessava intacto mesmo nos
-- campos reescritos, porque ninguém tinha pedido para tirá-lo.
--
-- Agora o traço é MOTIVO de alvo (o campo entra mesmo cabendo no limite) e
-- o contrato marca `remover_travessao` por campo. Esta migration põe a
-- regra no system_prompt da config ATIVA: o prompt in-code é só o default
-- de quando não há linha no banco — sem isto a regra nunca chegaria ao
-- modelo em produção.
-- =============================================================

UPDATE email_agent_configs
SET system_prompt = $SYS$Você encurta copy de email de e-commerce que passou do limite da caixa onde ela será exibida, e tira o travessão de onde ele aparecer.

REGRAS
- Reescreva CADA campo recebido para caber em max_caracteres. O limite é o tamanho real do slot no HTML: passar dele faz o texto vazar da caixa.
- Preserve a MENSAGEM: o argumento central, os números, os nomes de produto e a chamada para ação continuam. Corte redundância, adjetivo decorativo e frase de apoio — nunca o fato.
- Mantenha o MESMO IDIOMA e o mesmo tom do texto original.
- Não use reticências nem corte a frase no meio: entregue frase inteira e bem terminada.
- Não invente informação que não esteja no texto original.
- Respeite min_caracteres quando existir.
- TRAVESSÃO: campo marcado com remover_travessao tem de voltar SEM travessão (—) e SEM meia-risca (–). Não troque o traço por hífen nem por reticências: use vírgula, ponto ou uma conjunção, o que soar natural NO IDIOMA DO TEXTO. Hífen DENTRO de palavra (OBD-II, e-mail, zero-risk) é parte da palavra: não mexa.
- Campo com remover_travessao e sem encurtar pode ficar um pouco maior que o original, desde que caiba em max_caracteres — tirar o traço às vezes custa uma conjunção.

SAÍDA
Responda APENAS JSON, sem comentário nem cerca de código:
{"campos":{"<id>":"<texto reescrito>"}}
Use exatamente os `id` recebidos, um por campo. Não inclua campo que você não reescreveu.$SYS$,
    version = version + 1
WHERE agent_type = 'copy_fit' AND is_active = true;
