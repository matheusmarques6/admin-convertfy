# Nota para o Obsidian — como cadastrar a variante no vault

**Este arquivo é para ser COLADO no vault**, em
`componentes/_como-cadastrar.md`. O admin só lê o vault (o token é
read-only), então ele não pode escrever a nota — quem cola é o time.

O conteúdo abaixo da linha é a nota. O que vem antes é instrução para quem
está colando.

Companheiro deste arquivo: `guia-de-cadastro-de-variante.md`, que cobre o lado
do sistema (o cadastro na aba Componentes).

---

```markdown
---
status: aprovada
tipo: processo
---

# Como cadastrar a nota de uma variante

A variante mora em dois lugares: o **cadastro no admin** (HTML, schema, o que a
peça é) e a **nota aqui** (como escolhê-la — objeção que ela alivia, registro,
paleta, papel, com quem convive). Sem a nota, o Curador enxerga a variante como
um título e uma frase de descrição, e escolhe sem nenhum dos eixos.

Hoje: 40 notas ativas para 37 variantes ativas — 4 apontam para variante
desativada e 1 variante ativa não tem nota.

## 1. O caminho é o tipo

```
componentes/variantes/<secao>/<slug>.md
```

`<secao>` é hero, body, products, reviews, offer ou footer. **Só esse caminho
vira uma nota de variante.** Uma pasta a mais ou a menos e a nota é ignorada
sem erro. O `<slug>` é o nome do arquivo e é como o Curador pode se referir à
variante.

## 2. O frontmatter

Só uma linha é contrato de verdade:

```yaml
status: aprovada
```

Qualquer outro valor — `rascunho`, `proposta`, `pendente`, `retratada` — e a
nota some do catálogo. A variante continua sendo escolhida, só que sem os eixos.

E uma linha é a chave que liga a nota à variante:

```yaml
variant_id: e447ef06-95e2-4c5d-9b6f-c3e0b895f8d2
nome_no_banco: welcome - hero section 4
```

O `variant_id` é o id que aparece no editor do admin. Sem ele (ou sem o
`nome_no_banco` batendo exatamente), a nota **não entra no catálogo** e nada
avisa. Nunca troque o `variant_id` de uma nota existente.

## 3. Os eixos que o Curador realmente lê

Nesta ordem de importância. Todo valor usado precisa ter uma nota própria em
`componentes/eixos/<eixo>/<valor>.md`, senão o `valida.py` reprova.

```yaml
objecao: [pertencimento]
registro: [premium-editorial]
registro_vetado: []
paleta: [com-acento-definido]
papel_na_peca: [abre]
peso: "{ altura_px: 1150, classe: medio, fonte: medido }"
convivencia: []
itens: null
```

Vocabulários em uso:

- **objecao** (11): adesao-social · amplitude-de-catalogo ·
  composicao-formulacao · confianca-no-canal · disponibilidade-urgencia ·
  escolha-variedade · pertencimento · preco-valor · qualidade-eficacia ·
  suporte-duvida · uso-aprendizado
- **registro** (10): bold-alto-contraste · clinico-sobrio · comercial ·
  comunidade-identitario · festivo · luxo · minimalista-leve ·
  popular-informal · premium-editorial · volume-impulso
- **paleta** (8): cinza-neutro · claro · com-acento-definido · creme ·
  escuro-saturado · full-dark · monocromatico · preto-e-branco
- **papel_na_peca** (6): abre · apoio · fecha · meio · peca-inteira · ponte

O `peso` é lido por expressão regular do texto entre chaves — mantenha o
formato exato do exemplo. Meça a altura renderizada; não chute.

## 4. Os dois eixos que faltam em TODAS as notas

```yaml
aliviador: prova_de_terceiro
profundidade: mecanismo
```

**Nenhuma das 40 notas declara estes dois.** Hoje o código os deriva do tipo de
bloco e da objeção — um palpite. Declarados na nota, eles **vencem** a derivação,
e são os dois eixos que mais pesam quando o Curador decide entre duas variantes
que servem ao mesmo papel.

- **aliviador** — o que a peça oferece para dissolver a objeção:
  garantia_de_devolucao · prova_de_terceiro · prova_por_volume ·
  demonstracao_de_mecanismo · transparencia_de_politica · amostra_ou_teste ·
  dado_de_adequacao · comparacao_de_categoria · seguranca_de_pagamento ·
  reputacao_da_loja
- **profundidade** — quão fundo o argumento vai, do raso ao denso:
  afirmacao → mecanismo → prova_de_terceiro → garantia

Preencher os dois nas notas existentes é a maior alavanca de qualidade do vault
hoje.

## 5. O corpo

Três títulos de nível 2 são lidos; o resto é para gente:

```markdown
## Descrição curta
Duas ou três frases. É o que o Curador lê primeiro. (limite: 600 caracteres)

## Quando usar
Em que momento esta peça é a certa. (1200)

## Quando não usar
Em que momento ela seria o erro. (1200)
```

O "quando não usar" é o que falta em 28 das 37 variantes, e é ele que faz o
Curador **descartar** pelo motivo certo em vez de escolher por eliminação.

Direção fotográfica e design system **não** vão na nota: eles moram no cadastro
do admin e servem aos agentes que desenham, não a quem escolhe.

## 6. Campos que já não são lidos

`momento` e `momento_vetado` foram **aposentados em 07/09**. Continuam em notas
antigas e não têm mais efeito nenhum — nenhuma variante fora da hero declarava
momento, e a regra eliminava seções inteiras sem separar boa de ruim. Não
preencha em nota nova.

Também não são lidos: `tipo`, `ativa`, `fonte`, `secao`, `aprendizados`,
`product_slots`, `schema_campos`, `serve_estruturas`, `densidade_no_banco`,
`diretivas_de_imagem`.

O `exige` é lido, mas só pelo medidor interno — nunca chega ao Curador.

## 7. Depois de salvar

1. `valida.py` — reprova valor de eixo sem nota própria.
2. `gera_catalogo.py` — nunca edite `_catalogo.md` à mão.
3. Sincronizar no admin (aba Conhecimento). A nota só passa a valer depois
   disso.
4. Conferir na aba Conhecimento se a nota aparece casada com a variante certa.
   Nota órfã e variante sem nota aparecem ali.
```
