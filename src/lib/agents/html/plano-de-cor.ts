/**
 * plano-de-cor — o que o agente Cores & Botões devolve, e como isso vira op.
 *
 * O agente não emite ops: ele devolve um PLANO (o ritmo das faixas, a cor de
 * cada botão, os botões que faltam, as trocas de valor) e este módulo o
 * traduz. É a regra da casa — o modelo devolve intenção, só código escreve
 * no HTML —, e aqui ela compra três coisas concretas:
 *
 * 1. **URL nunca é digitada por modelo.** O plano escolhe um `destino` de um
 *    enum fechado e o código resolve o endereço. Texto de botão errado é
 *    feio e corrigível; link para lugar nenhum não.
 * 2. **A oferta é verificada contra o FATO.** Um label que promete desconto
 *    numa loja sem incentivo confirmado, ou com percentual diferente do que
 *    a peça carrega, não vira botão — vira lacuna. A régua é a mesma do
 *    `oferta_sem_incentivo` que o QA já aplica ao documento, adiantada para
 *    antes do botão existir.
 * 3. **Endereço inválido é descartado com motivo**, nunca aplicado no lugar
 *    mais próximo — o tratamento que `invalid_ids` recebe no Curador.
 *
 * Puro (zero I/O) — testável.
 */

import type { FormatOp } from "./apply-patches"
import { type Cta, type Faixa, mesmoTom, TETO_DE_TONS, tonsDeFundo } from "./color-faixas"
import { formaPorId } from "./separador-catalogo"
import { tintaDoOrnamento } from "./separador-tinta"
import { corDoBotao, type PapeisParaBotao } from "./cor-do-botao"
import type { InventarioDeCta } from "./cta-inventario"
import { escalaDoBotao } from "./escala-do-botao"
import { unificarRaio } from "./raio-do-botao"
import { canonicalHex, type ColorContext, isColorContext, isColorLiteral } from "./color-inventory"

/**
 * O teto do ritmo mudou de eixo (18/09): do ESFORÇO para o RESULTADO.
 *
 * Era `TETO_DE_FAIXAS = 2` — no máximo duas faixas repintadas por peça.
 * Medido na run `794b8ae1` (Innova Bay, 17/09), o custo disso: a peça tem
 * SEIS seções, cinco delas saíram brancas, e a única troca foi
 * conformidade (`#000000`, fora da paleta, virou o verde da marca). Das
 * duas vagas, uma vai para conformidade e sobra UMA para compor o ritmo de
 * seis seções — e compor é decidir todas.
 *
 * Contar trocas é limitar a coisa errada: contém o plano ruim e o bom
 * igualmente. O que precisa de teto é o resultado — quantas cores
 * distintas a peça acaba tendo e de onde elas vêm —, e essa régua já
 * existia, já era servida a ele no prompt e já era medida na telemetria:
 * `tonsDeFundo` (`color-faixas.ts`), teto de {@link TETO_DE_TONS} e a
 * lista de `estranhos`. Só não descartava nada.
 *
 * Agora descarta, e a conta é feita sobre a peça como ela FICARIA depois
 * das trocas já aceitas — as excedentes caem na ordem, com motivo. Sobra
 * um teto de segurança no número de trocas, mas pelo motivo certo: o
 * número de faixas da peça. Ele pode decidir todas, não mais que todas.
 */
export const TETO_DE_FAIXAS_DE_SEGURANCA = (faixas: number) => Math.max(1, faixas)

/**
 * Os verbos que uma decisão de faixa pode usar.
 *
 * `decisao` era string livre e a única leitura era `=== "manter"` — o resto
 * do valor nunca foi olhado por ninguém. Medido em 30 dias de produção, o
 * modelo devolveu `"manter cor mas remapear"`: não é `manter`, portanto
 * emite a troca (o que estava certo), mas também não é verbo nenhum do
 * contrato, e toda contagem de "quantas faixas ele quis mexer" passou a
 * medir prosa.
 *
 * O vocabulário fechado não DESCARTA a decisão — quem manda é o campo
 * `fundo`, que é dado. Verbo fora da lista vira registro em `ajustes`, e a
 * troca segue: perder uma troca boa por causa da palavra escolhida seria
 * caro, e o teto de TONS já limita o estrago de um plano ruim.
 */
export const DECISOES_DE_FAIXA = ["manter", "escurecer", "clarear", "recolorir"] as const
export type VerboDeFaixa = (typeof DECISOES_DE_FAIXA)[number]

/**
 * O verbo, comparável.
 *
 * Caixa e pontuação final não podem decidir se uma faixa muda de cor:
 * `"Manter"` e `"manter."` são a mesma intenção que `"manter"`, e com a
 * comparação crua de antes as duas escapavam do veto e viravam `set_fundo`
 * para a cor que a faixa já tinha — uma op que não muda um pixel.
 */
export function verboDaFaixa(decisao: string | undefined): string {
  return (decisao ?? "").trim().toLowerCase().replace(/[.!;,\s]+$/, "")
}

/** Onde um botão novo pode apontar. Enum fechado: o modelo não digita URL. */
export const DESTINOS = ["produto_do_bloco", "cta_principal", "loja"] as const
export type Destino = (typeof DESTINOS)[number]

export interface DecisaoDeFaixa {
  ordem: number
  decisao?: string
  fundo?: string
  /**
   * As paradas do gradiente da faixa, na ordem, quando ela tem um (17/09).
   *
   * É decisão SEPARADA de `fundo`: a cor sólida é o fallback, o gradiente é
   * o que o leitor vê. Na Innova Bay o agente trocou o fundo para a cor da
   * loja, a op foi aplicada, e a tela continuou preto → cinza — porque
   * ninguém tinha como pedir a troca das paradas.
   *
   * Tem de vir com o MESMO número de paradas que a faixa reportou: o agente
   * decide as cores, não quantas elas são. Mudar a contagem é redesenhar o
   * gradiente, e isso é a lacuna R4 que segue fora da alçada dele.
   */
  gradiente?: string[]
  porque?: string
}

export interface DecisaoDeBotao {
  id: string
  fundo?: string
  label?: string
  tipo?: string
  porque?: string
}

export interface BotaoQueFalta {
  bloco: number
  label: string
  destino: Destino
  fundo: string
  cor_label: string
  porque?: string
}

export interface DecisaoDeValor {
  de: string
  para: string
  onde?: string
  porque?: string
}

/**
 * Quantas separações uma peça pode receber.
 *
 * Três é o que separa um ritmo de um padrão: acima disso a peça vira uma
 * sequência de ornamentos e a separação deixa de dizer "aqui começa outro
 * assunto" — passa a ser moldura, que é decoração.
 */
export const TETO_DE_SEPARACOES = 3

/** Uma separação entre duas seções vizinhas. */
export interface DecisaoDeSeparacao {
  /** A `ordem` da faixa de CIMA. A separação entra no fim dela. */
  depois_da_faixa: number
  /** O `id` de uma forma do catálogo. */
  forma: string
  /**
   * Só nas formas que NÃO escondem emenda: a cor do ornamento. Preferência,
   * não decisão — o código confere o contraste contra o fundo e corrige.
   * Nas de emenda o campo é ignorado: ali as duas cores são os fundos das
   * faixas, e deixá-lo decidir uma delas desenharia um degrau falso.
   */
  tinta?: string | null
  porque?: string
}

export interface PlanoDeCor {
  paleta_eixo?: string
  tokens?: Record<string, string>
  faixas?: DecisaoDeFaixa[]
  botoes?: DecisaoDeBotao[]
  adicionar?: BotaoQueFalta[]
  valores?: DecisaoDeValor[]
  separacoes?: DecisaoDeSeparacao[]
  rodape?: string
  lacunas?: string[]
}

/** O que a peça de fato carrega de oferta — o fato contra o qual se mede. */
export interface IncentivoDaPeca {
  /** `true` é a única confirmação aceita; `false` e `null` bloqueiam igual. */
  existe: boolean | null
  codigo?: string | null
  percentual?: number | null
}

export interface ContextoDoPlano {
  faixas: Faixa[]
  ctas: Cta[]
  incentivo: IncentivoDaPeca
  /** Home da loja — o destino que sempre existe. */
  urlLoja?: string | null
  /** Link do produto de cada bloco, quando o bloco mostra produto. */
  urlPorBloco?: Record<number, string>
  /** Fonte da peça, para o botão novo não estrear uma família. */
  fontFamily?: string | null
  /**
   * Passo 14: o botão de cada bloco pelo CONTRATO (`cta-inventario.ts`).
   * Com ele, `adicionar` só é traduzida quando o contrato diz que o bloco
   * NÃO tem CTA — a heurística `ctas` vira verificação secundária. Ausente
   * → só a heurística decide (comportamento anterior).
   */
  inventario?: ReadonlyArray<InventarioDeCta> | null
  /**
   * Passo 14: `requisitos.cta` da decisão, por bloco. `false` nega o botão
   * naquela posição; `true`/`null` deixam a inserção seguir. Ausente → não
   * há decisão (Estruturador desligado) e nada é negado por aqui.
   */
  requisitosCta?: Readonly<Record<number, boolean | null | undefined>> | null
  /**
   * Passo 14: papéis da paleta. Com eles a COR do botão inserido ou
   * recolorido é decidida por código contra o fundo real da faixa
   * (`corDoBotao`) — o agente decide que o botão existe e o que diz; a
   * cor não é dele. Ausente → a cor pedida entra como veio (legado).
   */
  roles?: PapeisParaBotao | null
  /**
   * Os fundos que a peça pode usar: a paleta cadastrada da loja MAIS os
   * papéis derivados dela por luminância (`bg`, `surface`, `surface_strong`).
   *
   * É a MESMA lista que `fundosLegitimos` monta para o `tons_json` do
   * prompt — de propósito: a régua que o código cobra tem de ser a que o
   * agente leu. Duas listas divergiriam no primeiro ajuste, e o sintoma
   * seria uma troca que ele justificou pela paleta sendo descartada por
   * não estar nela.
   *
   * Ausente ou vazia = a loja não tem paleta cadastrada. Aí nada é acusado
   * de estranho (sem identidade não há de onde um fundo divergir) e só o
   * teto de TONS continua valendo.
   */
  fundosAceitos?: readonly string[] | null
}

export interface AjusteDeCor {
  o_que: string
  de: string
  para: string
  motivo: string
}

export interface Descarte {
  /** O que foi descartado, em uma linha. */
  o_que: string
  motivo: string
}

export interface TraducaoDoPlano {
  ops: FormatOp[]
  descartes: Descarte[]
  /** Cores de botão que o código trocou (Passo 14). Vazio sem `roles`. */
  ajustes: AjusteDeCor[]
}

const OFERTA_NO_LABEL =
  /\b\d{1,3}\s?%\s?(?:off|de desconto|discount)?\b|\bdesconto\b|\bcupom\b|\bcoupon\b|\boff\b|\bpromo\b/i
const PERCENTUAL = /(\d{1,3})\s?%/
const COLCHETES = /\[[^\]]+\]/
const LABEL_MAX = 40


/**
 * O label pode prometer o que promete?
 *
 * Devolve o motivo da recusa, ou `null` quando pode. As duas recusas são as
 * que o usuário levantou: cupom sem incentivo, e cupom com valor diferente
 * do da peça.
 */
export function recusaDoLabel(label: string, incentivo: IncentivoDaPeca): string | null {
  const texto = label.trim()
  if (!texto) return "label vazio"
  if (texto.length > LABEL_MAX) return `label com ${texto.length} chars (teto ${LABEL_MAX})`
  if (COLCHETES.test(texto)) return "label com placeholder entre colchetes — ninguém vai resolvê-lo"
  if (!OFERTA_NO_LABEL.test(texto)) return null

  if (incentivo.existe !== true) {
    return incentivo.existe === false
      ? "promete oferta e a loja NÃO tem incentivo ativo"
      : "promete oferta e ninguém confirmou que a loja tem incentivo"
  }
  const noLabel = PERCENTUAL.exec(texto)?.[1]
  if (noLabel != null && incentivo.percentual != null && Number(noLabel) !== incentivo.percentual) {
    return `promete ${noLabel}% e a peça carrega ${incentivo.percentual}%`
  }
  return null
}

/** Resolve o endereço do botão novo. O modelo escolhe o tipo, não a URL. */
function resolverHref(destino: Destino, bloco: number, ctx: ContextoDoPlano): string | null {
  const doProduto = ctx.urlPorBloco?.[bloco]
  const doPrincipal = ctx.ctas[0]?.href
  const daLoja = ctx.urlLoja?.trim() || null
  // A ordem de fallback é a mesma para todos os destinos: o pedido primeiro,
  // depois o que existir. Botão sem href não entra — é o link para lugar
  // nenhum que este módulo existe para impedir.
  const cascata: Record<Destino, Array<string | null | undefined>> = {
    produto_do_bloco: [doProduto, doPrincipal, daLoja],
    cta_principal: [doPrincipal, daLoja],
    loja: [daLoja, doPrincipal],
  }
  for (const candidato of cascata[destino]) {
    if (candidato && candidato.trim()) return candidato.trim()
  }
  return null
}

/** Traduz o plano do agente nas ops que o aplicador executa. */
export function planoParaOps(plano: PlanoDeCor, ctx: ContextoDoPlano): TraducaoDoPlano {
  const ops: FormatOp[] = []
  const descartes: Descarte[] = []
  const ajustes: AjusteDeCor[] = []
  const porOrdem = new Map(ctx.faixas.map((f) => [f.ordem, f]))
  const porBloco = new Map(ctx.faixas.map((f) => [f.bloco, f]))
  const ctaPorId = new Map(ctx.ctas.map((c) => [c.id, c]))
  const idsDeCta = new Set(ctx.ctas.map((c) => c.id))
  const inventarioPorBloco = new Map((ctx.inventario ?? []).map((i) => [i.bloco, i]))
  // O fundo de uma faixa DEPOIS das decisões de faixa deste mesmo plano —
  // o botão é medido contra a cor em que vai pousar, não contra a antiga.
  const fundoDecidido = new Map<number, string>()
  // Botão que só existe no ramo do Outlook NÃO conta como botão presente:
  // fora dali o lugar está vazio, e tratá-lo como CTA do bloco deixaria a
  // seção sem botão para quase todo leitor. Ele aparece no `ctas_json` com
  // `somente_outlook: true` para ser visto, não para calar a inserção.
  const blocosComCta = new Set(
    ctx.ctas.filter((c) => !c.somente_outlook).map((c) => c.bloco),
  )
  // Escala da peça: o botão novo nasce do tamanho dos botões que já estão
  // lá, não de uma constante. Ver `escala-do-botao.ts`.
  const escala = escalaDoBotao(ctx.ctas)

  // ── Faixas ───────────────────────────────────────────────────────────
  //
  // A conta do teto é sobre a peça como ela FICARIA: cada troca aceita
  // atualiza este mapa, e a candidata seguinte é medida contra o resultado
  // acumulado, não contra o documento original. Sem isto, duas trocas para
  // tons diferentes passariam as duas medidas contra o estado inicial e a
  // peça terminaria com um tom a mais do que qualquer uma delas previu.
  const fundoCorrente = new Map<number, string | null>()
  for (const f of ctx.faixas) fundoCorrente.set(f.ordem, f.fundo)
  const aceitas = [...(ctx.fundosAceitos ?? [])]
  const medir = (troca?: { ordem: number; fundo: string }) =>
    tonsDeFundo(
      ctx.faixas.map((f) => ({
        ...f,
        fundo:
          troca && f.ordem === troca.ordem
            ? troca.fundo
            : (fundoCorrente.get(f.ordem) ?? f.fundo),
      })),
      aceitas,
    )

  let pintadas = 0
  for (const d of plano.faixas ?? []) {
    const alvo = `faixa ${d.ordem}`
    const faixa = porOrdem.get(d.ordem)
    if (!faixa) {
      descartes.push({ o_que: alvo, motivo: "não existe no documento" })
      continue
    }
    const verbo = verboDaFaixa(d.decisao)
    if (verbo === "manter" || !d.fundo) continue
    if (!isColorLiteral(d.fundo)) {
      descartes.push({ o_que: alvo, motivo: `fundo "${d.fundo}" não é cor` })
      continue
    }
    if (faixa.foto) {
      descartes.push({ o_que: alvo, motivo: "o fundo é foto — a hero não se decide aqui" })
      continue
    }
    if (!faixa.editavel) {
      descartes.push({ o_que: alvo, motivo: "pousa no canvas: não há declaração para trocar" })
      continue
    }
    // A faixa já está na cor pedida.
    //
    // Antes da conta de tons, de propósito: uma op que não muda um pixel
    // também não muda a paleta da peça, e medi-la faria a candidata seguinte
    // ser julgada contra um estado que ninguém alcançou. É o custo escondido
    // do verbo livre: qualquer decisão que não seja exatamente `manter`,
    // ecoando o fundo atual em `fundo`, virava troca em silêncio.
    if (faixa.fundo && isColorLiteral(faixa.fundo) && canonicalHex(faixa.fundo) === canonicalHex(d.fundo)) {
      descartes.push({ o_que: alvo, motivo: `já está em ${canonicalHex(d.fundo)}` })
      continue
    }
    // Teto de segurança, não de composição: plano malformado que repete a
    // mesma `ordem` dezenas de vezes não vira dezenas de ops. Decidir todas
    // as faixas da peça é o trabalho; decidir mais que todas é defeito.
    if (pintadas >= TETO_DE_FAIXAS_DE_SEGURANCA(ctx.faixas.length)) {
      descartes.push({ o_que: alvo, motivo: "mais trocas do que faixas na peça" })
      continue
    }
    const antes = medir()
    const depois = medir({ ordem: d.ordem, fundo: d.fundo })
    // Só a troca que ACRESCENTA tom e estoura o teto cai. Uma que reduz ou
    // mantém a contagem passa mesmo numa peça que já excede — ali ela é o
    // conserto, e descartá-la trancaria a peça no estado ruim.
    if (depois.excede && depois.tons.length > antes.tons.length) {
      descartes.push({
        o_que: alvo,
        motivo: `acima de ${TETO_DE_TONS} tons de fundo na peça (R2) — ficariam ${depois.tons.length}`,
      })
      continue
    }
    // Procedência: a troca não pode INTRODUZIR cor que não é da paleta nem
    // derivada dela. Comparar as listas em vez do tamanho porque uma troca
    // pode tirar um estranho e pôr outro — o tamanho não mudaria e a cor
    // nova entraria calada. Com `aceitas` vazia isto nunca dispara: sem
    // identidade cadastrada, nenhum fundo é estranho.
    const introduzidos = depois.estranhos.filter((h) => !antes.estranhos.includes(h))
    if (introduzidos.length > 0) {
      descartes.push({
        o_que: alvo,
        motivo: `${introduzidos.join(", ")} não é da paleta da loja nem papel derivado dela (K1)`,
      })
      continue
    }
    if (!(DECISOES_DE_FAIXA as readonly string[]).includes(verbo)) {
      ajustes.push({
        o_que: alvo,
        de: faixa.fundo ?? "?",
        para: d.fundo,
        motivo: `decisão "${d.decisao}" fora do vocabulário — a troca seguiu pelo campo fundo`,
      })
    }
    ops.push({ action: "set_fundo", bloco: faixa.bloco, para: d.fundo })
    fundoDecidido.set(faixa.bloco, d.fundo)
    fundoCorrente.set(d.ordem, d.fundo)
    pintadas++
  }

  // ── Gradiente das faixas ─────────────────────────────────────────────
  //
  // Laço próprio, e não um ramo do de cima: `decisao: "manter"` e a ausência
  // de `fundo` fazem aquele pular a faixa, e "mantenho a cor sólida e
  // repinto o gradiente" é uma decisão legítima — é justamente a da peça que
  // originou isto. Fora da conta de tons pelo mesmo motivo: repintar o
  // gradiente de uma faixa que já está na cor da loja não acrescenta tom ao
  // ritmo, conforma o que já foi decidido.
  for (const d of plano.faixas ?? []) {
    if (!d.gradiente) continue
    const alvo = `gradiente da faixa ${d.ordem}`
    const faixa = porOrdem.get(d.ordem)
    if (!faixa) continue // já descartado com motivo no laço acima
    const g = faixa.gradiente
    if (!g) {
      descartes.push({ o_que: alvo, motivo: "a faixa não tem gradiente" })
      continue
    }
    if (!g.editavel) {
      descartes.push({
        o_que: alvo,
        motivo:
          g.motivo === "paradas_demais"
            ? "mais de duas paradas — redesenhar não é alçada deste agente"
            : g.motivo === "parada_nao_hex"
              ? "alguma parada não é cor literal (rgba, var, transparent)"
              : "o espelho do Outlook não concorda com o CSS",
      })
      continue
    }
    if (d.gradiente.length !== g.paradas.length) {
      descartes.push({
        o_que: alvo,
        motivo: `o gradiente tem ${g.paradas.length} paradas e o plano trouxe ${d.gradiente.length}`,
      })
      continue
    }
    const invalida = d.gradiente.find((c) => !isColorLiteral(c))
    if (invalida) {
      descartes.push({ o_que: alvo, motivo: `parada "${invalida}" não é cor` })
      continue
    }
    if (d.gradiente.every((c, i) => canonicalHex(c) === g.paradas[i])) continue
    ops.push({ action: "set_gradiente", bloco: faixa.bloco, paradas: d.gradiente })
  }

  /** Fundo real em que um botão do bloco pousa (com a decisão de faixa deste plano). */
  const fundoDaFaixaDe = (bloco: number | null): string | null => {
    if (bloco == null) return null
    const f = porBloco.get(bloco)
    if (!f || f.foto) return null
    return fundoDecidido.get(bloco) ?? f.fundo
  }

  // ── Separação entre seções ───────────────────────────────────────────
  //
  // ANTES dos botões, de propósito, e a ordem no array é o que decide o
  // resultado: `add_separador` e `add_cta` escrevem no MESMO ponto (o fim
  // do bloco), e as regionais são aplicadas de trás para frente. Quem é
  // aplicado primeiro acaba embaixo. A separação marca o FIM da seção e o
  // botão é conteúdo dela — logo a separação entra primeiro, e o botão,
  // inserido depois no mesmo ponto, fica acima dela.
  let separacoes = 0
  for (const d of plano.separacoes ?? []) {
    const alvo = `separação depois da faixa ${d.depois_da_faixa}`
    const forma = formaPorId(d.forma)
    if (!forma) {
      descartes.push({ o_que: alvo, motivo: `forma "${d.forma}" não existe no catálogo` })
      continue
    }
    const cima = porOrdem.get(d.depois_da_faixa)
    const baixo = porOrdem.get(d.depois_da_faixa + 1)
    if (!cima) {
      descartes.push({ o_que: alvo, motivo: "a faixa não existe no documento" })
      continue
    }
    if (!baixo) {
      descartes.push({ o_que: alvo, motivo: "é a última faixa da peça — não há o que separar" })
      continue
    }
    // O rodapé já é um fim visual. Uma separação colada nele lê como fim do
    // e-mail, e o que vem depois vira um segundo e-mail.
    if (baixo.tipo === "footer") {
      descartes.push({ o_que: alvo, motivo: "imediatamente antes do rodapé — ali a separação lê como fim do e-mail" })
      continue
    }
    // As cores saem da DECISÃO deste plano, não do documento relido: ele
    // ainda não recebeu as ops de faixa, e ler dali desenharia a separação
    // com as cores que a peça está deixando de ter.
    const fundoCima = fundoDaFaixaDe(cima.bloco)
    const fundoBaixo = fundoDaFaixaDe(baixo.bloco)
    if (!fundoCima || !fundoBaixo) {
      descartes.push({ o_que: alvo, motivo: "uma das faixas não tem fundo sólido (foto ou canvas)" })
      continue
    }
    // A régua de tom é a MESMA de `tonsDeFundo`: `#FFFFFF` e `#FDFDFD` são
    // a diferença que não existe, e uma forma de emenda entre eles
    // desenharia um degrau invisível ao custo de um PNG.
    const troca = !mesmoTom(fundoCima, fundoBaixo)
    if (forma.escondeEmenda !== troca) {
      descartes.push({
        o_que: alvo,
        motivo: troca
          ? `"${forma.id}" é de marcar seção e o fundo TROCA aqui (${canonicalHex(fundoCima)} → ${canonicalHex(fundoBaixo)}) — use uma forma que esconda a emenda`
          : `"${forma.id}" esconde emenda e o fundo é o mesmo nos dois lados (${canonicalHex(fundoCima)}) — ela desenharia um degrau que não existe`,
      })
      continue
    }
    if (separacoes >= TETO_DE_SEPARACOES) {
      descartes.push({ o_que: alvo, motivo: `acima do teto de ${TETO_DE_SEPARACOES} separações por peça` })
      continue
    }
    let tinta = fundoBaixo
    if (!forma.escondeEmenda) {
      const escolha = tintaDoOrnamento(fundoCima, d.tinta, ctx.roles)
      if (!escolha.tinta) {
        descartes.push({ o_que: alvo, motivo: escolha.motivo ?? "sem tinta com contraste suficiente" })
        continue
      }
      if (escolha.trocada) {
        ajustes.push({
          o_que: alvo,
          de: d.tinta ?? "?",
          para: escolha.tinta,
          motivo: escolha.motivo ?? "contraste",
        })
      }
      tinta = escolha.tinta
    }
    ops.push({
      action: "add_separador",
      bloco: cima.bloco,
      formaId: forma.id,
      fundo: canonicalHex(fundoCima),
      tinta: canonicalHex(tinta),
    })
    separacoes++
  }

  // ── Botões que existem ───────────────────────────────────────────────
  for (const d of plano.botoes ?? []) {
    if (!idsDeCta.has(d.id)) {
      descartes.push({ o_que: `botão ${d.id}`, motivo: "não existe no documento" })
      continue
    }
    let fundo = d.fundo && isColorLiteral(d.fundo) ? d.fundo : undefined
    let label = d.label && isColorLiteral(d.label) ? d.label : undefined
    if (!fundo && !label) {
      descartes.push({ o_que: `botão ${d.id}`, motivo: "sem cor válida para aplicar" })
      continue
    }
    // Passo 14: a cor é conferida por código contra o fundo real da faixa.
    // O agente diz "este botão inverte"; o par que garante AA é do código.
    if (ctx.roles) {
      const cta = ctaPorId.get(d.id)
      const cor = corDoBotao(fundoDaFaixaDe(cta?.bloco ?? null), ctx.roles, {
        fundo: fundo ?? cta?.fundo ?? null,
        texto: label ?? cta?.label ?? null,
      })
      if (cor.ajustado) {
        ajustes.push({
          o_que: `botão ${d.id}`,
          de: `${fundo ?? cta?.fundo ?? "?"}/${label ?? cta?.label ?? "?"}`,
          para: `${cor.fundo}/${cor.texto}`,
          motivo: cor.motivo ?? "ajuste de contraste",
        })
      }
      fundo = cor.fundo
      label = cor.texto
    }
    ops.push({
      action: "set_botao",
      cta: d.id,
      ...(fundo ? { fundo } : {}),
      ...(label ? { label } : {}),
    })
  }

  // ── O botão deixado para trás ────────────────────────────────────────
  //
  // Achado RENDERIZANDO a peça de exemplo: o plano escureceu a faixa da
  // oferta e não disse nada sobre o botão dela. O botão continuou verde
  // sobre o verde novo e SUMIU — o próprio prompt chama isso de "o pior
  // resultado possível deste passo", e até aqui só o texto o impedia.
  //
  // Isto não é novo, mas ficou caro no dia em que o teto de trocas saiu: com
  // duas faixas por peça o esquecimento atingia no máximo dois botões; com
  // o ritmo inteiro na mão dele, atinge todos. A cor é aritmética contra o
  // fundo real, e aritmética é do código — o mesmo desenho de `corDoBotao`
  // para o botão que ele DECIDIU.
  if (ctx.roles) {
    const decididos = new Set((plano.botoes ?? []).map((d) => d.id))
    for (const cta of ctx.ctas) {
      if (decididos.has(cta.id) || cta.bloco == null) continue
      if (!fundoDecidido.has(cta.bloco)) continue
      const fundoNovo = fundoDaFaixaDe(cta.bloco)
      if (!fundoNovo) continue
      const cor = corDoBotao(fundoNovo, ctx.roles, { fundo: cta.fundo, texto: cta.label })
      if (!cor.ajustado) continue
      ops.push({
        action: "set_botao",
        cta: cta.id,
        ...(cor.fundo ? { fundo: cor.fundo } : {}),
        ...(cor.texto ? { label: cor.texto } : {}),
      })
      ajustes.push({
        o_que: `botão ${cta.id}`,
        de: cta.fundo ?? "?",
        para: cor.fundo ?? "?",
        motivo: `a faixa dele passou a ${canonicalHex(fundoNovo)} e o plano não decidiu o botão — o código refez o par`,
      })
    }
  }

  // ── Botões que faltam ────────────────────────────────────────────────
  for (const d of plano.adicionar ?? []) {
    const alvo = `botão novo no bloco ${d.bloco}`
    if (!ctx.faixas.some((f) => f.bloco === d.bloco)) {
      descartes.push({ o_que: alvo, motivo: "bloco não existe no documento" })
      continue
    }
    if (blocosComCta.has(d.bloco)) {
      descartes.push({ o_que: alvo, motivo: "o bloco já tem botão" })
      continue
    }
    // Passo 14: o CONTRATO decide se o bloco tem CTA. A heurística não viu
    // os botões de body-3 e products-7 (batch 6249aef2) e o agente inseriu
    // um segundo — o `output_schema` da variante já dizia que existia.
    const inv = inventarioPorBloco.get(d.bloco)
    if (inv?.tem_cta_por_contrato === true) {
      descartes.push({
        o_que: alvo,
        motivo: `o contrato do bloco já tem CTA (${inv.campos_cta.join(", ")}) — a heurística não o viu`,
      })
      continue
    }
    // Passo 14: a decisão nega CTA nesta posição (`requisitos.cta: false`).
    if (ctx.requisitosCta && ctx.requisitosCta[d.bloco] === false) {
      descartes.push({ o_que: alvo, motivo: "a decisão nega CTA nesta posição (requisitos.cta: false)" })
      continue
    }
    // A HERO nunca recebe botão inserido, mesmo quando `<ctas>` chega sem
    // nenhum nela.
    //
    // 11/09, Hero Boxers: os dois botões da hero perderam o href no caminho,
    // `extrairCtas` (que então exigia href) ficou cego e o agente escreveu,
    // com todas as letras, "a hero é o único bloco em <faixas> sem entrada em
    // <ctas>" — e inseriu um terceiro botão numa hero que já tinha dois. As
    // duas causas foram corrigidas na origem; isto é a terceira linha de
    // defesa, e ela vale por si:
    //
    // A hero é ENXERTADA da variante canônica, curada por gente. Hero sem
    // botão é decisão do designer, não lacuna a preencher aqui — e inserir
    // `<tr>` dentro da região enxertada briga com o splice das sentinelas.
    // Se faltar CTA na hero, o lugar de consertar é a variante.
    if (ctx.faixas.find((f) => f.bloco === d.bloco)?.tipo === "hero") {
      descartes.push({
        o_que: alvo,
        motivo: "a hero vem enxertada da variante — botão nela é decisão da biblioteca",
      })
      continue
    }
    const recusa = recusaDoLabel(d.label ?? "", ctx.incentivo)
    if (recusa) {
      descartes.push({ o_que: `${alvo} ("${(d.label ?? "").slice(0, 40)}")`, motivo: recusa })
      continue
    }
    if (!DESTINOS.includes(d.destino)) {
      descartes.push({ o_que: alvo, motivo: `destino "${d.destino}" fora do vocabulário` })
      continue
    }
    const href = resolverHref(d.destino, d.bloco, ctx)
    if (!href) {
      descartes.push({ o_que: alvo, motivo: "nenhum destino disponível — a loja não tem URL conhecida" })
      continue
    }
    let fundoNovo = d.fundo
    let corLabelNova = d.cor_label
    if (ctx.roles) {
      // Passo 14: a cor do botão novo é do código, medida contra a faixa em
      // que ele vai pousar — foi assim que o segundo botão saiu branco
      // sobre branco em 11/09.
      const cor = corDoBotao(fundoDaFaixaDe(d.bloco), ctx.roles, { fundo: d.fundo, texto: d.cor_label })
      if (cor.ajustado) {
        ajustes.push({ o_que: alvo, de: `${d.fundo}/${d.cor_label}`, para: `${cor.fundo}/${cor.texto}`, motivo: cor.motivo ?? "ajuste de contraste" })
      }
      fundoNovo = cor.fundo
      corLabelNova = cor.texto
    } else if (!isColorLiteral(d.fundo) || !isColorLiteral(d.cor_label)) {
      descartes.push({ o_que: alvo, motivo: "cor do botão inválida" })
      continue
    }
    ops.push({
      action: "add_cta",
      bloco: d.bloco,
      label: d.label.trim(),
      href,
      fundo: fundoNovo,
      corLabel: corLabelNova,
      radiusPx: escala.radiusPx,
      fontSizePx: escala.fontSizePx,
      peso: escala.peso,
      paddingV: escala.paddingV,
      paddingH: escala.paddingH,
      ...(ctx.fontFamily ? { fontFamily: ctx.fontFamily } : {}),
    })
    // Um botão por bloco: duas entradas para o mesmo bloco no mesmo plano
    // sairiam empilhadas.
    blocosComCta.add(d.bloco)
  }

  // ── Raio: o canto é um só na peça (R8) ───────────────────────────────
  //
  // Por CÓDIGO, como a cor do botão: escolher entre 8px e 10px não tem
  // julgamento, e o guia já manda ("botões com o mesmo raio na peça
  // inteira"). Até 17/09 a alçada respondia "não existe op de raio,
  // divergência é lacuna" — e ninguém consertava; a peça daquele dia saiu
  // com `cta1` em 10px e `cta2` em 8px.
  //
  // Sem teto: isto é conformidade, não ritmo. Duas faixas repintadas mudam
  // a leitura do e-mail; dois cantos alinhados não mudam nada além de
  // parecerem da mesma peça.
  const raio = unificarRaio(ctx.ctas)
  for (const t of raio.trocas) {
    ops.push({ action: "set_raio", cta: t.id, de: t.de, para: t.para })
  }
  if (raio.lacuna) descartes.push({ o_que: "raio dos botões", motivo: raio.lacuna })

  // ── Valores (a conformidade de identidade de sempre) ─────────────────
  for (const d of plano.valores ?? []) {
    if (!isColorLiteral(d.de) || !isColorLiteral(d.para)) {
      descartes.push({ o_que: `valor ${d.de} → ${d.para}`, motivo: "de/para não é cor" })
      continue
    }
    // O escopo vem de `isColorContext`, a MESMA régua do inventário e do
    // aplicador — não de uma lista repetida aqui. A cópia à mão que existia
    // nascia com seis contextos e envelheceu no dia em que `gradiente` virou
    // o sétimo (17/09): o prompt passou a prometer `onde: "gradiente"`,
    // `applyRecolor` já sabia filtrar por ele, e era este `if` que jogava o
    // `where` fora — a op virava recolor GLOBAL, trocando aquele valor no
    // documento inteiro em vez de só nas paradas do gradiente.
    //
    // Contexto que não existe DESCARTA a op, em vez de virar global: o
    // agente pediu escopo, e servir uma troca mais ampla do que a pedida é
    // pior do que não trocar — é o tratamento que `invalid_ids` recebe no
    // Curador, e o motivo fica na telemetria em vez de sumir.
    let where: ColorContext | undefined
    if (d.onde != null) {
      if (!isColorContext(d.onde)) {
        descartes.push({
          o_que: `valor ${d.de} → ${d.para}`,
          motivo: `onde "${d.onde}" não é um contexto de cor`,
        })
        continue
      }
      where = d.onde
    }
    ops.push({
      action: "recolor",
      from: d.de,
      to: d.para,
      ...(where ? { where } : {}),
    })
  }

  return { ops, descartes, ajustes }
}

export class PlanoParseError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "PlanoParseError"
    this.raw = raw
  }
}

/**
 * Lê o plano do output do modelo.
 *
 * Tolerante no formato, estrito no conteúdo: campo ausente vira lista vazia
 * (plano vazio é decisão legítima — "o e-mail já está certo"), mas entrada
 * malformada dentro de uma lista é DESCARTADA aqui em vez de virar op
 * inválida lá na frente. É o mesmo desenho de `parseTypographyDecision`.
 */
export function parsePlanoDeCor(raw: string): PlanoDeCor {
  const limpo = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const inicio = limpo.indexOf("{")
  const fim = limpo.lastIndexOf("}")
  if (inicio === -1 || fim <= inicio) {
    throw new PlanoParseError("output sem objeto JSON", raw)
  }
  let dado: unknown
  try {
    dado = JSON.parse(limpo.slice(inicio, fim + 1))
  } catch {
    throw new PlanoParseError("JSON inválido", raw)
  }
  if (!dado || typeof dado !== "object") {
    throw new PlanoParseError("plano não é objeto", raw)
  }
  const o = dado as Record<string, unknown>
  const lista = <T>(v: unknown, mapa: (x: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(v)) return []
    const out: T[] = []
    for (const item of v) {
      if (!item || typeof item !== "object") continue
      const t = mapa(item as Record<string, unknown>)
      if (t) out.push(t)
    }
    return out
  }
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

  return {
    ...(str(o.paleta_eixo) ? { paleta_eixo: str(o.paleta_eixo) } : {}),
    ...(o.tokens && typeof o.tokens === "object"
      ? { tokens: Object.fromEntries(Object.entries(o.tokens as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string> }
      : {}),
    faixas: lista<DecisaoDeFaixa>(o.faixas, (x) => {
      const ordem = Number(x.ordem)
      if (!Number.isInteger(ordem)) return null
      return {
        ordem,
        ...(str(x.decisao) ? { decisao: str(x.decisao) } : {}),
        ...(str(x.fundo) ? { fundo: str(x.fundo) } : {}),
        // Sem esta linha o agente podia devolver `gradiente` e o parser o
        // descartaria em silêncio — a decisão existiria no output e não
        // chegaria a op nenhuma, que é o modo de falha que esta frente toda
        // veio consertar.
        ...(Array.isArray(x.gradiente) && x.gradiente.every((c) => typeof c === "string")
          ? { gradiente: (x.gradiente as string[]).map((c) => c.trim()) }
          : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    botoes: lista<DecisaoDeBotao>(o.botoes, (x) => {
      const id = str(x.id)
      if (!id) return null
      return {
        id,
        ...(str(x.fundo) ? { fundo: str(x.fundo) } : {}),
        ...(str(x.label) ? { label: str(x.label) } : {}),
        ...(str(x.tipo) ? { tipo: str(x.tipo) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    adicionar: lista<BotaoQueFalta>(o.adicionar, (x) => {
      const bloco = Number(x.bloco)
      const label = str(x.label)
      const destino = str(x.destino) as Destino | undefined
      const fundo = str(x.fundo)
      const corLabel = str(x.cor_label) ?? str(x.corLabel)
      if (!Number.isInteger(bloco) || !label || !destino || !fundo || !corLabel) return null
      return {
        bloco,
        label,
        destino,
        fundo,
        cor_label: corLabel,
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    valores: lista<DecisaoDeValor>(o.valores, (x) => {
      const de = str(x.de)
      const para = str(x.para)
      if (!de || !para) return null
      return {
        de,
        para,
        ...(str(x.onde) ? { onde: str(x.onde) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    // Sem esta linha o agente podia devolver `separacoes` e o parser as
    // descartaria em silêncio: a decisão existiria no output da run, a
    // telemetria a mostraria, e nenhuma op sairia dela. É exatamente o modo
    // de falha que o `gradiente` já custou aqui.
    separacoes: lista<DecisaoDeSeparacao>(o.separacoes, (x) => {
      const depois = Number(x.depois_da_faixa ?? x.depoisDaFaixa)
      const forma = str(x.forma)
      if (!Number.isInteger(depois) || !forma) return null
      return {
        depois_da_faixa: depois,
        forma,
        ...(str(x.tinta) ? { tinta: str(x.tinta) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    ...(str(o.rodape) ? { rodape: str(o.rodape) } : {}),
    lacunas: Array.isArray(o.lacunas) ? o.lacunas.filter((l): l is string => typeof l === "string") : [],
  }
}
