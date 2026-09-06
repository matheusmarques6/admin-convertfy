/**
 * Leitura do módulo Transcrições — o que os Server Components consomem.
 *
 * Tudo em paralelo, no servidor: a página não abre com useEffect
 * encadeado disparando fetch (a dívida que este módulo não repete). O
 * mapeamento snake_case → camelCase acontece SÓ aqui.
 *
 * Contadores (biblioteca, árvore, busca) saem de `count` do PostgREST, não
 * de `array.length` no cliente: com paginação, contar o array mostraria
 * "24 transcrições" numa biblioteca de 300.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { assinarLote, assinarMedia, audioExpiraEm } from "./transcricoes-assets"
import { lerBlocos } from "@/lib/transcricoes/blocos-io"
import type {
  BibliotecaPagina,
  Bloco,
  Colecao,
  EstadoDaFila,
  EtapaPipeline,
  FiltroBiblioteca,
  Locutor,
  Plataforma,
  StatusTranscricao,
  TopicoDetectado,
  TranscricaoDetalhe,
  TranscricaoResumo,
} from "@/lib/transcricoes/types"

const log = logger.child("Transcricoes")

type Admin = ReturnType<typeof createAdminClient>

export const POR_PAGINA = 24
/** Heartbeat mais velho que isso e o rodapé avisa em vez de dizer "ok". */
export const HEARTBEAT_LIMITE_MS = 5 * 60_000

const SELECT_RESUMO =
  "id, titulo, plataforma, canal, url_original, publicado_em, duracao_seg, thumb_path, colecao_id, " +
  "status, etapa, progresso, erro_msg, erro_codigo, tentativas, locutores_qtd, tags, criado_em"

interface LinhaResumo {
  id: string
  titulo: string
  plataforma: string
  canal: string | null
  url_original: string | null
  publicado_em: string | null
  duracao_seg: number | null
  thumb_path: string | null
  colecao_id: string | null
  status: string
  etapa: number
  progresso: number | null
  erro_msg: string | null
  erro_codigo: string | null
  tentativas: number
  locutores_qtd: number | null
  tags: string[] | null
  criado_em: string
}

// ── Mapeamento ──────────────────────────────────────────────────────────

function paraResumo(
  l: LinhaResumo,
  thumbs: Map<string, string>,
  colecoes: Map<string, { nome: string; naBase: boolean }>,
): TranscricaoResumo {
  const col = l.colecao_id ? colecoes.get(l.colecao_id) : undefined
  return {
    id: l.id,
    titulo: l.titulo,
    plataforma: l.plataforma as Plataforma,
    canal: l.canal,
    urlOriginal: l.url_original,
    publicadoEm: l.publicado_em,
    duracaoSeg: l.duracao_seg,
    thumbUrl: l.thumb_path ? thumbs.get(l.thumb_path) ?? null : null,
    colecaoId: l.colecao_id,
    colecaoNome: col?.nome ?? null,
    status: l.status as StatusTranscricao,
    etapa: (l.etapa ?? 0) as EtapaPipeline,
    progresso: l.progresso,
    erroMsg: l.erro_msg,
    erroCodigo: l.erro_codigo,
    tentativas: l.tentativas ?? 0,
    locutoresQtd: l.locutores_qtd,
    tags: l.tags ?? [],
    criadoEm: l.criado_em,
    naBaseDeConhecimento: col?.naBase ?? false,
  }
}

// ── Coleções ────────────────────────────────────────────────────────────

interface LinhaColecao {
  id: string
  nome: string
  pai_id: string | null
  na_base_de_conhecimento: boolean
  phrase_list: string[] | null
  modelo: string
  reservada: string | null
  ordem: number
}

export interface ArvoreColecoes {
  raizes: Colecao[]
  /** Plana, para seletores e lookup. */
  todas: Colecao[]
  /** Total de transcrições da org (o "Todas" do topo). */
  totalGeral: number
  /** Sem coleção — a reservada "Não organizadas". */
  semColecao: number
  inboxId: string | null
}

/**
 * Monta a árvore com contagem RECURSIVA. A contagem direta vem de um
 * group-by e a recursiva é somada aqui: um SQL recursivo por nó daria N+1
 * consultas para uma árvore de três níveis.
 */
export async function carregarColecoes(admin: Admin, orgId: string): Promise<ArvoreColecoes> {
  const [colRes, contRes, totalRes, semColRes, pendRes] = await Promise.all([
    admin
      .from("transcricoes_colecoes")
      .select("id, nome, pai_id, na_base_de_conhecimento, phrase_list, modelo, reservada, ordem")
      .eq("org_id", orgId)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true })
      .returns<LinhaColecao[]>(),
    admin.rpc("transcricoes_contagem_por_colecao", { p_org_id: orgId }),
    admin.from("transcricoes").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("transcricoes").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("colecao_id", null),
    // Agregado no banco: ler os chunks pendentes crus voltava cortado em
    // 1.000 linhas e o indicador sumia justamente nas orgs com muita
    // pendência — o caso em que ele importa.
    admin.rpc("transcricoes_pendentes_por_colecao", { p_org_id: orgId }),
  ])

  if (colRes.error) throw colRes.error

  const contagem = new Map<string, number>()
  // A RPC pode não existir se a migration não rodou; a árvore ainda abre,
  // só sem os números por pasta.
  if (!contRes.error) {
    for (const r of (contRes.data ?? []) as Array<{ colecao_id: string | null; total: number }>) {
      if (r.colecao_id) contagem.set(r.colecao_id, Number(r.total))
    }
  } else {
    log.warn("contagem por coleção indisponível", { erro: contRes.error.message })
  }

  // Transcrições com indexação pendente, por coleção — é o "processando" da
  // faísca no item da árvore. Sem a RPC (migration não rodou) a árvore abre
  // igual, só sem o indicador.
  const pendentePorColecao = new Map<string, number>()
  if (pendRes.error) {
    log.warn("indexação pendente por coleção indisponível", { erro: pendRes.error.message })
  } else {
    for (const r of (pendRes.data ?? []) as Array<{ colecao_id: string; total: number }>) {
      pendentePorColecao.set(r.colecao_id, Number(r.total))
    }
  }

  const linhas = colRes.data ?? []
  const nos = new Map<string, Colecao>()
  for (const l of linhas) {
    nos.set(l.id, {
      id: l.id,
      nome: l.nome,
      paiId: l.pai_id,
      naBaseDeConhecimento: l.na_base_de_conhecimento,
      phraseList: l.phrase_list ?? [],
      modelo: l.modelo,
      reservada: (l.reservada as "inbox" | null) ?? null,
      ordem: l.ordem,
      total: contagem.get(l.id) ?? 0,
      totalRecursivo: 0,
      filhas: [],
      indexacaoPendente: pendentePorColecao.get(l.id) ?? 0,
    })
  }

  const raizes: Colecao[] = []
  for (const no of nos.values()) {
    const pai = no.paiId ? nos.get(no.paiId) : undefined
    if (pai) pai.filhas.push(no)
    else raizes.push(no)
  }

  // Pós-ordem: a soma do pai depende das filhas já somadas. Ciclo no
  // `pai_id` (dado corrompido) pararia num laço infinito — o visitado corta.
  const visitado = new Set<string>()
  const somar = (no: Colecao): number => {
    if (visitado.has(no.id)) return no.total
    visitado.add(no.id)
    no.totalRecursivo = no.total + no.filhas.reduce((a, f) => a + somar(f), 0)
    return no.totalRecursivo
  }
  for (const r of raizes) somar(r)

  const inboxId = linhas.find((l) => l.reservada === "inbox")?.id ?? null

  return {
    raizes,
    todas: [...nos.values()],
    totalGeral: totalRes.count ?? 0,
    // "Não organizadas" é UM lugar só na tela, mas dois estados no banco: a
    // coleção reservada (destino de quem entra sem sugestão) e `NULL` (o que
    // sobra quando uma pasta é excluída — a FK é SET NULL). Contar só o NULL
    // deixava a peça recém-criada fora da árvore, visível apenas em "Todas".
    semColecao: (semColRes.count ?? 0) + (inboxId ? contagem.get(inboxId) ?? 0 : 0),
    inboxId,
  }
}

/** Ids da coleção e de todas as descendentes (o filtro da árvore é recursivo). */
export function idsComDescendentes(todas: Colecao[], raizId: string): string[] {
  const porPai = new Map<string, string[]>()
  for (const c of todas) {
    if (!c.paiId) continue
    porPai.set(c.paiId, [...(porPai.get(c.paiId) ?? []), c.id])
  }
  const out: string[] = []
  const fila = [raizId]
  const visto = new Set<string>()
  while (fila.length) {
    const id = fila.shift()!
    if (visto.has(id)) continue
    visto.add(id)
    out.push(id)
    fila.push(...(porPai.get(id) ?? []))
  }
  return out
}

// ── Biblioteca ──────────────────────────────────────────────────────────

/**
 * Recorte estrutural do builder do supabase-js. O genérico do chamador fica
 * SEM restrição de propósito: amarrá-lo a este shape faz o TypeScript
 * expandir os tipos recursivos do PostgREST até estourar (TS2589). O par de
 * casts abaixo é o preço de aplicar o MESMO recorte em dois selects.
 */
interface Filtravel {
  eq: (column: string, value: unknown) => Filtravel
  is: (column: string, value: null) => Filtravel
  in: (column: string, values: readonly string[]) => Filtravel
  ilike: (column: string, pattern: string) => Filtravel
  or: (filtro: string) => Filtravel
}

/**
 * `%` e `_` são curingas do LIKE: buscar "100%" sem escapar casaria com
 * qualquer título que comece com "100".
 */
export function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function carregarBiblioteca(
  admin: Admin,
  orgId: string,
  filtro: FiltroBiblioteca,
  arvore: ArvoreColecoes,
): Promise<BibliotecaPagina> {
  const de = Math.max(0, filtro.pagina) * POR_PAGINA
  const ate = de + POR_PAGINA - 1

  const termo = filtro.termo.trim()
  const colecaoIds =
    !filtro.semColecao && filtro.colecaoId ? idsComDescendentes(arvore.todas, filtro.colecaoId) : null

  const aplicar = <Q>(q: Q): Q => {
    let b = (q as Filtravel).eq("org_id", orgId)
    // "Não organizadas" cobre os DOIS estados: a coleção reservada e o NULL
    // que sobra de uma pasta excluída. Ver `carregarColecoes`.
    if (filtro.semColecao) {
      b = arvore.inboxId ? b.or(`colecao_id.is.null,colecao_id.eq.${arvore.inboxId}`) : b.is("colecao_id", null)
    } else if (colecaoIds) b = b.in("colecao_id", colecaoIds)
    if (filtro.plataforma) b = b.eq("plataforma", filtro.plataforma)
    if (filtro.status) b = b.eq("status", filtro.status)
    // Busca no título aqui é o filtro grosso; a busca por CONTEÚDO (blocos e
    // chunks) mora em `busca.ts` e devolve trechos com timestamp.
    if (termo) b = b.ilike("titulo", `%${escaparLike(termo)}%`)
    return b as Q
  }

  const ordenacao: Record<FiltroBiblioteca["ordem"], [string, boolean]> = {
    recentes: ["criado_em", false],
    antigas: ["criado_em", true],
    duracao: ["duracao_seg", false],
    titulo: ["titulo", true],
  }
  const [coluna, asc] = ordenacao[filtro.ordem] ?? ordenacao.recentes

  const [pagRes, resumoRes] = await Promise.all([
    aplicar(admin.from("transcricoes").select(SELECT_RESUMO, { count: "exact" }))
      .order(coluna, { ascending: asc, nullsFirst: false })
      // Desempate estável: sem ele a paginação pode repetir ou pular item
      // quando dois têm o mesmo valor na coluna ordenada.
      .order("id", { ascending: true })
      .range(de, ate)
      .returns<LinhaResumo[]>(),
    // A soma da duração é AGREGADA no banco. Somar no cliente um
    // `select("duracao_seg")` parecia funcionar até a biblioteca passar de
    // 1.000 peças: o PostgREST corta aí, e o rodapé passava a mostrar a
    // soma das primeiras 1.000 sem dizer que estava cortando. O RPC repete
    // o MESMO recorte do filtro — divergir aqui faria o rodapé somar um
    // conjunto e a lista mostrar outro.
    admin.rpc("transcricoes_resumo", {
      p_org_id: orgId,
      // Com `p_sem_colecao`, a lista carrega a reservada — a RPC casa NULL
      // OU qualquer id desta lista, o mesmo recorte do select acima.
      p_colecao_ids: filtro.semColecao ? (arvore.inboxId ? [arvore.inboxId] : null) : colecaoIds,
      p_sem_colecao: filtro.semColecao,
      p_plataforma: filtro.plataforma ?? null,
      p_status: filtro.status ?? null,
      p_termo: termo || null,
    }),
  ])

  if (pagRes.error) throw pagRes.error

  const linhas = pagRes.data ?? []
  const thumbs = await assinarLote(admin, linhas.map((l) => l.thumb_path ?? "").filter(Boolean))
  const mapaColecoes = new Map(arvore.todas.map((c) => [c.id, { nome: c.nome, naBase: c.naBaseDeConhecimento }]))

  const resumo = (
    (resumoRes.data ?? []) as Array<{ total: number; duracao_total: number; com_duracao: number }>
  )[0]
  const total = pagRes.count ?? resumo?.total ?? linhas.length

  return {
    itens: linhas.map((l) => paraResumo(l, thumbs, mapaColecoes)),
    total,
    // null quando NENHUM item tem duração: "0min de conteúdo" seria falso
    // para uma biblioteca que só tem itens ainda processando.
    duracaoTotalSeg: Number(resumo?.com_duracao ?? 0) > 0 ? Number(resumo.duracao_total) : null,
    temMais: de + linhas.length < total,
  }
}

// ── Detalhe ─────────────────────────────────────────────────────────────

interface LinhaDetalhe extends LinhaResumo {
  idioma: string
  modelo: string | null
  texto_completo: string | null
  topicos: unknown
  custo_usd: string | number | null
  tempo_processamento_seg: number | null
  concluido_em: string | null
  indexado_em: string | null
  media_path: string | null
  audio_path: string | null
}

function topicosDaLinha(v: unknown): TopicoDetectado[] {
  if (!Array.isArray(v)) return []
  return v
    .map((t) => {
      const o = t as { s?: unknown; titulo?: unknown }
      const s = Number(o?.s)
      const titulo = typeof o?.titulo === "string" ? o.titulo.trim() : ""
      return Number.isFinite(s) && titulo ? { s, titulo } : null
    })
    .filter((t): t is TopicoDetectado => t !== null)
    .sort((a, b) => a.s - b.s)
}

export async function carregarDetalhe(
  admin: Admin,
  orgId: string,
  id: string,
): Promise<TranscricaoDetalhe | null> {
  const { data: linha, error } = await admin
    .from("transcricoes")
    .select(
      `${SELECT_RESUMO}, idioma, modelo, texto_completo, topicos, custo_usd, tempo_processamento_seg, concluido_em, indexado_em, media_path, audio_path`,
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle<LinhaDetalhe>()

  if (error) throw error
  if (!linha) return null

  const [blocosLidos, locutoresRes, colecoesRes, pendRes] = await Promise.all([
    // Paginado: o PostgREST corta em 1.000 e um vídeo longo apareceria pela
    // metade na tela e na exportação, sem nada dizendo que faltou texto.
    lerBlocos(admin, id),
    admin
      .from("transcricoes_locutores")
      .select("id, rotulo_original, nome, cor")
      .eq("transcricao_id", id)
      .order("cor", { ascending: true })
      .returns<Array<{ id: number; rotulo_original: string; nome: string; cor: number }>>(),
    linha.colecao_id
      ? admin
          .from("transcricoes_colecoes")
          .select("id, nome, na_base_de_conhecimento")
          .eq("id", linha.colecao_id)
          .maybeSingle<{ id: string; nome: string; na_base_de_conhecimento: boolean }>()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("transcricoes_chunks")
      .select("id", { count: "exact", head: true })
      .eq("transcricao_id", id)
      .or("embedding.is.null,desatualizado.is.true"),
  ])

  const blocos: Bloco[] = blocosLidos.map((b) => ({
    id: b.id,
    s: b.s,
    fim: b.fim,
    locutor: b.locutor,
    texto: b.texto,
    editado: b.editado,
  }))

  const falasPorRotulo = new Map<string, number>()
  for (const b of blocos) if (b.locutor) falasPorRotulo.set(b.locutor, (falasPorRotulo.get(b.locutor) ?? 0) + 1)

  const locutores: Locutor[] = (locutoresRes.data ?? []).map((l) => ({
    id: l.id,
    rotuloOriginal: l.rotulo_original,
    nome: l.nome,
    cor: l.cor,
    falas: falasPorRotulo.get(l.rotulo_original) ?? 0,
  }))

  const [thumbs, mediaUrl] = await Promise.all([
    assinarLote(admin, [linha.thumb_path ?? ""].filter(Boolean)),
    assinarMedia(admin, linha.media_path),
  ])

  const col = colecoesRes.data
  const resumo = paraResumo(
    linha,
    thumbs,
    new Map(col ? [[col.id, { nome: col.nome, naBase: col.na_base_de_conhecimento }]] : []),
  )

  return {
    ...resumo,
    idioma: linha.idioma,
    modelo: linha.modelo,
    textoCompleto: linha.texto_completo,
    topicos: topicosDaLinha(linha.topicos),
    blocos,
    locutores,
    custoUsd: linha.custo_usd == null ? null : Number(linha.custo_usd),
    tempoProcessamentoSeg: linha.tempo_processamento_seg,
    concluidoEm: linha.concluido_em,
    indexadoEm: linha.indexado_em,
    mediaUrl,
    // A janela precisa ser VISÍVEL: sem ela o usuário só descobre que o
    // áudio expirou tentando reprocessar e falhando.
    audioAte: audioExpiraEm(linha.concluido_em, linha.audio_path)?.toISOString() ?? null,
    chunksDesatualizados: pendRes.count ?? 0,
  }
}

// ── Fila / worker ───────────────────────────────────────────────────────

export async function estadoDaFila(admin: Admin, orgId: string): Promise<EstadoDaFila> {
  const [hbRes, filaRes] = await Promise.all([
    admin
      .from("transcricoes_worker")
      .select("visto_em")
      .order("visto_em", { ascending: false })
      .limit(1)
      .maybeSingle<{ visto_em: string }>(),
    admin
      .from("transcricoes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["aguardando", "processando"]),
  ])

  const visto = hbRes.data?.visto_em ?? null
  return {
    sincronizadoEm: visto,
    emProcessamento: filaRes.count ?? 0,
    // Sem heartbeat, ou heartbeat velho: o rodapé diz que o serviço pode
    // estar fora em vez de exibir um horário que não significa nada.
    workerOffline: !visto || Date.now() - Date.parse(visto) > HEARTBEAT_LIMITE_MS,
  }
}

/**
 * Garante a coleção reservada "Não organizadas". É a ÚNICA coisa semeada
 * automaticamente: pasta de destino é infraestrutura do módulo, o resto da
 * estrutura o time cria (ou aceita a sugestão) pela tela.
 */
export async function garantirInbox(admin: Admin, orgId: string, userId: string | null): Promise<string | null> {
  const { data } = await admin
    .from("transcricoes_colecoes")
    .select("id")
    .eq("org_id", orgId)
    .eq("reservada", "inbox")
    .maybeSingle<{ id: string }>()
  if (data?.id) return data.id

  const { data: nova, error } = await admin
    .from("transcricoes_colecoes")
    .insert({ org_id: orgId, nome: "Não organizadas", reservada: "inbox", ordem: -1, criado_por: userId })
    .select("id")
    .maybeSingle<{ id: string }>()
  if (error) {
    // Corrida entre duas abas: o índice único resolve, basta reler.
    if (error.code === "23505") {
      const { data: existente } = await admin
        .from("transcricoes_colecoes")
        .select("id")
        .eq("org_id", orgId)
        .eq("reservada", "inbox")
        .maybeSingle<{ id: string }>()
      return existente?.id ?? null
    }
    log.warn("não foi possível criar a coleção reservada", { erro: error.message })
    return null
  }
  return nova?.id ?? null
}
