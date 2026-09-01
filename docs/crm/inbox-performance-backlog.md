# Backlog — desempenho do Inbox

## Ingestão e consultas do Inbox

Antes de ampliar funcionalidades, medir a latência p95 e o número de queries por mensagem/listagem em produção. Então:

- colocar o webhook do Instagram na mesma fila durável do WhatsApp; o endpoint deve só validar, persistir e enfileirar;
- reduzir o caminho de ingestão para uma operação transacional de thread + mensagem, preservando idempotência;
- substituir as múltiplas contagens da lista por uma consulta agregada e indexar busca textual somente se `EXPLAIN ANALYZE` mostrar varredura;
- manter mídia em Storage privado e URLs assinadas sob demanda; não guardar binários no Postgres.

Aceite: recebimento p95 inferior a 2 s após o webhook, sem perda em retries, e uma atualização da lista não executa consultas proporcionais ao número de threads.
