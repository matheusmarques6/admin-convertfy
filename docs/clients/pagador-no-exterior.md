# Quem paga: Brasil (CPF/CNPJ) ou empresa no exterior (LLC)

Pedido, na letra: *"Quando o cliente optar pagar pela LLC, ter essa opção de
colocar a LLC, pois quando coloco dados que não são compatíveis com CPF/ou
CNPJ, ele não deixa eu salvar."*

O print que veio junto mostra o campo **CPF/CNPJ** com
`JFJA DIGITAL LLC 30 N GOULD ST STE R` dentro — a razão social e o endereço
americano no campo do documento, porque não havia outro lugar. E o save
recusado.

## O que a medição mostrou antes de escrever código

Produção, 16/09/2026, 56 clientes:

| medida | valor |
|---|---|
| com documento gravado | 29 |
| documento fora de 11/14 dígitos | 1 (`0000000000000000000000`) |
| com `asaas_customer_id` e **nenhum** documento aqui | 25 |
| documento só em `custom_fields` (coluna vazia) | **26** |
| documento com **dígitos diferentes** entre coluna e `custom_fields` | **6** |
| usos do atalho `skip_asaas` (o hack do "000") | 0 |

Os 22 zeros são a fuga: sem lugar para o pagador do exterior, alguém encheu
o campo até o formulário deixar passar. E o comentário que já existia na tela
de criação — *"skip Asaas creation (for international clients…)"* — prova que
a necessidade era conhecida e estava resolvida por gambiarra que ninguém
descobriu (zero usos).

## O desenho

**Um seletor "Quem paga"**, com dois valores:

- **Pessoa ou empresa no Brasil (CPF/CNPJ)** — o comportamento de sempre.
- **Empresa no exterior (LLC, Ltd, Inc)** — razão social (obrigatória),
  Tax ID, país (ISO de 2 letras) e endereço em uma linha.

A régua é o módulo puro `src/lib/clients/pagador.ts` (18 testes), usado pelas
**três** portas que editam cliente: criar, editar e o painel de configurações
do cliente. Três réguas diferentes é como os 22 zeros entraram por uma delas —
o painel não validava nada.

### Por que o nome da LLC não pode morar em `cpf_cnpj`

Essa coluna é o documento brasileiro e é por ela que o Asaas casa cliente
(`listCustomers({ cpfCnpj })`) e cria cadastro. Texto livre ali faz a busca
comparar lixo e a criação automática mandar lixo ao provedor — que recusa com
mensagem obscura, depois do save, como aviso amarelo. Afrouxar a validação
para aceitar qualquer coisa resolveria o sintoma e quebraria a integração em
silêncio.

### Por que o exterior não vai para o Asaas

O Asaas exige CPF/CNPJ válido. Cobrança de pagador do exterior é o caminho
que a casa já tem — **pagamento por fora** (transferência internacional/Wise/
PIX direto → `receiveInCash` em `PUT /api/integrations/asaas/charges`). A tela
diz isso num cartão, em vez de deixar o operador descobrir pela falha.

O vínculo que já existir **não é apagado**: cliente que migrou de cadastro BR
para LLC continua ligado ao histórico de faturas dele.

### Onde o dado mora

`clients.custom_fields.pagador`, ao lado de `address` e `notes`, que são desse
mesmo cliente. **Sem migration** — no modo BR a chave nem é gravada, então
"quem paga pelo exterior" é uma consulta de uma linha:

```sql
select id, name, custom_fields->'pagador' from clients where custom_fields ? 'pagador';
```

### Dígito verificador é aviso, não bloqueio

Bloquear criaria atrito retroativo: abrir um cadastro antigo com documento
torto para mexer em outro campo passaria a não salvar. Não deu para medir
quantos documentos gravados têm DV inválido sem despejar CPF de cliente no
log, então a régua fica onde dá para afirmar — **tamanho e sequência
repetida**, os dois medidos — e o DV aparece com o que ele significa na
prática: *"o Asaas vai recusar este documento"*.

## O achado paralelo: duas verdades sobre o documento

A tela de **criação** gravava `cpf_cnpj` só em `custom_fields`; a de **edição**
grava na coluna. Daí os 26 cadastros com o documento invisível para tudo que
lê a coluna — o casamento de faturas do Asaas, a exportação e o sync — e os
**6 com documentos diferentes** nos dois lugares.

`documentoDoCliente(cliente)` é a leitura canônica: **a coluna vence** (é o que
os consumidores leem), `custom_fields` é fallback e some ao salvar (auto-cura,
cadastro a cadastro). Divergência de **dígitos** vira aviso na tela de edição
com os dois valores — escolher por código seria decidir quem é o cliente.
Diferença só de pontuação não é conflito.

Ligado em quatro lugares: a ficha do cliente, a exportação (a planilha saía com
a coluna vazia para metade da base), o casamento do sync do Asaas e a
sincronização de cadastro.

## E a sincronização com o Asaas deixou de travar por um CPF torto

`PATCH /api/integrations/asaas/customers/update` mandava o documento como
estivesse. Documento inválido faz o Asaas recusar a **requisição inteira** —
nome, email e telefone deixavam de sincronizar por causa dele, em silêncio.
Agora o documento inválido é **omitido** (o provedor mantém o que tem), com
`log.warn`, e o resto sobe.

## Limites declarados

- **O onboarding público não foi endurecido**: lá quem preenche é o cliente
  final, e bloquear o cadastro dele por documento torto o faz abandonar. Quem
  confere é o admin, na ficha.
- **País é ISO de 2 letras**; Tax ID é livre de propósito — validar formato de
  EIN recusaria VAT europeu.
- **Os 6 documentos divergentes não foram resolvidos por código.** Eles
  aparecem como aviso na tela de edição do cliente e se resolvem quando alguém
  confirmar qual é o certo.
