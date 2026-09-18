/**
 * raio-do-botao — o canto dos botões da peça, unificado por código.
 *
 * A R8 do guia diz que os botões têm o mesmo raio na peça inteira ([VAULT]
 * misturar raio alto com canto vivo "denuncia montagem"), e a alçada
 * respondia que não existe op de raio: divergência virava lacuna e ninguém
 * consertava. A peça de 17/09 saiu com `cta1` em 10px e `cta2` em 8px.
 *
 * Quem decide aqui é o CÓDIGO, não o modelo — mesma razão de `cor-do-botao`:
 * escolher entre 8 e 10 não tem julgamento nenhum, e uma volta de LLM para
 * isso é token gasto num empate. O raio que vale é o mesmo que o botão NOVO
 * já herda (`escalaDoBotao`), então a peça fica coerente entre o que estava
 * lá e o que o agente acrescentou.
 *
 * **O que este módulo NÃO faz, e o motivo.** Peça que mistura pílula com
 * canto vivo não é acabamento inconsistente: são duas decisões de forma, e
 * a mediana escolheria uma por sorteio — 8px numa pílula devolve outro
 * botão, não o mesmo botão mais bem-acabado. Aí ele se cala e registra
 * lacuna, que é onde um humano decide. A régua é a DISTÂNCIA entre o maior
 * e o menor: acima de `LIMITE_DE_ACABAMENTO` é desenho, abaixo é acabamento.
 *
 * Puro (zero I/O) — testável.
 */

import type { Cta } from "./color-faixas";

/**
 * Até quanto a divergência de raio é acabamento, e não decisão de forma.
 *
 * Oito pixels é o dobro do raio padrão da casa (`ESCALA_PADRAO.radiusPx`,
 * 4px): dentro disso os botões são o mesmo objeto mal acabado. Acima, são
 * objetos diferentes — e trocar um pelo outro é redesenhar.
 */
export const LIMITE_DE_ACABAMENTO = 8;

export interface TrocaDeRaio {
  /** O `id` do CTA em `extrairCtas` — o mesmo endereço que `set_botao` usa. */
  id: string;
  de: number;
  para: number;
}

export interface UnificacaoDeRaio {
  /** O raio que a peça inteira passa a ter. `null` = nada a fazer. */
  alvo: number | null;
  trocas: TrocaDeRaio[];
  /** Por que não unificou, quando não unificou. */
  lacuna: string | null;
}

/** Mediana que devolve um valor EXISTENTE — nunca a média de dois. */
function medianaInferior(ns: number[]): number {
  const ord = [...ns].sort((a, b) => a - b);
  return ord[Math.floor((ord.length - 1) / 2)];
}

/**
 * O raio único da peça e as trocas para chegar lá.
 *
 * Botão que não declara raio fica de FORA da conta e não é tocado: não
 * declarar é diferente de declarar outro valor, e escrever um raio onde não
 * havia nenhum acrescenta desenho em vez de conformar o que existe.
 *
 * Botão que só existe no ramo do Outlook também fica de fora, pelo mesmo
 * motivo que ele não conta como CTA presente em `plano-de-cor`: fora dali o
 * lugar está vazio, e alinhar o canto de um botão que quase ninguém vê ao
 * dos que todo mundo vê é ruído na telemetria.
 */
export function unificarRaio(ctas: Cta[]): UnificacaoDeRaio {
  const base = ctas.filter(
    (c) =>
      !c.somente_outlook && typeof c.radius_px === "number" && c.radius_px > 0,
  );
  const valores = base.map((c) => c.radius_px as number);
  const distintos = [...new Set(valores)];
  if (distintos.length < 2) return { alvo: null, trocas: [], lacuna: null };

  const menor = Math.min(...distintos);
  const maior = Math.max(...distintos);
  if (maior - menor > LIMITE_DE_ACABAMENTO) {
    return {
      alvo: null,
      trocas: [],
      lacuna: `R8 — a peça mistura raios de ${menor}px e ${maior}px. A distância é de FORMA (canto vivo × pílula), não de acabamento: unificar por código escolheria uma das duas no sorteio. Decisão humana.`,
    };
  }

  const alvo = medianaInferior(valores);
  const trocas = base
    .filter((c) => c.radius_px !== alvo)
    .map((c) => ({ id: c.id, de: c.radius_px as number, para: alvo }));
  return { alvo, trocas, lacuna: null };
}

/**
 * Reescreve o raio dentro de uma janela do documento.
 *
 * Só toca declaração SIMPLES (`border-radius:8px` seguida de fim de
 * declaração). O atalho de quatro valores (`border-radius:8px 8px 0 0`) fica
 * intacto de propósito: ele desenha um canto por vez, e trocar só o primeiro
 * número — que é o único que `extrairCtas` lê — devolveria um botão com três
 * cantos de um jeito e um de outro.
 *
 * O `arcsize` do VML acompanha, e é por isso que esta função existe em vez de
 * um `replace` no call site: o Outlook não lê `border-radius`, lê a
 * porcentagem do `v:roundrect` sobre a ALTURA dele. Mexer só no CSS deixa o
 * botão redondo em todo lugar menos num cliente, em silêncio — a mesma lição
 * que o par `bgcolor`/`background-color` do `set_botao` já custou.
 */
export function aplicarRaio(
  html: string,
  de: number,
  para: number,
  janela: { start: number; end: number },
  /**
   * Só o botão que TEM espelho VML tem `arcsize` para acertar.
   *
   * A janela olha 600 caracteres para trás — é o que alcança o `<td>`
   * ancestral e o `v:roundrect` do próprio botão —, e num documento denso
   * isso passa do botão anterior. Medido na peça de 17/09: `arcsize` de 13%,
   * 16% e **50%** convivem, então recalcular um roundrect que não é deste
   * botão transformaria a pílula do vizinho num canto reto, só no Outlook,
   * sem nada em tela dizendo. Botão sem VML não mexe em `arcsize` nenhum.
   */
  tocarVml = true,
): { html: string; trocados: number } {
  const start = Math.max(0, janela.start);
  const end = Math.min(html.length, janela.end);
  if (end <= start) return { html, trocados: 0 };

  let trocados = 0;
  let fatia = html.slice(start, end);

  fatia = fatia.replace(
    new RegExp(`border-radius\\s*:\\s*${de}px\\s*(?=[;"'}])`, "gi"),
    () => {
      trocados++;
      return `border-radius:${para}px`;
    },
  );

  if (tocarVml)
    fatia = fatia.replace(/<v:roundrect\b[^>]*>/gi, (tag) => {
      const altura = /height\s*:\s*(\d{1,4})px/i.exec(tag)?.[1];
      if (!altura || !/\barcsize\s*=\s*["']\d{1,3}%["']/i.test(tag)) return tag;
      // A conta do VML: o raio é uma fração da altura do retângulo. Sem a
      // altura declarada não há como converter, e chutar devolveria um canto
      // que não corresponde ao CSS — pior que deixar o antigo.
      const pct = Math.min(
        50,
        Math.max(0, Math.round((para / Number(altura)) * 100)),
      );
      trocados++;
      return tag.replace(
        /\barcsize\s*=\s*["']\d{1,3}%["']/i,
        `arcsize="${pct}%"`,
      );
    });

  return { html: html.slice(0, start) + fatia + html.slice(end), trocados };
}
