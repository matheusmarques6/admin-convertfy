# Raio-X do perfil e Espionagem de concorrente

Duas telas do módulo Conteúdo copiadas de uma ferramenta que o time assinou,
com o eixo de melhoria declarado em cada uma. Este documento registra **o que
foi copiado, o que foi mudado e por quê** — a parte que some quando só o
código sobrevive.

## O que a medição em produção disse, antes de escrever código

| tabela | linhas | leitura |
|---|---|---|
| `conteudo_ig_media` | 90 posts | o dado existe |
| classificados (pilar/molde/kw) | **0 de 90** | o eixo de conversão é lacuna de DADO |
| `conteudo_trends` | **0** | o radar nunca rodou (não há cron) |
| `conteudo_brand_kits` | 0 | — |
| `conteudo_documentos` | 2 | — |
| `conteudo_meus_templates` | 0 | — |

O módulo tem o dado bruto e quase nenhuma curadoria. As duas telas foram
desenhadas para funcionar **nesse** estado: nada aqui exige classificação para
mostrar número, e o que depende dela diz que depende.

---

## Raio-X (`/admin/conteudo/raio-x`)

A referência mostra um mostrador com **48 de 100** e nada mais: não dá para
saber o que entrou na conta, qual componente puxou a nota para baixo, nem se
algum deles simplesmente não pôde ser medido. Pior: um perfil cujos insights a
Meta não entregou aparece como perfil **ruim**.

### As três regras da nota (`lib/conteudo/raio-x/nota.ts`, puro)

1. **Componente não medido sai do DENOMINADOR**, nunca entra como zero.
   Penalizar o que não foi medido é inventar defeito. A saída declara
   `medidos` de `total` e a tela é obrigada a dizer isso.
2. **Nada medido ⇒ `nota: null`**, jamais 0. Zero se lê como "péssimo"; a
   verdade é "não dá para dizer".
3. **Toda referência é DECLARADA e tem dono.** Ou é dado do nosso sistema (a
   meta semanal configurada no canal), ou é mediana publicada com a fonte
   nomeada (`MEDIANAS_DE_MERCADO`), ou é o teto que o próprio perfil já
   provou. Não existe alvo inventado — e é por isso que o **mix de formato**,
   que não tem referência honesta, ficou FORA da nota e vive no diagnóstico.

### Os quatro componentes

| componente | peso | referência | quando não é medido |
|---|---|---|---|
| Constância | 30 | meta semanal do canal | nunca — publicar não depende de insight |
| Engajamento | 25 | maior mediana publicada (`MEDIANA_ALTA`) | sem snapshot de seguidores, ou nenhum post com interação |
| Retenção | 25 | teto do PRÓPRIO perfil: mediana dos 3 melhores `sends ÷ alcance` | menos de 5 posts com alcance ≥ 30 |
| Caminho de conversão | 20 | todo post deveria ter caminho até o direct | nenhum post classificado |

Duas decisões de aritmética que os testes travam:

- **`taxaMediaPorPost` é média POR POST**, que é a forma das medianas
  publicadas ("mediana por post sobre seguidores"). Somar o período e dividir
  por seguidores daria um número não comparável com fonte nenhuma.
- **`retencaoDoPeriodo` é soma ÷ soma**, nunca média de razões: média de
  médias dá o mesmo peso ao post de 50 de alcance e ao de 5.000.
- **O teto é a MEDIANA dos três melhores**, não o melhor sozinho: um post de
  alcance 40 com 2 compartilhamentos rende 5% e viraria teto que ninguém
  alcança — o alarme falso que ensina a ignorar o alarme. `ALCANCE_MINIMO = 30`
  é o mesmo cuidado, do outro lado.

### Diagnóstico (`raio-x/diagnostico.ts`)

Oito lacunas — `cadencia`, `classificacao`, `formato`, `gate`, `alcance`,
`referencia`, `brand_kit`, `insights` —, cada uma com **evidência** (o número
que a produziu), **custo** (o que ela esconde), **saída** (o que fazer) e, onde
cabe, o botão que leva ao lugar certo com a pauta já escrita. Lacuna sem número
medido não aparece: é a diferença entre diagnóstico e checklist genérico.

### Medido contra produção

Perfil @convertfy.me, 30 dias, 781 seguidores, 6 posts no período:

```
nota 72 (bom) — 3 de 4 componentes medidos
Constância    47%  · 1,4 post/semana · meta 3
Engajamento  100%  · 3,29% por post · Socialinsider 0,48%
Retenção      74%  · 0,28% no período · seus 3 melhores fazem 0,38%
Caminho de conversão — NÃO MEDIDO (nenhum post classificado)
```

Os 3,29% foram conferidos post a post, à mão.

---

## Espionagem (`/admin/conteudo/espionagem`)

A tela que isto copia ordena por **"mais quentes" = curtidas + comentários**.
Num perfil de 68 mil seguidores isso ranqueia o TAMANHO da conta: o pior post
de um perfil grande ganha do melhor de um pequeno, e o que se quer saber é o
que funcionou **acima do normal daquele perfil**.

Três diferenças deliberadas:

1. **A ordem padrão é DESTAQUE** — quantas vezes o post passou da MEDIANA do
   próprio perfil. "Mais quentes" continua disponível como segundo eixo, com o
   rótulo dizendo o que ele é ("o absoluto"). Amostra abaixo de
   `MINIMO_PARA_MEDIANA = 5` não calcula destaque: com 3 posts, "2,4× a
   mediana" é ruído, e a ordenação cai para o absoluto em vez de ficar
   arbitrária em silêncio.
2. **A fórmula parcial é DITA.** `business_discovery` entrega curtidas e
   comentários e **mais nada** — sem alcance, sem salvos, sem
   compartilhamentos. A comparação com o nosso perfil roda na MESMA fórmula
   parcial dos dois lados: comparar a parcial dele com a nossa completa
   inflaria o nosso lado por construção.
3. **"Usar este tema" não leva a copy alheia.** A pauta carrega o ASSUNTO e a
   instrução de escrever do nosso ângulo. Levar a legenda junto traria a voz
   dele — é a diferença entre pesquisar e copiar.

### Limites da API, declarados na tela

- Só perfil **Business/Creator público**. Conta pessoal ou privada devolve
  `#110` / "does not exist", e a mensagem diz isso — "perfil inexistente"
  mandaria o operador procurar erro de digitação que não existe.
- Precisa de um canal Instagram conectado (o token é o nosso).
- Cache de **6 horas** em `crm_channels.config.conteudo.espionagem` (12 handles),
  com "Varrer de novo" forçando chamada nova. Reabrir o mesmo perfil não gasta
  cota.

---

## Os dois defeitos que só o render pegou

Nenhum dos dois quebra teste, e os dois estavam na tela:

1. **Raio-X — a barra de "não medido" saía VAZIA**, que se lê exatamente como
   zero: o oposto do que a regra 1 existe para dizer.
   `bg-[repeating-linear-gradient(...)]` como classe arbitrária do Tailwind
   **não é aplicada**; virou `style` inline com o gradiente tracejado.
2. **Espionagem — o número contradizia a própria legenda**: "0,1×" com "o seu
   perfil engaja 6,7× o deles" ao lado. `compararComONosso` passou a devolver
   `{ razao, vezes, quem, nota }`, onde `razao` é a conta crua e `vezes` é
   sempre ≥ 1, na direção que a frase afirma. Tem teste de regressão.

O render também pegou o "1 comentários" dos cards.
