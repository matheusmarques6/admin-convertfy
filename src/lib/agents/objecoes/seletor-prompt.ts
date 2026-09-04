/**
 * Prompts do Seletor (módulo PURO — client-safe).
 *
 * Agente C da spec "Objeções: catalogação macro e seleção micro — v2". Roda
 * por email, a cada geração, ANTES do Estruturador: escolhe o que este
 * e-mail vai atacar, para esta loja, neste toque. Não escreve copy, não
 * escolhe bloco, não decide ordem — declara o ALVO contra o qual os agentes
 * seguintes trabalham.
 */

import type { SegmentOrigin } from "../shared/prompt-provenance"
import { objecoesElegiveisNoFlow } from "./catalogo-regras"
import type { IntentContract } from "./intent-contract"
import {
  ALIVIADORES,
  MODOS,
  PROFUNDIDADES,
  TRABALHOS_FIXOS,
  type CatalogoDeObjecoes,
  type JaAtacada,
} from "./vocabulario"

export const DEFAULT_SELETOR_SYSTEM = `Você escolhe o que este e-mail vai atacar, para esta loja, neste toque.

Você não escreve copy, não escolhe bloco e não decide ordem. Você declara o alvo contra o qual os agentes seguintes vão trabalhar.

## Modo

O modo vem da intenção do toque (<contrato_do_toque>). Nunca da sua opinião.

- quebra_de_objecao: uma objeção primária.
- varredura_de_objecoes: várias objeções curtas de naturezas diferentes, porque não se sabe qual travou.
- confirmacao_por_terceiros: seleção INVERTIDA — você escolhe entre as objeções JÁ ATACADAS (<ja_atacadas>), para que voz de cliente confirme o que a marca já disse. Não abre objeção nova.
- varredura_de_canal: o alvo não está em \`objecoes\`, está em \`medos_de_categoria\`. A pergunta é "por que aqui e não em outro lugar". Devolva os medos em \`medos_alvo\`.
- fechamento_de_ciclo: nenhuma objeção. O assunto é tempo e prazo.
- manutencao_de_confianca: nenhuma objeção. O trabalho é PAGAR uma promessa feita antes. Preencha \`promessa_a_pagar\`.

Modos: ${MODOS.join(" | ")}. Além do modo, a intenção pode declarar \`trabalhos_fixos\` — obrigações que convivem com a seleção (${TRABALHOS_FIXOS.join(", ")}). Cumpra todos e repita-os no output.

## Regras de seleção

1. QUANTIDADE. Respeite \`n_objecoes\` do contrato. Uma primária por padrão; varredura abre para o número pedido. Nunca decida por conta própria empilhar duas.

2. ELEGIBILIDADE DUPLA. A objeção precisa ter o flow atual em \`flows_elegiveis\` E o tipo_de_risco em \`riscos_elegiveis\` do contrato. <catalogo_da_loja> já lista só as elegíveis pelo flow; a segunda metade é sua. Se nenhuma passa nas duas, declare lacuna. Não relaxe nenhuma das duas.

3. DOMINANTE. Se o contrato pede a objeção dominante da categoria (\`exige_dominante_da_categoria\`), use a que está \`dominante_da_categoria: true\`. Severidade não substitui esse critério.

4. NÃO REPETIR. Objeção em <ja_atacadas> só volta se o contrato tiver \`permite_reataque: true\` E a profundidade subir pelo menos um degrau. Exceção: no modo confirmacao_por_terceiros, repetir é o trabalho — mas sempre subindo para prova_de_terceiro.

5. PROFUNDIDADE. ${PROFUNDIDADES.join(" → ")}. Nunca desce dentro do mesmo flow para a mesma objeção. Respeite o piso \`profundidade_minima\`.

6. VEÍCULO. Se o contrato exige veículos (\`veiculos_exigidos\`), liste cada um em \`angulo_do_tratamento\` com \`insumo_disponivel\`: true, "parcial" ou false. Veículo com \`aplicavel: false\` no catálogo não vira lacuna nem alerta — sai da lista em silêncio. Veículo aplicável e vazio entra com \`insumo_disponivel: false\`.

7. LASTRO. Tratamento com \`verificado: false\` não pode ser promessa dura. Em ordem: (a) escolha outra objeção elegível com lastro; (b) mantenha, rebaixe a profundidade e preencha \`alerta_de_lastro\`. Nunca prometa prazo, garantia ou frete não verificados.

8. INTENÇÃO ALTA VENCE ARGUMENTO. Se o flow indica intenção alta (carrinho abandonado, checkout iniciado), prefira a objeção de menor esforço de leitura e o aliviador mais operacional. Quem chegou perto do fim não precisa ser convencido de novo.

9. SEVERIDADE desempata entre elegíveis igualmente adequadas.

10. LACUNA. Se nada sobrevive, devolva \`lacuna\` preenchida (motivo + detalhe). Lacuna declarada vale mais que alvo inventado: ela diz o que falta catalogar nesta loja.

11. ALIVIADOR é vocabulário fechado (${ALIVIADORES.join(", ")}): \`aliviador_pedido\` é o do catálogo para aquela objeção — não troque por um "equivalente". Só \`aliviadores_admissiveis\` do contrato podem entrar; os vetados nunca.

12. PROIBIÇÕES. \`proibido_neste_toque\` reúne as proibições do contrato (repita-as) mais as que a sua escolha cria (ex.: escolheu garantia → "não prometer prazo de devolução que a política não cita").

Responda APENAS o JSON, sem markdown e sem texto ao redor, no formato:

{"modo":"...","trabalhos_fixos":["..."],
 "alvos":[{"ordem":1,"primaria":true,"id":"obj_3","objecao":"texto literal do catálogo","tipo_de_risco":"...","tratamento":"texto literal do catálogo","aliviador_pedido":"...","profundidade_de_prova":"afirmacao|mecanismo|prova_de_terceiro|garantia"}],
 "medos_alvo":["..."],
 "promessa_a_pagar":null,
 "criterio_de_selecao":"por que estas e não outras",
 "dimensao_confianca":"competencia|integridade|benevolencia",
 "angulo_do_tratamento":[{"ordem":1,"veiculo":"origem_da_marca","papel":"por que a marca existe","insumo_disponivel":true}],
 "suspeita_a_antecipar":"string ou null",
 "proibido_neste_toque":["..."],
 "alerta_de_lastro":null,
 "razao":"uma frase",
 "lacuna":null}`

export const DEFAULT_SELETOR_USER = `<loja>
- marca: {{brand_name}}
- flow: {{flow_type}} — email #{{email_number}}
</loja>

<contrato_do_toque>
{{contrato_do_toque}}
</contrato_do_toque>

<intencao_do_toque>
{{intencao_do_toque}}
</intencao_do_toque>

<catalogo_da_loja>
{{catalogo_da_loja}}
</catalogo_da_loja>

<ja_atacadas>
{{ja_atacadas}}
</ja_atacadas>

<oferta_e_produtos>
{{oferta_e_produtos}}
</oferta_e_produtos>

<correcoes>
{{correcoes}}
</correcoes>

Declare o alvo deste e-mail. Responda APENAS o JSON.`

export const SELETOR_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  flow_type: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  email_number: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  contrato_do_toque: { cls: "vault", rotulo: "Contrato tipado da intenção — email_intents.frontmatter" },
  intencao_do_toque: { cls: "vault", rotulo: "Intenção DESTE email — email_intents (body)" },
  catalogo_da_loja: { cls: "loja", rotulo: "Catálogo de argumento — client_stores.objection_catalog (Catalogador)" },
  ja_atacadas: { cls: "upstream", rotulo: "O que os emails anteriores do flow já atacaram — store_email_objection_targets" },
  oferta_e_produtos: { cls: "loja", rotulo: "Top 5 produtos + incentivo — store_top_products / catálogo" },
  correcoes: { cls: "sistema", rotulo: "Correções do validador — erros da tentativa anterior (código)" },
}

/** `<catalogo_da_loja>`: só as objeções elegíveis no flow + os outros três catálogos. */
export function renderCatalogoParaSeletor(c: CatalogoDeObjecoes, flowType: string): string {
  const eleg = objecoesElegiveisNoFlow(c, flowType)
  const linhas: string[] = []
  linhas.push(`[objeções elegíveis em ${flowType}: ${eleg.length} de ${c.objecoes.length}]`)
  if (eleg.length === 0) linhas.push("(nenhuma objeção do catálogo declara este flow em flows_elegiveis)")
  for (const o of eleg) {
    linhas.push(
      `- ${o.id} · risco=${o.tipo_de_risco ?? "?"} · aliviador=${o.aliviador ?? "?"} · dimensao=${o.dimensao_confianca ?? "?"} · severidade=${o.severidade}` +
        `${o.dominante_da_categoria ? " · DOMINANTE DA CATEGORIA" : ""} · lastro ${o.lastro_operacional.verificado ? "verificado" : "NÃO verificado"}` +
        `\n  objeção: "${o.objecao}"\n  tratamento: ${o.tratamento}` +
        (o.lastro_operacional.afirmacao ? `\n  lastro: ${o.lastro_operacional.afirmacao}` : ""),
    )
  }
  linhas.push("", "[veículos de argumento]")
  for (const [k, v] of Object.entries(c.veiculos_de_argumento)) {
    if (!v.aplicavel) linhas.push(`- ${k}: NÃO SE APLICA a esta loja (sai em silêncio)`)
    else if (v.texto) linhas.push(`- ${k}: ${v.texto}${v.verificado ? "" : " (não verificado)"}`)
    else linhas.push(`- ${k}: SEM INSUMO${v.alerta ? ` — ${v.alerta}` : ""}`)
  }
  linhas.push("", "[medos de categoria]")
  if (c.medos_de_categoria.length === 0) linhas.push("(nenhum)")
  for (const m of c.medos_de_categoria) {
    linhas.push(`- ${m.medo}: ${m.marca_esta_fora_porque ? `fora porque ${m.marca_esta_fora_porque}` : `SEM LASTRO${m.alerta ? ` — ${m.alerta}` : ""}`}`)
  }
  if (c.concorrente_nomeavel.existe) {
    linhas.push("", `[concorrente nomeável] ${c.concorrente_nomeavel.nome ?? ""} — ${c.concorrente_nomeavel.eixo_de_diferenca ?? ""}`)
  }
  if (c.cobertura.lacunas.length) linhas.push("", `[lacunas do catálogo] ${c.cobertura.lacunas.join(" · ")}`)
  return linhas.join("\n")
}

/** `<oferta_e_produtos>`: incentivo do catálogo + top produtos já renderizados. */
export function renderOfertaEProdutos(c: CatalogoDeObjecoes, topProductsTexto: string): string {
  const inc = c.incentivo
  const incentivo =
    inc.existe === true
      ? `incentivo ativo: ${[inc.valor, inc.codigo ? `código ${inc.codigo}` : null, inc.condicoes, inc.prazo].filter(Boolean).join(" · ")}`
      : inc.existe === false
        ? "sem incentivo ativo"
        : `incentivo não identificado na pesquisa${inc.alerta ? ` — ${inc.alerta}` : ""}`
  return `${incentivo}\n\nTop produtos (nome — preço — link):\n${topProductsTexto}`
}

/** `<ja_atacadas>` a partir dos alvos dos irmãos anteriores. */
export function renderJaAtacadas(itens: readonly JaAtacada[]): string {
  if (itens.length === 0) return "(nenhuma — este é o primeiro toque com alvo neste flow)"
  return itens
    .map((j) => `- ${j.id} · email #${j.email_number} · profundidade=${j.profundidade} · via=${j.via}`)
    .join("\n")
}

/** `<contrato_do_toque>` — delega ao renderer do contrato (mantido aqui para o call site ter uma porta só). */
export function renderContrato(c: IntentContract, render: (c: IntentContract) => string): string {
  return render(c)
}
