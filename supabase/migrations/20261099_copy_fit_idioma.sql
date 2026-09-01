-- =============================================================
-- O encurtador também conserta o IDIOMA.
--
-- A ordem de idioma sai no payload do n8n desde 01/09, em três lugares
-- (raiz, `store` e prefixando o `pesquisa_diagnostico`), escrita em inglês:
-- "Not one sentence, not one word in another language". Os dois últimos
-- runs de `copy_dispatch` confirmam que ela saiu — `tem_diretiva_na_raiz`
-- e `tem_no_store` verdadeiros nos dois.
--
-- E a copy da Innova Bay, loja `en`, voltou em português dentro do mesmo
-- bloco:
--
--   offer_headline  → "Does it work on my car?"
--   offer_body      → "Use code WELCOME10 na compra. Sem mínimo, sem expiração."
--
-- O flow não referencia os campos novos. Pedir mais alto seria repetir o
-- que já falhou duas vezes — a correção passou para o nosso lado, no
-- agente que já reescreve campo e cujo veredicto é do CÓDIGO
-- (`aceitarReescrita`: reescrita que volta na língua errada é recusada com
-- `idioma_permaneceu` e a copy original fica).
--
-- Esta migration põe a regra no system_prompt da config ATIVA. Sem ela a
-- regra nunca chegaria ao modelo em produção — e pior: o prompt vigente
-- manda "Mantenha o MESMO IDIOMA", que é exatamente o contrário do que o
-- campo marcado com `reescrever_no_idioma` precisa.
--
-- O detector que marca o campo (`lib/email-workspace/idioma-copy.ts`) é
-- conservador de propósito: rótulo curto, cupom e frase ambígua saem como
-- `indefinido` e NÃO viram alvo. Falso positivo aqui reescreveria copy
-- que estava certa.
-- =============================================================

UPDATE email_agent_configs
SET system_prompt = $SYS$Você corrige copy de email de e-commerce: encurta o que passou do limite da caixa, tira o travessão e reescreve no idioma da loja o campo que voltou na língua errada.

REGRAS
- Reescreva CADA campo recebido para caber em max_caracteres. O limite é o tamanho real do slot no HTML: passar dele faz o texto vazar da caixa.
- Preserve a MENSAGEM: o argumento central, os números, os nomes de produto e a chamada para ação continuam. Corte redundância, adjetivo decorativo e frase de apoio — nunca o fato.
- IDIOMA: por padrão mantenha o MESMO IDIOMA do texto original. A ÚNICA exceção é o campo marcado com reescrever_no_idioma — esse tem de voltar inteiro naquele idioma, sem uma palavra na língua antiga. Não é tradução literal: reescreva a mensagem como um copywriter nativo escreveria, preservando o argumento, os números, os códigos de cupom e os nomes de produto. Campo com reescrever_no_idioma pode mudar de tamanho para mais ou para menos, desde que caiba em max_caracteres.
- Mantenha o mesmo tom do texto original.
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

SELECT agent_type, version, (system_prompt LIKE '%reescrever_no_idioma%') AS tem_regra_de_idioma
  FROM email_agent_configs
 WHERE agent_type = 'copy_fit' AND is_active = true;
