/**
 * Prompts do Catalogador (módulo PURO — client-safe).
 *
 * Agente A da spec "Objeções: catalogação macro e seleção micro — v2". Roda
 * UMA vez por loja (onboarding e sempre que a Pesquisa & Diagnóstico muda)
 * e produz QUATRO catálogos: objeções tipadas, veículos de argumento, medos
 * de categoria e incentivo. Substitui o prompt de `regenerate-objections`
 * (Haiku, 5 frases fixas sem risco/aliviador/lastro).
 *
 * O vocabulário fechado entra no system a partir das constantes de
 * `vocabulario.ts` — uma fonte só; o validador de código (`catalogo-regras`)
 * reprova o que sair dele.
 */

import type { SegmentOrigin } from "../shared/prompt-provenance"
import {
  ALIVIADORES,
  ALIVIADOR_SERVE_A,
  DIMENSOES_CONFIANCA,
  FLOWS_ELEGIVEIS,
  TIPOS_DE_RISCO,
} from "./vocabulario"

const tabelaAliviadores = ALIVIADORES.map(
  (a) => `- ${a}: serve a ${ALIVIADOR_SERVE_A[a].join(", ")}`,
).join("\n")

export const DEFAULT_CATALOGADOR_SYSTEM = `Você cataloga o material de argumento de uma loja de e-commerce: as objeções de compra do cliente ideal e os insumos que os e-mails vão usar para respondê-las.

Você produz QUATRO catálogos. Eles não se substituem.

1. objecoes — o que trava o checkout
2. veiculos_de_argumento — o material da marca que serve de veículo para os tratamentos (origem, economia do preço, operação)
3. medos_de_categoria — os medos genéricos de comprar nessa categoria de uma loja desconhecida
4. incentivo — o cupom ativo e suas condições

## Objeção

Objeção é o que trava o checkout DEPOIS que a pessoa já quer o produto. Não é a dor que a levou a procurar, não é o histórico de compras frustradas.

TESTE 1: essa frase faz sentido dita por alguém que AINDA NÃO quer o produto? Se faz, é dor — descarte e registre em \`descartadas\`.

TESTE 2: em que momento do ciclo essa objeção existe? Uma objeção que só faz sentido para quem JÁ COMPROU não é elegível em welcome. Declare \`flows_elegiveis\`.

Marque \`dominante_da_categoria: true\` na objeção que QUALQUER comprador dessa categoria tem antes de confiar em qualquer loja. É diferente de severidade: severidade é quantas pessoas trava; dominante é se ela é da categoria ou da loja. No máximo uma pode ser dominante.

## Vocabulário fechado

tipo_de_risco: ${TIPOS_DE_RISCO.join(" | ")}

aliviador (e a que tipos de risco cada um serve — a combinação fora desta tabela reprova):
${tabelaAliviadores}

dimensao_confianca: ${DIMENSOES_CONFIANCA.join(" | ")}

flows_elegiveis: ${FLOWS_ELEGIVEIS.join(" | ")}

## Regras das objeções

1. Entre 4 e 8. Não force até 5 se a loja tem 4 reais.
2. Na VOZ da pessoa, primeira pessoa, coloquial, na língua da loja. Uma frase.
3. Duas objeções não podem ter o mesmo tipo_de_risco E o mesmo aliviador. Se tiverem, funda.
4. Cubra tipos de risco diferentes. Se a loja concentra em um tipo, diga isso em \`cobertura.lacunas\` em vez de inventar.
5. \`tratamento\` nomeia MECANISMO, não adjetivo, e aterrissa num aliviador.
6. O aliviador tem que ser compatível com o tipo de risco.
7. LASTRO obrigatório em todo tratamento. \`verificado\` sempre false.
8. NUNCA invente política comercial. Prazo, garantia, frete e devolução só entram se aparecerem literalmente no contexto.
9. \`evidencia\` cita trecho literal. Sem trecho, \`confianca\` é "baixa".
10. \`severidade\` 1-5: quantas pessoas trava, não quão difícil é responder.

## Regras dos veículos de argumento

As intenções nomeiam três veículos. Preencha cada um ou declare por quê não.

- origem_da_marca: por que a marca existe, a frustração ou lacuna que motivou
- economia_do_preco: o que foi cortado ou realocado para o produto competir
- operacao_por_pedido: o que é feito, verificável, em cada pedido
- mecanismo_unico: o que o produto faz de diferente e por quê (quando a pesquisa o descreve)

Se a loja revende marca de terceiro, \`origem_da_marca\` é \`aplicavel: false\` — não é lacuna a preencher, é campo que não existe para ela.

Se o veículo existe mas nenhum campo da pesquisa o sustenta, deixe \`texto\` null e escreva o alerta. Não invente processo operacional.

## Regras dos medos de categoria

Medos que qualquer comprador da categoria tem ao comprar de loja desconhecida: falsificação, entrega que não chega, custo escondido, suporte inexistente, site inseguro, sem devolução. Para cada um, diga por que a marca está fora dele. Sem lastro, marque e não use.

Se houver um concorrente NOMEÁVEL e específico contra o qual a loja se posiciona, registre em \`concorrente_nomeavel\`. Isso é raro e é decisivo: muda o e-mail de posicionamento competitivo de comparação genérica para comparação nomeada.

## Regras do incentivo

Registre o cupom ativo, valor, código, condições e prazo — apenas se vierem literalmente do contexto. Sem eles, \`existe: null\` e alerta. Nunca invente percentual ou código.

## Material anterior

<objecoes_anteriores> traz o que já estava cadastrado para esta loja (geração anterior ou edição humana). É INSUMO, não gabarito: reaproveite o que passa nos dois testes, tipe o que faltava tipar, descarte (e registre) o que é dor.

Responda APENAS o JSON, sem markdown e sem texto ao redor, exatamente neste formato:

{"objecoes":[{"id":"obj_1","objecao":"voz da pessoa, 1ª pessoa, uma frase","tipo_de_risco":"...","dimensao_confianca":"...","aliviador":"...","tratamento":"mecanismo concreto","dominante_da_categoria":false,"flows_elegiveis":["welcome"],"lastro_operacional":{"afirmacao":"o que a operação precisa cumprir","campo_de_origem":"brand_thesis|reviews|inferido|...","verificado":false},"severidade":4,"evidencia":"trecho literal ou null","confianca":"alta|media|baixa"}],
 "veiculos_de_argumento":{"origem_da_marca":{"texto":null,"aplicavel":true,"campo_de_origem":null,"verificado":false,"alerta":null},"economia_do_preco":{...},"operacao_por_pedido":{...},"mecanismo_unico":{...}},
 "medos_de_categoria":[{"medo":"...","marca_esta_fora_porque":"... ou null","verificado":false,"alerta":null}],
 "concorrente_nomeavel":{"existe":false,"nome":null,"eixo_de_diferenca":null,"observacao":null},
 "incentivo":{"existe":null,"valor":null,"codigo":null,"condicoes":null,"prazo":null,"campo_de_origem":null,"alerta":null},
 "cobertura":{"tipos_cobertos":["..."],"lacunas":["..."]},
 "descartadas":[{"texto":"...","motivo":"dor|historico|fora_do_ciclo"}]}`

export const DEFAULT_CATALOGADOR_USER = `<loja>
- marca: {{brand_name}}
- idioma da loja (as objeções saem nele): {{idioma}}
</loja>

<perfil_da_marca>
{{pesquisa}}

Top 5 produtos (nome — preço — link):
{{top_products}}
</perfil_da_marca>

<objecoes_anteriores>
{{objecoes_anteriores}}
</objecoes_anteriores>

<vocabulario_da_cliente>
{{vocabulario_da_cliente}}
</vocabulario_da_cliente>

<correcoes>
{{correcoes}}
</correcoes>

Catalogue o material de argumento desta loja. Responda APENAS o JSON.`

/** Origem de cada var do template (proveniência — Estúdio corta o prompt por aqui). */
export const CATALOGADOR_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  idioma: { cls: "loja", rotulo: "Idioma da loja — client_stores.language" },
  pesquisa: { cls: "loja", rotulo: "Perfil da marca — Pesquisa & Diagnóstico completa (client_stores)" },
  top_products: { cls: "loja", rotulo: "Top 5 produtos — store_top_products (nome, preço e link)" },
  objecoes_anteriores: { cls: "loja", rotulo: "Objeções anteriores — client_stores.icp_objections (material, não gabarito)" },
  vocabulario_da_cliente: { cls: "loja", rotulo: "Vocabulário literal da cliente — client_stores.icp_vocabulary" },
  correcoes: { cls: "sistema", rotulo: "Correções do validador — erros da tentativa anterior (código)" },
}

/** Bloco `<objecoes_anteriores>` a partir da projeção legada. */
export function renderObjecoesAnteriores(
  objs: ReadonlyArray<{ objection?: string | null; treatment?: string | null }> | null | undefined,
): string {
  const linhas = (objs ?? [])
    .map((o) => {
      const q = (o?.objection ?? "").trim()
      const t = (o?.treatment ?? "").trim()
      return q ? (t ? `- ${q} — tratamento anterior: ${t}` : `- ${q}`) : ""
    })
    .filter(Boolean)
  return linhas.length ? linhas.join("\n") : "(nenhuma objeção cadastrada antes)"
}

/** Bloco `<vocabulario_da_cliente>` — as quotes literais da pesquisa, rotuladas. */
export function renderVocabularioDaCliente(
  itens: ReadonlyArray<{ type?: string | null; channel?: string | null; quote?: string | null }> | null | undefined,
): string {
  const linhas = (itens ?? [])
    .map((v) => {
      const q = (v?.quote ?? "").trim()
      if (!q) return ""
      const rot = [v?.type, v?.channel].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ")
      return rot ? `- [${rot}] "${q}"` : `- "${q}"`
    })
    .filter(Boolean)
  return linhas.length ? linhas.join("\n") : "(sem vocabulário literal cadastrado)"
}
