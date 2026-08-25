# ADR — Estruturador adaptativo (estrutura por loja × email, com embasamento)

**Status**: aprovado (decisões fechadas em 25/08/2026 com o CEO; vault analisado — welcome completo) · passo 1 implementado
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

O vault real (analisado em 25/08 — `All-for-Eficiencia`, welcome completo) tem
CINCO camadas, com papéis de autoridade DIFERENTES. O agente não recebe "notas":
recebe camadas com precedência.

| Camada | Nota | Papel no prompt |
|---|---|---|
| Intenção do flow | `_flow.md` | RESTRIÇÕES DURAS: regras transversais invioláveis (ex.: as 6 regras do incentivo do welcome). Não são adaptáveis por loja |
| Progressão observada | `_progressao.md` | Posição no arco: compressão, rotação de voz, retirada da vitrine — padrões do flow que independem de nicho |
| Intenção do email | `{n}.md` | CRITÉRIO DE ACEITAÇÃO: "quando ela termina de ler, precisa ser verdade que..." é checklist de validação, não inspiração. Os anti-objetivos são proibições |
| Estruturas validadas | `estruturas/{flow}/*.md` | CANDIDATAS A ADAPTAR. A chave de indexação real é a OBJEÇÃO que a estrutura ataca ("quando usar"), não o nicho da amostra — o nicho é só a renderização |
| Aprendizados | `aprendizados/{flow}/` + `_global/` | CAMADA DE CORREÇÃO que VENCE a estrutura: uma estrutura `aprovada` pode carregar ressalva apontando erro próprio (caso real: prova-de-terceiro-antes-do-cta corrige a posição 7 da avelmore-inspecao-antecipada). O agente aplica a estrutura JÁ corrigida |

**Precedência:** regras do `_flow` > aprendizados > estrutura de referência >
preferência própria do agente.

Mais o contexto de runtime:

6. **Contexto da loja**: nicho, posicionamento, tom (via store-context), top
   products (+ quantos), e a pesquisa serializada — que já carrega o dado que a
   intenção pede: a OBJEÇÃO DOMINANTE da categoria (caso Innova: "se o produto
   realmente funciona" + "garantia vitalícia como destrava").
7. **Capacidade da biblioteca**: categorias com variantes preenchíveis +
   product_slots × produtos da loja. Restrição dura.
8. **Histórico desta loja**: estruturas já emitidas para este flow×email
   (runs anteriores do Estruturador) — exclusão de repetição EM CÓDIGO
   (filtradas antes do prompt), nunca como sugestão.

### A decisão que o agente toma (formalizada)

Não é invenção — é TRADUÇÃO:

> "Qual é a objeção dominante DESTA loja neste toque, qual mecanismo validado a
> ataca, e como cada posição da referência se traduz quando troco a objeção da
> amostra pela da loja?"

1. **Diagnóstico** — intenção do toque × objeção dominante da pesquisa da loja.
2. **Seleção/fusão** — referência(s) cujo MECANISMO serve à objeção (decisão 1:
   fusão permitida, com origem+porquê por pedaço).
3. **Tradução posição a posição** — mantém o papel ("o pivô que troca desconto
   por razão"), troca o conteúdo do papel. Padrões transferíveis (cupom 2× com
   papéis distintos) ficam; renderização da amostra (foto de pé calçado) sai.
4. **Correção** — aplica os aprendizados por cima da referência.
5. **Validação** — checklist da intenção + regras do `_flow` + capacidade.
6. **Embasamento** — output estruturado abaixo.

### Absorção de categorias (decisão 25/08 com o CEO)

As estruturas do vault usam 8 categorias; a biblioteca ativa cobre 5 (hero,
body, products, reviews, footer). Resolução por DESIGN, não por curadoria:

- **`header` → NUNCA no output.** O header vem junto da hero section (variantes
  de hero já carregam a banda de logo). O papel do header da referência é
  incorporado ao papel da posição hero.
- **`cta` → NUNCA no output.** O CTA vem dentro do próprio bloco (as variantes
  têm CTA embutido). Papel de um cta isolado da referência é anotado na posição
  vizinha que o absorve.
- **`offer` → condicional.** Variantes de offer estão em curadoria (variáveis
  sendo anexadas). Enquanto não houver variante preenchível, cai na decisão 2:
  segue sem a posição, registrando a demanda.
- **Welcome #8 (carta plain-text, 1 posição)** → não é estrutura montável: o
  Estruturador marca o email como `text_only` (mecanismo existente do pipeline)
  e a copy segue pelo caminho de texto.

O sync normaliza `secoes` do frontmatter com esse mapa (header/cta removidos com
papel re-anotado) ANTES de servir ao agente — o vault continua descrevendo o
email completo; a normalização é da ponte, não da curadoria.

### Output (JSON, validado por código antes de seguir)

```jsonc
{
  "diagnostico": {
    "objecao_dominante": "Se o produto realmente funciona (eficácia)",
    "traducao_do_mecanismo": "O convite à inspeção da referência vira demonstração + garantia vitalícia",
    "aspecto_da_loja": "ICP 35+ prova-antes; garantia vitalícia é a destrava documentada na pesquisa"
  },
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
    { "ref": "avelmore-inspecao-antecipada", "o_que_pegou": "arco dúvida→compromisso→prova", "porque": "..." },
    { "ref": "medicube-comparacao-categoria", "o_que_pegou": "bloco de comparação", "porque": "..." }
  ],
  "aprendizados_aplicados": [
    { "slug": "prova-de-terceiro-antes-do-cta", "como": "reviews movida para antes do último CTA" }
  ],
  "text_only": false,
  "descartes": [
    { "section": "offer", "porque": "loja sem oferta ativa no contexto" }
  ]
}
```

Validação por código (nunca pelo LLM):
- `section` ∈ categorias PREENCHÍVEIS (header/cta são rejeitados — absorvidos
  por design, ver acima); posição sem variante preenchível → removida
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

O vault REAL (`All-for-Eficiencia/Admin Convertfy/Emails/`) é o contrato — este
ADR descreve o que existe, não prescreve template novo. Welcome está completo:
8 intenções + `_flow` + `_progressao`, 8 estruturas, 13 aprendizados (~1.450
linhas).

```
Emails/
├── intencoes/{flow}/
│   ├── _flow.md          # intenção do flow + regras transversais invioláveis
│   ├── _progressao.md    # camada DESCRITIVA: como a forma varia no arco
│   └── {n}.md            # intenção por email (aceitação + anti-objetivos)
├── estruturas/{flow}/{slug}.md
└── aprendizados/
    ├── {flow}/{slug}.md
    └── _global/{slug}.md # cross-flow, com aplica_a: [flows]
```

Campos de frontmatter em uso (o sync valida contra esta lista):
- intenção: `tipo, flow_type, email_number|escopo:flow, status, revisado_por`
- estrutura: `tipo, slug, flow_type, emails[], escopo (geral|loja-especifica),
  loja, amostra, procedencia (nossa|swipe|editorial), status, secoes[],
  performance`
- aprendizado: `tipo, flow_type|escopo:cross-flow+aplica_a[], origem_email_id,
  origem_estrutura, autor, status, status_evidencia`

Regras da ponte (sync → Supabase, cron + webhook de push):
- só `status: aprovada` vira ativa;
- **wikilinks `[[slug]]` são resolvidos** para referências estáveis (as camadas
  se citam: intenção→estrutura, estrutura→aprendizado, aprendizado→estrutura);
- `secoes` é normalizada pelo mapa de absorção (header/cta) antes de servir;
- corpo markdown vai INTEIRO para o agente — o frontmatter é índice, a prosa é
  o conhecimento.

Obsidian é a superfície de autoria (plugin Git já instalado no vault); o
runtime lê exclusivamente as tabelas sincronizadas (`email_intents`,
`email_structure_refs`, `email_learnings`).

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

1. ~~Corrigir `email_id`/`flow_id` nas runs de fase 1~~ ✅ (commit c09fc9e + migration 20261080, 25/08).
2. Sync do vault real → tabelas `email_intents`, `email_structure_refs`,
   `email_learnings` (welcome já curado; demais flows conforme curadoria avançar).
3. Agente Estruturador + validação de output + fallback, em modo `shadow`.
4. Fio narrativo descendo o pipeline (Curador, Blueprint, payload n8n).
5. UI do embasamento no Estúdio + feedback do COO (`estruturador_feedback`).
6. Virada `shadow → on` após revisão dos embasamentos em shadow.
7. (fase 2) Loop de performance / propostas de A/B.
