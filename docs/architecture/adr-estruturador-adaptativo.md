# ADR — Estruturador adaptativo (estrutura por loja × email, com embasamento)

**Status**: aprovado em conceito (decisões fechadas em 25/08/2026 com o CEO) · implementação pendente
**Substitui**: o papel estrutural fixo de `email_outline_templates` (que permanece como fallback e como fonte da intenção de partida)

---

## Contexto

Hoje a "Estrutura geral" (`email_outline_templates`) é a única camada 100% global
e fixa do pipeline: o roteiro (quantos blocos, quais tipos, qual objetivo por
posição do flow) é idêntico para toda loja. A personalização acontece só DENTRO
das posições (Curador escolhe variantes, copy usa a pesquisa, imagem usa
produto/paleta) — nunca NA sequência. Welcome 3 da loja de skincare premium e da
loja de scanner automotivo seguem o mesmo esqueleto.

Além disso, o texto que orienta a copy de cada bloco (`purpose`) vem do
`copy_guidance` da VARIANTE — genérico da biblioteca — e não de uma narrativa
pensada para aquele email daquela loja. As partes do email não conversam entre si.

## Decisão

Criar o agente **Estruturador**: primeiro passo da fase 1, antes do Curador.
Ele recebe material validado (vault curado), a intenção canônica do email e o
contexto da loja, e devolve uma **estrutura adaptada com embasamento** — cada
posição com papel narrativo, referência de origem e porquê. O fio narrativo
desce o pipeline inteiro (Curador → Blueprint → copy), fazendo as partes do
email conversarem entre si.

### As 9 decisões de arquitetura (fechadas)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Limite da adaptação | **Liberdade total, incluindo fundir duas ou mais referências** — com justificativa dupla obrigatória: cada pedaço cita de QUAL referência veio e POR QUÊ |
| 2 | Posição sem variante preenchível na biblioteca | **Segue sem a posição** (não força re-estruturação). A lacuna é registrada na telemetria como demanda de curadoria — nunca silenciosa |
| 3 | O que é "estrutura validada" | Estrutura para um email específico que **sabemos que funciona** — para determinada loja OU no geral. A nota carrega o escopo (`geral` \| `loja-específica`) e a procedência |
| 4 | Intenção do email (var1) | **Uma por `flow_type × email_number`, global** — não varia por nicho. Adaptar ao nicho é trabalho do Estruturador, não da intenção |
| 5 | O que o agente vê | **Todas as referências do flow em questão, de TODOS os nichos** — rotuladas. O filtro por flow delimita o prompt; a escolha e a adaptação são do agente, nunca do filtro |
| 6 | Cadência | **Regerada a cada geração.** Consequência assumida: o reuso da fase 1 (`architect.reuse_existing`) é desligado quando o Estruturador está ativo — Curador/Montador/Blueprint rodam a cada geração (~US$ 0,25/email/geração) |
| 7 | Revisão humana | **(a) + (c)**: o MATERIAL (intenções e referências) passa por aprovação antes de entrar no vault ativo; a adaptação roda direto e é revisada a posteriori pelo embasamento |
| 8 | O porquê | **Output estruturado para ser LIDO** — no mínimo interno (Estúdio): como a IA pensou e como cada escolha influenciou cada parte. Formato apresentável desde o dia 1 |
| 9 | Ciclo de feedback | **Dois loops**: (i) performance da loja (Klaviyo/Omnisend) → propor testes A/B e promover/rebaixar estruturas; (ii) **feedback do COO sobre as escolhas** de cada email gerado → vira aprendizado versionado que entra nos prompts futuros |

## Arquitetura

### Pipeline (fase 1 nova)

```
Pesquisa completa
   → [ESTRUTURADOR]  ← vault (intenção + referências do flow) + loja + histórico + capacidade da biblioteca
   → Curador          ← recebe estrutura + papel narrativo por posição
   → Montador
   → Blueprint        ← purpose por posição = papel narrativo (variante só complementa)
   → copy (n8n)       ← payload leva fio narrativo + papel por bloco
   → fase 2 (inalterada)
```

### Inputs do Estruturador

1. **Intenção canônica** do `flow × email` (var1, status aprovada no vault).
2. **Referências do flow** (var2): todas, de todos os nichos, cada uma com
   escopo, procedência e o porquê de funcionar. O agente escolhe/funde/adapta.
3. **Contexto da loja**: nicho, top products (+ quantos produtos a loja tem),
   pesquisa serializada (`pesquisaToFullText` — tese, sobre, pilares, ICP, tom).
4. **Histórico desta loja**: estruturas já geradas para este `flow × email`
   (das runs anteriores do próprio Estruturador) — insumo para variar e para
   propor teste A/B, injetado como restrição, não como sugestão.
5. **Capacidade da biblioteca**: categorias com variantes preenchíveis +
   `product_slots` × produtos da loja. Restrição dura no prompt.
6. **Aprendizados do COO**: feedbacks curados (loop 9.ii) relevantes ao flow.

### Output (JSON, validado por código antes de seguir)

```jsonc
{
  "estrutura": [
    {
      "section": "hero",              // uma das 8 categorias da biblioteca
      "papel": "Abrir a dúvida que o cliente já tem: 'funciona mesmo?'",
      "referencia": "ac1-gamification-close",  // slug da nota de origem
      "adaptacao": "Troquei o presente lúdico por demonstração direta",
      "porque": "O ICP desta loja (35+, prova-antes) não responde a mistério; responde a evidência"
    }
    // ... demais posições
  ],
  "fio_narrativo": "Dúvida → prova com o produto → risco zero → ação",
  "fontes": [
    { "ref": "ac1-gamification-close", "o_que_pegou": "estrutura de abertura+fechamento", "porque": "..." },
    { "ref": "ac1-prova-tecnica",      "o_que_pegou": "bloco de comparação",              "porque": "..." }
  ],
  "aspecto_da_loja": "Objeção dominante: eficácia. Garantia vitalícia como destrava.",
  "descartes": [
    { "section": "offer", "porque": "loja sem oferta ativa no contexto" }
  ]
}
```

Validação por código (nunca pelo LLM):
- `section` ∈ 8 categorias; posição sem variante preenchível → removida
  (decisão 2) e registrada em `posicoes_descartadas` na telemetria;
- toda posição precisa de `referencia` + `porque` (justificativa dupla da
  decisão 1) — ausência reprova o output e dispara retry 1x;
- 2 falhas → fallback integral para `resolveStructure(outline)` (comportamento
  atual, zero regressão).

### O fio narrativo desce o pipeline

- **Curador**: `papel` de cada posição entra no prompt como critério de ranking
  (hoje ele rankeia contra objetivo genérico do outline).
- **Blueprint**: `purpose` do bloco = `papel` (o `copy_guidance` da variante
  vira complemento de forma, não de intenção).
- **Payload n8n**: `fio_narrativo` no nível do email + `papel` por bloco —
  chaves aditivas; o n8n ignora até consumir.
- **Imagem**: `EMAIL_IDEIA` passa a receber o fio narrativo real.

## Vault (Obsidian sobre git → Supabase)

Obsidian é a superfície de AUTORIA (vault = repo git de markdown, plugin
Obsidian Git). O runtime NUNCA lê o vault: um sync (cron + webhook de push)
ingere as notas para tabelas no Supabase; só `status: aprovada` vira ativa.
Frontmatter é o índice; o corpo em prosa é o conhecimento.

```
vault/
├── intencoes/{flow_type}/{numero}.md          # var1
├── estruturas/{flow_type}/{slug}.md           # var2
└── aprendizados/{flow_type}/{slug}.md         # loop 9.ii (feedback COO curado)
```

### Template — intenção (var1)

```markdown
---
tipo: intencao
flow_type: abandoned_cart
email_number: 2
status: pendente        # pendente | aprovada | arquivada
revisado_por:           # preenchido na aprovação
---
# O que este email deve fazer
(a intenção em prosa: papel na sequência, estado mental do leitor ao recebê-lo,
o que precisa ser verdade quando ele terminar de ler)

# O que este email NÃO deve fazer
(anti-objetivos: ex. não queimar desconto no 2º toque)
```

### Template — estrutura validada (var2)

```markdown
---
tipo: estrutura
slug: ac1-gamification-close
flow_type: abandoned_cart
emails: [1]              # ou [qualquer]
escopo: geral            # geral | loja-especifica
loja:                    # quando loja-especifica: nome/nicho da loja de origem
procedencia: swipe       # swipe | nossa | editorial
status: pendente
performance:             # opcional; reservado p/ loop 9.i (métricas quando houver)
---
# A estrutura
1. **hero** — presente dourado clicável. Por quê: curiosidade sem prometer desconto.
2. **products** — produto único, explicação antes do preço. Por quê: ...
3. ...

# Por que essa estrutura funciona
(prosa livre — o embasamento que o agente vai ler)

# Quando usar / quando não usar
```

### Template — aprendizado (loop do COO)

```markdown
---
tipo: aprendizado
flow_type: abandoned_cart
origem_email_id:         # email gerado que motivou o feedback
autor: coo
status: aprovada
---
# Feedback
"Abrir carrinho abandonado com FAQ ficou defensivo demais — guardar FAQ para o 3º toque."
# Regra derivada
(uma frase acionável que entra no prompt de futuras gerações do flow)
```

## Ciclo de feedback (decisão 9)

**Loop COO (9.ii — primeiro a implementar)**: o embasamento estruturado de cada
geração aparece no Estúdio/visualização do email com controle de feedback por
escolha (concordo / discordo + comentário). Feedback bruto grava em tabela
(`estruturador_feedback`); a CURADORIA promove os recorrentes a notas de
`aprendizados/` no vault (passando pela mesma aprovação do material). O agente
"aprende" por contexto curado e versionado — não por fine-tuning, não por
feedback bruto direto no prompt (mesma lição da memória do Curador: sinal sem
curadoria vira ruído ou cópia).

**Loop performance (9.i — fase 2 do épico)**: métricas por email (integrações
Klaviyo/Omnisend existentes) cruzadas com a estrutura usada → job periódico
propõe testes A/B e rascunhos de nota (`status: pendente`) promovendo/rebaixando
estruturas. O campo `performance` do frontmatter já nasce reservado para isso.

## Operação

- **Kill-switch** em `email_generation_settings.estruturador_mode`:
  `off` (comportamento atual) | `shadow` (roda e loga, mas usa o outline —
  modo de validação da qualidade do embasamento antes da virada) | `on`.
- **Telemetria**: run `agent='estruturador'` em `email_generation_runs` com o
  JSON completo do embasamento em `parsed_output` — **gravando `email_id` e
  `flow_id`** (pré-requisito: corrigir a lacuna já diagnosticada da fase 1,
  que hoje grava tudo com email_id NULL e some da UI).
- **Custo**: com a decisão 6, fase 1 roda a cada geração. Estimativa
  ~US$ 0,25-0,35/email/geração (Estruturador + Curador + Montador + Assunto).
- **Fallback**: vault sem material para o flow, sync quebrado ou 2 falhas do
  agente → `resolveStructure(outline)` de hoje. `email_outline_templates` não
  morre: vira fallback e fonte de partida das intenções.

## Ordem de implementação proposta

1. Corrigir `email_id`/`flow_id` nas runs de fase 1 (pré-requisito de telemetria).
2. Vault: repo + templates + seed das intenções (geradas dos 34 outlines atuais,
   status pendente) + sync → tabelas `email_intents`, `email_structure_refs`.
3. Agente Estruturador + validação de output + fallback, em modo `shadow`.
4. Fio narrativo descendo o pipeline (Curador, Blueprint, payload n8n).
5. UI do embasamento no Estúdio + feedback do COO (`estruturador_feedback`).
6. Virada `shadow → on` após revisão dos embasamentos em shadow.
7. (fase 2) Loop de performance / propostas de A/B.
