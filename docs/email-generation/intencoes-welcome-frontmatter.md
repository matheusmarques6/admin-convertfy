# Intenções do welcome — frontmatter tipado (proposta para revisão no vault)

*04/09/2026 · fase 2 do plano das objeções. Extraído do `body_md` das 8
intenções ativas em `email_intents` (o texto em prosa continua sendo a
doutrina; aqui só o que o Seletor precisa como CAMPO). Para colar no
Obsidian em `intencoes/welcome/welcome-N.md`, MANTENDO as chaves que já
existem (`tipo`, `status`, `flow_type`, `email_number`, `revisado_por`).*

**Formato que o parser aceita** (`vault-parser.ts`, fase 0): escalares de
uma linha, array inline `[a, b]` (vírgula dentro de aspas é respeitada) e
lista em bloco (`chave:` seguida de `- item`). **Não** aceita `>` dobrado
nem objeto aninhado — `estado_do_leitor` fica no corpo, onde já está.

Vocabulário (fechado — `src/lib/agents/objecoes/vocabulario.ts`):
`modo` ∈ quebra_de_objecao | varredura_de_objecoes | confirmacao_por_terceiros
| varredura_de_canal | fechamento_de_ciclo | manutencao_de_confianca ·
`riscos_*` ∈ financeiro, desempenho, tempo, psicologico, social, seguranca,
adequacao · `profundidade_minima` ∈ afirmacao < mecanismo < prova_de_terceiro
< garantia · `aliviadores_*` ∈ os 10 da spec (ou `[todos]`) · `veiculos_exigidos`
∈ origem_da_marca, economia_do_preco, operacao_por_pedido, mecanismo_unico ·
`trabalhos_fixos` ∈ entrega_de_incentivo, lembrete_de_incentivo_vivo,
prazo_com_hora, custo_de_adiar_sem_hora, prova_secundaria, remocao_de_risco,
espelho_do_cetico · `fonte_das_objecoes` ∈ nao_atacadas | ja_atacadas |
medos_de_categoria. Campo ausente → default por modo
(`parseIntentContract`); **sem `modo` a nota não tem contrato e o Seletor
não roda para ela** (é o estado das 26 intenções fora do welcome).

Extensão à spec: `aliviadores_vetados` (o corpo diz "não depender de prova
social" — isso é veto de aliviador, não de risco).

---

## welcome-1 — Entregar a promessa e trocar o motivo

```yaml
modo: quebra_de_objecao
n_objecoes: [1, 1]
fonte_das_objecoes: nao_atacadas
exige_dominante_da_categoria: true
riscos_elegiveis: [desempenho, psicologico, financeiro, adequacao, seguranca]
profundidade_minima: afirmacao
aliviadores_admissiveis: [todos]
trabalhos_fixos: [entrega_de_incentivo, prova_secundaria, remocao_de_risco]
permite_reataque: false
dimensao_alvo: competencia
proibicoes:
  - história longa da fundação (profundidade tem toque próprio)
  - pedido de engajamento paralelo (rede social, preferências) — um pedido só
  - urgência artificial
  - esgotar os argumentos — uma objeção só, bem atacada
  - condição nova no incentivo
```

## welcome-2 — Converter cupom aberto em decisão

```yaml
modo: varredura_de_objecoes
n_objecoes: [4, 5]
fonte_das_objecoes: nao_atacadas
riscos_elegiveis: [desempenho, financeiro, tempo, adequacao, seguranca]
riscos_vetados: []
profundidade_minima: afirmacao
aliviadores_admissiveis: [todos]
aliviadores_vetados: [prova_de_terceiro, prova_por_volume]
trabalhos_fixos: [custo_de_adiar_sem_hora, remocao_de_risco]
permite_reataque: false
proibicoes:
  - repetir a tese do toque 1 no mesmo registro
  - prazo com hora fechada
  - aumentar ou sinalizar melhora do incentivo
  - depender de prova social — o assunto é decisão, não confiança
```

## welcome-3 — Convicção para o cético

```yaml
modo: quebra_de_objecao
n_objecoes: [1, 1]
fonte_das_objecoes: nao_atacadas
riscos_elegiveis: [desempenho, financeiro, psicologico]
profundidade_minima: mecanismo
aliviadores_admissiveis: [demonstracao_de_mecanismo, comparacao_de_categoria, transparencia_de_politica, garantia_de_devolucao]
veiculos_exigidos: [origem_da_marca, economia_do_preco, operacao_por_pedido]
trabalhos_fixos: [lembrete_de_incentivo_vivo, remocao_de_risco]
permite_reataque: true
dimensao_alvo: competencia
proibicoes:
  - urgência nova
  - aumentar o incentivo — não recompensar a espera
  - reapresentar a varredura do toque 2
  - esconder a saída rápida de quem já decidiu
```

> `permite_reataque: true` porque "sair da alegação e entrar no mecanismo"
> é reatacar a objeção do toque 1 um degrau acima (afirmação → mecanismo).
> O Seletor só aceita o reataque se a profundidade subir.

## welcome-4 — Inversão de voz: terceiros falam

```yaml
modo: confirmacao_por_terceiros
n_objecoes: [2, 3]
fonte_das_objecoes: ja_atacadas
profundidade_minima: prova_de_terceiro
aliviadores_admissiveis: [prova_de_terceiro, prova_por_volume]
trabalhos_fixos: [lembrete_de_incentivo_vivo, espelho_do_cetico]
permite_reataque: true
dimensao_alvo: competencia
proibicoes:
  - argumentar em voz de marca
  - empurrar catálogo
  - mexer no incentivo
  - pedir mais do que segundos de leitura
```

## welcome-5 — A razão competitiva

```yaml
modo: varredura_de_canal
n_objecoes: [3, 6]
fonte_das_objecoes: medos_de_categoria
riscos_elegiveis: [seguranca, tempo, psicologico, financeiro]
profundidade_minima: afirmacao
aliviadores_admissiveis: [transparencia_de_politica, reputacao_da_loja, seguranca_de_pagamento, garantia_de_devolucao, prova_por_volume]
trabalhos_fixos: [lembrete_de_incentivo_vivo]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - nomear concorrente específico — comparar contra a categoria
  - repetir o registro dos toques anteriores (tese, varredura, mecanismo, prova)
  - superlativo vazio
  - alegar o que a operação não sustenta — cada medo riscado é uma promessa
```

> Com `concorrente_nomeavel.existe: true` no catálogo, o Seletor registra
> em `suspeita_a_antecipar` — a proibição continua valendo até existir
> variante que aceite concorrente nomeado (observação da spec §2.2).

## welcome-6 — Fechar o ciclo da oferta

```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
profundidade_minima: prova_de_terceiro
trabalhos_fixos: [prazo_com_hora, prova_secundaria, remocao_de_risco]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - reargumentar ou reabrir deliberação
  - aumentar o incentivo
  - números de escassez sem lastro real
  - prazo que o toque seguinte não vá honrar
```

## welcome-7 — O sino

```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
trabalhos_fixos: [prazo_com_hora]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - qualquer argumento, prova, catálogo ou história
  - repetir escassez numérica do toque 6
  - existir em outro dia que não o do toque 6
  - mudar o incentivo ou o prazo
```

## welcome-8 — Epílogo humano: a exceção declarada

```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
trabalhos_fixos: [prazo_com_hora]
permite_reataque: false
dimensao_alvo: benevolencia
promessa_a_pagar: a extensão é única e definitiva — depois dela, nunca mais
proibicoes:
  - fingir que o prazo não venceu
  - estender duas vezes
  - aparato visual de campanha — a quebra de formato é o mecanismo
  - pedir desculpas pelo prazo
  - reargumentar
```

---

## As 26 restantes (fora deste doc)

`abandoned_cart` (8), `browse_abandonment` (5), `shipping_stages` (5),
`upsell` (4), `win_back` (3), `site_abandoned` (1) não têm intenção nem
referência no vault — autoria. Os 5 de `shipping_stages` nascem
`manutencao_de_confianca` com `promessa_a_pagar` e `dimensao_alvo:
benevolencia` (spec §1.4). Até lá, o Seletor grava `skipped`
(`sem_contrato`) para esses flows e nada muda.
