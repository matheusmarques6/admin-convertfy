/**
 * Lacunas da biblioteca propostas pela TELEMETRIA do Curador (módulo PURO,
 * client-safe, 09/09).
 *
 * O 👎 do Estúdio gera um rascunho que ninguém persiste (copy-paste), e o
 * token do vault é read-only. Enquanto isso o Curador grava, run a run, o
 * que a biblioteca não cobre: `protocol_violations` (nenhuma posição
 * realiza o aliviador pedido; a escolhida obriga o que o toque proíbe) e
 * `posicoes_sem_variante` (seção sem candidata elegível). Medido em 04–08/09:
 * `aliviador_ausente (reputacao_da_loja)` em 4 de 4 runs, e nenhuma lacuna
 * escrita para isso.
 *
 * Aqui vive a régua: o que se agrega, como se normaliza a chave (para a
 * mesma lacuna em lojas diferentes cair no mesmo balde) e o rascunho no
 * molde de `componentes/lacunas/`, com `status: aberta` — que desde 09/09
 * é servido ao Curador. O I/O (runs → tabela `vault_propostas`) fica em
 * `vault-propostas.service.ts`; o cron só chama.
 */

export interface ViolacaoDaRun {
  tipo: string
  detalhe: string
  block_index?: number
  variant_id?: string
}

export interface RunParaLacuna {
  id: string
  createdAt: string
  storeName?: string | null
  violations: ViolacaoDaRun[]
  /**
   * Posições sem variante. Do `assembler_chooser` vêm só `section`; do
   * `assembler` (Passo 11) vêm também `dispositivo_pedido` e `flow_type`,
   * que é o que faz a lacuna ter NOME (`lacuna_biblioteca`) em vez de
   * "nenhuma variante para a seção".
   */
  posicoesSemVariante: Array<{
    section?: string
    block_index?: number
    dispositivo_pedido?: string | null
    flow_type?: string
    motivo?: string
  }>
}

export interface LacunaAgregada {
  /** Chave estável: `${tipo}:${detalhe normalizado}` — é o UNIQUE da tabela. */
  chave: string
  tipo: string
  /** Detalhe legível (a primeira ocorrência, não a normalizada). */
  detalhe: string
  /** Seção a que a lacuna se refere, quando dá para saber. */
  secao: string | null
  ocorrencias: number
  primeiraVez: string
  ultimaVez: string
  exemplos: Array<{ runId: string; storeName: string | null; createdAt: string }>
}

/** Só o que significa "a biblioteca não cobre" vira proposta. */
const TIPOS_DE_LACUNA = new Set(["aliviador_ausente", "proibicao_violada", "posicao_sem_variante", "lacuna_biblioteca"])
const EXEMPLOS_MAX = 5

/**
 * Limiar por tipo (Passo 11). `lacuna_biblioteca` vira proposta na PRIMEIRA
 * ocorrência: o e-mail já reprovou por causa dela, e esperar três batches
 * seria esperar três reprovações da mesma loja. O resto segue em 3 — são
 * sinais do Curador, não desfechos.
 */
export const MINIMO_POR_TIPO: Readonly<Record<string, number>> = { lacuna_biblioteca: 1 }

/**
 * Chave normalizada. A proibição vem em PROSA da loja ("Não inventar código…
 * × exige cupom-ativo") e mudaria a cada loja: fica só o que está depois do
 * `×` — o requisito/aliviador que a variante carrega, que é o dado da
 * biblioteca. Sem isso nenhuma proibição chegaria a 3 ocorrências.
 */
export function normalizarDetalhe(tipo: string, detalhe: string): string {
  let d = detalhe
  if (tipo === "proibicao_violada") {
    const i = d.lastIndexOf("×")
    if (i >= 0) d = d.slice(i + 1)
  }
  return d
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function secaoDoDetalhe(v: ViolacaoDaRun): string | null {
  const m = v.detalhe.match(/\b(hero|body|offer|products?|reviews?|footer|cta|header)\b/i)
  return m ? m[1].toLowerCase() : null
}

/** Agrega as violações de N runs por chave; só devolve quem atingiu o mínimo. */
export function agregarLacunas(
  runs: RunParaLacuna[],
  opts: { minimo?: number; minimoPorTipo?: Readonly<Record<string, number>> } = {},
): LacunaAgregada[] {
  const minimo = opts.minimo ?? 3
  const minimoPorTipo = opts.minimoPorTipo ?? MINIMO_POR_TIPO
  const minimoDe = (tipo: string) => minimoPorTipo[tipo] ?? minimo
  const baldes = new Map<string, LacunaAgregada>()
  const registrar = (run: RunParaLacuna, tipo: string, detalhe: string, secao: string | null, chaveFixa?: string) => {
    if (!TIPOS_DE_LACUNA.has(tipo)) return
    const chave = chaveFixa ?? `${tipo}:${normalizarDetalhe(tipo, detalhe)}`
    const atual = baldes.get(chave)
    if (!atual) {
      baldes.set(chave, {
        chave,
        tipo,
        detalhe: detalhe.trim(),
        secao,
        ocorrencias: 1,
        primeiraVez: run.createdAt,
        ultimaVez: run.createdAt,
        exemplos: [{ runId: run.id, storeName: run.storeName ?? null, createdAt: run.createdAt }],
      })
      return
    }
    atual.ocorrencias++
    if (run.createdAt < atual.primeiraVez) atual.primeiraVez = run.createdAt
    if (run.createdAt > atual.ultimaVez) atual.ultimaVez = run.createdAt
    if (!atual.secao && secao) atual.secao = secao
    if (atual.exemplos.length < EXEMPLOS_MAX && !atual.exemplos.some((e) => e.runId === run.id)) {
      atual.exemplos.push({ runId: run.id, storeName: run.storeName ?? null, createdAt: run.createdAt })
    }
  }
  for (const run of runs) {
    // A mesma violação repetida DENTRO de uma run (duas posições com a
    // mesma proibição) conta uma vez: a frequência que interessa é por
    // geração, não por bloco.
    const vistas = new Set<string>()
    for (const v of run.violations ?? []) {
      if (!v?.tipo || !v?.detalhe) continue
      const chave = `${v.tipo}:${normalizarDetalhe(v.tipo, v.detalhe)}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      registrar(run, v.tipo, v.detalhe, secaoDoDetalhe(v))
    }
    for (const p of run.posicoesSemVariante ?? []) {
      const secao = (p.section ?? "").trim().toLowerCase()
      if (!secao) continue
      // Chamada que não aconteceu (leque) não é pauta de curadoria: ela
      // pediria um bloco novo para resolver um timeout, e o balde ficaria
      // cheio justamente no dia em que o provedor esteve instável.
      if (p.motivo === "orcamento_esgotado") continue
      // Com dispositivo pedido a lacuna tem nome: é o que se cadastra.
      if (p.dispositivo_pedido) {
        const flow = (p.flow_type ?? "").trim().toLowerCase() || "flow"
        const detalhe = `${flow}: a decisão pediu ${p.dispositivo_pedido} (${secao}) e a biblioteca não tem variante ativa`
        const chave = `lacuna_biblioteca:${flow}:${p.dispositivo_pedido.toLowerCase()}`
        if (vistas.has(chave)) continue
        vistas.add(chave)
        registrar(run, "lacuna_biblioteca", detalhe, secao, chave)
        continue
      }
      const detalhe = `nenhuma variante elegível para a seção ${secao}`
      const chave = `posicao_sem_variante:${normalizarDetalhe("posicao_sem_variante", detalhe)}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      registrar(run, "posicao_sem_variante", detalhe, secao)
    }
  }
  return [...baldes.values()]
    .filter((b) => b.ocorrencias >= minimoDe(b.tipo))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || a.chave.localeCompare(b.chave))
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

const EXPLICACAO: Record<string, string> = {
  aliviador_ausente:
    "O alvo do Seletor pediu um aliviador que NENHUMA variante da biblioteca realiza nas seções deste e-mail. O Curador não tem o que escolher — a lacuna é de anatomia, não de decisão.",
  proibicao_violada:
    "O toque proíbe algo que a variante escolhida OBRIGA pela anatomia (o requisito depois do ×). Se toda candidata da seção carrega esse requisito, falta uma variante que faça o mesmo papel sem ele.",
  posicao_sem_variante:
    "A sequência do Estruturador pede a seção e o catálogo não tem candidata elegível — a posição fica vazia ou cai no template global.",
  lacuna_biblioteca:
    "O Estruturador pediu este DISPOSITIVO para a posição, a biblioteca não tem variante ativa que o realize e o resgate não pôde preencher sem contrariar a decisão (as candidatas eram de dispositivo descartado, ou violavam a decisão). O e-mail foi REPROVADO em `lacuna_biblioteca` — toda geração deste flow reprova até a variante existir. É o caso do gerador de anatomias (Componentes → Gerar anatomia).",
}

export interface LacunaDraft {
  chave: string
  slug: string
  path: string
  markdown: string
}

/** Determinístico: mesma agregação + mesma data → mesmo rascunho. */
export function buildLacunaDraft(agg: LacunaAgregada, dataIso: string): LacunaDraft {
  const dia = dataIso.slice(0, 10)
  const miolo =
    agg.tipo === "lacuna_biblioteca"
      ? agg.chave.split(":").slice(1).join("-")
      : normalizarDetalhe(agg.tipo, agg.detalhe).replace(/^exige |^aliviador |^nenhuma posicao realiza o aliviador pedido /, "")
  const slug = slugify(`${agg.secao ?? "geral"}-${agg.tipo.replace(/_/g, "-")}-${miolo}`) || slugify(agg.chave)
  const exemplos = agg.exemplos
    .map((e) => `- ${e.createdAt.slice(0, 10)} · ${e.storeName ?? "(loja não identificada)"} · run ${e.runId.slice(0, 8)}`)
    .join("\n")
  const markdown = `---
tipo: lacuna
status: aberta
sobre: biblioteca
origem: telemetria-curador
secao: ${agg.secao ?? "geral"}
violacao: ${agg.tipo}
ocorrencias: ${agg.ocorrencias}
primeira_vez: ${agg.primeiraVez.slice(0, 10)}
ultima_vez: ${agg.ultimaVez.slice(0, 10)}
proposta_em: ${dia}
---

# Lacuna · ${agg.secao ?? "geral"} · ${agg.tipo.replace(/_/g, " ")}

> RASCUNHO proposto pela telemetria do Curador (${agg.ocorrencias} ${agg.ocorrencias === 1 ? "geração" : "gerações"} em 14 dias).
> Revise o texto, confirme que a biblioteca de fato não cobre isto e salve em
> \`componentes/lacunas/${slug}.md\`. Com \`status: aberta\` a nota é servida ao
> Curador em \`<lacunas_da_biblioteca>\`: ele para de procurar bloco para o que
> não existe e declara a lacuna na justificativa. Quando a biblioteca ganhar a
> variante, troque para \`status: retratada\`.

## O que o Curador registrou

${agg.detalhe}

${EXPLICACAO[agg.tipo] ?? ""}

## Onde apareceu

${exemplos || "- (sem exemplos)"}

## O que a biblioteca precisaria ter

(descreva a anatomia que fecharia a lacuna: seção, papel, o que realiza sem
exigir o que o toque proíbe — é isto que orienta quem vai cadastrar a variante)
`
  return { chave: agg.chave, slug, path: `componentes/lacunas/${slug}.md`, markdown }
}
