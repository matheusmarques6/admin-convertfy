/**
 * Confronto entre o número que publicamos e o que a Omnisend responde.
 *
 * Nasceu do relato de 10/09/2026 (Blue Wolf, agosto): o relatório saiu
 * com US$ 51,5 mil de receita atribuída e o painel mostrava
 * $51.176,38 — perto o bastante para parecer certo. Não havia como
 * responder "por que não bate" sem abrir o console: a memória de
 * cálculo (janela enviada, fuso usado, qual API respondeu cada metade)
 * não existia em lugar nenhum da tela.
 *
 * Este módulo é a régua da comparação. PURO — quem faz as chamadas é a
 * rota; aqui só entram números já medidos.
 */

/**
 * O que a métrica CONTA.
 *
 * Sem isto o painel formatava pedidos como dinheiro — "USD 2.267,00
 * pedidos" —, defeito que só apareceu ao renderizar a tela com os
 * números do caso real.
 */
export type Unidade = "moeda" | "contagem"

/** Uma métrica confrontada. */
export interface Divergencia {
  metrica: string
  unidade: Unidade
  /** O que publicamos. `null` = não temos o número. */
  nosso: number | null
  /** O que a plataforma respondeu agora. */
  plataforma: number | null
  diferenca: number | null
  /** Diferença relativa ao número da plataforma. `null` sem base. */
  diferencaPct: number | null
  /** `true` quando a diferença é grande o bastante para investigar. */
  relevante: boolean
}

/**
 * Fração a partir da qual a diferença deixa de ser ruído.
 *
 * 0,1% num mês de US$ 213 mil são ~US$ 213 — abaixo disso a explicação
 * mais provável é a própria plataforma ter reprocessado atribuição
 * entre as duas leituras, e apontar isso como defeito treinaria o
 * operador a ignorar o aviso.
 */
export const TOLERANCIA = 0.001

export function compararMetrica(
  metrica: string,
  nosso: number | null,
  plataforma: number | null,
  unidade: Unidade = "moeda",
): Divergencia {
  if (nosso === null || plataforma === null) {
    return {
      metrica,
      unidade,
      nosso,
      plataforma,
      diferenca: null,
      diferencaPct: null,
      relevante: false,
    }
  }
  const diferenca = arredondar(nosso - plataforma)
  // Sem base não existe percentual: com a plataforma em zero, qualquer
  // número nosso é "infinitamente" maior, e publicar isso como
  // porcentagem é pior que não publicar. A diferença absoluta decide.
  const diferencaPct = plataforma !== 0 ? diferenca / plataforma : null
  // Contagem não tem "quase igual": um pedido a mais é um pedido a
  // mais, e a tolerância existe para o centavo que a plataforma
  // reprocessa entre leituras.
  const relevante =
    unidade === "contagem"
      ? diferenca !== 0
      : diferencaPct !== null
        ? Math.abs(diferencaPct) > TOLERANCIA
        : Math.abs(diferenca) > 0.01
  return { metrica, unidade, nosso, plataforma, diferenca, diferencaPct, relevante }
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ContextoDaAuditoria {
  /** Fuso gravado em `client_stores.timezone`. */
  fusoDoCadastro: string | null
  /**
   * O fuso que REALMENTE cortou a janela.
   *
   * Não é o mesmo que o do cadastro: sem `timezone`, o sync cai no mapa
   * por país. A Blue Wolf (cadastro NULL, país 'US') teve a janela
   * cortada em America/New_York — comparar o CADASTRO com a conta diria
   * apenas "não tem fuso", escondendo qual corte de fato aconteceu.
   */
  fusoUsadoNaJanela?: string | null
  /** Fuso que a Omnisend informa em `/brands/current` — o do painel. */
  fusoDaBrand: string | null
  /** A receita atribuída veio calibrada pela Reports API? */
  atribuidoComparavelComOPainel: boolean
  /** Alguma etapa do sync degradou na rodada que gerou o nosso número. */
  houveDegradacao: boolean
}

/**
 * As causas prováveis, em ordem de quanto explicam.
 *
 * Não devolve "causa desconhecida" como se fosse diagnóstico: lista
 * vazia significa que nenhuma das causas conhecidas se aplica, e a
 * tela diz isso — o que é diferente de dizer que está tudo certo.
 */
export function causasProvaveis(
  divergencias: readonly Divergencia[],
  ctx: ContextoDaAuditoria,
): string[] {
  const causas: string[] = []
  if (!divergencias.some((d) => d.relevante)) return causas

  // 1. Fuso. É o que mais explica, porque desloca a janela inteira: o
  //    painel corta os dias no fuso da CONTA, e nós cortamos no fuso que
  //    resolvemos. Divergindo, comparamos recortes de tempo diferentes.
  //
  //    A comparação é com o fuso USADO, não com o cadastrado: é o usado
  //    que define o corte.
  const usado = (ctx.fusoUsadoNaJanela ?? ctx.fusoDoCadastro ?? "").trim()
  const daBrand = (ctx.fusoDaBrand ?? "").trim()
  if (daBrand && usado && daBrand !== usado) {
    const origem = ctx.fusoDoCadastro
      ? "O fuso do cadastro"
      : "A loja não tem fuso cadastrado, então a janela foi cortada num fuso assumido pelo país. Ele"
    causas.push(
      `${origem} (${usado}) não é o da conta na Omnisend (${daBrand}). ` +
        "A janela é cortada num fuso e o painel corta noutro — os dois recortes não " +
        'cobrem as mesmas horas. Use "Conferir com a plataforma" para gravar o fuso da conta.',
    )
  } else if (!ctx.fusoDoCadastro) {
    // Sem cadastro a janela é sempre um palpite, mesmo quando por acaso
    // coincide com a conta nesta leitura — o palpite vem do país, e o
    // país muda de significado no dia em que alguém o corrige.
    causas.push(
      "A loja não tem fuso cadastrado — a janela foi cortada num fuso assumido" +
        (usado ? ` (${usado})` : "") +
        ". " +
        (daBrand
          ? `A conta na Omnisend informa ${daBrand}. Use "Conferir com a plataforma" para gravá-lo.`
          : 'Use "Conferir com a plataforma" para trazer o fuso real da conta.'),
    )
  }

  // 2. Calibração. Sem a Reports API o atribuído sai por data do PEDIDO
  //    em vez de data de ENVIO, e fica acima do painel.
  if (!ctx.atribuidoComparavelComOPainel) {
    causas.push(
      "A receita atribuída não foi calibrada pela Reports API nesta rodada: ela saiu " +
        "agrupada pela data do pedido, e o painel agrupa pela data de envio. " +
        "Sincronizar de novo, fora do limite de consultas, costuma resolver.",
    )
  }

  if (ctx.houveDegradacao) {
    causas.push(
      "Alguma etapa do sync não respondeu na rodada que gerou estes números — " +
        "parte do valor pode ter vindo preservada do sync anterior.",
    )
  }

  return causas
}
