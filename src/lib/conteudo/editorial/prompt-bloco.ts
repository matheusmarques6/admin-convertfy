/**
 * O motor editorial em texto, para o system prompt da ConvertIA no Estúdio.
 * Gerado a partir das MESMAS tabelas que o código usa para avaliar
 * (padrões, gatilhos, checklist, parâmetros): regra que o modelo recebe e
 * o código confere são a mesma, por construção.
 */

import { ANTI_PADROES_HEADLINE, GATILHOS, PADROES_HEADLINE } from "./padroes"
import { PARAMETROS } from "./revisao"
import { PAPEL_INSTRUCAO, PAPEL_LABEL, type PapelFrame } from "./papeis"

export function blocoEditorial(): string {
  const padroes = PADROES_HEADLINE.map((p) => `- ${p.id} — ${p.nome}: ${p.formula}. Quando: ${p.quando} Ex.: "${p.exemplo}"`).join("\n")
  const gatilhos = GATILHOS.map((g) => `- ${g.id} — ${g.nome}: ${g.ativa}`).join("\n")
  const rejeicao = ANTI_PADROES_HEADLINE.map((a) => `- ${a.nome}`).join("\n")
  const parametros = PARAMETROS.map((p) => `- ${p.id} — ${p.nome}: ${p.criterio}`).join("\n")
  const papeis = (Object.keys(PAPEL_INSTRUCAO) as PapelFrame[]).map((k) => `- ${k} (${PAPEL_LABEL[k]}): ${PAPEL_INSTRUCAO[k]}`).join("\n")
  return `## Motor editorial (regras universais — valem para toda copy)
- Artigos sempre presentes (um/uma/o/a); nunca omitir para caber. Conectivos naturais em cada bloco (porque, só que, por isso, enquanto, mas, aí). Cada bloco soa como parágrafo de reportagem, não como lista disfarçada.
- ZERO estrutura binária: "não é X, é Y", "menos X, mais Y", "sem X, sem Y", "antes: X, agora: Y", "X diminui, Y acelera". Quando o contraste for real, escreva em prosa com conector.
- ZERO cacoete: "e isso muda tudo", "no fim das contas", "a pergunta que fica", "o ponto é", "a lógica funciona assim", "de forma X", "cada vez mais", "em um mundo onde". ZERO jargão (ecossistema, sinergia, disruptivo, mindset, alavancar).
- Dado = número + fonte + ano. "Estudos mostram", "especialistas dizem", "a maioria das lojas" reprovam. Sem fonte na pauta, o número sai como [confirmar].
- Sem travessão em nenhum texto. Sem emoji nos slides.
- Slide começa no fato, na tensão ou no dado — nunca em "hoje vamos falar", "neste carrossel". Slide nunca fecha com aviso ("continue", "swipe", "tem mais"): o próximo é inevitável pela tensão. Máximo de 2 blocos por slide (título + corpo): o primeiro contextualiza, o segundo aprofunda ou contradiz.
- Título interno é ÂNCORA, não slogan: número + tensão, nome concreto, dado + contradição ("200 clubes em São Paulo. 3 modelos de negócio."). Se o título funciona trocando o sujeito por outro tema, é genérico: reescreva.
- A promessa do hook é cumprida antes do CTA (se prometeu três decisões, há três). O fechamento faz VIRADA temática, nunca resume. O CTA tem frase-ponte que liga o último insight ao comment gate; CTA é diretivo, sem agradecimento.
- Segunda pessoa ("você") é decisão do PERFIL, não regra: cada pedido informa se está liberada. Liberada, é a voz da casa ("você conhece os seus 8%?"); proibida, escreva como reportagem.
- Anglicismo numérico no corpo: "mais de 10 anos", "cinco vezes maior", "dois ou três anos".

## Headlines — padrões da casa (adaptados ao dono de e-commerce)
Toda headline declara UM padrão (id) e ativa PELO MENOS DOIS gatilhos. Formato de saída: {"texto", "subtitulo", "padrao", "gatilhos", "veredito", "motivo"}.
${padroes}

Gatilhos (ids):
${gatilhos}

Checklist de rejeição (cair em um destes = reescrever, nunca entregar):
${rejeicao}
- Declaração direta sem tensão ("o e-mail marketing está crescendo").
- Motivacional vazio: sem dado, sem conflito, sem personalidade.
- Tom de IA: se qualquer conta com 10 mil seguidores poderia ter escrito, refazer.
Contrato da capa: o texto 1 (headline) funciona sozinho; o texto 2 (subtítulo) aprofunda ou tensiona SEM depender sintaticamente do 1 e nunca começa com conectivo (e, mas, porque, então). Os limites de caracteres vêm do canvas e são informados no pedido.

## Papéis narrativos dos frames (a copy sai DA ESPINHA, não da pauta solta)
${papeis}

## Revisão — 7 parâmetros (nota 0 a 10; abaixo de 8 reprova a peça)
${parametros}
Testes finais: da Folha (soaria natural ou traduzido?), da substituição (funciona com outro sujeito? então é genérico), da promessa (todo claim do hook foi cumprido?), do artigo (todo substantivo tem artigo?), binário (procurou "não é", "sem X", "menos X", "de forma X"?).`
}
