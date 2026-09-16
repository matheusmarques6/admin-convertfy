/**
 * Nota do perfil — o número que resume "como está o conteúdo".
 *
 * A referência que isto copia mostra um mostrador com **48 de 100** e nada
 * mais: não dá para saber o que entrou na conta, qual componente puxou a
 * nota para baixo, nem se algum deles simplesmente não pôde ser medido.
 * Uma nota assim não é acionável — e, pior, um perfil cujos insights a Meta
 * não entregou aparece como perfil RUIM.
 *
 * Aqui a nota é uma soma ponderada de componentes, e cada componente carrega
 * três coisas na cara: o **peso**, a **evidência** (o número que o produziu)
 * e a **referência** contra a qual ele foi medido, com procedência.
 *
 * ## As três regras que não podem regredir
 *
 * 1. **Componente não medido sai do DENOMINADOR**, nunca entra como zero.
 *    Penalizar o que não foi medido é inventar defeito: a Meta não entregar
 *    alcance não torna o perfil pior, torna a medição incompleta. A saída
 *    declara `medidos` de `total` e a tela é obrigada a dizer isso.
 * 2. **Nada medido ⇒ nota `null`**, jamais 0. Zero se lê como "péssimo";
 *    a verdade é "não dá para dizer".
 * 3. **Toda referência é DECLARADA e tem dono.** Ou é dado do nosso sistema
 *    (a meta semanal que alguém definiu no canal), ou é mediana publicada
 *    com a fonte nomeada (`MEDIANAS_DE_MERCADO`), ou é o teto que o próprio
 *    perfil já provou. Não existe alvo inventado aqui — e é por isso que o
 *    mix de formato, que não tem referência honesta, ficou FORA da nota e
 *    vive no diagnóstico.
 */

import { MEDIANAS_DE_MERCADO, porAlcance, taxaDeEngajamento } from "../metricas/sinais"
import type { Post } from "../types"

export type ComponenteId = "constancia" | "engajamento" | "retencao" | "conversao"

export interface Componente {
  id: ComponenteId
  rotulo: string
  /** Quanto ele vale na nota cheia. */
  peso: number
  /** 0..1. `null` = não deu para medir, e aí ele sai do denominador. */
  valor: number | null
  /** O número que produziu o valor — a tela mostra a conta, não só a nota. */
  evidencia: string
  /** Por que não foi medido. Só existe quando `valor` é null. */
  motivo?: string
  /** Contra o que o valor foi medido, com procedência. */
  referencia: string
}

export type Faixa = "critico" | "atencao" | "bom" | "excelente"

export interface NotaDoPerfil {
  /** 0..100. `null` quando nenhum componente pôde ser medido. */
  nota: number | null
  faixa: Faixa | null
  componentes: Componente[]
  medidos: number
  total: number
}

/** Piso de amostra para um post entrar nas contas de razão por alcance. */
const ALCANCE_MINIMO = 30
/** Quantos posts com alcance a retenção exige para ter teto confiável. */
const MINIMO_PARA_TETO = 5

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`
const um = (n: number) => n.toFixed(1).replace(".", ",")

/** A maior mediana publicada — bater nela vale nota cheia no engajamento. */
export const MEDIANA_ALTA = MEDIANAS_DE_MERCADO.reduce((a, m) => (m.valor > a.valor ? m : a), MEDIANAS_DE_MERCADO[0])

export function faixaDaNota(nota: number): Faixa {
  if (nota >= 80) return "excelente"
  if (nota >= 60) return "bom"
  if (nota >= 40) return "atencao"
  return "critico"
}

export interface EntradaDaNota {
  posts: Post[]
  /** Dias do período — o divisor de "posts por semana". */
  dias: number
  /** Seguidores no fim do período. `null` sem snapshot. */
  seguidores: number | null
  /** Meta de publicações por semana configurada no canal. */
  metaSemanal: number
}

/**
 * Taxa de engajamento MÉDIA POR POST, que é a forma das medianas publicadas
 * ("mediana por post sobre seguidores"). Somar o período inteiro e dividir
 * por seguidores daria um número que não é comparável com fonte nenhuma.
 */
export function taxaMediaPorPost(posts: readonly Post[], seguidores: number | null): { valor: number | null; completa: boolean } {
  if (!seguidores || seguidores <= 0 || posts.length === 0) return { valor: null, completa: false }
  const taxas: number[] = []
  let completa = true
  for (const p of posts) {
    const t = taxaDeEngajamento({ curtidas: p.curtidas, comentarios: p.com, compartilhamentos: p.sh, salvos: p.sav }, seguidores)
    if (t.valor == null) continue
    if (!t.completa) completa = false
    taxas.push(t.valor)
  }
  if (taxas.length === 0) return { valor: null, completa: false }
  return { valor: taxas.reduce((a, b) => a + b, 0) / taxas.length, completa }
}

/**
 * O teto que o próprio perfil já provou: a MEDIANA dos três melhores
 * `sends ÷ alcance`.
 *
 * Mediana dos três, e não o melhor sozinho, porque um post de alcance 40 com
 * 2 compartilhamentos rende 5% e viraria um teto que ninguém alcança — o
 * alarme falso que ensina a ignorar o alarme. `ALCANCE_MINIMO` é o mesmo
 * cuidado, do outro lado.
 */
export function tetoDeRetencao(posts: readonly Post[]): { teto: number | null; amostra: number } {
  const razoes = posts
    .filter((p) => (p.alc ?? 0) >= ALCANCE_MINIMO)
    .map((p) => porAlcance(p.sh, p.alc))
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a)
  if (razoes.length < MINIMO_PARA_TETO) return { teto: null, amostra: razoes.length }
  const tres = razoes.slice(0, 3)
  return { teto: tres[Math.floor(tres.length / 2)], amostra: razoes.length }
}

/** Sends ÷ alcance do período inteiro — soma ÷ soma, nunca média de razões. */
export function retencaoDoPeriodo(posts: readonly Post[]): number | null {
  let sh = 0
  let alc = 0
  for (const p of posts) {
    if (p.alc == null || p.alc <= 0 || p.sh == null) continue
    sh += p.sh
    alc += p.alc
  }
  return alc > 0 ? (sh / alc) * 100 : null
}

export function notaDoPerfil({ posts, dias, seguidores, metaSemanal }: EntradaDaNota): NotaDoPerfil {
  const componentes: Componente[] = []

  // 1 · Constância. A referência é DADO do nosso sistema: a meta que alguém
  // definiu no canal. É o único componente sempre medível — publicar ou não
  // publicar não depende de a Meta devolver insight.
  const semanas = Math.max(dias, 1) / 7
  const porSemana = posts.length / semanas
  const meta = metaSemanal > 0 ? metaSemanal : 3
  componentes.push({
    id: "constancia",
    rotulo: "Constância",
    peso: 30,
    valor: clamp01(porSemana / meta),
    evidencia: `${um(porSemana)} post/semana · meta ${meta}`,
    referencia: "meta semanal configurada no próprio canal",
  })

  // 2 · Engajamento contra as medianas publicadas.
  const taxa = taxaMediaPorPost(posts, seguidores)
  componentes.push({
    id: "engajamento",
    rotulo: "Engajamento",
    peso: 25,
    valor: taxa.valor == null ? null : clamp01(taxa.valor / MEDIANA_ALTA.valor),
    evidencia:
      taxa.valor == null
        ? "—"
        : `${pct(taxa.valor)} por post · ${MEDIANA_ALTA.fonte} ${pct(MEDIANA_ALTA.valor)}${taxa.completa ? "" : " · fórmula parcial"}`,
    motivo: taxa.valor == null ? (seguidores ? "nenhum post com interações no período" : "sem snapshot de seguidores — falta o denominador") : undefined,
    referencia: `bater a maior mediana publicada (${MEDIANA_ALTA.fonte} ${pct(MEDIANA_ALTA.valor)}) vale nota cheia`,
  })

  // 3 · Retenção contra o teto do PRÓPRIO perfil. É o eixo em que a
  // referência copiada não tem nada: ela mede curtidas, e o que o ranking
  // pondera é compartilhamento sobre alcance.
  const { teto, amostra } = tetoDeRetencao(posts)
  const periodo = retencaoDoPeriodo(posts)
  const medivel = teto != null && periodo != null && teto > 0
  componentes.push({
    id: "retencao",
    rotulo: "Retenção",
    peso: 25,
    valor: medivel ? clamp01(periodo / teto) : null,
    evidencia: medivel ? `${pct(periodo)} no período · seus 3 melhores fazem ${pct(teto)}` : "—",
    motivo: medivel
      ? undefined
      : amostra === 0
        ? "nenhum post com alcance — a Meta não entregou o insight"
        : `só ${amostra} ${amostra === 1 ? "post" : "posts"} com alcance no período (mínimo ${MINIMO_PARA_TETO})`,
    referencia: "sends ÷ alcance contra o teto que este perfil já provou (mediana dos 3 melhores)",
  })

  // 4 · Conversão. A palavra-chave é CLASSIFICAÇÃO HUMANA: com zero posts
  // classificados não existe "o perfil não converte", existe "ninguém
  // classificou" — e as duas pedem ações opostas.
  const comKw = posts.filter((p) => (p.kw ?? "").trim()).length
  const classificados = posts.filter((p) => p.pilar || p.molde || (p.kw ?? "").trim()).length
  componentes.push({
    id: "conversao",
    rotulo: "Caminho de conversão",
    peso: 20,
    valor: classificados === 0 || posts.length === 0 ? null : clamp01(comKw / posts.length),
    evidencia: classificados === 0 ? "—" : `${comKw} de ${posts.length} ${posts.length === 1 ? "post" : "posts"} com palavra-chave`,
    motivo: posts.length === 0 ? "nenhum post no período" : classificados === 0 ? "nenhum post classificado — a palavra-chave é classificação humana" : undefined,
    referencia: "todo post deveria ter um caminho rastreável até o direct",
  })

  const medidos = componentes.filter((c) => c.valor != null)
  if (medidos.length === 0) return { nota: null, faixa: null, componentes, medidos: 0, total: componentes.length }

  const pesoTotal = medidos.reduce((a, c) => a + c.peso, 0)
  const soma = medidos.reduce((a, c) => a + c.peso * (c.valor as number), 0)
  const nota = Math.round((soma / pesoTotal) * 100)
  return { nota, faixa: faixaDaNota(nota), componentes, medidos: medidos.length, total: componentes.length }
}
