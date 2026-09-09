# O vault nos agentes de e-mail, medido contra o Advisor Max

*09/09/2026 · branch `claude/resume-previous-session-UvATK` · levantamento
sobre o código, o banco de produção (runs de 04 a 08/09) e os dois vaults
(`All-for-Eficiencia`, commit `073b5f6`). Escopo: **como os dados do vault
chegam a cada agente, em que forma, em que quantidade e o que produzem**.
O vault é deste trabalho; o código dos agentes é de outra sessão — o que
depende dele está marcado como **entrega para o outro lado**.*

---

## 0. A pergunta, e a resposta curta

O pedido: fazer os agentes de e-mail "pensarem e gerarem tão bem quanto o
Max", o advisor da ConvertIA. A pergunta certa não é "o que o Max sabe que
os agentes não sabem" — é **por que o Max acerta com 1 MB de corpus e o
Curador erra com 620 KB**. A resposta está na disposição, não no volume.

O Max lê pouco e certo: uma persona de 14 mil caracteres que entra em toda
resposta e carrega o **julgamento** (como decide, o que nunca diria, o que
pergunta antes de opinar, quem vence quando as fontes discordam), um
catálogo de títulos, e duas a quatro notas abertas sob demanda. O protocolo
dele começa por "verificar antes de afirmar" e termina em "fora do corpus,
recusar — nomeando a lacuna".

Os agentes de e-mail leem muito e sem ordem: o Curador recebe **190 mil
caracteres por chamada** (67 mil tokens de entrada em média), com o catálogo
inteiro, todos os aprendizados e a decisão do Estruturador — e as
ferramentas de consulta sob demanda ficaram sem uso em 5 das 8 últimas
runs. O Estruturador recebe as 8 estruturas do welcome mesmo cada uma
declarando para qual e-mail serve. Nenhum agente recebe uma camada de
julgamento; a precedência entre fontes vive em código. As lacunas do vault,
que o protocolo manda declarar, **nunca foram servidas** (0 em todas as
runs). Os 52 requisitos que decidem se um bloco é *possível* para a loja
não são servidos, e o resultado aparece em **4 de 4 runs**: o alvo diz "não
invente cupom" e a hero escolhida exige cupom.

E a fase 2 inteira — hero, tipografia, cores, assunto, copy — não lê vault
nenhum. A doutrina de design e copy do Max (hero em quatro itens, botão,
varredura, transições, subject line) existe, está sincronizada, e não chega
a agente algum.

O plano tem cinco fases. As duas primeiras são dado e disposição, custam
pouco e desfazem os erros medidos. A terceira traz o Max para o e-mail sem
copiar nota nenhuma. A quarta fecha o ciclo que o Max já tem: recusa
nomeada vira lacuna, lacuna vira pauta. A quinta transforma os casos de
teste do vault em avaliação de verdade.

---

## 1. Os dois sistemas, lado a lado

| | Max (ConvertIA) | Agentes de e-mail |
|---|---|---|
| **O que entra sempre** | persona 14.093 chars (julgamento) + catálogo de títulos (2.665 chars) | nada equivalente; cada agente recebe blocos montados por código |
| **Protocolo** | 7 passos, a ordem é a regra: classificar → rotear pelo mapa → números → conflitos → nota do assunto → verificar cobertura → voz | 9 passos (`_protocolo-de-selecao`, 11.261 chars), servido inteiro e só ao Curador |
| **Sob demanda** | busca semântica + full-text + leitura com grafo (12k por nota); 2–4 notas por conversa | `listar_pasta` / `ler_nota` só no Curador; **0 consultas em 5 das 8 últimas runs** |
| **Precedência entre fontes** | `mapa-do-conhecimento`: pesquisa com amostra > medição da casa > doutrina > referência de mercado; "cite as duas e diga qual é qual" | Estruturador: lista em código (flow > revisão humana > COO > aprendizados > referências); Curador: "vault vence banco". Nenhuma nota declara isso |
| **Recusa** | nomeada, com o vizinho mais próximo; "nunca completar com consenso de mercado" | "declarar a lacuna, cair no template global, registrar em `lacunas/`" — o registro nunca acontece |
| **Anti-exemplos** | `_registro/descartes-*` (o que NÃO virou afirmação, com o motivo) | nenhum; `quando_nao_usar` por variante é o mais próximo |
| **Números** | tabelas verbatim com registro, linha e conflito | `peso`/`altura_px` por variante; os `numeros-de-*` do Max nunca chegam |
| **Nome como interface** | título = nome do arquivo; primeira frase = resumo de busca (320 chars) | índice servido = pastas com contagem (717 chars); títulos e primeira frase não |
| **Tamanho por chamada** | ≈ 40–60k chars (persona + catálogo + 2–4 notas) | Curador ≈ 190k chars; Estruturador ≈ 70k |
| **Eval** | `_casos-de-teste` em 8 notas + "como rodar a bateria" | `_casos-de-teste.md` (Caso A/B); nunca virou assert |

A `_arquitetura.md` do Max declara a razão de cada escolha com a medição
por trás: persona por prompt como maior multiplicador de fidelidade
(73% × 36% no teste de Turing da UCSD), degradação de contexto acima de
~64k tokens, progressive disclosure (índice sempre, corpo quando a tarefa
casa), busca agêntica sobre arquivos navegáveis em vez de contexto inteiro.
Ela também diz, sobre o vault de e-mail: *"já implementa, sem nomear, quase
toda a recomendação"* — notas atômicas, eixos, catálogo gerado, `_INDEX`,
`valida.py`, casos de teste. O vault está certo. **O que está errado é o
que o código faz com ele.**

---

## 2. Como o vault age em cada agente hoje

Medido em `prompt_segments` das últimas runs `success` (08/09) e no código.
"Sempre" = entra em toda chamada; "sob demanda" = só se o modelo pedir.

| Agente | O que recebe do vault | Modo | Chars | O que NÃO recebe |
|---|---|---|---|---|
| **Seletor** | contrato tipado da intenção (frontmatter, 2.117) + corpo da intenção (1.729) | sempre | ≈ 4k | eixos de objeção do vault, aprendizados, lacunas |
| **Catalogador** | nada — só a loja (pesquisa 15.5k, produtos, objeções anteriores) | — | 0 | medos de categoria, doutrina de objeção |
| **Estruturador** | `_flow` (2.792) + `_progressao` (2.741) + **as 8 estruturas** (25.113) + **18 aprendizados** (17.646), tudo no SYSTEM; intenção do email só no fallback sem alvo | sempre, sem roteamento | ≈ 48k | as intenções dos outros toques, notas de seção, variantes, lacunas |
| **Curador** (vault) | SYSTEM: protocolo (11.261) + **catálogo com eixos (128.056)** + convivências (4.688). USER: intenção do flow (2.792), notas de seção (9.441), lacunas (**36 — "(nenhuma)"**), **os mesmos 18 aprendizados** (14.453), índice de pastas (717), decisão do Estruturador (13.713), alvo (5.150) | sempre; `listar_pasta`/`ler_nota` sob demanda | ≈ 190k | requisitos (52 notas, removidos em 01/09), eixos como notas, `_INDEX`, `_casos-de-teste`, `_parametros-da-loja` |
| **Blueprint** (rota A) | nada — determinístico | — | 0 | — |
| **Assunto** (`subject`) | nada | — | 0 | `subject-lines`, `preview-texts` do Max |
| **Copy** (n8n) | `purpose` (papel do Estruturador), `fio_narrativo`, `alvo`, `copy_guidance` da variante | por payload | — | intenção do toque, aprendizados, S.C.E. e "o que evitar na copy" do Max |
| **Encurtador** (`copy_fit`) | nada — contrato do bloco e copy acima do limite | — | 0 | — |
| **Imagem** | nada — direção fotográfica vem da variante no **banco** | — | 0 | — |
| **Hero** | nada — `design_system` da variante no **banco** | — | 0 | `secao-hero` (4 itens above the fold), `ease-of-click`, `numeros-de-design` |
| **Tipografia** | nada — base "fechada com especialista" em `docs/email-generation/agente-tipografia.md`, **fora do vault** | — | 0 | — |
| **Cores & Botões** | nada — paleta da loja + pesquisa | — | 0 | "botão maior nunca perdeu A/B", cor de contraste |
| **QA** | nada (desligado) | — | 0 | tudo |

Três coisas saltam da tabela:

1. **O vault só existe para a fase 1**, e dentro dela só para três agentes.
2. **Quem recebe, recebe tudo.** Nada é roteado por e-mail, por seção ou por
   pergunta. Os aprendizados entram duas vezes (Estruturador e Curador).
3. **O catálogo do Curador é 67% do prompt** — 128k de 190k. É o oposto do
   Max, que serve títulos e abre a prosa só da finalista.

---

## 3. Achados medidos

### A. As lacunas nunca foram servidas

15 notas em `componentes/lacunas/`, **0 ativas**. Todas têm `status: aberta`
(13), `observacao` (1) ou `retratada` (1). O parser diz, no comentário de
`isDocActive`: *"Lacunas são cidadãs de primeira classe do vault (`status:
aberta`) mas NÃO entram no runtime: são worklist humana."* O
`curador-vault.ts`, escrito por outra mão, carrega `kind='lacuna'` com
`is_active = true` e monta `<lacunas_da_biblioteca>` — que sai
**"(nenhuma lacuna registrada no vault)" em 100% das runs** (36 chars). A
memória do projeto registra as lacunas como "antes sincronizado e nunca
servido" e corrigido em 02/09. Não foi: o gate de status venceu o loader.

Consequência: o Curador não sabe que `welcome-5` não tem body ativo para
`confianca-no-canal`, que `header` e `cta` não têm variante nenhuma, que
hero-8 ≡ hero-10. O protocolo manda "declarar a lacuna" e o agente não tem
como saber que ela existe.

### B. Os requisitos não são servidos, e o dano aparece em toda run

52 notas de `requisitos/`, **todas com `verificavel_hoje: false`**. Saíram do
prompt em 01/09 porque o modelo eliminava por dedução sobre ativo
invisível. Correto — mas ficou o buraco que `_parametros-da-loja` e
`o-que-o-curador-ainda-nao-tem` descrevem: não existe perfil de ativos da
loja ("tem cupom ativo? tem UGC autorizado? tem foto de estúdio?").

Medido nas 4 últimas runs do Curador, `protocol_violations`:

| Violação | Runs | O que é |
|---|---|---|
| `proibicao_violada` × `exige cupom-ativo` | 4/4 | o alvo do Seletor diz "não inventar código, valor ou expiração de incentivo"; a hero escolhida (hero-3/5/6) **exige** cupom ativo |
| `aliviador_ausente (reputacao_da_loja)` | 4/4 | o alvo pede reputação da loja; nenhuma posição realiza (o único body de `confianca-no-canal`, body-5, está inativo) |
| `proibicao_violada` × `prova_de_terceiro` | 4/4 | "não inventar depoimentos com nome e idade"; a variante de reviews escolhida exige `depoimento-com-credencial` |

São três formas do mesmo defeito: **o vault sabe o que cada bloco exige, a
loja não declara o que tem, e o alvo declara o que é proibido — e os três
nunca se encontram na mesma decisão.**

### C. A recusa nomeada não fecha o ciclo

O Max: "recusa não é 'não sei'; é nomear a lacuna e oferecer o vizinho". O
vault de e-mail tem o mesmo princípio escrito (*"um zero-elegíveis
recorrente é o sinal mais valioso que o sistema produz"*). Mas:

- `estruturador_feedback`: **0 linhas** (o 👍/👎 que viraria rascunho de
  nota do vault nunca foi usado);
- `email_structure_reviews`: **0 linhas**;
- `estruturador_orientacoes`: 3 linhas;
- `aliviador_ausente (reputacao_da_loja)` repete em 4 runs e **não existe
  nota de lacuna** para ele.

A telemetria produz o sinal; nada o devolve ao vault.

### D. Sem roteamento, o contexto vira ruído

- O Estruturador recebe as **8 estruturas** do welcome (25k chars) em toda
  chamada. Cada uma declara `emails: [N]` no frontmatter. O `loadMaterial`
  filtra só por `flow_type`.
- Os **18 aprendizados** (7 globais + 11 do welcome) entram inteiros no
  Estruturador (17.6k) **e de novo** no Curador (14.4k). `aplica_a` só
  discrimina por flow.
- O Curador recebe **35 variantes com prosa completa** (128k) para escolher
  ~6. O `_catalogo.md` do vault, que resolve os passos 3–8 "em uma única
  leitura", tem 11.7k chars e não é servido.

A `_arquitetura.md` do Max cita a medição: 18 modelos degradam com input
maior, poucos sustentam acurácia acima de 64k tokens. O Curador roda a
**67.161 tokens de entrada em média**, 90 s por chamada.

### E. A consulta sob demanda não funciona como no Max

`consultou_vault: false` em 5 das 8 últimas runs. Nas 3 em que consultou,
o modelo listou `componentes/variantes/body` e leu `offer-4` e `offer-5` —
**duas variantes desativadas** (corrigido em 07/09 para responder
"desativada", mas o padrão fica: ele abre o que o índice mostra, e o índice
mostra pastas). O Max escolhe pelo **título + primeira frase** de um
catálogo de 400 notas. O índice servido ao Curador é `pasta → nº de notas`.

### F. Só o welcome existe

| Flow | E-mails na base | Gerados | Intenção | Estrutura | Progressão |
|---|---|---|---|---|---|
| welcome | 505 | 8 | 8 + `_flow` | 8 | sim |
| abandoned_cart | 504 | 6 | — | — | — |
| browse_abandonment | 315 | 1 | — | — | — |
| shipping_stages | 315 | 0 | — | — | — |
| upsell | 252 | 2 | — | — | — |
| win_back | 189 | 1 | — | — | — |
| site_abandoned | 64 | 2 | — | — | — |

Fora do welcome, o Seletor grava `skipped: sem_intencao` e o Estruturador
`sem_material`. O Max tem nota própria para browse abandon, cart e checkout
(dois flows), post purchase, replenishment, site abandon, sunset, winback,
e um catálogo de 21 ângulos de filler para o welcome.

### G. A fase 2 é cega ao vault, e o conhecimento dela mora fora dele

Hero, tipografia, cores, QA e assunto não leem nada do vault. O design
system vem da coluna `design_system` da variante no banco. A base de
tipografia foi "fechada com especialista" e gravada em
`docs/email-generation/agente-tipografia.md` — um arquivo do repo, invisível
para quem cura o vault e para o Max. Enquanto isso o Max tem, sincronizado
e nunca lido por agente algum: `secao-hero` (os 4 itens above the fold),
`principio-ease-of-click` ("botão maior nunca perdeu A/B"),
`principio-skimmability`, `transicoes-entre-secoes`, `secao-bridge`,
`secao-product`, `subject-lines`, `preview-texts`, `o-que-evitar-na-copy`,
`numeros-de-design`.

### H. Contrato do Seletor sem a chave no vault

Nenhuma das 8 intenções do welcome tem `modo:` no frontmatter
(`intents_com_modo = 0`). O Seletor deduz o modo da prosa e a telemetria
grava `modo_origem: deduzido`. O CLAUDE.md chama isso de provisório. O
contrato tipado (`riscos_elegiveis`, `profundidade_minima`,
`veiculos_exigidos`, `dimensao_alvo`) tem 11 de 15 campos derivados do
catálogo da loja — e só **2 de 63 lojas** têm catálogo.

### I. Dois dados do vault ainda divergem do banco

`catalogo_divergente` em todas as runs: `body-3-pitch-de-gift-card` (0,286)
e `body-4-comparativo-em-duas-colunas` (0,426) — a nota do vault e a linha
do banco descrevem peças diferentes. O código serve as duas descrições e
pede cautela; o conserto é humano, no `variant_id` ou na prosa da nota.

### J. A porta de entrada não é servida

`_INDEX.md` é housekeeping para o sync (por desenho) e `_casos-de-teste`,
`_parametros-da-loja`, `_inventario` são ativos mas não entram em prompt
nenhum. O "comece aqui, caminho de seleção, convenções" do vault existe
para humanos; o agente recebe a ordem que o código impõe.

---

## 4. O que faz o Max funcionar, traduzido para o pipeline

Não é o corpus. São oito decisões de disposição, cada uma com o equivalente
que falta aqui:

| Princípio (Max) | Como está no vault de e-mail | O que falta |
|---|---|---|
| **Julgamento sempre presente, pequeno.** A persona entra em toda resposta e carrega "como decide", "o que nunca diria", "o que pergunta antes". | O protocolo de 9 passos é procedimento, não julgamento. Precedência vive em código. | Uma nota de julgamento da casa (≤ 8k), servida no SYSTEM de Estruturador e Curador |
| **Verificar antes de afirmar.** Números da tabela, conflito antes da nota. | `exige` foi removido porque não é verificável. | Perfil de ativos da loja + servir requisitos como *pergunta*, não como veto |
| **Índice sempre, corpo sob demanda.** 3–6 notas por resposta. | Catálogo inteiro (128k) sempre; `ler_nota` quase sem uso. | `_catalogo.md` (11.7k) como índice; prosa da finalista sob demanda |
| **Nome + primeira frase como interface.** | Índice servido = pastas. Notas abrem com frontmatter e `#`. | Auditar a primeira frase das 223 notas; servir título + resumo |
| **Roteamento pelo mapa.** "Nunca varrer a pasta inteira." | Estruturas e aprendizados inteiros, por flow. | `emails:`/`serve_a:` no frontmatter decidem o que entra por toque |
| **Precedência declarada, "cite as duas".** | "vault vence banco" em código; divergência vira warn. | A precedência vira nota; divergência vira pergunta ao operador |
| **Recusa nomeada → lacuna → pauta.** | Lacunas existem e não são servidas; feedback = 0. | Servir lacunas; violação recorrente vira rascunho de lacuna |
| **Anti-exemplos e casos de teste como eval.** | `quando_nao_usar` por variante; `_casos-de-teste` nunca rodou. | `descartes/` do e-mail; Caso A/B como assert sobre runs |

---

## 5. O plano

Ordem por valor ÷ custo. As fases 0 e 1 desfazem os erros medidos; a 3 é o
pedido original ("tão bom quanto o Max"); a 4 e a 5 são o que mantém isso
verdadeiro depois. Onde uma peça depende do código dos agentes, está
marcada **→ outro lado**, com o contrato exato do que o vault entrega.

### Fase 0 — Dado (1 dia) · desfaz A, H, I

**No Obsidian (`Admin Convertfy/Emails/`):**

1. **`modo:` e o contrato tipado nas 8 intenções do welcome.** Os valores
   já estão decididos (`intencoes-welcome-frontmatter.md` propõe os 8). O
   sync faz `upsert` do frontmatter inteiro, então o dado tem de morar na
   nota — é o único lugar que sobrevive.
2. **body-3 e body-4:** alinhar descrição/`variant_id` da nota com a peça
   que o banco monta. Sem isso o Curador decide sobre uma peça e o pipeline
   monta outra.
3. **Duas lacunas novas**, com o que a telemetria já provou:
   `reputacao-da-loja-sem-bloco-ativo` e
   `exige-cupom-sem-perfil-de-ativos`.

**No sync (camada do vault, minha):**

4. **Lacunas passam a ser servidas.** `isDocActive`: para `kind='lacuna'`,
   `status: aberta` ativa; `retratada`/`observacao` não. Um teste garante
   os três. O bloco `<lacunas_da_biblioteca>` passa de "(nenhuma)" para as
   lacunas das seções do e-mail (o builder já existe e já filtra por seção).

**Prova:** `lacunas_servidas > 0` na próxima run; `intents_com_modo = 8`;
`catalogo_divergente = []`.

### Fase 1 — Julgamento (2 dias) · desfaz o vazio da persona

5. **`Emails/_julgamento.md`** (kind novo `julgamento`, ≤ 8k). O equivalente
   da persona, sem ser persona: *como a casa decide um e-mail*. Conteúdo:
   - **O que nunca fazemos** (com a fonte): inventar incentivo, depoimento,
     prazo, selo; urgência antes do toque que a pede; segunda objeção no
     toque de uma só; sequência repetida entre irmãos; prova social gasta
     cedo. Tudo isso já existe espalhado em `_flow`, aprendizados e no alvo
     — aqui vira uma lista curta que entra sempre.
   - **O que perguntamos antes de decidir**: a loja tem cupom ativo? tem
     avaliação real? tem foto de estúdio? tem política de troca publicada?
     (a Parte 2 de `_parametros-da-loja`, virada em perguntas).
   - **Precedência entre fontes**, na forma do `mapa-do-conhecimento`:
     pesquisa da loja com evidência > alvo do Seletor > aprendizado com
     origem > estrutura de referência > doutrina do Max > preferência do
     modelo. E a regra: **quando duas discordam, escolha a de cima e diga
     qual perdeu** — em vez de "vault vence" em silêncio.
   - **Quando recusar**: posição sem variante que sirva ao alvo não é
     "escolher a menos ruim" — é declarar e deixar o slot para o template
     global, nomeando a lacuna.
6. **Sync:** `kind='julgamento'` reconhecido pelo parser; `curador-vault.ts`
   expõe `buildJulgamentoBlock` (puro, cacheável, idêntico entre lojas).

**→ outro lado:** var `{{julgamento}}` no SYSTEM do Estruturador e do
Curador, antes do protocolo. Contrato: string markdown, ≤ 8k, ausente =
"(sem nota de julgamento no vault)".

**Prova:** `proibicao_violada` cai (o julgamento diz explicitamente que
`exige` do bloco × proibição do alvo é veto); run grava `julgamento_sha8`.

### Fase 2 — Disposição: menos e certo (2 dias) · desfaz D e E

7. **Roteamento por toque no frontmatter.** Estruturas já têm
   `emails: [N]`; aprendizados ganham `serve_a: [welcome-1, welcome-2]`
   (ou `serve_a: [todos]`). O vault decide o que entra; o código só lê.
8. **`_catalogo.md` como índice servido.** Ele já é gerado, tem 11.7k, e é
   exatamente a forma do catálogo de títulos do Max. Cada linha ganha a
   **primeira frase da descrição curta** (o "resumo de 320 chars").
   `gera_catalogo.py` passa a emitir isso.
9. **Primeira frase auto-explicativa em todas as notas de variante** —
    auditoria com `valida.py` (regra nova: o corpo abre com prosa, não com
    `#` nem tabela). É o que torna `ler_nota` escolhível pelo resumo.
10. **Índice do vault servido = títulos + primeira frase**, não pastas.
    `buildIndiceDoVault` passa a montar a partir do `_catalogo` e das
    primeiras frases (camada do vault).

**→ outro lado:** (a) Estruturador filtra estruturas por `emails:` e
aprendizados por `serve_a:` (o loader é dele); (b) Curador recebe o
`_catalogo` no SYSTEM e a **prosa completa só das variantes das seções
pedidas** — ou, mais radical e mais Max, nenhuma prosa no SYSTEM e
`ler_nota` para a finalista de cada posição, com teto de 6 consultas.
Contrato: `buildCatalogo()` devolve a tabela; `ler_nota` já existe.

**Prova:** `tokens_input` do Curador de 67k para ≈ 25–30k; `consultou_vault`
de 37% para > 80%; nenhuma queda em `live_rank1_agreement`.

### Fase 3 — Trazer o Max para o e-mail (3–4 dias) · desfaz F e G

Não copiar as notas do Max para `Emails/`: autoria diferente, contrato
diferente, e o `mapa-do-conhecimento` proíbe misturar. Três caminhos, do
mais barato ao mais valioso:

11. **Ferramenta `buscar_doutrina(pergunta)`** para Estruturador e Curador:
    busca semântica em `ai_knowledge_notes` restrita a
    `Advisors/Max/{design,copy,flows,doutrina,fundamentos}`, devolvendo
    título + resumo + 12k da nota, com o rótulo "doutrina de curso — perde
    para dado da loja". É o mesmo motor do conector `conhecimento` da
    ConvertIA, com escopo fechado. Vive em `curador-vault-tools.ts`.
    **→ outro lado:** registrar a tool nos dois agentes (o loop de tools já
    existe).
12. **`Emails/doutrina/` — notas de ponte** (kind `doutrina`, 6 a 8 notas,
    ≤ 6k cada), cada uma citando a nota do Max por wikilink e traduzindo
    para o vocabulário do vault (seções, eixos, `papel_na_peca`):
    - `hero-quatro-itens-above-the-fold` (headline, gráfico, value prop,
      botão — e o que isso exige da variante de hero);
    - `botao-e-clique` (tamanho, centralizar, contraste, "nunca perdeu A/B");
    - `varredura-nao-leitura` (skimmability: título carrega o argumento —
      já é aprendizado nosso; aqui ganha a régua do Max);
    - `transicoes-entre-secoes` e `bridge-depois-da-hero`;
    - `subject-line-e-preview` (as 4 regras + "não fica bonitinho");
    - `fillers-do-welcome` (os 7 ângulos como candidatos a intenção).
    **→ outro lado:** `{{doutrina_hero}}` no agente de hero,
    `{{doutrina_assunto}}` no `subject`, `doutrina` no payload de copy
    (aditivo, como `alvo`).
13. **Intenções para os 6 flows sem cobertura.** `_flow.md` + toques, com
    `status: rascunho` para revisão humana, partindo das notas do Max
    (`cart-checkout-abandon` são dois flows; `browse-abandon`;
    `post-purchase`; `winback`; `site-abandon`) e do vocabulário de eixos
    já existente (`momento/` tem 21 valores — `carrinho-abandonado`,
    `browse-abandonment`, `pos-compra` já estão lá, sem intenção que os
    use). É o maior ganho de cobertura: hoje 1 de 7 flows tem material;
    o Seletor e o Estruturador pulam os outros seis.

**Prova:** `skipped: sem_intencao` e `sem_material` → 0 nos flows com
intenção aprovada; run do hero grava `doutrina_sha8`.

### Fase 4 — O ciclo que aprende (1 dia) · desfaz C

14. **Violação recorrente vira rascunho de lacuna.** Um cron (ou o próprio
    `finishGenerationRun` do Curador) agrega `protocol_violations` por tipo
    e, na 3ª ocorrência do mesmo `(tipo, detalhe)`, escreve um rascunho em
    `componentes/lacunas/_propostas/` com `status: proposta` — o mesmo
    mecanismo que o 👎 já usa (`aprendizado-curador.ts`), só que
    alimentado pela telemetria em vez de por clique. Humano promove para
    `aberta`.
15. **`Emails/_registro/descartes.md`**: o que foi escolhido e desfeito por
    guard de código (hero dupla, `invalid_ids`, `coberturaSuficiente`),
    com o motivo — o anti-exemplo que o Max tem e o e-mail não.

**Prova:** 1ª lacuna proposta automaticamente em 7 dias; a de
`reputacao_da_loja` nasce sozinha.

### Fase 5 — Casos de teste como eval (1 dia)

17. `_casos-de-teste.md` (Caso A: welcome-1 Innova; Caso B: welcome-5
    zero-elegíveis) viram dois testes que rodam a régua de código
    (`measureProtocolViolations`, `conformarEstrutura`, `coberturaSuficiente`)
    sobre a saída esperada da nota. O plano de 31/08 previa isso na Fase 2
    e nunca aconteceu. Quando o Curador mudar de modelo de novo, é o que
    diz se piorou.

---

## 6. O que NÃO fazer

- **Não jogar as 124 notas do Max no prompt.** O Max funciona porque não
  faz isso consigo mesmo.
- **Não aumentar o contexto do Curador.** Ele já está acima da faixa onde
  a degradação é medida. Toda fase deste plano tira, não põe.
- **Não reescrever o protocolo de 9 passos.** Ele é bom; o que falta é o
  julgamento antes dele e o roteamento em volta.
- **Não renomear nota nenhuma.** Wikilinks resolvem por nome; 223 notas e
  4 tabelas dependem do `file_path`.
- **Não trazer `exige` de volta como veto** sem o perfil de ativos. Como
  pergunta (fase 1), sim.
- **Não copiar nota do Max para `Emails/`.** Ponte com wikilink, sim.

---

## 7. O que prova que deu certo

| Métrica | Hoje | Alvo | Fase |
|---|---|---|---|
| `lacunas_servidas` por run | 0 | > 0 quando a seção tem lacuna | 0 |
| `proibicao_violada` × `exige` | 4/4 runs | 0 | 1 |
| `aliviador_ausente` sem lacuna registrada | sim | lacuna existe | 0/4 |
| `tokens_input` médio do Curador | 67.161 | ≤ 30.000 | 2 |
| `consultou_vault` | 3/8 | ≥ 6/8 | 2 |
| Flows com intenção aprovada | 1/7 | 7/7 (rascunhos em 4) | 3 |
| Agentes da fase 2 que leem vault | 0/6 | hero, assunto, copy | 3 |
| `estruturador_feedback` + lacunas propostas | 0 | > 0 | 4 |
| Casos A/B como teste | 0 | 2 | 5 |

---

## 8. Entregas para o outro lado, em uma tabela

| Item | O que o vault entrega | O que o agente precisa fazer |
|---|---|---|
| Julgamento | `buildJulgamentoBlock()` → markdown ≤ 8k | `{{julgamento}}` no SYSTEM de Estruturador e Curador |
| Roteamento | `emails:` nas estruturas, `serve_a:` nos aprendizados | filtrar no `loadMaterial`; não servir aprendizados duas vezes |
| Catálogo enxuto | `_catalogo.md` com primeira frase, via `buildCatalogo()` | trocar `{{catalogo}}` (128k) pelo índice; prosa por `ler_nota` |
| Índice | `buildIndiceDoVault()` com títulos + resumo | nenhuma (var já existe) |
| Doutrina | tool `buscar_doutrina`; notas `Emails/doutrina/*` via `buildDoutrinaBlock(secao)` | registrar a tool; `{{doutrina_hero}}`, `{{doutrina_assunto}}`; `doutrina` no payload de copy |
| Lacunas automáticas | rascunhos em `lacunas/_propostas/` | nenhuma (cron do vault) |

Tudo o que está na coluna do meio é fail-open: sem a var do outro lado, o
bloco não é servido e nada muda. Sem a nota no vault, a var renderiza
ausência declarada, como as demais.
