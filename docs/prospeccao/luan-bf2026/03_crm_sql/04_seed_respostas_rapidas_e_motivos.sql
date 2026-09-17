-- 04 · Seed de respostas rápidas (scripts da cadência) e motivos de perda. Idempotente. NÃO executado ainda.
-- Placeholders {nome} e {hora}: ajustar para a sintaxe de variável que o componente de respostas rápidas usa.
begin;
with q(shortcut, title, body) as (values
 ('/luan-intro','Intro do Luan (ele envia)','Pessoal, pra quem já está com a loja rodando: a Convertfy é nossa parceira em e-mail e SMS. O Bruno vai chamar vocês nos próximos dias pra ajudar a montar a Black Friday. Vale a conversa.'),
 ('/t1a','T1 · Aluno Luan','Oi {nome}, tudo bem? Aqui é o Bruno, da Convertfy. O Luan comentou que você está na mentoria com ele. Sua loja já está no ar vendendo?'),
 ('/t1b','T1 · Fez call, não comprou','Oi {nome}, tudo bem? Bruno aqui, da Convertfy. A gente é parceiro do Luan na parte de e-mail e SMS pra loja. Você chegou a colocar sua loja no ar?'),
 ('/t1c','T1 · Agendou, não fez call','Oi {nome}, tudo bem? Bruno, da Convertfy, parceiro do Luan. Vi que você se interessou por drop global. Como está sua loja hoje, já está vendendo?'),
 ('/t1d','T1 · MQL','Oi {nome}, tudo bem? Bruno, da Convertfy, parceiro do Luan. Você já tem loja online rodando ou ainda está montando?'),
 ('/vendendo','Resposta · loja vendendo','Boa. Na Black Friday, e-mail e SMS vendem pra quem já visitou a loja e recuperam carrinho sem gastar mais em anúncio. Topa uma call de 20 min pra eu olhar sua loja e mostrar o que dá pra montar até novembro? Me manda o link da loja.'),
 ('/naovende','Resposta · loja sem vendas','Entendi. Nessa fase o foco é produto e tráfego mesmo. Quando começar a vender, me chama que a gente monta a parte de e-mail. Posso te mandar uns materiais até lá?'),
 ('/t2','T2 · valor (D+2)','{nome}, separei o calendário de datas e campanhas que usamos com as lojas pra Black Friday: calendario.convertfy.me. Se sua loja já vende, olho ela e te digo o que priorizar.'),
 ('/t3','T3 · último toque (D+5)','{nome}, vou parar de te chamar por aqui pra não incomodar. Se quiser o diagnóstico de e-mail e SMS da sua loja antes da Black Friday, é só responder "quero".'),
 ('/confirma','Confirmação do diagnóstico (D-1)','{nome}, confirmando nossa conversa amanhã às {hora}. Me manda o link da loja antes, se ainda não mandou, que eu já chego com a análise.')
)
insert into crm_quick_replies (org_id, shortcut, title, body)
select 'd1ae3cf9-558d-40cc-9272-4a5633894ef8', q.shortcut, q.title, q.body from q
where not exists (select 1 from crm_quick_replies x where x.org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8' and x.shortcut = q.shortcut);

with r(label, position) as (values
 ('Sem resposta após 3 toques',1),('Sem loja ou loja sem vendas',2),('Sem interesse',3),('Preço',4),
 ('Timing (depois da Black Friday)',5),('Já tem agência ou faz internamente',6),('Pediu para não ser contatado',7),('Dados de contato inválidos',8)
)
insert into crm_lost_reasons (org_id, label, position)
select 'd1ae3cf9-558d-40cc-9272-4a5633894ef8', r.label, r.position from r
where not exists (select 1 from crm_lost_reasons x where x.org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8' and x.label = r.label);
commit;
