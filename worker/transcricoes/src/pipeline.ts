/**
 * As quatro etapas, com retomada.
 *
 * O estado vive na LINHA (`etapa`, `progresso`, `media_path`, `audio_path`).
 * Se o container cair na indexação, a próxima execução retoma dali — não
 * rebaixa nem retranscreve. É o que faz "fechar a aba não interrompe o
 * processamento" ser verdade também para "o container reiniciou".
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  classificarErro,
  ehRetentavel,
  mensagemDeErro,
  proximaTentativaMs,
  type CodigoErro,
} from "@/lib/transcricoes/pipeline"
import { PLATAFORMA_LABEL, type Plataforma } from "@/lib/transcricoes/types"
import { detectarTopicos } from "@/lib/transcricoes/llm"
import { indexarTranscricao } from "@/lib/transcricoes/indexar"
import { lerBlocos } from "@/lib/transcricoes/blocos-io"
import {
  juntarPedacos,
  LIMITE_AUDIO_BYTES,
  SEGUNDOS_POR_PEDACO,
  transcreverAudio,
  type ResultadoTranscricao,
} from "@/lib/transcricoes/transcrever"
import {
  baixar,
  dividirAudio,
  extrairAudio,
  extrairFrame,
  limpar,
  pastaTemp,
  tamanho,
} from "./media.ts"

const BUCKET_MEDIA = "transcricoes-media"
const BUCKET_THUMBS = "transcricoes-thumbs"

type Client = SupabaseClient

export interface LinhaTranscricao {
  id: string
  org_id: string
  colecao_id: string | null
  titulo: string
  plataforma: Plataforma
  url_original: string | null
  duracao_seg: number | null
  idioma: string
  etapa: number
  tentativas: number
  media_path: string | null
  audio_path: string | null
  thumb_path: string | null
  criado_em: string
}

interface ConfigColecao {
  modelo: string
  phraseList: string[]
}

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }))

// ── Estado na linha ─────────────────────────────────────────────────────

async function marcarEtapa(
  db: Client,
  id: string,
  etapa: number,
  progresso: number | null,
): Promise<void> {
  await db
    .from("transcricoes")
    .update({ etapa, progresso, status: "processando", erro_msg: null, erro_codigo: null })
    .eq("id", id)
}

/**
 * Progresso escrito no máximo a cada 1,5 s. Sem o freio, um download de 40
 * minutos faria milhares de UPDATEs e outros tantos eventos de Realtime.
 */
function throttleProgresso(db: Client, id: string, etapa: number) {
  let ultimo = 0
  let pendente: number | null = null
  return async (pct: number) => {
    pendente = pct
    const agora = Date.now()
    if (agora - ultimo < 1500) return
    ultimo = agora
    const valor = pendente
    pendente = null
    await db.from("transcricoes").update({ etapa, progresso: valor }).eq("id", id)
  }
}

async function colecaoDaTranscricao(db: Client, colecaoId: string | null): Promise<ConfigColecao> {
  if (!colecaoId) return { modelo: "microsoft/mai-transcribe-2", phraseList: [] }
  const { data } = await db
    .from("transcricoes_colecoes")
    .select("modelo, phrase_list")
    .eq("id", colecaoId)
    .maybeSingle()
  const row = data as { modelo?: string; phrase_list?: string[] } | null
  return {
    modelo: row?.modelo || "microsoft/mai-transcribe-2",
    // O jargão da coleção é o parâmetro de maior impacto na qualidade: sem
    // ele "Omnisend" vira "omni send" e a busca nunca encontra.
    phraseList: row?.phrase_list ?? [],
  }
}

// ── Etapa 0: baixar ─────────────────────────────────────────────────────

async function etapaBaixar(db: Client, t: LinhaTranscricao, tmp: string): Promise<string> {
  // Upload: a mídia já está no Storage; só trazer para o disco.
  if (t.plataforma === "upload") {
    if (!t.media_path) throw new Error("upload sem arquivo no Storage")
    await marcarEtapa(db, t.id, 0, 10)
    const { data, error } = await db.storage.from(BUCKET_MEDIA).download(t.media_path)
    if (error || !data) throw new Error(`não foi possível baixar do Storage: ${error?.message ?? "sem corpo"}`)
    const destino = join(tmp, `media.${(t.media_path.split(".").pop() || "mp4").slice(0, 5)}`)
    await writeFile(destino, Buffer.from(await data.arrayBuffer()))
    await marcarEtapa(db, t.id, 0, 100)
    return destino
  }

  if (!t.url_original) throw new Error("transcrição de link sem URL")
  const onProgresso = throttleProgresso(db, t.id, 0)
  await marcarEtapa(db, t.id, 0, 0)
  const arquivo = await baixar(t.url_original, tmp, (p) => void onProgresso(p))

  // A mídia sobe para o Storage ANTES de qualquer outra coisa: é o que faz
  // o player funcionar mesmo se a transcrição falhar depois.
  const ext = arquivo.split(".").pop() || "mp4"
  const caminho = `org-${t.org_id}/${t.id}/media.${ext}`
  const conteudo = await readFile(arquivo)
  const { error } = await db.storage
    .from(BUCKET_MEDIA)
    .upload(caminho, conteudo, { contentType: `video/${ext === "mp4" ? "mp4" : "webm"}`, upsert: true })
  if (error) throw new Error(`não foi possível subir a mídia: ${error.message}`)
  await db.from("transcricoes").update({ media_path: caminho, progresso: 100 }).eq("id", t.id)

  // Thumb do próprio arquivo quando a linha ainda não tem uma (o link já
  // costuma trazer a do serviço na criação).
  if (!t.thumb_path) {
    try {
      const thumb = join(tmp, "thumb.jpg")
      await extrairFrame(arquivo, thumb, t.duracao_seg)
      const caminhoThumb = `org-${t.org_id}/${t.id}/thumb.jpg`
      await db.storage
        .from(BUCKET_THUMBS)
        .upload(caminhoThumb, await readFile(thumb), { contentType: "image/jpeg", upsert: true })
      await db.from("transcricoes").update({ thumb_path: caminhoThumb }).eq("id", t.id)
    } catch (e) {
      // Card sem imagem é um detalhe; falhar a transcrição por causa dele não.
      log("thumb do frame falhou", { id: t.id, erro: String(e) })
    }
  }
  return arquivo
}

// ── Etapa 1: extrair áudio ──────────────────────────────────────────────

async function etapaAudio(db: Client, t: LinhaTranscricao, entrada: string, tmp: string): Promise<string> {
  const saida = join(tmp, "audio.flac")
  const onProgresso = throttleProgresso(db, t.id, 1)
  await marcarEtapa(db, t.id, 1, 0)
  await extrairAudio(entrada, saida, t.duracao_seg, (p) => void onProgresso(p))

  const bytes = await tamanho(saida)
  // O áudio fica guardado: retomar da transcrição não precisa rebaixar nem
  // reconverter o vídeo inteiro.
  const caminho = `org-${t.org_id}/${t.id}/audio.flac`
  const { error } = await db.storage
    .from(BUCKET_MEDIA)
    .upload(caminho, await readFile(saida), { contentType: "audio/flac", upsert: true })
  if (!error) await db.from("transcricoes").update({ audio_path: caminho, audio_bytes: bytes }).eq("id", t.id)
  await marcarEtapa(db, t.id, 1, 100)
  return saida
}

// ── Etapa 2: transcrever ────────────────────────────────────────────────

async function etapaTranscrever(
  db: Client,
  t: LinhaTranscricao,
  audio: string,
  tmp: string,
  cfg: ConfigColecao,
): Promise<ResultadoTranscricao> {
  // Sem porcentagem: é uma chamada síncrona ao provedor, e não existe
  // progresso para reportar. `progresso: null` é o que faz a UI mostrar o
  // segmento em andamento sem número.
  await marcarEtapa(db, t.id, 2, null)

  const bytes = await tamanho(audio)
  const comum = { modelo: cfg.modelo, idioma: t.idioma, phraseList: cfg.phraseList }

  if (bytes <= LIMITE_AUDIO_BYTES) {
    return transcreverAudio(await readFile(audio), { ...comum, nomeArquivo: "audio.flac" })
  }

  const partes = await dividirAudio(audio, join(tmp, "partes"), SEGUNDOS_POR_PEDACO)
  log("áudio dividido", { id: t.id, partes: partes.length, bytes })
  const resultados: ResultadoTranscricao[] = []
  for (let i = 0; i < partes.length; i++) {
    resultados.push(
      await transcreverAudio(await readFile(partes[i].caminho), {
        ...comum,
        // O offset é o que mantém os timestamps válidos do 2º pedaço em
        // diante; errar aqui só aparece em vídeo longo. Vem do limite REAL
        // que o ffmpeg registrou, não do múltiplo (o corte é na fronteira
        // do quadro e o desvio acumularia).
        offsetSeg: partes[i].inicioSeg,
        nomeArquivo: `parte_${i}.flac`,
      }),
    )
  }
  return juntarPedacos(resultados)
}

/** Cores dos locutores no design: a ordem é estável, o índice é o rótulo. */
function corDoLocutor(indice: number): number {
  return indice % 6
}

async function persistirTranscricao(
  db: Client,
  t: LinhaTranscricao,
  r: ResultadoTranscricao,
): Promise<void> {
  await db.from("transcricoes_blocos").delete().eq("transcricao_id", t.id)
  await db.from("transcricoes_locutores").delete().eq("transcricao_id", t.id)

  const rotulos: string[] = []
  for (const s of r.segmentos) if (s.locutor && !rotulos.includes(s.locutor)) rotulos.push(s.locutor)

  if (rotulos.length) {
    await db.from("transcricoes_locutores").insert(
      rotulos.map((rotulo, i) => ({
        transcricao_id: t.id,
        org_id: t.org_id,
        rotulo_original: rotulo,
        // Nome inicial legível; o humano corrige clicando, e o rótulo
        // original nunca muda para que reprocessar consiga remapear.
        nome: `Locutor ${i + 1}`,
        cor: corDoLocutor(i),
      })),
    )
  }

  // Em lotes: uma aula de 47 min passa de 600 blocos e o PostgREST tem
  // limite de tamanho de corpo.
  const LOTE = 500
  for (let i = 0; i < r.segmentos.length; i += LOTE) {
    const { error } = await db.from("transcricoes_blocos").insert(
      r.segmentos.slice(i, i + LOTE).map((s) => ({
        transcricao_id: t.id,
        org_id: t.org_id,
        s: s.s,
        fim: s.fim,
        locutor: s.locutor,
        texto: s.texto,
      })),
    )
    if (error) throw new Error(`não foi possível gravar os blocos: ${error.message}`)
  }

  await db
    .from("transcricoes")
    .update({
      texto_completo: r.texto,
      // O modelo REALMENTE usado, não a constante: o painel lê daqui.
      modelo: r.modelo,
      custo_usd: r.custoUsd,
      locutores_qtd: rotulos.length || null,
      duracao_seg:
        t.duracao_seg ?? (r.segmentos.length ? Math.round(r.segmentos[r.segmentos.length - 1].fim) : null),
    })
    .eq("id", t.id)
}

// ── Etapa 3: indexar ────────────────────────────────────────────────────

async function etapaIndexar(db: Client, t: LinhaTranscricao): Promise<void> {
  await marcarEtapa(db, t.id, 3, 0)

  // Paginado: com `.limit()` o PostgREST devolveria 1.000 blocos e a busca
  // ficaria sem os dois terços finais de uma aula longa, sem nada indicando.
  const blocos = await lerBlocos(db, t.id)
  // Sem bloco não existe transcrição: seguir daqui marcaria a linha
  // "pronta" com o painel vazio e a busca sem nada para achar — falha
  // silenciosa disfarçada de sucesso.
  if (!blocos.length) throw new Error("a transcrição não produziu nenhuma fala")

  const topicos = await detectarTopicos(blocos, t.titulo)
  if (topicos.length) await db.from("transcricoes").update({ topicos }).eq("id", t.id)

  const onProgresso = throttleProgresso(db, t.id, 3)
  const r = await indexarTranscricao(
    db,
    { transcricaoId: t.id, orgId: t.org_id, titulo: t.titulo, blocos, topicos },
    (p) => void onProgresso(p),
  )
  log("indexado", { id: t.id, ...r })
  await db.from("transcricoes").update({ indexado_em: new Date().toISOString(), progresso: 100 }).eq("id", t.id)
}

// ── Orquestração ────────────────────────────────────────────────────────

export async function processar(db: Client, t: LinhaTranscricao): Promise<void> {
  const inicio = Date.now()
  const tmp = await pastaTemp(t.id)
  log("processando", { id: t.id, titulo: t.titulo, etapa: t.etapa, plataforma: t.plataforma })

  try {
    const cfg = await colecaoDaTranscricao(db, t.colecao_id)

    // Retomada: cada etapa só roda se a anterior não deixou o resultado
    // pronto. Cair na indexação não pode custar um novo download.
    let audioLocal: string | null = null

    if (t.etapa <= 2) {
      const { data: atual } = await db
        .from("transcricoes")
        .select("audio_path")
        .eq("id", t.id)
        .maybeSingle()
      const audioSalvo = (atual as { audio_path?: string | null } | null)?.audio_path ?? null

      if (audioSalvo) {
        const { data } = await db.storage.from(BUCKET_MEDIA).download(audioSalvo)
        if (data) {
          audioLocal = join(tmp, "audio.flac")
          await writeFile(audioLocal, Buffer.from(await data.arrayBuffer()))
          log("áudio reaproveitado", { id: t.id })
        }
      }
      if (!audioLocal) {
        const media = await etapaBaixar(db, t, tmp)
        audioLocal = await etapaAudio(db, t, media, tmp)
      }

      const r = await etapaTranscrever(db, t, audioLocal, tmp, cfg)
      await persistirTranscricao(db, t, r)
    }

    await etapaIndexar(db, t)

    await db
      .from("transcricoes")
      .update({
        status: "pronta",
        etapa: 3,
        progresso: 100,
        erro_msg: null,
        erro_codigo: null,
        claim_token: null,
        claim_expira_em: null,
        concluido_em: new Date().toISOString(),
        tempo_processamento_seg: Math.round((Date.now() - inicio) / 1000),
      })
      .eq("id", t.id)
    log("pronta", { id: t.id, seg: Math.round((Date.now() - inicio) / 1000) })
  } catch (e) {
    await registrarFalha(db, t, e)
  } finally {
    await limpar(tmp)
  }
}

async function registrarFalha(db: Client, t: LinhaTranscricao, e: unknown): Promise<void> {
  const bruto = e instanceof Error ? e.message : String(e)
  const codigo: CodigoErro = classificarErro(bruto)
  const tentativas = t.tentativas + 1
  const label = PLATAFORMA_LABEL[t.plataforma] ?? "provedor"
  const podeTentar = ehRetentavel(codigo, tentativas)

  log("falhou", { id: t.id, codigo, tentativas, podeTentar, bruto: bruto.slice(0, 400) })

  await db
    .from("transcricoes")
    .update({
      // Retentável volta para a fila com backoff; o card mostra a mensagem
      // legível enquanto espera, em vez de "falha genérica".
      status: podeTentar ? "aguardando" : "erro",
      erro_msg: mensagemDeErro(codigo, label),
      erro_codigo: codigo,
      tentativas,
      proxima_tentativa_em: podeTentar
        ? new Date(Date.now() + proximaTentativaMs(tentativas)).toISOString()
        : null,
      claim_token: null,
      claim_expira_em: null,
    })
    .eq("id", t.id)
}
